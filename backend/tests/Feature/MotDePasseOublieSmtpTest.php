<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * POST /auth/forgot-password : la réponse extérieure est identique que le compte existe ou non et que le SMTP réponde
 * ou non. Une panne d'envoi est journalisée côté serveur, sans adresse, sans jeton et sans lien.
 */
class MotDePasseOublieSmtpTest extends TestCase
{
    use RefreshDatabase;

    private function reponse(string $email): array
    {
        $r = $this->postJson('/api/v1/auth/forgot-password', ['email' => $email]);

        return ['statut' => $r->getStatusCode(), 'corps' => $r->json()];
    }

    /** Transport SMTP injoignable (port 1 : connexion refusée immédiatement, rien ne sort de la machine). */
    private function casserLeSmtp(): void
    {
        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
            'mail.mailers.smtp.encryption' => null,
            'mail.mailers.smtp.timeout' => 2,
        ]);
        Mail::purge('smtp');
        Mail::purge('array');
    }

    public function test_les_trois_cas_donnent_la_meme_reponse_exterieure(): void
    {
        User::factory()->create(['email' => 'ok@exemple.test']);

        // 1. Email existant, SMTP opérationnel.
        Notification::fake();
        $existantSmtpOk = $this->reponse('ok@exemple.test');
        Notification::assertSentTo(User::where('email', 'ok@exemple.test')->first(), ResetPasswordNotification::class);

        // 2. Email inexistant.
        $inconnu = $this->reponse('inconnu@exemple.test');

        // 3. Email existant, SMTP en panne.
        $this->app->forgetInstance('notification.fake');
        Notification::swap(app(\Illuminate\Notifications\ChannelManager::class));
        Log::spy();
        $this->casserLeSmtp();
        DB::table('password_resets')->delete(); // évite la limitation « un lien par minute » du broker
        $existantSmtpKo = $this->reponse('ok@exemple.test');

        $attendu = ['statut' => 200, 'corps' => ['message' => PasswordResetController::MESSAGE_NEUTRE]];
        $this->assertSame($attendu, $existantSmtpOk, 'compte existant, SMTP OK');
        $this->assertSame($attendu, $inconnu, 'compte inexistant');
        $this->assertSame($attendu, $existantSmtpKo, 'compte existant, SMTP KO : aucune erreur 500 ne doit transparaître');
    }

    public function test_la_panne_smtp_est_journalisee_sans_donnees_sensibles(): void
    {
        $user = User::factory()->create(['email' => 'secret-adresse@exemple.test']);
        Log::spy();
        $this->casserLeSmtp();

        $this->reponse('secret-adresse@exemple.test');

        Log::shouldHaveReceived('error')->once()->withArgs(function (string $message, array $contexte) use ($user) {
            $texte = $message.' '.json_encode($contexte);
            $jeton = DB::table('password_resets')->where('email', $user->email)->value('token');

            $this->assertArrayHasKey('exception', $contexte);
            $this->assertStringNotContainsString('secret-adresse', $texte, 'l\'adresse email ne doit pas être journalisée');
            $this->assertStringNotContainsString('reset-password', $texte, 'aucun lien de réinitialisation dans les journaux');
            $this->assertStringNotContainsString('token=', $texte);
            if ($jeton) {
                $this->assertStringNotContainsString($jeton, $texte, 'le jeton ne doit jamais être journalisé');
            }

            return true;
        });
    }

    public function test_une_panne_smtp_ne_change_ni_le_code_http_ni_la_forme_de_la_reponse_pour_un_compte_inconnu(): void
    {
        $this->casserLeSmtp();
        Log::spy();

        $this->assertSame(
            ['statut' => 200, 'corps' => ['message' => PasswordResetController::MESSAGE_NEUTRE]],
            $this->reponse('inconnu@exemple.test')
        );
        Log::shouldNotHaveReceived('error');
    }

    public function test_la_reponse_ne_depend_pas_du_temps_d_envoi(): void
    {
        // L'envoi se fait après la réponse : on vérifie que le callback est bien différé (terminating) et non exécuté
        // pendant le traitement de la requête.
        User::factory()->create(['email' => 'ok@exemple.test']);
        Notification::fake();

        $kernel = $this->app->make(\Illuminate\Contracts\Http\Kernel::class);
        $requete = \Illuminate\Http\Request::create('/api/v1/auth/forgot-password', 'POST', ['email' => 'ok@exemple.test'], [], [], ['HTTP_ACCEPT' => 'application/json']);
        $reponse = $kernel->handle($requete);

        $this->assertSame(200, $reponse->getStatusCode());
        Notification::assertNothingSent(); // pas encore envoyé : la réponse est prête avant l'envoi

        $kernel->terminate($requete, $reponse);
        Notification::assertSentTo(User::where('email', 'ok@exemple.test')->first(), ResetPasswordNotification::class);
    }
}