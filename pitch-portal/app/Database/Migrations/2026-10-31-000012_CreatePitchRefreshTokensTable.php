<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchRefreshTokensTable extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'          => ['type' => 'INT', 'auto_increment' => true],
            'user_id'     => ['type' => 'INT', 'null' => false],
            'token_hash'  => ['type' => 'VARCHAR', 'constraint' => 64, 'null' => false],
            'expires_at'  => ['type' => 'DATETIME', 'null' => false],
            'revoked_at'  => ['type' => 'DATETIME', 'null' => true],
            'created_at'  => ['type' => 'DATETIME', 'null' => false],
            'user_agent'  => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'ip_address'  => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('token_hash');
        $this->forge->addKey('user_id');
        $this->forge->createTable('pitch_refresh_tokens', true);
    }

    public function down(): void
    {
        $this->forge->dropTable('pitch_refresh_tokens', true);
    }
}

