<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Migration 13 - Add call_transfer_config column to pitch_agents
 * Stores JSON configuration for Bolna api_tools call transfer
 */
class AddCallTransferConfigToPitchAgents extends Migration
{
    public function up(): void
    {
        $fields = [
            'call_transfer_config' => [
                'type'       => 'TEXT',
                'null'       => true,
                'default'    => null,
                'comment'    => 'JSON configuration for Bolna api_tools call transfer',
                'after'      => 'rag_ids',
            ],
        ];

        if (! $this->db->fieldExists('call_transfer_config', 'pitch_agents')) {
            $this->forge->addColumn('pitch_agents', $fields);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('call_transfer_config', 'pitch_agents')) {
            $this->forge->dropColumn('pitch_agents', 'call_transfer_config');
        }
    }
}
