<?php

namespace Tests\Feature;

use App\Models\CabinetSetting;
use App\Models\Client;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Models\Party;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Concurrence sur la numérotation des documents (Facturation) — VRAIS processus PHP.
 *
 * Plusieurs processus PHP créent des factures au même instant (via le noyau HTTP de l'application, avec un jeton
 * Sanctum), chacun avec le numéro « proposé » lu juste avant, comme le fait l'interface. On vérifie les invariants
 * qui ne doivent JAMAIS être violés :
 *   - aucun numéro n'est attribué deux fois ;
 *   - le compteur avance d'exactement le nombre de documents réellement créés (aucune perte, aucun double saut) ;
 *   - une collision de numéro est refusée proprement (HTTP 422 sur le champ `numero`), jamais par un HTTP 500.
 *
 * Ce test n'utilise PAS RefreshDatabase : les processus enfants doivent voir les données (transactions validées). Les
 * données créées sont donc supprimées explicitement à la fin (base de test dédiée `via_expert_app_test`).
 */
class NumerotationConcurrenceTest extends TestCase
{
    private const PROCESSUS = 6;
    private const PREFIXE = 'CONC-';
    private const DEPART = 500;

    private ?User $admin = null;
    private ?Party $party = null;
    private ?CabinetSetting $reglages = null;
    private bool $reglagesCrees = false;
    private array $reglagesInitiaux = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (! Schema::hasTable('documents_commerciaux')) {
            $this->artisan('migrate', ['--force' => true]);
        }

        $this->admin = User::factory()->create(['is_admin' => true]);

        $this->party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $this->party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT CONCURRENCE']);

