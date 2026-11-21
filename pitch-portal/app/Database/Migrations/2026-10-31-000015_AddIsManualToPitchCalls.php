<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddIsManualToPitchCalls extends Migration
{
    public function up(): void
    {
        if (!$this->db->fieldExists('is_manual', 'pitch_calls')) {
            $this->forge->addColumn('pitch_calls', [
                'is_manual' => [
                    'type'       => 'TINYINT',
                    'constraint' => 1,
                    'null'       => false,
                    'default'    => 0,
                    'after'      => 'call_status',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('is_manual', 'pitch_calls')) {
            $this->forge->dropColumn('pitch_calls', 'is_manual');
        }
    }
}
