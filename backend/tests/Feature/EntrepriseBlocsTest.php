<?php

namespace Tests\Feature;

use App\Models\Entreprise;
use App\Models\EntrepriseObservation;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Blocs de la fiche entreprise : personnes rattachées, documents et
 * observations (avec pièces jointes et confidentialité).
 */
class EntrepriseBlocsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Le catalogue de permissions n'est pas posé par une migration :
        // sans ce seed, `staff()` n'aurait aucune permission à recevoir.
        $this->seed(PermissionSeeder::class);
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    /** Utilisateur non-admin doté des seules permissions du module Entreprises. */
    private function staff(): User
    {
        $user = User::factory()->create(['is_admin' => false]);

        $permissions = Permission::where('module', 'entreprises')->get();
        foreach ($permissions as $permission) {
            UserPermission::create([
                'user_id' => $user->id,
                'permission_id' => $permission->id,
                'granted_by' => $user->id,
                'granted_at' => now(),
            ]);
        }

        return $user;
    }

    private function entreprise(User $user): Entreprise
    {
        $response = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Blocs SARL',
            'forme' => 'SARL',
            'periode' => 'Mensuel',
        ])->assertStatus(201);

        return Entreprise::findOrFail($response->json('data.id'));
    }

    // --- Personnes rattachées ------------------------------------------------

    public function test_entreprise_stores_and_returns_its_associes(): void
    {
        $user = $this->admin();

        $response = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Associes SARL',
            'forme' => 'SARL',
            'periode' => 'Mensuel',
            'associes' => [
                ['nom' => 'Amine Benali', 'cin' => 'AB12', 'type' => 'Gèrent'],
                ['nom' => 'Sofia Amrani', 'cin' => 'SA34', 'type' => 'Gérant non Associé'],
            ],
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.associes.0.nom', 'Amine Benali')
            ->assertJsonPath('data.associes.0.type', 'Gèrent')
            ->assertJsonPath('data.associes.1.type', 'Gérant non Associé');

        $this->assertDatabaseHas('entreprise_associes', ['nom' => 'Amine Benali', 'cin' => 'AB12']);
    }

    public function test_associe_type_must_be_one_of_the_five_allowed_values(): void
    {
        $this->actingAs($this->admin())->postJson('/api/v1/entreprises', [
            'denomination' => 'Type invalide SARL',
            'forme' => 'SARL',
            'periode' => 'Mensuel',
            'associes' => [['nom' => 'Untel', 'type' => 'Directeur']],
        ])->assertStatus(422)->assertJsonValidationErrors(['associes.0.type']);
    }

    public function test_updating_an_entreprise_replaces_its_associes(): void
    {
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $this->actingAs($user)->putJson("/api/v1/entreprises/{$entreprise->party_id}", [
            'associes' => [['nom' => 'Premier', 'type' => 'Associé']],
        ])->assertStatus(200);

        $this->actingAs($user)->putJson("/api/v1/entreprises/{$entreprise->party_id}", [
            'associes' => [['nom' => 'Second', 'type' => 'Partenaire']],
        ])->assertStatus(200)->assertJsonCount(1, 'data.associes')
            ->assertJsonPath('data.associes.0.nom', 'Second');

        $this->assertDatabaseMissing('entreprise_associes', ['nom' => 'Premier']);
    }

    // --- Documents -----------------------------------------------------------

    public function test_document_upload_uses_given_name_and_can_be_downloaded(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $response = $this->actingAs($user)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/documents",
            ['fichier' => UploadedFile::fake()->create('statuts.pdf', 12), 'nom' => 'Statuts signés']
        );

        $response->assertStatus(200)->assertJsonPath('data.documents.0.nom', 'Statuts signés');

        $documentId = $response->json('data.documents.0.id');
        $this->actingAs($user)
            ->get("/api/v1/entreprises/{$entreprise->party_id}/documents/{$documentId}/download")
            ->assertStatus(200);
    }

    public function test_document_cannot_be_deleted_before_reaching_the_corbeille(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $documentId = $this->actingAs($user)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/documents",
            ['fichier' => UploadedFile::fake()->create('note.pdf', 4)]
        )->json('data.documents.0.id');

        $this->actingAs($user)
            ->deleteJson("/api/v1/entreprises/{$entreprise->party_id}/documents/{$documentId}")
            ->assertStatus(422);

        $this->actingAs($user)
            ->postJson("/api/v1/entreprises/{$entreprise->party_id}/documents/{$documentId}/corbeille")
            ->assertStatus(200);

        $this->actingAs($user)
            ->deleteJson("/api/v1/entreprises/{$entreprise->party_id}/documents/{$documentId}")
            ->assertStatus(200);
    }

    // --- Observations : pièces jointes ---------------------------------------

    public function test_observation_accepts_several_attachments(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $response = $this->actingAs($user)->post(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            [
                'contenu' => 'Dossier transmis',
                'fichiers' => [
                    UploadedFile::fake()->create('a.pdf', 3),
                    UploadedFile::fake()->create('b.pdf', 3),
                ],
            ]
        );

        $response->assertStatus(200)->assertJsonCount(2, 'data.observationsListe.0.fichiers');
        $this->assertDatabaseCount('entreprise_observation_fichiers', 2);
    }

    public function test_deleting_an_observation_removes_its_attachments(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $observationId = $this->actingAs($user)->post(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            ['contenu' => 'Avec pièce', 'fichiers' => [UploadedFile::fake()->create('a.pdf', 3)]]
        )->json('data.observationsListe.0.id');

        $this->actingAs($user)
            ->postJson("/api/v1/entreprises/{$entreprise->party_id}/observations/{$observationId}/corbeille")
            ->assertStatus(200);
        $this->actingAs($user)
            ->deleteJson("/api/v1/entreprises/{$entreprise->party_id}/observations/{$observationId}")
            ->assertStatus(200);

        $this->assertSoftDeleted('entreprise_observations', ['id' => $observationId]);
        $this->assertSoftDeleted('entreprise_observation_fichiers', ['observation_id' => $observationId]);
    }

    // --- Observations : confidentialité --------------------------------------
    // Règle validée avec l'utilisatrice : une observation privée n'est lisible
    // que par son AUTEUR et les ADMINISTRATEURS.

    public function test_private_observation_is_hidden_from_other_non_admin_users(): void
    {
        $auteur = $this->staff();
        $autre = $this->staff();
        $entreprise = $this->entreprise($auteur);

        $this->actingAs($auteur)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            ['contenu' => 'Relance impayée', 'privee' => true]
        )->assertStatus(200)->assertJsonCount(1, 'data.observationsListe');

        // L'auteur la voit…
        $this->actingAs($auteur)->getJson("/api/v1/entreprises/{$entreprise->party_id}")
            ->assertStatus(200)->assertJsonCount(1, 'data.observationsListe');

        // …un autre utilisateur non-admin, non.
        $this->actingAs($autre)->getJson("/api/v1/entreprises/{$entreprise->party_id}")
            ->assertStatus(200)->assertJsonCount(0, 'data.observationsListe');
    }

    public function test_admin_can_read_a_private_observation_written_by_someone_else(): void
    {
        $auteur = $this->staff();
        $entreprise = $this->entreprise($auteur);

        $this->actingAs($auteur)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            ['contenu' => 'Note confidentielle', 'privee' => true]
        )->assertStatus(200);

        $this->actingAs($this->admin())->getJson("/api/v1/entreprises/{$entreprise->party_id}")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.observationsListe')
            ->assertJsonPath('data.observationsListe.0.privee', true);
    }

    public function test_non_private_observation_stays_visible_to_everyone(): void
    {
        $auteur = $this->staff();
        $autre = $this->staff();
        $entreprise = $this->entreprise($auteur);

        $this->actingAs($auteur)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            ['contenu' => 'Dossier complet']
        )->assertStatus(200);

        $this->actingAs($autre)->getJson("/api/v1/entreprises/{$entreprise->party_id}")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.observationsListe')
            ->assertJsonPath('data.observationsListe.0.privee', false);
    }

    public function test_other_user_cannot_act_on_a_private_observation(): void
    {
        $auteur = $this->staff();
        $autre = $this->staff();
        $entreprise = $this->entreprise($auteur);

        $observationId = $this->actingAs($auteur)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            ['contenu' => 'Privée', 'privee' => true]
        )->json('data.observationsListe.0.id');

        $this->actingAs($autre)
            ->postJson("/api/v1/entreprises/{$entreprise->party_id}/observations/{$observationId}/archive")
            ->assertStatus(403);

        $this->assertDatabaseHas('entreprise_observations', [
            'id' => $observationId, 'status' => 'actif',
        ]);
    }

    public function test_other_user_cannot_download_an_attachment_of_a_private_observation(): void
    {
        Storage::fake('public');
        $auteur = $this->staff();
        $autre = $this->staff();
        $entreprise = $this->entreprise($auteur);

        $observation = $this->actingAs($auteur)->post(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            [
                'contenu' => 'Privée avec pièce',
                'privee' => '1',
                'fichiers' => [UploadedFile::fake()->create('secret.pdf', 3)],
            ]
        )->json('data.observationsListe.0');

        $url = "/api/v1/entreprises/{$entreprise->party_id}/observations/{$observation['id']}"
            . "/fichiers/{$observation['fichiers'][0]['id']}/download";

        $this->actingAs($auteur)->get($url)->assertStatus(200);
        $this->actingAs($autre)->get($url)->assertStatus(403);
    }

    public function test_privee_defaults_to_false(): void
    {
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $this->actingAs($user)->postJson(
            "/api/v1/entreprises/{$entreprise->party_id}/observations",
            ['contenu' => 'Sans mention']
        )->assertStatus(200)->assertJsonPath('data.observationsListe.0.privee', false);

        $this->assertSame(false, EntrepriseObservation::first()->privee);
    }
}
