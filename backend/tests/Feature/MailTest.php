<?php

namespace Tests\Feature;

use App\Models\Entreprise;
use App\Models\Mail;
use App\Models\MailOperation;
use App\Models\MailStatus;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MailTest extends TestCase
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
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'YOH IMMOBILIER TEST']);

        return $party;
    }

    /** Statut coloré géré dans Paramètres → Mail. */
    private function statut(string $nom = 'RETRAIT'): MailStatus
    {
        return MailStatus::create([
            'nom' => $nom.' '.uniqid(),
            'couleur_texte' => '#FFFFFF',
            'couleur_fond' => '#E11D48',
        ]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'party_id' => $this->party()->id,
            'mail_status_id' => $this->statut()->id,
            'date_depart' => '2026-08-18 13:36:00',
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/mails')->assertStatus(401);
    }

    public function test_staff_without_permission_gets_403(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/mails')->assertStatus(403);
    }

    public function test_staff_with_list_permission_can_read_but_not_create(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);
        $permission = Permission::where('module', 'mails')->where('action', 'list')->firstOrFail();
        UserPermission::create(['user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now()]);

        $this->actingAs($staff)->getJson('/api/v1/mails')->assertOk();
        $this->actingAs($staff)->postJson('/api/v1/mails', $this->payload())->assertStatus(403);
    }

    public function test_mail_is_created_with_status_colors_from_settings(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/mails', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('client', 'YOH IMMOBILIER TEST')
            ->assertJsonPath('statut.couleurFond', '#E11D48')
            ->assertJsonPath('status', 'actif');

        $this->assertDatabaseCount('mails', 1);
    }

    public function test_required_fields_are_validated(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/mails', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['party_id', 'date_depart']);
    }

    public function test_update_is_persisted(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/mails', $this->payload())->json('id');

        $nouveau = $this->statut('Archives');

        $this->actingAs($admin)->putJson("/api/v1/mails/{$id}", ['mail_status_id' => $nouveau->id])
            ->assertOk()
            ->assertJsonPath('statut.id', $nouveau->id);

        $this->assertSame($nouveau->id, Mail::find($id)->mail_status_id);
    }

    public function test_operation_changes_status_and_last_operation(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/mails', $this->payload())->json('id');

        $nouveau = $this->statut('Au Bureau');

        $this->actingAs($admin)
            ->postJson("/api/v1/mails/{$id}/operations", [
                'mail_status_id' => $nouveau->id,
                'commentaire' => 'Courrier remis au bureau.',
            ])
            ->assertOk()
            ->assertJsonPath('statut.id', $nouveau->id)
            ->assertJsonPath('operations.0.commentaire', 'Courrier remis au bureau.');

        $this->assertNotNull(Mail::find($id)->derniere_operation);
    }

    public function test_operation_file_is_really_stored(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/mails', $this->payload())->json('id');

        $this->actingAs($admin)
            ->postJson("/api/v1/mails/{$id}/operations", [
                'fichier' => UploadedFile::fake()->create('courrier.pdf', 9, 'application/pdf'),
            ])
            ->assertOk()
            ->assertJsonPath('operations.0.fichierNom', 'courrier.pdf');

        Storage::disk('public')->assertExists(MailOperation::first()->fichier_chemin);
    }

    public function test_activity_feed_returns_latest_operations(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/mails', $this->payload())->json('id');

        $this->actingAs($admin)->postJson("/api/v1/mails/{$id}/operations", ['commentaire' => 'Première']);
        $this->actingAs($admin)->postJson("/api/v1/mails/{$id}/operations", ['commentaire' => 'Seconde']);

        $this->actingAs($admin)->getJson('/api/v1/mails/activite')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.commentaire', 'Seconde')
            ->assertJsonPath('0.par', $admin->name);
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/mails', $this->payload())->json('id');

        $this->actingAs($admin)->postJson("/api/v1/mails/{$id}/archive")->assertJsonPath('status', 'archive');
        $this->actingAs($admin)->getJson('/api/v1/mails?status=archive')->assertJsonCount(1);

        $this->actingAs($admin)->postJson("/api/v1/mails/{$id}/restore")->assertJsonPath('status', 'actif');
        $this->actingAs($admin)->deleteJson("/api/v1/mails/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/mails/{$id}/corbeille")->assertJsonPath('status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/mails/{$id}")->assertOk();

        $this->assertNull(Mail::find($id));
        $this->assertNotNull(Mail::withTrashed()->find($id)->deleted_at);
    }

    /** Les Cachets ne doivent pas être affectés par le module Mails. */
    public function test_cachets_are_not_impacted(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/v1/mails', $this->payload())->assertStatus(201);

        $this->actingAs($admin)->getJson('/api/v1/cachets')->assertOk()->assertJsonCount(0);
        $this->assertDatabaseCount('cachets', 0);
    }
}
