<?php

namespace App\Modules\Domiciliation\Tests\Feature;

use App\Models\Entreprise;
use App\Models\Party;
use App\Models\User;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Modules\Domiciliation\Models\Domiciliation;
use App\Modules\Domiciliation\Services\PrixDomiciliation;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 1. Périodes : le contrôle de chevauchement ne compare que les périodes d'UNE MÊME entreprise (identifiant `party_id`).
 * 2. Prix : prix total = prix par mois × mois PAYÉS ; les mois gratuits allongent la durée mais ne sont jamais facturés.
 *    Le serveur applique cette règle (le navigateur n'est pas cru sur parole) sans réécrire les montants historiques.
 */
class DomiciliationPrixEtPeriodesTest extends TestCase
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

    private function entreprise(string $nom): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => $nom]);
    }

    private function centre(): CentreDomiciliation
    {
        return CentreDomiciliation::firstOrCreate(['nom' => 'CENTRE PRIX']);
    }

    private function creer(User $u, Entreprise $e, string $depart, ?string $fin, array $plus = [])
    {
        return $this->actingAs($u)->postJson('/api/v1/domiciliations', array_merge([
            'entreprise_id' => $e->party_id,
            'centre_domiciliation_id' => $this->centre()->id,
            'mois_payee' => 12, 'mois_gratuits' => 0, 'date_depart' => $depart, 'date_fin' => $fin, 'mode_paiement' => 'Virement',
        ], $plus));
    }

    // ---- 1. Périodes ---------------------------------------------------------------------------------------------

    public function test_deux_entreprises_differentes_avec_exactement_les_memes_dates_sont_acceptees(): void
    {
        $u = $this->admin();

        // Y compris une période d'un seul jour : celle de « chiba » ne bloque pas l'autre entreprise.
        $this->creer($u, $this->entreprise('chiba'), '2026-10-12', '2026-10-12')->assertStatus(201);
        $this->creer($u, $this->entreprise('AUTRE SOCIETE'), '2026-10-12', '2026-10-12')->assertStatus(201);
        $this->creer($u, $this->entreprise('TROISIEME'), '2026-10-12', '2027-10-12')->assertStatus(201);

        $this->assertSame(3, Domiciliation::count());
    }

    public function test_deux_entreprises_differentes_avec_des_periodes_qui_se_chevauchent_partiellement_sont_acceptees(): void
    {
        $u = $this->admin();

        $this->creer($u, $this->entreprise('SOCIETE A'), '2026-01-01', '2026-12-31')->assertStatus(201);
        $this->creer($u, $this->entreprise('SOCIETE B'), '2026-06-15', '2027-06-14')->assertStatus(201);
        $this->creer($u, $this->entreprise('SOCIETE C'), '2025-09-01', '2026-02-01')->assertStatus(201);

        $this->assertSame(3, Domiciliation::count());
    }

    public function test_une_meme_entreprise_ne_peut_pas_avoir_deux_periodes_actives_qui_se_chevauchent(): void
    {
        $u = $this->admin();
        $chiba = $this->entreprise('chiba');
        $this->creer($u, $chiba, '2026-10-12', '2026-10-12')->assertStatus(201);

        // La même entreprise, même jour : refusé avec le nom de l'entreprise concernée, et rien n'est ajouté.
        $reponse = $this->creer($u, $chiba, '2026-10-12', '2027-10-12', ['centre_domiciliation_id' => CentreDomiciliation::create(['nom' => 'AUTRE CENTRE'])->id])
            ->assertStatus(422)->assertJsonValidationErrors(['date_depart']);
        $this->assertStringContainsString('chiba', $reponse->json('errors.date_depart.0'));
        $this->assertStringContainsString('12/10/2026 au 12/10/2026', $reponse->json('errors.date_depart.0'));

        $this->assertSame(1, Domiciliation::where('entreprise_id', $chiba->party_id)->count());
    }

    public function test_une_nouvelle_tentative_identique_n_ajoute_aucun_doublon(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RETENTATIVE');

        $this->creer($u, $e, '2026-03-01', '2027-02-28')->assertStatus(201);
        $this->creer($u, $e, '2026-03-01', '2027-02-28')->assertStatus(422);

        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_qui_suit_immediatement_la_precedente_est_acceptee_et_une_qui_la_recoupe_d_un_jour_est_refusee(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE SUITE');
        $this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201);

        $this->creer($u, $e, '2026-12-31', '2027-12-30')->assertStatus(422);  // bornes inclusives : un jour en commun
        $this->creer($u, $e, '2027-01-01', '2027-12-31')->assertStatus(201);  // le lendemain : valide

        $this->assertSame(2, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_archivee_ou_resiliee_ne_bloque_pas_une_nouvelle_periode_de_l_entreprise(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE LIBEREE');
        $id = $this->creer($u, $e, '2026-01-01', '2026-12-31')->json('data.id');
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$id}/archive")->assertOk();

        $this->creer($u, $e, '2026-06-01', '2027-05-31')->assertStatus(201);
    }

    // ---- 2. Prix et mois gratuits --------------------------------------------------------------------------------

    public function test_les_mois_gratuits_ne_sont_pas_factures(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE GRATUITS');

        // 10 mois payés + 2 mois gratuits à 100 Dh : 10 mois facturés = 1000 Dh (et non 12 × 100 = 1200).
        // Aucun total fourni : le serveur applique la règle (prix par mois × mois PAYÉS).
        $this->creer($u, $e, '2026-01-01', '2026-12-31', [
            'mois_payee' => 10, 'mois_gratuits' => 2, 'prix_par_mois' => 100,
        ])->assertStatus(201)
            ->assertJsonPath('data.prixTotal', '1000.00')
            ->assertJsonPath('data.moisPayee', 10)
            ->assertJsonPath('data.moisGratuits', 2);

        $this->assertDatabaseHas('domiciliations', ['entreprise_id' => $e->party_id, 'prix_total' => '1000.00', 'mois_gratuits' => 2]);
    }

    public function test_sans_mois_gratuit_le_prix_est_inchange(): void
    {
        $u = $this->admin();

        $this->creer($u, $this->entreprise('SOCIETE SANS GRATUIT'), '2026-01-01', '2026-12-31', [
            'mois_payee' => 12, 'mois_gratuits' => 0, 'prix_par_mois' => 104, 'prix_total' => 1248,
        ])->assertStatus(201)->assertJsonPath('data.prixTotal', '1248.00');
    }

    public function test_le_prix_total_saisi_a_la_main_est_enregistre_tel_quel_et_relu(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE TOTAL MANUEL');

        // Total différent du calcul (remise commerciale, forfait…) : conservé, pas recalculé par le serveur.
        $id = $this->creer($u, $e, '2026-01-01', '2026-12-31', ['mois_payee' => 12, 'prix_par_mois' => 100, 'prix_total' => 950])
            ->assertStatus(201)->assertJsonPath('data.prixTotal', '950.00')->json('data.id');

        $this->actingAs($u)->getJson("/api/v1/domiciliations/{$id}")->assertJsonPath('data.prixTotal', '950.00');
        // Enregistrer la fiche en renvoyant les mêmes valeurs (modification) ne touche pas au total manuel.
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", ['prix_par_mois' => 100, 'prix_total' => 950, 'mois_payee' => 12])
            ->assertOk()->assertJsonPath('data.prixTotal', '950.00');
        // Une nouvelle valeur manuelle remplace l'ancienne.
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", ['prix_total' => 1000])
            ->assertOk()->assertJsonPath('data.prixTotal', '1000.00');
    }

    public function test_le_prix_par_mois_garde_sa_precision_et_le_total_est_arrondi_selon_la_regle_du_demi(): void
    {
        $u = $this->admin();

        // [saisi, prix par mois enregistré (exact), total enregistré (arrondi)]
        foreach ([
            ['104.17', '104.17', '104.00'], ['100.80', '100.80', '101.00'], ['100.50', '100.50', '101.00'], ['100.49', '100.49', '100.00'], ['104.00', '104.00', '104.00'],
        ] as $i => [$saisi, $prix, $total]) {
            $this->creer($u, $this->entreprise("SOCIETE ARRONDI {$i}"), '2026-01-01', '2026-12-31', ['mois_payee' => 1, 'prix_par_mois' => $saisi, 'prix_total' => $saisi])
                ->assertStatus(201)
                ->assertJsonPath('data.prixParMois', $prix)
                ->assertJsonPath('data.prixTotal', $total);
        }
    }

    public function test_le_total_calcule_part_du_prix_par_mois_exact_puis_est_arrondi(): void
    {
        $u = $this->admin();

        // 104,17 reste 104,17 ; 12 mois payés → 1 250,04 → arrondi à 1 250.
        $this->creer($u, $this->entreprise('SOCIETE CALCUL ARRONDI'), '2026-01-01', '2026-12-31', ['mois_payee' => 12, 'prix_par_mois' => 104.17])
            ->assertStatus(201)->assertJsonPath('data.prixParMois', '104.17')->assertJsonPath('data.prixTotal', '1250.00');
    }

    public function test_un_montant_historique_renvoye_a_l_identique_n_est_pas_arrondi_ni_reecrit(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE MONTANT ANCIEN');
        // Donnée ancienne : prix et total avec centimes, enregistrés avant la règle d'arrondi.
        $d = Domiciliation::create([
            'entreprise_id' => $e->party_id, 'centre_domiciliation_id' => $this->centre()->id, 'mois_payee' => 12, 'mois_gratuits' => 0,
            'prix_par_mois' => 104.17, 'prix_total' => 1250.04, 'date_depart' => '2025-01-01', 'date_fin' => '2025-12-31',
        ]);

        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$d->id}", ['prix_par_mois' => 104.17, 'prix_total' => 1250.04, 'mois_payee' => 12, 'date_paiement' => '2025-02-02'])
            ->assertOk()->assertJsonPath('data.prixParMois', '104.17')->assertJsonPath('data.prixTotal', '1250.04');
    }

    public function test_uniquement_des_mois_gratuits_donne_un_total_nul(): void
    {
        $u = $this->admin();

        $this->creer($u, $this->entreprise('SOCIETE TOUT GRATUIT'), '2026-01-01', '2026-03-31', [
            'mois_payee' => 0, 'mois_gratuits' => 3, 'prix_par_mois' => 100,
        ])->assertStatus(201)->assertJsonPath('data.prixTotal', '0.00');
    }

    public function test_sans_prix_par_mois_le_total_envoye_est_conserve(): void
    {
        $u = $this->admin();

        $this->creer($u, $this->entreprise('SOCIETE SANS TARIF'), '2026-01-01', '2026-12-31', ['prix_total' => 500])
            ->assertStatus(201)->assertJsonPath('data.prixTotal', '500.00');
    }

    public function test_le_calcul_part_du_prix_exact_arrondit_le_total_et_ignore_les_mois_negatifs(): void
    {
        $this->assertSame('1250.00', PrixDomiciliation::total(104.17, 12));  // 1 250,04 → 1 250
        $this->assertSame('1206.00', PrixDomiciliation::total(100.50, 12));  // 1 206,00
        $this->assertSame('100.00', PrixDomiciliation::total(33.33, 3));     // 99,99 → 100
        $this->assertSame('104.17', PrixDomiciliation::exact('104.1700'));
        $this->assertSame('104.00', PrixDomiciliation::exact(104));
        $this->assertSame('0.00', PrixDomiciliation::total(100, 0));
        $this->assertSame('0.00', PrixDomiciliation::total(100, -4));
        $this->assertSame('350.00', PrixDomiciliation::total('350', 1));
    }

    public function test_une_modification_sans_changer_prix_ni_mois_payes_ne_reecrit_pas_le_montant_historique(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE HISTORIQUE');
        // Ancien enregistrement, calculé autrefois avec les mois gratuits (12 × 100 = 1200 alors que 2 mois étaient gratuits).
        $d = Domiciliation::create([
            'entreprise_id' => $e->party_id, 'centre_domiciliation_id' => $this->centre()->id,
            'mois_payee' => 10, 'mois_gratuits' => 2, 'prix_par_mois' => 100, 'prix_total' => 1200,
            'date_depart' => '2025-01-01', 'date_fin' => '2025-12-31',
        ]);

        // Enregistrer la fiche en renvoyant les mêmes valeurs (comme le fait le formulaire) ne change pas le montant.
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$d->id}", [
            'mois_payee' => 10, 'mois_gratuits' => 2, 'prix_par_mois' => 100, 'prix_total' => 1200, 'date_paiement' => '2025-02-02',
        ])->assertOk()->assertJsonPath('data.prixTotal', '1200.00');

        // Modifier seulement les mois gratuits ne touche pas au montant (ils ne sont pas facturés).
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$d->id}", ['mois_gratuits' => 1])
            ->assertOk()->assertJsonPath('data.prixTotal', '1200.00');
    }

    public function test_changer_les_mois_payes_ou_le_prix_par_mois_recalcule_le_total(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RECALCUL');
        $id = $this->creer($u, $e, '2026-01-01', '2026-12-31', ['mois_payee' => 10, 'mois_gratuits' => 2, 'prix_par_mois' => 100])->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", ['mois_payee' => 11])
            ->assertOk()->assertJsonPath('data.prixTotal', '1100.00');
        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", ['prix_par_mois' => 120])
            ->assertOk()->assertJsonPath('data.prixTotal', '1320.00');
    }

    // ---- 3. Renouvellement ---------------------------------------------------------------------------------------

    public function test_un_renouvellement_calcule_periode_mois_gratuits_et_prix_avec_la_meme_regle(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RENOUVELLEMENT');
        $origine = $this->creer($u, $e, '2025-01-01', '2025-12-31', ['mois_payee' => 12, 'prix_par_mois' => 100])->json('data.id');

        // 6 mois payés + 3 gratuits à 100 Dh : 9 mois de contrat (01/01/2026 → 30/09/2026), 600 Dh facturés.
        // Aucun total fourni : le serveur applique la règle (prix par mois × mois PAYÉS).
        $r = $this->actingAs($u)->postJson("/api/v1/domiciliations/{$origine}/renouveler", [
            'date_depart' => '2026-01-01', 'date_fin' => '2026-09-30',
            'mois_payee' => 6, 'mois_gratuits' => 3, 'prix_par_mois' => 100,
        ])->assertSuccessful()
            ->assertJsonPath('data.renouvelleDeId', $origine)
            ->assertJsonPath('data.dateDepart', '2026-01-01')
            ->assertJsonPath('data.dateFin', '2026-09-30')
            ->assertJsonPath('data.moisPayee', 6)
            ->assertJsonPath('data.moisGratuits', 3)
            ->assertJsonPath('data.prixTotal', '600.00');

        // La période d'origine n'est pas touchée (montant historique conservé).
        $this->actingAs($u)->getJson("/api/v1/domiciliations/{$origine}")
            ->assertJsonPath('data.prixTotal', '1200.00')
            ->assertJsonPath('data.dateFin', '2025-12-31');

        $this->assertNotNull($r->json('data.id'));
    }

    public function test_un_renouvellement_qui_chevauche_la_periode_d_origine_est_refuse(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RENOUVELLEMENT TROP TOT');
        $origine = $this->creer($u, $e, '2026-01-01', '2026-12-31')->json('data.id');

        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$origine}/renouveler", [
            'date_depart' => '2026-12-31', 'date_fin' => '2027-12-30', 'mois_payee' => 12, 'prix_par_mois' => 100,
        ])->assertStatus(422);

        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_le_renouvellement_d_une_entreprise_ne_bloque_pas_les_autres_entreprises(): void
    {
        $u = $this->admin();
        $a = $this->entreprise('SOCIETE A');
        $origineA = $this->creer($u, $a, '2025-01-01', '2025-12-31')->json('data.id');
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$origineA}/renouveler", [
            'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31', 'mois_payee' => 12, 'prix_par_mois' => 100,
        ])->assertSuccessful();

        // Une autre entreprise prend exactement les mêmes dates que le renouvellement de A.
        $this->creer($u, $this->entreprise('SOCIETE B'), '2026-01-01', '2026-12-31')->assertStatus(201);
    }
}
