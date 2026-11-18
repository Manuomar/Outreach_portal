<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchUsersTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'INT',
                'auto_increment' => true,
            ],
            'username' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
                'unique'     => true,
            ],
            'email' => [
                'type'       => 'VARCHAR',
                'constraint' => 150,
                'null'       => true,
                'unique'     => true,
            ],
            'password_hash' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
            ],
            'name' => [
                'type'       => 'VARCHAR',
                'constraint' => 120,
            ],
            'role' => [
                'type'       => 'ENUM',
                'constraint' => ['admin', 'organizer', 'agent', 'viewer'],
                'default'    => 'agent',
            ],
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['active', 'inactive', 'suspended'],
                'default'    => 'active',
            ],
            'last_login_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'created_at datetime default current_timestamp',
            'updated_at datetime default current_timestamp on update current_timestamp',
        ]);

        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('role', false, false, 'idx_role');
        $this->forge->addKey('status', false, false, 'idx_status');
        $this->forge->createTable('pitch_users', true);

        // Seed default admin if user does not exist
        $db = \Config\Database::connect();
        if ($db->table('pitch_users')->where('username', 'admin')->countAllResults() === 0) {
            $db->table('pitch_users')->insert([
                'username'      => 'admin',
                'email'         => 'admin@iti-ccims.gov.in',
                'password_hash' => password_hash('Admin@123', PASSWORD_BCRYPT),
                'name'          => 'Admin Organizer',
                'role'          => 'admin',
                'status'        => 'active',
            ]);
        }
    }

    public function down()
    {
        $this->forge->dropTable('pitch_users', true);
    }
}

