<?php

namespace Tests\Feature\Snapshots;

use App\Models\CachetStatus;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Models\Client;
use App\Models\Entreprise;
use App\Models\MailStatus;
use App\Models\Party;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Snapshot;
use Tests\TestCase;

/**
 * Test de caractérisation de l'API : pour les endpoints principaux, on fige le code HTTP et la FORME du JSON
 * (clés + types, pas les valeurs). Pendant la migration Modular Monolith, déplacer un contrôleur, une requête
 * ou une ressource ne doit changer ni les clés renvoyées au frontend ni les statuts HTTP.
 */
class ApiShapeSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private array $resultats = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    /** Appelle l'endpoint et enregistre « statut + forme du JSON » sous la clé « METHODE uri ». */
    private function relever(string $methode, string $uri, array $corps = [], ?string $cle = null): array
    {
        $reponse = $this->json($methode, $uri, $corps);
        $json = $reponse->json();

        $this->resultats[$cle ?? "{$methode} {$uri}"] = [
            'statut' => $reponse->getStatusCode(),
            'forme' => is_array($json) ? Snapshot::forme($json) : 'non-json',
        ];

        return is_array($json) ? $json : [];
    }

    public function test_la_forme_des_reponses_de_l_api_est_inchangee(): void
    {
        $admin = User::factory()->create(['is_admin' => true, 'telephone' => '0600000000']);
        $this->actingAs($admin);

        // ---- Données de référence ------------------------------------------------------------------------------
        $partyClient = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create([
            'party_id' => $partyClient->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT TEST',
            'nationalite' => 'MAROCAINE', 'date_naissance' => '1980-01-02', 'cin' => 'AB123456',
            'email' => 'client@example.test', 'telephone' => '0611111111', 'adresse' => 'ADRESSE TEST',
        ]);
        $centre = CentreDomiciliation::create(['nom' => 'CENTRE TEST', 'adresse' => 'ADRESSE CENTRE', 'ville' => 'Casablanca']);
        $partyEntreprise = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        Entreprise::create([
            'party_id' => $partyEntreprise->id, 'type' => 'entreprise', 'denomination' => 'ENTREPRISE TEST',
            'client_id' => $partyClient->id, 'centre_domiciliation_id' => $centre->id,
        ]);
        $service = Service::create(['nom' => 'SERVICE TEST', 'prix' => 500, 'status' => 'actif']);

        // ---- Authentification, utilisateurs, permissions -------------------------------------------------------
        $this->relever('GET', '/api/v1/auth/me');
        $this->relever('GET', '/api/v1/users');
        $this->relever('GET', "/api/v1/users/{$admin->id}", [], 'GET /api/v1/users/{id}');
        $this->relever('GET', "/api/v1/users/{$admin->id}/permissions", [], 'GET /api/v1/users/{id}/permissions');
        $this->relever('GET', '/api/v1/permissions');
        $this->relever('GET', '/api/v1/archive/counts');

        // ---- Parties (clients / entreprises) -------------------------------------------------------------------
        $this->relever('GET', '/api/v1/clients');
        $this->relever('GET', "/api/v1/clients/{$partyClient->id}", [], 'GET /api/v1/clients/{id}');
        $this->relever('GET', '/api/v1/entreprises');
        $this->relever('GET', "/api/v1/entreprises/{$partyEntreprise->id}", [], 'GET /api/v1/entreprises/{id}');
        $this->relever('GET', '/api/v1/centres-domiciliation');

        // ---- Domiciliation -------------------------------------------------------------------------------------
        $domi = $this->relever('POST', '/api/v1/domiciliations', [
            'entreprise_id' => $partyEntreprise->id, 'centre_domiciliation_id' => $centre->id, 'mois_payee' => 12,
            'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31', 'mode_paiement' => 'Virement',
            'prix_par_mois' => 350, 'prix_total' => 4200, 'signature_sur_facture' => true, 'doc_contrat' => true,
        ]);
        $this->relever('GET', '/api/v1/domiciliations');
        $this->relever('GET', '/api/v1/domiciliations/'.($domi['data']['id'] ?? 0), [], 'GET /api/v1/domiciliations/{id}');

        // ---- Facturation (4 types partagent le même contrôleur) ------------------------------------------------
        $ligne = ['service_id' => $service->id, 'designation' => 'Service A', 'quantite' => 2, 'prix_unitaire' => 1000, 'remise_pourcent' => 10, 'tva_pourcent' => 20];
        $factureId = null;
        foreach (['facture', 'devis', 'bl', 'avoir'] as $i => $type) {
            $doc = $this->relever('POST', "/api/v1/facturation/{$type}", [
                'emetteur' => 'bureau_comptabilite', 'party_id' => $partyClient->id, 'numero' => "N-{$type}-1",
                'date_document' => '2026-09-17 11:00:00', 'prix_paye' => 0, 'signature' => true, 'lignes' => [$ligne],
            ]);
            $factureId = $type === 'facture' ? ($doc['data']['id'] ?? null) : $factureId;
            $this->relever('GET', "/api/v1/facturation/{$type}");
        }
        $this->relever('GET', '/api/v1/facturation/facture/'.($factureId ?? 0), [], 'GET /api/v1/facturation/facture/{id}');
        $this->relever('GET', '/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite');

        // ---- Paiements, mouvements -----------------------------------------------------------------------------
        $paiement = $this->relever('POST', '/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $partyClient->id, 'document_id' => $factureId,
            'date_operation' => '2026-09-17 12:00:00', 'mode_paiement' => 'Espèce', 'prix_paye' => 500, 'signature' => true,
            'lignes' => [['service_id' => $service->id, 'designation' => 'Service A', 'quantite' => 1, 'prix_unitaire' => 3000]],
        ]);
        $this->relever('GET', '/api/v1/paiements');
        $this->relever('GET', '/api/v1/paiements/'.($paiement['data']['id'] ?? 0), [], 'GET /api/v1/paiements/{id}');
        $this->relever('GET', '/api/v1/paiements/gestion');
        $this->relever('GET', '/api/v1/paiements/factures-disponibles');
        $this->relever('GET', '/api/v1/mouvements/recu');
        $this->relever('GET', '/api/v1/mouvements/facture');

        // ---- Catalogue de services, services en cours ----------------------------------------------------------
        $this->relever('GET', '/api/v1/services');
        $this->relever('GET', '/api/v1/service-statuses');
        ServiceEnCours::create([
            'service_id' => $service->id, 'client_id' => $partyClient->id, 'service_status_id' => null,
            'date_depart' => '2026-09-17 10:00:00', 'derniere_operation' => '2026-09-17 10:00:00',
        ]);
        $this->relever('GET', '/api/v1/services-en-cours');
        $this->relever('GET', '/api/v1/services-en-cours/activite');

        // ---- Déclarations, cachets, mails ----------------------------------------------------------------------
        $this->relever('POST', '/api/v1/declarations/tva', [
            'entreprise_id' => $partyEntreprise->id, 'client_if' => '12345678', 'identifiant_paiement' => '1-ESPECES',
            'periode_type' => 'trimestre', 'periode_valeur' => 2, 'annee' => 2026, 'regime' => '2',
            'lignes' => [['fact_num' => 'F-1', 'designation' => 'Vente', 'ht' => 1000, 'tva' => 200, 'ttc' => 1200, 'taux' => 20]],
        ]);
        $this->relever('GET', '/api/v1/declarations/tva');

        $cachetStatut = CachetStatus::create(['nom' => 'Réception', 'couleur_texte' => '#ffffff', 'couleur_fond' => '#22c55e']);
        $this->relever('POST', '/api/v1/cachets', [
            'party_id' => $partyEntreprise->id, 'cachet_status_id' => $cachetStatut->id, 'lignes' => 12, 'date_depart' => '2026-09-10 18:10:00',
        ]);
        $this->relever('GET', '/api/v1/cachets');

        $mailStatut = MailStatus::create(['nom' => 'RETRAIT', 'couleur_texte' => '#FFFFFF', 'couleur_fond' => '#E11D48']);
        $this->relever('POST', '/api/v1/mails', [
            'party_id' => $partyEntreprise->id, 'mail_status_id' => $mailStatut->id, 'date_depart' => '2026-08-18 13:36:00',
        ]);
        $this->relever('GET', '/api/v1/mails');

        // ---- Paramètres, outils internes -----------------------------------------------------------------------
        $this->relever('GET', '/api/v1/settings/cabinet');
        $this->relever('GET', '/api/v1/settings/domiciliation');
        $this->relever('GET', '/api/v1/notes');
        $this->relever('GET', '/api/v1/fichiers');
        $this->relever('GET', '/api/v1/data-center');
        $this->relever('GET', '/api/v1/rapports');
        $this->relever('GET', '/api/v1/chat/contacts');

        ksort($this->resultats);
        $this->assertGreaterThan(30, count($this->resultats));
        Snapshot::assertMatches('api-shapes', $this->resultats);
    }
}
