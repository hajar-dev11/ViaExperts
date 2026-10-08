<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Models\DocumentCommercial;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Concurrence entre PAIEMENTS et MODIFICATIONS DE FACTURE — VRAIS processus PHP frappant le serveur au même instant.
 *
 * Facture de 1 000 Dh TTC. Des paiements de 100 Dh arrivent pendant que d'autres requêtes ramènent la facture à 600 Dh.
 * Quel que soit l'ordre d'arrivée : aucun HTTP 500 et, à la fin, jamais « total payé > TTC » ; la facture reste synchronisée
 * sur ses paiements.
 *
 * Pas de RefreshDatabase : les processus enfants doivent voir les données validées ; tout est supprimé à la fin
 * (base de test dédiée `via_expert_app_test`).
 */
class FactureEtPaiementsConcurrenceTest extends TestCase
{
    private ?User $admin = null;
    private ?Party $party = null;
    private ?DocumentCommercial $facture = null;

    protected function setUp(): void
    {
        parent::setUp();

        if (! Schema::hasTable('paiements')) {
            $this->artisan('migrate', ['--force' => true]);
        }

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $this->party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT FACTURE+PAIEMENTS']);

        $id = $this->actingAs($this->admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'numero' => 'FACCONC-'.uniqid(),
            'date_document' => '2026-10-06 09:00:00',
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 1000, 'tva_pourcent' => 0]],
        ])->assertStatus(201)->json('data.id');
        $this->facture = DocumentCommercial::findOrFail($id);
    }

    protected function tearDown(): void
    {
        if ($this->facture) {
            $ids = DB::table('paiements')->where('document_id', $this->facture->id)->pluck('id');
            DB::table('paiement_lignes')->whereIn('paiement_id', $ids)->delete();
            DB::table('paiements')->whereIn('id', $ids)->delete();
            DocumentCommercial::withTrashed()->whereKey($this->facture->id)->forceDelete();
        }
        if ($this->admin) {
            DB::table('personal_access_tokens')->where('tokenable_id', $this->admin->id)->delete();
            $this->admin->delete();
        }
        if ($this->party) {
            Client::where('party_id', $this->party->id)->delete();
            $this->party->delete();
        }

        parent::tearDown();
    }

    /** @return Process démarré : `$nombre` fois la même requête, au même instant que les autres. */
    private function lancer(string $jeton, string $methode, string $uri, array $corps, float $depart, int $nombre): Process
    {
        $p = new Process(
            [PHP_BINARY, base_path('tests/Support/requetes_en_parallele.php'), $jeton, $methode, $uri, base64_encode(json_encode($corps)), sprintf('%.6F', $depart), (string) $nombre],
            base_path(),
            ['APP_ENV' => 'testing']
        );
        $p->setTimeout(180);
        $p->start();

        return $p;
    }

    private function statuts(Process $p): array
    {
        $p->wait();
        $json = json_decode(trim($p->getOutput()), true);
        $this->assertIsArray($json, "Sortie inattendue d'un processus enfant : {$p->getOutput()} / {$p->getErrorOutput()}");

        return $json['statuts'];
    }

    public function test_paiements_et_modifications_de_facture_simultanes_ne_depassent_jamais_le_ttc(): void
    {
        $jeton = $this->admin->createToken('concurrence-facture-paiements')->plainTextToken;
        $depart = microtime(true) + 6.0;

        $paiement = [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $this->party->id, 'document_id' => $this->facture->id,
            'date_operation' => '2026-10-06 10:00:00', 'mode_paiement' => 'Espèce', 'prix_paye' => 100,
            'lignes' => [['designation' => 'Paiement concurrence', 'quantite' => 1, 'prix_unitaire' => 100]],
        ];
        $reduction = ['lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 600, 'tva_pourcent' => 0]]];

        $processus = [];
        for ($i = 0; $i < 4; $i++) {
            $processus['paiement'][] = $this->lancer($jeton, 'POST', '/api/v1/paiements', $paiement, $depart, 4); // 16 paiements de 100
        }
        for ($i = 0; $i < 3; $i++) {
            $processus['facture'][] = $this->lancer($jeton, 'PUT', "/api/v1/facturation/facture/{$this->facture->id}", $reduction, $depart, 2);
        }

        $statutsPaiements = $statutsFacture = [];
        foreach ($processus['paiement'] as $p) {
            $statutsPaiements = array_merge($statutsPaiements, $this->statuts($p));
        }
        foreach ($processus['facture'] as $p) {
            $statutsFacture = array_merge($statutsFacture, $this->statuts($p));
        }

        $facture = DocumentCommercial::findOrFail($this->facture->id);
        $paye = (float) Paiement::where('document_id', $facture->id)->where('status', 'actif')->sum('prix_paye');

        fwrite(STDERR, sprintf(
            "\n[concurrence facture+paiements] paiements: %d créés / %d refusés (422) ; modifications: %d acceptées / %d refusées (422) ; TTC final %s, payé %s\n",
            count(array_filter($statutsPaiements, fn ($s) => $s === 201)), count(array_filter($statutsPaiements, fn ($s) => $s === 422)),
            count(array_filter($statutsFacture, fn ($s) => $s === 200)), count(array_filter($statutsFacture, fn ($s) => $s === 422)),
            $facture->total_ttc, number_format($paye, 2, '.', '')
        ));

        $this->assertNotContains(500, array_merge($statutsPaiements, $statutsFacture), 'Aucun HTTP 500 attendu.');
        $this->assertEmpty(array_diff($statutsPaiements, [201, 422]));
        $this->assertEmpty(array_diff($statutsFacture, [200, 422]));

        $this->assertLessThanOrEqual((float) $facture->total_ttc + 0.005, $paye, 'Jamais « total payé > TTC ».');
        $this->assertEquals($paye, (float) $facture->prix_paye, 'La facture reste synchronisée sur la somme des paiements (aucune mise à jour perdue).');
        $this->assertContains((float) $facture->total_ttc, [1000.0, 600.0]);
    }
}
