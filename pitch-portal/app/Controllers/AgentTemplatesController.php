<?php

namespace App\Controllers;

/**
 * AgentTemplatesController
 * Manages reusable agent prompt templates and global extraction field definitions.
 *
 * Routes:
 *   GET  /api/agent-templates                  → index()           (list all active templates)
 *   GET  /api/agent-templates/(:slug)          → show($slug)       (get one template by slug)
 *   POST /api/agent-templates                  → create()          (create new template)
 *   PUT  /api/agent-templates/(:num)           → update($id)       (update template)
 *
 *   GET  /api/extraction-fields                → listFields()      (all extraction fields with category grouping)
 *   POST /api/extraction-fields                → createField()     (add new global extraction field)
 *   PUT  /api/extraction-fields/(:num)         → updateField($id)  (update field meta / enabled state)
 *   DELETE /api/extraction-fields/(:num)       → deleteField($id)  (remove custom field)
 */
class AgentTemplatesController extends ApiController
{
    // ── Agent Templates ───────────────────────────────────────────────────────

    /** List all active agent templates (summary fields only) */
    public function index()
    {
        $this->guard();
        $rows = $this->db()->table('pitch_agent_templates')
            ->select('id, slug, name, description, voice_id, language, llm_model, is_active, updated_at')
            ->where('is_active', 1)
            ->orderBy('id', 'ASC')
            ->get()->getResultArray();

        return $this->respond(['success' => true, 'data' => $rows]);
    }

    /** Get a single template by slug (includes full prompt + KB) */
    public function show($slug)
    {
        $this->guard();
        $row = $this->db()->table('pitch_agent_templates')
            ->where('slug', $slug)
            ->where('is_active', 1)
            ->get()->getRowArray();

        if (!$row) {
            return $this->respond(['success' => false, 'error' => "Template '{$slug}' not found"], 404);
        }

        return $this->respond(['success' => true, 'data' => $row]);
    }

    /** Create a new agent template */
    public function create()
    {
        $this->guard();
        $b = $this->body();

        $slug   = trim($b['slug']   ?? '');
        $name   = trim($b['name']   ?? '');
        $prompt = trim($b['system_prompt'] ?? '');

        if ($slug === '' || $name === '' || $prompt === '') {
            return $this->respond(['success' => false, 'error' => 'slug, name, and system_prompt are required'], 422);
        }

        $exists = $this->db()->table('pitch_agent_templates')->where('slug', $slug)->get()->getRow();
        if ($exists) {
            return $this->respond(['success' => false, 'error' => "Template with slug '{$slug}' already exists"], 409);
        }

        $now = date('Y-m-d H:i:s');
        $this->db()->table('pitch_agent_templates')->insert([
            'slug'            => $slug,
            'name'            => $name,
            'description'     => trim($b['description'] ?? ''),
            'welcome_message' => trim($b['welcome_message'] ?? ''),
            'system_prompt'   => $prompt,
            'knowledge_base'  => trim($b['knowledge_base'] ?? '') ?: null,
            'voice_id'        => trim($b['voice_id'] ?? '') ?: null,
            'language'        => trim($b['language'] ?? 'hi'),
            'llm_model'       => trim($b['llm_model'] ?? '') ?: null,
            'is_active'       => 1,
            'created_at'      => $now,
            'updated_at'      => $now,
        ]);

        return $this->respond(['success' => true, 'id' => $this->db()->insertID(), 'message' => 'Template created.'], 201);
    }

    /** Update an existing template */
    public function update($id)
    {
        $this->guard();
        $row = $this->db()->table('pitch_agent_templates')->where('id', (int)$id)->get()->getRow();
        if (!$row) {
            return $this->respond(['success' => false, 'error' => 'Template not found'], 404);
        }

        $b      = $this->body();
        $fields = ['updated_at' => date('Y-m-d H:i:s')];

        foreach (['name', 'description', 'welcome_message', 'system_prompt', 'knowledge_base', 'voice_id', 'language', 'llm_model'] as $col) {
            if (isset($b[$col])) {
                $fields[$col] = trim((string)$b[$col]);
            }
        }
        if (isset($b['is_active'])) {
            $fields['is_active'] = (int)(bool)$b['is_active'];
        }

        $this->db()->table('pitch_agent_templates')->where('id', (int)$id)->update($fields);

        return $this->respond(['success' => true, 'message' => 'Template updated.']);
    }

    // ── Extraction Fields ─────────────────────────────────────────────────────

