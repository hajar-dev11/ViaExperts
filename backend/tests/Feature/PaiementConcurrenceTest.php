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
 * Concurrence sur les paiements — VRAIS processus PHP (audit global, étape 23).
 *
 * Plusieurs processus enregistrent des paiements au même instant sur la MÊME facture. Invariants :
 *   - aucune requête ne se termine en HTTP 500 (la référence `#N` ne doit jamais entrer en collision) ;
 *   - chaque référence est unique ;
 *   - le « prix payé » de la facture vaut exactement la somme des paiements actifs (aucune mise à jour perdue).
 *
 * Pas de RefreshDatabase : les processus enfants doivent voir les données validées ; tout est supprimé à la fin
 * (base de test dédiée `via_expert_app_test`).
 */
class PaiementConcurrenceTest extends TestCase
{
    private const PROCESSUS = 6;
    private const PAR_PROCESSUS = 4;

    private ?User $admin = null;
    private ?Party $party = null;
    private ?DocumentCommercial $facture = null;

    /** @var list<int> Factures créées en cours de test, à supprimer à la fin. */
    private array $autresFactures = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (! Schema::hasTable('paiements')) {
            $this->artisan('migrate', ['--force' => true]);
        }

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $this->party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT PAIEMENTS CONCURRENTS']);

