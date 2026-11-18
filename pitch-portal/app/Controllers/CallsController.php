<?php

namespace App\Controllers;

class CallsController extends ApiController
{
    private const LIST_COLS = 'c.id, c.lead_id, c.agent_id, c.bolna_agent_id, c.from_phone_number, c.call_status, c.interest_status, c.who_answered, c.interest_reason, c.it_head_name, c.it_head_phone, c.it_head_call_agreed, c.it_head_call_date, c.it_head_call_time, c.it_head_call_raw, c.next_action, c.summary,
        c.dialect_detected, c.duration_sec, c.transferred_to_number, c.call_transferred, c.created_at, l.contact_name, l.phone, l.organization, l.designation, l.sector, l.district, a.name as agent_name';

    private function ensureTransferColumns(): void
    {
        try {
            $db = $this->db();
            if (!$db->fieldExists('transferred_to_number', 'pitch_calls')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_calls', [
                    'transferred_to_number' => [
                        'type'       => 'VARCHAR',
                        'constraint' => 30,
                        'null'       => true,
                        'default'    => null,
                        'after'      => 'who_answered',
                    ],
                ]);
            }
            if (!$db->fieldExists('call_transferred', 'pitch_calls')) {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_calls', [
                    'call_transferred' => [
                        'type'       => 'TINYINT',
                        'constraint' => 1,
                        'null'       => true,
                        'default'    => null,
                        'after'      => 'transferred_to_number',
                    ],
                ]);
            }
        } catch (\Throwable $e) {
            // Safe fallback
        }
    }

    public function index()
    {
        $this->guard();
        $this->ensureTransferColumns();
        $db = $this->db();
        $b = $db->table('pitch_calls c')
            ->select(self::LIST_COLS)
            ->join('pitch_leads l', 'l.id = c.lead_id')
            ->join('pitch_agents a', 'a.id = c.agent_id', 'left');
        if ($i = $this->request->getGet('interest')) {
            $b->where('c.interest_status', $i);
        }
        $limit = (int) ($this->request->getGet('limit') ?: 500);
        if ($limit <= 0 || $limit > 2000) $limit = 500;
        $rows = $b->orderBy('c.id', 'DESC')->limit($limit)->get()->getResultArray();

        // Load extraction field definitions for human-readable labels
        $extractionFields = [];
        try {
            $extractionFields = $db->table('pitch_extraction_fields')->orderBy('sort_order', 'ASC')->get()->getResultArray();
        } catch (\Throwable $e) {}

        // Attach extracted answers to each call
        if (!empty($rows)) {
            $callIds = array_column($rows, 'id');
            $answers = [];
            try {
                $answers = $db->table('pitch_call_answers')
                    ->whereIn('call_id', $callIds)
                    ->get()->getResultArray();
            } catch (\Throwable $e) {}

            $answersByCall = [];
            foreach ($answers as $ans) {
                $answersByCall[$ans['call_id']][] = $ans;
            }
            foreach ($rows as &$r) {
                $r['answers'] = $answersByCall[$r['id']] ?? [];
            }
            unset($r);
        }

        return $this->respond([
            'success' => true,
            'data' => $rows,
            'extraction_fields' => $extractionFields,
        ]);
    }

    public function show($id)
    {
        $this->guard();
        $this->ensureTransferColumns();
        $db = $this->db();
        $call = $db->table('pitch_calls c')
            ->select('c.*, l.contact_name, l.phone, l.organization, l.designation, l.sector, l.district, a.name as agent_name, a.call_transfer_config as agent_call_transfer_config')
            ->join('pitch_leads l', 'l.id = c.lead_id')
            ->join('pitch_agents a', 'a.id = c.agent_id', 'left')
            ->where('c.id', (int) $id)->get()->getRowArray();
        if (! $call) {
            return $this->respond(['success' => false, 'error' => 'Call record not found'], 404);
        }

        // Auto-sync from Bolna if call is active OR recently finished without answers/transcript
        $needsSync = false;
        if (!empty($call['bolna_execution_id'])) {
            $status = $call['call_status'] ?? '';
            if (in_array($status, ['queued', 'ringing', 'in_progress'])) {
                $needsSync = true;
            } elseif ($status === 'completed') {
                $hasAnswers = $db->table('pitch_call_answers')->where('call_id', (int) $id)->countAllResults() > 0;
                $createdAt = strtotime($call['created_at'] ?? 'now');
                // If answers not yet saved and call is recent (<15 mins), sync fresh from Bolna
                if (!$hasAnswers && (time() - $createdAt < 900)) {
                    $needsSync = true;
                }
            }
        }

        if ($needsSync) {
            try {
                $this->runPipeline('bolna_call_cli.py', ['sync', '--call-id', (int) $id]);
                // Re-fetch updated call after Bolna sync
                $call = $db->table('pitch_calls c')
                    ->select('c.*, l.contact_name, l.phone, l.organization, l.designation, l.sector, l.district, a.name as agent_name, a.call_transfer_config as agent_call_transfer_config')
                    ->join('pitch_leads l', 'l.id = c.lead_id')
                    ->join('pitch_agents a', 'a.id = c.agent_id', 'left')
                    ->where('c.id', (int) $id)->get()->getRowArray();
            } catch (\Throwable $e) {
                log_message('warning', "Auto-sync failed for call #{$id}: " . $e->getMessage());
            }
        }

        // Auto-detect redirect/transfer destination number from agent config if not explicitly set
        $agentTransferNumber = null;
        if (!empty($call['agent_call_transfer_config'])) {
            $tc = json_decode((string)$call['agent_call_transfer_config'], true);
            if (is_array($tc) && !empty($tc['transfer_number'])) {
                $agentTransferNumber = trim($tc['transfer_number']);
            }
        }
        $call['agent_transfer_number'] = $agentTransferNumber;

        $rawAnalysis = $call['analysis_json'] ?? null;
        $call['analysis'] = !empty($rawAnalysis) ? (is_array($rawAnalysis) ? $rawAnalysis : json_decode($rawAnalysis, true)) : null;
        unset($call['analysis_json']);
        $turns = $db->table('pitch_call_turns')->where('call_id', (int) $id)->orderBy('idx')->get()->getResultArray();

        // Remove obsolete student / ITI verification fields from database
        $this->cleanupObsoleteFields($db);

        $answers = $db->table('pitch_call_answers')->where('call_id', (int) $id)->get()->getResultArray();
        $extractionFields = [];
        try {
            $extractionFields = $db->table('pitch_extraction_fields')->orderBy('sort_order', 'ASC')->get()->getResultArray();
        } catch (\Throwable $e) {}
        return $this->respond([
            'success' => true,
            'call' => $call,
            'turns' => $turns,
            'answers' => $answers,
            'extraction_fields' => $extractionFields,
        ]);
    }

    public function start()
    {
        $this->guard();
        $b = $this->body();
        $leadId = (int) ($b['lead_id'] ?? 0);
        $agentId = !empty($b['agent_id']) ? (int) $b['agent_id'] : null;

        $db = $this->db();
        if (! $db->table('pitch_leads')->where('id', $leadId)->countAllResults()) {
            return $this->respond(['success' => false, 'error' => 'Please select a valid lead'], 422);
        }
        $active = $db->query("SELECT id FROM pitch_calls WHERE lead_id=? AND call_status IN ('queued','ringing','in_progress')
                              AND created_at > (NOW() - INTERVAL 15 MINUTE) LIMIT 1", [$leadId])->getRow();
        if ($active) {
            return $this->respond(['success' => false, 'error' => 'A call is already active for this number (#' . $active->id . ')'], 409);
        }

        $fromNumber = trim($b['from_phone_number'] ?? '');
        $cliArgs = ['start', '--lead-id', $leadId];
        if ($agentId) {
            $agent = $db->table('pitch_agents')->where('id', $agentId)->get()->getRow();
            if ($agent && !empty($agent->bolna_agent_id)) {
                // Ensure Bolna agent does not have hangup_after_LLMCall enabled
                AgentsController::patchBolnaHangupAfterLLMCall($agent->bolna_agent_id, $agent->bolna_account_id ? (int)$agent->bolna_account_id : null);
                $cliArgs[] = '--agent-id';
                $cliArgs[] = $agent->bolna_agent_id;
                if ($fromNumber === '' && !empty($agent->from_phone_number)) {
                    $fromNumber = trim($agent->from_phone_number);
                }
            }
        }
        if ($fromNumber !== '') {
            $cliArgs[] = '--from-phone-number';
            $cliArgs[] = $fromNumber;
        }

        $res = $this->runPipeline('bolna_call_cli.py', $cliArgs);
        if (!empty($res['success'])) {
            $this->audit('call.start', 'call', $res['call_id'] ?? null, ['lead_id' => $leadId, 'agent_id' => $agentId]);
        }
        return $this->respond($res, ! empty($res['success']) ? 200 : 502);
    }

    /** Fetches latest status and transcript from Bolna */
    public function sync($id)
    {
        $this->guard();
        return $this->respond($this->runPipeline('bolna_call_cli.py', ['sync', '--call-id', (int) $id]));
    }

    public function hangup($id)
    {
        $this->guard();
        return $this->respond($this->runPipeline('bolna_call_cli.py', ['hangup', '--call-id', (int) $id]));
    }

    /** Organizer manual correction: status / interest / IT-head meeting details */
    public function update($id)
    {
        $this->guard();
        $this->ensureTransferColumns();
        $b = $this->body();
        $allowed = [
            'call_status',
            'interest_status',
            'interest_reason',
            'who_answered',
            'it_head_name',
            'it_head_phone',
            'it_head_call_date',
            'it_head_call_time',
            'it_head_call_agreed',
            'it_head_call_raw',
            'transferred_to_number',
            'call_transferred',
            'next_action',
            'summary',
        ];
        $data = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $b)) {
                $data[$f] = ($b[$f] === '' ? null : $b[$f]);
            }
        }
        if (isset($data['call_status'])) {
            $st = strtolower(trim((string)$data['call_status']));
            if (in_array($st, ['completed', 'busy', 'no_answer', 'failed', 'queued', 'ringing', 'in_progress'])) {
                $data['call_status'] = $st;
                if ($st === 'queued') {
                    // Reset execution ID so Bolna sync won't revert this call to old completed execution
                    $data['bolna_execution_id'] = null;
                    $data['duration_sec'] = null;
                    $data['end_time'] = null;
                }
            } else {
                unset($data['call_status']);
            }
        }
        if ($data) {
            $this->db()->table('pitch_calls')->where('id', (int) $id)->update($data);
            $this->audit('call.update', 'call', $id, $data);
        }
        return $this->respond(['success' => true]);
    }

    private function cleanupObsoleteFields($db): void
    {
        static $cleaned = false;
        if ($cleaned) return;
        try {
            $obsolete = ['student_volume', 'college_count', 'current_verification_method'];
            $db->table('pitch_extraction_fields')->whereIn('field_key', $obsolete)->delete();
            $db->table('pitch_call_answers')->whereIn('question_key', $obsolete)->delete();

            // Update demo labels to meeting labels in pitch_extraction_fields
            $db->table('pitch_extraction_fields')->where('field_key', 'it_head_call_agreed')->update([
                'label'       => 'Senior Team Meeting Agreed',
                'subcategory' => 'Meeting Scheduling',
                'description' => 'Whether prospect agreed to a senior team meeting (1 / 0).'
            ]);
            $db->table('pitch_extraction_fields')->where('field_key', 'it_head_name')->update([
                'label'       => 'Meeting Attendee Name',
                'subcategory' => 'Meeting Scheduling'
            ]);
            $db->table('pitch_extraction_fields')->where('field_key', 'it_head_phone')->update([
                'label'       => 'Attendee Contact Phone',
                'subcategory' => 'Meeting Scheduling'
            ]);
            $db->table('pitch_extraction_fields')->where('field_key', 'it_head_call_date')->update([
                'label'       => 'Scheduled Meeting Date',
                'subcategory' => 'Meeting Scheduling'
            ]);
            $db->table('pitch_extraction_fields')->where('field_key', 'it_head_call_time')->update([
                'label'       => 'Scheduled Meeting Time',
                'subcategory' => 'Meeting Scheduling'
            ]);
            $cleaned = true;
        } catch (\Throwable $e) {}
    }
}
