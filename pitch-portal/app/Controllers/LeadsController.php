<?php

namespace App\Controllers;

class LeadsController extends ApiController
{
    private function phone(?string $p): string
    {
        $d = preg_replace('/\D/', '', (string) $p);
        return strlen($d) > 10 ? substr($d, -10) : $d;
    }

    private function fields(array $b): array
    {
        $out = [];
        foreach (['contact_name', 'organization', 'designation', 'sector', 'state', 'district', 'notes', 'lead_status', 'is_active'] as $f) {
            if (array_key_exists($f, $b)) {
                $val = is_string($b[$f]) ? trim($b[$f]) : $b[$f];
                $out[$f] = ($val !== '' && $val !== null) ? $val : null;
            }
        }
        return $out;
    }

    public function index()
    {
        $this->guard();
        $q = trim((string) $this->request->getGet('q'));
        $status = (string) $this->request->getGet('status');
        $queue = (string) $this->request->getGet('queue');
        $sector = trim((string) $this->request->getGet('sector'));
        $state = trim((string) $this->request->getGet('state'));
        $district = trim((string) $this->request->getGet('district'));
        $limit = min(500, max(1, (int) ($this->request->getGet('limit') ?: 10)));
        $page = max(1, (int) ($this->request->getGet('page') ?: 1));

        $b = $this->db()->table('pitch_leads');
        $db = $this->db();
        $hasIsActive = $db->fieldExists('is_active', 'pitch_leads');

        // Active / Disabled filter (Default: active only so disabled contacts are hidden)
        $activeFilter = (string) $this->request->getGet('active');
        if ($activeFilter === 'disabled' || $status === 'disabled') {
            if ($hasIsActive) {
                $b->where('is_active', 0);
            } else {
                $b->where('lead_status', 'disabled');
            }
        } elseif ($activeFilter === 'all') {
            // Include all (active + disabled)
        } else {
            // Default: active contacts only
            if ($hasIsActive) {
                $b->where('is_active', 1);
            } else {
                $b->where('lead_status !=', 'disabled');
            }
        }

        if ($q !== '') {
            $b->groupStart()
                ->like('contact_name', $q)
                ->orLike('phone', $q)
                ->orLike('organization', $q)
                ->orLike('designation', $q)
                ->orLike('district', $q)
                ->orLike('state', $q)
            ->groupEnd();
        }
        if ($status !== '' && $status !== 'all') {
            $b->where('lead_status', $status);
        }
        if ($sector !== '' && $sector !== 'all') {
            $b->where('sector', $sector);
        }
        if ($state !== '' && $state !== 'all') {
            $b->where('state', $state);
        }
        if ($district !== '' && $district !== 'all') {
            $b->where('district', $district);
        }

        // Pending Queue vs Completed filter:
        // A lead is in 'pending' if it hasn't had a completed call with duration >= 10s
        if ($queue === 'pending' || $queue === 'pending_queue') {
            $b->where("id NOT IN (SELECT DISTINCT lead_id FROM pitch_calls WHERE call_status='completed' AND duration_sec >= 10)", null, false);
        } elseif ($queue === 'completed') {
            $b->where("id IN (SELECT DISTINCT lead_id FROM pitch_calls WHERE call_status='completed' AND duration_sec >= 10)", null, false);
        } elseif ($queue === 'busy') {
            $b->where("id IN (SELECT DISTINCT lead_id FROM pitch_calls WHERE call_status IN ('busy','ringing','no_answer') OR (call_status='completed' AND (duration_sec < 10 OR duration_sec IS NULL)))", null, false);
        } elseif ($queue === 'incomplete') {
            $b->where("id IN (SELECT DISTINCT lead_id FROM pitch_calls WHERE call_status IN ('failed','incomplete'))", null, false);
        }

        $total = $b->countAllResults(false);
        $rows = $b->orderBy('id', 'DESC')->limit($limit, ($page - 1) * $limit)->get()->getResultArray();
        return $this->respond(['success' => true, 'data' => $rows, 'total' => $total, 'page' => $page, 'limit' => $limit]);
    }

    public function create()
    {
        $this->guard();
        $b = $this->body();
        $phone = $this->phone($b['phone'] ?? '');
        if (strlen($phone) < 10 || empty(trim((string) ($b['contact_name'] ?? '')))) {
            return $this->respond(['success' => false, 'error' => 'Contact name and a valid 10-digit mobile number are required'], 422);
        }
        $db = $this->db();
        if ($db->table('pitch_leads')->where('phone', $phone)->countAllResults() > 0) {
            return $this->respond(['success' => false, 'error' => 'This phone number already exists in the system'], 409);
        }
        $db->table('pitch_leads')->insert($this->fields($b) + ['phone' => $phone]);
        $newId = $db->insertID();
        $this->audit('lead.create', 'lead', $newId, ['phone' => $phone, 'name' => $b['contact_name'] ?? '']);
        return $this->respondCreated(['success' => true, 'id' => $newId]);
    }

    /** body: {"rows":[{contact_name, phone, organization, designation, sector}...]} */
    public function bulk()
    {
        $this->guard();
        $rows = $this->body()['rows'] ?? [];
        $db = $this->db();
        $added = $dup = $bad = 0;
        foreach ($rows as $r) {
            $phone = $this->phone($r['phone'] ?? '');
            $name = trim((string) ($r['contact_name'] ?? ''));
            if (strlen($phone) < 10 || $name === '') {
                $bad++;
                continue;
            }
            if ($db->table('pitch_leads')->where('phone', $phone)->countAllResults() > 0) {
                $dup++;
                continue;
            }
            $db->table('pitch_leads')->insert($this->fields($r) + ['phone' => $phone]);
            $added++;
        }
        return $this->respond(['success' => true, 'added' => $added, 'duplicates' => $dup, 'invalid' => $bad]);
    }

    public function update($id)
    {
        $this->guard();
        $b = $this->body();
        $data = $this->fields($b);
        if (isset($b['phone'])) {
            $data['phone'] = $this->phone($b['phone']);
        }
        if (! $data) {
            return $this->respond(['success' => false, 'error' => 'No valid fields provided to update'], 422);
        }
        $this->db()->table('pitch_leads')->where('id', (int) $id)->update($data);
        return $this->respond(['success' => true]);
    }

    public function disable($id)
    {
        $this->guard();
        $db = $this->db();
        if (!$db->fieldExists('is_active', 'pitch_leads')) {
            try {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_leads', [
                    'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'null' => false]
                ]);
            } catch (\Throwable $e) {}
        }
        $db->table('pitch_leads')->where('id', (int) $id)->update(['is_active' => 0]);
        $this->audit('lead.disable', 'lead', $id);
        return $this->respond(['success' => true, 'message' => 'Contact disabled successfully']);
    }

    public function enable($id)
    {
        $this->guard();
        $db = $this->db();
        if (!$db->fieldExists('is_active', 'pitch_leads')) {
            try {
                $forge = \Config\Database::forge();
                $forge->addColumn('pitch_leads', [
                    'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'null' => false]
                ]);
            } catch (\Throwable $e) {}
        }
        $db->table('pitch_leads')->where('id', (int) $id)->update(['is_active' => 1]);
        $this->audit('lead.enable', 'lead', $id);
        return $this->respond(['success' => true, 'message' => 'Contact enabled successfully']);
    }

    public function delete($id)
    {
        $this->guard();
        $this->db()->table('pitch_leads')->where('id', (int) $id)->delete();
        return $this->respond(['success' => true]);
    }
}
