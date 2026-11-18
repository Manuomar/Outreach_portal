<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchCallTurnsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'INT',
                'auto_increment' => true,
            ],
            'call_id' => [
                'type' => 'INT',
            ],
            'idx' => [
                'type'    => 'INT',
                'default' => 0,
            ],
            'speaker' => [
                'type'       => 'ENUM',
                'constraint' => ['agent', 'prospect'],
            ],
            'text' => [
                'type' => 'TEXT',
            ],
        ]);

        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('call_id', false, false, 'idx_call');
        $this->forge->addForeignKey('call_id', 'pitch_calls', 'id', 'CASCADE', 'CASCADE', 'fk_turn_call');
        $this->forge->createTable('pitch_call_turns', true);
    }

    public function down()
    {
        $this->forge->dropTable('pitch_call_turns', true);
    }
}

