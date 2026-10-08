<?php

namespace Tests\Feature;

use App\Models\User;
use App\Rules\MotDePasseFort;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Politique de mot de passe (>= 12 caractères, lettre + chiffre), invalidation des sessions après un changement de
 * mot de passe (profil, administrateur, réinitialisation) et changement d'email protégé par le mot de passe actuel.
 * Comptes de test uniquement, mots de passe générés à chaque exécution.
 */
class MotDePasseEtSessionsTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGINE_SPA = ['Origin' => 'https://spa.exemple.test'];

    private string $motDePasse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->motDePasse = 'Actuel-'.bin2hex(random_bytes(6)).'7';
        config(['sanctum.stateful' => ['spa.exemple.test']]);
    }

    private function nouveauMotDePasse(): string
    {
        return 'Nouveau-'.bin2hex(random_bytes(6)).'9';
    }

    private function utilisateur(string $email = 'ok@exemple.test', array $attributs = []): User
    {
        return User::factory()->create(array_merge(['email' => $email, 'password' => Hash::make($this->motDePasse)], $attributs));
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true, 'email' => 'admin@exemple.test']);
    }

    /**
     * Simule « un autre navigateur » : une seule application PHP sert tout le test, donc on vide l'état gardé en mémoire
     * (garde d'authentification, attributs de session, cookies) et, si on la donne, on présente le cookie de session
     * `$idSession`. Sans `withCredentials()` les requêtes JSON n'envoient AUCUN cookie.
     */
    private function navigateur(?string $idSession = null): void
    {
        $this->defaultCookies = [];
        $this->withCredentials = false;
        Auth::forgetGuards();
        Auth::shouldUse('web');
        session()->flush();

        if ($idSession !== null) {
            $this->withCredentials()->withCookie(config('session.cookie'), $idSession);
        }
    }

    /** Connexion « réelle » : renvoie l'identifiant de la session créée (cookie de session de ce « navigateur »). */
    private function seConnecter(string $email, ?string $motDePasse = null): string
    {
        $this->navigateur();

        $this->withHeaders(self::ORIGINE_SPA)
            ->postJson('/api/v1/auth/login', ['email' => $email, 'password' => $motDePasse ?? $this->motDePasse])
            ->assertOk();

        return session()->getId();
    }

    /** Appelle /auth/me avec le cookie d'une session précise, comme un autre navigateur. */
    private function meAvecSession(string $idSession)
    {
        $this->navigateur($idSession);

        return $this->withHeaders(self::ORIGINE_SPA)->getJson('/api/v1/auth/me');
    }

    // ------------------------------------------------------------------ politique de mot de passe

    public function test_la_regle_refuse_les_mots_de_passe_faibles_et_accepte_les_robustes(): void
    {
        $refuses = ['abcdefgh', 'abcdefghij1', 'abcdefghijklmn', '123456789012', 'aaaaaaaaaaaa1', 'Court-1', 'abcdefghijkl'];
        foreach ($refuses as $mot) {
            $this->assertTrue(Validator::make(['p' => $mot], ['p' => [new MotDePasseFort]])->fails(), "« {$mot} » devrait être refusé");
        }

        foreach (['Phrase de passe 2026', 'mot-de-passe-1234', 'ÉlodieMaroc2026!'] as $mot) {
            $this->assertFalse(Validator::make(['p' => $mot], ['p' => [new MotDePasseFort]])->fails(), "« {$mot} » devrait être accepté");
        }
    }

    public function test_creation_de_compte_par_l_administrateur_applique_la_politique(): void
    {
        $admin = $this->admin();
        $corps = fn (string $mdp, string $email) => ['name' => 'Nouveau', 'email' => $email, 'password' => $mdp];

        $this->actingAs($admin)->postJson('/api/v1/users', $corps('abcdefgh', 'a@exemple.test'))->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->actingAs($admin)->postJson('/api/v1/users', $corps('onzecaract1', 'b@exemple.test'))->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->actingAs($admin)->postJson('/api/v1/users', $corps('uniquementdeslettres', 'c@exemple.test'))->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->actingAs($admin)->postJson('/api/v1/users', $corps($this->nouveauMotDePasse(), 'd@exemple.test'))->assertSuccessful();
        $this->assertDatabaseMissing('users', ['email' => 'a@exemple.test']);
    }

    public function test_modification_du_mot_de_passe_par_l_administrateur_applique_la_politique(): void
    {
        $admin = $this->admin();
        $user = $this->utilisateur();

        $this->actingAs($admin)->putJson("/api/v1/users/{$user->id}", ['password' => 'abcdefgh'])->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->assertTrue(Hash::check($this->motDePasse, $user->fresh()->password), 'rien n\'a changé');

        $this->actingAs($admin)->putJson("/api/v1/users/{$user->id}", ['name' => 'Renommé'])->assertOk();
        $this->assertTrue(Hash::check($this->motDePasse, $user->fresh()->password), 'sans mot de passe fourni, il reste inchangé');
    }

    public function test_un_compte_existant_avec_un_ancien_mot_de_passe_court_peut_toujours_se_connecter(): void
    {
        $this->utilisateur('ancien@exemple.test', ['password' => Hash::make('ancien-court')]);

        Auth::shouldUse('web');
        $this->withHeaders(self::ORIGINE_SPA)->postJson('/api/v1/auth/login', ['email' => 'ancien@exemple.test', 'password' => 'ancien-court'])->assertOk();
        $this->assertAuthenticated();
    }

    public function test_changement_de_mot_de_passe_du_profil_applique_la_politique(): void
    {
        $user = $this->utilisateur();
        $base = ['name' => $user->name, 'email' => $user->email, 'current_password' => $this->motDePasse];

        $faible = 'abcdefgh';
        $this->actingAs($user)->putJson('/api/v1/profile', $base + ['password' => $faible, 'password_confirmation' => $faible])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);

        $nouveau = $this->nouveauMotDePasse();
        $this->actingAs($user)->putJson('/api/v1/profile', $base + ['password' => $nouveau, 'password_confirmation' => 'Autre-'.$nouveau])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);

        $this->actingAs($user)->putJson('/api/v1/profile', $base + ['password' => $nouveau, 'password_confirmation' => $nouveau])->assertOk();
        $this->assertTrue(Hash::check($nouveau, $user->fresh()->password));
    }

    public function test_changement_de_mot_de_passe_du_profil_exige_le_mot_de_passe_actuel(): void
    {
        $user = $this->utilisateur();
        $nouveau = $this->nouveauMotDePasse();
        $corps = ['name' => $user->name, 'email' => $user->email, 'password' => $nouveau, 'password_confirmation' => $nouveau];

        $this->actingAs($user)->putJson('/api/v1/profile', $corps)->assertStatus(422)->assertJsonValidationErrors(['current_password']);
        $this->actingAs($user)->putJson('/api/v1/profile', $corps + ['current_password' => 'mauvais'])->assertStatus(422)->assertJsonValidationErrors(['current_password']);
        $this->assertTrue(Hash::check($this->motDePasse, $user->fresh()->password));
    }

    // ------------------------------------------------------------------ changement d'email

    public function test_changer_l_email_sans_mot_de_passe_actuel_est_refuse(): void
    {
        $user = $this->utilisateur();

        $this->actingAs($user)->putJson('/api/v1/profile', ['name' => $user->name, 'email' => 'pirate@exemple.test'])
            ->assertStatus(422)->assertJsonValidationErrors(['current_password']);

        $this->assertSame('ok@exemple.test', $user->fresh()->email);
    }

    public function test_changer_l_email_avec_un_mauvais_mot_de_passe_est_refuse(): void
    {
        $user = $this->utilisateur();

        $this->actingAs($user)->putJson('/api/v1/profile', ['name' => $user->name, 'email' => 'pirate@exemple.test', 'current_password' => 'mauvais-mot-de-passe'])
            ->assertStatus(422)->assertJsonPath('errors.current_password.0', 'Mot de passe actuel incorrect.');

        $this->assertSame('ok@exemple.test', $user->fresh()->email);
    }

    public function test_changer_l_email_avec_le_bon_mot_de_passe_fonctionne_et_le_nouvel_email_sert_a_se_connecter(): void
    {
        $user = $this->utilisateur();

        $this->actingAs($user)->putJson('/api/v1/profile', ['name' => $user->name, 'email' => 'nouveau@exemple.test', 'current_password' => $this->motDePasse])
            ->assertOk()->assertJsonPath('user.email', 'nouveau@exemple.test');

        $this->assertSame('nouveau@exemple.test', $user->fresh()->email);

        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->withHeaders(self::ORIGINE_SPA)->postJson('/api/v1/auth/login', ['email' => 'ok@exemple.test', 'password' => $this->motDePasse])->assertStatus(422);
        $this->withHeaders(self::ORIGINE_SPA)->postJson('/api/v1/auth/login', ['email' => 'nouveau@exemple.test', 'password' => $this->motDePasse])->assertOk();
    }

    public function test_modifier_le_nom_ou_garder_le_meme_email_ne_demande_pas_le_mot_de_passe(): void
    {
        $user = $this->utilisateur();

        $this->actingAs($user)->putJson('/api/v1/profile', ['name' => 'Nouveau nom', 'email' => $user->email, 'telephone' => '0600000000'])->assertOk();
        // Même adresse, casse différente : ce n'est pas un changement d'identifiant.
        $this->actingAs($user)->putJson('/api/v1/profile', ['name' => 'Nouveau nom', 'email' => 'OK@Exemple.TEST'])->assertOk();

        $this->assertSame('Nouveau nom', $user->fresh()->name);
    }

    public function test_un_email_deja_pris_reste_refuse(): void
    {
        $user = $this->utilisateur();
        $this->utilisateur('pris@exemple.test');

        $this->actingAs($user)->putJson('/api/v1/profile', ['name' => $user->name, 'email' => 'pris@exemple.test', 'current_password' => $this->motDePasse])
            ->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    // ------------------------------------------------------------------ invalidation des sessions

    public function test_une_session_reste_valide_tant_que_le_mot_de_passe_ne_change_pas(): void
    {
        $this->utilisateur();
        $session = $this->seConnecter('ok@exemple.test');

        $this->meAvecSession($session)->assertOk()->assertJsonPath('user.email', 'ok@exemple.test');
        $this->meAvecSession($session)->assertOk();
    }

    public function test_une_session_volee_juste_apres_la_connexion_est_aussi_invalidee_par_un_changement_de_mot_de_passe(): void
    {
        $user = $this->utilisateur();
        $session = $this->seConnecter('ok@exemple.test');

        // Aucune requête intermédiaire : l'empreinte a été mémorisée dès la connexion.
        $user->forceFill(['password' => Hash::make($this->nouveauMotDePasse())])->save();

        $this->meAvecSession($session)->assertStatus(401);
    }

    public function test_le_changement_de_mot_de_passe_par_l_administrateur_ferme_les_sessions_du_compte(): void
    {
        $user = $this->utilisateur();
        $sessionVolee = $this->seConnecter('ok@exemple.test');
        $this->meAvecSession($sessionVolee)->assertOk();

        $nouveau = $this->nouveauMotDePasse();
        $this->navigateur();
        $this->actingAs($this->admin())->putJson("/api/v1/users/{$user->id}", ['password' => $nouveau])->assertOk();

        $this->meAvecSession($sessionVolee)->assertStatus(401);

        // Le compte reste utilisable avec le nouveau mot de passe, et l'ancien est refusé.
        $this->seConnecter('ok@exemple.test', $nouveau);
    }

    public function test_la_reinitialisation_du_mot_de_passe_ferme_les_sessions_du_compte_et_le_jeton_se_souvenir_de_moi(): void
    {
        $user = $this->utilisateur();
        $sessionVolee = $this->seConnecter('ok@exemple.test');
        $this->meAvecSession($sessionVolee)->assertOk();
        $ancienRemember = $user->fresh()->remember_token;

        $nouveau = $this->nouveauMotDePasse();
        $this->navigateur();
        $this->postJson('/api/v1/auth/reset-password', [
            'token' => Password::createToken($user), 'email' => 'ok@exemple.test', 'password' => $nouveau, 'password_confirmation' => $nouveau,
        ])->assertOk();

        $this->assertNotSame($ancienRemember, $user->fresh()->remember_token);
        $this->meAvecSession($sessionVolee)->assertStatus(401);
        $this->seConnecter('ok@exemple.test', $nouveau);
    }

    public function test_la_reinitialisation_refuse_un_mot_de_passe_faible(): void
    {
        $user = $this->utilisateur();

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => Password::createToken($user), 'email' => 'ok@exemple.test', 'password' => 'abcdefgh', 'password_confirmation' => 'abcdefgh',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);

        $this->assertTrue(Hash::check($this->motDePasse, $user->fresh()->password));
    }

    public function test_changer_son_propre_mot_de_passe_ferme_les_autres_sessions_mais_garde_la_session_courante(): void
    {
        $user = $this->utilisateur();
        $autreAppareil = $this->seConnecter('ok@exemple.test');
        $sessionCourante = $this->seConnecter('ok@exemple.test');
        $this->assertNotSame($autreAppareil, $sessionCourante);
        $this->meAvecSession($autreAppareil)->assertOk();

        $nouveau = $this->nouveauMotDePasse();
        $this->navigateur($sessionCourante);
        $this->withHeaders(self::ORIGINE_SPA)->putJson('/api/v1/profile', [
            'name' => $user->name, 'email' => $user->email, 'current_password' => $this->motDePasse,
            'password' => $nouveau, 'password_confirmation' => $nouveau,
        ])->assertOk();

        $this->meAvecSession($autreAppareil)->assertStatus(401);
        $this->meAvecSession($sessionCourante)->assertOk()->assertJsonPath('user.email', 'ok@exemple.test');
    }

    public function test_un_changement_de_nom_ne_ferme_aucune_session(): void
    {
        $user = $this->utilisateur();
        $session = $this->seConnecter('ok@exemple.test');

        $this->navigateur($session);
        $this->withHeaders(self::ORIGINE_SPA)->putJson('/api/v1/profile', ['name' => 'Autre nom', 'email' => $user->email])->assertOk();

        $this->meAvecSession($session)->assertOk();
    }
}
