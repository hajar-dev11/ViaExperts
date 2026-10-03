<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EntrepriseTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        // Admin : ce test vérifie le CRUD Entreprises lui-même, pas le système de permissions
        // (couvert séparément par UserPermissionTest).
        return User::factory()->create(['is_admin' => true]);
    }

    public function test_guest_cannot_access_entreprises(): void
    {
        $this->getJson('/api/v1/entreprises')->assertStatus(401);
    }

    public function test_authenticated_user_can_create_entreprise_with_secteurs_and_centre(): void
    {
        // Le centre 'VIA EXPERTS' fait partie des 11 centres réels seedés par la migration.

        $response = $this->actingAs($this->user())->postJson('/api/v1/entreprises', [
            'denomination' => 'Atlas Trading SARL',
            'forme' => 'SARL',
            'periode' => 'Mensuel',
            'ice' => 'ICE123456',
            'local' => 'Contrat de domiciliation',
            'centreDomiciliation' => 'VIA EXPERTS',
            'secteurs' => [
                ['secteur' => 'Commerce', 'activite' => 'Vente de gros'],
            ],
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.denomination', 'Atlas Trading SARL')
            ->assertJsonPath('data.situation', 'Normale')
            ->assertJsonPath('data.centreDomiciliation', 'VIA EXPERTS')
            ->assertJsonPath('data.secteurs.0.secteur', 'Commerce');

        $this->assertDatabaseHas('entreprises', ['denomination' => 'Atlas Trading SARL', 'ice' => 'ICE123456']);
        $this->assertDatabaseHas('entreprise_secteurs', ['secteur' => 'Commerce']);
    }

    public function test_denomination_is_required(): void
    {
        $this->actingAs($this->user())
            ->postJson('/api/v1/entreprises', ['forme' => 'SARL', 'periode' => 'Mensuel'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['denomination']);
    }

    public function test_ice_must_be_unique(): void
    {
        $user = $this->user();
        $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Premiere SARL', 'forme' => 'SARL', 'periode' => 'Mensuel', 'ice' => 'DUP001',
        ])->assertStatus(201);

        $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Deuxieme SARL', 'forme' => 'SARL', 'periode' => 'Mensuel', 'ice' => 'DUP001',
        ])->assertStatus(422)->assertJsonValidationErrors(['ice']);
    }

    public function test_list_only_returns_entreprises_with_matching_status(): void
    {
        $user = $this->user();
        $create = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Zenith SARL', 'forme' => 'SARL', 'periode' => 'Mensuel',
        ])->json('data');

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$create['id']}/archive")->assertStatus(200);

        $this->actingAs($user)->getJson('/api/v1/entreprises?status=actif')
            ->assertJsonMissing(['denomination' => 'Zenith SARL']);

        $this->actingAs($user)->getJson('/api/v1/entreprises?status=archive')
            ->assertJsonFragment(['denomination' => 'Zenith SARL']);
    }

    public function test_update_persists_changes(): void
    {
        $user = $this->user();
        $create = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Nom Initial', 'forme' => 'SARL', 'periode' => 'Mensuel',
        ])->json('data');

        $this->actingAs($user)->putJson("/api/v1/entreprises/{$create['id']}", [
            'denomination' => 'Nom Modifie', 'observation' => 'Note ajoutee',
        ])->assertStatus(200)->assertJsonPath('data.denomination', 'Nom Modifie');

        $this->assertDatabaseHas('entreprises', ['party_id' => $create['id'], 'denomination' => 'Nom Modifie']);
    }

    public function test_full_archive_corbeille_restore_destroy_cycle(): void
    {
        $user = $this->user();
        $id = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Cycle SARL', 'forme' => 'SARL', 'periode' => 'Mensuel',
        ])->json('data.id');

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$id}/archive")->assertStatus(200);
        $this->assertDatabaseHas('parties', ['id' => $id, 'status' => 'archive']);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$id}/corbeille")->assertStatus(200);
        $this->assertDatabaseHas('parties', ['id' => $id, 'status' => 'corbeille']);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$id}/restore")->assertStatus(200);
        $this->assertDatabaseHas('parties', ['id' => $id, 'status' => 'actif']);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$id}/corbeille")->assertStatus(200);
        $this->actingAs($user)->deleteJson("/api/v1/entreprises/{$id}")->assertStatus(200);

        $this->assertSoftDeleted('parties', ['id' => $id]);
        $this->actingAs($user)->getJson("/api/v1/entreprises/{$id}")->assertStatus(404);
    }

    public function test_cannot_delete_definitively_unless_in_corbeille(): void
    {
        $user = $this->user();
        $id = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Protegee SARL', 'forme' => 'SARL', 'periode' => 'Mensuel',
        ])->json('data.id');

        $this->actingAs($user)->deleteJson("/api/v1/entreprises/{$id}")->assertStatus(422);
        $this->assertDatabaseHas('parties', ['id' => $id, 'deleted_at' => null]);
    }
}
