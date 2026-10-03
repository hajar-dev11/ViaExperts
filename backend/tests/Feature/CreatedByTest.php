<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * « Créé par » — le membre du système (assistant ou administrateur) qui a
 * créé une fiche Client ou Entreprise, posé sur `parties.created_by`.
 */
class CreatedByTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create(['is_admin' => true, 'name' => 'Hajar Admin']);
    }

    public function test_creating_a_client_records_who_created_it(): void
    {
        $user = $this->user();

        $response = $this->actingAs($user)->postJson('/api/v1/clients', [
            'genre' => 'Mr', 'nom' => 'Client Traçable',
        ]);

        $response->assertStatus(201)->assertJsonPath('data.createdBy', 'Hajar Admin');

        $client = Client::where('nom', 'Client Traçable')->firstOrFail();
        $this->assertSame($user->id, $client->party->created_by);
    }

    public function test_creating_an_entreprise_records_who_created_it(): void
    {
        $user = $this->user();

        $response = $this->actingAs($user)->postJson('/api/v1/entreprises', [
            'denomination' => 'Traçable SARL', 'forme' => 'SARL', 'periode' => 'Mensuel',
        ]);

        $response->assertStatus(201)->assertJsonPath('data.createdBy', 'Hajar Admin');

        $entreprise = Entreprise::where('denomination', 'Traçable SARL')->firstOrFail();
        $this->assertSame($user->id, $entreprise->party->created_by);
    }

    public function test_created_by_stays_null_for_records_without_an_author(): void
    {
        // Fiche créée directement (pas via une requête authentifiée), comme
        // le seraient les enregistrements antérieurs à cette colonne.
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        $client = Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'Ancien Client']);

        $response = $this->actingAs($this->user())->getJson("/api/v1/clients/{$client->party_id}");

        $response->assertStatus(200)->assertJsonPath('data.createdBy', null);
    }

    public function test_updating_a_client_does_not_change_its_created_by(): void
    {
        $auteur = $this->user();
        $autre = User::factory()->create(['is_admin' => true, 'name' => 'Autre Admin']);

        $clientId = $this->actingAs($auteur)->postJson('/api/v1/clients', [
            'genre' => 'Mr', 'nom' => 'Client Stable',
        ])->json('data.id');

        $this->actingAs($autre)->putJson("/api/v1/clients/{$clientId}", ['nom' => 'Client Stable Modifié'])
            ->assertStatus(200)
            ->assertJsonPath('data.createdBy', 'Hajar Admin');
    }
}
