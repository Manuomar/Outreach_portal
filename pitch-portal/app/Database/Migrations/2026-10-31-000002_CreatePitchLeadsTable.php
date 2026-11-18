<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchLeadsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'INT',
                'auto_increment' => true,
            ],
            'contact_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 150,
            ],
            'phone' => [
                'type'       => 'VARCHAR',
                'constraint' => 15,
                'unique'     => true,
            ],
            'organization' => [
                'type'       => 'VARCHAR',
                'constraint' => 200,
                'null'       => true,
            ],
            'designation' => [
                'type'       => 'VARCHAR',
                'constraint' => 120,
                'null'       => true,
            ],
            'sector' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
                'null'       => true,
            ],
            'state' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
                'null'       => true,
            ],
            'district' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
                'null'       => true,
            ],
            'notes' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'lead_status' => [
                'type'       => 'ENUM',
                'constraint' => ['new', 'contacted', 'interested', 'not_interested', 'callback', 'meeting_scheduled'],
                'default'    => 'new',
            ],
            'created_at datetime default current_timestamp',
            'updated_at datetime default current_timestamp on update current_timestamp',
        ]);

        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('lead_status', false, false, 'idx_status');
        $this->forge->createTable('pitch_leads', true);
    }

    public function down()
    {
        $this->forge->dropTable('pitch_leads', true);
    }
}

