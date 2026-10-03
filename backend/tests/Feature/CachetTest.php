<?php

namespace Tests\Feature;

use App\Models\Cachet;
use App\Models\CachetOperation;
use App\Models\CachetStatus;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CachetTest extends TestCase
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
        Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'PRIMAGEO TEST']);

        return $party;
    }

    /** Statut coloré géré dans Paramètres → Cachet. */
    private function statut(string $nom = 'Réception'): CachetStatus
    {
        return CachetStatus::create([
            'nom' => $nom.' '.uniqid(),
            'couleur_texte' => '#ffffff',
            'couleur_fond' => '#22c55e',
        ]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'party_id' => $this->party()->id,
            'cachet_status_id' => $this->statut()->id,
            'lignes' => 12,
            'date_depart' => '2026-09-10 18:10:00',
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/cachets')->assertStatus(401);
    }

    public function test_staff_without_permission_gets_403(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/cachets')->assertStatus(403);
    }

    public function test_staff_with_list_permission_can_read(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);
        $permission = Permission::where('module', 'cashet')->where('action', 'list')->firstOrFail();
        UserPermission::create(['user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now()]);

        $this->actingAs($staff)->getJson('/api/v1/cachets')->assertOk();
        // `ajouter` reste absente : création toujours refusée.
        $this->actingAs($staff)->postJson('/api/v1/cachets', $this->payload())->assertStatus(403);
    }

    public function test_cachet_is_created_with_status_colors_from_settings(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/cachets', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('lignes', 12)
            ->assertJsonPath('client', 'PRIMAGEO TEST')
            ->assertJsonPath('statut.couleurFond', '#22c55e')
            ->assertJsonPath('status', 'actif');

        $this->assertDatabaseCount('cachets', 1);
    }

    public function test_required_fields_are_validated(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/cachets', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['party_id', 'date_depart']);
    }

    public function test_update_is_persisted(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/cachets', $this->payload())->json('id');

        $this->actingAs($admin)->putJson("/api/v1/cachets/{$id}", ['lignes' => 25])
            ->assertOk()
            ->assertJsonPath('lignes', 25);

        $this->assertSame(25, Cachet::find($id)->lignes);
    }

    public function test_operation_changes_status_and_last_operation(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/cachets', $this->payload())->json('id');

        $nouveau = $this->statut('En Attente');

        $this->actingAs($admin)
            ->postJson("/api/v1/cachets/{$id}/operations", [
                'cachet_status_id' => $nouveau->id,
                'commentaire' => 'Cachet réceptionné.',
            ])
            ->assertOk()
            ->assertJsonPath('statut.id', $nouveau->id)
            ->assertJsonPath('operations.0.commentaire', 'Cachet réceptionné.');

        $this->assertNotNull(Cachet::find($id)->derniere_operation);
    }

    public function test_operation_file_is_really_stored(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/cachets', $this->payload())->json('id');

        $this->actingAs($admin)
            ->postJson("/api/v1/cachets/{$id}/operations", [
                // `fake()->image()` exige l'extension GD, absente de ce PHP : on
                // crée directement un fichier de test, ce qui suffit ici.
                'fichier' => UploadedFile::fake()->create('WhatsApp Image.jpeg', 8, 'image/jpeg'),
            ])
            ->assertOk()
            ->assertJsonPath('operations.0.fichierNom', 'WhatsApp Image.jpeg');

        Storage::disk('public')->assertExists(CachetOperation::first()->fichier_chemin);
    }

    public function test_activity_feed_returns_latest_operations(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/cachets', $this->payload())->json('id');

        $this->actingAs($admin)->postJson("/api/v1/cachets/{$id}/operations", ['commentaire' => 'Première']);
        $this->actingAs($admin)->postJson("/api/v1/cachets/{$id}/operations", ['commentaire' => 'Seconde']);

        $this->actingAs($admin)->getJson('/api/v1/cachets/activite')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.commentaire', 'Seconde')
            ->assertJsonPath('0.par', $admin->name);
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/cachets', $this->payload())->json('id');

        $this->actingAs($admin)->postJson("/api/v1/cachets/{$id}/archive")->assertJsonPath('status', 'archive');
        $this->actingAs($admin)->getJson('/api/v1/cachets?status=archive')->assertJsonCount(1);

        $this->actingAs($admin)->postJson("/api/v1/cachets/{$id}/restore")->assertJsonPath('status', 'actif');
        $this->actingAs($admin)->deleteJson("/api/v1/cachets/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/cachets/{$id}/corbeille")->assertJsonPath('status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/cachets/{$id}")->assertOk();

        $this->assertNull(Cachet::find($id));
        $this->assertNotNull(Cachet::withTrashed()->find($id)->deleted_at);
    }
}
