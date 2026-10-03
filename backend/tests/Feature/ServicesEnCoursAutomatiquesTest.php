<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\ServiceStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * « Services en cours » est alimenté par les services réellement saisis sur les lignes des
 * Factures, Devis, Bons de livraison, Factures d'avoir et Paiements — même table, aucune liste parallèle.
 */
class ServicesEnCoursAutomatiquesTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function client(): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);

        return Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT TEST']);
    }

    private function service(string $nom = 'Déclaration TVA'): Service
    {
        return Service::create(['nom' => $nom, 'prix' => 500, 'status' => 'actif']);
    }

    private function ligne(?Service $service, string $designation = 'Ligne'): array
    {
        return [
            'service_id' => $service?->id,
            'designation' => $designation,
            'quantite' => 1,
            'prix_unitaire' => 500,
        ];
    }

    private function documentPayload(Client $client, array $lignes, string $numero): array
    {
        return [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $client->party_id,
            'numero' => $numero,
            'date_document' => '2026-10-02',
            'lignes' => $lignes,
        ];
    }

    /** @dataProvider typesDeDocument */
    public function test_chaque_type_de_document_alimente_services_en_cours(string $type): void
    {
        ServiceStatus::create(['nom' => 'En Attente', 'couleur_texte' => '#000', 'couleur_fond' => '#fff']);
        $client = $this->client();
        $service = $this->service();

        $this->actingAs($this->admin())
            ->postJson("/api/v1/facturation/{$type}", $this->documentPayload($client, [$this->ligne($service)], 'N-1'))
            ->assertStatus(201);

        $this->assertDatabaseHas('service_en_cours', [
            'service_id' => $service->id,
            'client_id' => $client->party_id,
            'status' => 'actif',
        ]);
        // Statut « business » par défaut, comme pour un service ajouté à la main.
        $this->assertSame('En Attente', ServiceEnCours::first()->statut->nom);
    }

    public static function typesDeDocument(): array
    {
        return [['facture'], ['devis'], ['bl'], ['avoir']];
    }

    public function test_paiement_alimente_services_en_cours(): void
    {
        $client = $this->client();
        $service = $this->service('Création de société');

        $this->actingAs($this->admin())->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $client->party_id,
            'date_operation' => '2026-10-02',
            'lignes' => [$this->ligne($service)],
        ])->assertStatus(201);

        $this->assertDatabaseHas('service_en_cours', ['service_id' => $service->id, 'client_id' => $client->party_id]);
    }

    public function test_pas_de_doublon_et_statut_existant_conserve(): void
    {
        $client = $this->client();
        $service = $this->service();
        $statut = ServiceStatus::create(['nom' => 'Dossier déposé', 'couleur_texte' => '#000', 'couleur_fond' => '#fff']);
        $existant = ServiceEnCours::create([
            'service_id' => $service->id, 'client_id' => $client->party_id, 'service_status_id' => $statut->id,
            'date_depart' => now(), 'derniere_operation' => now(),
        ]);

        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->documentPayload($client, [$this->ligne($service), $this->ligne($service)], 'N-2'))->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/facturation/devis', $this->documentPayload($client, [$this->ligne($service)], 'N-3'))->assertStatus(201);

        $this->assertSame(1, ServiceEnCours::count());
        // Le statut saisi sur la page « Services en cours » n'est pas écrasé.
        $this->assertSame($statut->id, $existant->fresh()->service_status_id);
    }

    public function test_ligne_libre_sans_service_ne_cree_rien(): void
    {
        $client = $this->client();

        $this->actingAs($this->admin())
            ->postJson('/api/v1/facturation/facture', $this->documentPayload($client, [$this->ligne(null, 'Frais divers')], 'N-4'))
            ->assertStatus(201);

        $this->assertSame(0, ServiceEnCours::count());
    }

    public function test_tiers_entreprise_rattache_au_client_titulaire(): void
    {
        $client = $this->client();
        $service = $this->service('Domiciliation');
        $partyEntreprise = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        Entreprise::create(['party_id' => $partyEntreprise->id, 'client_id' => $client->party_id, 'denomination' => 'ENTREPRISE TEST']);

        $payload = $this->documentPayload($client, [$this->ligne($service)], 'N-5');
        $payload['party_id'] = $partyEntreprise->id;

        $this->actingAs($this->admin())->postJson('/api/v1/facturation/facture', $payload)->assertStatus(201);

        $this->assertDatabaseHas('service_en_cours', ['service_id' => $service->id, 'client_id' => $client->party_id]);
    }

    public function test_service_ajoute_lors_d_une_modification_apparait(): void
    {
        $client = $this->client();
        $a = $this->service('Service A');
        $b = $this->service('Service B');
        $admin = $this->admin();

        $id = $this->actingAs($admin)
            ->postJson('/api/v1/facturation/facture', $this->documentPayload($client, [$this->ligne($a)], 'N-6'))
            ->assertStatus(201)->json('data.id');

        $this->actingAs($admin)
            ->putJson("/api/v1/facturation/facture/{$id}", ['lignes' => [$this->ligne($a), $this->ligne($b)]])
            ->assertStatus(200);

        $this->assertDatabaseHas('service_en_cours', ['service_id' => $b->id, 'client_id' => $client->party_id]);
        $this->assertSame(2, ServiceEnCours::count());
    }
}
