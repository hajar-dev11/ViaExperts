<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\ServiceStatus;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ServiceEnCoursTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function client(): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);

        return Client::create([
            'party_id' => $party->id,
            'type' => 'client',
            'genre' => 'M',
            'nom' => 'CLIENT TEST',
        ]);
    }

    private function service(): Service
    {
        return Service::create(['nom' => 'SERVICE TEST', 'prix' => 1500, 'status' => 'actif']);
    }

    private function statut(): ServiceStatus
    {
        return ServiceStatus::create([
            'nom' => 'En Attente '.uniqid(),
            'couleur_texte' => '#a21616',
            'couleur_fond' => '#DCFCE7',
        ]);
    }

    /**
     * Prépare un service en cours directement en base : la création manuelle par l'API n'existe plus (un service naît
     * d'une action métier : facture, devis, bon de livraison, facture d'avoir, paiement).
     */
    private function creerService(array $override = []): ServiceEnCours
    {
        return ServiceEnCours::create(array_merge([
            'service_id' => $this->service()->id,
            'client_id' => $this->client()->party_id,
            'service_status_id' => $this->statut()->id,
            'date_depart' => '2026-09-17 10:30:00',
            'derniere_operation' => '2026-09-17 10:30:00',
        ], $override));
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/services-en-cours')->assertStatus(401);
    }

    public function test_staff_without_permission_gets_403(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/services-en-cours')->assertStatus(403);
    }

    public function test_la_creation_manuelle_d_un_service_en_cours_n_existe_plus(): void
    {
        $payload = [
            'service_id' => $this->service()->id,
            'client_id' => $this->client()->party_id,
            'date_depart' => '2026-09-17 10:30:00',
        ];

        // La route POST /services-en-cours a été supprimée : 405 (la liste GET existe toujours), même pour un administrateur.
        $this->actingAs($this->admin())->postJson('/api/v1/services-en-cours', $payload)->assertStatus(405);
        $this->assertDatabaseCount('service_en_cours', 0);

        // La liste, elle, fonctionne toujours.
        $this->actingAs($this->admin())->getJson('/api/v1/services-en-cours')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_la_permission_ajouter_n_existe_plus_dans_le_catalogue(): void
    {
        $this->seed(PermissionSeeder::class);

        $this->assertDatabaseMissing('permissions', ['module' => 'services_en_cours', 'action' => 'ajouter']);
        foreach (['list', 'modifier', 'archive', 'corbeille', 'supprimer'] as $action) {
            $this->assertDatabaseHas('permissions', ['module' => 'services_en_cours', 'action' => $action]);
        }
    }

    public function test_la_migration_retire_la_permission_ajouter_et_ses_octrois_sans_toucher_aux_autres(): void
    {
        $ajouter = Permission::create(['module' => 'services_en_cours', 'action' => 'ajouter']);
        $liste = Permission::create(['module' => 'services_en_cours', 'action' => 'list']);
        $autreModule = Permission::create(['module' => 'services', 'action' => 'ajouter']);
        $staff = User::factory()->create(['is_admin' => false]);
        foreach ([$ajouter, $liste, $autreModule] as $permission) {
            UserPermission::create(['user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        }

        (require database_path('migrations/2026_10_08_130000_remove_services_en_cours_ajouter_permission.php'))->up();

        $this->assertDatabaseMissing('permissions', ['id' => $ajouter->id]);
        $this->assertDatabaseMissing('user_permissions', ['user_id' => $staff->id, 'permission_id' => $ajouter->id]);
        // Les autres permissions (même module, ou même action d'un autre module) et leurs octrois sont conservés.
        $this->assertDatabaseHas('permissions', ['id' => $liste->id]);
        $this->assertDatabaseHas('permissions', ['id' => $autreModule->id]);
        $this->assertDatabaseHas('user_permissions', ['user_id' => $staff->id, 'permission_id' => $liste->id]);
        $this->assertDatabaseHas('user_permissions', ['user_id' => $staff->id, 'permission_id' => $autreModule->id]);
    }

    public function test_un_service_cree_automatiquement_recoit_le_statut_en_attente(): void
    {
        $enAttente = ServiceStatus::create(['nom' => 'En Attente', 'couleur_texte' => '#1616a2', 'couleur_fond' => '#E0E7FF']);
        $this->statut(); // un autre statut existe : seul « En Attente » doit être choisi par défaut
        $client = $this->client();
        $service = $this->service();
        $admin = $this->admin();

        ServiceEnCours::assurerServicesPourTiers($client->party_id, [$service->id], $admin->id);

        $row = ServiceEnCours::firstOrFail();
        $this->assertSame($enAttente->id, $row->service_status_id);
        $this->actingAs($admin)->getJson('/api/v1/services-en-cours')
            ->assertOk()
            ->assertJsonPath('data.0.statut.nom', 'En Attente')
            ->assertJsonPath('data.0.status', 'actif');
    }

    public function test_la_modification_d_un_service_existant_reste_possible(): void
    {
        $row = $this->creerService();
        $nouveau = $this->statut();

        $this->actingAs($this->admin())
            ->putJson("/api/v1/services-en-cours/{$row->id}", ['service_status_id' => $nouveau->id, 'date_depart' => '2026-10-01 09:00:00'])
            ->assertOk()
            ->assertJsonPath('data.statut.id', $nouveau->id);
    }
    public function test_operation_updates_status_and_last_operation(): void
    {
        $admin = $this->admin();
        $id = $this->creerService()->id;

        $nouveau = $this->statut();

        $this->actingAs($admin)
            ->postJson("/api/v1/services-en-cours/{$id}/operations", [
                'service_status_id' => $nouveau->id,
                'commentaire' => 'Dossier transmis au greffe.',
            ])
            ->assertOk()
            ->assertJsonPath('data.statut.id', $nouveau->id)
            ->assertJsonPath('data.operations.0.commentaire', 'Dossier transmis au greffe.');

        $row = ServiceEnCours::find($id);
        $this->assertSame($nouveau->id, $row->service_status_id);
        $this->assertNotNull($row->derniere_operation);
    }

    public function test_operation_file_is_really_stored(): void
    {
        Storage::fake('public');

        $admin = $this->admin();
        $id = $this->creerService()->id;

        $this->actingAs($admin)
            ->postJson("/api/v1/services-en-cours/{$id}/operations", [
                'fichier' => UploadedFile::fake()->create('Recu.pdf', 12, 'application/pdf'),
            ])
            ->assertOk()
            ->assertJsonPath('data.operations.0.fichierNom', 'Recu.pdf');

        $chemin = \App\Models\ServiceEnCoursOperation::first()->fichier_chemin;
        Storage::disk('public')->assertExists($chemin);
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->creerService()->id;

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/archive")
            ->assertJsonPath('data.status', 'archive');
        $this->actingAs($admin)->getJson('/api/v1/services-en-cours?status=archive')->assertJsonCount(1, 'data');

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/restore")
            ->assertJsonPath('data.status', 'actif');

        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/corbeille")
            ->assertJsonPath('data.status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$id}")->assertOk();

        $this->assertNull(ServiceEnCours::find($id));
        $this->assertNotNull(ServiceEnCours::withTrashed()->find($id)->deleted_at);
    }

    public function test_activite_feed_returns_latest_operations(): void
    {
        $admin = $this->admin();
        $id = $this->creerService()->id;

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['commentaire' => 'Première étape']);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['commentaire' => 'Seconde étape']);

        $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.commentaire', 'Seconde étape')
            ->assertJsonPath('0.par', $admin->name);
    }
}