        $this->reglages = CabinetSetting::firstOrCreate([]);
        $this->reglagesCrees = $this->reglages->wasRecentlyCreated;
        $this->reglagesInitiaux = $this->reglages->only(['facture_prefixe', 'facture_prochain_numero', 'facture_suffixe']);
        $this->reglages->forceFill([
            'facture_prefixe' => self::PREFIXE, 'facture_prochain_numero' => self::DEPART, 'facture_suffixe' => '/T',
        ])->save();
    }

    protected function tearDown(): void
    {
        // Nettoyage explicite : les enfants ont validé leurs transactions.
        DocumentCommercial::withTrashed()->where('numero', 'like', self::PREFIXE.'%')->forceDelete();

        if ($this->reglages) {
            if ($this->reglagesCrees) {
                $this->reglages->delete();
            } else {
                $this->reglages->forceFill($this->reglagesInitiaux)->save();
            }
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

    /**
     * Lance PROCESSUS processus PHP qui démarrent au même instant et renvoie le JSON de chacun.
     *
     * @return list<array{propose: ?string, statut: ?int, statuts: list<int>, erreurs: list<list<string>>, crees: int}>
     */
    private function lancerEnParallele(int $documentsParProcessus, bool $reessayer): array
    {
        $jeton = $this->admin->createToken('concurrence')->plainTextToken;
        $script = base_path('tests/Support/creer_document_en_parallele.php');
        $depart = microtime(true) + 6.0; // laisse à chaque processus le temps de démarrer l'application

        $processus = [];
        for ($i = 0; $i < self::PROCESSUS; $i++) {
            $p = new Process(
                [PHP_BINARY, $script, $jeton, (string) $this->party->id, sprintf('%.6F', $depart), (string) $documentsParProcessus, $reessayer ? '1' : '0'],
                base_path(),
                ['APP_ENV' => 'testing']
            );
            $p->setTimeout(180);
            $p->start();
            $processus[] = $p;
        }

        $resultats = [];
        foreach ($processus as $p) {
            $p->wait();
            $json = json_decode(trim($p->getOutput()), true);
            $this->assertIsArray($json, "Sortie inattendue d'un processus enfant : {$p->getOutput()} / {$p->getErrorOutput()}");
            $resultats[] = $json;
        }

        return $resultats;
    }

    private function numerosEnBase(): array
    {
        return DocumentCommercial::where('numero', 'like', self::PREFIXE.'%')->orderBy('id')->pluck('numero')->all();
    }

    /** Collision simultanée sur le MÊME numéro : un seul gagnant, les autres reçoivent un 422 propre. */
    public function test_creations_simultanees_ne_produisent_jamais_deux_numeros_identiques(): void
    {
        $resultats = $this->lancerEnParallele(1, false);

        $statuts = array_column($resultats, 'statut');
        $crees = array_filter($statuts, fn ($s) => $s === 201);
        $numeros = $this->numerosEnBase();

        fwrite(STDERR, "\n[concurrence] ".self::PROCESSUS.' processus, 1 tentative chacun -> statuts : '.implode(', ', $statuts)
            .' | numéros proposés : '.implode(', ', array_column($resultats, 'propose'))."\n");

        $this->assertGreaterThanOrEqual(1, count($crees), 'Au moins un document doit être créé.');
        $this->assertNotContains(500, $statuts, 'Une collision de numéro ne doit jamais produire un HTTP 500.');
        $this->assertEqualsCanonicalizing([], array_diff($statuts, [201, 422]), 'Seuls 201 (créé) et 422 (numéro déjà pris) sont attendus.');

        // Chaque refus est une erreur de validation sur le champ `numero`.
        foreach ($resultats as $r) {
            if ($r['statut'] === 422) {
                $this->assertSame(['numero'], $r['erreurs'][0]);
            }
        }

        $this->assertCount(count($crees), $numeros, 'Chaque 201 correspond à exactement un document en base.');
        $this->assertSame($numeros, array_values(array_unique($numeros)), 'Aucun numéro ne doit être attribué deux fois.');
        $this->assertSame(self::DEPART + count($crees), (int) CabinetSetting::first()->facture_prochain_numero, 'Le compteur doit avancer du nombre exact de documents créés.');
    }

    /** Charge soutenue : tout le monde réessaie après un refus. Numéros consécutifs, compteur sans perte. */
    public function test_charge_concurrente_avec_reessais_produit_des_numeros_consecutifs_sans_perte_de_compteur(): void
    {
        $parProcessus = 2;
        $resultats = $this->lancerEnParallele($parProcessus, true);

        $total = self::PROCESSUS * $parProcessus;
        $tousStatuts = array_merge(...array_column($resultats, 'statuts'));
        $numeros = $this->numerosEnBase();

        fwrite(STDERR, "\n[concurrence] ".self::PROCESSUS." processus x {$parProcessus} documents, avec réessais -> ".count($tousStatuts)
            .' requêtes : '.count(array_filter($tousStatuts, fn ($s) => $s === 201)).' créés, '
            .count(array_filter($tousStatuts, fn ($s) => $s === 422)).' refus 422, '
            .count(array_filter($tousStatuts, fn ($s) => $s === 500)).' erreurs 500'."\n");

        $this->assertNotContains(500, $tousStatuts, 'Aucun HTTP 500 attendu, même sous forte concurrence.');
        $this->assertSame($total, array_sum(array_column($resultats, 'crees')), 'Chaque processus doit finir par créer tous ses documents.');
        $this->assertCount($total, $numeros);
        $this->assertSame($numeros, array_values(array_unique($numeros)), 'Aucun numéro en double.');

        // Numéros consécutifs : 500, 501, … sans trou ni saut.
        $attendus = [];
        for ($i = 0; $i < $total; $i++) {
            $attendus[] = self::PREFIXE.(self::DEPART + $i).'/T';
        }
        $this->assertEqualsCanonicalizing($attendus, $numeros, 'Les numéros doivent être consécutifs, sans trou.');
        $this->assertSame(self::DEPART + $total, (int) CabinetSetting::first()->facture_prochain_numero, 'Aucune perte de compteur.');
    }
}
