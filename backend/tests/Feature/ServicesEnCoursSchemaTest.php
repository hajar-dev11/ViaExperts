<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\ServiceEnCours;
use App\Models\ServiceEnCoursOperation;
use App\Models\ServiceStatus;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Erreur « SQLSTATE[42S22] Unknown column 'action' in 'field list' » (table service_en_cours_operations) : le code écrit la trace
 * d'activité alors que la base n'a pas encore la migration `2026_10_12_180000_add_trace_to_service_en_cours_operations_table`.
 *
 * Le schéma réel n'est pas modifiable dans un test (DDL non annulable) : la détection est simulée par `forcerTracabilite(false)`.
 */
class ServicesEnCoursSchemaTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        ServiceEnCoursOperation::forcerTracabilite(null);
        parent::tearDown();
    }

    private function client(): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);

        return Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST']);
    }

    private function entreprise(Client $client): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'ENTREPRISE TEST', 'client_id' => $client->party_id]);
    }

    public function test_la_base_de_test_possede_les_colonnes_de_la_migration_et_la_detection_le_voit(): void
    {
        foreach (ServiceEnCoursOperation::COLONNES_TRACE as $colonne) {
            $this->assertTrue(Schema::hasColumn('service_en_cours_operations', $colonne), "colonne {$colonne} absente");
        }
        $this->assertTrue(ServiceEnCoursOperation::tracabiliteDisponible());
    }

    public function test_attributs_compatibles_retire_seulement_les_colonnes_de_trace(): void
    {
        $attributs = [
            'service_en_cours_id' => 1, 'action' => 'statut', 'service_status_id' => 2, 'ancien_status_id' => 1, 'commentaire' => 'ok',
            'fichier_nom' => 'a.pdf', 'fichier_chemin' => 'x/a.pdf', 'source_type' => 'paiement', 'source_id' => 9,
            'source_fichier_nom' => 'p.pdf', 'source_fichier_chemin' => 'y/p.pdf', 'created_by' => 3,
        ];

        $this->assertSame($attributs, ServiceEnCoursOperation::attributsCompatibles($attributs, true));
        $this->assertSame(
            ['service_en_cours_id' => 1, 'service_status_id' => 2, 'commentaire' => 'ok', 'fichier_nom' => 'a.pdf', 'fichier_chemin' => 'x/a.pdf', 'created_by' => 3],
            ServiceEnCoursOperation::attributsCompatibles($attributs, false)
        );
    }

    public function test_base_a_jour_la_trace_complete_est_ecrite(): void
    {
        ServiceStatus::create(['nom' => 'En Attente', 'couleur_texte' => '#111111', 'couleur_fond' => '#EEEEEE']);
        $admin = User::factory()->create(['is_admin' => true]);
        $client = $this->client();

        ServiceEnCours::assurerServicesPourTiers(
            $this->entreprise($client)->party_id,
            [\App\Models\Service::create(['nom' => 'Service X', 'prix' => 100, 'status' => 'actif', 'via_experts' => true])->id],
            $admin->id,
            ['type' => 'facture', 'id' => 42, 'fichier_nom' => null, 'fichier_chemin' => null]
        );

        $operation = ServiceEnCoursOperation::first();
        $this->assertNotNull($operation);
        $this->assertSame('creation', $operation->action);
        $this->assertSame('facture', $operation->source_type);
        $this->assertSame(42, (int) $operation->source_id);
    }

    public function test_base_sans_la_migration_le_document_est_enregistre_sans_erreur_sql_et_sans_ligne_de_creation(): void
    {
        ServiceEnCoursOperation::forcerTracabilite(false);
        ServiceStatus::create(['nom' => 'En Attente', 'couleur_texte' => '#111111', 'couleur_fond' => '#EEEEEE']);
        $admin = User::factory()->create(['is_admin' => true]);
        $client = $this->client();
        $service = \App\Models\Service::create(['nom' => 'Service X', 'prix' => 100, 'status' => 'actif', 'via_experts' => true]);

        // Avant la correction : QueryException « Unknown column 'action' » faisait échouer tout l'enregistrement du document.
        ServiceEnCours::assurerServicesPourTiers(
            $this->entreprise($client)->party_id, [$service->id], $admin->id, ['type' => 'facture', 'id' => 42]
        );

        $this->assertSame(1, ServiceEnCours::count(), 'le service en cours est bien créé');
        $this->assertSame(0, ServiceEnCoursOperation::count(), 'pas de ligne de création sans trace (comportement d\'avant la migration)');
    }

    public function test_base_sans_la_migration_un_commentaire_s_enregistre_sans_les_colonnes_de_trace(): void
    {
        $statut = ServiceStatus::create(['nom' => 'En Attente', 'couleur_texte' => '#111111', 'couleur_fond' => '#EEEEEE']);
        $admin = User::factory()->create(['is_admin' => true]);
        $client = $this->client();
        $service = \App\Models\Service::create(['nom' => 'Service X', 'prix' => 100, 'status' => 'actif', 'via_experts' => true]);
        ServiceEnCours::assurerServicesPourTiers($this->entreprise($client)->party_id, [$service->id], $admin->id);
        $ligne = ServiceEnCours::firstOrFail();

        ServiceEnCoursOperation::forcerTracabilite(false);
        $this->seed(PermissionSeeder::class);
        $this->assertNotNull(Permission::where('module', 'services_en_cours')->first());

        $reponse = $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$ligne->id}/operations", ['commentaire' => 'Dossier reçu']);

        $reponse->assertOk();
        $operation = ServiceEnCoursOperation::where('commentaire', 'Dossier reçu')->first();
        $this->assertNotNull($operation, 'le commentaire est enregistré');
        $this->assertSame((int) $statut->id, (int) $operation->service_status_id);
        // La colonne existe dans cette base de test mais n'a pas été écrite : valeur par défaut de la migration.
        $this->assertSame('operation', $operation->action);
    }
}
