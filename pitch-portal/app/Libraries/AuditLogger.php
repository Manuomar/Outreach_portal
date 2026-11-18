<?php

namespace App\Libraries;

/**
 * AuditLogger - Records security, authentication, and transactional events
 * into the pitch_audit_logs database table.
 */
class AuditLogger
{
    public static function log(
        string $action,
        ?string $entityType = null,
        $entityId = null,
        $details = null,
        ?int $userId = null,
        ?string $username = null
    ): void {
        try {
            $db = \Config\Database::connect();
            $request = service('request');

            $ip = $request ? $request->getIPAddress() : null;
            $ua = $request ? substr((string) $request->getUserAgent(), 0, 255) : null;

            if (is_array($details) || is_object($details)) {
                $details = json_encode($details, JSON_UNESCAPED_UNICODE);
            }

            $db->table('pitch_audit_logs')->insert([
                'user_id'     => $userId,
                'username'    => $username,
                'action'      => $action,
                'entity_type' => $entityType,
                'entity_id'   => $entityId !== null ? (string) $entityId : null,
                'details'     => $details,
                'ip_address'  => $ip,
                'user_agent'  => $ua,
                'created_at'  => date('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $e) {
            log_message('error', 'AuditLog failed: ' . $e->getMessage());
        }
    }
}

