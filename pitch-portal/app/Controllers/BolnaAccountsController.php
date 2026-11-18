<?php

namespace App\Controllers;

/**
 * BolnaAccountsController
 *
 * CRUD for pitch_bolna_accounts — multi-account Bolna API key management.
 *
 * Routes (all auth-guarded):
 *   GET    /api/bolna-accounts              → index()
 *   POST   /api/bolna-accounts              → create()
 *   PUT    /api/bolna-accounts/(:num)        → update($id)
 *   POST   /api/bolna-accounts/(:num)/default → setDefault($id)
 *   DELETE /api/bolna-accounts/(:num)        → delete($id)
 *   POST   /api/bolna-accounts/test-connection → testConnection()
 */
class BolnaAccountsController extends ApiController
{
    /** List all active accounts (API key masked) */
    public function index()
    {
        $this->guard();
        $rows = $this->db()->table('pitch_bolna_accounts')
            ->where('is_active', 1)
            ->orderBy('is_default', 'DESC')
            ->orderBy('id', 'ASC')
            ->get()->getResultArray();

        foreach ($rows as &$row) {
            $row['api_key_masked'] = $this->maskKey($row['api_key']);
            $row['api_key']        = $row['api_key_masked']; // never send plaintext in list
            // count agents using this account
            $row['agent_count'] = (int) $this->db()
                ->table('pitch_agents')
                ->where('bolna_account_id', $row['id'])
                ->where('is_active', 1)
                ->countAllResults();
        }
        unset($row);

        return $this->respond(['success' => true, 'data' => $rows]);
    }

