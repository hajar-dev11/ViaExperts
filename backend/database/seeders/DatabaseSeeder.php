<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;

class DatabaseSeeder extends Seeder
{
    /** Longueur minimale du mot de passe de l'administrateur initial. */
    public const LONGUEUR_MINIMALE = 12;

    /**
     * Seed the application's database.
     *
     * Aucun identifiant ni mot de passe n'est écrit dans le code : le compte administrateur
     * initial n'est créé que si BOOTSTRAP_ADMIN_EMAIL et BOOTSTRAP_ADMIN_PASSWORD sont définis
     * (lus via config/app.php), puis ces variables doivent être retirées du `.env`.
     *
     * @return void
     */
    public function run()
    {
        $this->creerAdministrateurInitial();

        $this->call(PermissionSeeder::class);
    }

    private function creerAdministrateurInitial(): void
    {
        $config = config('app.bootstrap_admin');
        $email = trim((string) ($config['email'] ?? ''));
        $motDePasse = (string) ($config['password'] ?? '');

        if ($email === '' && $motDePasse === '') {
            $this->command?->warn('Aucun administrateur créé : BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD non définis.');

            return;
        }

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('BOOTSTRAP_ADMIN_EMAIL est absent ou invalide.');
        }

        if (mb_strlen($motDePasse) < self::LONGUEUR_MINIMALE) {
            throw new InvalidArgumentException('BOOTSTRAP_ADMIN_PASSWORD doit comporter au moins '.self::LONGUEUR_MINIMALE.' caractères.');
        }

        // Même comportement qu'avant : compte existant conservé tel quel (mot de passe inchangé), simplement promu administrateur.
        User::firstOrCreate(
            ['email' => $email],
            ['name' => trim((string) ($config['name'] ?? '')) ?: 'Administrateur', 'password' => Hash::make($motDePasse), 'is_admin' => true]
        )->update(['is_admin' => true]);

        $this->command?->info('Administrateur initial prêt. Retirez BOOTSTRAP_ADMIN_* du .env.');
    }
}
