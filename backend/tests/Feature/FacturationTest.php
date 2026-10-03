<?php

namespace Tests\Feature;

use App\Models\DocumentCommercial;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FacturationTest extends TestCase
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

    private function party(): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        \App\Models\Client::create([
            'party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST',
        ]);

        return $party;
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'emetteur' => 'bureau_comptabilite',
            'responsable' => 'Maitre : Morad Bendeq',
            'party_id' => $this->party()->id,
            'numero' => 'FAC-001/26',
            'date_document' => '2026-09-17 11:00:00',
            'prix_paye' => 0,
            'lignes' => [
                // 2 × 1000 = 2000 HT, remise 10% => 1800 net, TVA 20% => 360 → TTC 2160
                ['designation' => 'Service A', 'quantite' => 2, 'prix_unitaire' => 1000, 'remise_pourcent' => 10, 'tva_pourcent' => 20],
            ],
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/facturation/facture')->assertStatus(401);
    }

    public function test_unknown_type_is_404(): void
    {
        $this->actingAs($this->admin())->getJson('/api/v1/facturation/inconnu')->assertStatus(404);
    }

    public function test_admin_can_create_invoice_and_totals_are_computed(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/facturation/facture', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('data.totalHt', '2000.00')
            ->assertJsonPath('data.totalRemise', '200.00')
            ->assertJsonPath('data.totalNetHt', '1800.00')
            ->assertJsonPath('data.totalTva', '360.00')
            ->assertJsonPath('data.totalTtc', '2160.00')
            ->assertJsonPath('data.prixRestant', '2160.00')
            ->assertJsonPath('data.tiers', 'CLIENT TEST');

        $this->assertDatabaseCount('documents_commerciaux', 1);
        $this->assertDatabaseCount('document_lignes', 1);
    }

    public function test_prix_restant_is_ttc_minus_prix_paye(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/facturation/facture', $this->payload(['prix_paye' => 160]))
            ->assertStatus(201)
            ->assertJsonPath('data.prixPaye', '160.00')
            ->assertJsonPath('data.prixRestant', '2000.00');
    }

    public function test_numero_is_unique_per_type_but_reusable_across_types(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload())->assertStatus(201);

        // Même numéro, même type → refusé
        $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['numero']);

        // Même numéro, type différent → accepté
        $this->actingAs($admin)->postJson('/api/v1/facturation/devis', $this->payload())->assertStatus(201);
    }

    public function test_document_requires_at_least_one_line(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/facturation/facture', $this->payload(['lignes' => []]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lignes']);
    }

    public function test_update_replaces_lines_and_recomputes_totals(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload())->json('data.id');

        $this->actingAs($admin)
            ->putJson("/api/v1/facturation/facture/{$id}", [
                'lignes' => [
                    ['designation' => 'Service B', 'quantite' => 1, 'prix_unitaire' => 500, 'remise_pourcent' => 0, 'tva_pourcent' => 20],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.totalHt', '500.00')
            ->assertJsonPath('data.totalTtc', '600.00')
            ->assertJsonCount(1, 'data.lignes');

        $this->assertDatabaseCount('document_lignes', 1);
    }

    public function test_numero_propose_comes_from_settings_of_the_chosen_emetteur(): void
    {
        $admin = $this->admin();

        \App\Models\CabinetSetting::firstOrCreate([])->update([
            'facture_prefixe' => 'FAC-', 'facture_prochain_numero' => '291', 'facture_suffixe' => '/25',
            'nom_societe' => 'Maitre : Morad Bendeq',
        ]);
        \App\Models\DomiciliationSetting::firstOrCreate([])->update([
            'facture_prefixe' => 'VE-', 'facture_prochain_numero' => '12', 'facture_suffixe' => '/25',
            'nom_societe' => 'Via Experts',
        ]);

        $this->actingAs($admin)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite')
            ->assertOk()
            ->assertJsonPath('numero', 'FAC-291/25')
            ->assertJsonPath('responsable', 'Maitre : Morad Bendeq');

        $this->actingAs($admin)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=via_experts')
            ->assertOk()
            ->assertJsonPath('numero', 'VE-12/25')
            ->assertJsonPath('responsable', 'Via Experts');
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload())->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$id}/archive")
            ->assertJsonPath('data.status', 'archive');
        $this->actingAs($admin)->getJson('/api/v1/facturation/facture?status=archive')->assertJsonCount(1, 'data');

        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$id}/restore")
            ->assertJsonPath('data.status', 'actif');

        $this->actingAs($admin)->deleteJson("/api/v1/facturation/facture/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$id}/corbeille")
            ->assertJsonPath('data.status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/facturation/facture/{$id}")->assertOk();

        $this->assertNull(DocumentCommercial::find($id));
        $this->assertNotNull(DocumentCommercial::withTrashed()->find($id)->deleted_at);
    }

    public function test_permissions_are_per_document_type(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        // Sans permission : 403 partout
        $this->actingAs($staff)->getJson('/api/v1/facturation/facture')->assertStatus(403);

        // Avec liste_facture seulement : facture OK, devis toujours refusé
        $permission = Permission::where('module', 'facturation')->where('action', 'liste_facture')->firstOrFail();
        UserPermission::create([
            'user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now(),
        ]);

        $this->actingAs($staff)->getJson('/api/v1/facturation/facture')->assertOk();
        $this->actingAs($staff)->getJson('/api/v1/facturation/devis')->assertStatus(403);
    }

    public function test_line_can_reference_a_service_from_the_catalogue(): void
    {
        $service = Service::create(['nom' => 'Service catalogue', 'prix' => 750, 'status' => 'actif']);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/facturation/facture', $this->payload([
                'lignes' => [[
                    'service_id' => $service->id, 'designation' => 'Service catalogue',
                    'quantite' => 1, 'prix_unitaire' => 750, 'remise_pourcent' => 0, 'tva_pourcent' => 20,
                ]],
            ]))
            ->assertStatus(201)
            ->assertJsonPath('data.lignes.0.serviceId', $service->id)
            ->assertJsonPath('data.totalTtc', '900.00');
    }
}
