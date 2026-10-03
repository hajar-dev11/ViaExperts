<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    public function run()
    {
        User::firstOrCreate(
            ['email' => 'hajar@viaexpertssarl.com'],
            ['name' => 'Hajar', 'password' => bcrypt('ViaExperts@2026'), 'is_admin' => true]
        )->update(['is_admin' => true]);

        $this->call(PermissionSeeder::class);
    }
}
