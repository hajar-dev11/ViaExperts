<?php

namespace Tests\Feature;

use App\Models\DataCenterFiche;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Data Center — capture image68 « List des Data ».
 * Couvre le cycle complet + les 6 permissions du groupe `data_center`.
 */
class DataCenterTest extends TestCase
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

    private function staff(array $actions = []): User
    {
        $user = User::factory()->create(['is_admin' => false]);

        foreach ($actions as $action) {
            $permission = Permission::where('module', 'data_center')->where('action', $action)->firstOrFail();
            UserPermission::create(['user_id' => $user->id, 'permission_id' => $permission->id]);
        }

        return $user;
    }

    private function payload(array $override = []): array
    {
        // Reprend la 1re ligne de la capture image68.
        return array_merge([
            'denomination' => 'COMPANY ASSUNDOUSS FOR MANUFACTURING & IMPORT-EXPORT',
            'ice' => '003426425000081',
            'if' => '60231868',
            'rc' => null,
            'tp' => null,
        ], $override);
    }

    // --- Catalogue de permissions -------------------------------------------

    public function test_data_center_group_has_exactly_the_six_catalogue_permissions(): void
    {
        $actions = Permission::where('module', 'data_center')->orderBy('id')->pluck('action')->all();

        $this->assertSame(
            ['list', 'ajouter', 'modifier', 'archive', 'corbeille', 'supprimer'],
            $actions
        );
    }

    // --- Accès --------------------------------------------------------------

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/data-center')->assertStatus(401);
    }

    public function test_staff_without_permission_gets_403_on_every_action(): void
    {
        $staff = $this->staff();
        $fiche = DataCenterFiche::create($this->payload());

        $this->actingAs($staff)->getJson('/api/v1/data-center')->assertStatus(403);
        $this->actingAs($staff)->postJson('/api/v1/data-center', $this->payload())->assertStatus(403);
        $this->actingAs($staff)->getJson("/api/v1/data-center/{$fiche->id}")->assertStatus(403);
        $this->actingAs($staff)->putJson("/api/v1/data-center/{$fiche->id}", ['denomination' => 'X'])->assertStatus(403);
        $this->actingAs($staff)->postJson("/api/v1/data-center/{$fiche->id}/archive")->assertStatus(403);
        $this->actingAs($staff)->postJson("/api/v1/data-center/{$fiche->id}/corbeille")->assertStatus(403);
        $this->actingAs($staff)->postJson("/api/v1/data-center/{$fiche->id}/restore")->assertStatus(403);
        $this->actingAs($staff)->deleteJson("/api/v1/data-center/{$fiche->id}")->assertStatus(403);
    }

    public function test_staff_with_list_permission_can_read_but_not_write(): void
    {
        $staff = $this->staff(['list']);

        $this->actingAs($staff)->getJson('/api/v1/data-center')->assertStatus(200);
        $this->actingAs($staff)->postJson('/api/v1/data-center', $this->payload())->assertStatus(403);
    }

    public function test_staff_with_ajouter_permission_can_create(): void
    {
        $staff = $this->staff(['ajouter']);

        $this->actingAs($staff)
            ->postJson('/api/v1/data-center', $this->payload(['denomination' => 'INTER COLLES']))
            ->assertStatus(201);

        $this->assertDatabaseHas('data_center_fiches', ['denomination' => 'INTER COLLES']);
    }

    public function test_admin_keeps_access_without_explicit_permissions(): void
    {
        $this->assertDatabaseCount('user_permissions', 0);

        $this->actingAs($this->admin())->getJson('/api/v1/data-center')->assertStatus(200);
    }

    /** `restore` n'existe pas au catalogue : il réutilise la permission `archive`. */
    public function test_restore_reuses_the_archive_permission(): void
    {
        $this->assertNull(Permission::where('module', 'data_center')->where('action', 'restore')->first());

        $fiche = DataCenterFiche::create($this->payload(['status' => 'archive']));
        $staff = $this->staff(['archive']);

        $this->actingAs($staff)
            ->postJson("/api/v1/data-center/{$fiche->id}/restore")
            ->assertStatus(200)
            ->assertJsonPath('status', 'actif');
    }

    // --- CRUD ---------------------------------------------------------------

    public function test_fiche_is_created_and_persisted(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/data-center', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('denomination', 'COMPANY ASSUNDOUSS FOR MANUFACTURING & IMPORT-EXPORT')
            ->assertJsonPath('ice', '003426425000081')
            ->assertJsonPath('if', '60231868')
            ->assertJsonPath('status', 'actif');

        $this->assertDatabaseCount('data_center_fiches', 1);
    }

    public function test_denomination_is_required(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/data-center', ['ice' => '001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['denomination']);
    }

    public function test_rc_and_tp_may_be_empty_as_in_the_reference_capture(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/data-center', $this->payload(['rc' => null, 'tp' => null]))
            ->assertStatus(201)
            ->assertJsonPath('rc', null)
            ->assertJsonPath('tp', null);
    }

    public function test_fiche_is_updated(): void
    {
        $fiche = DataCenterFiche::create($this->payload());

        $this->actingAs($this->admin())
            ->putJson("/api/v1/data-center/{$fiche->id}", ['denomination' => 'BIG & BEE', 'rc' => '12345'])
            ->assertStatus(200)
            ->assertJsonPath('denomination', 'BIG & BEE');

        $this->assertDatabaseHas('data_center_fiches', [
            'id' => $fiche->id,
            'denomination' => 'BIG & BEE',
            'rc' => '12345',
        ]);
    }

    public function test_show_returns_the_fiche(): void
    {
        $fiche = DataCenterFiche::create($this->payload());

        $this->actingAs($this->admin())
            ->getJson("/api/v1/data-center/{$fiche->id}")
            ->assertStatus(200)
            ->assertJsonPath('id', $fiche->id);
    }

    // --- Cycle archive / corbeille / restore / suppression -------------------

    public function test_full_archive_corbeille_restore_cycle(): void
    {
        $admin = $this->admin();
        $fiche = DataCenterFiche::create($this->payload());

        $this->actingAs($admin)->postJson("/api/v1/data-center/{$fiche->id}/archive")
            ->assertStatus(200)->assertJsonPath('status', 'archive');
        $this->assertDatabaseHas('data_center_fiches', ['id' => $fiche->id, 'status' => 'archive']);

        $this->actingAs($admin)->postJson("/api/v1/data-center/{$fiche->id}/corbeille")
            ->assertStatus(200)->assertJsonPath('status', 'corbeille');
        $this->assertDatabaseHas('data_center_fiches', ['id' => $fiche->id, 'status' => 'corbeille']);

        $this->actingAs($admin)->postJson("/api/v1/data-center/{$fiche->id}/restore")
            ->assertStatus(200)->assertJsonPath('status', 'actif');
        $this->assertDatabaseHas('data_center_fiches', ['id' => $fiche->id, 'status' => 'actif']);
    }

    public function test_index_filters_by_status(): void
    {
        DataCenterFiche::create($this->payload(['denomination' => 'ACTIVE ONE']));
        DataCenterFiche::create($this->payload(['denomination' => 'ARCHIVED ONE', 'status' => 'archive']));
        DataCenterFiche::create($this->payload(['denomination' => 'TRASHED ONE', 'status' => 'corbeille']));

        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/data-center?status=actif')
            ->assertStatus(200)->assertJsonCount(1, 'data')->assertJsonPath('data.0.denomination', 'ACTIVE ONE');

        $this->actingAs($admin)->getJson('/api/v1/data-center?status=archive')
            ->assertStatus(200)->assertJsonCount(1, 'data')->assertJsonPath('data.0.denomination', 'ARCHIVED ONE');

        $this->actingAs($admin)->getJson('/api/v1/data-center?status=corbeille')
            ->assertStatus(200)->assertJsonCount(1, 'data')->assertJsonPath('data.0.denomination', 'TRASHED ONE');
    }

    /** Convention du projet : on ne supprime définitivement que depuis la Corbeille. */
    public function test_delete_is_refused_when_not_in_corbeille(): void
    {
        $fiche = DataCenterFiche::create($this->payload());

        $this->actingAs($this->admin())
            ->deleteJson("/api/v1/data-center/{$fiche->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('data_center_fiches', ['id' => $fiche->id, 'deleted_at' => null]);
    }

    /** « Suppression définitive » = soft delete, comme partout dans le projet. */
    public function test_delete_from_corbeille_soft_deletes(): void
    {
        $fiche = DataCenterFiche::create($this->payload(['status' => 'corbeille']));

        $this->actingAs($this->admin())
            ->deleteJson("/api/v1/data-center/{$fiche->id}")
            ->assertStatus(200);

        $this->assertSoftDeleted('data_center_fiches', ['id' => $fiche->id]);
        $this->actingAs($this->admin())->getJson('/api/v1/data-center?status=corbeille')
            ->assertStatus(200)->assertJsonCount(0, 'data');
    }

    // --- Recherche et pagination côté serveur -------------------------------

    public function test_search_is_performed_server_side(): void
    {
        DataCenterFiche::create($this->payload(['denomination' => 'INTER COLLES', 'ice' => '000084413000058']));
        DataCenterFiche::create($this->payload(['denomination' => 'BIG & BEE', 'ice' => '003520753000057']));

        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/data-center?search=INTER')
            ->assertStatus(200)->assertJsonCount(1, 'data')->assertJsonPath('data.0.denomination', 'INTER COLLES');

        // La recherche porte aussi sur ICE / IF / RC / TP.
        $this->actingAs($admin)->getJson('/api/v1/data-center?search=003520753000057')
            ->assertStatus(200)->assertJsonCount(1, 'data')->assertJsonPath('data.0.denomination', 'BIG & BEE');

        $this->actingAs($admin)->getJson('/api/v1/data-center?search=INTROUVABLE')
            ->assertStatus(200)->assertJsonCount(0, 'data');
    }

    public function test_pagination_is_performed_server_side(): void
    {
        for ($i = 1; $i <= 12; $i++) {
            DataCenterFiche::create($this->payload(['denomination' => sprintf('FICHE %02d', $i)]));
        }

        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/data-center?per_page=10&page=1')
            ->assertStatus(200)
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('total', 12)
            ->assertJsonPath('last_page', 2)
            ->assertJsonPath('data.0.denomination', 'FICHE 01');

        $this->actingAs($admin)->getJson('/api/v1/data-center?per_page=10&page=2')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('current_page', 2);
    }

    /** Une taille de page hors liste retombe sur 10 (même garde que les centres). */
    public function test_invalid_per_page_falls_back_to_ten(): void
    {
        for ($i = 1; $i <= 15; $i++) {
            DataCenterFiche::create($this->payload(['denomination' => sprintf('FICHE %02d', $i)]));
        }

        $this->actingAs($this->admin())
            ->getJson('/api/v1/data-center?per_page=9999')
            ->assertStatus(200)
            ->assertJsonPath('per_page', 10);
    }
}
