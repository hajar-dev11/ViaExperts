<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * `php artisan production:verifier` : commande de contrôle en lecture seule, à lancer sur le serveur avec le vrai .env.
 */
class VerificationConfigurationProductionTest extends TestCase
{
    use RefreshDatabase;

    private function productionSaine(): void
    {
        config([
            'app.env' => 'production', 'app.debug' => false, 'app.url' => 'https://api.exemple.com',
            'app.frontend_url' => 'https://app.exemple.com', 'cors.allowed_origins' => ['https://app.exemple.com'],
            'session.secure' => true, 'session.domain' => '.exemple.com', 'session.driver' => 'file', 'sanctum.stateful' => ['app.exemple.com'],
            'mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'smtp.exemple.com', 'mail.from.address' => 'noreply@exemple.com',
            'app.bootstrap_admin' => ['name' => 'Administrateur', 'email' => null, 'password' => null],
        ]);
    }

    /** @return array{0:int,1:string} */
    private function lancer(array $options = ['--sans-base' => true]): array
    {
        $code = Artisan::call('production:verifier', $options);

        return [$code, Artisan::output()];
    }

    private function bloquants(string $sortie): array
    {
        return array_values(array_filter(array_map('trim', explode("\n", $sortie)), fn ($l) => str_starts_with($l, '✗')));
    }

    public function test_une_configuration_de_production_saine_ne_laisse_que_les_points_lies_a_l_environnement_de_test(): void
    {
        $this->productionSaine();

        [, $sortie] = $this->lancer();

        // Seuls restent les contrôles qui dépendent de la machine : dépendances de dev (PHPUnit est installé ici)
        // et lien public/storage (créé par `storage:link`, absent d'un clone neuf).
        foreach ($this->bloquants($sortie) as $ligne) {
            $this->assertMatchesRegularExpression('/Dépendances de développement|public\/storage/u', $ligne, "point bloquant inattendu : {$ligne}");
        }
        $this->assertStringContainsString('✓ APP_ENV = production', $sortie);
        $this->assertStringContainsString('✓ Cookies de session « Secure »', $sortie);
        $this->assertStringContainsString('✓ MAIL_MAILER envoie réellement les emails', $sortie);
    }

    public function test_une_configuration_locale_est_refusee_avec_le_detail_de_chaque_probleme(): void
    {
        config([
            'app.env' => 'local', 'app.debug' => true, 'app.url' => 'http://localhost', 'app.frontend_url' => 'http://localhost:5173/',
            'cors.allowed_origins' => ['http://localhost:5173'], 'session.secure' => false,
            'sanctum.stateful' => ['localhost:5173'], 'mail.default' => 'log',
            'app.bootstrap_admin' => ['name' => 'Admin', 'email' => 'a@exemple.test', 'password' => 'x'],
        ]);

        [$code, $sortie] = $this->lancer();

        $this->assertSame(1, $code);
        foreach (['APP_ENV = production', 'APP_DEBUG = false', 'APP_URL en HTTPS', 'FRONTEND_URL en HTTPS', 'CORS : aucune origine locale', 'Cookies de session « Secure »',
            'SANCTUM_STATEFUL_DOMAINS', 'MAIL_MAILER envoie', 'BOOTSTRAP_ADMIN_* retirés'] as $titre) {
            $this->assertMatchesRegularExpression('/✗ '.preg_quote($titre, '/').'/u', $sortie, "« {$titre} » doit être signalé");
        }
    }

    public function test_une_adresse_ip_ou_un_nom_reserve_n_est_pas_un_domaine_de_production(): void
    {
        $this->productionSaine();

        foreach (['https://192.168.1.10', 'https://203.0.113.5', 'https://api.test', 'https://api.local', 'http://api.exemple.com'] as $url) {
            config(['app.url' => $url]);
            [, $sortie] = $this->lancer();
            $this->assertMatchesRegularExpression('/✗ APP_URL en HTTPS/u', $sortie, "{$url} doit être refusé");
        }
    }

    public function test_la_commande_n_affiche_jamais_de_secret(): void
    {
        $this->productionSaine();
        config(['mail.mailers.smtp.password' => 'MOT-DE-PASSE-SMTP-SECRET', 'mail.mailers.smtp.username' => 'utilisateur-smtp-secret', 'app.key' => 'base64:CLE-APPLICATION-SECRETE']);

        [, $sortie] = $this->lancer();

        foreach (['MOT-DE-PASSE-SMTP-SECRET', 'utilisateur-smtp-secret', 'CLE-APPLICATION-SECRETE'] as $secret) {
            $this->assertStringNotContainsString($secret, $sortie);
        }
    }

    public function test_le_controle_de_la_base_signale_l_absence_d_administrateur_puis_le_valide(): void
    {
        $this->productionSaine();

        [, $sans] = $this->lancer(['--sans-base' => false]);
        $this->assertStringContainsString('✓ Connexion à la base de données', $sans);
        $this->assertStringContainsString('✓ GET_LOCK disponible', $sans);
        $this->assertStringContainsString('✗ Au moins un administrateur existe', $sans);

        User::factory()->create(['is_admin' => true]);
        [, $avec] = $this->lancer(['--sans-base' => false]);
        $this->assertStringContainsString('✓ Au moins un administrateur existe', $avec);
    }

    public function test_la_commande_ne_modifie_rien_en_base(): void
    {
        $this->productionSaine();
        User::factory()->create(['is_admin' => true]);
        $avant = [User::count(), \Illuminate\Support\Facades\DB::table('migrations')->count()];

        $this->lancer(['--sans-base' => false]);

        $this->assertSame($avant, [User::count(), \Illuminate\Support\Facades\DB::table('migrations')->count()]);
    }
}