    /** Create a new Bolna account */
    public function create()
    {
        $this->guard();
        $b = $this->body();

        $label   = trim($b['label']   ?? '');
        $apiKey  = trim($b['api_key'] ?? '');
        $baseUrl = trim($b['base_url'] ?? 'https://api.bolna.ai');

        if ($label === '') {
            return $this->respond(['success' => false, 'error' => 'Account label is required.'], 422);
        }
        if ($apiKey === '' || !str_starts_with($apiKey, 'bn-')) {
            return $this->respond(['success' => false, 'error' => 'A valid Bolna API key starting with bn- is required.'], 422);
        }

        $now = date('Y-m-d H:i:s');
        $isFirst = $this->db()->table('pitch_bolna_accounts')->where('is_active', 1)->countAllResults() === 0;

        $this->db()->table('pitch_bolna_accounts')->insert([
            'label'      => $label,
            'api_key'    => $apiKey,
            'base_url'   => $baseUrl ?: 'https://api.bolna.ai',
            'is_default' => $isFirst ? 1 : 0,
            'is_active'  => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $newId = $this->db()->insertID();

        $this->audit('bolna_account.create', 'bolna_account', $newId, ['label' => $label]);

        return $this->respond(['success' => true, 'id' => $newId, 'message' => 'Bolna account added successfully.'], 201);
    }

    /** Update label / api_key / base_url of an account */
    public function update($id)
    {
        $this->guard();
        $row = $this->db()->table('pitch_bolna_accounts')->where('id', (int)$id)->where('is_active', 1)->get()->getRow();
        if (!$row) {
            return $this->respond(['success' => false, 'error' => 'Account not found.'], 404);
        }

        $b      = $this->body();
        $fields = ['updated_at' => date('Y-m-d H:i:s')];
        if (!empty($b['label']))   { $fields['label']    = trim($b['label']); }
        if (!empty($b['api_key']) && str_starts_with(trim($b['api_key']), 'bn-')) {
            $fields['api_key']  = trim($b['api_key']);
        }
        if (!empty($b['base_url'])) { $fields['base_url'] = trim($b['base_url']); }

        $this->db()->table('pitch_bolna_accounts')->where('id', (int)$id)->update($fields);

        // Sync config.json and agent_settings if this is the default account
        if ($row->is_default) {
            $this->syncConfigJson((object) array_merge((array) $row, $fields));
        }

        $this->audit('bolna_account.update', 'bolna_account', $id, array_keys($fields));

        return $this->respond(['success' => true, 'message' => 'Account updated.']);
    }

    /** Set an account as default (used when no agent-level account is specified) */
    public function setDefault($id)
    {
        $this->guard();
        $acct = $this->db()->table('pitch_bolna_accounts')->where('id', (int)$id)->where('is_active', 1)->get()->getRow();
        if (!$acct) {
            return $this->respond(['success' => false, 'error' => 'Account not found.'], 404);
        }

        $this->db()->table('pitch_bolna_accounts')->where('is_default', 1)->update(['is_default' => 0]);
        $this->db()->table('pitch_bolna_accounts')->where('id', (int)$id)->update(['is_default' => 1]);

        $this->syncConfigJson($acct);
        $this->audit('bolna_account.set_default', 'bolna_account', $id, []);

        return $this->respond(['success' => true, 'message' => 'Default account updated.']);
    }

    /** Soft-delete (deactivate) an account */
    public function delete($id)
    {
        $this->guard();
        $acct = $this->db()->table('pitch_bolna_accounts')->where('id', (int)$id)->where('is_active', 1)->get()->getRow();
        if (!$acct) {
            return $this->respond(['success' => false, 'error' => 'Account not found.'], 404);
        }
        if ($acct->is_default) {
            return $this->respond(['success' => false, 'error' => 'Cannot delete the default account. Set another account as default first.'], 400);
        }
        // Check no active agents use this account
        $using = $this->db()->table('pitch_agents')
            ->where('bolna_account_id', (int)$id)->where('is_active', 1)->countAllResults();
        if ($using > 0) {
            return $this->respond(['success' => false, 'error' => "Cannot delete: {$using} active agent(s) use this account. Re-assign them first."], 400);
        }

        $this->db()->table('pitch_bolna_accounts')->where('id', (int)$id)->update(['is_active' => 0]);
        $this->audit('bolna_account.delete', 'bolna_account', $id, []);

        return $this->respond(['success' => true, 'message' => 'Account deactivated.']);
    }

    /**
     * Test connectivity to Bolna API using provided key.
     * Body: { "api_key": "bn-xxx", "base_url": "https://api.bolna.ai" }
     */
    public function testConnection()
    {
        $this->guard();
        $b      = $this->body();
        $apiKey = trim($b['api_key'] ?? '');
        $url    = rtrim(trim($b['base_url'] ?? 'https://api.bolna.ai'), '/');

        if ($apiKey === '') {
            return $this->respond(['success' => false, 'error' => 'API key is required for testing.'], 400);
        }

        $checkEndpoint = function(string $endpoint) use ($url, $apiKey) {
            $ch = curl_init($url . $endpoint);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => [
                    'Authorization: Bearer ' . $apiKey,
                    'Content-Type: application/json',
                ],
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err  = curl_error($ch);
            curl_close($ch);
            return [$code, $body, $err];
        };

        // Try /me first
        [$code, $body, $err] = $checkEndpoint('/me');

        // If /me returns 404/405, fallback to /agent or /knowledgebase/all
        if ($code === 404 || $code === 405) {
            [$code, $body, $err] = $checkEndpoint('/agent');
            if ($code === 404 || $code === 405) {
                [$code, $body, $err] = $checkEndpoint('/knowledgebase/all');
            }
        }

        if ($err) {
            return $this->respond(['success' => false, 'error' => 'Connection error: ' . $err], 400);
        }

        if ($code === 401 || $code === 403) {
            // NEVER return HTTP 401/403 here: 401 triggers frontend session logout!
            return $this->respond(['success' => false, 'error' => 'Invalid API key — Bolna returned HTTP ' . $code . ' Unauthorized. Please check your key.'], 400);
        }

        if ($code >= 400) {
            return $this->respond(['success' => false, 'error' => "Bolna API returned HTTP {$code}. Check your API key and base URL."], 400);
        }

        $resData = json_decode((string)$body, true);
        $info = !empty($resData['email']) ? " Connected as {$resData['email']}." : "";

        return $this->respond([
            'success'   => true,
            'connected' => true,
            'message'   => "Connection verified (HTTP {$code}).{$info} API key is valid.",
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Get the resolved Bolna config for a given account ID (or default).
     * Used by AgentsController.
     */
    public static function resolveConfig(?int $accountId = null): array
    {
        $db = \Config\Database::connect();

        // Try specific account first
        if ($accountId) {
            $acct = $db->table('pitch_bolna_accounts')
                ->where('id', $accountId)->where('is_active', 1)->get()->getRowArray();
            if ($acct) {
                return [
                    'api_key'  => $acct['api_key'],
                    'base_url' => rtrim($acct['base_url'] ?: 'https://api.bolna.ai', '/'),
                ];
            }
        }

        // Fall back to default account
        $acct = $db->table('pitch_bolna_accounts')
            ->where('is_default', 1)->where('is_active', 1)->get()->getRowArray();
        if ($acct) {
            return [
                'api_key'  => $acct['api_key'],
                'base_url' => rtrim($acct['base_url'] ?: 'https://api.bolna.ai', '/'),
            ];
        }

        // Final fallback: config.json
        $cfgFile = rtrim(ROOTPATH, '/\\') . DIRECTORY_SEPARATOR . 'ai_pipeline' . DIRECTORY_SEPARATOR . 'config.json';
        if (file_exists($cfgFile)) {
            $json = json_decode(file_get_contents($cfgFile), true);
            return [
                'api_key'  => $json['bolna']['api_key']  ?? '',
                'base_url' => rtrim($json['bolna']['base_url'] ?? 'https://api.bolna.ai', '/'),
            ];
        }

        return ['api_key' => '', 'base_url' => 'https://api.bolna.ai'];
    }

    private function maskKey(string $key): string
    {
        $len = strlen($key);
        if ($len <= 10) return str_repeat('*', $len);
        return substr($key, 0, 6) . str_repeat('*', $len - 10) . substr($key, -4);
    }

    private function syncConfigJson(object $acct): void
    {
        $cfgFile = rtrim(ROOTPATH, '/\\') . DIRECTORY_SEPARATOR . 'ai_pipeline' . DIRECTORY_SEPARATOR . 'config.json';
        if (!file_exists($cfgFile) || !is_writable($cfgFile)) return;

        $json = json_decode(file_get_contents($cfgFile), true);
        if (!is_array($json)) return;

        $json['bolna']['api_key']  = $acct->api_key  ?? $json['bolna']['api_key']  ?? '';
        $json['bolna']['base_url'] = $acct->base_url ?? $json['bolna']['base_url'] ?? 'https://api.bolna.ai';

        file_put_contents($cfgFile, json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
}

