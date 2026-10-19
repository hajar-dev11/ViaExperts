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
 * Contrôle de chevauchement et nouvelles tentatives : le contrôle ne compare que les périodes d'UNE MÊME entreprise
 * (identifiant `party_id`), les bornes sont inclusives, et une nouvelle tentative identique n'ajoute jamais une seconde période.
 */
class DomiciliationSoumissionTest extends TestCase
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

    private function centre(string $nom = 'CENTRE SOUMISSION'): CentreDomiciliation
    {
        return CentreDomiciliation::firstOrCreate(['nom' => $nom]);
    }

    private function creer(User $u, Entreprise $e, string $depart, ?string $fin, ?CentreDomiciliation $centre = null)
    {
        return $this->actingAs($u)->postJson('/api/v1/domiciliations', [
            'entreprise_id' => $e->party_id,
            'centre_domiciliation_id' => ($centre ?? $this->centre())->id,
            'mois_payee' => 12, 'date_depart' => $depart, 'date_fin' => $fin, 'mode_paiement' => 'Virement',
        ]);
    }

    // --- Deux entreprises différentes : mêmes dates permises ------------------------------------------------------

    public function test_deux_entreprises_differentes_peuvent_avoir_les_memes_dates_meme_sur_un_seul_jour(): void
    {
        $u = $this->admin();
        $a = $this->entreprise('SOCIETE A');
        $b = $this->entreprise('SOCIETE B');

        // Période d'un seul jour (début = fin = 10/10/2026), puis la même pour une autre entreprise, puis une période d'un an.
        $this->creer($u, $a, '2026-10-10', '2026-10-10')->assertStatus(201);
        $this->creer($u, $b, '2026-10-10', '2026-10-10')->assertStatus(201);
        $this->creer($u, $this->entreprise('SOCIETE C'), '2026-10-10', '2027-10-10')->assertStatus(201);

        $this->assertSame(1, Domiciliation::where('entreprise_id', $a->party_id)->count());
        $this->assertSame(1, Domiciliation::where('entreprise_id', $b->party_id)->count());
    }

    public function test_deux_entreprises_de_meme_nom_sont_distinguees_par_leur_identifiant(): void
    {
        $u = $this->admin();
        $a = $this->entreprise('MEME NOM');
        $b = $this->entreprise('MEME NOM');

        $this->creer($u, $a, '2026-10-10', '2027-10-10')->assertStatus(201);
        $this->creer($u, $b, '2026-10-10', '2027-10-10')->assertStatus(201);
    }

    public function test_une_ligne_incoherente_dont_la_fin_precede_le_depart_ne_bloque_personne(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('ANCIENNE DONNEE');
        // Ancienne donnée : fin avant le départ. Insérée directement (l'API la refuserait).
        Domiciliation::create([
            'entreprise_id' => $e->party_id, 'centre_domiciliation_id' => $this->centre()->id,
            'date_depart' => '2026-10-10', 'date_fin' => '2026-01-01',
        ]);

        $this->creer($u, $e, '2026-06-01', '2027-06-01')->assertStatus(201);
    }

    // --- Même entreprise : chevauchement et bornes ----------------------------------------------------------------

    public function test_le_message_de_chevauchement_nomme_l_entreprise_concernee(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE NOMMEE');
        $this->creer($u, $e, '2026-01-01', '2026-12-31')->assertStatus(201);

        $reponse = $this->creer($u, $e, '2026-06-01', '2027-06-01')->assertStatus(422)->assertJsonValidationErrors(['date_depart']);

        $this->assertStringContainsString('SOCIETE NOMMEE', $reponse->json('errors.date_depart.0'));
        $this->assertStringContainsString('01/01/2026 au 31/12/2026', $reponse->json('errors.date_depart.0'));
    }

    public function test_les_bornes_sont_inclusives(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('BORNES');
        $this->creer($u, $e, '2026-01-01', '2026-10-10')->assertStatus(201);

        $this->creer($u, $e, '2026-10-10', '2027-10-10')->assertStatus(422); // démarre le jour de la fin : 1 jour en commun
        $this->creer($u, $e, '2026-10-11', '2027-10-10')->assertStatus(201); // le lendemain : accepté
    }

    // --- Nouvelle tentative identique -----------------------------------------------------------------------------

    public function test_une_nouvelle_tentative_identique_n_ajoute_rien_et_le_dit_clairement(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RETENTEE');

        $this->creer($u, $e, '2026-10-10', '2027-10-10')->assertStatus(201);

        foreach (range(1, 3) as $tentative) {
            $reponse = $this->creer($u, $e, '2026-10-10', '2027-10-10')->assertStatus(422)->assertJsonValidationErrors(['date_depart']);
            $this->assertStringContainsString('déjà enregistrée', $reponse->json('errors.date_depart.0'));
            $this->assertStringContainsString('pas été ajoutée une seconde fois', $reponse->json('errors.date_depart.0'));
        }

        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_une_periode_sans_date_de_fin_retentee_n_ajoute_rien(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SANS FIN');

        $this->creer($u, $e, '2026-10-10', null)->assertStatus(201);
        $this->creer($u, $e, '2026-10-10', null)->assertStatus(422);

        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    public function test_les_memes_dates_dans_un_autre_centre_restent_un_chevauchement_pour_la_meme_entreprise(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('DEUX CENTRES');
        $this->creer($u, $e, '2026-10-10', '2027-10-10', $this->centre('CENTRE 1'))->assertStatus(201);

        $reponse = $this->creer($u, $e, '2026-10-10', '2027-10-10', $this->centre('CENTRE 2'))->assertStatus(422);
        $this->assertStringContainsString('chevauche', $reponse->json('errors.date_depart.0'));
        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }

    // --- Renouvellement -------------------------------------------------------------------------------------------

    public function test_renouvellement_valide_puis_nouvelle_tentative_sans_doublon(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RENOUVELEE');
        $autre = $this->entreprise('AUTRE SOCIETE');
        $ancienne = Domiciliation::findOrFail($this->creer($u, $e, '2025-10-10', '2026-10-10')->assertStatus(201)->json('data.id'));
        // Une autre entreprise a une période sur les mêmes dates que le renouvellement : aucun lien avec celui-ci.
        $this->creer($u, $autre, '2026-10-11', '2027-10-11')->assertStatus(201);

        $donnees = ['date_depart' => '2026-10-11', 'date_fin' => '2027-10-11']; // lendemain de l'échéance
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", $donnees)
            ->assertStatus(201)->assertJsonPath('data.renouvelleDeId', $ancienne->id);

        // Soumission répétée : refusée, aucune période supplémentaire.
        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", $donnees)
            ->assertStatus(422)->assertJsonValidationErrors(['domiciliation']);

        $this->assertSame(2, Domiciliation::where('entreprise_id', $e->party_id)->count());
        $this->assertSame(1, Domiciliation::where('entreprise_id', $autre->party_id)->count());
    }

    public function test_un_renouvellement_le_jour_meme_de_l_echeance_est_refuse_comme_chevauchement(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE BORNE');
        $ancienne = Domiciliation::findOrFail($this->creer($u, $e, '2025-10-10', '2026-10-10')->assertStatus(201)->json('data.id'));

        $this->actingAs($u)->postJson("/api/v1/domiciliations/{$ancienne->id}/renouveler", ['date_depart' => '2026-10-10', 'date_fin' => '2027-10-10'])
            ->assertStatus(422)->assertJsonValidationErrors(['date_depart']);
        $this->assertSame(1, Domiciliation::where('entreprise_id', $e->party_id)->count());
    }
}
