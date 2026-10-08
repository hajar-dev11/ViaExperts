<?php

namespace App\Modules\Domiciliation\Tests\Feature;

use App\Models\Entreprise;
use App\Models\Party;
use App\Models\User;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Modules\Domiciliation\Models\Domiciliation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Concurrence sur les périodes de domiciliation — VRAIS processus PHP qui frappent le serveur au même instant
 * (double-clic, deux onglets) : une seule période doit être créée, jamais deux périodes actives qui se chevauchent.
 *
 * Pas de RefreshDatabase : les processus enfants doivent voir les données validées ; tout est supprimé à la fin
 * (base de test dédiée `via_expert_app_test`).
 */
class DomiciliationConcurrenceTest extends TestCase
{
    private const PROCESSUS = 6;

    private ?User $admin = null;
    private ?Party $party = null;
    private ?CentreDomiciliation $centre = null;

    protected function setUp(): void
    {
        parent::setUp();

        if (! Schema::hasTable('domiciliations')) {
            $this->artisan('migrate', ['--force' => true]);
        }

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        Entreprise::create(['party_id' => $this->party->id, 'type' => 'entreprise', 'denomination' => 'ENTREPRISE CONCURRENCE PERIODES']);
        $this->centre = CentreDomiciliation::create(['nom' => 'CENTRE CONCURRENCE '.uniqid()]);
    }

    protected function tearDown(): void
    {
        if ($this->party) {
            $ids = DB::table('domiciliations')->where('entreprise_id', $this->party->id)->pluck('id');
            DB::table('domiciliation_operations')->whereIn('domiciliation_id', $ids)->delete();
            DB::table('domiciliations')->where('entreprise_id', $this->party->id)->delete();
            DB::table('entreprises')->where('party_id', $this->party->id)->delete();
            $this->party->forceDelete();
        }
        if ($this->centre) {
            DB::table('centres_domiciliation')->where('id', $this->centre->id)->delete();
        }
        if ($this->admin) {
            DB::table('personal_access_tokens')->where('tokenable_id', $this->admin->id)->delete();
            $this->admin->delete();
        }

        parent::tearDown();
    }

    /** Lance PROCESSUS requêtes identiques au même instant ; renvoie tous les statuts HTTP. */
    private function enParallele(string $methode, string $uri, array $corps): array
    {
        $jeton = $this->admin->createToken('concurrence-periodes')->plainTextToken;
        $script = base_path('tests/Support/requetes_en_parallele.php');
        $depart = microtime(true) + 6.0;

        $processus = [];
        for ($i = 0; $i < self::PROCESSUS; $i++) {
            $p = new Process(
                [PHP_BINARY, $script, $jeton, $methode, $uri, base64_encode(json_encode($corps)), sprintf('%.6F', $depart), '1'],
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
        sort($statuts);

        return $statuts;
    }

    public function test_des_creations_simultanees_de_periodes_qui_se_chevauchent_n_en_creent_qu_une(): void
    {
        $statuts = $this->enParallele('POST', '/api/v1/domiciliations', [
            'entreprise_id' => $this->party->id, 'centre_domiciliation_id' => $this->centre->id,
            'mois_payee' => 12, 'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31',
        ]);

        fwrite(STDERR, "\n[concurrence périodes] ".self::PROCESSUS.' créations identiques -> '.implode(', ', $statuts)."\n");

        $this->assertNotContains(500, $statuts, 'Aucun HTTP 500 attendu.');
        $this->assertSame([201, 422, 422, 422, 422, 422], $statuts);
        $this->assertSame(1, Domiciliation::where('entreprise_id', $this->party->id)->count(), 'Une seule période doit exister.');
    }

    public function test_des_renouvellements_simultanes_ne_creent_qu_une_seule_nouvelle_periode(): void
    {
        $ancienne = Domiciliation::create([
            'entreprise_id' => $this->party->id, 'centre_domiciliation_id' => $this->centre->id,
            'mois_payee' => 12, 'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31', 'created_by' => $this->admin->id,
        ]);
        $avant = $ancienne->fresh()->getAttributes();

        $statuts = $this->enParallele('POST', "/api/v1/domiciliations/{$ancienne->id}/renouveler", [
            'date_depart' => '2027-01-01', 'date_fin' => '2027-12-31', 'mois_payee' => 12,
        ]);

        fwrite(STDERR, "\n[concurrence renouvellement] ".self::PROCESSUS.' renouvellements identiques -> '.implode(', ', $statuts)."\n");

        $this->assertNotContains(500, $statuts, 'Aucun HTTP 500 attendu.');
        $this->assertSame([201, 422, 422, 422, 422, 422], $statuts);
        $this->assertSame(1, Domiciliation::where('renouvelle_de_id', $ancienne->id)->count(), 'Une seule nouvelle période créée.');
        $this->assertSame(2, Domiciliation::where('entreprise_id', $this->party->id)->count());
        $this->assertSame($avant, $ancienne->fresh()->getAttributes(), 'L\'ancienne période n\'a pas bougé.');
        $this->assertSame(1, DB::table('domiciliation_operations')->where('domiciliation_id', $ancienne->id)->where('type', 'renouvellement')->count(),
            'Un seul renouvellement journalisé.');
    }
}
