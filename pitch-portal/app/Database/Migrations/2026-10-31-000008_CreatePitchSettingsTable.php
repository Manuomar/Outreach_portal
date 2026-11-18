<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePitchSettingsTable extends Migration
{
    public function up(): void
    {
        $this->db->query("
            CREATE TABLE IF NOT EXISTS `pitch_settings` (
                `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `setting_key`   VARCHAR(100) NOT NULL,
                `setting_value` TEXT         NOT NULL DEFAULT '',
                `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_setting_key` (`setting_key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Seed with current config.json values if present
        $cfgFile = rtrim(ROOTPATH, '/\\') . DIRECTORY_SEPARATOR . 'ai_pipeline' . DIRECTORY_SEPARATOR . 'config.json';
        if (file_exists($cfgFile)) {
            $cfg = json_decode(file_get_contents($cfgFile), true);
            $apiKey  = $cfg['bolna']['api_key']  ?? '';
            $baseUrl = $cfg['bolna']['base_url']  ?? 'https://api.bolna.ai';
            $now = date('Y-m-d H:i:s');

            if ($apiKey !== '') {
                $this->db->query(
                    "INSERT IGNORE INTO `pitch_settings` (`setting_key`, `setting_value`, `created_at`, `updated_at`)
                     VALUES ('bolna_api_key', ?, ?, ?)",
                    [$apiKey, $now, $now]
                );
            }
            if ($baseUrl !== '') {
                $this->db->query(
                    "INSERT IGNORE INTO `pitch_settings` (`setting_key`, `setting_value`, `created_at`, `updated_at`)
                     VALUES ('bolna_base_url', ?, ?, ?)",
                    [$baseUrl, $now, $now]
                );
            }
        }
    }

    public function down(): void
    {
        $this->db->query('DROP TABLE IF EXISTS `pitch_settings`');
    }
}

