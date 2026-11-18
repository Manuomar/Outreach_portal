<?php

namespace App\Controllers;

/**
 * UsersController - Manage portal administrative and team users.
 * All operations require valid authentication. Write operations require admin role.
 */
class UsersController extends ApiController
{
    private const SAFE_COLS = 'id, username, email, name, role, status, last_login_at, created_at, updated_at';

    public function index()
    {
        $this->guard();
        $db = $this->db();
        $users = $db->table('pitch_users')->select(self::SAFE_COLS)->orderBy('id', 'ASC')->get()->getResultArray();
        return $this->respond(['success' => true, 'data' => $users]);
    }

    public function show($id)
    {
        $this->guard();
        $user = $this->db()->table('pitch_users')->select(self::SAFE_COLS)->where('id', (int) $id)->get()->getRowArray();
        if (!$user) {
            return $this->respond(['success' => false, 'error' => 'User not found'], 404);
        }
        return $this->respond(['success' => true, 'data' => $user]);
    }

    public function create()
    {
        $this->requireRole('admin', 'organizer');
        $b = $this->body();
        $username = trim((string) ($b['username'] ?? ''));
        $name = trim((string) ($b['name'] ?? ''));
        $password = (string) ($b['password'] ?? '');
        $email = trim((string) ($b['email'] ?? '')) ?: null;
        $role = strtolower(trim((string) ($b['role'] ?? 'agent')));
        $status = strtolower(trim((string) ($b['status'] ?? 'active')));

        if ($username === '' || $name === '' || $password === '') {
            return $this->respond(['success' => false, 'error' => 'Username, Name, and Password are required'], 422);
        }

        if (strlen($password) < 6) {
            return $this->respond(['success' => false, 'error' => 'Password must be at least 6 characters'], 422);
        }

        $validRoles = ['admin', 'organizer', 'agent', 'viewer'];
        if (!in_array($role, $validRoles, true)) {
            $role = 'agent';
        }

        $validStatuses = ['active', 'inactive', 'suspended'];
        if (!in_array($status, $validStatuses, true)) {
            $status = 'active';
        }

        $db = $this->db();
        // Check uniqueness
        if ($db->table('pitch_users')->where('username', $username)->countAllResults() > 0) {
            return $this->respond(['success' => false, 'error' => 'This username already exists'], 409);
        }
        if ($email && $db->table('pitch_users')->where('email', $email)->countAllResults() > 0) {
            return $this->respond(['success' => false, 'error' => 'This email is already registered'], 409);
        }

        $data = [
            'username' => $username,
            'name' => $name,
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'role' => $role,
            'status' => $status,
        ];

        $db->table('pitch_users')->insert($data);
        $newId = $db->insertID();
        $this->audit('user.create', 'user', $newId, ['username' => $username, 'role' => $role]);

        return $this->respondCreated([
            'success' => true,
            'id' => $newId,
            'message' => 'New user added successfully'
        ]);
    }

    public function update($id)
    {
        $this->requireRole('admin', 'organizer');
        $id = (int) $id;
        $db = $this->db();
        $user = $db->table('pitch_users')->where('id', $id)->get()->getRowArray();
        if (!$user) {
            return $this->respond(['success' => false, 'error' => 'User not found'], 404);
        }

        $b = $this->body();
        $updates = [];

        if (isset($b['name']) && trim((string) $b['name']) !== '') {
            $updates['name'] = trim((string) $b['name']);
        }

        if (array_key_exists('email', $b)) {
            $email = trim((string) $b['email']) ?: null;
            if ($email && $email !== $user['email']) {
                $exists = $db->table('pitch_users')->where('email', $email)->where('id !=', $id)->countAllResults();
                if ($exists > 0) {
                    return $this->respond(['success' => false, 'error' => 'This email is already in use by another user'], 409);
                }
            }
            $updates['email'] = $email;
        }

        if (isset($b['role'])) {
            $role = strtolower(trim((string) $b['role']));
            if (in_array($role, ['admin', 'organizer', 'agent', 'viewer'], true)) {
                $updates['role'] = $role;
            }
        }

        if (isset($b['status'])) {
            $status = strtolower(trim((string) $b['status']));
            if (in_array($status, ['active', 'inactive', 'suspended'], true)) {
                $updates['status'] = $status;
            }
        }

        if (!empty($b['password'])) {
            if (strlen((string) $b['password']) < 6) {
                return $this->respond(['success' => false, 'error' => 'Password must be at least 6 characters'], 422);
            }
            $updates['password_hash'] = password_hash((string) $b['password'], PASSWORD_BCRYPT);
        }

        if (!empty($updates)) {
            $db->table('pitch_users')->where('id', $id)->update($updates);
            $auditPayload = $updates;
            if (isset($auditPayload['password_hash'])) {
                $auditPayload['password_hash'] = '[CHANGED]';
            }
            $this->audit('user.update', 'user', $id, $auditPayload);
        }

        return $this->respond(['success' => true, 'message' => 'User updated successfully']);
    }

    public function delete($id)
    {
        $this->requireRole('admin');
        $id = (int) $id;
        if ($this->currentUser && (int) $this->currentUser['id'] === $id) {
            return $this->respond(['success' => false, 'error' => 'You cannot delete your own user account'], 400);
        }

        $db = $this->db();
        $user = $db->table('pitch_users')->where('id', $id)->get()->getRowArray();
        if (!$user) {
            return $this->respond(['success' => false, 'error' => 'User not found'], 404);
        }

        $db->table('pitch_users')->where('id', $id)->delete();
        $this->audit('user.delete', 'user', $id, ['username' => $user['username']]);
        return $this->respond(['success' => true, 'message' => 'User deleted successfully']);
    }
}

