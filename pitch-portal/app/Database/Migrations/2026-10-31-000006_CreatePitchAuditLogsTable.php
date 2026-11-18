<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchAuditLogsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'BIGINT',
                'unsigned'       => true,
                'auto_increment' => true,
            ],
            'user_id' => [
                'type' => 'INT',
                'null' => true,
            ],
            'username' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
                'null'       => true,
            ],
            'action' => [
                'type'       => 'VARCHAR',
                'constraint' => 100,
            ],
            'entity_type' => [
                'type'       => 'VARCHAR',
                'constraint' => 60,
                'null'       => true,
            ],
            'entity_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
                'null'       => true,
            ],
            'details' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'ip_address' => [
                'type'       => 'VARCHAR',
                'constraint' => 45,
                'null'       => true,
            ],
            'user_agent' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
            ],
            'created_at datetime default current_timestamp',
        ]);

        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('user_id', false, false, 'idx_log_user');
        $this->forge->addKey('action', false, false, 'idx_log_action');
        $this->forge->addKey('entity_type', false, false, 'idx_log_entity');
        $this->forge->addKey('created_at', false, false, 'idx_log_created');
        $this->forge->createTable('pitch_audit_logs', true);
    }

    public function down()
    {
        $this->forge->dropTable('pitch_audit_logs', true);
    }
}

