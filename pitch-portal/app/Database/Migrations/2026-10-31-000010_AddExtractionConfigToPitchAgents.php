<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Migration 10 - Add extraction_config column to pitch_agents
 * Stores JSON configuration of standard & custom fields to extract during calls
 */
class AddExtractionConfigToPitchAgents extends Migration
{
    public function up(): void
    {
        $fields = [
            'extraction_config' => [
                'type'       => 'LONGTEXT',
                'null'       => true,
                'default'    => null,
                'comment'    => 'JSON array/object of fields to extract during calls',
                'after'      => 'knowledge_base',
            ],
        ];

        if (! $this->db->fieldExists('extraction_config', 'pitch_agents')) {
            $this->forge->addColumn('pitch_agents', $fields);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('extraction_config', 'pitch_agents')) {
            $this->forge->dropColumn('pitch_agents', 'extraction_config');
        }
    }
}