        $id = $this->actingAs($this->admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'numero' => 'PAYCONC-'.uniqid(),
            'date_document' => '2026-10-06 09:00:00',
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 100000, 'tva_pourcent' => 0]],
        ])->json('data.id');
        $this->facture = DocumentCommercial::find($id);
    }

    protected function tearDown(): void
    {
        if ($this->facture) {
            // Suppression DÉFINITIVE (le modèle est en suppression douce) : les autres tests supposent une table vide.
            $documents = array_merge([$this->facture->id], $this->autresFactures);
            $ids = DB::table('paiements')->whereIn('document_id', $documents)->pluck('id');
            DB::table('paiement_lignes')->whereIn('paiement_id', $ids)->delete();
            DB::table('paiements')->whereIn('id', $ids)->delete();
            DocumentCommercial::withTrashed()->whereIn('id', $documents)->forceDelete();
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

    /** Lance PROCESSUS × PAR_PROCESSUS paiements de 100 au même instant sur la facture donnée ; renvoie tous les statuts HTTP. */
    private function lancerEnParallele(DocumentCommercial $facture): array
    {
        $jeton = $this->admin->createToken('concurrence-paiements')->plainTextToken;
        $script = base_path('tests/Support/creer_paiements_en_parallele.php');
        $depart = microtime(true) + 6.0;

        $processus = [];
        for ($i = 0; $i < self::PROCESSUS; $i++) {
            $p = new Process(
                [PHP_BINARY, $script, $jeton, (string) $this->party->id, (string) $facture->id, sprintf('%.6F', $depart), (string) self::PAR_PROCESSUS],
                base_path(),
                ['APP_ENV' => 'testing']
            );
            $p->setTimeout(180);
            $p->start();
            $processus[] = $p;
        }

        $statuts = [];
        foreach ($processus as $p) {
            $p->wait();
            $json = json_decode(trim($p->getOutput()), true);
            $this->assertIsArray($json, "Sortie inattendue d'un processus enfant : {$p->getOutput()} / {$p->getErrorOutput()}");
            $statuts = array_merge($statuts, $json['statuts']);
        }

        return $statuts;
    }

    public function test_des_paiements_simultanes_sur_la_meme_facture_sont_tous_acceptes_sans_doublon_ni_perte(): void
    {
        $statuts = $this->lancerEnParallele($this->facture);

        $total = self::PROCESSUS * self::PAR_PROCESSUS;
        fwrite(STDERR, "\n[concurrence paiements] {$total} requêtes -> ".count(array_filter($statuts, fn ($s) => $s === 201)).' créés, '
            .count(array_filter($statuts, fn ($s) => $s === 500)).' erreurs 500'."\n");

        $this->assertNotContains(500, $statuts, 'Aucun HTTP 500 attendu : deux paiements simultanés ne doivent jamais se heurter.');
        $this->assertSame(array_fill(0, $total, 201), $statuts, 'Tous les paiements doivent être créés.');

        $paiements = Paiement::where('document_id', $this->facture->id)->get();
        $this->assertCount($total, $paiements);
        $this->assertSame($paiements->pluck('reference')->all(), $paiements->pluck('reference')->unique()->values()->all(), 'Références uniques.');
        $this->assertEquals($total * 100, (float) $paiements->sum('prix_paye'));
        $this->assertEquals($total * 100, (float) DocumentCommercial::find($this->facture->id)->prix_paye,
            'Le prix payé de la facture doit être exactement la somme des paiements (aucune mise à jour perdue).');
    }

    /** Le reste à payer ne peut pas être dépassé, même par des paiements enregistrés exactement au même instant. */
    public function test_des_paiements_simultanes_ne_peuvent_jamais_depasser_le_reste_a_payer(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'numero' => 'PAYCONC-PETITE-'.uniqid(),
            'date_document' => '2026-10-06 09:00:00',
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 1000, 'tva_pourcent' => 0]], // 1 000 Dh TTC
        ])->json('data.id');
        $petite = DocumentCommercial::findOrFail($id);
        $this->autresFactures[] = $petite->id;

        $statuts = $this->lancerEnParallele($petite); // 24 demandes de 100 Dh, mais seulement 1 000 Dh à payer

        $acceptes = count(array_filter($statuts, fn ($s) => $s === 201));
        $refuses = count(array_filter($statuts, fn ($s) => $s === 422));
        fwrite(STDERR, "\n[concurrence surpaiement] ".count($statuts)." requêtes de 100 Dh pour 1 000 Dh à payer -> {$acceptes} acceptées, {$refuses} refusées (422), "
            .count(array_filter($statuts, fn ($s) => $s === 500))." erreurs 500\n");

        $this->assertNotContains(500, $statuts);
        $this->assertSame(10, $acceptes, 'Exactement 10 paiements de 100 Dh tiennent dans 1 000 Dh.');
        $this->assertSame(14, $refuses, 'Les 14 autres sont refusés (422).');
        $this->assertEquals(1000, (float) Paiement::where('document_id', $petite->id)->sum('prix_paye'));
        $this->assertEquals(1000, (float) DocumentCommercial::find($petite->id)->prix_paye, 'La facture est soldée, jamais dépassée.');

        $references = Paiement::where('document_id', $petite->id)->pluck('reference');
        $this->assertSame($references->all(), $references->unique()->values()->all(), 'Références uniques.');
    }

    /** Même règle quand une partie du « payé » a été saisie à la main sur la facture (sans paiement correspondant). */
    public function test_des_paiements_simultanes_tiennent_compte_du_paye_saisi_a_la_main(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $this->party->id,
            'numero' => 'PAYCONC-MANUEL-'.uniqid(),
            'date_document' => '2026-10-06 09:00:00',
            'prix_paye' => 300, // 300 Dh déjà payés à la main : il reste 700 Dh sur 1 000 Dh TTC
            'lignes' => [['designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 1000, 'tva_pourcent' => 0]],
        ])->json('data.id');
        $facture = DocumentCommercial::findOrFail($id);
        $this->autresFactures[] = $facture->id;

        $statuts = $this->lancerEnParallele($facture); // 24 demandes de 100 Dh

        $acceptes = count(array_filter($statuts, fn ($s) => $s === 201));
        fwrite(STDERR, "\n[concurrence payé manuel] 24 demandes de 100 Dh, reste réel 700 Dh -> {$acceptes} acceptées, "
            .count(array_filter($statuts, fn ($s) => $s === 422)).' refusées (422), '.count(array_filter($statuts, fn ($s) => $s === 500))." erreurs 500\n");

        $this->assertNotContains(500, $statuts);
        $this->assertSame(7, $acceptes, 'Exactement 7 paiements de 100 Dh tiennent dans les 700 Dh restants.');
        $this->assertSame(17, count(array_filter($statuts, fn ($s) => $s === 422)));
        $this->assertEquals(700, (float) Paiement::where('document_id', $facture->id)->sum('prix_paye'));
        $this->assertEquals(1000, (float) DocumentCommercial::find($facture->id)->prix_paye, '300 manuels conservés + 700 de paiements = facture soldée, jamais dépassée.');
    }
}