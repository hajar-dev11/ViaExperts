<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MouvementTest extends TestCase
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
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST']);

        return $party;
    }

    private function creerFacture(User $admin, Party $party, string $numero, string $date): int
    {
        return $this->actingAs($admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $party->id,
            'numero' => $numero,
            'date_document' => $date,
            'prix_paye' => 0,
            // 1000 HT, TVA 20 % → 1200 TTC
            'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 1000, 'remise_pourcent' => 0, 'tva_pourcent' => 20]],
        ])->json('data.id');
    }

    private function creerPaiement(User $admin, Party $party, string $date, float $paye, float $montant = 1000): void
    {
        $this->actingAs($admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $party->id,
            'date_operation' => $date,
            'prix_paye' => $paye,
            'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => $montant]],
        ]);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/mouvements/recu')->assertStatus(401);
        $this->getJson('/api/v1/mouvements/facture')->assertStatus(401);
    }

    public function test_recu_aggregates_payments(): void
    {
        $admin = $this->admin();
        $party = $this->party();

        $this->creerPaiement($admin, $party, '2026-02-10 10:00:00', 400, 1000);
        $this->creerPaiement($admin, $party, '2026-05-10 10:00:00', 1000, 1000);

        $this->actingAs($admin)->getJson('/api/v1/mouvements/recu')
            ->assertOk()
            ->assertJsonPath('totaux.montantTotal', '2000.00')
            ->assertJsonPath('totaux.montantPaye', '1400.00')
            ->assertJsonPath('totaux.montantRestante', '600.00')
            ->assertJsonCount(2, 'lignes');
    }

    public function test_recu_can_be_filtered_by_quarter(): void
    {
        $admin = $this->admin();
        $party = $this->party();

        $this->creerPaiement($admin, $party, '2026-02-10 10:00:00', 400, 1000); // T1
        $this->creerPaiement($admin, $party, '2026-05-10 10:00:00', 1000, 1000); // T2

        $this->actingAs($admin)->getJson('/api/v1/mouvements/recu?trimestre=1')
            ->assertOk()
            ->assertJsonCount(1, 'lignes')
            ->assertJsonPath('totaux.montantTotal', '1000.00')
            ->assertJsonPath('totaux.montantPaye', '400.00');
    }

    public function test_recu_can_be_filtered_by_date_range(): void
    {
        $admin = $this->admin();
        $party = $this->party();

        $this->creerPaiement($admin, $party, '2026-02-10 10:00:00', 400, 1000);
        $this->creerPaiement($admin, $party, '2026-05-10 10:00:00', 1000, 1000);

        $this->actingAs($admin)->getJson('/api/v1/mouvements/recu?date_debut=2026-04-01&date_fin=2026-06-30')
            ->assertOk()
            ->assertJsonCount(1, 'lignes')
            ->assertJsonPath('totaux.montantTotal', '1000.00');
    }

    public function test_facture_aggregates_invoices(): void
    {
        $admin = $this->admin();
        $party = $this->party();

        $this->creerFacture($admin, $party, 'FAC-1/26', '2026-02-10 10:00:00');
        $this->creerFacture($admin, $party, 'FAC-2/26', '2026-05-10 10:00:00');

        $this->actingAs($admin)->getJson('/api/v1/mouvements/facture')
            ->assertOk()
            ->assertJsonPath('totaux.montantTotal', '2400.00')
            ->assertJsonPath('totaux.montantHt', '2000.00')
            ->assertJsonPath('totaux.montantPaye', '0.00')
            ->assertJsonCount(2, 'lignes');
    }

    public function test_facture_totals_follow_payments(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $factureId = $this->creerFacture($admin, $party, 'FAC-1/26', '2026-02-10 10:00:00');

        $this->actingAs($admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $party->id,
            'document_id' => $factureId,
            'date_operation' => '2026-02-11 10:00:00',
            'prix_paye' => 500,
            'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 1200]],
        ])->assertStatus(201);

        // Le mouvement facturé reflète le paiement, sans recalcul propre.
        $this->actingAs($admin)->getJson('/api/v1/mouvements/facture')
            ->assertOk()
            ->assertJsonPath('totaux.montantPaye', '500.00');
    }

    public function test_permissions_are_enforced_per_view(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/mouvements/recu')->assertStatus(403);
        $this->actingAs($staff)->getJson('/api/v1/mouvements/facture')->assertStatus(403);

        $permission = Permission::where('module', 'mouvement')->where('action', 'mouvement_entres_recu')->firstOrFail();
        UserPermission::create(['user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now()]);

        $this->actingAs($staff)->getJson('/api/v1/mouvements/recu')->assertOk();
        $this->actingAs($staff)->getJson('/api/v1/mouvements/facture')->assertStatus(403);
    }
}
