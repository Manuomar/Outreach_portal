<?php

namespace App\Controllers;

class StatsController extends ApiController
{
    public function index()
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
        $leads = (int) $db->table('pitch_leads')->countAllResults();
        $hasIsActive = $db->fieldExists('is_active', 'pitch_leads');
        $activeLeads = $hasIsActive
            ? (int) $db->table('pitch_leads')->where('is_active', 1)->countAllResults()
            : $leads;
        $disabledLeads = $hasIsActive
            ? (int) $db->table('pitch_leads')->where('is_active', 0)->countAllResults()
            : (int) $db->table('pitch_leads')->where('lead_status', 'disabled')->countAllResults();

        $calls = (int) $db->table('pitch_calls')->countAllResults();
        $completed = (int) $db->table('pitch_calls')->where('call_status', 'completed')->where('duration_sec >=', 10)->countAllResults();
        $busy = (int) $db->query("SELECT COUNT(*) n FROM pitch_calls WHERE call_status IN ('busy','ringing','no_answer') OR (call_status='completed' AND (duration_sec < 10 OR duration_sec IS NULL))")->getRow()->n;
        $incomplete = (int) $db->query("SELECT COUNT(*) n FROM pitch_calls WHERE call_status IN ('failed','incomplete')")->getRow()->n;
        $pendingQueueQuery = $hasIsActive
            ? "SELECT COUNT(*) n FROM pitch_leads WHERE is_active=1 AND id NOT IN (SELECT DISTINCT lead_id FROM pitch_calls WHERE call_status='completed' AND duration_sec >= 10)"
            : "SELECT COUNT(*) n FROM pitch_leads WHERE id NOT IN (SELECT DISTINCT lead_id FROM pitch_calls WHERE call_status='completed' AND duration_sec >= 10)";
        $pendingQueue = (int) $db->query($pendingQueueQuery)->getRow()->n;

        // Unique numbers (leads) that have had at least one successful call (>=10s)
        $completedNumbers = (int) $db->query(
            "SELECT COUNT(DISTINCT lead_id) n FROM pitch_calls WHERE call_status='completed' AND duration_sec >= 10"
        )->getRow()->n;

        $byInterest = $db->query('SELECT interest_status s, COUNT(*) n FROM pitch_calls WHERE interest_status IS NOT NULL GROUP BY interest_status')->getResultArray();
        $interest = [];
        foreach ($byInterest as $r) {
            $interest[$r['s']] = (int) $r['n'];
        }
        $meetings = (int) $db->query('SELECT COUNT(*) n FROM pitch_calls WHERE it_head_call_agreed=1 AND it_head_call_date >= CURDATE()')->getRow()->n;
        $agentsCount = (int) $db->table('pitch_agents')->where('is_active', 1)->countAllResults();
        $accountsCount = (int) $db->table('pitch_bolna_accounts')->where('is_active', 1)->countAllResults();
        $callsToday = (int) $db->table('pitch_calls')->where('DATE(created_at)', date('Y-m-d'))->countAllResults();
        return $this->respond([
            'success' => true,
            'leads' => $leads,
            'active_leads' => $activeLeads,
            'disabled_leads' => $disabledLeads,
            'calls' => $calls,
            'completed' => $completed,
            'busy' => $busy,
            'incomplete' => $incomplete,
            'pending_queue' => $pendingQueue,
            'completed_numbers' => $completedNumbers,
            'connected' => $completed,
            'connect_rate' => $calls ? round($completed * 100 / $calls) : 0,
            'interest' => $interest,
            'meetings_upcoming' => $meetings,
            'agents_count' => $agentsCount,
            'accounts_count' => $accountsCount,
            'calls_today' => $callsToday,
        ]);
    }

    public function meetings()
    {
        $this->guard();
        $rows = $this->db()->query("SELECT c.id call_id, c.it_head_name, c.it_head_phone, c.it_head_call_date, c.it_head_call_time, c.it_head_call_raw,
                l.contact_name, l.phone, l.organization
            FROM pitch_calls c JOIN pitch_leads l ON l.id=c.lead_id
            WHERE c.it_head_call_agreed=1
            ORDER BY (c.it_head_call_date IS NULL), c.it_head_call_date, c.it_head_call_time")->getResultArray();
        return $this->respond(['success' => true, 'data' => $rows]);
    }
}
