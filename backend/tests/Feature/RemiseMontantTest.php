<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Modules\Facturation\Models\DocumentLigne;
use App\Support\ColonneBase;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Remise d'une ligne EN MONTANT (Dh) à la place du pourcentage : calcul, validation, anciennes lignes inchangées et
 * comportement sur une base à laquelle la migration `add_remise_montant_to_document_lignes_table` n'a pas encore été appliquée.
 */
class RemiseMontantTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    protected function tearDown(): void
    {
        ColonneBase::forcer('document_lignes', 'remise_montant', null);
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function client(): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);

        return Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST']);
    }

    private function creer(array $lignes, string $numero = 'RM-1')
    {
        return $this->actingAs($this->admin())->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $this->client()->party_id, 'numero' => $numero,
            'date_document' => '2026-10-14', 'lignes' => $lignes,
        ]);
    }

    public function test_une_remise_en_montant_est_deduite_du_total_ht_puis_la_tva_s_applique_sur_le_net(): void
    {
        $reponse = $this->creer([['designation' => 'Service', 'quantite' => 2, 'prix_unitaire' => 100, 'remise_montant' => 30, 'tva_pourcent' => 20]]);

        $reponse->assertCreated();
        $d = $reponse->json('data');
        $this->assertEquals(200, $d['totalHt']);
        $this->assertEquals(30, $d['totalRemise']);
        $this->assertEquals(170, $d['totalNetHt']);
        $this->assertEquals(34, $d['totalTva']);
        $this->assertEquals(204, $d['totalTtc']);
        $ligne = $d['lignes'][0];
        $this->assertSame('30.00', $ligne['remiseMontant']);
        $this->assertTrue($ligne['remiseEnMontant']);
        $this->assertEquals(170, $ligne['totalNetHt']);
    }

    public function test_une_remise_superieure_au_total_ht_de_la_ligne_est_refusee_avec_un_message_clair(): void
    {
        $reponse = $this->creer([['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 100, 'remise_montant' => 150]]);

        $reponse->assertStatus(422)->assertJsonValidationErrors(['lignes.0.remise_montant']);
        $this->assertStringContainsString('ne peut pas dépasser son total HT', $reponse->json('errors')['lignes.0.remise_montant'][0]);
        $this->assertSame(0, DocumentCommercial::count());
    }

    public function test_une_remise_negative_ou_non_numerique_est_refusee(): void
    {
        $this->creer([['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100, 'remise_montant' => -5]], 'RM-2')
            ->assertStatus(422)->assertJsonValidationErrors(['lignes.0.remise_montant']);
        $this->creer([['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100, 'remise_montant' => 'abc']], 'RM-3')
            ->assertStatus(422)->assertJsonValidationErrors(['lignes.0.remise_montant']);
    }

    public function test_sans_remise_le_total_est_le_total_ht(): void
    {
        $d = $this->creer([['designation' => 'S', 'quantite' => 3, 'prix_unitaire' => 50, 'tva_pourcent' => 20]], 'RM-4')->assertCreated()->json('data');

        $this->assertEquals(0, $d['totalRemise']);
        $this->assertEquals(150, $d['totalNetHt']);
        $this->assertEquals(180, $d['totalTtc']);
    }

    public function test_une_ligne_historique_en_pourcentage_garde_exactement_son_montant(): void
    {
        $d = $this->creer([['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100, 'tva_pourcent' => 0]], 'RM-5')->json('data');
        $document = DocumentCommercial::findOrFail($d['id']);
        // Ligne telle qu'enregistrée AVANT la migration : remise 10 %, aucun montant.
        $document->lignes()->update(['remise_pourcent' => 10, 'remise_montant' => null]);
        $document->load('lignes')->recalculerTotaux();

        $this->assertEquals(10, $document->fresh()->total_remise, '10 % de 100 Dh = 10 Dh, comme avant');
        $this->assertEquals(90, $document->fresh()->total_net_ht);

        $ligne = $this->actingAs($this->admin())->getJson("/api/v1/facturation/facture/{$document->id}")->json('data.lignes.0');
        $this->assertSame('10.00', $ligne['remiseMontant'], 'équivalent en Dh affiché pour la modification');
        $this->assertFalse($ligne['remiseEnMontant']);
        $this->assertEquals(10, $ligne['remisePourcent'], 'le pourcentage historique n\'est pas effacé');
    }

    public function test_le_montant_de_remise_d_une_ligne_est_plafonne_au_total_de_la_ligne(): void
    {
        $ligne = new DocumentLigne(['quantite' => 1, 'prix_unitaire' => 100, 'remise_montant' => 500, 'remise_pourcent' => 0]);

        $this->assertSame(100.0, $ligne->remiseEnDh());
        $this->assertSame('0.00', $ligne->total_net_ht);
    }

    public function test_base_sans_la_colonne_une_remise_est_refusee_clairement_et_une_ligne_sans_remise_passe(): void
    {
        ColonneBase::forcer('document_lignes', 'remise_montant', false);

        $refus = $this->creer([['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100, 'remise_montant' => 10]], 'RM-6');
        $refus->assertStatus(422);
        $this->assertStringContainsString('migration', $refus->json('errors')['lignes'][0]);
        $this->assertSame(0, DocumentCommercial::count(), 'aucun document n\'est créé à moitié');

        $this->creer([['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100, 'remise_montant' => 0]], 'RM-7')->assertCreated();
        $this->assertSame(1, DocumentCommercial::count());
    }

    public function test_la_modification_d_un_document_accepte_la_remise_en_montant(): void
    {
        $d = $this->creer([['designation' => 'S', 'quantite' => 2, 'prix_unitaire' => 100, 'tva_pourcent' => 20]], 'RM-8')->json('data');

        $r = $this->actingAs($this->admin())->putJson("/api/v1/facturation/facture/{$d['id']}", [
            'lignes' => [['designation' => 'S', 'quantite' => 2, 'prix_unitaire' => 100, 'remise_montant' => 50, 'tva_pourcent' => 20]],
        ]);

        $r->assertOk();
        $this->assertEquals(50, $r->json('data.totalRemise'));
        $this->assertEquals(180, $r->json('data.totalTtc'));
    }
}
