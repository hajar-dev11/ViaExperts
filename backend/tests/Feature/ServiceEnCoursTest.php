<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Party;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\ServiceStatus;
use App\Models\User;
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

    private function payload(array $override = []): array
    {
        return array_merge([
            'service_id' => $this->service()->id,
            'client_id' => $this->client()->party_id,
            'service_status_id' => $this->statut()->id,
            'date_depart' => '2026-09-17 10:30:00',
        ], $override);
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

    public function test_admin_can_create_and_status_comes_from_service_statuses(): void
    {
        $payload = $this->payload();

        $this->actingAs($this->admin())
            ->postJson('/api/v1/services-en-cours', $payload)
            ->assertStatus(201)
            ->assertJsonPath('data.status', 'actif')
            ->assertJsonPath('data.statut.couleurFond', '#DCFCE7')
            ->assertJsonPath('data.service', 'SERVICE TEST')
            ->assertJsonPath('data.client', 'CLIENT TEST');

        $this->assertDatabaseCount('service_en_cours', 1);
    }

    public function test_status_defaults_to_en_attente_when_omitted(): void
    {
        $enAttente = ServiceStatus::create([
            'nom' => 'En Attente',
            'couleur_texte' => '#1616a2',
            'couleur_fond' => '#E0E7FF',
        ]);

        $payload = $this->payload();
        unset($payload['service_status_id']);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/services-en-cours', $payload)
            ->assertStatus(201)
            ->assertJsonPath('data.statut.id', $enAttente->id)
            ->assertJsonPath('data.statut.nom', 'En Attente');
    }

    public function test_explicit_status_is_not_overridden_by_the_default(): void
    {
        $this->statut(); // « En Attente {uniqid} » existe, mais ce n'est pas celui-ci qu'on envoie.
        $choisi = $this->statut();

        $payload = $this->payload(['service_status_id' => $choisi->id]);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/services-en-cours', $payload)
            ->assertStatus(201)
            ->assertJsonPath('data.statut.id', $choisi->id);
    }

    public function test_required_fields_are_validated(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/services-en-cours', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['service_id', 'client_id', 'date_depart']);
    }

    public function test_operation_updates_status_and_last_operation(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/services-en-cours', $this->payload())->json('data.id');

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
        $id = $this->actingAs($admin)->postJson('/api/v1/services-en-cours', $this->payload())->json('data.id');

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
        $id = $this->actingAs($admin)->postJson('/api/v1/services-en-cours', $this->payload())->json('data.id');

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
        $id = $this->actingAs($admin)->postJson('/api/v1/services-en-cours', $this->payload())->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['commentaire' => 'Première étape']);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['commentaire' => 'Seconde étape']);

        $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.commentaire', 'Seconde étape')
            ->assertJsonPath('0.par', $admin->name);
    }
}
