<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\AuthController;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Authentification du SPA (Sanctum, mode session) : connexion, déconnexion, mot de passe oublié, réinitialisation,
 * protection contre la force brute et comportement CSRF / session. Comptes de test uniquement, mots de passe générés
 * à chaque exécution.
 */
class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private const MSG_ECHEC = 'Identifiant ou mot de passe incorrect.';
    private const MSG_NEUTRE = 'Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.';

    private const ORIGINE_SPA = ['Origin' => 'https://spa.exemple.test'];

    private string $motDePasse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->motDePasse = 'Mdp-'.bin2hex(random_bytes(8));
        // Le SPA appelle l'API depuis son propre domaine : Sanctum active alors la session (domaine déclaré « stateful »).
        config(['sanctum.stateful' => ['spa.exemple.test']]);
    }

    private function utilisateur(string $email = 'ok@exemple.test', array $attributs = []): User
    {
        return User::factory()->create(array_merge(['email' => $email, 'password' => Hash::make($this->motDePasse)], $attributs));
    }

    private function login(string $email, ?string $motDePasse = null)
    {
        // Une seule application PHP sert toute la méthode de test : on remet le garde par défaut, comme pour une requête neuve.
        Auth::shouldUse('web');

        return $this->withHeaders(self::ORIGINE_SPA)->postJson('/api/v1/auth/login', ['email' => $email, 'password' => $motDePasse ?? $this->motDePasse]);
    }

    private function echecs(string $email, int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $this->login($email, 'mauvais-'.$i)->assertStatus(422);
        }
    }

    // ------------------------------------------------------------------ connexion

    public function test_connexion_valide(): void
    {
        $user = $this->utilisateur();

        $reponse = $this->login('ok@exemple.test')->assertOk()
            ->assertJsonPath('user.email', 'ok@exemple.test')
            ->assertJsonStructure(['user', 'permissions']);

        $this->assertAuthenticatedAs($user);
        $this->assertArrayNotHasKey('password', $reponse->json('user'));
        $this->assertArrayNotHasKey('remember_token', $reponse->json('user'));
    }

    public function test_mauvais_mot_de_passe_et_utilisateur_inexistant_donnent_la_meme_reponse(): void
    {
        $this->utilisateur();

        $mauvais = $this->login('ok@exemple.test', 'incorrect')->assertStatus(422)->assertJsonPath('errors.email.0', self::MSG_ECHEC);
        $this->assertGuest();

        $inconnu = $this->login('personne@exemple.test')->assertStatus(422)->assertJsonPath('errors.email.0', self::MSG_ECHEC);
        $this->assertGuest();

        $this->assertSame($mauvais->json(), $inconnu->json(), 'aucune différence qui révélerait l\'existence d\'un compte');
    }

    public function test_champs_obligatoires(): void
    {
        $this->postJson('/api/v1/auth/login', [])->assertStatus(422)->assertJsonValidationErrors(['email', 'password']);
        $this->postJson('/api/v1/auth/login', ['email' => 'ok@exemple.test'])->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->postJson('/api/v1/auth/login', ['email' => ['a'], 'password' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_les_routes_protegees_exigent_la_session(): void
    {
        $this->getJson('/api/v1/auth/me')->assertStatus(401);
        $this->postJson('/api/v1/auth/logout')->assertStatus(401);
    }

    // ------------------------------------------------------------------ force brute

    public function test_les_echecs_sont_acceptes_jusqu_au_seuil_puis_le_compte_est_bloque_en_429(): void
    {
        $this->utilisateur();

        $this->echecs('ok@exemple.test', AuthController::MAX_ECHECS_PAR_COMPTE);

        // Seuil atteint : même le BON mot de passe est refusé tant que la fenêtre court.
        $reponse = $this->login('ok@exemple.test')->assertStatus(429)->assertHeader('Retry-After');
        $this->assertGreaterThan(0, (int) $reponse->headers->get('Retry-After'));
        $this->assertLessThanOrEqual(AuthController::FENETRE_SECONDES, (int) $reponse->headers->get('Retry-After'));
        $this->assertStringContainsString('Trop de tentatives', $reponse->json('message'));
        $this->assertSame($reponse->json('message'), $reponse->json('errors.email.0'));
        $this->assertGuest();
    }

    public function test_apres_expiration_du_blocage_l_utilisateur_legitime_peut_se_reconnecter(): void
    {
        $this->utilisateur();
        $this->echecs('ok@exemple.test', AuthController::MAX_ECHECS_PAR_COMPTE);
        $this->login('ok@exemple.test')->assertStatus(429);

        $this->travel(AuthController::FENETRE_SECONDES + 1)->seconds();

        $this->login('ok@exemple.test')->assertOk();
        $this->assertAuthenticated();
    }

    public function test_un_succes_remet_le_compteur_a_zero(): void
    {
        $this->utilisateur();

        $this->echecs('ok@exemple.test', AuthController::MAX_ECHECS_PAR_COMPTE - 1);
        $this->login('ok@exemple.test')->assertOk();
        $this->withHeaders(self::ORIGINE_SPA)->postJson('/api/v1/auth/logout');

        $this->echecs('ok@exemple.test', AuthController::MAX_ECHECS_PAR_COMPTE - 1);
        $this->login('ok@exemple.test')->assertOk();
    }

    public function test_le_blocage_d_un_compte_ne_bloque_pas_les_autres_comptes_de_la_meme_adresse(): void
    {
        $this->utilisateur();
        $this->utilisateur('autre@exemple.test');

        $this->echecs('ok@exemple.test', AuthController::MAX_ECHECS_PAR_COMPTE);
        $this->login('ok@exemple.test')->assertStatus(429);

        $this->login('autre@exemple.test')->assertOk();
    }

    public function test_la_casse_de_l_identifiant_ne_contourne_pas_le_blocage(): void
    {
        $this->utilisateur();
        $this->echecs('ok@exemple.test', AuthController::MAX_ECHECS_PAR_COMPTE);

        $this->login('OK@Exemple.TEST')->assertStatus(429);
    }

    public function test_une_meme_adresse_qui_essaie_beaucoup_d_identifiants_est_bloquee(): void
    {
        $this->utilisateur();

        for ($i = 0; $i < AuthController::MAX_ECHECS_PAR_IP; $i++) {
            $this->login("inconnu{$i}@exemple.test", 'x')->assertStatus(422);
        }

        $this->login('ok@exemple.test')->assertStatus(429);
    }

    // ------------------------------------------------------------------ déconnexion

    public function test_deconnexion_d_un_utilisateur_connecte(): void
    {
        $this->utilisateur();
        $this->login('ok@exemple.test')->assertOk();

        $this->withHeaders(self::ORIGINE_SPA)->postJson('/api/v1/auth/logout')->assertOk()->assertJsonPath('message', 'Déconnecté.');

        $this->assertGuest('web');
    }

    // ------------------------------------------------------------------ mot de passe oublié

    public function test_mot_de_passe_oublie_pour_un_email_existant(): void
    {
        Notification::fake();
        $user = $this->utilisateur();

        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'ok@exemple.test'])
            ->assertOk()->assertJsonPath('message', self::MSG_NEUTRE);

        Notification::assertSentTo($user, ResetPasswordNotification::class);
        $this->assertSame(1, DB::table('password_resets')->where('email', 'ok@exemple.test')->count(), 'jeton créé en base');
    }

    public function test_mot_de_passe_oublie_pour_un_email_inexistant_donne_la_meme_reponse_sans_rien_creer(): void
    {
        Notification::fake();
        $this->utilisateur();

        $existant = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'ok@exemple.test'])->assertOk();
        $inconnu = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'inconnu@exemple.test'])->assertOk();

        $this->assertSame($existant->json(), $inconnu->json());
        Notification::assertCount(1);
        $this->assertSame(0, DB::table('password_resets')->where('email', 'inconnu@exemple.test')->count());
    }

    public function test_mot_de_passe_oublie_valide_l_email(): void
    {
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'pas-un-email'])->assertStatus(422)->assertJsonValidationErrors(['email']);
        $this->postJson('/api/v1/auth/forgot-password', [])->assertStatus(422);
    }

    public function test_mot_de_passe_oublie_est_limite_en_debit(): void
    {
        Notification::fake();

        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/v1/auth/forgot-password', ['email' => "x{$i}@exemple.test"])->assertOk();
        }

        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'x7@exemple.test'])->assertStatus(429);
    }

    public function test_le_lien_de_reinitialisation_pointe_vers_le_frontend_configure(): void
    {
        config(['app.frontend_url' => 'https://app.exemple.test/']);
        $user = $this->utilisateur();

        $mail = (new ResetPasswordNotification('jeton-de-test'))->toMail($user);

        $this->assertStringStartsWith('https://app.exemple.test/#/reset-password?token=jeton-de-test&email=', $mail->actionUrl);
        $this->assertStringNotContainsString('localhost', $mail->actionUrl);
    }

    // ------------------------------------------------------------------ réinitialisation

    private function reset(array $donnees)
    {
        return $this->postJson('/api/v1/auth/reset-password', $donnees);
    }

    public function test_reinitialisation_avec_un_jeton_valide_puis_connexion_avec_le_nouveau_mot_de_passe(): void
    {
        $user = $this->utilisateur();
        $ancienRemember = $user->remember_token;
        $jeton = Password::createToken($user);
        $nouveau = 'Nouveau-'.bin2hex(random_bytes(8));

        $this->reset(['token' => $jeton, 'email' => 'ok@exemple.test', 'password' => $nouveau, 'password_confirmation' => $nouveau])
            ->assertOk()->assertJsonPath('message', 'Mot de passe réinitialisé avec succès.');

        $this->login('ok@exemple.test', $this->motDePasse)->assertStatus(422);
        $this->login('ok@exemple.test', $nouveau)->assertOk();
        $this->assertNotSame($ancienRemember, $user->fresh()->remember_token);

        // Le jeton est à usage unique.
        $this->reset(['token' => $jeton, 'email' => 'ok@exemple.test', 'password' => $nouveau.'x', 'password_confirmation' => $nouveau.'x'])->assertStatus(422);
    }

    public function test_reinitialisation_refusee_pour_un_jeton_invalide_un_mauvais_email_ou_un_jeton_expire(): void
    {
        $user = $this->utilisateur();
        $this->utilisateur('autre@exemple.test');
        $jeton = Password::createToken($user);
        $nouveau = 'Nouveau-'.bin2hex(random_bytes(8));
        $corps = fn (array $s = []) => array_merge(['token' => $jeton, 'email' => 'ok@exemple.test', 'password' => $nouveau, 'password_confirmation' => $nouveau], $s);

        $this->reset($corps(['token' => 'jeton-bidon']))->assertStatus(422)->assertJsonPath('message', 'Ce lien de réinitialisation est invalide ou a expiré.');
        $this->reset($corps(['email' => 'autre@exemple.test']))->assertStatus(422);
        $this->reset($corps(['email' => 'inconnu@exemple.test']))->assertStatus(422);

        $this->travel(61)->minutes();
        $this->reset($corps())->assertStatus(422)->assertJsonPath('message', 'Ce lien de réinitialisation est invalide ou a expiré.');

        $this->assertTrue(Hash::check($this->motDePasse, $user->fresh()->password), 'le mot de passe n\'a pas changé');
    }

    public function test_reinitialisation_valide_le_nouveau_mot_de_passe(): void
    {
        $user = $this->utilisateur();
        $jeton = Password::createToken($user);

        $this->reset(['token' => $jeton, 'email' => 'ok@exemple.test', 'password' => 'court', 'password_confirmation' => 'court'])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->reset(['token' => $jeton, 'email' => 'ok@exemple.test', 'password' => 'Assez-long-123', 'password_confirmation' => 'Autre-long-123'])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->reset([])->assertStatus(422)->assertJsonValidationErrors(['token', 'email', 'password']);
    }

    // ------------------------------------------------------------------ CSRF / session (SPA Sanctum)

    public function test_le_cookie_csrf_est_delivre_au_frontend_autorise(): void
    {
        $reponse = $this->withHeaders(self::ORIGINE_SPA)->get('/sanctum/csrf-cookie');

        $reponse->assertNoContent();
        $reponse->assertCookie('XSRF-TOKEN');
    }

    public function test_une_requete_du_frontend_autorise_sans_jeton_csrf_est_refusee_en_419(): void
    {
        config(['sanctum.stateful' => ['spa.exemple.test']]);
        $this->utilisateur();
        // Les tests désactivent la vérification CSRF (environnement « testing ») : on la rétablit pour ce test.
        $this->app['env'] = 'local';

        $this->withHeaders(['Origin' => 'https://spa.exemple.test'])
            ->postJson('/api/v1/auth/login', ['email' => 'ok@exemple.test', 'password' => $this->motDePasse])
            ->assertStatus(419);
        $this->assertGuest();
    }

    public function test_connexion_complete_du_spa_avec_cookie_csrf(): void
    {
        config(['sanctum.stateful' => ['spa.exemple.test']]);
        $this->utilisateur();
        $this->app['env'] = 'local';

        $csrf = $this->withHeaders(['Origin' => 'https://spa.exemple.test'])->get('/sanctum/csrf-cookie');
        $cookies = [];
        foreach ($csrf->headers->getCookies() as $cookie) {
            $cookies[$cookie->getName()] = $cookie->getValue();
        }
        $this->assertArrayHasKey('XSRF-TOKEN', $cookies);

        $this->withHeaders(['Origin' => 'https://spa.exemple.test', 'X-XSRF-TOKEN' => $cookies['XSRF-TOKEN']])
            ->withUnencryptedCookies([])
            ->withCookies($cookies)
            ->postJson('/api/v1/auth/login', ['email' => 'ok@exemple.test', 'password' => $this->motDePasse])
            ->assertOk()
            ->assertJsonPath('user.email', 'ok@exemple.test');
    }

    public function test_cookie_de_session_httponly_et_parametres_de_production_configurables(): void
    {
        $this->assertTrue(config('session.http_only'), 'le cookie de session n\'est jamais lisible par JavaScript');
        $this->assertTrue(config('cors.supports_credentials'));
        $this->assertNotContains('*', config('cors.allowed_origins'), 'CORS n\'accepte jamais toutes les origines avec les cookies');
        $this->assertSame(config('app.frontend_url'), config('cors.allowed_origins')[0]);
        $this->assertSame(['name' => 'Administrateur', 'email' => null, 'password' => null], array_merge(
            ['name' => config('app.bootstrap_admin.name')],
            ['email' => config('app.bootstrap_admin.email'), 'password' => config('app.bootstrap_admin.password')]
        ), 'aucun administrateur initial par défaut');
    }
}
