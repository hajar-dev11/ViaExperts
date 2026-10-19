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

    // Fonction : saisie libre (plus de liste fermée), limitée à la taille de la colonne.
    public function test_fonction_est_une_saisie_libre(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/users', [
            'name' => 'Fonction Libre', 'email' => 'libre@viaexperts.ma', 'password' => 'Mot-de-passe-123',
            'fonction' => 'Responsable administrative',
        ])->assertStatus(201)->assertJsonPath('data.fonction', 'Responsable administrative');

        $this->assertDatabaseHas('users', ['email' => 'libre@viaexperts.ma', 'fonction' => 'Responsable administrative']);

        $this->actingAs($admin)->postJson('/api/v1/users', [
            'name' => 'Trop Long', 'email' => 'long@viaexperts.ma', 'password' => 'Mot-de-passe-123',
            'fonction' => str_repeat('x', 31),
        ])->assertStatus(422)->assertJsonValidationErrors('fonction');
    }

    // Suppression d'une assistance : ses accès partent avec elle, rien de ce qui appartient aux autres n'est touché.
    public function test_supprimer_une_assistance_retire_ses_acces_sans_toucher_aux_autres(): void
    {
        $admin = $this->admin();
        $cible = $this->staff();
        $autre = $this->staff();
        $p1 = Permission::where('module', 'clients')->where('action', 'list')->first();
        $p2 = Permission::where('module', 'entreprises')->where('action', 'list')->first();

        $cible->userPermissions()->create(['permission_id' => $p1->id, 'granted_by' => $admin->id, 'granted_at' => now()]);
        $cible->userPermissions()->create(['permission_id' => $p2->id, 'granted_by' => $admin->id, 'granted_at' => now()]);
        // L'autre compte a la MÊME permission (partagée) ; c'est la cible qui la lui a « accordée » (cas limite : granted_by).
        $autre->userPermissions()->create(['permission_id' => $p1->id, 'granted_by' => $cible->id, 'granted_at' => now()]);
        $cible->createToken('test');
        $autre->createToken('test');

        $this->actingAs($admin)->deleteJson("/api/v1/users/{$cible->id}")->assertStatus(200);

        $this->assertDatabaseMissing('users', ['id' => $cible->id]);
        $this->assertDatabaseMissing('user_permissions', ['user_id' => $cible->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $cible->id]);

        // L'autre compte garde son compte, sa permission (même identifiant de permission) et son jeton.
        $this->assertDatabaseHas('users', ['id' => $autre->id]);
        $this->assertDatabaseHas('user_permissions', ['user_id' => $autre->id, 'permission_id' => $p1->id, 'granted_by' => null]);
        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $autre->id]);
        // Les permissions du catalogue ne sont jamais supprimées.
        $this->assertDatabaseHas('permissions', ['id' => $p1->id]);
        $this->assertDatabaseHas('permissions', ['id' => $p2->id]);
        $this->assertTrue($autre->fresh()->hasPermission('clients', 'list'));
    }

    public function test_suppression_refusee_pour_soi_meme_le_dernier_admin_et_un_non_admin(): void
    {
        $admin = $this->admin();
        $staff = $this->staff();
        $autre = $this->staff();

        $this->actingAs($admin)->deleteJson("/api/v1/users/{$admin->id}")->assertStatus(422);
        $this->assertDatabaseHas('users', ['id' => $admin->id]);

        $this->actingAs($staff)->deleteJson("/api/v1/users/{$autre->id}")->assertStatus(403);
        $this->assertDatabaseHas('users', ['id' => $autre->id]);
    }

    // Sécurité additionnelle : invité refusé partout.
    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/users')->assertStatus(401);
        $this->getJson('/api/v1/clients')->assertStatus(401);
    }
}
