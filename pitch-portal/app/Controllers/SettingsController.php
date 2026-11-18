<?php

namespace App\Controllers;

/**
 * SettingsController
 * Manages portal-wide key-value settings:
 *   - Bolna API key & base URL (bolna_api_key, bolna_base_url)
 *   - Other future config pairs
 *
 * Routes:
 *   GET    /api/settings          → index()   (list all settings)
 *   POST   /api/settings          → save()    (upsert one or many key-value pairs)
 *   DELETE /api/settings/(:key)   → remove()  (reset a key)
 */
class SettingsController extends ApiController
{
    // Keys that contain sensitive values — masked in GET responses
    private const SENSITIVE_KEYS = ['bolna_api_key'];

    /** Return all stored settings (sensitive values masked) */
    public function index()
    {
        $this->guard();
        $rows = $this->db()->table('agent_settings')->get()->getResultArray();

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'key'        => $row['setting_key'],
                'value'      => in_array($row['setting_key'], self::SENSITIVE_KEYS, true)
                                    ? $this->maskSecret($row['setting_value'])
                                    : $row['setting_value'],
                'raw_length' => strlen((string) $row['setting_value']),
                'updated_at' => $row['updated_at'],
            ];
        }

        return $this->respond(['success' => true, 'data' => $out]);
    }

    /**
     * Upsert one or many settings.
     * Accepts:   { "key": "bolna_api_key", "value": "bn-xxxx" }
     *        OR  { "settings": { "bolna_api_key": "bn-xxxx", "bolna_base_url": "https://..." } }
     */
    public function save()
    {
        $this->guard();
        $b = $this->body();

        $pairs = [];

        if (isset($b['key'], $b['value'])) {
            // Single key-value
            $pairs[(string) $b['key']] = (string) $b['value'];
        } elseif (isset($b['settings']) && is_array($b['settings'])) {
            // Batch update
            foreach ($b['settings'] as $k => $v) {
                $pairs[(string) $k] = (string) $v;
            }
        } else {
            return $this->respond(['success' => false, 'error' => 'Provide either {key, value} or {settings: {…}}'], 422);
        }

        $db  = $this->db();
        $now = date('Y-m-d H:i:s');

        foreach ($pairs as $key => $value) {
            $exists = $db->table('agent_settings')->where('setting_key', $key)->countAllResults();
            if ($exists) {
                $db->table('agent_settings')
                   ->where('setting_key', $key)
                   ->update(['setting_value' => $value, 'updated_at' => $now]);
            } else {
                $db->table('agent_settings')->insert([
                    'setting_key'   => $key,
                    'setting_value' => $value,
                    'created_at'    => $now,
                    'updated_at'    => $now,
                ]);
            }
        }

        // If bolna_api_key or bolna_base_url changed, also update config.json for backward compatibility
        if (isset($pairs['bolna_api_key']) || isset($pairs['bolna_base_url'])) {
            $this->syncConfigJson();
        }

        return $this->respond(['success' => true, 'message' => 'Settings saved successfully.']);
    }

    /** Reset / clear a setting key */
    public function remove($key)
    {
        $this->guard();
        $this->db()->table('agent_settings')->where('setting_key', $key)->delete();
        return $this->respond(['success' => true, 'message' => "Setting '{$key}' removed."]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** Return the stored value for a key, or $default if not found */
    public static function get(string $key, string $default = ''): string
    {
        $db  = \Config\Database::connect();
        $row = $db->table('agent_settings')->where('setting_key', $key)->get()->getRowArray();
        return $row ? (string) $row['setting_value'] : $default;
    }

    /** Mask all but the first 6 and last 4 characters */
    private function maskSecret(?string $value): string
    {
        if (empty($value)) {
            return '';
        }
        $len = strlen($value);
        if ($len <= 12) {
            return str_repeat('*', $len);
        }
        return substr($value, 0, 6) . str_repeat('*', $len - 10) . substr($value, -4);
    }

    /**
     * Sync DB settings back into config.json so Python CLI keeps working
     * without changes.
     */
    private function syncConfigJson(): void
    {
        $cfgFile = rtrim(ROOTPATH, '/\\') . DIRECTORY_SEPARATOR . 'ai_pipeline' . DIRECTORY_SEPARATOR . 'config.json';
        if (!file_exists($cfgFile) || !is_writable($cfgFile)) {
            return;
        }

        $json = json_decode(file_get_contents($cfgFile), true);
        if (!is_array($json)) {
            return;
        }

        $apiKey  = self::get('bolna_api_key');
        $baseUrl = self::get('bolna_base_url');

        if ($apiKey !== '') {
            $json['bolna']['api_key'] = $apiKey;
        }
        if ($baseUrl !== '') {
            $json['bolna']['base_url'] = $baseUrl;
        }

        file_put_contents($cfgFile, json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
}

