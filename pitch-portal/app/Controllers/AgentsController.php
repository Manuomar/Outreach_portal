<?php

namespace App\Controllers;

class AgentsController extends ApiController
{
    private function getBolnaConfig(?int $accountId = null): array
    {
        // ENV vars always win
        $envKey = env('bolna.apiKey', '');
        if ($envKey !== '') {
            return [
                'api_key'  => $envKey,
                'base_url' => rtrim(env('bolna.baseUrl', 'https://api.bolna.ai'), '/'),
            ];
        }
        // Delegate to BolnaAccountsController (accounts table → config.json fallback)
        return BolnaAccountsController::resolveConfig($accountId);
    }

    /**
     * Parse frontend model string (e.g. "gemini/gemini-2.0-flash") into
     * clean model name, correct Bolna provider, and family.
     *
     * Frontend sends:  provider_prefix/model_name  (e.g. "gemini/gemini-2.0-flash")
     * Bolna expects:   model = "gemini-2.0-flash", provider = "google", family = "google"
     */
    private function parseLlmModelProvider(string $rawModel, string $rawProvider): array
    {
        $model    = $rawModel;
        $provider = $rawProvider;

        // Strip provider prefix from model (e.g., "gemini/gemini-2.0-flash" → "gemini-2.0-flash")
        if (str_contains($model, '/')) {
            $parts    = explode('/', $model, 2);
            $provider = $parts[0]; // override provider from model prefix
            $model    = $parts[1]; // clean model name
        }

        // Map frontend provider names to Bolna API provider names
        $providerMap = [
            'gemini'    => 'google',
            'google'    => 'google',
            'openai'    => 'openai',
            'azure'     => 'openai', // migrate any legacy azure selection to openai
            'anthropic' => 'anthropic',
        ];

        $bolnaProvider = $providerMap[$provider] ?? $provider;

        // Clean model names based on Bolna provider
        if ($bolnaProvider === 'openai') {
            if (str_starts_with($model, 'openai/')) {
                $model = substr($model, 7);
            } elseif (str_starts_with($model, 'azure/')) {
                $model = substr($model, 6);
            }
            $model = trim($model);
            $model = preg_replace('/\s+cluster$/i', '', $model);
            if ($model === 'gpt-4.0-mini' || $model === 'gpt-4.1-mini' || $model === 'gpt-4.1') {
                $model = 'gpt-4o-mini';
            }
        } elseif ($bolnaProvider === 'google') {
            if (str_starts_with($model, 'google/') || str_starts_with($model, 'gemini/')) {
                $parts = explode('/', $model, 2);
                $model = $parts[1];
            }
            $model = trim($model);
        }

        return [
            'model'    => $model,
            'provider' => $bolnaProvider,
            'family'   => $bolnaProvider, // family should match provider for Bolna
        ];
    }

    /**
     * Try Bolna API with primary config, fallback to other active accounts on token/rate errors (429/402).
     * Returns ['code', 'body', 'decoded', 'account_id', 'api_key', 'base_url']
     */
    private function bolnaApiCallWithFallback(string $method, string $endpoint, ?array $payload, ?int $primaryAccountId = null): array
    {
        $db = $this->db();

        // Build ordered list: primary account first, then others
        $allAccounts = $db->table('pitch_bolna_accounts')
            ->where('is_active', 1)
            ->orderBy('is_default', 'DESC')
            ->get()->getResultArray();

        // Move primary to front
        $ordered = [];
        $rest = [];
        foreach ($allAccounts as $acct) {
            if ($primaryAccountId && (int)$acct['id'] === $primaryAccountId) {
                array_unshift($ordered, $acct);
            } elseif ((int)$acct['is_default'] === 1 && !$primaryAccountId) {
                array_unshift($ordered, $acct);
            } else {
                $rest[] = $acct;
            }
        }
        $ordered = array_merge($ordered, $rest);

        // ENV override: if BOLNA_API_KEY is set, prepend a virtual account
        $envKey = env('bolna.apiKey', '');
        if ($envKey !== '') {
            array_unshift($ordered, [
                'id'       => 0,
                'api_key'  => $envKey,
                'base_url' => rtrim(env('bolna.baseUrl', 'https://api.bolna.ai'), '/'),
                'label'    => 'ENV',
            ]);
        }

        foreach ($ordered as $acct) {
            $baseUrl = rtrim($acct['base_url'] ?: 'https://api.bolna.ai', '/');
            $ch = curl_init($baseUrl . $endpoint);
            $opts = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => [
                    'Authorization: Bearer ' . $acct['api_key'],
                    'Content-Type: application/json',
                ],
                CURLOPT_TIMEOUT        => 45,
                CURLOPT_SSL_VERIFYPEER => false,
            ];

            if ($method === 'POST') {
                $opts[CURLOPT_POST] = true;
                if ($payload) {
                    $jsonBody = json_encode($payload, JSON_UNESCAPED_UNICODE);
                    $opts[CURLOPT_POSTFIELDS] = $jsonBody;
                    log_message('info', "Bolna API POST {$endpoint} payload: " . mb_substr($jsonBody, 0, 2000));
                }
            } elseif ($method === 'PUT') {
                $opts[CURLOPT_CUSTOMREQUEST] = 'PUT';
                if ($payload) {
                    $jsonBody = json_encode($payload, JSON_UNESCAPED_UNICODE);
                    $opts[CURLOPT_POSTFIELDS] = $jsonBody;
                    log_message('info', "Bolna API PUT {$endpoint} payload: " . mb_substr($jsonBody, 0, 2000));
                }
            }
            // GET is default

            curl_setopt_array($ch, $opts);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            if ($curlErr) {
                log_message('warning', "Bolna account #{$acct['id']} ({$acct['label']}) curl error: {$curlErr}, trying next...");
                continue;
            }

            log_message('info', "Bolna API {$method} {$endpoint} => HTTP {$code}, response: " . mb_substr($body, 0, 500));

            // If rate-limited (429) or payment required (402), try next account
            if (in_array($code, [429, 402])) {
                log_message('warning', "Bolna account #{$acct['id']} ({$acct['label']}) returned HTTP {$code} (quota/rate limit), trying next account...");
                continue;
            }

            return [
                'code'       => $code,
                'body'       => $body,
                'decoded'    => json_decode($body, true),
                'account_id' => (int)($acct['id'] ?? 0),
                'api_key'    => $acct['api_key'],
                'base_url'   => $baseUrl,
            ];
        }

