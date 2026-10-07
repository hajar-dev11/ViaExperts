<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Contracts\MontantFacture;
use App\Modules\Facturation\FacturationServiceProvider;
use App\Modules\Facturation\Models\DocumentCommercial;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Règle : un paiement ne peut JAMAIS dépasser le reste à payer (refus côté serveur, HTTP 422, message en français,
 * rien n'est créé ni modifié).
 *
 * Facture de référence : 1 000 HT + TVA 20 % = 1 200,00 Dh TTC.
 */
class PaiementSurpaiementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Party $party;
    private DocumentCommercial $facture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $this->party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT SURPAIEMENT']);
        $this->facture = $this->creerFacture('FAC-SURP-1');
    }

    private function creerFacture(string $numero, float $prixHt = 1000): DocumentCommercial
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'numero' => $numero,
            'date_document' => '2026-10-07 09:00:00',
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => $prixHt, 'tva_pourcent' => 20]],
        ])->json('data.id');

        return DocumentCommercial::findOrFail($id);
    }

    private function payload(float $montant, ?int $documentId = null, ?float $totalLignes = null): array
    {
        return [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'document_id' => $documentId ?? $this->facture->id,
            'date_operation' => '2026-10-07 10:00:00',
            'mode_paiement' => 'Espèce',
            'prix_paye' => $montant,
            // Les lignes valent au moins le montant payé : seule la règle « reste à payer de la facture » est testée.
            'lignes' => [['designation' => 'Règlement', 'quantite' => 1, 'prix_unitaire' => $totalLignes ?? max($montant, 1)]],
        ];
    }

    private function payer(float $montant, ?int $documentId = null, ?float $totalLignes = null)
    {
        return $this->actingAs($this->admin)->postJson('/api/v1/paiements', $this->payload($montant, $documentId, $totalLignes));
    }

    private function prixPayeFacture(?DocumentCommercial $facture = null): string
    {
        return ($facture ?? $this->facture)->fresh()->prix_paye;
    }

    // ------------------------------------------------------------------ paiements normaux (aucune régression)

    public function test_un_paiement_partiel_puis_le_solde_exact_sont_acceptes(): void
    {
        $this->payer(400)->assertStatus(201);
        $this->payer(400)->assertStatus(201);
        $this->payer(400)->assertStatus(201)->assertJsonPath('data.prixRestant', '0.00');

        $this->assertSame('1200.00', $this->prixPayeFacture());
        $this->assertSame(3, Paiement::count());
    }

    public function test_un_paiement_du_montant_exact_du_reste_est_accepte_meme_avec_des_centimes(): void
    {
        $facture = $this->creerFacture('FAC-SURP-CTS', 1000.5); // TTC 1 200,60

        $this->payer(1200.60, $facture->id)->assertStatus(201);
        $this->assertSame('1200.60', $this->prixPayeFacture($facture));
    }

    public function test_un_paiement_sans_facture_reste_possible(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $this->party->id, 'date_operation' => '2026-10-07 10:00:00',
            'prix_paye' => 300,
            'lignes' => [['designation' => 'Acompte libre', 'quantite' => 1, 'prix_unitaire' => 1000]],
        ])->assertStatus(201);
    }

    // ------------------------------------------------------------------ surpaiement refusé

    public function test_un_paiement_superieur_au_reste_est_refuse_en_422_avec_un_message_en_francais_et_ne_cree_rien(): void
    {
        $this->payer(1000)->assertStatus(201);

        $reponse = $this->payer(300)->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $message = $reponse->json('errors.prix_paye.0');
        $this->assertStringContainsString('dépasse le reste à payer de la facture n° FAC-SURP-1', $message);
        $this->assertStringContainsString('200,00 Dh', $message, 'le reste à payer est indiqué');
        $this->assertStringContainsString('300,00 Dh', $message, 'le montant refusé est rappelé');
        $this->assertStringContainsString("n'a pas été enregistré", $message);
        $this->assertSame($message, $reponse->json('message'), 'le message affiché par le formulaire est celui-ci');

        $this->assertSame(1, Paiement::count(), 'aucun paiement créé');
        $this->assertSame('1000.00', $this->prixPayeFacture(), 'la facture n\'a pas bougé');
    }

    public function test_une_facture_deja_soldee_refuse_tout_nouveau_paiement(): void
    {
        $this->payer(1200)->assertStatus(201);

        $this->payer(1)->assertStatus(422)
            ->assertJsonPath('errors.prix_paye.0', fn ($m) => str_contains($m, '(0,00 Dh)'));
        $this->assertSame(1, Paiement::count());
    }

    public function test_un_depassement_d_un_seul_centime_est_refuse(): void
    {
        $this->payer(1200.01)->assertStatus(422);
        $this->assertSame(0, Paiement::count());
    }

    public function test_un_paiement_ne_peut_pas_depasser_le_total_de_ses_propres_lignes(): void
    {
        $reponse = $this->actingAs($this->admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $this->party->id, 'date_operation' => '2026-10-07 10:00:00',
            'prix_paye' => 500,
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 300]],
        ])->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertStringContainsString('dépasse le total du paiement (300,00 Dh)', $reponse->json('errors.prix_paye.0'));
        $this->assertSame(0, Paiement::count());
    }

    public function test_les_paiements_archives_ou_en_corbeille_ne_comptent_pas_dans_le_reste_a_payer(): void
    {
        $premier = $this->payer(1200)->assertStatus(201)->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$premier}/archive")->assertOk();
        $this->assertSame('0.00', $this->prixPayeFacture());

        $this->payer(1200)->assertStatus(201);
        $this->assertSame('1200.00', $this->prixPayeFacture());
    }

    // ------------------------------------------------------------------ modification

    public function test_une_modification_qui_depasse_le_reste_est_refusee_et_ne_change_rien(): void
    {
        $this->payer(1000)->assertStatus(201);
        $id = $this->payer(100, null, 1000)->assertStatus(201)->json('data.id');

        // Reste hors ce paiement : 1 200 − 1 000 = 200 → passer à 300 est refusé.
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 300])
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertSame('100.00', Paiement::findOrFail($id)->prix_paye);
        $this->assertSame('1100.00', $this->prixPayeFacture());

        // Monter à 200 (= le reste exact) est accepté ; baisser aussi.
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 200, 'lignes' => [['designation' => 'Règlement', 'quantite' => 1, 'prix_unitaire' => 1000]]])->assertOk();
        $this->assertSame('1200.00', $this->prixPayeFacture());
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 50])->assertOk();
        $this->assertSame('1050.00', $this->prixPayeFacture());
    }

    public function test_rattacher_un_paiement_a_une_autre_facture_trop_petite_est_refuse(): void
    {
        $petite = $this->creerFacture('FAC-SURP-PETITE', 100); // TTC 120
        $id = $this->payer(500, null, 1000)->assertStatus(201)->json('data.id');

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}", ['document_id' => $petite->id])
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertSame($this->facture->id, Paiement::findOrFail($id)->document_id);
        $this->assertSame('0.00', $this->prixPayeFacture($petite));
    }

    public function test_un_ancien_paiement_deja_en_depassement_reste_modifiable_tant_qu_on_ne_l_aggrave_pas(): void
    {
        // Donnée antérieure à la règle, créée en contournant le contrôleur : 5 000 payés pour 100 de lignes.
        $ancien = Paiement::create([
            'reference' => '#ANCIEN', 'emetteur' => 'bureau_comptabilite', 'party_id' => $this->party->id,
            'document_id' => $this->facture->id, 'date_operation' => '2026-10-01 10:00:00', 'prix_paye' => 5000, 'total' => 100, 'status' => 'actif', 'created_by' => $this->admin->id,
        ]);

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$ancien->id}", ['observation' => 'simple correction'])->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$ancien->id}", ['prix_paye' => 4000])->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$ancien->id}", ['prix_paye' => 4500])->assertStatus(422);

        $this->assertSame('4000.00', $ancien->fresh()->prix_paye);
    }

    // ------------------------------------------------------------------ restauration

    public function test_restaurer_un_paiement_qui_ferait_depasser_la_facture_est_refuse(): void
    {
        $p1 = $this->payer(1200)->assertStatus(201)->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$p1}/archive")->assertOk();
        $this->payer(1200)->assertStatus(201); // la facture est de nouveau soldée par un autre paiement

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$p1}/restore")
            ->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertSame('archive', Paiement::findOrFail($p1)->status);
        $this->assertSame('1200.00', $this->prixPayeFacture());
    }

    public function test_restaurer_un_paiement_qui_tient_dans_le_reste_reste_possible(): void
    {
        $p1 = $this->payer(500)->assertStatus(201)->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$p1}/archive")->assertOk();

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$p1}/restore")->assertOk()->assertJsonPath('data.status', 'actif');
        $this->assertSame('500.00', $this->prixPayeFacture());
    }

    // ------------------------------------------------------------------ contrat Facturation

    public function test_le_montant_d_une_facture_passe_par_le_contrat_public_de_facturation(): void
    {
        $this->assertArrayHasKey(MontantFacture::class, (new FacturationServiceProvider(app()))->bindings);

        $contrat = app(MontantFacture::class);
        $this->assertSame(1200.0, $contrat->totalTtc($this->facture->id));
        $this->assertNull($contrat->totalTtc(999999));

        $this->facture->delete(); // corbeille (suppression douce) : le total reste lisible
        $this->assertSame(1200.0, $contrat->totalTtc($this->facture->id));

        $source = file_get_contents(base_path('app/Http/Controllers/Api/V1/PaiementController.php'));
        $this->assertStringContainsString('MontantFacture', $source);
        $this->assertStringNotContainsString('DocumentCommercial', $source, 'Paiements ne lit jamais les documents directement.');
        $this->assertStringNotContainsString('MontantFactureEloquent', $source);
    }
}
