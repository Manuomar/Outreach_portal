<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchAgentsTable extends Migration
{
    public function up()
    {
        // 1. Create pitch_agents table
        $this->forge->addField([
            'id' => [
                'type'           => 'INT',
                'auto_increment' => true,
            ],
            'name' => [
                'type'       => 'VARCHAR',
                'constraint' => 150,
            ],
            'bolna_agent_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 64,
                'unique'     => true,
            ],
            'welcome_message' => [
                'type' => 'TEXT',
            ],
            'system_prompt' => [
                'type' => 'LONGTEXT',
            ],
            'knowledge_base' => [
                'type' => 'LONGTEXT',
                'null' => true,
            ],
            'language' => [
                'type'       => 'VARCHAR',
                'constraint' => 20,
                'default'    => 'hi',
            ],
            'voice_provider' => [
                'type'       => 'VARCHAR',
                'constraint' => 50,
                'default'    => 'elevenlabs',
            ],
            'voice_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 100,
                'default'    => 'Viraj - Warm, Energetic and Lively',
            ],
            'voice_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 64,
                'default'    => 'iWNf11sz1GrUE4ppxTOL',
            ],
            'llm_provider' => [
                'type'       => 'VARCHAR',
                'constraint' => 50,
                'default'    => 'azure',
            ],
            'llm_model' => [
                'type'       => 'VARCHAR',
                'constraint' => 100,
                'default'    => 'azure/gpt-4.1-mini',
            ],
            'is_default' => [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'default'    => 0,
            ],
            'is_active' => [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'default'    => 1,
            ],
            'created_by' => [
                'type' => 'INT',
                'null' => true,
            ],
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'updated_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('pitch_agents', true);

        // 2. Add columns to pitch_calls table if not exists
        if (!$this->db->fieldExists('agent_id', 'pitch_calls')) {
            $this->forge->addColumn('pitch_calls', [
                'agent_id' => [
                    'type' => 'INT',
                    'null' => true,
                    'after' => 'lead_id',
                ],
            ]);
        }
        if (!$this->db->fieldExists('bolna_agent_id', 'pitch_calls')) {
            $this->forge->addColumn('pitch_calls', [
                'bolna_agent_id' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 64,
                    'null'       => true,
                    'after'      => 'agent_id',
                ],
            ]);
        }

        // 3. Seed initial default agent record
        $db = \Config\Database::connect();
        $existing = $db->table('pitch_agents')->where('bolna_agent_id', 'dc7cc50e-b6b0-47fb-98af-6b53947dc4f0')->get()->getRow();
        if (!$existing) {
            $welcome = 'नमस्ते! मैं अजय बोल रहा हूँ, Vdai Biosec टीम से। क्या मेरी बात {contact_name} जी से हो रही है?';
            $promptFile = ROOTPATH . 'ai_pipeline/prompts/ajay_system_prompt.md';
            $promptText = file_exists($promptFile) ? file_get_contents($promptFile) : 'Ajay default prompt';

            $kbFile = ROOTPATH . 'ai_pipeline/knowledge_base/knowledge_base.md';
            if (!file_exists($kbFile)) {
                $kbFile = dirname(ROOTPATH) . '/pitch-portal/docs/KNOWLEDGE_BASE.md';
            }
            $kbText = file_exists($kbFile) ? file_get_contents($kbFile) : '';

            $db->table('pitch_agents')->insert([
                'name'            => 'Ajay (ITI CCIMS Default)',
                'bolna_agent_id'  => 'dc7cc50e-b6b0-47fb-98af-6b53947dc4f0',
                'welcome_message' => $welcome,
                'system_prompt'   => $promptText,
                'knowledge_base'  => $kbText,
                'language'        => 'hi',
                'voice_provider'  => 'elevenlabs',
                'voice_name'      => 'Viraj - Warm, Energetic and Lively',
                'voice_id'        => 'iWNf11sz1GrUE4ppxTOL',
                'llm_provider'    => 'azure',
                'llm_model'       => 'azure/gpt-4.1-mini',
                'is_default'      => 1,
                'is_active'       => 1,
                'created_at'      => date('Y-m-d H:i:s'),
                'updated_at'      => date('Y-m-d H:i:s'),
            ]);
        }
    }

    public function down()
    {
        $this->forge->dropTable('pitch_agents', true);
        if ($this->db->fieldExists('bolna_agent_id', 'pitch_calls')) {
            $this->forge->dropColumn('pitch_calls', 'bolna_agent_id');
        }
        if ($this->db->fieldExists('agent_id', 'pitch_calls')) {
            $this->forge->dropColumn('pitch_calls', 'agent_id');
        }
    }
}

