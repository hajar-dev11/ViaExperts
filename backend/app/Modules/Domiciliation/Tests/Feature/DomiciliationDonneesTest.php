<?php

namespace App\Modules\Domiciliation\Tests\Feature;

use App\Models\Entreprise;
use App\Models\Party;
use App\Models\User;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Modules\Domiciliation\Models\Domiciliation;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Ce que le formulaire « Nouvelle Domiciliation » envoie est réellement enregistré, sur la bonne domiciliation :
 * dates conservées telles que saisies (aucun décalage) et cases « Documents du dossier » persistées puis relues.
 * Renouvellements : le lien avec la période d'origine est exposé, c'est lui qui distingue « Nouveau » de « Renouveler ».
 */
class DomiciliationDonneesTest extends TestCase
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
        return CentreDomiciliation::firstOrCreate(['nom' => 'CENTRE DONNEES']);
    }

    /** Corps de requête identique à celui du formulaire (voir `construirePayload`). */
    private function corps(Entreprise $e, array $surcharge = []): array
    {
        return array_merge([
            'entreprise_id' => $e->party_id,
            'centre_domiciliation_id' => $this->centre()->id,
            'mois_payee' => 12,
            'mois_gratuits' => 0,
            'date_depart' => '2026-03-31',
            'date_fin' => '2027-03-31',
            'mode_paiement' => 'Virement',
            'prix_par_mois' => 104.17,
            'prix_total' => 1250.04,
            'signature_sur_facture' => true,
            'date_facture' => '2026-04-01',
            'date_paiement' => '2026-04-02',
            'date_legalisation' => '2026-04-03',
            'doc_facture' => false,
            'doc_contrat' => false,
            'doc_attestation' => false,
            'doc_procuration' => false,
        ], $surcharge);
    }

    public function test_les_dates_saisies_sont_enregistrees_et_relues_sans_decalage(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE DATES');

        $id = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e))
            ->assertStatus(201)
            ->assertJsonPath('data.dateDepart', '2026-03-31')
            ->assertJsonPath('data.dateFin', '2027-03-31')
            ->assertJsonPath('data.dateFacture', '2026-04-01')
            ->assertJsonPath('data.datePaiement', '2026-04-02')
            ->assertJsonPath('data.dateLegalisation', '2026-04-03')
            ->json('data.id');

        // Valeurs brutes en base : colonnes DATE, le jour saisi est le jour stocké.
        $ligne = DB::table('domiciliations')->where('id', $id)->first();
        $this->assertSame('2026-03-31', substr((string) $ligne->date_depart, 0, 10));
        $this->assertSame('2027-03-31', substr((string) $ligne->date_fin, 0, 10));
        $this->assertSame('2026-04-01', substr((string) $ligne->date_facture, 0, 10));
        $this->assertSame('2026-04-02', substr((string) $ligne->date_paiement, 0, 10));
        $this->assertSame('2026-04-03', substr((string) $ligne->date_legalisation, 0, 10));

        // Relecture (fiche et liste) : mêmes dates.
        $this->actingAs($u)->getJson("/api/v1/domiciliations/{$id}")
            ->assertOk()
            ->assertJsonPath('data.dateDepart', '2026-03-31')
            ->assertJsonPath('data.dateFin', '2027-03-31');
        $this->actingAs($u)->getJson('/api/v1/domiciliations')->assertOk()
            ->assertJsonPath('data.0.dateDepart', '2026-03-31')
            ->assertJsonPath('data.0.dateLegalisation', '2026-04-03');
    }

    public function test_les_dates_de_fin_d_annee_et_bissextiles_ne_glissent_pas(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE BISSEXTILE');

        $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e, [
            'date_depart' => '2027-12-31', 'date_fin' => '2028-02-29', 'date_facture' => '2027-12-31',
        ]))->assertStatus(201)
            ->assertJsonPath('data.dateDepart', '2027-12-31')
            ->assertJsonPath('data.dateFin', '2028-02-29')
            ->assertJsonPath('data.dateFacture', '2027-12-31');
    }

    public function test_modifier_une_date_n_en_change_aucune_autre(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE MODIF');
        $id = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e))->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", ['date_paiement' => '2026-05-05'])
            ->assertOk()
            ->assertJsonPath('data.datePaiement', '2026-05-05')
            ->assertJsonPath('data.dateDepart', '2026-03-31')
            ->assertJsonPath('data.dateFin', '2027-03-31')
            ->assertJsonPath('data.dateFacture', '2026-04-01')
            ->assertJsonPath('data.dateLegalisation', '2026-04-03');
    }

    public function test_les_documents_coches_sont_enregistres_et_relus(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE DOCUMENTS');

        $id = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e, [
            'doc_facture' => true, 'doc_contrat' => true, 'doc_attestation' => false, 'doc_procuration' => true,
        ]))->assertStatus(201)
            ->assertJsonPath('data.docFacture', true)
            ->assertJsonPath('data.docContrat', true)
            ->assertJsonPath('data.docAttestation', false)
            ->assertJsonPath('data.docProcuration', true)
            ->json('data.id');

        $this->assertDatabaseHas('domiciliations', [
            'id' => $id, 'doc_facture' => 1, 'doc_contrat' => 1, 'doc_attestation' => 0, 'doc_procuration' => 1,
        ]);

        $this->actingAs($u)->getJson("/api/v1/domiciliations/{$id}")
            ->assertJsonPath('data.docFacture', true)
            ->assertJsonPath('data.docContrat', true)
            ->assertJsonPath('data.docAttestation', false)
            ->assertJsonPath('data.docProcuration', true);
    }

    public function test_les_documents_coches_restent_attaches_a_leur_propre_domiciliation(): void
    {
        $u = $this->admin();
        $a = $this->entreprise('SOCIETE A');
        $b = $this->entreprise('SOCIETE B');

        $idA = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($a, ['doc_attestation' => true]))->json('data.id');
        $idB = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($b, ['doc_facture' => true, 'doc_contrat' => true]))->json('data.id');

        $this->actingAs($u)->getJson("/api/v1/domiciliations/{$idA}")
            ->assertJsonPath('data.docAttestation', true)->assertJsonPath('data.docFacture', false)->assertJsonPath('data.docContrat', false);
        $this->actingAs($u)->getJson("/api/v1/domiciliations/{$idB}")
            ->assertJsonPath('data.docAttestation', false)->assertJsonPath('data.docFacture', true)->assertJsonPath('data.docContrat', true);

        // La liste porte les mêmes valeurs, ligne par ligne.
        $liste = collect($this->actingAs($u)->getJson('/api/v1/domiciliations')->json('data'))->keyBy('id');
        $this->assertTrue($liste[$idA]['docAttestation']);
        $this->assertFalse($liste[$idA]['docFacture']);
        $this->assertTrue($liste[$idB]['docFacture']);
        $this->assertFalse($liste[$idB]['docAttestation']);
    }

    public function test_sans_case_cochee_aucun_document_n_est_marque(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE SANS DOCUMENT');
        $corps = $this->corps($e);
        unset($corps['doc_facture'], $corps['doc_contrat'], $corps['doc_attestation'], $corps['doc_procuration']);

        $this->actingAs($u)->postJson('/api/v1/domiciliations', $corps)->assertStatus(201)
            ->assertJsonPath('data.docFacture', false)->assertJsonPath('data.docContrat', false)
            ->assertJsonPath('data.docAttestation', false)->assertJsonPath('data.docProcuration', false);
    }

    public function test_cocher_ou_decocher_un_document_en_modification_est_enregistre(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE BASCULE');
        $id = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e, ['doc_facture' => true]))->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/domiciliations/{$id}", $this->corps($e, ['doc_facture' => false, 'doc_procuration' => true]))
            ->assertOk()
            ->assertJsonPath('data.docFacture', false)
            ->assertJsonPath('data.docProcuration', true);

        $this->assertDatabaseHas('domiciliations', ['id' => $id, 'doc_facture' => 0, 'doc_procuration' => 1]);
    }

    public function test_le_centre_choisi_dans_le_formulaire_est_enregistre_pour_une_entreprise_sans_centre(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE SANS CENTRE');
        $centre = CentreDomiciliation::create(['nom' => 'CENTRE CHOISI']);

        $this->assertNull($e->fresh()->centre_domiciliation_id);

        $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e, ['centre_domiciliation_id' => $centre->id]))
            ->assertStatus(201)
            ->assertJsonPath('data.centreId', $centre->id)
            ->assertJsonPath('data.centre', 'CENTRE CHOISI');
    }

    public function test_un_renouvellement_expose_le_lien_avec_sa_periode_d_origine(): void
    {
        $u = $this->admin();
        $e = $this->entreprise('SOCIETE RENOUVELEE');
        $origine = $this->actingAs($u)->postJson('/api/v1/domiciliations', $this->corps($e, [
            'date_depart' => '2025-01-01', 'date_fin' => '2025-12-31',
        ]))->json('data.id');

        $renouvellement = $this->actingAs($u)->postJson("/api/v1/domiciliations/{$origine}/renouveler", [
            'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31', 'mois_payee' => 12,
        ])->assertSuccessful()->assertJsonPath('data.renouvelleDeId', $origine)->json('data.id');

        $liste = collect($this->actingAs($u)->getJson('/api/v1/domiciliations')->json('data'))->keyBy('id');

        // La première période n'a pas de lien ; le renouvellement désigne explicitement la période d'origine,
        // et la période d'origine, expirée mais renouvelée, n'est plus « expirée » (elle n'est plus l'échéance à suivre).
        $this->assertNull($liste[$origine]['renouvelleDeId']);
        $this->assertSame($origine, $liste[$renouvellement]['renouvelleDeId']);
        $this->assertSame('active', $liste[$origine]['statutAffichage']);
        $this->assertSame($e->party_id, $liste[$origine]['entrepriseId']);
        $this->assertSame($e->party_id, $liste[$renouvellement]['entrepriseId']);
    }
}