        return [
            'code'       => 503,
            'body'       => '{"error":"All Bolna accounts exhausted (rate-limited or unreachable)"}',
            'decoded'    => ['error' => 'All Bolna accounts exhausted (rate-limited or unreachable)'],
            'account_id' => 0,
            'api_key'    => '',
            'base_url'   => 'https://api.bolna.ai',
        ];
    }

    /**
     * Auto-heal agent on Bolna: ensures hangup_after_LLMCall is false and extraction_prompt is removed
     * so multi-turn calls do not disconnect prematurely.
     * Uses direct cURL instead of CI4 controller methods to work reliably from static context.
     */
    public static function patchBolnaHangupAfterLLMCall(string $bolnaAgentId, ?int $accountId = null): void
    {
        try {
            // Resolve Bolna API credentials directly (no $this->db() needed)
            $cfg = BolnaAccountsController::resolveConfig($accountId);
            $envKey = env('bolna.apiKey', '');
            if ($envKey !== '') {
                $cfg = [
                    'api_key'  => $envKey,
                    'base_url' => rtrim(env('bolna.baseUrl', 'https://api.bolna.ai'), '/'),
                ];
            }
            if (empty($cfg['api_key'])) {
                log_message('warning', "[patchBolnaHangupAfterLLMCall] No Bolna API key found, skipping patch for {$bolnaAgentId}");
                return;
            }

            $baseUrl = rtrim($cfg['base_url'] ?? 'https://api.bolna.ai', '/');
            $headers = [
                'Authorization: Bearer ' . $cfg['api_key'],
                'Content-Type: application/json',
            ];

            // Step 1: GET current agent config from Bolna
            $ch = curl_init($baseUrl . '/v2/agent/' . rawurlencode($bolnaAgentId));
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            if ($curlErr || $code !== 200) {
                log_message('warning', "[patchBolnaHangupAfterLLMCall] GET failed for {$bolnaAgentId}: HTTP {$code}, cURL: {$curlErr}");
                return;
            }

            $decoded = json_decode($body, true);
            if (!is_array($decoded)) {
                return;
            }

            $taskConfig = $decoded['tasks'][0]['task_config'] ?? null;
            $needsPatch = false;

            // Fix 1: Enable "Hangup using a prompt" (hangup_after_LLMCall = true, hangup_prompt & call_cancellation_prompt)
            $cancelPrompt = $taskConfig['call_cancellation_prompt']
                ?? $decoded['agent_prompts']['task_1']['call_cancellation_prompt']
                ?? $decoded['agent_prompts']['task_1']['hangup_prompt']
                ?? '';
            if (empty($cancelPrompt)) {
                $cancelPrompt = 'कॉल तभी काटना जब: 
1. मीटिंग बुक हो जाए (Step 5E पूरा होने के बाद)।
2. अधिकारी 3 बार साफ़ मना कर दे (या "दोबारा कॉल मत करना" कह दे)।
3. अनुचित या अभद्र भाषा का प्रयोग हो।
महत्वपूर्ण: शुरुआती बातचीत, अभिवादन, या ग्राहक के \'जी\', \'हाँ\', \'बोलिए\' कहने पर कॉल कभी मत काटना।';
            }

            if (empty($taskConfig['hangup_after_LLMCall']) || empty($taskConfig['call_cancellation_prompt'])) {
                log_message('info', "[patchBolnaHangupAfterLLMCall] Enabling hangup_after_LLMCall=true for prompt hangup on {$bolnaAgentId}");
                $taskConfig['hangup_after_LLMCall'] = true;
                $taskConfig['call_cancellation_prompt'] = $cancelPrompt;
                $needsPatch = true;
            }

            // Ensure agent_prompts.task_1 has both hangup_prompt and call_cancellation_prompt for Bolna UI
            $agentPrompts = $decoded['agent_prompts'] ?? [];
            $task1Prompts = $agentPrompts['task_1'] ?? [];
            if (empty($task1Prompts['hangup_prompt']) || empty($task1Prompts['call_cancellation_prompt'])) {
                $task1Prompts['hangup_prompt'] = $cancelPrompt;
                $task1Prompts['call_cancellation_prompt'] = $cancelPrompt;
                $agentPrompts['task_1'] = $task1Prompts;
                $needsPatch = true;
            }

            // Auto-heal invalid OpenAI model names
            $currentLlmModel = $decoded['tasks'][0]['tools_config']['llm_agent']['llm_config']['model'] ?? '';
            if (in_array($currentLlmModel, ['gpt-4.1-mini', 'gpt-4.0-mini', 'gpt-4.1'])) {
                log_message('info', "[patchBolnaHangupAfterLLMCall] Auto-patching invalid model {$currentLlmModel} to gpt-4o-mini for {$bolnaAgentId}");
                $decoded['tasks'][0]['tools_config']['llm_agent']['llm_config']['model'] = 'gpt-4o-mini';
                $needsPatch = true;
            }

            // Fix api_tools parameters properties if array instead of object
            if (!empty($decoded['tasks'][0]['tools_config']['api_tools']['tools'])) {
                foreach ($decoded['tasks'][0]['tools_config']['api_tools']['tools'] as &$tool) {
                    if (isset($tool['parameters']) && empty((array)($tool['parameters']['properties'] ?? []))) {
                        $tool['parameters']['properties'] = (object)[];
                        $needsPatch = true;
                    }
                }
                unset($tool);
            }

            // Fix 2: extraction_prompt in agent_prompts causes immediate call termination — remove it
            if (!empty($task1Prompts['extraction_prompt'])) {
                log_message('info', "[patchBolnaHangupAfterLLMCall] Removing extraction_prompt from agent_prompts for {$bolnaAgentId}");
                unset($task1Prompts['extraction_prompt']);
                $agentPrompts['task_1'] = $task1Prompts;
                $needsPatch = true;
            }

            if ($needsPatch) {
                $patch = [
                    'agent_config' => [
                        'agent_name'            => $decoded['agent_name'] ?? 'Agent',
                        'agent_welcome_message' => $decoded['agent_welcome_message'] ?? '',
                        'agent_type'            => $decoded['agent_type'] ?? 'other',
                        'single_prompt_ui'      => true,
                        'tasks'                 => [
                            [
                                'task_type'    => $decoded['tasks'][0]['task_type'] ?? 'conversation',
                                'toolchain'    => $decoded['tasks'][0]['toolchain'] ?? [],
                                'task_config'  => $taskConfig,
                                'tools_config' => $decoded['tasks'][0]['tools_config'] ?? [],
                            ],
                        ],
                    ],
                    'agent_prompts'    => $agentPrompts,
                    'single_prompt_ui' => true,
                ];

                // Step 2: PUT patched config back to Bolna
                $patchJson = json_encode($patch, JSON_UNESCAPED_UNICODE);
                $ch2 = curl_init($baseUrl . '/v2/agent/' . rawurlencode($bolnaAgentId));
                curl_setopt_array($ch2, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_CUSTOMREQUEST  => 'PUT',
                    CURLOPT_POSTFIELDS     => $patchJson,
                    CURLOPT_HTTPHEADER     => $headers,
                    CURLOPT_TIMEOUT        => 30,
                    CURLOPT_SSL_VERIFYPEER => false,
                ]);
                $putBody = curl_exec($ch2);
                $putCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
                $putErr  = curl_error($ch2);
                curl_close($ch2);

                log_message('info', "[patchBolnaHangupAfterLLMCall] PUT for {$bolnaAgentId} => HTTP {$putCode}" . ($putErr ? " cURL: {$putErr}" : ''));
            } else {
                log_message('info', "[patchBolnaHangupAfterLLMCall] Agent {$bolnaAgentId} already OK — no patch needed.");
            }
        } catch (\Throwable $e) {
            log_message('error', "[patchBolnaHangupAfterLLMCall] Error: " . $e->getMessage());
        }
    }

    /** Update an existing agent's prompt, KB and welcome message */
    public function update($id)
    {
        $this->guard();
        $db    = $this->db();
        $agent = $db->table('pitch_agents')->where('id', (int) $id)->where('is_active', 1)->get()->getRow();

        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Agent not found'], 404);
        }

        $this->ensureRagIdsColumn();
        $b            = $this->body();
        $updateFields = ['updated_at' => date('Y-m-d H:i:s')];

        if (isset($b['name']))            { $updateFields['name']            = trim($b['name']); }
        if (isset($b['welcome_message'])) { $updateFields['welcome_message'] = trim($b['welcome_message']); }
        if (isset($b['system_prompt']))   { 
            $cleanedPrompt = str_replace('آدرش بات چیت کا سٹیک ادھارن', 'आदर्श बातचीत का सटीक उदाहरण', $b['system_prompt']);
            $cleanedPrompt = preg_replace('/[\x{0600}-\x{06FF}]+/u', '', $cleanedPrompt);
            $updateFields['system_prompt']   = trim($cleanedPrompt); 
        }
        if (isset($b['knowledge_base']))  { $updateFields['knowledge_base']  = trim($b['knowledge_base']); }
        if (isset($b['call_end_prompt'])) { $updateFields['call_end_prompt'] = trim($b['call_end_prompt']) ?: null; }
        if (isset($b['llm_model']))       { $updateFields['llm_model']       = trim($b['llm_model']); }
        if (isset($b['llm_provider']))    { $updateFields['llm_provider']    = trim($b['llm_provider']); }
        if (isset($b['voice_id']))        { $updateFields['voice_id']        = trim($b['voice_id']); }
        if (isset($b['voice_name']))      { $updateFields['voice_name']      = trim($b['voice_name']); }
        if (isset($b['language']))        { $updateFields['language']        = trim($b['language']); }
        if (isset($b['bolna_account_id'])) { $updateFields['bolna_account_id'] = $b['bolna_account_id'] ? (int)$b['bolna_account_id'] : null; }
        if (isset($b['temperature']))     { $updateFields['temperature']     = is_numeric($b['temperature']) ? (float)$b['temperature'] : 0.2; }
        if (isset($b['max_tokens']))      { $updateFields['max_tokens']      = (int)$b['max_tokens'] > 0 ? (int)$b['max_tokens'] : 250; }
        if (array_key_exists('welcome_message_delay', $b)) {
            $updateFields['welcome_message_delay'] = max(0, (int)$b['welcome_message_delay']);
        }
        if (array_key_exists('from_phone_number', $b)) {
            $fromNumber = trim((string)$b['from_phone_number']);
            $updateFields['from_phone_number'] = $fromNumber !== '' ? $fromNumber : null;
        }
        if (isset($b['extraction_config'])) {
            $updateFields['extraction_config'] = is_string($b['extraction_config'])
                ? $b['extraction_config']
                : json_encode($b['extraction_config'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        }
        // rag_ids: JSON array of Bolna RAG Knowledge Base IDs
        if (array_key_exists('rag_ids', $b)) {
            $ragIds = is_array($b['rag_ids']) ? $b['rag_ids'] : [];
            $updateFields['rag_ids'] = !empty($ragIds) ? json_encode(array_values($ragIds)) : null;
        }
        // call_transfer_config: JSON object of Call Transfer settings (api_tools)
        if (array_key_exists('call_transfer_config', $b)) {
            $transCfg = $b['call_transfer_config'];
            if (!empty($transCfg) && (is_array($transCfg) || is_string($transCfg))) {
                $parsed = is_string($transCfg) ? json_decode($transCfg, true) : $transCfg;
                $num = trim($parsed['transfer_number'] ?? $parsed['phone_number'] ?? '');
                $updateFields['call_transfer_config'] = (is_array($parsed) && !empty($parsed['enabled']) && !empty($num))
                    ? json_encode($parsed, JSON_UNESCAPED_UNICODE)
                    : null;
            } else {
                $updateFields['call_transfer_config'] = null;
            }
        }

        $db->table('pitch_agents')->where('id', (int) $id)->update($updateFields);

        // Sync prompt + optional RAG attachment + call transfer + welcome message delay to Bolna
        if (isset($b['system_prompt']) || isset($b['knowledge_base']) || isset($b['call_end_prompt']) || isset($b['llm_model']) || isset($b['welcome_message']) || array_key_exists('welcome_message_delay', $b) || isset($b['extraction_config']) || array_key_exists('rag_ids', $b) || array_key_exists('call_transfer_config', $b) || isset($b['temperature']) || isset($b['max_tokens'])) {
            $bolnaCfg = $this->getBolnaConfig($agent->bolna_account_id ? (int)$agent->bolna_account_id : null);
            if (!empty($bolnaCfg['api_key']) && !empty($agent->bolna_agent_id)) {
                $prompt = $updateFields['system_prompt'] ?? $b['system_prompt'] ?? $agent->system_prompt;
                $prompt = str_replace('آدرش بات چیت کا سٹیک ادھارن', 'आदर्श बातचीत का सटीक उदाहरण', $prompt);
                $prompt = preg_replace('/[\x{0600}-\x{06FF}]+/u', '', $prompt);
                $kb     = $b['knowledge_base'] ?? $agent->knowledge_base;
                $ext    = $updateFields['extraction_config'] ?? $agent->extraction_config;
                $callEndPrompt = isset($b['call_end_prompt']) ? trim($b['call_end_prompt']) : (string)($agent->call_end_prompt ?? '');
                // Resolved rag_ids (new or existing)
                $resolvedRagIds = [];
                if (array_key_exists('rag_ids', $b)) {
                    $resolvedRagIds = is_array($b['rag_ids']) ? array_values($b['rag_ids']) : [];
                } elseif (!empty($agent->rag_ids)) {
                    $resolvedRagIds = json_decode($agent->rag_ids, true) ?: [];
                }

                $fullPrompt = trim($prompt);
                if (!empty(trim((string) $kb))) {
                    $fullPrompt .= "\n\n---\n\n# KNOWLEDGE BASE\n" . trim($kb);
                }

                $agentLang = !empty($agent->language) ? $agent->language : 'hi';

                // Fetch current full agent config from Bolna for full PUT
                $chGet = curl_init($bolnaCfg['base_url'] . '/agent/' . $agent->bolna_agent_id);
                curl_setopt_array($chGet, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $bolnaCfg['api_key']],
                    CURLOPT_TIMEOUT        => 15,
                    CURLOPT_SSL_VERIFYPEER => false,
                ]);
                $bolnaAgent = json_decode(curl_exec($chGet), true) ?: [];
                curl_close($chGet);

                $tasks = $bolnaAgent['tasks'] ?? [];
                // Strip null values recursively — Bolna V2 PUT rejects payloads with explicit nulls
                $tasks = json_decode(json_encode($tasks), true);
                $stripNulls = function ($arr) use (&$stripNulls) {
                    $out = [];
                    foreach ($arr as $k => $v) {
                        if ($v === null) continue;
                        $out[$k] = is_array($v) ? $stripNulls($v) : $v;
                    }
                    return $out;
                };
                $tasks = [$stripNulls($tasks[0] ?? [])];
                if (!empty($tasks[0])) {
                    // Update LLM model/provider if changed — parse prefixes and map provider names
                    $newModel    = $updateFields['llm_model']    ?? null;
                    $newProvider = $updateFields['llm_provider'] ?? null;
                    if ($newModel || $newProvider) {
                        $currentModel    = $tasks[0]['tools_config']['llm_agent']['llm_config']['model'] ?? 'gpt-4o-mini';
                        $currentProvider = $tasks[0]['tools_config']['llm_agent']['llm_config']['provider'] ?? 'openai';
                        $parsed = $this->parseLlmModelProvider(
                            $newModel    ?: $currentModel,
                            $newProvider ?: $currentProvider
                        );
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['model']    = $parsed['model'];
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['provider'] = $parsed['provider'];
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['family']   = $parsed['family'];
                        // Reasoning models require temperature = 1.0 on Bolna
                        $isReasoning = (bool) preg_match('/(gpt-5|o1|o3)/i', $parsed['model']);
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['temperature'] = $isReasoning ? 1.0 : 0.2;
                    }
                    // Update temperature & max_tokens if provided
                    if (isset($updateFields['temperature'])) {
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['temperature'] = (float)$updateFields['temperature'];
                    }
                    if (isset($updateFields['max_tokens'])) {
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['max_tokens'] = (int)$updateFields['max_tokens'];
                    }
                    // Ensure reasoning models always have temperature = 1.0 on Bolna
                    $checkMod = $tasks[0]['tools_config']['llm_agent']['llm_config']['model'] ?? '';
                    if (preg_match('/(gpt-5|o1|o3)/i', $checkMod)) {
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['temperature'] = 1.0;
                    }
                    // Update synthesizer voice if changed
                    if (!empty($updateFields['voice_id'])) {
                        $tasks[0]['tools_config']['synthesizer']['provider_config']['voice_id'] = $updateFields['voice_id'];
                    }
                    if (!empty($updateFields['voice_name'])) {
                        $tasks[0]['tools_config']['synthesizer']['provider_config']['voice'] = $updateFields['voice_name'];
                    }
                    // Update welcome message if changed
                    if (!empty($updateFields['welcome_message'])) {
                        $agentWelcome = $updateFields['welcome_message'];
                    }
                    // Ensure transcriber endpointing is 350ms so speech pauses don't cut off caller sentences prematurely
                    if (isset($tasks[0]['tools_config']['transcriber'])) {
                        $tasks[0]['tools_config']['transcriber']['endpointing'] = 350;
                    }
                    // Decide agent type and rag_config / vector_store injection
                    if (!empty($resolvedRagIds)) {
                        $tasks[0]['tools_config']['llm_agent']['agent_type'] = 'knowledgebase_agent';
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['rag_config'] = [
                            'vector_store' => [
                                'provider'        => 'LanceDB',
                                'provider_config' => [
                                    'vector_ids' => array_values($resolvedRagIds),
                                ],
                            ],
                        ];
                        unset($tasks[0]['tools_config']['llm_agent']['llm_config']['vector_store']);
                    } else {
                        $tasks[0]['tools_config']['llm_agent']['agent_type'] = 'simple_llm_agent';
                        unset($tasks[0]['tools_config']['llm_agent']['llm_config']['vector_store']);
                        $tasks[0]['tools_config']['llm_agent']['llm_config']['rag_config'] = null;
                    }

                    // Update api_tools (Call Transfer) on Bolna
                    if (array_key_exists('call_transfer_config', $b)) {
                        $apiTools = $this->buildApiToolsPayload($b['call_transfer_config']);
                        if ($apiTools !== null) {
                            $tasks[0]['tools_config']['api_tools'] = $apiTools;
                        } else {
                            unset($tasks[0]['tools_config']['api_tools']);
                        }
                    } elseif (!empty($agent->call_transfer_config)) {
                        $apiTools = $this->buildApiToolsPayload($agent->call_transfer_config);
                        if ($apiTools !== null) {
                            $tasks[0]['tools_config']['api_tools'] = $apiTools;
                        } else {
                            unset($tasks[0]['tools_config']['api_tools']);
                        }
                    } else {
                        unset($tasks[0]['tools_config']['api_tools']);
                    }

                    // Ensure api_tools properties is strictly an object for OpenAPI schema
                    if (!empty($tasks[0]['tools_config']['api_tools']['tools'])) {
                        foreach ($tasks[0]['tools_config']['api_tools']['tools'] as &$t) {
                            if (isset($t['parameters']) && empty((array)($t['parameters']['properties'] ?? []))) {
                                $t['parameters']['properties'] = (object)[];
                            }
                        }
                        unset($t);
                    }

                    $agentName    = !empty($updateFields['name']) ? $updateFields['name'] : ($bolnaAgent['agent_name'] ?? $agent->name);
                    $agentWelcome = !empty($updateFields['welcome_message']) ? $updateFields['welcome_message'] : ($bolnaAgent['agent_welcome_message'] ?? $agent->welcome_message);
                    $effectiveCallEnd = !empty($callEndPrompt) ? $callEndPrompt : 'Terminate the call ONLY IF: (1) The meeting has been confirmed and farewell message is complete, or (2) The user explicitly asks to hang up or refuses 3 times. NEVER hang up during initial greetings, introductions, or normal acknowledgments like "ji", "haan", "boliye".';

                    $putPayload = [
                        'agent_config'           => [
                            'agent_name'            => $agentName,
                            'agent_welcome_message' => $agentWelcome,
                            'agent_type'            => 'other',
                            'single_prompt_ui'      => true,
                            'tasks'                 => $tasks,
                        ],
                        'agent_prompts'           => [
                            'task_1' => [
                                'system_prompt'            => $fullPrompt,
                                'hangup_prompt'            => $effectiveCallEnd,
                                'call_cancellation_prompt' => $effectiveCallEnd,
                            ],
                        ],
                        // Bolna V2 PUT requires single_prompt_ui at TOP level (not just inside agent_config)
                        'single_prompt_ui'        => true,
                    ];
                    // Enable prompt-based hangup on Bolna: hangup_after_LLMCall = true
                    $putPayload['agent_config']['tasks'][0]['task_config']['hangup_after_LLMCall'] = true;
                    $putPayload['agent_config']['tasks'][0]['task_config']['call_cancellation_prompt'] = $effectiveCallEnd;
                    $welcomeDelayToUse = isset($updateFields['welcome_message_delay']) ? (int)$updateFields['welcome_message_delay'] : (int)($agent->welcome_message_delay ?? 0);
                    $putPayload['agent_config']['tasks'][0]['task_config']['welcome_message_delay'] = $welcomeDelayToUse;
                    // Use fallback-enabled API call for PUT update
                    $this->bolnaApiCallWithFallback('PUT', '/v2/agent/' . $agent->bolna_agent_id, $putPayload, $agent->bolna_account_id ? (int)$agent->bolna_account_id : null);
                } else {
                    // Fallback: simple PUT for prompt only
                    $patchPayload = [
                        'agent_prompts' => [
                            'task_1' => [
                                'system_prompt' => $fullPrompt,
                            ],
                        ],
                        'single_prompt_ui' => true,
                    ];
                    $this->bolnaApiCallWithFallback('PUT', '/v2/agent/' . $agent->bolna_agent_id, $patchPayload, $agent->bolna_account_id ? (int)$agent->bolna_account_id : null);
                }
            }
        }

        // Synchronize extraction fields to Bolna Extractions (dispositions API)
        if (isset($b['extraction_config']) && !empty($agent->bolna_agent_id)) {
            $extData = is_array($b['extraction_config']) ? $b['extraction_config'] : json_decode((string)$b['extraction_config'], true);
            if (is_array($extData)) {
                $bolnaCfg = $this->getBolnaConfig($agent->bolna_account_id ? (int)$agent->bolna_account_id : null);
                if (!empty($bolnaCfg['api_key'])) {
                    $updateCallEnd = $effectiveCallEnd ?? $agent->call_end_prompt ?? '';
                    $updatePrompts = [
                        'task_1' => [
                            'system_prompt'            => $fullPrompt ?? $agent->system_prompt,
                            'hangup_prompt'            => $updateCallEnd,
                            'call_cancellation_prompt' => $updateCallEnd,
                        ],
                    ];
                    $this->syncExtractionsToBolna($bolnaCfg, $agent->bolna_agent_id, $extData, $updatePrompts);
                }
            }
        }

        $this->audit('agent.update', 'agent', $id, array_keys($updateFields));

        return $this->respond(['success' => true, 'message' => 'Agent updated successfully.']);
    }

    /** List all active agents (includes account label) */
    public function index()
    {
        $this->guard();
        $db = $this->db();
        $query = "SELECT a.*,
            (SELECT COUNT(c.id) FROM pitch_calls c WHERE c.agent_id = a.id OR c.bolna_agent_id = a.bolna_agent_id) as total_calls,
            ba.label as account_label
            FROM pitch_agents a
            LEFT JOIN pitch_bolna_accounts ba ON ba.id = a.bolna_account_id
            WHERE a.is_active = 1
            ORDER BY a.is_default DESC, a.id DESC";
        $agents = $db->query($query)->getResultArray();

        return $this->respond(['success' => true, 'data' => $agents]);
    }

    /** View single agent details (active or inactive) */
    public function show($id)
    {
        $this->guard();
        $agent = $this->db()->table('pitch_agents')->where('id', (int) $id)->get()->getRowArray();
        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Agent not found'], 404);
        }

        return $this->respond(['success' => true, 'data' => $agent]);
    }

    /** Create a new Agent on Bolna and register in database */
    public function create()
    {
        $this->guard();
        $this->ensureRagIdsColumn();
        $b = $this->body();

        $name            = trim($b['name']            ?? '');
        $welcome         = trim($b['welcome_message'] ?? '');
        $prompt          = trim($b['system_prompt']   ?? '');
        $kb              = trim($b['knowledge_base']  ?? '');
        $voiceId         = trim($b['voice_id']        ?? 'iWNf11sz1GrUE4ppxTOL');
        $voiceName       = trim($b['voice_name']      ?? 'Viraj - Warm, Energetic and Lively');
        $language        = trim($b['language']        ?? 'hi');
        $llmModel        = trim($b['llm_model']       ?? 'gemini-3.7-flash');
        $llmProvider     = trim($b['llm_provider']    ?? 'google');
        $bolnaAccountId  = isset($b['bolna_account_id']) && $b['bolna_account_id'] ? (int)$b['bolna_account_id'] : null;
        $fromPhoneNumber = trim($b['from_phone_number'] ?? '');
        $callEndPrompt   = trim($b['call_end_prompt'] ?? '');
        $extractionConfig = $b['extraction_config'] ?? null;
        $extractionConfigJson = null;
        if ($extractionConfig !== null) {
            $extractionConfigJson = is_string($extractionConfig)
                ? $extractionConfig
                : json_encode($extractionConfig, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        }
        // rag_ids: JSON array of Bolna RAG Knowledge Base IDs to attach
        $ragIds = isset($b['rag_ids']) && is_array($b['rag_ids']) ? array_values($b['rag_ids']) : [];
        $ragIdsJson = !empty($ragIds) ? json_encode($ragIds) : null;

        // call_transfer_config: JSON object of Call Transfer settings (api_tools)
        $callTransferConfig = $b['call_transfer_config'] ?? null;
        $callTransferConfigJson = null;
        if (!empty($callTransferConfig)) {
            $parsedTrans = is_string($callTransferConfig) ? json_decode($callTransferConfig, true) : $callTransferConfig;
            $num = trim($parsedTrans['transfer_number'] ?? $parsedTrans['phone_number'] ?? '');
            if (is_array($parsedTrans) && !empty($parsedTrans['enabled']) && !empty($num)) {
                $callTransferConfigJson = json_encode($parsedTrans, JSON_UNESCAPED_UNICODE);
            }
        }

        if ($name === '') {
            return $this->respond(['success' => false, 'error' => 'Agent Name is required'], 422);
        }
        if ($welcome === '') {
            return $this->respond(['success' => false, 'error' => 'Agent Welcome Message is required'], 422);
        }
        if ($prompt === '') {
            return $this->respond(['success' => false, 'error' => 'System Prompt is required'], 422);
        }

        $bolnaCfg = $this->getBolnaConfig($bolnaAccountId);
        if (empty($bolnaCfg['api_key'])) {
            return $this->respond(['success' => false, 'error' => 'Bolna API key is not configured in backend'], 500);
        }

        // Assemble full system prompt with Knowledge Base
        $fullPrompt = $prompt;
        if ($kb !== '') {
            $fullPrompt .= "\n\n---\n\n# KNOWLEDGE BASE\n" . $kb;
        }

        // Determine agent type: knowledgebase_agent if RAG IDs provided, else simple_llm_agent
        $llmAgentType = !empty($ragIds) ? 'knowledgebase_agent' : 'simple_llm_agent';
        $maxTokens    = isset($b['max_tokens']) && (int)$b['max_tokens'] > 0 ? (int)$b['max_tokens'] : 250;
        $welcomeMessageDelay = isset($b['welcome_message_delay']) ? max(0, (int)$b['welcome_message_delay']) : 0;

        // Parse model/provider: strip prefix ("gemini/gemini-2.0-flash" → "gemini-2.0-flash")
        // and map provider names to Bolna API names ("gemini" → "google")
        $parsed = $this->parseLlmModelProvider($llmModel, $llmProvider);

        $isReasoningModel = (bool) preg_match('/(gpt-5|o1|o3)/i', $parsed['model']);
        $reqTemp          = isset($b['temperature']) && is_numeric($b['temperature']) ? (float)$b['temperature'] : 0.2;
        $temperature      = $isReasoningModel ? 1.0 : max(0.0, min(2.0, $reqTemp));

        $llmConfig = [
            'model'           => $parsed['model'],
            'provider'        => $parsed['provider'],
            'family'          => $parsed['family'],
            'temperature'     => $temperature,
            'max_tokens'      => $maxTokens,
            'top_p'           => 0.9,
            'agent_flow_type' => 'streaming',
        ];
        if (!empty($ragIds)) {
            $llmConfig['rag_config'] = [
                'vector_store' => [
                    'provider'        => 'LanceDB',
                    'provider_config' => [
                        'vector_ids' => array_values($ragIds),
                    ],
                ],
            ];
        }

        // Bolna Agent Request Payload (V2 API)
        $agentConfig = [
            'agent_name' => $name,
            'agent_welcome_message' => $welcome,
            'agent_type' => 'other',
            'single_prompt_ui' => true,
            'tasks' => [
                [
                    'task_type' => 'conversation',
                    'toolchain' => [
                        'execution' => 'parallel',
                        'pipelines' => [
                            ['transcriber', 'llm', 'synthesizer'],
                        ],
                    ],
                    'task_config' => [
                        'voicemail' => false,
                        'use_fillers' => false,
                        'dtmf_enabled' => false,
                        'ambient_noise' => false,
                        'inbound_limit' => -1,
                        'backchanneling' => false,
                        'call_terminate' => 300,
                        'optimize_latency' => true,
                        'incremental_delay' => 300,
                        'check_if_user_online' => true,
                        'hangup_after_silence' => 40,
                        'hangup_after_LLMCall' => true,
                        'call_cancellation_prompt' => $callEndPrompt !== '' ? $callEndPrompt : 'Terminate the call ONLY IF: (1) The meeting has been confirmed and farewell message is complete, or (2) The user explicitly asks to hang up or refuses 3 times. NEVER hang up during initial greetings, introductions, or normal acknowledgments like "ji", "haan", "boliye".',
                        'welcome_message_delay' => $welcomeMessageDelay,
                        'check_user_online_message' => [
                            'en' => 'Hello, are you still on the line?',
                            'hi' => 'Hello, क्या आप अभी भी लाइन पर हैं?',
                        ],
                        'number_of_words_for_interruption' => 1,
                        'trigger_user_online_message_after' => 15,
                    ],
                    'tools_config' => [
                        'input' => [
                            'format' => 'wav',
                            'provider' => 'vobiz',
                        ],
                        'output' => [
                            'format' => 'wav',
                            'provider' => 'vobiz',
                        ],
                        'llm_agent' => [
                            'agent_type'      => $llmAgentType,
                            'agent_flow_type' => 'streaming',
                            'llm_config'      => $llmConfig,
                        ],
                        'synthesizer' => [
                            'provider' => 'elevenlabs',
                            'stream' => true,
                            'caching' => false,
                            'buffer_size' => 220,
                            'audio_format' => 'wav',
                            'provider_config' => [
                                'model' => 'eleven_turbo_v2_5',
                                'voice' => $voiceName,
                                'voice_id' => $voiceId,
                                'speed' => 1.0,
                                'temperature' => 0.5,
                                'similarity_boost' => 0.6,
                            ],
                        ],
                        'transcriber' => [
                            'provider' => 'deepgram',
                            'model' => 'nova-3',
                            'language' => $language,
                            'stream' => true,
                            'encoding' => 'linear16',
                            'sampling_rate' => 16000,
                            'endpointing' => 350,
                            'vad_threshold' => 0.5,
                        ],
                    ],
                ],
            ],
        ];

        // Attach Call Transfer (api_tools) if configured
        $apiToolsPayload = $this->buildApiToolsPayload($callTransferConfigJson);
        if ($apiToolsPayload !== null) {
            $agentConfig['tasks'][0]['tools_config']['api_tools'] = $apiToolsPayload;
        }

        $effectiveCallEnd = $callEndPrompt !== '' ? $callEndPrompt : 'Terminate the call ONLY IF: (1) The meeting has been confirmed and farewell message is complete, or (2) The user explicitly asks to hang up or refuses 3 times. NEVER hang up during initial greetings, introductions, or normal acknowledgments like "ji", "haan", "boliye".';
        $bolnaPayload = [
            'agent_config' => $agentConfig,
            'agent_prompts' => [
                'task_1' => [
                    'system_prompt'            => $fullPrompt,
                    'hangup_prompt'            => $effectiveCallEnd,
                    'call_cancellation_prompt' => $effectiveCallEnd,
                ],
            ],
            // Bolna V2 requires single_prompt_ui at TOP level for Canvas to show prompts
            'single_prompt_ui' => true,
        ];

        log_message('info', "CREATE agent: fullPrompt=" . mb_substr($fullPrompt, 0, 200) . " | callEndPrompt=" . mb_substr($callEndPrompt, 0, 100) . " | ragIds=" . json_encode($ragIds));

        // Call Bolna API V2 — with auto-fallback to other accounts on 429/402
        $apiResult = $this->bolnaApiCallWithFallback('POST', '/v2/agent', $bolnaPayload, $bolnaAccountId);
        $httpCode     = $apiResult['code'];
        $responseBody = $apiResult['body'];
        $decoded      = $apiResult['decoded'];

        // If fallback resolved to a different account, update bolnaAccountId
        if ($apiResult['account_id'] > 0 && $apiResult['account_id'] !== $bolnaAccountId) {
            $bolnaAccountId = $apiResult['account_id'];
            log_message('info', "Agent created using fallback Bolna account #{$bolnaAccountId}");
        }

        $bolnaAgentId = $decoded['id'] ?? $decoded['agent_id'] ?? null;

        if ($httpCode >= 400 || empty($bolnaAgentId)) {
            $msg = '';
            if (is_array($decoded)) {
                $rawMsg = $decoded['message'] ?? $decoded['detail'] ?? $decoded;
                $msg = is_array($rawMsg) ? json_encode($rawMsg, JSON_UNESCAPED_UNICODE) : (string) $rawMsg;
            } else {
                $msg = (string) $responseBody;
            }
            return $this->respond(['success' => false, 'error' => 'Bolna API Error (' . $httpCode . '): ' . $msg], 502);
        }

        // Insert into database
        $db = $this->db();
        $agentRecord = [
            'name'              => $name,
            'bolna_agent_id'    => $bolnaAgentId,
            'bolna_account_id'  => $bolnaAccountId,
            'from_phone_number' => $fromPhoneNumber !== '' ? $fromPhoneNumber : null,
            'welcome_message'   => $welcome,
            'system_prompt'     => $prompt,
            'call_end_prompt'   => $callEndPrompt !== '' ? $callEndPrompt : null,
            'knowledge_base'    => $kb !== '' ? $kb : null,
            'rag_ids'           => $ragIdsJson,
            'extraction_config' => $extractionConfigJson,
            'call_transfer_config' => $callTransferConfigJson,
            'language'          => $language,
            'voice_provider'    => 'elevenlabs',
            'voice_name'        => $voiceName,
            'voice_id'          => $voiceId,
            'llm_provider'      => $llmProvider,
            'llm_model'         => $llmModel,
            'temperature'       => $temperature,
            'max_tokens'        => $maxTokens,
            'is_default'        => 0,
            'is_active'         => 1,
            'created_at'        => date('Y-m-d H:i:s'),
            'updated_at'        => date('Y-m-d H:i:s'),
        ];
        $db->table('pitch_agents')->insert($agentRecord);
        $newAgentId = $db->insertID();

        // Automatically sync extraction fields into Bolna Extractions (dispositions API)
        if ($extractionConfigJson) {
            $parsedExtraction = is_array($extractionConfig) ? $extractionConfig : json_decode($extractionConfigJson, true);
            if (is_array($parsedExtraction)) {
                $createdPrompts = [
                    'task_1' => [
                        'system_prompt'            => $fullPrompt,
                        'hangup_prompt'            => $effectiveCallEnd,
                        'call_cancellation_prompt' => $effectiveCallEnd,
                    ],
                ];
                $this->syncExtractionsToBolna($bolnaCfg, $bolnaAgentId, $parsedExtraction, $createdPrompts);
            }
        }

        $this->audit('agent.create', 'agent', $newAgentId, [
            'name'           => $name,
            'bolna_agent_id' => $bolnaAgentId,
        ]);

        return $this->respond([
            'success'        => true,
            'id'             => $newAgentId,
            'bolna_agent_id' => $bolnaAgentId,
            'message'        => 'Agent created successfully and synced with Bolna AI.',
        ], 201);
    }

    /** Set an agent as portal default */
    public function setDefault($id)
    {
        $this->guard();
        $db = $this->db();
        $agent = $db->table('pitch_agents')->where('id', (int) $id)->where('is_active', 1)->get()->getRow();
        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Agent not found'], 404);
        }

        // Reset all defaults, set this one
        $db->table('pitch_agents')->where('is_default', 1)->update(['is_default' => 0]);
        $db->table('pitch_agents')->where('id', (int) $id)->update(['is_default' => 1]);

        // Update config.json default agent if possible
        $cfgFile = rtrim(ROOTPATH, '/\\') . DIRECTORY_SEPARATOR . 'ai_pipeline' . DIRECTORY_SEPARATOR . 'config.json';
        if (file_exists($cfgFile) && is_writable($cfgFile)) {
            $json = json_decode(file_get_contents($cfgFile), true);
            if (isset($json['bolna'])) {
                $json['bolna']['agent_id'] = $agent->bolna_agent_id;
                file_put_contents($cfgFile, json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            }
        }

        $this->audit('agent.set_default', 'agent', $id, ['bolna_agent_id' => $agent->bolna_agent_id]);

        return $this->respond(['success' => true, 'message' => 'Agent set as default successfully']);
    }

    /** Soft-delete / deactivate an agent */
    /** List all inactive (disabled) agents */
    public function inactive()
    {
        $this->guard();
        $db = $this->db();
        $query = "SELECT a.*,
            (SELECT COUNT(c.id) FROM pitch_calls c WHERE c.agent_id = a.id OR c.bolna_agent_id = a.bolna_agent_id) as total_calls,
            ba.label as account_label
            FROM pitch_agents a
            LEFT JOIN pitch_bolna_accounts ba ON ba.id = a.bolna_account_id
            WHERE a.is_active = 0
            ORDER BY a.id DESC";
        $agents = $db->query($query)->getResultArray();
        return $this->respond(['success' => true, 'data' => $agents]);
    }

    /** Re-enable a previously disabled agent */
    public function enable($id)
    {
        $this->guard();
        $db = $this->db();
        $agent = $db->table('pitch_agents')->where('id', (int) $id)->where('is_active', 0)->get()->getRow();
        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Inactive agent not found'], 404);
        }
        $db->table('pitch_agents')->where('id', (int) $id)->update(['is_active' => 1]);
        $this->audit('agent.enable', 'agent', $id, ['bolna_agent_id' => $agent->bolna_agent_id]);
        return $this->respond(['success' => true, 'message' => 'Agent enabled successfully']);
    }

    public function delete($id)
    {
        $this->guard();
        $db = $this->db();
        $agent = $db->table('pitch_agents')->where('id', (int) $id)->get()->getRow();
        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Agent not found'], 404);
        }
        if ($agent->is_default) {
            return $this->respond(['success' => false, 'error' => 'Cannot disable the default agent. Please set another agent as default first.'], 400);
        }

        $db->table('pitch_agents')->where('id', (int) $id)->update(['is_active' => 0]);
        $this->audit('agent.disable', 'agent', $id, ['bolna_agent_id' => $agent->bolna_agent_id]);

        return $this->respond(['success' => true, 'message' => 'Agent disabled successfully']);
    }

    /**
     * Permanently delete an agent from both the local DB and Bolna.
     * POST /agents/{id}/permanent-delete
     */
    public function permanentDelete($id)
    {
        $this->guard();
        $db = $this->db();
        $agent = $db->table('pitch_agents')->where('id', (int) $id)->get()->getRow();
        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Agent not found'], 404);
        }
        if ($agent->is_default) {
            return $this->respond(['success' => false, 'error' => 'Cannot delete the default agent. Set another agent as default first.'], 400);
        }

        // Try to delete from Bolna API (best-effort)
        $bolnaDeleted = false;
        if (!empty($agent->bolna_agent_id)) {
            try {
                $accountId = $agent->bolna_account_id ?: null;
                $cfg = \App\Controllers\BolnaAccountsController::resolveConfig($accountId);
                if ($cfg && !empty($cfg['api_key'])) {
                    $ch = curl_init($cfg['base_url'] . '/agent/' . $agent->bolna_agent_id);
                    curl_setopt_array($ch, [
                        CURLOPT_CUSTOMREQUEST  => 'DELETE',
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT        => 15,
                        CURLOPT_HTTPHEADER     => [
                            'Authorization: Bearer ' . $cfg['api_key'],
                            'Content-Type: application/json',
                        ],
                    ]);
                    $resp = curl_exec($ch);
                    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    curl_close($ch);
                    $bolnaDeleted = ($httpCode >= 200 && $httpCode < 300);
                    log_message('info', "Bolna agent delete: {$agent->bolna_agent_id} => HTTP {$httpCode}");
                }
            } catch (\Throwable $e) {
                log_message('error', 'Bolna agent delete failed: ' . $e->getMessage());
            }
        }

        // Delete from local DB permanently
        $db->table('pitch_agents')->where('id', (int) $id)->delete();
        $this->audit('agent.permanent_delete', 'agent', $id, [
            'bolna_agent_id' => $agent->bolna_agent_id,
            'bolna_deleted'  => $bolnaDeleted,
        ]);

        return $this->respond([
            'success' => true,
            'message' => 'Agent permanently deleted.',
            'bolna_deleted' => $bolnaDeleted,
        ]);
    }

    /** Sync an existing agent's extraction configuration to Bolna dispositions API */
    public function syncExtractions($id)
    {
        $this->guard();
        $db = $this->db();
        $agent = $db->table('pitch_agents')->where('id', (int) $id)->where('is_active', 1)->get()->getRow();
        if (!$agent) {
            return $this->respond(['success' => false, 'error' => 'Agent not found'], 404);
        }
        if (empty($agent->bolna_agent_id)) {
            return $this->respond(['success' => false, 'error' => 'Agent does not have a Bolna Agent ID'], 400);
        }

        $bolnaCfg = $this->getBolnaConfig($agent->bolna_account_id ? (int)$agent->bolna_account_id : null);
        if (empty($bolnaCfg['api_key'])) {
            return $this->respond(['success' => false, 'error' => 'Bolna API key is not configured'], 500);
        }

        $extConfig = $agent->extraction_config ? json_decode($agent->extraction_config, true) : null;
        if (!is_array($extConfig)) {
            return $this->respond(['success' => false, 'error' => 'No extraction configuration found for this agent'], 400);
        }

        $fullPrompt = trim($agent->system_prompt ?? '');
        if (!empty(trim((string)($agent->knowledge_base ?? '')))) {
            $fullPrompt .= "\n\n---\n\n# KNOWLEDGE BASE\n" . trim($agent->knowledge_base);
        }
        $existingPrompts = [
            'task_1' => [
                'system_prompt' => $fullPrompt,
            ],
        ];
        $res = $this->syncExtractionsToBolna($bolnaCfg, $agent->bolna_agent_id, $extConfig, $existingPrompts);

        return $this->respond([
            'success' => true,
            'message' => 'Successfully synchronized ' . ($res['synced_count'] ?? 0) . ' extraction fields to Bolna portal.',
            'details' => $res,
        ]);
    }

    /**
     * Synchronize extraction fields into Bolna Extractions (dispositions API)
     */
    private function syncExtractionsToBolna(array $bolnaCfg, string $bolnaAgentId, array $extractionFields, ?array $agentPrompts = null): array
    {
        $baseUrl = rtrim($bolnaCfg['base_url'], '/');
        $apiKey  = $bolnaCfg['api_key'];
        $headers = [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ];

        // 1. Fetch existing dispositions for this agent from Bolna
        $ch = curl_init($baseUrl . '/dispositions/?agent_id=' . urlencode($bolnaAgentId));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $dispRes  = curl_exec($ch);
        curl_close($ch);
        $dispData = json_decode($dispRes, true);

        $existing = [];
        if (isset($dispData['agent_dispositions']) && is_array($dispData['agent_dispositions'])) {
            foreach ($dispData['agent_dispositions'] as $d) {
                if (!empty($d['name']) && !empty($d['id'])) {
                    $existing[$d['name']] = $d['id'];
                }
            }
        }

        $dispositionIds = [];
        $summaryEnabled = false;
        $obsoleteKeys = ['student_volume', 'college_count', 'current_verification_method'];

        foreach ($extractionFields as $f) {
            $key = $f['key'] ?? '';
            if (in_array($key, $obsoleteKeys, true)) {
                continue;
            }
            if (empty($f['enabled'])) {
                continue;
            }
            $label = $f['label'] ?? $key;
            $desc  = $f['description'] ?? '';

            if ($key === 'summary' || $key === 'call_summary') {
                $summaryEnabled = true;
            }

            // If already created on Bolna for this agent, reuse existing disposition ID
            if (isset($existing[$label])) {
                $dispositionIds[] = $existing[$label];
                continue;
            }

            // Build disposition payload
            $dispPayload = [
                'agent_id' => $bolnaAgentId,
                'name'     => $label,
                'category' => ($f['table'] ?? '') === 'pitch_calls' ? 'Lead Qualification' : 'Custom Survey',
            ];

            if ($key === 'summary' || $key === 'call_summary') {
                $dispPayload['question'] = "Provide a concise 2-3 sentence executive summary of the entire call in English/Hinglish, capturing agreements, tone, key discussion points, and next steps.";
                $dispPayload['is_subjective'] = true;
                $dispPayload['is_objective'] = false;
                $dispPayload['subjective_type'] = 'text';
            } elseif ($key === 'interest_status' || $key === 'interest_level') {
                $dispPayload['question'] = "What is the prospect's interest level? Classify as interested, maybe, callback_requested, or not_interested.";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'interested', 'condition' => 'Prospect expressed interest or agreed to meeting'],
                    ['value' => 'maybe', 'condition' => 'Prospect is undecided, needs review or asked for proposal'],
                    ['value' => 'callback_requested', 'condition' => 'Prospect asked to call back later'],
                    ['value' => 'not_interested', 'condition' => 'Prospect declined or said not interested'],
                ];
            } elseif ($key === 'it_head_call_agreed' || $key === 'meeting_agreed') {
                $dispPayload['question'] = "Did the prospect agree to a 10-15 minute online meeting with the senior team / IT Head?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Yes', 'condition' => 'Prospect agreed to schedule a meeting or call'],
                    ['value' => 'No', 'condition' => 'Prospect declined the meeting'],
                    ['value' => 'Not discussed', 'condition' => 'Meeting was not discussed or call ended early'],
                ];
            } elseif ($key === 'call_transferred') {
                $dispPayload['question'] = "Was the call transferred or redirected to a senior officer/team during the call?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Yes', 'condition' => 'Call was transferred to senior officer'],
                    ['value' => 'No', 'condition' => 'Call was not transferred'],
                ];
            } elseif ($key === 'who_answered') {
                $dispPayload['question'] = "Who answered the phone call?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Target Official', 'condition' => 'Answered by the target official or decision maker'],
                    ['value' => 'Gatekeeper / PA', 'condition' => 'Answered by PA, assistant, or office receptionist'],
                    ['value' => 'Colleague / Staff', 'condition' => 'Answered by office staff or colleague'],
                    ['value' => 'Relative / Other', 'condition' => 'Answered by family member, friend, or relative'],
                    ['value' => 'Wrong Person', 'condition' => 'Answered by wrong number or wrong person'],
                ];
            } elseif ($key === 'callback_requested') {
                $dispPayload['question'] = "Did the prospect ask to be called back at a later time or date?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Yes', 'condition' => 'Prospect asked to call back later'],
                    ['value' => 'No', 'condition' => 'Prospect did not ask to call back later'],
                ];
            } elseif ($key === 'callback_time') {
                $dispPayload['question'] = "What preferred day, date, or time did the prospect specify for the callback?";
                $dispPayload['is_subjective'] = true;
                $dispPayload['is_objective'] = false;
                $dispPayload['subjective_type'] = 'text';
            } elseif ($key === 'is_wrong_number') {
                $dispPayload['question'] = "Did the person who answered state that this is a wrong number, wrong person, or they do not know the intended contact?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Yes', 'condition' => 'Recipient stated wrong number or wrong person'],
                    ['value' => 'No', 'condition' => 'Correct person or target organization reached'],
                ];
            } elseif ($key === 'not_interested_reason') {
                $dispPayload['question'] = "What specific reason did the prospect give for declining or not being interested (e.g. already has solution, budget constraint, not relevant)?";
                $dispPayload['is_subjective'] = true;
                $dispPayload['is_objective'] = false;
                $dispPayload['subjective_type'] = 'text';
            } elseif ($key === 'fraud_suspicion') {
                $dispPayload['question'] = "Did the caller express suspicion that the call was fake, fraud, scam, spam, or demand proof/authenticity?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Yes', 'condition' => 'Prospect suspected fraud, fake call, scam, or questioned legitimacy'],
                    ['value' => 'No', 'condition' => 'No suspicion or skepticism expressed'],
                ];
            } elseif ($key === 'trust_sentiment') {
                $dispPayload['question'] = "How did the prospect perceive the legitimacy and credibility of the call?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'High Trust', 'condition' => 'Prospect was cooperative and fully trusted the call'],
                    ['value' => 'Neutral', 'condition' => 'Standard business conversation with normal queries'],
                    ['value' => 'Skeptical', 'condition' => 'Prospect asked verifying questions about company, identity, or mandate'],
                    ['value' => 'Suspected Fraud', 'condition' => 'Prospect accused or suspected fake/fraud call'],
                ];
            } elseif ($key === 'dialect_detected') {
                $dispPayload['question'] = "What primary language or regional dialect did the prospect speak?";
                $dispPayload['is_subjective'] = false;
                $dispPayload['is_objective'] = true;
                $dispPayload['objective_options'] = [
                    ['value' => 'Standard Hindi', 'condition' => 'Spoke standard Hindi'],
                    ['value' => 'Awadhi', 'condition' => 'Spoke Awadhi dialect'],
                    ['value' => 'Bhojpuri', 'condition' => 'Spoke Bhojpuri dialect'],
                    ['value' => 'Bundeli', 'condition' => 'Spoke Bundelkhandi dialect'],
                    ['value' => 'English', 'condition' => 'Spoke English or Hinglish'],
                    ['value' => 'Other', 'condition' => 'Spoke another regional dialect or language'],
                ];
            } else {
                // Subjective free-text extraction
                $dispPayload['question'] = !empty($desc) ? $desc : "Extract the details for {$label} mentioned in the conversation.";
                $dispPayload['is_subjective'] = true;
                $dispPayload['is_objective'] = false;
                $dispPayload['subjective_type'] = 'text';
            }

            // POST /dispositions/
            $ch2 = curl_init($baseUrl . '/dispositions/');
            curl_setopt_array($ch2, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode($dispPayload, JSON_UNESCAPED_UNICODE),
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            $postRes  = curl_exec($ch2);
            $postCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
            curl_close($ch2);

            $created = json_decode($postRes, true);
            if ($postCode < 300 && !empty($created['id'])) {
                $dispositionIds[] = $created['id'];
                $existing[$label] = $created['id'];
            }
        }

        // 3. Update agent on Bolna to link disposition IDs and set call_summary_enabled
        $ch3 = curl_init($baseUrl . '/agent/' . urlencode($bolnaAgentId));
        curl_setopt_array($ch3, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $agentData = json_decode(curl_exec($ch3), true);
        curl_close($ch3);

        $existingDisps = $agentData['dispositions'] ?? [];
        $allDisps = array_values(array_unique(array_merge($existingDisps, $dispositionIds)));

        // Strip nulls recursively — Bolna V2 rejects null values
        $stripNulls = function ($arr) use (&$stripNulls) {
            $out = [];
            foreach ($arr as $k => $v) {
                if ($v === null) continue;
                $out[$k] = is_array($v) ? $stripNulls($v) : $v;
            }
            return $out;
        };
        $cleanTasks = !empty($agentData['tasks']) ? array_map($stripNulls, $agentData['tasks']) : [];

        // Determine cancellation prompt
        $effectiveCancelPrompt = $agentPrompts['task_1']['call_cancellation_prompt']
            ?? $agentPrompts['task_1']['hangup_prompt']
            ?? $agentData['agent_prompts']['task_1']['call_cancellation_prompt']
            ?? $agentData['agent_prompts']['task_1']['hangup_prompt']
            ?? $agentData['tasks'][0]['task_config']['call_cancellation_prompt']
            ?? '';

        if (empty($effectiveCancelPrompt)) {
            $effectiveCancelPrompt = 'कॉल तभी काटना जब: 
1. मीटिंग बुक हो जाए (Step 5E पूरा होने के बाद)।
2. अधिकारी 3 बार साफ़ मना कर दे (या "दोबारा कॉल मत करना" कह दे)।
3. अनुचित या अभद्र भाषा का प्रयोग हो।
महत्वपूर्ण: शुरुआती बातचीत, अभिवादन, या ग्राहक के \'जी\', \'हाँ\', \'बोलिए\' कहने पर कॉल कभी मत काटना।';
        }

        // Enable "Hangup using a prompt" on Bolna
        if (!empty($cleanTasks[0]['task_config'])) {
            $cleanTasks[0]['task_config']['hangup_after_LLMCall'] = true;
            $cleanTasks[0]['task_config']['call_cancellation_prompt'] = $effectiveCancelPrompt;
        }

        // Determine prompts to preserve — NEVER let this PUT call overwrite system_prompt with empty, and ALWAYS preserve hangup prompts
        $promptsToUse = $agentPrompts ?: ($agentData['agent_prompts'] ?? []);
        if (empty($promptsToUse['task_1']['system_prompt']) && !empty($agentData['agent_prompts']['task_1']['system_prompt'])) {
            $promptsToUse['task_1']['system_prompt'] = $agentData['agent_prompts']['task_1']['system_prompt'];
        }
        $promptsToUse['task_1']['hangup_prompt'] = $effectiveCancelPrompt;
        $promptsToUse['task_1']['call_cancellation_prompt'] = $effectiveCancelPrompt;

        $patchPayload = [
            'agent_config' => [
                'agent_name'            => $agentData['agent_name'] ?? 'Agent',
                'agent_welcome_message' => $agentData['agent_welcome_message'] ?? '',
                'agent_type'            => $agentData['agent_type'] ?? 'other',
                'single_prompt_ui'      => true,
                'call_summary_enabled'  => $summaryEnabled,
                'tasks'                 => $cleanTasks,
            ],
            'agent_prompts'    => $promptsToUse,
            'single_prompt_ui' => true,
            'dispositions'     => $allDisps,
        ];

        $ch4 = curl_init($baseUrl . '/v2/agent/' . urlencode($bolnaAgentId));
        curl_setopt_array($ch4, [
            CURLOPT_CUSTOMREQUEST  => 'PUT',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POSTFIELDS     => json_encode($patchPayload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $putRes  = curl_exec($ch4);
        $putCode = curl_getinfo($ch4, CURLINFO_HTTP_CODE);
        curl_close($ch4);

        return [
            'synced_count'    => count($allDisps),
            'summary_enabled' => $summaryEnabled,
            'http_code'       => $putCode,
        ];
    }

    /** List all Knowledge Bases from Bolna (GET /knowledgebase/all) */
    public function listKnowledgebases()
    {
        $this->guard();
        $acctId   = $this->request->getGet('bolna_account_id');
        $bolnaCfg = $this->getBolnaConfig($acctId ? (int) $acctId : null);
        if (empty($bolnaCfg['api_key'])) {
            return $this->respond(['success' => false, 'error' => 'Bolna API key not configured'], 500);
        }

        $ch = curl_init(rtrim($bolnaCfg['base_url'], '/') . '/knowledgebase/all');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $bolnaCfg['api_key'],
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $data = json_decode($res, true) ?: [];
        return $this->respond(['success' => true, 'data' => $data]);
    }

    /** Upload a PDF to Bolna Knowledge Base (POST /knowledgebase) */
    public function uploadKnowledgebase()
    {
        $this->guard();
        $file = $this->request->getFile('file');
        if (!$file || !$file->isValid()) {
            return $this->respond(['success' => false, 'error' => 'Valid PDF file is required'], 422);
        }

        $ext = strtolower($file->getClientExtension());
        if ($ext !== 'pdf') {
            return $this->respond(['success' => false, 'error' => 'Only PDF files are allowed by Bolna Knowledge Base API'], 422);
        }

        $acctId   = $this->request->getGet('bolna_account_id');
        $bolnaCfg = $this->getBolnaConfig($acctId ? (int) $acctId : null);
        if (empty($bolnaCfg['api_key'])) {
            return $this->respond(['success' => false, 'error' => 'Bolna API key not configured'], 500);
        }

        $tempPath = $file->getTempName();
        $origName = $file->getClientName();
        $lang     = $this->request->getPost('language') ?: 'multilingual';

        $cfile    = new \CURLFile($tempPath, 'application/pdf', $origName);
        $postData = [
            'file'     => $cfile,
            'language' => $lang,
        ];

        $ch = curl_init(rtrim($bolnaCfg['base_url'], '/') . '/knowledgebase');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $postData,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $bolnaCfg['api_key'],
            ],
            CURLOPT_TIMEOUT        => 45,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decoded = json_decode($res, true);
        if ($code >= 400 || empty($decoded['rag_id'])) {
            $msg = is_array($decoded) ? ($decoded['message'] ?? $decoded['detail'] ?? json_encode($decoded)) : $res;
            return $this->respond(['success' => false, 'error' => 'Bolna KB Error (' . $code . '): ' . $msg], 502);
        }

        return $this->respond([
            'success'   => true,
            'rag_id'    => $decoded['rag_id'],
            'file_name' => $decoded['file_name'] ?? $origName,
            'status'    => $decoded['status'] ?? 'processing',
            'message'   => "PDF successfully uploaded to Bolna Knowledge Base. RAG ID: {$decoded['rag_id']}",
        ]);
    }

    /**
     * Ensure rag_ids column exists in pitch_agents table
     */
    /**
     * Import an existing Bolna agent (by bolna_agent_id) into the portal.
     * POST /agents/import
     * Body: { bolna_agent_id, bolna_account_id }
     */
    public function importFromBolna()
    {
        $this->guard();
        $b              = $this->body();
        $bolnaAgentId   = trim($b['bolna_agent_id'] ?? '');
        $bolnaAccountId = isset($b['bolna_account_id']) && $b['bolna_account_id'] ? (int)$b['bolna_account_id'] : null;

        if ($bolnaAgentId === '') {
            return $this->respond(['success' => false, 'error' => 'bolna_agent_id is required'], 422);
        }

        // Resolve Bolna API config
        $bolnaCfg = $this->getBolnaConfig($bolnaAccountId);
        if (empty($bolnaCfg['api_key'])) {
            return $this->respond(['success' => false, 'error' => 'Bolna API key is not configured for selected account'], 500);
        }

        // Check if agent already imported
        $db = $this->db();
        $this->ensureRagIdsColumn();
        $existing = $db->table('pitch_agents')->where('bolna_agent_id', $bolnaAgentId)->where('is_active', 1)->get()->getRow();
        if ($existing) {
            return $this->respond([
                'success' => false,
                'error'   => "Agent '{$existing->name}' (ID #{$existing->id}) is already in your portal.",
            ], 409);
        }

        // Fetch agent details from Bolna
        $baseUrl = rtrim($bolnaCfg['base_url'], '/');
        $headers = [
            'Authorization: Bearer ' . $bolnaCfg['api_key'],
            'Content-Type: application/json',
        ];

        $ch = curl_init($baseUrl . '/agent/' . $bolnaAgentId);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $rawAgent = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 404) {
            return $this->respond(['success' => false, 'error' => 'Agent not found on Bolna for selected account. Please check the Agent ID and account.'], 404);
        }
        if ($httpCode >= 400) {
            return $this->respond(['success' => false, 'error' => "Bolna API returned error $httpCode. Check Agent ID and account key."], 502);
        }

        $bolnaAgent = json_decode($rawAgent, true);
        if (!$bolnaAgent || empty($bolnaAgent['id'])) {
            return $this->respond(['success' => false, 'error' => 'Invalid response from Bolna API.'], 502);
        }

        // Extract fields from Bolna agent
        $name    = $bolnaAgent['agent_name']            ?? 'Imported Agent';
        $welcome = $bolnaAgent['agent_welcome_message'] ?? '';
        $prompt  = '';
        $callEndPrompt = null;

        // Extract system prompt from agent_prompts.task_1
        if (isset($bolnaAgent['agent_prompts']['task_1']['system_prompt'])) {
            $prompt = $bolnaAgent['agent_prompts']['task_1']['system_prompt'];
        }
        if (isset($bolnaAgent['agent_prompts']['task_1_extraction']['system_prompt'])) {
            $callEndPrompt = $bolnaAgent['agent_prompts']['task_1_extraction']['system_prompt'];
        }

        // Extract LLM config
        $task0  = $bolnaAgent['tasks'][0] ?? [];
        $tools  = $task0['tools_config'] ?? [];
        $llmCfg = $tools['llm_agent']['llm_config'] ?? [];
        $llmProvider = $llmCfg['provider'] ?? 'azure';
        $llmModel    = $llmCfg['model']    ?? 'gpt-4o-mini';

        // Reverse-map Bolna provider names to frontend/DB format
        // Bolna stores "google" for Gemini models — keep as "google" (frontend LLM_PROVIDERS uses 'google')
        $reverseProviderMap = [
            'google'    => 'google',
            'azure'     => 'azure',
            'anthropic' => 'anthropic',
            'openai'    => 'openai',
        ];
        $frontendProvider = $reverseProviderMap[$llmProvider] ?? $llmProvider;
        // Store model WITHOUT provider prefix — parseLlmModelProvider handles it on sync
        // Keep as-is (e.g. "gemini-3.7-flash", "gpt-4.1-mini cluster")
        $llmProvider = $frontendProvider;

        // Extract synthesizer / voice config
        $synth      = $tools['synthesizer'] ?? [];
        $synthConf  = $synth['provider_config'] ?? [];
        $voiceProvider = $synth['provider']       ?? 'elevenlabs';
        $voiceName     = $synthConf['voice']      ?? '';
        $voiceId       = $synthConf['voice_id']   ?? '';

        // Extract temperature & max_tokens from Bolna LLM config
        $rawTemp    = $llmCfg['temperature'] ?? 0.2;
        $rawMaxTok  = $llmCfg['max_tokens']  ?? 250;
        $isReasoning = (bool) preg_match('/(gpt-5|o1|o3)/i', $llmModel);
        $temperature = $isReasoning ? 1.0 : (float) $rawTemp;
        $maxTokens   = max(50, min(4096, (int) $rawMaxTok));

        // Extract RAG config → rag_ids (Bolna vector_ids UUIDs)
        $ragConfig  = $llmCfg['rag_config'] ?? [];
        // Support both rag_ids (old) and vector_store.provider_config.vector_ids (new Bolna format)
        $ragIds     = $ragConfig['rag_ids']
            ?? $ragConfig['vector_store']['provider_config']['vector_ids']
            ?? [];
        $ragIdsJson = !empty($ragIds) ? json_encode(array_values($ragIds)) : null;

        // Fetch KB file names for each rag_id
        $kbNames = [];
        if (!empty($ragIds)) {
            $chKb = curl_init($baseUrl . '/knowledgebase/all');
            curl_setopt_array($chKb, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            $kbRaw  = curl_exec($chKb);
            $kbCode = curl_getinfo($chKb, CURLINFO_HTTP_CODE);
            curl_close($chKb);

            if ($kbCode === 200) {
                $allKbs = json_decode($kbRaw, true) ?: [];
                $kbMap  = [];
                foreach ($allKbs as $kb) {
                    $kbMap[$kb['rag_id']] = $kb['file_name'] ?? $kb['source'] ?? $kb['rag_id'];
                }
                foreach ($ragIds as $rid) {
                    if (!empty($kbMap[$rid])) {
                        $kbNames[] = $kbMap[$rid];
                    }
                }
            }
        }
        $kbText = implode(', ', $kbNames);

        // Extract call_transfer_config if present in api_tools
        $callTransferConfigJson = null;
        if (!empty($tools['api_tools']['tools']) && is_array($tools['api_tools']['tools'])) {
            foreach ($tools['api_tools']['tools'] as $tool) {
                if (($tool['key'] ?? '') === 'transfer_call') {
                    $toolName = $tool['name'] ?? 'transfer_call_main';
                    $toolParam = $tools['api_tools']['tools_params'][$toolName]['param'] ?? [];
                    $callTransferConfigJson = json_encode([
                        'enabled'          => true,
                        'transfer_number'  => $toolParam['call_transfer_number'] ?? '',
                        'pre_call_message' => $tool['pre_call_message'] ?? 'Theek hai, main call transfer kar raha hu, kripya wait kijiye.',
                        'description'      => $tool['description'] ?? 'Use when the caller asks to speak to a human officer.',
                    ], JSON_UNESCAPED_UNICODE);
                    break;
                }
            }
        }

        // Determine created_by from session
        $createdBy = (int) ($this->currentUser['id'] ?? 1);
        $fromPhoneNumber = !empty($bolnaAgent['inbound_phone_number']) ? trim($bolnaAgent['inbound_phone_number']) : '';

        // Insert into pitch_agents
        $record = [
            'name'              => $name,
            'bolna_agent_id'    => $bolnaAgentId,
            'bolna_account_id'  => $bolnaAccountId,
            'from_phone_number' => $fromPhoneNumber !== '' ? $fromPhoneNumber : null,
            'welcome_message'   => $welcome,
            'system_prompt'     => $prompt,
            'call_end_prompt'   => $callEndPrompt,
            'knowledge_base'    => $kbText !== '' ? $kbText : null,
            'rag_ids'           => $ragIdsJson,
            'extraction_config' => null,
            'call_transfer_config' => $callTransferConfigJson,
            'language'          => 'hi',
            'voice_provider'    => $voiceProvider,
            'voice_name'        => $voiceName,
            'voice_id'          => $voiceId,
            'llm_provider'      => $llmProvider,
            'llm_model'         => $llmModel,
            'temperature'       => $temperature,
            'max_tokens'        => $maxTokens,
            'is_default'        => 0,
            'is_active'         => 1,
            'created_by'        => $createdBy,
            'created_at'        => date('Y-m-d H:i:s'),
            'updated_at'        => date('Y-m-d H:i:s'),
        ];
        $db->table('pitch_agents')->insert($record);
        $newId = $db->insertID();

        $this->audit('agent.import', 'agent', $newId, [
            'name'           => $name,
            'bolna_agent_id' => $bolnaAgentId,
        ]);

        return $this->respond([
            'success'        => true,
            'id'             => $newId,
            'bolna_agent_id' => $bolnaAgentId,
            'name'           => $name,
            'message'        => "Agent \"{$name}\" successfully imported into portal!",
        ], 201);
    }

    private function ensureRagIdsColumn(): void
    {
        try {
            $db = $this->db();
            if (!$db->fieldExists('rag_ids', 'pitch_agents')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_agents', [
                    'rag_ids' => [
                        'type'    => 'TEXT',
                        'null'    => true,
                        'default' => null,
                        'after'   => 'knowledge_base',
                    ],
                ]);
            }
            if (!$db->fieldExists('call_end_prompt', 'pitch_agents')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_agents', [
                    'call_end_prompt' => [
                        'type'    => 'TEXT',
                        'null'    => true,
                        'default' => null,
                        'after'   => 'system_prompt',
                    ],
                ]);
            }
            if (!$db->fieldExists('temperature', 'pitch_agents')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_agents', [
                    'temperature' => [
                        'type'    => 'FLOAT',
                        'null'    => true,
                        'default' => 0.2,
                        'after'   => 'llm_model',
                    ],
                ]);
            }
            if (!$db->fieldExists('max_tokens', 'pitch_agents')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_agents', [
                    'max_tokens' => [
                        'type'       => 'INT',
                        'constraint' => 11,
                        'null'       => true,
                        'default'    => 250,
                        'after'      => 'temperature',
                    ],
                ]);
            }
            if (!$db->fieldExists('call_transfer_config', 'pitch_agents')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_agents', [
                    'call_transfer_config' => [
                        'type'    => 'TEXT',
                        'null'    => true,
                        'default' => null,
                        'after'   => 'extraction_config',
                    ],
                ]);
            }

            // Automatically upgrade active agents to include structured Senior Connect + Meeting Scheduling in STAGE 5
            $activeAgents = $db->table('pitch_agents')->where('is_active', 1)->get()->getResultArray();
            foreach ($activeAgents as $ag) {
                if (!empty($ag['system_prompt']) && str_contains($ag['system_prompt'], 'STAGE 5: STEP-BY-STEP MEETING BOOKING') && !str_contains($ag['system_prompt'], 'सीनियर टीम से आपकी तुरंत बात')) {
                    $newStage5 = "STAGE 5: SENIOR TEAM CONNECT OR STRUCTURED MEETING (THE CONVERSION STAGE)\n(सारी मुख्य जानकारी देने के बाद जब ग्राहक संतुष्ट हो, रुचि दिखाए या सवाल पूरे हो चुके हों)\n\n- **Step 5A: IMMEDIATE SENIOR TEAM CONNECT (पहला विकल्प - तुरंत बात / कॉल ट्रांसफर का प्रस्ताव):**\n  AI: \"सर, जैसा कि आप इसमें रुचि ले रहे हैं, क्या मैं अभी हमारी सीनियर टीम से आपकी तुरंत बात करवा दूँ? वो आपको इसके बारे में 2 मिनट में और डिटेल में समझा देंगे।\"\n  (ग्राहक का जवाब सुनें)\n\n  - **शाखा 1 - अगर ग्राहक तुरंत बात करने को तैयार हो (\"हाँ करवा दो\" / \"हाँ ठीक है\" / \"कनेक्ट करो\" / \"बात कराओ\"):**\n    AI: \"जी सर, मैं तुरंत आपकी कॉल सीनियर टीम को ट्रांसफर कर रहा हूँ, कृपया एक सेकंड लाइन पर बने रहिए।\"\n    *(यहाँ transfer_call टूल ट्रिगर होगा और कॉल तुरंत सीनियर टीम को ट्रांसफर हो जाएगी)*\n\n  - **शाखा 2 - अगर ग्राहक अभी तैयार न हो (\"अभी टाइम नहीं है\" / \"व्यस्त हूँ\" / \"बाद में बात करेंगे\" / \"अभी नहीं\" / \"नहीं\"):**\n    AI बिना किसी दबाव के एकदम स्वाभाविक (Natural) और शालीन तरीके से मीटिंग शेड्यूलिंग पर आएगा:\n\n- **Step 5B: CONVENIENT ONLINE MEETING (दूसरा विकल्प - सुविधाजनक ऑनलाइन मीटिंग का प्रस्ताव):**\n  AI: \"कोई बात नहीं सर, मैं बिल्कुल समझ सकता हूँ। तो क्या हम आपकी सुविधा के अनुसार हमारी सीनियर टीम के साथ 10 मिनट की एक छोटी सी ऑनलाइन मीटिंग रख सकते हैं? कौन सा दिन आपके लिए सही रहेगा सर?\"\n  (ग्राहक को दिन बताने दें)\n\n- **Step 5C: TIME CONFIRMATION (समय तय करना):**\n  AI: \"उस दिन कौन सा समय आपके लिए सबसे उपयुक्त रहेगा सर?\"\n  (ग्राहक को समय बताने दें)\n\n- **Step 5D: ATTENDEE & CONTACT CONFIRMATION (उपस्थिति व संपर्क कन्फ़र्म करना):**\n  AI: \"[दिन] को [समय] बजे, बिल्कुल ठीक है सर। इस मीटिंग में आप ख़ुद जुड़ेंगे या कोई और भी जुड़ेगा? और क्या मीटिंग का लिंक व डिटेल्स भेजने के लिए मैं आपका यही नंबर नोट कर लूँ?\"\n  (ग्राहक की पुष्टि सुनें)\n\n- **Step 5E: GRACEFUL CLOSING (शालीनता से विदा लेना):**\n  AI: \"बहुत-बहुत धन्यवाद {{contact_name}} जी। तय समय पर हमारी सीनियर टीम आपसे ऑनलाइन जुड़ेगी। आपका दिन शुभ रहे!\" (कॉल एंड करें)।";

                    $upgradedPrompt = preg_replace(
                        '/STAGE 5:\s*STEP-BY-STEP MEETING BOOKING[\s\S]*?(?=# 4\.|\z)/u',
                        $newStage5 . "\n\n",
                        $ag['system_prompt']
                    );
                    if ($upgradedPrompt && $upgradedPrompt !== $ag['system_prompt']) {
                        $db->table('pitch_agents')->where('id', (int)$ag['id'])->update([
                            'system_prompt' => $upgradedPrompt,
                            'updated_at'    => date('Y-m-d H:i:s'),
                        ]);
                    }
                }
            }
        } catch (\Throwable $e) {
            // Log or ignore safely
        }
    }

    /**
     * Build Bolna tools_config.api_tools payload from call_transfer_config.
     * Supports transferring calls to a human agent/phone number.
     */
    private function buildApiToolsPayload($transferConfig): ?array
    {
        if (empty($transferConfig)) {
            return null;
        }

        $cfg = is_array($transferConfig) ? $transferConfig : json_decode((string)$transferConfig, true);
        if (!is_array($cfg) || empty($cfg['enabled'])) {
            return null;
        }

        $transferNumber = trim($cfg['transfer_number'] ?? $cfg['phone_number'] ?? '');
        if ($transferNumber === '') {
            return null;
        }

        $description = !empty(trim($cfg['description'] ?? ''))
            ? trim($cfg['description'])
            : 'Trigger this tool ONLY AFTER the caller has explicitly confirmed they want to talk to the senior team now AND the caller has completely finished speaking their sentence. NEVER trigger immediately on a partial utterance or mid-sentence pause like "haan" if the caller intends to speak more.';
        $preCallMessage = !empty(trim($cfg['pre_call_message'] ?? ''))
            ? trim($cfg['pre_call_message'])
            : 'जी सर, मैं तुरंत आपकी कॉल सीनियर टीम को ट्रांसफर कर रहा हूँ, कृपया एक सेकंड लाइन पर बने रहिए।';

        return [
            'tools' => [
                [
                    'key'              => 'transfer_call',
                    'name'             => 'transfer_call_main',
                    'description'      => $description,
                    'parameters'       => [
                        'type'       => 'object',
                        'properties' => (object)[],
                        'required'   => [],
                    ],
                    'pre_call_message' => $preCallMessage,
                ],
            ],
            'tools_params' => [
                'transfer_call_main' => [
                    'url'    => null,
                    'method' => 'POST',
                    'param'  => [
                        'call_sid'             => '%(call_sid)s',
                        'call_transfer_number' => $transferNumber,
                    ],
                ],
            ],
        ];
    }
}
