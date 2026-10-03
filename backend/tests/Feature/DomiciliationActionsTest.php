<?php

namespace Tests\Feature;

use App\Models\CentreDomiciliation;
use App\Models\Domiciliation;
use App\Models\Entreprise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Actions métier d'une domiciliation : Renouveler, Déclarer, Résilier.
 * Chacune peut porter un commentaire et un justificatif.
 */
class DomiciliationActionsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function domiciliation(User $user): Domiciliation
    {
        $entreprise = Entreprise::findOrFail(
            $this->actingAs($user)->postJson('/api/v1/entreprises', [
                'denomination' => 'Domi SARL', 'forme' => 'SARL', 'periode' => 'Mensuel',
            ])->assertStatus(201)->json('data.id')
        );

        $centre = CentreDomiciliation::first();

        return Domiciliation::findOrFail(
            $this->actingAs($user)->postJson('/api/v1/domiciliations', [
                'entreprise_id' => $entreprise->party_id,
                'centre_domiciliation_id' => $centre->id,
                'mois_payee' => 12,
                'mois_gratuits' => 0,
                'date_depart' => '2026-01-01',
                'date_fin' => '2027-01-01',
                'prix_par_mois' => 104.17,
                'prix_total' => 1250.04,
            ])->assertStatus(201)->json('data.id')
        );
    }

    // --- Renouveler ----------------------------------------------------------

    public function test_renouveler_creates_a_new_period_linked_to_the_previous_one(): void
    {
        $user = $this->admin();
        $origine = $this->domiciliation($user);

        $response = $this->actingAs($user)->postJson("/api/v1/domiciliations/{$origine->id}/renouveler", [
            'date_depart' => '2027-01-02',
            'date_fin' => '2028-01-02',
            'mois_payee' => 12,
            'mois_gratuits' => 0,
            'prix_par_mois' => 104.17,
            'prix_total' => 1250.04,
            'commentaire' => 'Renouvellement annuel',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.renouvelleDeId', $origine->id)
            ->assertJsonPath('data.dateDepart', '2027-01-02');

        // La période d'origine est conservée telle quelle, pas remplacée.
        $this->assertDatabaseHas('domiciliations', ['id' => $origine->id, 'date_depart' => '2026-01-01']);
        $this->assertSame(2, Domiciliation::where('entreprise_id', $origine->entreprise_id)->count());

        // L'action est journalisée sur la domiciliation d'origine.
        $this->assertDatabaseHas('domiciliation_operations', [
            'domiciliation_id' => $origine->id,
            'type' => 'renouvellement',
            'commentaire' => 'Renouvellement annuel',
        ]);
    }

    public function test_renouveler_keeps_the_entreprise_and_the_centre_of_the_original(): void
    {
        $user = $this->admin();
        $origine = $this->domiciliation($user);

        $nouvelle = $this->actingAs($user)->postJson("/api/v1/domiciliations/{$origine->id}/renouveler", [
            'date_depart' => '2027-01-02',
        ])->assertStatus(201)->json('data');

        $this->assertSame($origine->entreprise_id, $nouvelle['entrepriseId']);
        $this->assertSame($origine->centre_domiciliation_id, $nouvelle['centreId']);
    }

    public function test_renouveler_requires_a_start_date(): void
    {
        $user = $this->admin();
        $origine = $this->domiciliation($user);

        $this->actingAs($user)->postJson("/api/v1/domiciliations/{$origine->id}/renouveler", [])
            ->assertStatus(422)->assertJsonValidationErrors(['date_depart']);
    }

    public function test_renouveler_rejects_an_end_date_before_the_start_date(): void
    {
        $user = $this->admin();
        $origine = $this->domiciliation($user);

        $this->actingAs($user)->postJson("/api/v1/domiciliations/{$origine->id}/renouveler", [
            'date_depart' => '2027-06-01', 'date_fin' => '2027-01-01',
        ])->assertStatus(422)->assertJsonValidationErrors(['date_fin']);
    }

    // --- Déclarer / Résilier --------------------------------------------------

    public function test_declarer_records_the_state_the_comment_and_the_file(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $d = $this->domiciliation($user);

        $response = $this->actingAs($user)->post("/api/v1/domiciliations/{$d->id}/declarer", [
            'commentaire' => 'Déposé au tribunal',
            'fichier' => UploadedFile::fake()->create('depot.pdf', 5),
        ]);

        $response->assertStatus(200)->assertJsonPath('data.etat', 'declare');
        $this->assertNotNull($d->fresh()->date_declaration);

        $this->assertDatabaseHas('domiciliation_operations', [
            'domiciliation_id' => $d->id,
            'type' => 'declaration',
            'commentaire' => 'Déposé au tribunal',
            'fichier_nom' => 'depot.pdf',
        ]);
    }

    public function test_resilier_records_the_state_the_comment_and_the_file(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $d = $this->domiciliation($user);

        $this->actingAs($user)->post("/api/v1/domiciliations/{$d->id}/resilier", [
            'commentaire' => 'Demande du client',
            'fichier' => UploadedFile::fake()->create('lettre.pdf', 4),
        ])->assertStatus(200)->assertJsonPath('data.etat', 'resilie');

        $this->assertNotNull($d->fresh()->date_resiliation);
        $this->assertDatabaseHas('domiciliation_operations', [
            'domiciliation_id' => $d->id,
            'type' => 'resiliation',
            'fichier_nom' => 'lettre.pdf',
        ]);
    }

    public function test_declarer_works_without_comment_or_file(): void
    {
        $user = $this->admin();
        $d = $this->domiciliation($user);

        $this->actingAs($user)->postJson("/api/v1/domiciliations/{$d->id}/declarer", [])
            ->assertStatus(200)->assertJsonPath('data.etat', 'declare');

        $this->assertDatabaseHas('domiciliation_operations', [
            'domiciliation_id' => $d->id, 'type' => 'declaration', 'commentaire' => null, 'fichier_nom' => null,
        ]);
    }

    public function test_operation_file_can_be_downloaded(): void
    {
        Storage::fake('public');
        $user = $this->admin();
        $d = $this->domiciliation($user);

        $operations = $this->actingAs($user)->post("/api/v1/domiciliations/{$d->id}/resilier", [
            'fichier' => UploadedFile::fake()->create('lettre.pdf', 4),
        ])->assertStatus(200)->json('data.operations');

        $this->actingAs($user)
            ->get("/api/v1/domiciliations/{$d->id}/operations/{$operations[0]['id']}/download")
            ->assertStatus(200);
    }

    public function test_operations_are_returned_with_the_domiciliation(): void
    {
        $user = $this->admin();
        $d = $this->domiciliation($user);

        $this->actingAs($user)->postJson("/api/v1/domiciliations/{$d->id}/declarer", ['commentaire' => 'A']);

        $this->actingAs($user)->getJson("/api/v1/domiciliations/{$d->id}")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.operations')
            ->assertJsonPath('data.operations.0.type', 'declaration')
            ->assertJsonPath('data.operations.0.commentaire', 'A');
    }

    public function test_a_first_period_has_no_renewal_link(): void
    {
        $user = $this->admin();
        $d = $this->domiciliation($user);

        $this->actingAs($user)->getJson("/api/v1/domiciliations/{$d->id}")
            ->assertStatus(200)->assertJsonPath('data.renouvelleDeId', null);
    }
}
