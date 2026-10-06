<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Garde-fous d'autorisation : aucune route de l'API (hors connexion / mot de passe oublié) n'est accessible sans
 * authentification, un compte sans permission est refusé sur les domaines protégés, et le chat est cloisonné
 * entre les conversations.
 */
class AutorisationRoutesTest extends TestCase
{
    use RefreshDatabase;

    /** Seules routes API volontairement publiques. */
    private const PUBLIQUES = [
        'POST api/v1/auth/login',
        'POST api/v1/auth/forgot-password',
        'POST api/v1/auth/reset-password',
    ];

    public function test_toute_route_de_l_api_exige_une_authentification_sauf_les_routes_publiques(): void
    {
        $verifiees = 0;

        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            foreach (array_diff($route->methods(), ['HEAD']) as $methode) {
                if (in_array("{$methode} {$route->uri()}", self::PUBLIQUES, true)) {
                    continue;
                }

                $uri = '/'.preg_replace('/\{[^}]+\}/', '1', $route->uri());
                $uri = str_replace(['/declarations/1', '/facturation/1'], ['/declarations/tva', '/facturation/facture'], $uri);

                $this->json($methode, $uri)->assertStatus(401, "{$methode} {$uri} doit exiger une authentification");
                $verifiees++;
            }
        }

        $this->assertGreaterThan(190, $verifiees, 'toutes les routes de l\'API doivent être parcourues');
    }

    public function test_un_compte_sans_permission_est_refuse_sur_les_domaines_proteges(): void
    {
        $this->seed(PermissionSeeder::class);
        $sansDroits = User::factory()->create(['is_admin' => false]);

        foreach ([
            '/api/v1/clients', '/api/v1/entreprises', '/api/v1/domiciliations', '/api/v1/centres-domiciliation',
            '/api/v1/services', '/api/v1/services-en-cours', '/api/v1/facturation/facture', '/api/v1/paiements',
            '/api/v1/declarations/tva', '/api/v1/mouvements/facture', '/api/v1/cachets', '/api/v1/mails',
            '/api/v1/rapports', '/api/v1/data-center', '/api/v1/chat/contacts', '/api/v1/settings/cabinet',
            '/api/v1/users', '/api/v1/permissions',
        ] as $uri) {
            $this->actingAs($sansDroits)->getJson($uri)->assertStatus(403, "{$uri} doit refuser un compte sans permission");
        }
    }

    public function test_un_non_administrateur_ne_peut_pas_gerer_les_utilisateurs(): void
    {
        $this->seed(PermissionSeeder::class);
        $staff = User::factory()->create(['is_admin' => false]);
        $cible = User::factory()->create();

        $this->actingAs($staff)->putJson("/api/v1/users/{$cible->id}", ['is_admin' => true])->assertStatus(403);
        $this->actingAs($staff)->deleteJson("/api/v1/users/{$cible->id}")->assertStatus(403);
        $this->actingAs($staff)->putJson("/api/v1/users/{$cible->id}/permissions", ['permissions' => []])->assertStatus(403);
        $this->assertFalse($cible->fresh()->is_admin);
    }

    public function test_le_chat_est_cloisonne_entre_conversations(): void
    {
        $this->seed(PermissionSeeder::class);
        [$a, $b, $c] = [
            User::factory()->create(['is_admin' => true]),
            User::factory()->create(['is_admin' => true]),
            User::factory()->create(['is_admin' => true]),
        ];

        $message = ChatMessage::create(['sender_id' => $a->id, 'recipient_id' => $b->id, 'body' => 'confidentiel A→B']);

        // C n'est ni l'expéditeur ni le destinataire : il ne voit rien de la conversation A↔B.
        $this->actingAs($c)->getJson("/api/v1/chat/{$a->id}/messages")->assertOk()->assertExactJson([]);
        $this->actingAs($c)->getJson("/api/v1/chat/{$b->id}/messages")->assertOk()->assertExactJson([]);

        // Modification et suppression : réservées à l'auteur du message (même pour un autre administrateur).
        $this->actingAs($c)->putJson("/api/v1/chat/messages/{$message->id}", ['body' => 'piraté'])->assertStatus(403);
        $this->actingAs($b)->putJson("/api/v1/chat/messages/{$message->id}", ['body' => 'piraté'])->assertStatus(403);
        $this->actingAs($c)->deleteJson("/api/v1/chat/messages/{$message->id}")->assertStatus(403);
        $this->assertSame('confidentiel A→B', $message->fresh()->body);

        // Le destinataire, lui, voit le message.
        $this->actingAs($b)->getJson("/api/v1/chat/{$a->id}/messages")->assertOk()->assertJsonCount(1);
    }

    public function test_le_chemin_du_fichier_de_reglage_est_borne_aux_images_de_parametrage(): void
    {
        $user = User::factory()->create();

        foreach (['../../.env', 'settings/cabinet/../../../.env', 'chat/abc.jpg', 'settings/cabinet/x.php', '/etc/passwd', 'settings/other/x.png'] as $chemin) {
            $this->actingAs($user)->getJson('/api/v1/settings/fichier?path='.urlencode($chemin))->assertStatus(404);
        }
    }
}
