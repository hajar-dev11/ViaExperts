<?php

namespace Tests\Feature;

use App\Models\CentreDomiciliation;
use App\Models\Domiciliation;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DomiciliationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function entreprise(): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create([
            'party_id' => $party->id,
            'type' => 'entreprise',
            'denomination' => 'ENTREPRISE TEST',
        ]);
    }

    private function centre(): CentreDomiciliation
    {
        return CentreDomiciliation::create(['nom' => 'CENTRE TEST '.uniqid()]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'entreprise_id' => $this->entreprise()->party_id,
            'centre_domiciliation_id' => $this->centre()->id,
            'mois_payee' => 12,
            'date_depart' => '2026-01-01',
            'date_fin' => '2026-12-31',
            'mode_paiement' => 'Virement',
            'prix_par_mois' => 350,
            'prix_total' => 4200,
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/domiciliations')->assertStatus(401);
    }

    public function test_admin_can_create_domiciliation(): void
    {
        $response = $this->actingAs($this->admin())
            ->postJson('/api/v1/domiciliations', $this->payload());

        $response->assertStatus(201)
            ->assertJsonPath('data.modePaiement', 'Virement')
            ->assertJsonPath('data.status', 'actif');

        $this->assertDatabaseCount('domiciliations', 1);
    }

    private function domiciliation(): Domiciliation
    {
        $admin = $this->admin();

        $id = $this->actingAs($admin)
            ->postJson('/api/v1/domiciliations', $this->payload())
            ->json('data.id');

        return Domiciliation::findOrFail($id);
    }

    // Les documents/observations de domiciliation suivaient auparavant une règle
    // différente du reste de l'app (suppression définitive directement depuis
    // l'état actif, sans passer par la Corbeille) : corrigé pour s'aligner sur
    // `DataCenterController`/`EntrepriseController` — même garde, même test.
    public function test_document_cannot_be_destroyed_outside_the_corbeille(): void
    {
        $admin = $this->admin();
        $domiciliation = $this->domiciliation();

        $document = \App\Models\DomiciliationDocument::create([
            'domiciliation_id' => $domiciliation->id,
            'nom' => 'Justificatif.pdf',
            'chemin' => 'domiciliations/justificatif.pdf',
            'mime' => 'application/pdf',
            'taille' => 1024,
            'uploaded_by' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->deleteJson("/api/v1/domiciliations/{$domiciliation->id}/documents/{$document->id}")
            ->assertStatus(422);
        $this->assertDatabaseHas('domiciliation_documents', ['id' => $document->id, 'deleted_at' => null]);

        $this->actingAs($admin)
            ->postJson("/api/v1/domiciliations/{$domiciliation->id}/documents/{$document->id}/corbeille")
            ->assertOk();

        $this->actingAs($admin)
            ->postJson("/api/v1/domiciliations/{$domiciliation->id}/documents/{$document->id}/restore")
            ->assertOk();
        $this->assertDatabaseHas('domiciliation_documents', ['id' => $document->id, 'status' => 'actif']);

        $this->actingAs($admin)
            ->deleteJson("/api/v1/domiciliations/{$domiciliation->id}/documents/{$document->id}")
            ->assertStatus(422);

        $this->actingAs($admin)
            ->postJson("/api/v1/domiciliations/{$domiciliation->id}/documents/{$document->id}/corbeille")
            ->assertOk();

        $this->actingAs($admin)
            ->deleteJson("/api/v1/domiciliations/{$domiciliation->id}/documents/{$document->id}")
            ->assertOk();
        $this->assertSoftDeleted('domiciliation_documents', ['id' => $document->id]);
    }

    public function test_observation_cannot_be_destroyed_outside_the_corbeille(): void
    {
        $admin = $this->admin();
        $domiciliation = $this->domiciliation();

        $observation = \App\Models\DomiciliationObservation::create([
            'domiciliation_id' => $domiciliation->id,
            'contenu' => 'Note de test',
            'privee' => false,
            'created_by' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->deleteJson("/api/v1/domiciliations/{$domiciliation->id}/observations/{$observation->id}")
            ->assertStatus(422);
        $this->assertDatabaseHas('domiciliation_observations', ['id' => $observation->id, 'deleted_at' => null]);

        $this->actingAs($admin)
            ->postJson("/api/v1/domiciliations/{$domiciliation->id}/observations/{$observation->id}/corbeille")
            ->assertOk();

        $this->actingAs($admin)
            ->deleteJson("/api/v1/domiciliations/{$domiciliation->id}/observations/{$observation->id}")
            ->assertOk();
        $this->assertSoftDeleted('domiciliation_observations', ['id' => $observation->id]);
    }

    public function test_required_fields_are_validated(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/domiciliations', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['entreprise_id', 'centre_domiciliation_id', 'date_depart']);
    }

    public function test_mode_paiement_must_be_in_the_allowed_list(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/domiciliations', $this->payload(['mode_paiement' => 'Bitcoin']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['mode_paiement']);
    }

    public function test_statut_affichage_is_computed_from_date_fin(): void
    {
        $admin = $this->admin();

        $active = $this->actingAs($admin)->postJson('/api/v1/domiciliations', $this->payload([
            'date_depart' => now()->toDateString(),
            'date_fin' => now()->addMonths(6)->toDateString(),
        ]));
        $active->assertJsonPath('data.statutAffichage', 'active');

        $alerte = $this->actingAs($admin)->postJson('/api/v1/domiciliations', $this->payload([
            'date_depart' => now()->subMonth()->toDateString(),
            'date_fin' => now()->addDays(10)->toDateString(),
        ]));
        $alerte->assertJsonPath('data.statutAffichage', 'alerte');

        $expire = $this->actingAs($admin)->postJson('/api/v1/domiciliations', $this->payload([
            'date_depart' => now()->subYear()->toDateString(),
            'date_fin' => now()->subMonth()->toDateString(),
        ]));
        $expire->assertJsonPath('data.statutAffichage', 'expire');
    }

    public function test_declarer_and_resilier_change_etat(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/domiciliations', $this->payload())->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$id}/declarer")
            ->assertOk()
            ->assertJsonPath('data.statutAffichage', 'declare');

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$id}/resilier")
            ->assertOk()
            ->assertJsonPath('data.statutAffichage', 'resilie');
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/domiciliations', $this->payload())->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$id}/archive")
            ->assertJsonPath('data.status', 'archive');

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$id}/restore")
            ->assertJsonPath('data.status', 'actif');

        // Suppression refusée tant que l'élément n'est pas dans la corbeille.
        $this->actingAs($admin)->deleteJson("/api/v1/domiciliations/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$id}/corbeille")
            ->assertJsonPath('data.status', 'corbeille');

        $this->actingAs($admin)->deleteJson("/api/v1/domiciliations/{$id}")->assertOk();

        // Soft delete : la ligne existe toujours mais devient invisible.
        $this->assertNotNull(Domiciliation::withTrashed()->find($id)->deleted_at);
        $this->assertNull(Domiciliation::find($id));
    }

    public function test_observation_can_be_added(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/domiciliations', $this->payload())->json('data.id');

        $this->actingAs($admin)
            ->postJson("/api/v1/domiciliations/{$id}/observations", ['contenu' => 'Contrat signé.'])
            ->assertOk()
            ->assertJsonPath('data.observations.0.contenu', 'Contrat signé.');

        $this->assertDatabaseHas('domiciliation_observations', ['contenu' => 'Contrat signé.']);
    }

    public function test_staff_without_permission_gets_403(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/domiciliations')->assertStatus(403);
    }

    public function test_staff_with_permission_can_list(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);
        $permission = Permission::where('module', 'domiciliation')->where('action', 'list')->firstOrFail();

        UserPermission::create([
            'user_id' => $staff->id,
            'permission_id' => $permission->id,
            'granted_at' => now(),
        ]);

        $this->actingAs($staff)->getJson('/api/v1/domiciliations')->assertOk();
    }
}
