<?php

namespace App\Controllers;

class AuthController extends ApiController
{
    public function login()
    {
        $b = $this->body();
        $usernameOrEmail = trim((string) ($b['username'] ?? ''));
        $password = (string) ($b['password'] ?? '');

        if ($usernameOrEmail === '' || $password === '') {
            return $this->respond(['success' => false, 'error' => 'Username and password are both required'], 422);
        }

        $db = $this->db();
        // 1. Look up user in pitch_users table
        $user = $db->table('pitch_users')
            ->where('username', $usernameOrEmail)
            ->orWhere('email', $usernameOrEmail)
            ->get()->getRowArray();

        $authenticated = false;
        if ($user) {
            if ($user['status'] !== 'active') {
                return $this->respond(['success' => false, 'error' => 'This account is not active. Please contact an administrator.'], 403);
            }
            if (password_verify($password, $user['password_hash'])) {
                $authenticated = true;
            }
        }

        // 2. Fallback to .env admin credentials (for disaster recovery or backward compatibility)
        if (!$authenticated && hash_equals((string) env('portal.adminUser', 'admin'), $usernameOrEmail)
            && hash_equals((string) env('portal.adminPass', 'Admin@123'), $password)) {
            $authenticated = true;
            $user = [
                'id' => 1,
                'username' => 'admin',
                'name' => 'Admin Organizer',
                'email' => 'admin@iti-ccims.gov.in',
                'role' => 'admin',
                'status' => 'active'
            ];
        }

        if (!$authenticated || !$user) {
            \App\Libraries\AuditLogger::log('auth.failed', 'user', null, ['attempted_username' => $usernameOrEmail]);
            return $this->respond(['success' => false, 'error' => 'Invalid username or password'], 401);
        }

        // Update last_login_at
        if (!empty($user['id'])) {
            $db->table('pitch_users')->where('id', (int) $user['id'])->update(['last_login_at' => date('Y-m-d H:i:s')]);
        }

        \App\Libraries\AuditLogger::log('auth.login', 'user', $user['id'], 'Login successful', (int) $user['id'], $user['username']);

        // Generate Access Token (1 day expiry or 7 days)
        $tokenPayload = [
            'uid'  => (int) $user['id'],
            'u'    => $user['username'],
            'role' => $user['role'],
            'name' => $user['name']
        ];
        $token = self::makeToken($user['username'], $tokenPayload);

        // Generate Secure 64-char Refresh Token and store hash in pitch_refresh_tokens (30 days expiry)
        $rawRefreshToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawRefreshToken);
        $expiresAt = date('Y-m-d H:i:s', time() + (30 * 86400));

        $db->table('pitch_refresh_tokens')->insert([
            'user_id'    => (int) $user['id'],
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'created_at' => date('Y-m-d H:i:s'),
            'user_agent' => substr((string) ($this->request->getUserAgent() ? $this->request->getUserAgent()->getAgentString() : ''), 0, 255),
            'ip_address' => $this->request->getIPAddress(),
        ]);

        return $this->respond([
            'success'       => true,
            'token'         => $token,
            'refresh_token' => $rawRefreshToken,
            'user'          => [
                'id'       => (int) $user['id'],
                'username' => $user['username'],
                'name'     => $user['name'],
                'email'    => $user['email'] ?? null,
                'role'     => $user['role'],
                'status'   => $user['status'] ?? 'active'
            ]
        ]);
    }

    /**
     * Refresh access token using a valid refresh token from pitch_refresh_tokens
     */
    public function refresh()
    {
        $b = $this->body();
        $rawRefreshToken = trim((string) ($b['refresh_token'] ?? ''));

        if ($rawRefreshToken === '') {
            return $this->respond(['success' => false, 'error' => 'Refresh token is required'], 400);
        }

        $tokenHash = hash('sha256', $rawRefreshToken);
        $db = $this->db();

        $record = $db->table('pitch_refresh_tokens')
            ->where('token_hash', $tokenHash)
            ->where('revoked_at IS NULL', null, false)
            ->where('expires_at >', date('Y-m-d H:i:s'))
            ->get()->getRowArray();

        if (!$record) {
            return $this->respond(['success' => false, 'error' => 'Invalid or expired session. Please login again.'], 401);
        }

        // Verify user exists and is active
        $user = $db->table('pitch_users')->where('id', (int) $record['user_id'])->get()->getRowArray();
        if (!$user && (int) $record['user_id'] === 1) {
            $user = [
                'id' => 1,
                'username' => 'admin',
                'name' => 'Admin Organizer',
                'email' => 'admin@iti-ccims.gov.in',
                'role' => 'admin',
                'status' => 'active'
            ];
        }

        if (!$user || ($user['status'] ?? 'active') !== 'active') {
            return $this->respond(['success' => false, 'error' => 'User account is no longer active'], 403);
        }

        // Token Rotation: revoke used refresh token and issue a fresh one
        $newRawRefreshToken = bin2hex(random_bytes(32));
        $newTokenHash = hash('sha256', $newRawRefreshToken);
        $newExpiresAt = date('Y-m-d H:i:s', time() + (30 * 86400));

        $db->table('pitch_refresh_tokens')->where('id', (int) $record['id'])->update([
            'revoked_at' => date('Y-m-d H:i:s')
        ]);

        $db->table('pitch_refresh_tokens')->insert([
            'user_id'    => (int) $user['id'],
            'token_hash' => $newTokenHash,
            'expires_at' => $newExpiresAt,
            'created_at' => date('Y-m-d H:i:s'),
            'user_agent' => substr((string) ($this->request->getUserAgent() ? $this->request->getUserAgent()->getAgentString() : ''), 0, 255),
            'ip_address' => $this->request->getIPAddress(),
        ]);

        $tokenPayload = [
            'uid'  => (int) $user['id'],
            'u'    => $user['username'],
            'role' => $user['role'],
            'name' => $user['name']
        ];
        $newToken = self::makeToken($user['username'], $tokenPayload);

        return $this->respond([
            'success'       => true,
            'token'         => $newToken,
            'refresh_token' => $newRawRefreshToken,
            'user'          => [
                'id'       => (int) $user['id'],
                'username' => $user['username'],
                'name'     => $user['name'],
                'email'    => $user['email'] ?? null,
                'role'     => $user['role'],
                'status'   => $user['status'] ?? 'active'
            ]
        ]);
    }

    /**
     * Revoke refresh token on logout
     */
    public function logout()
    {
        $b = $this->body();
        $rawRefreshToken = trim((string) ($b['refresh_token'] ?? ''));

        if ($rawRefreshToken !== '') {
            $tokenHash = hash('sha256', $rawRefreshToken);
            $this->db()->table('pitch_refresh_tokens')
                ->where('token_hash', $tokenHash)
                ->update(['revoked_at' => date('Y-m-d H:i:s')]);
        }

        return $this->respond(['success' => true, 'message' => 'Logged out successfully']);
    }

    public function me()
    {
        $this->guard();
        return $this->respond([
            'success' => true,
            'user' => $this->currentUser
        ]);
    }
}
