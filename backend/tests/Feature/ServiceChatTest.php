<?php

namespace Tests\Feature;

use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServiceChatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Nécessaire depuis que Chat est protégé par le groupe de permissions `chat`.
        $this->seed(\Database\Seeders\PermissionSeeder::class);
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    /**
     * Le Chat est désormais protégé par le groupe de permissions `chat`.
     * Un non-admin doit recevoir explicitement `list` et `envoyer`.
     */
    private function staffAvecChat(): User
    {
        $staff = User::factory()->create(['is_admin' => false]);

        foreach (['list', 'envoyer'] as $action) {
            $permission = \App\Models\Permission::where('module', 'chat')->where('action', $action)->firstOrFail();
            \App\Models\UserPermission::create([
                'user_id' => $staff->id,
                'permission_id' => $permission->id,
                'granted_at' => now(),
            ]);
        }

        return $staff;
    }

    // ---------------------------------------------------------------- Services

    public function test_guest_cannot_list_services(): void
    {
        $this->getJson('/api/v1/services')->assertStatus(401);
    }

    public function test_admin_can_create_service(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/services', [
                'nom' => 'Demande de certificat négatif',
                'prix' => 450,
                'via_experts' => true,
                'maitre' => 'Morad Bendeq',
            ])
            ->assertStatus(201)
            ->assertJsonPath('nom', 'Demande de certificat négatif');

        $this->assertDatabaseHas('services', ['nom' => 'Demande de certificat négatif', 'status' => 'actif']);
    }

    public function test_service_name_is_required(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/services', ['prix' => 10])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['nom']);
    }

    public function test_service_update_is_persisted(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/services', ['nom' => 'Service A', 'prix' => 100])->json('id');

        $this->actingAs($admin)->putJson("/api/v1/services/{$id}", ['prix' => 675])->assertOk();

        $this->assertSame('675.00', Service::find($id)->prix);
    }

    public function test_service_archive_corbeille_restore_and_delete(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/services', ['nom' => 'Service B', 'prix' => 50])->json('id');

        $this->actingAs($admin)->postJson("/api/v1/services/{$id}/archive")->assertJsonPath('status', 'archive');
        $this->actingAs($admin)->getJson('/api/v1/services?status=archive')->assertJsonCount(1);

        $this->actingAs($admin)->postJson("/api/v1/services/{$id}/restore")->assertJsonPath('status', 'actif');

        $this->actingAs($admin)->deleteJson("/api/v1/services/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/services/{$id}/corbeille")->assertJsonPath('status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/services/{$id}")->assertOk();

        $this->assertNull(Service::find($id));
        $this->assertNotNull(Service::withTrashed()->find($id)->deleted_at);
    }

    public function test_staff_without_permission_cannot_list_services(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/services')->assertStatus(403);
    }

    // -------------------------------------------------------------------- Chat

    public function test_guest_cannot_use_chat(): void
    {
        $this->getJson('/api/v1/chat/contacts')->assertStatus(401);
    }

    public function test_contacts_exclude_current_user(): void
    {
        $me = $this->admin();
        $other = User::factory()->create(['is_admin' => false]);

        $response = $this->actingAs($me)->getJson('/api/v1/chat/contacts')->assertOk();

        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($other->id));
        $this->assertFalse($ids->contains($me->id));
    }

    public function test_message_is_persisted_and_readable_by_both_sides(): void
    {
        $me = $this->admin();
        $other = $this->staffAvecChat();

        $this->actingAs($me)
            ->postJson("/api/v1/chat/{$other->id}/messages", ['body' => 'Bonjour'])
            ->assertStatus(201)
            ->assertJsonPath('mine', true);

        $this->assertDatabaseHas('chat_messages', [
            'sender_id' => $me->id,
            'recipient_id' => $other->id,
            'body' => 'Bonjour',
        ]);

        // L'expéditeur voit son message comme « mine », le destinataire non.
        $this->actingAs($me)->getJson("/api/v1/chat/{$other->id}/messages")
            ->assertJsonCount(1)
            ->assertJsonPath('0.mine', true);

        $this->actingAs($other)->getJson("/api/v1/chat/{$me->id}/messages")
            ->assertJsonCount(1)
            ->assertJsonPath('0.mine', false);
    }

    public function test_reading_a_conversation_marks_messages_as_read(): void
    {
        $me = $this->admin();
        $other = $this->staffAvecChat();

        $this->actingAs($me)->postJson("/api/v1/chat/{$other->id}/messages", ['body' => 'Coucou']);

        $contacts = $this->actingAs($other)->getJson('/api/v1/chat/contacts')->json();
        $this->assertSame(1, collect($contacts)->firstWhere('id', $me->id)['nonLus']);

        $this->actingAs($other)->getJson("/api/v1/chat/{$me->id}/messages")->assertOk();

        $contacts = $this->actingAs($other)->getJson('/api/v1/chat/contacts')->json();
        $this->assertSame(0, collect($contacts)->firstWhere('id', $me->id)['nonLus']);
    }

    public function test_empty_message_is_rejected(): void
    {
        $me = $this->admin();
        $other = User::factory()->create(['is_admin' => false]);

        $this->actingAs($me)
            ->postJson("/api/v1/chat/{$other->id}/messages", ['body' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['body']);
    }
}
