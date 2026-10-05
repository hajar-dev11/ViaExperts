<?php

namespace Tests\Feature;

use App\Models\CabinetSetting;
use App\Models\Client;
use App\Models\DocumentCommercial;
use App\Models\Party;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Concurrence sur la numérotation des documents (Facturation).
 *
 * Plusieurs processus PHP RÉELS créent des factures au même instant, chacun avec le numéro « proposé » lu juste
 * avant (comportement de l'interface). On vérifie les invariants qui ne doivent JAMAIS être violés :
 *   - aucun numéro n'est attribué deux fois ;
 *   - le compteur de numérotation avance exactement du nombre de documents réellement créés (pas de trou, pas de
 *     double saut) ;
 *   - au moins un document est créé.
 *
 * Ce test n'utilise PAS RefreshDatabase : les processus enfants doivent voir les données (transaction validée).
 * Les données créées sont donc supprimées explicitement à la fin (base de test dédiée `via_expert_app_test`).
 * Les résultats de chaque processus sont affichés pour documenter le comportement actuel sous concurrence.
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

    public function test_creations_simultanees_ne_produisent_jamais_deux_numeros_identiques(): void
    {
        $jeton = $this->admin->createToken('concurrence')->plainTextToken;
        $script = base_path('tests/Support/creer_document_en_parallele.php');
        $depart = microtime(true) + 6.0; // laisse à chaque processus le temps de démarrer l'application

        $processus = [];
        for ($i = 0; $i < self::PROCESSUS; $i++) {
            $p = new Process([PHP_BINARY, $script, $jeton, (string) $this->party->id, sprintf('%.6F', $depart)], base_path(), ['APP_ENV' => 'testing']);
            $p->setTimeout(120);
            $p->start();
            $processus[] = $p;
        }

        $resultats = [];
        foreach ($processus as $p) {
            $p->wait();
            $ligne = trim($p->getOutput());
            $json = json_decode(substr($ligne, (int) strrpos($ligne, "\n")), true) ?? json_decode($ligne, true);
            $this->assertIsArray($json, "Sortie inattendue d'un processus enfant : {$ligne} / {$p->getErrorOutput()}");
            $resultats[] = $json;
        }

        $crees = array_values(array_filter($resultats, fn ($r) => $r['statut'] === 201));
        $numeros = DocumentCommercial::where('numero', 'like', self::PREFIXE.'%')->orderBy('id')->pluck('numero')->all();

        fwrite(STDERR, "\n[concurrence] ".self::PROCESSUS.' processus -> statuts : '.implode(', ', array_column($resultats, 'statut'))
            .' | numéros proposés : '.implode(', ', array_column($resultats, 'propose'))."\n");

        $this->assertGreaterThanOrEqual(1, count($crees), 'Au moins un document doit être créé.');
        $this->assertCount(count($crees), $numeros, 'Chaque 201 correspond à exactement un document en base.');
        $this->assertSame($numeros, array_values(array_unique($numeros)), 'Aucun numéro ne doit être attribué deux fois.');

        // Le compteur avance d'exactement 1 par document réellement créé.
        $compteur = (int) CabinetSetting::first()->facture_prochain_numero;
        $this->assertSame(self::DEPART + count($crees), $compteur, 'Le compteur doit avancer du nombre exact de documents créés.');
    }
}
