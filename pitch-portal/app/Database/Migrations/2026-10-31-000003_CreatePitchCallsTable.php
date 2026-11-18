<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchCallsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'INT',
                'auto_increment' => true,
            ],
            'lead_id' => [
                'type' => 'INT',
            ],
            'bolna_execution_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 100,
                'null'       => true,
            ],
            'call_status' => [
                'type'       => 'ENUM',
                'constraint' => ['queued', 'ringing', 'in_progress', 'completed', 'busy', 'no_answer', 'failed'],
                'default'    => 'queued',
            ],
            'interest_status' => [
                'type'       => 'ENUM',
                'constraint' => ['interested', 'maybe', 'callback_requested', 'not_interested', 'not_reachable', 'unknown'],
                'null'       => true,
            ],
            'interest_reason' => [
                'type'       => 'VARCHAR',
                'constraint' => 500,
                'null'       => true,
            ],
            'who_answered' => [
                'type'       => 'VARCHAR',
                'constraint' => 40,
                'null'       => true,
            ],
            'it_head_call_agreed' => [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'null'       => true,
            ],
            'it_head_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 150,
                'null'       => true,
            ],
            'it_head_phone' => [
                'type'       => 'VARCHAR',
                'constraint' => 20,
                'null'       => true,
            ],
            'it_head_call_date' => [
                'type' => 'DATE',
                'null' => true,
            ],
            'it_head_call_time' => [
                'type' => 'TIME',
                'null' => true,
            ],
            'it_head_call_raw' => [
                'type'       => 'VARCHAR',
                'constraint' => 300,
                'null'       => true,
            ],
            'dialect_detected' => [
                'type'       => 'VARCHAR',
                'constraint' => 60,
                'null'       => true,
            ],
            'summary' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'next_action' => [
                'type'       => 'VARCHAR',
                'constraint' => 300,
                'null'       => true,
            ],
            'transcript' => [
                'type' => 'MEDIUMTEXT',
                'null' => true,
            ],
            'recording_url' => [
                'type'       => 'VARCHAR',
                'constraint' => 500,
                'null'       => true,
            ],
            'duration_sec' => [
                'type' => 'INT',
                'null' => true,
            ],
            'analysis_json' => [
                'type' => 'LONGTEXT',
                'null' => true,
            ],
            'started_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'end_time' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'created_at datetime default current_timestamp',
        ]);

        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('lead_id', false, false, 'idx_lead');
        $this->forge->addKey('bolna_execution_id', false, false, 'idx_exec');
        $this->forge->addKey('it_head_call_date', false, false, 'idx_meeting');
        $this->forge->addForeignKey('lead_id', 'pitch_leads', 'id', 'CASCADE', 'CASCADE', 'fk_call_lead');
        $this->forge->createTable('pitch_calls', true);
    }

    public function down()
    {
        $this->forge->dropTable('pitch_calls', true);
    }
}

