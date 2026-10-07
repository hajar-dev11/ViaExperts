<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Contracts\MontantFacture;
use App\Modules\Facturation\Models\DocumentCommercial;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Montant « payé » SAISI À LA MAIN sur la facture (colonne `documents_commerciaux.prix_paye`, champ « payé » du formulaire),
 * sans paiement enregistré correspondant (cas de la facture « fac 666 »).
 *
 * Il doit être pris en compte dans le reste à payer, et il ne doit pas être écrasé par la resynchronisation des paiements.
 * Facture de référence : 1 000 HT + TVA 20 % = 1 200,00 Dh TTC.
 */
class PaiementPartManuelleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Party $party;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $this->party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT PAYE MANUEL']);
    }

    /** Facture de 1 200,00 Dh TTC dont le « payé » a été saisi à la main. */
    private function facture(float $payeManuel, string $numero = 'FAC-MANUEL-1'): DocumentCommercial
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'numero' => $numero,
            'date_document' => '2026-10-07 09:00:00',
            'prix_paye' => $payeManuel,
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 1000, 'tva_pourcent' => 20]],
        ])->assertStatus(201)->json('data.id');

        return DocumentCommercial::findOrFail($id);
    }

    private function payer(DocumentCommercial $facture, float $montant)
    {
        return $this->actingAs($this->admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'document_id' => $facture->id,
            'date_operation' => '2026-10-07 10:00:00',
            'mode_paiement' => 'Espèce',
            'prix_paye' => $montant,
            'lignes' => [['designation' => 'Règlement', 'quantite' => 1, 'prix_unitaire' => max($montant, 1)]],
        ]);
    }

    private function paye(DocumentCommercial $facture): string
    {
        return $facture->fresh()->prix_paye;
    }

    // ------------------------------------------------------------------ le cas « fac 666 »

    public function test_une_facture_soldee_a_la_main_refuse_tout_paiement_et_garde_son_montant_paye(): void
    {
        $facture = $this->facture(1200);
        $this->assertSame('1200.00', $this->paye($facture));
        $this->assertSame(0, Paiement::count(), 'aucun paiement enregistré : le « payé » est purement manuel');

        $reponse = $this->payer($facture, 1)->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $message = $reponse->json('errors.prix_paye.0');
        $this->assertStringContainsString('dépasse le reste à payer de la facture n° FAC-MANUEL-1 (0,00 Dh)', $message);
        $this->assertStringContainsString("n'a pas été enregistré", $message);
        $this->assertSame(0, Paiement::count(), 'aucun paiement créé');
        $this->assertSame('1200.00', $this->paye($facture), 'le montant payé manuel n\'a pas été écrasé');
    }

    public function test_un_paiement_egal_au_reste_reel_est_accepte_et_un_paiement_superieur_est_refuse(): void
    {
        $facture = $this->facture(700); // reste réel : 1 200 − 700 = 500

        $this->payer($facture, 500.01)->assertStatus(422)->assertJsonPath('errors.prix_paye.0', fn ($m) => str_contains($m, '(500,00 Dh)'));
        $this->assertSame(0, Paiement::count());
        $this->assertSame('700.00', $this->paye($facture));

        $this->payer($facture, 500)->assertStatus(201);
        $this->assertSame('1200.00', $this->paye($facture), 'le payé manuel (700) est CONSERVÉ : 700 + 500');
        $this->assertSame('0.00', $facture->fresh()->prix_restant);

        $this->payer($facture, 1)->assertStatus(422);
        $this->assertSame(1, Paiement::count());
    }

    public function test_les_paiements_cumules_avec_le_payé_manuel_ne_peuvent_pas_depasser_la_facture(): void
    {
        $facture = $this->facture(200);

        $this->payer($facture, 400)->assertStatus(201);
        $this->assertSame('600.00', $this->paye($facture));
        $this->payer($facture, 400)->assertStatus(201);
        $this->assertSame('1000.00', $this->paye($facture));

        $this->payer($facture, 201)->assertStatus(422); // reste réel : 200
        $this->payer($facture, 200)->assertStatus(201);

        $this->assertSame('1200.00', $this->paye($facture));
        $this->assertSame(3, Paiement::count());
        $this->payer($facture, 0.01)->assertStatus(422);
    }

    public function test_une_facture_sans_payé_manuel_se_comporte_comme_avant(): void
    {
        $facture = $this->facture(0);

        $this->payer($facture, 1200)->assertStatus(201);
        $this->assertSame('1200.00', $this->paye($facture));
        $this->payer($facture, 1)->assertStatus(422);
    }

    // ------------------------------------------------------------------ modification

    public function test_la_modification_d_un_paiement_tient_compte_du_payé_manuel(): void
    {
        $facture = $this->facture(700);
        $id = $this->payer($facture, 300)->assertStatus(201)->json('data.id'); // payé : 700 + 300 = 1 000

        // Les autres sommes payées valent 700 (manuel) : ce paiement peut monter jusqu'à 500 (= 1 200 − 700).
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 501, 'lignes' => [['designation' => 'Règlement', 'quantite' => 1, 'prix_unitaire' => 1000]]])
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);
        $this->assertSame('300.00', Paiement::findOrFail($id)->prix_paye);
        $this->assertSame('1000.00', $this->paye($facture), 'refus : rien n\'a bougé');

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 500, 'lignes' => [['designation' => 'Règlement', 'quantite' => 1, 'prix_unitaire' => 1000]]])->assertOk();
        $this->assertSame('1200.00', $this->paye($facture));

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 100])->assertOk();
        $this->assertSame('800.00', $this->paye($facture), 'baisse : 700 manuel conservé + 100');
    }

    public function test_rattacher_un_paiement_a_une_facture_deja_payee_a_la_main_est_refuse_sans_perdre_le_payé_de_l_ancienne(): void
    {
        $source = $this->facture(300, 'FAC-MANUEL-SRC');
        $cible = $this->facture(1200, 'FAC-MANUEL-CIBLE'); // soldée à la main
        $id = $this->payer($source, 400)->assertStatus(201)->json('data.id'); // source : 300 + 400 = 700

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['document_id' => $cible->id])
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);
        $this->assertSame($source->id, Paiement::findOrFail($id)->document_id);
        $this->assertSame('1200.00', $this->paye($cible), 'la facture cible garde son payé manuel');

        // Vers une facture qui a la place : accepté, et le payé manuel de l'ANCIENNE facture est conservé.
        $libre = $this->facture(0, 'FAC-MANUEL-LIBRE');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['document_id' => $libre->id])->assertOk();
        $this->assertSame('300.00', $this->paye($source), 'ancienne facture : payé manuel 300 conservé, plus de paiement');
        $this->assertSame('400.00', $this->paye($libre));
    }

    // ------------------------------------------------------------------ archivage, restauration, suppression

    public function test_archiver_et_supprimer_un_paiement_conservent_le_payé_manuel(): void
    {
        $facture = $this->facture(700);
        $id = $this->payer($facture, 500)->assertStatus(201)->json('data.id');
        $this->assertSame('1200.00', $this->paye($facture));

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/archive")->assertOk();
        $this->assertSame('700.00', $this->paye($facture), 'le payé manuel n\'est PAS remis à zéro');

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/corbeille")->assertOk();
        $this->assertSame('700.00', $this->paye($facture));

        $this->actingAs($this->admin)->deleteJson("/api/v1/paiements/{$id}")->assertOk();
        $this->assertSame('700.00', $this->paye($facture), 'suppression définitive : payé manuel conservé');
        $this->assertSame(0, Paiement::count());
    }

    public function test_la_restauration_d_un_paiement_est_refusee_si_le_reste_reel_ne_suffit_plus(): void
    {
        $facture = $this->facture(700);
        $ancien = $this->payer($facture, 500)->assertStatus(201)->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$ancien}/archive")->assertOk();
        $this->payer($facture, 500)->assertStatus(201); // la facture est de nouveau soldée : 700 + 500

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$ancien}/restore")
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertSame('archive', Paiement::findOrFail($ancien)->status);
        $this->assertSame('1200.00', $this->paye($facture));
    }

    public function test_la_restauration_est_acceptee_quand_elle_tient_dans_le_reste_reel(): void
    {
        $facture = $this->facture(700);
        $id = $this->payer($facture, 300)->assertStatus(201)->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/archive")->assertOk();
        $this->assertSame('700.00', $this->paye($facture));

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/restore")->assertOk()->assertJsonPath('data.status', 'actif');
        $this->assertSame('1000.00', $this->paye($facture), '700 manuel + 300 restauré');
    }

    // ------------------------------------------------------------------ contrat et modèle

    public function test_le_contrat_expose_le_payé_stocké_et_le_modèle_calcule_la_part_manuelle(): void
    {
        $facture = $this->facture(250);
        $contrat = app(MontantFacture::class);

        $this->assertSame(250.0, $contrat->prixPaye($facture->id));
        $this->assertNull($contrat->prixPaye(999999));
        $this->assertSame(250.0, Paiement::partManuelle($facture->id), 'aucun paiement : tout le payé est manuel');

        $this->payer($facture, 100)->assertStatus(201); // synchronisée : 250 + 100 = 350
        $this->assertSame(250.0, Paiement::partManuelle($facture->id), 'la part manuelle reste 250');

        $this->assertSame(0.0, Paiement::partManuelle(null));
        $this->assertSame(0.0, Paiement::partManuelle(999999));
        $this->assertSame(0.0, Paiement::partManuelle($this->facture(0, 'FAC-MANUEL-ZERO')->id));
    }

    public function test_une_facture_modifiee_a_la_main_apres_des_paiements_est_prise_en_compte(): void
    {
        $facture = $this->facture(0);
        $this->payer($facture, 400)->assertStatus(201); // payé 400, synchronisé

        // L'utilisateur corrige le « payé » de la facture : 900 (dont 400 de paiements → 500 manuels).
        $this->actingAs($this->admin)->putJson("/api/v1/facturation/facture/{$facture->id}", ['prix_paye' => 900])->assertOk();
        $this->assertSame('900.00', $this->paye($facture));

        $this->payer($facture, 301)->assertStatus(422); // reste réel : 1 200 − 900 = 300
        $this->payer($facture, 300)->assertStatus(201);
        $this->assertSame('1200.00', $this->paye($facture));
    }
}
