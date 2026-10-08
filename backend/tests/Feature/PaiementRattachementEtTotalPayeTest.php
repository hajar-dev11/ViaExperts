<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Models\DocumentCommercial;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Règles serveur sur le rattachement d'un paiement et sur le total payé d'une facture :
 *   A. un paiement ne se rattache qu'à une FACTURE du MÊME client (existence, type, client) ;
 *   B. une facture ne peut pas être modifiée de façon à ce que « total payé > TTC ».
 */
class PaiementRattachementEtTotalPayeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Party $client;
    private Party $autreClient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->client = $this->nouveauClient('CLIENT A');
        $this->autreClient = $this->nouveauClient('CLIENT B');
    }

    private function nouveauClient(string $nom): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => $nom]);

        return $party;
    }

    /** Document (facture par défaut) de 1 000 Dh TTC (TVA 0 %) pour le client donné. */
    private function document(Party $client, string $type = 'facture', float $prixHt = 1000, array $override = []): DocumentCommercial
    {
        $id = $this->actingAs($this->admin)->postJson("/api/v1/facturation/{$type}", array_merge([
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $client->id,
            'numero' => strtoupper($type).'-'.uniqid(),
            'date_document' => '2026-10-07 09:00:00',
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => $prixHt, 'tva_pourcent' => 0]],
        ], $override))->assertStatus(201)->json('data.id');

        return DocumentCommercial::findOrFail($id);
    }

    private function payer(Party $client, ?int $documentId, float $montant = 100, array $override = [])
    {
        return $this->actingAs($this->admin)->postJson('/api/v1/paiements', array_merge([
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $client->id,
            'document_id' => $documentId,
            'date_operation' => '2026-10-07 10:00:00',
            'mode_paiement' => 'Espèce',
            'prix_paye' => $montant,
            'lignes' => [['designation' => 'Règlement', 'quantite' => 1, 'prix_unitaire' => $montant]],
        ], $override));
    }

    private function modifierFacture(DocumentCommercial $facture, array $champs)
    {
        return $this->actingAs($this->admin)->putJson("/api/v1/facturation/facture/{$facture->id}", $champs);
    }

    private function lignes(float $prixHt): array
    {
        return [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => $prixHt, 'tva_pourcent' => 0]];
    }

    // ===================================================================================================
    //  A. Document, type et client du paiement
    // ===================================================================================================

    public function test_un_paiement_sur_une_facture_du_bon_client_est_accepte(): void
    {
        $facture = $this->document($this->client);

        $this->payer($this->client, $facture->id, 250)->assertStatus(201)->assertJsonPath('data.documentId', $facture->id);
        $this->assertSame('250.00', $facture->fresh()->prix_paye);
    }

    public function test_un_paiement_sur_la_facture_d_un_autre_client_est_refuse_sans_rien_ecrire(): void
    {
        $factureDeB = $this->document($this->autreClient);

        $this->payer($this->client, $factureDeB->id, 100)
            ->assertStatus(422)->assertJsonValidationErrors(['document_id']);

        $this->assertSame(0, Paiement::count());
        $this->assertSame('0.00', $factureDeB->fresh()->prix_paye);
    }

    public function test_un_paiement_sur_un_devis_un_bon_de_livraison_ou_un_avoir_est_refuse(): void
    {
        foreach (['devis', 'bl', 'avoir'] as $type) {
            $document = $this->document($this->client, $type);

            $this->payer($this->client, $document->id, 100)
                ->assertStatus(422)->assertJsonValidationErrors(['document_id']);
        }

        $this->assertSame(0, Paiement::count());
    }

    public function test_un_paiement_sans_facture_reste_possible(): void
    {
        $this->payer($this->client, null, 100)->assertStatus(201)->assertJsonPath('data.documentId', null);
    }

    public function test_un_paiement_sur_une_facture_archivee_du_bon_client_reste_accepte(): void
    {
        $facture = $this->document($this->client);
        DocumentCommercial::whereKey($facture->id)->update(['status' => 'archive']);

        $this->payer($this->client, $facture->id, 100)->assertStatus(201);
    }

    public function test_modifier_un_paiement_vers_la_facture_d_un_autre_client_est_refuse(): void
    {
        $factureA = $this->document($this->client);
        $factureB = $this->document($this->autreClient);
        $paiement = Paiement::findOrFail($this->payer($this->client, $factureA->id, 100)->assertStatus(201)->json('data.id'));

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$paiement->id}", ['document_id' => $factureB->id])
            ->assertStatus(422)->assertJsonValidationErrors(['document_id']);

        $this->assertSame($factureA->id, $paiement->fresh()->document_id);
        $this->assertSame('0.00', $factureB->fresh()->prix_paye);
    }

    public function test_changer_le_client_d_un_paiement_deja_rattache_a_une_facture_est_refuse(): void
    {
        $facture = $this->document($this->client);
        $paiement = Paiement::findOrFail($this->payer($this->client, $facture->id, 100)->assertStatus(201)->json('data.id'));

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$paiement->id}", ['party_id' => $this->autreClient->id])
            ->assertStatus(422)->assertJsonValidationErrors(['document_id']);
    }

    public function test_corriger_une_observation_reste_possible_meme_si_le_formulaire_renvoie_facture_et_client(): void
    {
        $facture = $this->document($this->client);
        $paiement = Paiement::findOrFail($this->payer($this->client, $facture->id, 100)->assertStatus(201)->json('data.id'));

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$paiement->id}", [
            'party_id' => $this->client->id, 'document_id' => $facture->id, 'observation' => 'Reçu le 07/10',
        ])->assertOk();
    }

    // ===================================================================================================
    //  B. Total payé ≤ TTC à la modification d'une facture
    // ===================================================================================================

    public function test_modifier_une_facture_sans_depasser_le_total_paye_est_accepte(): void
    {
        $facture = $this->document($this->client); // 1 000 Dh
        $this->payer($this->client, $facture->id, 500)->assertStatus(201);

        $this->modifierFacture($facture, ['lignes' => $this->lignes(800)])->assertOk(); // 800 ≥ 500 payés
        $this->assertSame('800.00', $facture->fresh()->total_ttc);
        $this->assertSame('500.00', $facture->fresh()->prix_paye);

        $this->modifierFacture($facture, ['lignes' => $this->lignes(500)])->assertOk(); // exactement soldée
        $this->assertSame('500.00', $facture->fresh()->total_ttc);
    }

    public function test_baisser_le_ttc_sous_le_total_paye_est_refuse_et_la_facture_reste_inchangee(): void
    {
        $facture = $this->document($this->client);
        $this->payer($this->client, $facture->id, 500)->assertStatus(201);
        $avant = $facture->fresh()->only(['total_ht', 'total_ttc', 'prix_paye', 'numero']);

        $this->modifierFacture($facture, ['lignes' => $this->lignes(300)])
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertSame($avant, $facture->fresh()->only(['total_ht', 'total_ttc', 'prix_paye', 'numero']), 'Transaction annulée : rien n\'a changé.');
        $this->assertSame(1, $facture->lignes()->count());
        $this->assertSame('1000.00', $facture->lignes()->first()->prix_unitaire);
    }

    public function test_un_montant_paye_saisi_a_la_main_superieur_au_ttc_est_refuse(): void
    {
        $facture = $this->document($this->client);

        $this->modifierFacture($facture, ['prix_paye' => 1000.01])->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);
        $this->modifierFacture($facture, ['prix_paye' => 1000])->assertOk();
        $this->assertSame('1000.00', $facture->fresh()->prix_paye);
    }

    public function test_la_tva_est_prise_en_compte_dans_le_ttc_compare_au_total_paye(): void
    {
        $facture = $this->document($this->client); // 1 000 HT, TVA 0 → 1 000 TTC
        $this->payer($this->client, $facture->id, 1000)->assertStatus(201);

        // 900 HT + TVA 20 % = 1 080 TTC ≥ 1 000 payés : accepté ; 800 HT + 20 % = 960 < 1 000 : refusé.
        $this->modifierFacture($facture, ['lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 900, 'tva_pourcent' => 20]]])->assertOk();
        $this->modifierFacture($facture, ['lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 800, 'tva_pourcent' => 20]]])->assertStatus(422);
        $this->assertSame('1080.00', $facture->fresh()->total_ttc);
    }

    public function test_les_paiements_archives_ne_comptent_pas_dans_le_total_paye(): void
    {
        $facture = $this->document($this->client);
        $paiement = Paiement::findOrFail($this->payer($this->client, $facture->id, 600)->assertStatus(201)->json('data.id'));
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$paiement->id}/archive")->assertOk();

        $this->modifierFacture($facture, ['lignes' => $this->lignes(300)])->assertOk();
    }

    public function test_modifier_une_note_ou_une_date_reste_possible_sur_une_facture_payee(): void
    {
        $facture = $this->document($this->client);
        $this->payer($this->client, $facture->id, 1000)->assertStatus(201);

        $this->modifierFacture($facture, ['note' => 'Facture réglée'])->assertOk();
    }

    public function test_le_client_d_une_facture_ayant_des_paiements_ne_peut_plus_changer(): void
    {
        $avecPaiement = $this->document($this->client);
        $this->payer($this->client, $avecPaiement->id, 100)->assertStatus(201);
        $sansPaiement = $this->document($this->client);

        $this->modifierFacture($avecPaiement, ['party_id' => $this->autreClient->id])
            ->assertStatus(422)->assertJsonValidationErrors(['party_id']);
        $this->assertSame($this->client->id, $avecPaiement->fresh()->party_id);

        $this->modifierFacture($sansPaiement, ['party_id' => $this->autreClient->id])->assertOk();
    }

    public function test_les_autres_types_de_documents_ne_sont_pas_concernes_par_le_plafond(): void
    {
        $devis = $this->document($this->client, 'devis', 1000);

        $this->actingAs($this->admin)->putJson("/api/v1/facturation/devis/{$devis->id}", ['lignes' => $this->lignes(300)])->assertOk();
    }
}
