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
 * Périodes de domiciliation : aucun chevauchement entre périodes actives d'une même entreprise, renouvellement unique,
 * ancienne période intacte. Les protections sont côté serveur (le frontend ne peut pas les contourner).
 */
class DomiciliationPeriodesTest extends TestCase
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

    private function entreprise(): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'ENT '.$party->id]);
    }

    private function payload(Entreprise $e, string $depart, ?string $fin): array
    {
        return [
            'entreprise_id' => $e->party_id,
            'centre_domiciliation_id' => CentreDomiciliation::firstOrCreate(['nom' => 'CENTRE PERIODES'])->id,
            'mois_payee' => 12, 'date_depart' => $depart, 'date_fin' => $fin, 'mode_paiement' => 'Virement',
        ];
    }

    private function creer(User $u, Entreprise $e, string $depart, ?string $fin)
    {
        return $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->payload($e, $depart, $fin));
    }

    // --- Création -------------------------------------------------------------------------------------------------

    public function test_une_periode_qui_chevauche_une_periode_active_est_refusee(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201);

        // Chevauchement partiel, total, inclus, et par le jour même de la fin (bornes inclusives).
        foreach ([['2026-06-01', '2027-06-01'], ['2025-06-01', '2026-02-01'], ['2026-03-01', '2026-04-01'], ['2026-12-31', '2027-12-31'], ['2025-01-01', null]] as [$d, $f]) {
            $this->creer($u, $e, $d, $f)->assertStatus(422)->assertJsonValidationErrors(['date_depart']);
        }

        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count(), 'Aucune période refusée ne doit être créée.');
    }

    public function test_une_periode_sans_date_de_fin_couvre_tout_ce_qui_suit(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $this->creer($u, $e, '2026-01-01', null)->assertStatus(201);

        $this->creer($u, $e, '2030-01-01', '2030-12-31')->assertStatus(422);
        $this->creer($u, $e, '2025-01-01', '2025-12-31')->assertStatus(201); // antérieure : pas de chevauchement
    }

    public function test_des_periodes_qui_ne_se_chevauchent_pas_sont_acceptees(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();

        $this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201);
        $this->creer($u, $e, '2027-01-01', '2027-12-31')->assertStatus(201); // juste après
        $this->creer($u, $e, '2025-01-01', '2025-12-31')->assertStatus(201); // juste avant
        $this->creer($u, $this->entreprise(), '2026-01-01', '2026-12-31')->assertStatus(201); // autre entreprise : mêmes dates permises

        $this->assertSame(3, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_resiliee_ou_en_corbeille_ne_bloque_pas_une_nouvelle_periode(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $resiliee = Domiciliation::findOrFail($this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id'));
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$resiliee->id}/resilier")->assertOk();

        $corbeille = Domiciliation::findOrFail($this->creer($u, $e, '2027-01-01', '2027-12-31')->assertStatus(201)->json('data.id'));
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$corbeille->id}/corbeille")->assertOk();

        $this->creer($u, $e, '2026-06-01', '2027-06-01')->assertStatus(201);
    }

    // --- Modification / restauration ------------------------------------------------------------------------------

    public function test_modifier_les_dates_d_une_periode_ne_peut_pas_creer_un_chevauchement(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201);
        $seconde = $this->creer($u, $e, '2027-01-01', '2027-12-31')->assertStatus(201)->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$seconde}", ['date_depart' => '2026-06-01'])->assertStatus(422);
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$seconde}", ['date_fin' => '2027-06-30'])->assertOk();
    }

    public function test_une_date_de_fin_anterieure_au_depart_est_refusee_meme_en_mise_a_jour_partielle(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $id = $this->creer($u, $e, '2026-06-01', '2027-06-01')->assertStatus(201)->json('data.id');

        // Seule `date_fin` est envoyée : la règle `after_or_equal:date_depart` seule ne compare pas à la valeur en base.
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", ['date_fin' => '2026-01-01'])->assertStatus(422)->assertJsonValidationErrors(['date_fin']);
        $this->assertSame('2027-06-01', Domiciliation::findOrFail($id)->date_fin->toDateString());
    }

    public function test_restaurer_une_periode_qui_chevauche_une_periode_active_est_refuse(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $a = $this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id');
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$a}/corbeille")->assertOk();
        $this->creer($u, $e, '2026-06-01', '2027-06-01')->assertStatus(201); // prend la place pendant que A est en corbeille

        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$a}/restore")->assertStatus(422);
        $this->assertSame('corbeille', Domiciliation::findOrFail($a)->status);
    }

    // --- Renouvellement -------------------------------------------------------------------------------------------

    public function test_un_renouvellement_valide_est_accepte_et_l_ancienne_periode_reste_intacte(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $ancienne = Domiciliation::findOrFail($this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id'));
        $avant = $ancienne->fresh()->getAttributes();

        $nouvelle = $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", [
            'date_depart' => '2027-01-01', 'date_fin' => '2027-12-31',
        ])->assertStatus(201)->assertJsonPath('data.renouvelleDeId', $ancienne->id)->json('data.id');

        $this->assertSame($avant, $ancienne->fresh()->getAttributes(), 'Les données historiques de l\'ancienne période sont inchangées.');
        $this->assertSame(2, Domiciliation::where('entreprise_id', $e->party_id)->count());
        $this->assertNotNull(Domiciliation::find($nouvelle));
    }

    public function test_un_renouvellement_qui_chevauche_est_refuse(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $ancienne = Domiciliation::findOrFail($this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id'));

        // Démarre avant la fin de la période renouvelée.
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", ['date_depart' => '2026-10-01', 'date_fin' => '2027-10-01'])
            ->assertStatus(422)->assertJsonValidationErrors(['date_depart']);
        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_deja_renouvelee_ne_peut_pas_l_etre_une_seconde_fois(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $ancienne = Domiciliation::findOrFail($this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id'));
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", ['date_depart' => '2027-01-01', 'date_fin' => '2027-12-31'])->assertStatus(201);

        // Mêmes dates ou dates différentes : refusé, c'est la période déjà créée qui prolonge l'ancienne.
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", ['date_depart' => '2027-01-01', 'date_fin' => '2027-12-31'])
            ->assertStatus(422)->assertJsonValidationErrors(['domiciliation']);
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", ['date_depart' => '2030-01-01', 'date_fin' => '2030-12-31'])
            ->assertStatus(422)->assertJsonValidationErrors(['domiciliation']);

        $this->assertSame(2, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_archivee_ou_en_corbeille_ne_peut_pas_etre_renouvelee(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $p = Domiciliation::findOrFail($this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id'));
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$p->id}/archive")->assertOk();

        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$p->id}/renouveler", ['date_depart' => '2027-01-01', 'date_fin' => '2027-12-31'])->assertStatus(422);
        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_renouvelee_garde_ses_dates_et_son_entreprise(): void
    {
        $u = $this->admin();
        $e = $this->entreprise();
        $autre = $this->entreprise();
        $ancienne = Domiciliation::findOrFail($this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201)->json('data.id'));
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", ['date_depart' => '2027-01-01', 'date_fin' => '2027-12-31'])->assertStatus(201);

        foreach ([['date_fin' => '2027-06-30'], ['date_depart' => '2025-01-01'], ['entreprise_id' => $autre->party_id]] as $changement) {
            $this->actingAs($u)->putJson("/api/v1/domiciliations/{$ancienne->id}", $changement)->assertStatus(422);
        }
        // Les autres informations (mode de paiement, prix…) restent modifiables.
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$ancienne->id}", ['mode_paiement' => 'Chèque'])->assertOk();

        $fraiche = $ancienne->fresh();
        $this->assertSame('2026-12-31', $fraiche->date_fin->toDateString());
        $this->assertSame('2026-01-01', $fraiche->date_depart->toDateString());
        $this->assertSame($e->party_id, $fraiche->entreprise_id);
    }
}
