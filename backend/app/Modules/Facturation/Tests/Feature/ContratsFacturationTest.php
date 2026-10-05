<?php

namespace App\Modules\Facturation\Tests\Feature;

use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Modules\Facturation\Contracts\FacturesPourMouvements;
use App\Modules\Facturation\Contracts\StatistiquesDocuments;
use App\Modules\Facturation\Contracts\SynchronisationPaiements;
use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Models\Client;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Models\Party;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\User;
use App\Modules\Facturation\Services\FacturesDisponiblesEloquent;
use App\Modules\Facturation\Services\FacturesPourMouvementsEloquent;
use App\Modules\Facturation\Services\StatistiquesDocumentsEloquent;
use App\Modules\Facturation\Services\SynchronisationPaiementsEloquent;
use App\Services\ServicesEnCours\AssureServicesEnCoursEloquent;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Contrats entre Facturation et les autres modules (Paiements, Mouvement, Archive, Services en cours) : chacun est
 * résolu par le conteneur et rend exactement ce que les contrôleurs obtenaient avant, sans accès direct au modèle.
 */
class ContratsFacturationTest extends TestCase
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

    private function party(): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT TEST']);

        return $party;
    }

    private function document(string $type, Party $party, string $numero, string $date = '2026-05-10'): int
    {
        return $this->actingAs($this->admin())->postJson("/api/v1/facturation/{$type}", [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $party->id,
            'numero' => $numero,
            'date_document' => $date,
            // 1000 HT, TVA 20 % → 1200 TTC
            'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 1000, 'remise_pourcent' => 0, 'tva_pourcent' => 20]],
        ])->assertStatus(201)->json('data.id');
    }

    public function test_chaque_contrat_est_lie_a_son_implementation(): void
    {
        $this->assertInstanceOf(FacturesDisponiblesEloquent::class, app(FacturesDisponibles::class));
        $this->assertInstanceOf(SynchronisationPaiementsEloquent::class, app(SynchronisationPaiements::class));
        $this->assertInstanceOf(StatistiquesDocumentsEloquent::class, app(StatistiquesDocuments::class));
        $this->assertInstanceOf(FacturesPourMouvementsEloquent::class, app(FacturesPourMouvements::class));
        $this->assertInstanceOf(AssureServicesEnCoursEloquent::class, app(AssureServicesEnCours::class));
    }

    // ---- Factures disponibles pour Paiements --------------------------------------------------------------------

    public function test_factures_disponibles_ne_liste_que_les_factures_actives_la_plus_recente_d_abord(): void
    {
        $party = $this->party();
        $premiere = $this->document('facture', $party, 'F-1');
        $archivee = $this->document('facture', $party, 'F-2');
        $derniere = $this->document('facture', $party, 'F-3');
        $this->document('devis', $party, 'D-1');
        DocumentCommercial::whereKey($archivee)->update(['status' => 'archive']);

        $liste = app(FacturesDisponibles::class)->lister();

        $this->assertSame([$derniere, $premiere], $liste->pluck('id')->all());
        $this->assertSame(
            ['id', 'numero', 'tiers', 'partyId', 'totalTtc', 'prixPaye', 'prixRestant'],
            array_keys($liste->first())
        );
        $this->assertSame('F-3', $liste->first()['numero']);
        $this->assertSame($party->id, $liste->first()['partyId']);
        $this->assertSame('CLIENT TEST', $liste->first()['tiers']);
    }

    public function test_la_route_factures_disponibles_renvoie_le_resultat_du_contrat(): void
    {
        $party = $this->party();
        $this->document('facture', $party, 'F-1');

        $reponse = $this->actingAs($this->admin())->getJson('/api/v1/paiements/factures-disponibles')->assertOk();

        $this->assertEquals(app(FacturesDisponibles::class)->lister()->values()->all(), $reponse->json());
    }

    // ---- Synchronisation du prix payé ---------------------------------------------------------------------------

    public function test_appliquer_total_paye_enregistre_le_total_arrondi(): void
    {
        $id = $this->document('facture', $this->party(), 'F-1');

        app(SynchronisationPaiements::class)->appliquerTotalPaye($id, 300.456);

        $this->assertSame('300.46', DocumentCommercial::find($id)->prix_paye);
        $this->assertSame('899.54', DocumentCommercial::find($id)->prix_restant);
    }

    public function test_appliquer_total_paye_ignore_une_facture_absente_ou_nulle(): void
    {
        $id = $this->document('facture', $this->party(), 'F-1');

        app(SynchronisationPaiements::class)->appliquerTotalPaye(null, 50);
        app(SynchronisationPaiements::class)->appliquerTotalPaye(0, 50);
        app(SynchronisationPaiements::class)->appliquerTotalPaye(999999, 50);

        $this->assertSame('0.00', DocumentCommercial::find($id)->prix_paye);
    }

    public function test_appliquer_total_paye_suit_la_transaction_de_l_appelant(): void
    {
        $id = $this->document('facture', $this->party(), 'F-1');

        DB::beginTransaction();
        app(SynchronisationPaiements::class)->appliquerTotalPaye($id, 500);
        $this->assertSame('500.00', DocumentCommercial::find($id)->prix_paye);
        DB::rollBack();

        $this->assertSame('0.00', DocumentCommercial::find($id)->prix_paye);
    }

    public function test_synchroniser_facture_historique_passe_par_le_contrat(): void
    {
        $party = $this->party();
        $id = $this->document('facture', $party, 'F-1');
        $admin = $this->admin();

        foreach ([200, 300] as $paye) {
            $this->actingAs($admin)->postJson('/api/v1/paiements', [
                'emetteur' => 'bureau_comptabilite', 'party_id' => $party->id, 'document_id' => $id,
                'date_operation' => '2026-05-11', 'prix_paye' => $paye,
                'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 1000]],
            ])->assertStatus(201);
        }

        $this->assertSame('500.00', DocumentCommercial::find($id)->prix_paye);
    }

    // ---- Statistiques pour Archive -------------------------------------------------------------------------------

    public function test_compter_par_type_compte_selon_le_statut(): void
    {
        $party = $this->party();
        $this->document('facture', $party, 'F-1');
        $archivee = $this->document('facture', $party, 'F-2');
        $this->document('devis', $party, 'D-1');
        $this->document('avoir', $party, 'A-1');
        DocumentCommercial::whereKey($archivee)->update(['status' => 'archive']);

        $stats = app(StatistiquesDocuments::class);

        $this->assertSame(['facture' => 1, 'devis' => 1, 'bl' => 0, 'avoir' => 1], $stats->compterParType('actif'));
        $this->assertSame(['facture' => 1, 'devis' => 0, 'bl' => 0, 'avoir' => 0], $stats->compterParType('archive'));
        $this->assertSame(['facture' => 0, 'devis' => 0, 'bl' => 0, 'avoir' => 0], $stats->compterParType('corbeille'));
    }

    public function test_la_route_archive_counts_reprend_les_compteurs_du_contrat(): void
    {
        $party = $this->party();
        $this->document('facture', $party, 'F-1');
        $this->document('bl', $party, 'B-1');

        $reponse = $this->actingAs($this->admin())->getJson('/api/v1/archive/counts?status=actif')->assertOk();

        $reponse->assertJsonPath('facture', 1)->assertJsonPath('devis', 0)->assertJsonPath('bl', 1)->assertJsonPath('avoir', 0);
    }

    // ---- Factures pour Mouvement ---------------------------------------------------------------------------------

    public function test_entrees_applique_les_filtres_de_periode(): void
    {
        $party = $this->party();
        $janvier = $this->document('facture', $party, 'F-1', '2026-01-15');
        $mai = $this->document('facture', $party, 'F-2', '2026-05-10');
        $this->document('devis', $party, 'D-1', '2026-05-10');
        $autreAnnee = $this->document('facture', $party, 'F-3', '2025-11-02');
        $contrat = app(FacturesPourMouvements::class);

        // Ordre : id décroissant (dernière facture créée d'abord), comme avant le contrat.
        $this->assertSame([$autreAnnee, $mai, $janvier], array_column($contrat->entrees([]), 'id'));
        $this->assertSame([$mai, $janvier], array_column($contrat->entrees(['annee' => '2026']), 'id'));
        $this->assertSame([$mai], array_column($contrat->entrees(['trimestre' => '2']), 'id'));
        $this->assertSame([$mai], array_column($contrat->entrees(['annee' => '2026', 'date_debut' => '2026-04-01', 'date_fin' => '2026-06-30']), 'id'));
        $this->assertSame([$janvier], array_column($contrat->entrees(['trimestre' => '1', 'annee' => '']), 'id'));
    }

    public function test_entrees_expose_les_champs_attendus_et_les_annees(): void
    {
        $party = $this->party();
        $this->document('facture', $party, 'F-2', '2025-05-10');
        $this->document('facture', $party, 'F-1', '2026-05-10');
        $contrat = app(FacturesPourMouvements::class);

        $ligne = $contrat->entrees([])[0];

        $this->assertSame(
            ['id', 'numero', 'responsable', 'clientId', 'entrepriseId', 'client', 'dateDocument', 'totalHt', 'totalTtc', 'prixPaye', 'prixRestant'],
            array_keys($ligne)
        );
        $this->assertSame('2026-05-10', $ligne['dateDocument']);
        $this->assertSame('1000.00', $ligne['totalHt']);
        $this->assertSame('1200.00', $ligne['totalTtc']);
        $this->assertEquals([2026, 2025], $contrat->anneesDisponibles());
    }

    // ---- Services en cours ---------------------------------------------------------------------------------------

    public function test_assurer_pour_tiers_cree_le_service_en_cours_sans_doublon(): void
    {
        $party = $this->party();
        $service = Service::create(['nom' => 'Déclaration TVA', 'prix' => 500, 'status' => 'actif']);
        $contrat = app(AssureServicesEnCours::class);

        $contrat->assurerPourTiers($party->id, [$service->id, null, $service->id], $this->admin()->id);
        $contrat->assurerPourTiers($party->id, [$service->id], $this->admin()->id);

        $this->assertSame(1, ServiceEnCours::count());
        $this->assertDatabaseHas('service_en_cours', ['service_id' => $service->id, 'client_id' => $party->id]);
    }

    public function test_assurer_pour_tiers_suit_la_transaction_de_l_appelant(): void
    {
        $party = $this->party();
        $service = Service::create(['nom' => 'Déclaration TVA', 'prix' => 500, 'status' => 'actif']);

        DB::beginTransaction();
        app(AssureServicesEnCours::class)->assurerPourTiers($party->id, [$service->id], $this->admin()->id);
        $this->assertSame(1, ServiceEnCours::count());
        DB::rollBack();

        $this->assertSame(0, ServiceEnCours::count());
    }
}
