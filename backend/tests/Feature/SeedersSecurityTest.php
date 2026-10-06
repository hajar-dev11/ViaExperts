<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

/**
 * Sécurité des seeders : aucun identifiant ni mot de passe écrit dans le code, administrateur initial
 * créé uniquement depuis l'environnement, jeu de démonstration interdit en production.
 */
class SeedersSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function configurer(?string $email, ?string $motDePasse): void
    {
        config(['app.bootstrap_admin' => ['name' => 'Admin Test', 'email' => $email, 'password' => $motDePasse]]);
    }

    public function test_sans_variables_aucun_administrateur_n_est_cree_mais_les_permissions_le_sont(): void
    {
        $this->configurer(null, null);

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(0, User::count());
        $this->assertGreaterThan(0, \App\Models\Permission::count());
    }

    public function test_avec_variables_l_administrateur_est_cree_avec_un_mot_de_passe_hache(): void
    {
        $motDePasse = 'test-'.bin2hex(random_bytes(8));
        $this->configurer('premier-admin@exemple.test', $motDePasse);

        $this->seed(DatabaseSeeder::class);

        $admin = User::where('email', 'premier-admin@exemple.test')->firstOrFail();
        $this->assertTrue($admin->is_admin);
        $this->assertNotSame($motDePasse, $admin->password);
        $this->assertTrue(Hash::check($motDePasse, $admin->password));
    }

    public function test_rejouer_le_seeder_ne_change_pas_le_mot_de_passe_d_un_compte_existant(): void
    {
        $existant = User::factory()->create(['email' => 'premier-admin@exemple.test', 'is_admin' => false]);
        $ancienHash = $existant->password;
        $this->configurer('premier-admin@exemple.test', 'autre-'.bin2hex(random_bytes(8)));

        $this->seed(DatabaseSeeder::class);

        $existant->refresh();
        $this->assertSame($ancienHash, $existant->password);
        $this->assertTrue($existant->is_admin);
        $this->assertSame(1, User::count());
    }

    public function test_mot_de_passe_trop_court_ou_email_invalide_est_refuse(): void
    {
        $this->configurer('premier-admin@exemple.test', 'court');
        try {
            $this->seed(DatabaseSeeder::class);
            $this->fail('Un mot de passe trop court doit être refusé.');
        } catch (InvalidArgumentException $e) {
            $this->assertSame(0, User::count());
        }

        $this->configurer('pas-un-email', 'test-'.bin2hex(random_bytes(8)));
        $this->expectException(InvalidArgumentException::class);
        $this->seed(DatabaseSeeder::class);
    }

    public function test_le_seeder_de_demonstration_est_interdit_en_production(): void
    {
        $this->app['env'] = 'production';

        $this->expectException(RuntimeException::class);
        (new DemoDataSeeder())->run();
    }

    public function test_aucun_seeder_ne_contient_de_mot_de_passe_ecrit_en_dur(): void
    {
        foreach (glob(database_path('seeders/*.php')) as $fichier) {
            $source = file_get_contents($fichier);
            $this->assertDoesNotMatchRegularExpression(
                '/(bcrypt|Hash::make)\(\s*[\'"][^\'"]+[\'"]\s*\)/',
                $source,
                basename($fichier).' hache un mot de passe littéral.'
            );
            $this->assertDoesNotMatchRegularExpression(
                '/[\'"]password[\'"]\s*=>\s*[\'"][^\'"]+[\'"]/',
                $source,
                basename($fichier).' contient un mot de passe littéral.'
            );
            $this->assertStringNotContainsString('MOT_DE_PASSE_DEMO', $source, basename($fichier));
        }
    }
}
