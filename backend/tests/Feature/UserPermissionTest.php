<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserPermissionTest extends TestCase
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

    private function staff(): User
    {
        return User::factory()->create(['is_admin' => false]);
    }

    // 1. ADMIN peut créer un utilisateur.
    public function test_admin_can_create_user(): void
    {
        $response = $this->actingAs($this->admin())->postJson('/api/v1/users', [
            'name' => 'Nouvel Assistant',
            'email' => 'assistant@viaexperts.ma',
            'telephone' => '0600000000',
            'password' => 'Mot-de-passe-123',
            'fonction' => 'Assistant',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.name', 'Nouvel Assistant')
            ->assertJsonPath('data.isAdmin', false);

        $this->assertDatabaseHas('users', ['email' => 'assistant@viaexperts.ma', 'is_admin' => false]);
    }

    // 2. Utilisateur créé sans permission = aucune permission.
    public function test_new_user_has_no_permissions_by_default(): void
    {
        $response = $this->actingAs($this->admin())->postJson('/api/v1/users', [
            'name' => 'Sans Droit',
            'email' => 'sansdroit@viaexperts.ma',
            'password' => 'Mot-de-passe-123',
        ]);

        $userId = $response->json('data.id');
        $this->assertDatabaseCount('user_permissions', 0);
        $this->assertSame([], $response->json('data.permissions'));
        $this->assertNotNull($userId);
    }

    // 3 & 4. ADMIN peut attribuer une permission, enregistrée en base.
    public function test_admin_can_grant_permission_and_it_is_persisted(): void
    {
        $admin = $this->admin();
        $staff = $this->staff();
        $permission = Permission::where('module', 'clients')->where('action', 'list')->first();

        $response = $this->actingAs($admin)->putJson("/api/v1/users/{$staff->id}/permissions", [
            'permissions' => [$permission->id],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('user_permissions', [
            'user_id' => $staff->id,
            'permission_id' => $permission->id,
        ]);
    }

    // 5. Après "reload" (nouvelle requête / nouvelle lecture), la permission est toujours là.
    public function test_permission_persists_after_reload(): void
    {
        $admin = $this->admin();
        $staff = $this->staff();
        $permission = Permission::where('module', 'clients')->where('action', 'list')->first();

        $this->actingAs($admin)->putJson("/api/v1/users/{$staff->id}/permissions", [
            'permissions' => [$permission->id],
        ]);

        // Nouvelle requête indépendante, comme après un rechargement de page.
        $reload = $this->actingAs($admin)->getJson("/api/v1/users/{$staff->id}/permissions");
        $reload->assertStatus(200)->assertJsonFragment(['module' => 'clients', 'action' => 'list']);
    }

    // 6. Utilisateur non-admin AVEC permission = accès autorisé.
    public function test_staff_with_permission_can_access_action(): void
    {
        $admin = $this->admin();
        $staff = $this->staff();
        $permission = Permission::where('module', 'clients')->where('action', 'list')->first();
        $staff->userPermissions()->create(['permission_id' => $permission->id, 'granted_by' => $admin->id, 'granted_at' => now()]);

        $this->actingAs($staff)->getJson('/api/v1/clients')->assertStatus(200);
    }

    // 7. Utilisateur non-admin SANS permission = 403.
    public function test_staff_without_permission_gets_403(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff)->getJson('/api/v1/clients')->assertStatus(403);
        $this->actingAs($staff)->postJson('/api/v1/clients', [])->assertStatus(403);
    }

    // 8. Utilisateur non-admin ne peut pas modifier les permissions via API.
    public function test_staff_cannot_modify_permissions(): void
    {
        $staff = $this->staff();
        $other = $this->staff();
        $permission = Permission::first();

        $this->actingAs($staff)
            ->putJson("/api/v1/users/{$other->id}/permissions", ['permissions' => [$permission->id]])
            ->assertStatus(403);
    }

    // 9. Utilisateur non-admin ne peut pas créer un autre utilisateur.
    public function test_staff_cannot_create_user(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff)->postJson('/api/v1/users', [
            'name' => 'Intrus', 'email' => 'intrus@viaexperts.ma', 'password' => 'Mot-de-passe-123',
        ])->assertStatus(403);
    }

    // 10. ADMIN conserve son accès métier même sans lignes dans user_permissions.
    public function test_admin_keeps_business_access_without_explicit_permissions(): void
    {
        $admin = $this->admin();
        $this->assertDatabaseCount('user_permissions', 0);

        $this->actingAs($admin)->getJson('/api/v1/clients')->assertStatus(200);
        $this->actingAs($admin)->getJson('/api/v1/users')->assertStatus(200);
    }

    // 11. Les permissions restent correctes après déconnexion/reconnexion (nouvelle session = nouvelle requête authentifiée).
    public function test_permission_still_correct_after_new_login_session(): void
    {
        $admin = $this->admin();
        $staff = $this->staff();
        $permission = Permission::where('module', 'entreprises')->where('action', 'create')->first();
        $staff->userPermissions()->create(['permission_id' => $permission->id, 'granted_by' => $admin->id, 'granted_at' => now()]);

        // Première "session"
        $this->actingAs($staff)->getJson('/api/v1/entreprises')->assertStatus(403); // pas la permission 'list'

        // Nouvelle "session" (reconnexion simulée par un nouvel appel actingAs indépendant)
        $this->actingAs($staff)->postJson('/api/v1/entreprises', [
            'denomination' => 'Test SARL', 'forme' => 'SARL', 'periode' => 'Mensuel',
        ])->assertStatus(201); // a bien la permission 'create'
    }

    // Sécurité additionnelle : invité refusé partout.
    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/users')->assertStatus(401);
        $this->getJson('/api/v1/clients')->assertStatus(401);
    }
}
