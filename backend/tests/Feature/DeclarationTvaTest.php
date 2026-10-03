<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\DeclarationTva;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeclarationTvaTest extends TestCase
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
            'party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'WINOPACK TEST',
        ]);
    }

    /** Entreprise dont le client titulaire est renseigné (`entreprises.client_id`). */
    private function entrepriseAvecClient(): Entreprise
    {
        $partyClient = Party::create(['type' => 'client', 'status' => 'actif']);
        $client = Client::create([
            'party_id' => $partyClient->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TITULAIRE',
        ]);

        $partyEntreprise = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create([
            'party_id' => $partyEntreprise->id, 'type' => 'entreprise',
            'denomination' => 'WINOPACK TEST', 'client_id' => $client->party_id,
        ]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'entreprise_id' => $this->entreprise()->party_id,
            'client_if' => '12345678',
            'identifiant_paiement' => '1-ESPECES',
            'periode_type' => 'trimestre',
            'periode_valeur' => 2,
            'annee' => 2026,
            'regime' => '2',
            'lignes' => [
                ['fact_num' => 'F-1', 'designation' => 'Vente', 'ht' => 1000, 'tva' => 200, 'ttc' => 1200, 'taux' => 20],
                ['fact_num' => 'F-2', 'designation' => 'Service', 'ht' => 500, 'tva' => 100, 'ttc' => 600, 'taux' => 20],
            ],
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/declarations/tva')->assertStatus(401);
    }

    public function test_unknown_type_is_404(): void
    {
        $this->actingAs($this->admin())->getJson('/api/v1/declarations/inconnu')->assertStatus(404);
    }

    public function test_admin_can_create_declaration_and_totals_are_summed(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/declarations/tva', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('data.totalHt', '1500.00')
            ->assertJsonPath('data.totalTva', '300.00')
            ->assertJsonPath('data.totalTtc', '1800.00')
            ->assertJsonPath('data.situation', 'non_declaree')
            ->assertJsonPath('data.periode', 'trimestre : 2')
            ->assertJsonPath('data.nomComplet', 'WINOPACK TEST');

        $this->assertDatabaseCount('declarations_tva', 1);
        $this->assertDatabaseCount('declaration_tva_lignes', 2);
    }

    public function test_situation_declaree_is_saved(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/declarations/tva', $this->payload(['situation' => 'declaree']))
            ->assertStatus(201)
            ->assertJsonPath('data.situation', 'declaree');
    }

    public function test_required_fields_are_validated(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/declarations/tva', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['entreprise_id', 'client_if', 'periode_valeur', 'annee', 'lignes']);
    }

    public function test_list_can_be_filtered_by_situation(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload(['situation' => 'declaree']));
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload(['situation' => 'non_declaree']));

        $this->actingAs($admin)->getJson('/api/v1/declarations/tva?situation=declaree')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_tva_and_chiffre_affaire_are_separate_lists(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload())->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/declarations/chiffre_affaire', $this->payload())->assertStatus(201);

        $this->actingAs($admin)->getJson('/api/v1/declarations/tva')->assertJsonCount(1, 'data');
        $this->actingAs($admin)->getJson('/api/v1/declarations/chiffre_affaire')->assertJsonCount(1, 'data');
    }

    // ------------------------------------------- Lien automatique « Services en cours »

    public function test_tva_declaration_creates_a_service_en_cours_for_the_client(): void
    {
        Service::create(['nom' => 'Déclaration TVA', 'prix' => 0, 'status' => 'actif']);
        $entreprise = $this->entrepriseAvecClient();

        $this->actingAs($this->admin())
            ->postJson('/api/v1/declarations/tva', $this->payload(['entreprise_id' => $entreprise->party_id]))
            ->assertStatus(201);

        $this->assertDatabaseCount('service_en_cours', 1);
        $sec = ServiceEnCours::with('service')->first();
        $this->assertSame('Déclaration TVA', $sec->service->nom);
        $this->assertSame($entreprise->client_id, $sec->client_id);
    }

    public function test_second_tva_declaration_for_same_client_does_not_duplicate_service_en_cours(): void
    {
        Service::create(['nom' => 'Déclaration TVA', 'prix' => 0, 'status' => 'actif']);
        $entreprise = $this->entrepriseAvecClient();
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload([
            'entreprise_id' => $entreprise->party_id, 'periode_valeur' => 1,
        ]))->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload([
            'entreprise_id' => $entreprise->party_id, 'periode_valeur' => 2,
        ]))->assertStatus(201);

        $this->assertDatabaseCount('declarations_tva', 2);
        $this->assertDatabaseCount('service_en_cours', 1);
    }

    public function test_tva_declaration_without_linked_client_does_not_create_service_en_cours(): void
    {
        Service::create(['nom' => 'Déclaration TVA', 'prix' => 0, 'status' => 'actif']);

        // `entreprise()` (helper existant) ne renseigne pas `client_id`.
        $this->actingAs($this->admin())
            ->postJson('/api/v1/declarations/tva', $this->payload())
            ->assertStatus(201);

        $this->assertDatabaseCount('service_en_cours', 0);
    }

    public function test_chiffre_affaire_declaration_does_not_create_service_en_cours(): void
    {
        Service::create(['nom' => 'Déclaration TVA', 'prix' => 0, 'status' => 'actif']);
        $entreprise = $this->entrepriseAvecClient();

        $this->actingAs($this->admin())
            ->postJson('/api/v1/declarations/chiffre_affaire', $this->payload(['entreprise_id' => $entreprise->party_id]))
            ->assertStatus(201);

        $this->assertDatabaseCount('service_en_cours', 0);
    }

    // ------------------------------------------------------------- Exports réels

    public function test_xml_export_is_a_real_xml_document(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload())->json('data.id');

        $response = $this->actingAs($admin)->get("/api/v1/declarations/tva/{$id}/export/xml");

        $response->assertOk()->assertHeader('Content-Type', 'application/xml');
        $xml = simplexml_load_string($response->getContent());

        $this->assertNotFalse($xml);
        $this->assertSame('1500.00', (string) $xml->TotalHT);
        $this->assertCount(2, $xml->Lignes->Ligne);
    }

    public function test_xls_export_contains_the_reference_columns(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload())->json('data.id');

        $contenu = $this->actingAs($admin)->get("/api/v1/declarations/tva/{$id}/export/xls")
            ->assertOk()
            ->getContent();

        foreach (['FACT NUM', 'DESIGNATION', 'LIB FRSS', 'ID PAIE', 'DATE FAC'] as $entete) {
            $this->assertStringContainsString($entete, $contenu);
        }
    }

    public function test_zip_export_is_a_valid_archive(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload())->json('data.id');

        $contenu = $this->actingAs($admin)->get("/api/v1/declarations/tva/{$id}/export/zip")
            ->assertOk()
            ->getContent();

        // Signature d'une archive ZIP + présence des 2 entrées attendues.
        $this->assertSame("PK\x03\x04", substr($contenu, 0, 4));
        $this->assertStringContainsString("declaration-tva-{$id}.xml", $contenu);
        $this->assertStringContainsString("declaration-tva-{$id}.xls", $contenu);
    }

    public function test_chiffre_affaire_has_no_zip_or_xml_export(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/declarations/chiffre_affaire', $this->payload())->json('data.id');

        $this->actingAs($admin)->get("/api/v1/declarations/chiffre_affaire/{$id}/export/zip")->assertStatus(404);
        $this->actingAs($admin)->get("/api/v1/declarations/chiffre_affaire/{$id}/export/xml")->assertStatus(404);
        $this->actingAs($admin)->get("/api/v1/declarations/chiffre_affaire/{$id}/export/xls")->assertOk();
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload())->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/declarations/tva/{$id}/archive")->assertJsonPath('data.status', 'archive');
        $this->actingAs($admin)->postJson("/api/v1/declarations/tva/{$id}/restore")->assertJsonPath('data.status', 'actif');
        $this->actingAs($admin)->deleteJson("/api/v1/declarations/tva/{$id}")->assertStatus(422);
        $this->actingAs($admin)->postJson("/api/v1/declarations/tva/{$id}/corbeille")->assertJsonPath('data.status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/declarations/tva/{$id}")->assertOk();

        $this->assertNull(DeclarationTva::find($id));
    }

    public function test_permissions_are_separate_between_tva_and_chiffre_affaire(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/declarations/tva')->assertStatus(403);

        $permission = Permission::where('module', 'declaration')->where('action', 'liste')->firstOrFail();
        UserPermission::create(['user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now()]);

        $this->actingAs($staff)->getJson('/api/v1/declarations/tva')->assertOk();
        // Le groupe chiffre_affaire est distinct : toujours refusé.
        $this->actingAs($staff)->getJson('/api/v1/declarations/chiffre_affaire')->assertStatus(403);
    }
}
