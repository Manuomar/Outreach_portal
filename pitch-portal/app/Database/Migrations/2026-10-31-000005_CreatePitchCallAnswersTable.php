<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchCallAnswersTable extends Migration
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
            'question_key' => [
                'type'       => 'VARCHAR',
                'constraint' => 80,
            ],
            'response_value' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'confidence_score' => [
                'type'       => 'DECIMAL',
                'constraint' => '4,2',
                'default'    => 1.00,
            ],
        ]);

        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['call_id', 'question_key'], 'uq_call_key');
        $this->forge->addForeignKey('call_id', 'pitch_calls', 'id', 'CASCADE', 'CASCADE', 'fk_ans_call');
        $this->forge->createTable('pitch_call_answers', true);
    }

    public function down()
    {
        $this->forge->dropTable('pitch_call_answers', true);
    }
}

