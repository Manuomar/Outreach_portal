<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

class AdminUserSeeder extends Seeder
{
    public function run()
    {
        $db = $this->db;
        $username = 'admin';

        $exists = $db->table('pitch_users')->where('username', $username)->get()->getRowArray();
        $userData = [
            'username'      => $username,
            'email'         => 'admin@iti-ccims.gov.in',
            'name'          => 'Admin Organizer',
            'role'          => 'admin',
            'status'        => 'active',
            'password_hash' => password_hash('Admin@123', PASSWORD_BCRYPT),
        ];

        if ($exists) {
            $db->table('pitch_users')->where('username', $username)->update($userData);
        } else {
            $db->table('pitch_users')->insert($userData);
        }
    }
}
