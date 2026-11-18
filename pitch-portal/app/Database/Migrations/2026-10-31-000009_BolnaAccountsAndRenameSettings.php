<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Migration 9 - Bolna Accounts + rename pitch_settings → agent_settings
 *
 * Creates:
 *   pitch_bolna_accounts  — multi-account API key manager
 *   (renames pitch_settings → agent_settings for clarity)
 *   adds bolna_account_id FK column to pitch_agents
 */
class BolnaAccountsAndRenameSettings extends Migration
{
    public function up(): void
    {
        // 1. Rename pitch_settings → agent_settings
        $this->db->query('RENAME TABLE `pitch_settings` TO `agent_settings`');

        // 2. Create pitch_bolna_accounts
        $this->db->query("
            CREATE TABLE IF NOT EXISTS `pitch_bolna_accounts` (
                `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `label`        VARCHAR(120) NOT NULL                COMMENT 'Friendly name, e.g. Primary Account',
                `api_key`      VARCHAR(255) NOT NULL                COMMENT 'Bolna API key (bn-xxxxx)',
                `base_url`     VARCHAR(255) NOT NULL DEFAULT 'https://api.bolna.ai',
                `is_default`   TINYINT(1)  NOT NULL DEFAULT 0,
                `is_active`    TINYINT(1)  NOT NULL DEFAULT 1,
                `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 3. Seed first account from agent_settings (migrated from config.json)
        $apiKeyRow  = $this->db->table('agent_settings')->where('setting_key', 'bolna_api_key')->get()->getRowArray();
        $baseUrlRow = $this->db->table('agent_settings')->where('setting_key', 'bolna_base_url')->get()->getRowArray();

        $apiKey  = $apiKeyRow  ? $apiKeyRow['setting_value']  : '';
        $baseUrl = $baseUrlRow ? $baseUrlRow['setting_value'] : 'https://api.bolna.ai';

        if ($apiKey !== '') {
            $now = date('Y-m-d H:i:s');
            $this->db->table('pitch_bolna_accounts')->insert([
                'label'      => 'Primary Account',
                'api_key'    => $apiKey,
                'base_url'   => $baseUrl ?: 'https://api.bolna.ai',
                'is_default' => 1,
                'is_active'  => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // 4. Add bolna_account_id column to pitch_agents
        $this->db->query('
            ALTER TABLE `pitch_agents`
            ADD COLUMN `bolna_account_id` INT UNSIGNED NULL DEFAULT NULL
                COMMENT "FK to pitch_bolna_accounts" AFTER `bolna_agent_id`
        ');

        // 5. Set default account on all existing agents
        $defaultAcct = $this->db->table('pitch_bolna_accounts')->where('is_default', 1)->get()->getRowArray();
        if ($defaultAcct) {
            $this->db->table('pitch_agents')->update(['bolna_account_id' => $defaultAcct['id']]);
        }
    }

    public function down(): void
    {
        $this->db->query('ALTER TABLE `pitch_agents` DROP COLUMN IF EXISTS `bolna_account_id`');
        $this->db->query('DROP TABLE IF EXISTS `pitch_bolna_accounts`');
        $this->db->query('RENAME TABLE `agent_settings` TO `pitch_settings`');
    }
}

