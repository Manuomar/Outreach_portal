<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddCallTransferColumnsToPitchCalls extends Migration
{
    public function up(): void
    {
        $fields = [];
        if (!$this->db->fieldExists('transferred_to_number', 'pitch_calls')) {
            $fields['transferred_to_number'] = [
                'type'       => 'VARCHAR',
                'constraint' => 30,
                'null'       => true,
                'default'    => null,
                'after'      => 'who_answered',
            ];
        }
        if (!$this->db->fieldExists('call_transferred', 'pitch_calls')) {
            $fields['call_transferred'] = [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'null'       => true,
                'default'    => null,
                'after'      => 'transferred_to_number',
            ];
        }
        if (!empty($fields)) {
            $this->forge->addColumn('pitch_calls', $fields);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('transferred_to_number', 'pitch_calls')) {
            $this->forge->dropColumn('pitch_calls', 'transferred_to_number');
        }
        if ($this->db->fieldExists('call_transferred', 'pitch_calls')) {
            $this->forge->dropColumn('pitch_calls', 'call_transferred');
        }
    }
}