    /**
     * Return all extraction fields, optionally grouped by category.
     * Query param: ?grouped=1  → returns {category: [fields]}
     */
    public function listFields()
    {
        $this->guard();
        $db = $this->db();
        $obsolete = ['student_volume', 'college_count', 'current_verification_method'];
        try {
            $db->table('pitch_extraction_fields')->whereIn('field_key', $obsolete)->delete();
        } catch (\Throwable $e) {}

        // Ensure standard extraction fields exist in database
        $standardFields = [
            ['field_key' => 'call_summary', 'label' => 'Call Summary', 'category' => 'Overview', 'subcategory' => 'Summary', 'db_table' => 'pitch_calls', 'db_column' => 'summary', 'field_type' => 'Text', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 1, 'description' => 'Concise 2-3 sentence executive summary of conversation, prospect response, and outcome.'],
            ['field_key' => 'interest_level', 'label' => 'Interest Level', 'category' => 'Core', 'subcategory' => 'Qualification', 'db_table' => 'pitch_calls', 'db_column' => 'interest_status', 'field_type' => 'Enum', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 2, 'description' => 'Prospect interest level: interested / maybe / callback / not_interested.'],
            ['field_key' => 'interest_reason', 'label' => 'Interest / Objection Reason', 'category' => 'Core', 'subcategory' => 'Qualification', 'db_table' => 'pitch_calls', 'db_column' => 'interest_reason', 'field_type' => 'Text', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 3, 'description' => 'Specific reason for interest or hesitation.'],
            ['field_key' => 'system_matches_need', 'label' => 'Matches Need', 'category' => 'Core', 'subcategory' => 'Qualification', 'db_table' => 'pitch_calls', 'db_column' => 'response_value', 'field_type' => 'Boolean', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 4, 'description' => 'Whether prospect confirmed the system matches their requirement.'],
            ['field_key' => 'meeting_agreed', 'label' => 'Meeting Agreed', 'category' => 'Core', 'subcategory' => 'Next Steps', 'db_table' => 'pitch_calls', 'db_column' => 'it_head_call_agreed', 'field_type' => 'Boolean', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 5, 'description' => 'Whether the prospect agreed to a senior team meeting or live demo.'],
            ['field_key' => 'meeting_date_time', 'label' => 'Meeting Date & Time', 'category' => 'Core', 'subcategory' => 'Next Steps', 'db_table' => 'pitch_calls', 'db_column' => 'it_head_call_raw', 'field_type' => 'String', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 6, 'description' => 'Agreed day, date, and time for meeting or demo.'],
            ['field_key' => 'meeting_attendee', 'label' => 'Meeting Attendee', 'category' => 'Core', 'subcategory' => 'Next Steps', 'db_table' => 'pitch_calls', 'db_column' => 'it_head_name', 'field_type' => 'String', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 7, 'description' => 'Who will attend: prospect themselves or designated nodal officer.'],
            ['field_key' => 'objections_or_questions', 'label' => 'Objections & Concerns', 'category' => 'Core', 'subcategory' => 'Objection Handling', 'db_table' => 'pitch_calls', 'db_column' => 'response_value', 'field_type' => 'Text', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 8, 'description' => 'Specific concerns, hesitation, pricing or timeline questions raised by prospect.'],
            ['field_key' => 'recommended_next_action', 'label' => 'Next Action', 'category' => 'Next Steps', 'subcategory' => 'Action Plan', 'db_table' => 'pitch_calls', 'db_column' => 'next_action', 'field_type' => 'String', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 9, 'description' => 'Specific actionable next step for sales/follow-up team.'],
            ['field_key' => 'who_answered', 'label' => 'Who Answered', 'category' => 'Core', 'subcategory' => 'Verification', 'db_table' => 'pitch_calls', 'db_column' => 'who_answered', 'field_type' => 'Enum', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 10, 'description' => 'Role of person who answered call.'],
            ['field_key' => 'call_transferred', 'label' => 'Call Transferred', 'category' => 'Escalation', 'subcategory' => 'Transfer', 'db_table' => 'pitch_calls', 'db_column' => 'call_transferred', 'field_type' => 'Boolean', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 11, 'description' => 'Whether call was transferred to senior team immediately.'],
            ['field_key' => 'preferred_contact_method', 'label' => 'Preferred Follow-up Channel', 'category' => 'Next Steps', 'subcategory' => 'Communication', 'db_table' => 'pitch_calls', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 12, 'description' => 'Preferred channel: WhatsApp / Phone / Email.'],
            ['field_key' => 'callback_requested', 'label' => 'Callback Requested', 'category' => 'Next Steps', 'subcategory' => 'Callback', 'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'Boolean', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 13, 'description' => 'Whether prospect asked to call back later (Yes/No).'],
            ['field_key' => 'callback_time', 'label' => 'Callback Time', 'category' => 'Next Steps', 'subcategory' => 'Callback', 'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 14, 'description' => 'Requested day/time for callback (e.g. tomorrow 2 PM, evening).'],
            ['field_key' => 'is_wrong_number', 'label' => 'Wrong Number', 'category' => 'Core', 'subcategory' => 'Verification', 'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'Boolean', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 15, 'description' => 'Whether recipient stated wrong number or wrong person (Yes/No).'],
            ['field_key' => 'not_interested_reason', 'label' => 'Not Interested Reason', 'category' => 'Core', 'subcategory' => 'Qualification', 'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'Text', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 16, 'description' => 'Specific reason why prospect declined or is not interested.'],
            ['field_key' => 'fraud_suspicion', 'label' => 'Fraud / Fake Call Suspicion', 'category' => 'Quality', 'subcategory' => 'Trust', 'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'Boolean', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 17, 'description' => 'Whether caller suspected call is fake, fraud, scam or demanded proof.'],
            ['field_key' => 'trust_sentiment', 'label' => 'Trust & Credibility', 'category' => 'Quality', 'subcategory' => 'Trust', 'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'Enum', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 18, 'description' => 'Prospect perception: High Trust / Neutral / Skeptical / Suspected Fraud.'],
        ];
        try {
            foreach ($standardFields as $sf) {
                $exists = $db->table('pitch_extraction_fields')->where('field_key', $sf['field_key'])->countAllResults();
                if ($exists === 0) {
                    $db->table('pitch_extraction_fields')->insert($sf);
                }
            }
        } catch (\Throwable $e) {}

        $rows = $db->table('pitch_extraction_fields')
            ->orderBy('sort_order', 'ASC')
            ->orderBy('id', 'ASC')
            ->get()->getResultArray();

        // Map to frontend-compatible format
        $mapped = array_map(fn($r) => [
            'id'          => (int)$r['id'],
            'key'         => $r['field_key'],
            'label'       => $r['label'],
            'category'    => $r['category'],
            'subcategory' => $r['subcategory'],
            'table'       => $r['db_table'],
            'column'      => $r['db_column'],
            'type'        => $r['field_type'],
            'description' => $r['description'],
            'isCore'      => (bool)(int)$r['is_core'],
            'enabled'     => (bool)(int)$r['is_enabled'],
            'sort_order'  => (int)$r['sort_order'],
        ], $rows);

        return $this->respond(['success' => true, 'data' => $mapped]);
    }

    /** Add a new global extraction field */
    public function createField()
    {
        $this->guard();
        $b = $this->body();

        $key   = preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($b['key'] ?? '')));
        $label = trim($b['label'] ?? '');

        if ($key === '' || $label === '') {
            return $this->respond(['success' => false, 'error' => 'key and label are required'], 422);
        }

        $exists = $this->db()->table('pitch_extraction_fields')->where('field_key', $key)->get()->getRow();
        if ($exists) {
            return $this->respond(['success' => false, 'error' => "Field key '{$key}' already exists"], 409);
        }

        // Determine max sort_order
        $maxSort = (int)($this->db()->table('pitch_extraction_fields')->selectMax('sort_order')->get()->getRowArray()['sort_order'] ?? 0);

        $this->db()->table('pitch_extraction_fields')->insert([
            'field_key'   => $key,
            'label'       => $label,
            'category'    => trim($b['category'] ?? 'Custom'),
            'subcategory' => trim($b['subcategory'] ?? '') ?: null,
            'db_table'    => trim($b['table'] ?? 'pitch_call_answers'),
            'db_column'   => trim($b['column'] ?? 'response_value'),
            'field_type'  => trim($b['type'] ?? 'String'),
            'description' => trim($b['description'] ?? ''),
            'is_core'     => (int)(bool)($b['isCore'] ?? false),
            'is_enabled'  => (int)(bool)($b['enabled'] ?? true),
            'sort_order'  => $maxSort + 10,
            'created_at'  => date('Y-m-d H:i:s'),
        ]);

        return $this->respond(['success' => true, 'id' => $this->db()->insertID(), 'message' => 'Extraction field created.'], 201);
    }

    /** Update an extraction field's metadata or enabled state */
    public function updateField($id)
    {
        $this->guard();
        $row = $this->db()->table('pitch_extraction_fields')->where('id', (int)$id)->get()->getRow();
        if (!$row) {
            return $this->respond(['success' => false, 'error' => 'Extraction field not found'], 404);
        }

        $b      = $this->body();
        $fields = [];

        foreach (['label', 'category', 'subcategory', 'description', 'field_type'] as $col) {
            if (isset($b[$col])) {
                $fields[$col] = trim((string)$b[$col]);
            }
        }
        if (isset($b['enabled'])) {
            $fields['is_enabled'] = (int)(bool)$b['enabled'];
        }
        if (isset($b['sort_order'])) {
            $fields['sort_order'] = (int)$b['sort_order'];
        }

        if (!empty($fields)) {
            $this->db()->table('pitch_extraction_fields')->where('id', (int)$id)->update($fields);
        }

        return $this->respond(['success' => true, 'message' => 'Field updated.']);
    }

    /** Delete a non-core custom extraction field */
    public function deleteField($id)
    {
        $this->guard();
        $row = $this->db()->table('pitch_extraction_fields')->where('id', (int)$id)->get()->getRowArray();
        if (!$row) {
            return $this->respond(['success' => false, 'error' => 'Extraction field not found'], 404);
        }
        if ((int)$row['is_core'] === 1) {
            return $this->respond(['success' => false, 'error' => 'Core extraction fields cannot be deleted. Disable them instead.'], 400);
        }

        $this->db()->table('pitch_extraction_fields')->where('id', (int)$id)->delete();

        return $this->respond(['success' => true, 'message' => 'Field deleted.']);
    }
}

