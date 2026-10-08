<?php

namespace App\Modules\Domiciliation\Tests\Feature;

use App\Models\Entreprise;
use App\Models\Party;
use App\Models\User;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Modules\Domiciliation\Models\Domiciliation;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Une période renouvelée ne doit plus générer d'alerte d'échéance.
 *
 * « Renouveler » crée une NOUVELLE période rattachée à l'ancienne (`renouvelle_de_id`) et laisse l'ancienne ligne
 * intacte (historique). Le statut d'affichage étant recalculé à partir de la `date_fin` de CHAQUE ligne, l'ancienne
 * période restait indéfiniment « Alerte » ou « Expiré » même une fois renouvelée.
 */
class DomiciliationRenouvellementAlerteTest extends TestCase
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

    private function periode(User $admin, string $depart, string $fin, ?int $entrepriseId = null): Domiciliation
    {
        if ($entrepriseId === null) {
            $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
            $entrepriseId = Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'ENT '.uniqid()])->party_id;
        }

        $id = $this->actingAs($admin)->postJson('/api/v1/domiciliations', [
            'entreprise_id' => $entrepriseId,
            'centre_domiciliation_id' => CentreDomiciliation::create(['nom' => 'CENTRE '.uniqid()])->id,
            'mois_payee' => 12, 'date_depart' => $depart, 'date_fin' => $fin,
            'mode_paiement' => 'Virement', 'prix_par_mois' => 100, 'prix_total' => 1200,
        ])->assertStatus(201)->json('data.id');

        return Domiciliation::findOrFail($id);
    }

    private function renouveler(User $admin, Domiciliation $d, array $champs): int
    {
        return $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$d->id}/renouveler", $champs)
            ->assertStatus(201)->json('data.id');
    }

    private function statut(User $admin, int $id): string
    {
        return $this->actingAs($admin)->getJson("/api/v1/domiciliations/{$id}")->assertOk()->json('data.statutAffichage');
    }

    /** @return array<int, string> id => statutAffichage pour toute la liste active. */
    private function statuts(User $admin): array
    {
        return collect($this->actingAs($admin)->getJson('/api/v1/domiciliations')->assertOk()->json('data'))
            ->pluck('statutAffichage', 'id')->all();
    }

    public function test_une_periode_en_alerte_cesse_d_etre_en_alerte_une_fois_renouvelee(): void
    {
        $admin = $this->admin();
        $ancienne = $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays(10)->toDateString());
        $this->assertSame('alerte', $this->statut($admin, $ancienne->id), 'Point de départ : la période est en alerte.');

        $nouvelle = $this->renouveler($admin, $ancienne, [
            'date_depart' => now()->addDays(11)->toDateString(), 'date_fin' => now()->addMonths(13)->toDateString(),
        ]);

        $statuts = $this->statuts($admin);
        $this->assertNotSame('alerte', $statuts[$ancienne->id], 'L\'ancienne échéance ne doit plus générer d\'alerte (liste).');
        $this->assertSame('active', $statuts[$nouvelle], 'L\'alerte est recalculée à partir de la nouvelle date de fin.');
        $this->assertNotSame('alerte', $this->statut($admin, $ancienne->id), 'Idem sur la fiche de l\'ancienne période.');
        $this->actingAs($admin)->getJson('/api/v1/domiciliations?statut=alerte')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_une_periode_expiree_cesse_d_etre_expiree_une_fois_renouvelee(): void
    {
        $admin = $this->admin();
        $ancienne = $this->periode($admin, now()->subMonths(14)->toDateString(), now()->subMonths(2)->toDateString());
        $this->assertSame('expire', $this->statut($admin, $ancienne->id));

        $nouvelle = $this->renouveler($admin, $ancienne, [
            'date_depart' => now()->subMonths(2)->addDay()->toDateString(), 'date_fin' => now()->addMonths(10)->toDateString(),
        ]);

        $statuts = $this->statuts($admin);
        $this->assertNotSame('expire', $statuts[$ancienne->id]);
        $this->assertSame('active', $statuts[$nouvelle]);
        $this->actingAs($admin)->getJson('/api/v1/domiciliations?statut=expire')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_un_renouvellement_proche_de_son_echeance_reste_en_alerte(): void
    {
        $admin = $this->admin();
        $ancienne = $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays(5)->toDateString());

        // Renouvellement court : la NOUVELLE période est elle-même à moins de 30 jours de sa fin.
        $nouvelle = $this->renouveler($admin, $ancienne, [
            'date_depart' => now()->addDays(6)->toDateString(), 'date_fin' => now()->addDays(20)->toDateString(),
        ]);

        $statuts = $this->statuts($admin);
        $this->assertSame('alerte', $statuts[$nouvelle], 'L\'alerte vient désormais de la nouvelle date de fin.');
        $this->assertNotSame('alerte', $statuts[$ancienne->id]);
    }

    public function test_une_autre_domiciliation_reellement_a_echeance_garde_son_alerte(): void
    {
        $admin = $this->admin();
        $renouvelee = $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays(10)->toDateString());
        $autre = $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays(12)->toDateString());
        $expiree = $this->periode($admin, now()->subYear()->toDateString(), now()->subDays(3)->toDateString());

        $this->renouveler($admin, $renouvelee, [
            'date_depart' => now()->addDays(11)->toDateString(), 'date_fin' => now()->addMonths(13)->toDateString(),
        ]);

        $statuts = $this->statuts($admin);
        $this->assertSame('alerte', $statuts[$autre->id], 'Une autre entreprise à échéance garde son alerte.');
        $this->assertSame('expire', $statuts[$expiree->id], 'Une période expirée non renouvelée reste expirée.');
    }

    public function test_une_periode_renouvelee_puis_resiliee_reste_resiliee(): void
    {
        $admin = $this->admin();
        $ancienne = $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays(10)->toDateString());
        $this->renouveler($admin, $ancienne, [
            'date_depart' => now()->addDays(11)->toDateString(), 'date_fin' => now()->addMonths(13)->toDateString(),
        ]);

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$ancienne->id}/resilier")->assertOk();

        $this->assertSame('resilie', $this->statut($admin, $ancienne->id), 'Résilié reste prioritaire sur tout le reste.');
    }

    public function test_le_renouvellement_supprime_ramene_l_alerte_de_l_ancienne_periode(): void
    {
        $admin = $this->admin();
        $ancienne = $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays(10)->toDateString());
        $nouvelle = $this->renouveler($admin, $ancienne, [
            'date_depart' => now()->addDays(11)->toDateString(), 'date_fin' => now()->addMonths(13)->toDateString(),
        ]);
        $this->assertNotSame('alerte', $this->statut($admin, $ancienne->id));

        // Renouvellement annulé (mis à la corbeille) : l'échéance n'est plus couverte, l'alerte revient.
        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$nouvelle}/corbeille")->assertOk();

        $this->assertSame('alerte', $this->statut($admin, $ancienne->id));
    }

    public function test_le_renouvellement_ne_modifie_pas_l_historique_de_l_ancienne_periode(): void
    {
        $admin = $this->admin();
        $ancienne = $this->periode($admin, '2026-01-01', '2027-01-01');
        $avant = Domiciliation::findOrFail($ancienne->id)->only(['entreprise_id', 'centre_domiciliation_id', 'date_depart', 'date_fin', 'etat', 'status', 'prix_total', 'updated_at']);

        $this->renouveler($admin, $ancienne, ['date_depart' => '2027-01-02', 'date_fin' => '2028-01-02']);

        $apres = Domiciliation::findOrFail($ancienne->id)->only(array_keys($avant));
        $this->assertEquals($avant, $apres, 'L\'ancienne période n\'est pas modifiée par un renouvellement.');
        $this->assertDatabaseHas('domiciliation_operations', ['domiciliation_id' => $ancienne->id, 'type' => 'renouvellement']);
    }

    public function test_la_liste_n_execute_pas_une_requete_par_ligne_pour_savoir_si_elle_est_renouvelee(): void
    {
        $admin = $this->admin();
        foreach (range(1, 6) as $i) {
            $this->periode($admin, now()->subMonths(11)->toDateString(), now()->addDays($i)->toDateString());
        }

        \DB::flushQueryLog();
        \DB::enableQueryLog();
        $this->actingAs($admin)->getJson('/api/v1/domiciliations')->assertOk();
        $renouvellements = collect(\DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'renouvelle_de_id'))->count();

        $this->assertLessThanOrEqual(2, $renouvellements, 'Le test de renouvellement doit être regroupé, pas répété par ligne.');
    }
}
