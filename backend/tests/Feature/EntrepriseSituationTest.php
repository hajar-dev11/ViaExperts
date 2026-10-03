<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Liste Noire / Bloquer — bascule de `entreprises.situation`, déjà affichée
 * par la référence (« Normale » par défaut). Permissions `liste_noire` et
 * `bloquer`, présentes au catalogue mais jamais branchées avant ce module.
 */
class EntrepriseSituationTest extends TestCase
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

    /** Utilisateur non-admin doté d'une seule permission du module Entreprises. */
    private function staffAvecPermission(string $action): User
    {
        $user = User::factory()->create(['is_admin' => false]);
        $permission = Permission::where('module', 'entreprises')->where('action', $action)->firstOrFail();

        UserPermission::create([
            'user_id' => $user->id,
            'permission_id' => $permission->id,
            'granted_by' => $user->id,
            'granted_at' => now(),
        ]);

        return $user;
    }

    private function entreprise(User $user): Entreprise
    {
        $response = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Situation SARL',
            'forme' => 'SARL',
            'periode' => 'Mensuel',
        ])->assertStatus(201);

        return Entreprise::findOrFail($response->json('data.id'));
    }

    public function test_entreprise_situation_defaults_to_normale(): void
    {
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $this->assertSame('Normale', $entreprise->situation);
    }

    public function test_admin_can_add_entreprise_to_liste_noire_and_remove_it(): void
    {
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$entreprise->party_id}/liste-noire")
            ->assertStatus(200)
            ->assertJsonPath('data.situation', 'Liste Noire');

        $this->assertDatabaseHas('entreprises', ['party_id' => $entreprise->party_id, 'situation' => 'Liste Noire']);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$entreprise->party_id}/liste-noire/retirer")
            ->assertStatus(200)
            ->assertJsonPath('data.situation', 'Normale');
    }

    public function test_admin_can_bloquer_entreprise_and_debloquer_it(): void
    {
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$entreprise->party_id}/bloquer")
            ->assertStatus(200)
            ->assertJsonPath('data.situation', 'Bloqué');

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$entreprise->party_id}/debloquer")
            ->assertStatus(200)
            ->assertJsonPath('data.situation', 'Normale');
    }

    public function test_bloquer_overrides_a_previous_liste_noire(): void
    {
        $user = $this->admin();
        $entreprise = $this->entreprise($user);

        $this->actingAs($user)->postJson("/api/v1/entreprises/{$entreprise->party_id}/liste-noire")->assertStatus(200);
        $this->actingAs($user)->postJson("/api/v1/entreprises/{$entreprise->party_id}/bloquer")
            ->assertStatus(200)
            ->assertJsonPath('data.situation', 'Bloqué');
    }

    public function test_staff_without_liste_noire_permission_is_forbidden(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise($admin);
        $staff = $this->staffAvecPermission('bloquer');

        $this->actingAs($staff)->postJson("/api/v1/entreprises/{$entreprise->party_id}/liste-noire")
            ->assertStatus(403);
    }

    public function test_staff_with_liste_noire_permission_can_use_it(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise($admin);
        $staff = $this->staffAvecPermission('liste_noire');

        $this->actingAs($staff)->postJson("/api/v1/entreprises/{$entreprise->party_id}/liste-noire")
            ->assertStatus(200)
            ->assertJsonPath('data.situation', 'Liste Noire');
    }

    public function test_staff_without_bloquer_permission_is_forbidden(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise($admin);
        $staff = $this->staffAvecPermission('liste_noire');

        $this->actingAs($staff)->postJson("/api/v1/entreprises/{$entreprise->party_id}/bloquer")
            ->assertStatus(403);
    }

    public function test_guest_cannot_change_situation(): void
    {
        // Créée directement (sans passer par une requête authentifiée) : la
        // session de test ne doit garder aucune trace d'un utilisateur connecté.
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        $entreprise = Entreprise::create([
            'party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'Invité SARL',
        ]);

        $this->postJson("/api/v1/entreprises/{$entreprise->party_id}/liste-noire")->assertStatus(401);
    }

    // --- Relation Client → Entreprises ---------------------------------------

    public function test_client_show_exposes_its_entreprises(): void
    {
        $user = $this->admin();

        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        $client = Client::create([
            'party_id' => $party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'Client Titulaire',
        ]);

        $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Filiale SARL',
            'forme' => 'SARL',
            'periode' => 'Mensuel',
            'client' => 'Client Titulaire',
        ])->assertStatus(201);

        $response = $this->actingAs($user)->getJson("/api/v1/clients/{$client->party_id}");

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data.entreprises')
            ->assertJsonPath('data.entreprises.0.denomination', 'Filiale SARL');
    }

    public function test_client_show_returns_empty_entreprises_when_none_linked(): void
    {
        $user = $this->admin();
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        $client = Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'Sans Entreprise']);

        $this->actingAs($user)->getJson("/api/v1/clients/{$client->party_id}")
            ->assertStatus(200)
            ->assertJsonPath('data.entreprises', []);
    }
}
