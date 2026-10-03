<?php

namespace Tests\Feature;

use App\Models\CabinetSetting;
use App\Models\CentreDomiciliation;
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
 * Couvre les corrections issues de l'audit :
 * restore protégé, lecture des centres, permissions chat/rapports,
 * et incrémentation des compteurs de numérotation.
 */
class CorrectionsAuditTest extends TestCase
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

    private function staff(array $permissions = []): User
    {
        $staff = User::factory()->create(['is_admin' => false]);

        foreach ($permissions as [$module, $action]) {
            $permission = Permission::where('module', $module)->where('action', $action)->firstOrFail();
            UserPermission::create([
                'user_id' => $staff->id,
                'permission_id' => $permission->id,
                'granted_at' => now(),
            ]);
        }

        return $staff;
    }

    private function clientArchive(): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'archive']);

        return Client::create([
            'party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST',
        ]);
    }

    private function entrepriseArchive(): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'archive']);

        return Entreprise::create([
            'party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'ENTREPRISE TEST',
        ]);
    }

    // ------------------------------------------------- 1. restore protégé

    public function test_client_restore_is_refused_without_permission(): void
    {
        $client = $this->clientArchive();
        $staff = $this->staff([['clients', 'list']]); // list seul : pas archive

        $this->actingAs($staff)
            ->postJson("/api/v1/clients/{$client->party_id}/restore")
            ->assertStatus(403);

        $this->assertSame('archive', $client->party->fresh()->status);
    }

    public function test_client_restore_is_allowed_with_archive_permission(): void
    {
        $client = $this->clientArchive();
        $staff = $this->staff([['clients', 'archive']]);

        $this->actingAs($staff)
            ->postJson("/api/v1/clients/{$client->party_id}/restore")
            ->assertOk();

        $this->assertSame('actif', $client->party->fresh()->status);
    }

    public function test_entreprise_restore_is_refused_without_permission(): void
    {
        $entreprise = $this->entrepriseArchive();
        $staff = $this->staff([['entreprises', 'list']]);

        $this->actingAs($staff)
            ->postJson("/api/v1/entreprises/{$entreprise->party_id}/restore")
            ->assertStatus(403);

        $this->assertSame('archive', $entreprise->party->fresh()->status);
    }

    public function test_entreprise_restore_is_allowed_with_archive_permission(): void
    {
        $entreprise = $this->entrepriseArchive();
        $staff = $this->staff([['entreprises', 'archive']]);

        $this->actingAs($staff)
            ->postJson("/api/v1/entreprises/{$entreprise->party_id}/restore")
            ->assertOk();

        $this->assertSame('actif', $entreprise->party->fresh()->status);
    }

    public function test_admin_can_still_restore(): void
    {
        $client = $this->clientArchive();

        $this->actingAs($this->admin())
            ->postJson("/api/v1/clients/{$client->party_id}/restore")
            ->assertOk();
    }

    // ------------------------------- 2. lecture des centres hors groupe admin

    public function test_staff_with_centres_list_can_read_centres(): void
    {
        // La migration seed déjà les 11 centres métier : on vérifie la présence
        // du centre créé ici, pas un comptage total.
        CentreDomiciliation::create(['nom' => 'AAA CENTRE TEST']);
        $staff = $this->staff([['domiciliation', 'centres_list']]);

        $this->actingAs($staff)->getJson('/api/v1/centres-domiciliation')
            ->assertOk()
            ->assertJsonPath('data.0.nom', 'AAA CENTRE TEST'); // tri alphabétique
    }

    public function test_staff_without_permission_cannot_read_centres(): void
    {
        $this->actingAs($this->staff())->getJson('/api/v1/centres-domiciliation')->assertStatus(403);
    }

    // Les centres de domiciliation sont désormais délégables comme le reste de
    // l'application (cf. permissions `ajouter_centres`/`archive_centres`/
    // `corbeille_centres`/`supprimer_centres` du catalogue) : un staff AVEC la
    // permission peut créer un centre, un staff SANS ne le peut pas.
    public function test_creating_a_centre_requires_the_ajouter_centres_permission(): void
    {
        $sansPermission = $this->staff([['domiciliation', 'centres_list']]);
        $this->actingAs($sansPermission)
            ->postJson('/api/v1/centres-domiciliation', ['nom' => 'NOUVEAU'])
            ->assertStatus(403);

        $avecPermission = $this->staff([['domiciliation', 'centres_list'], ['domiciliation', 'ajouter_centres']]);
        $this->actingAs($avecPermission)
            ->postJson('/api/v1/centres-domiciliation', ['nom' => 'NOUVEAU STAFF'])
            ->assertStatus(201);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/centres-domiciliation', ['nom' => 'NOUVEAU ADMIN'])
            ->assertStatus(201);
    }

    // --------------------------------------- 3. permissions chat / rapports

    public function test_chat_requires_permissions(): void
    {
        $sans = $this->staff();
        $this->actingAs($sans)->getJson('/api/v1/chat/contacts')->assertStatus(403);

        $avec = $this->staff([['chat', 'list']]);
        $this->actingAs($avec)->getJson('/api/v1/chat/contacts')->assertOk();

        // `envoyer` non accordée : l'envoi reste refusé.
        $cible = $this->admin();
        $this->actingAs($avec)
            ->postJson("/api/v1/chat/{$cible->id}/messages", ['body' => 'Bonjour'])
            ->assertStatus(403);
    }

    public function test_rapports_require_permissions(): void
    {
        $sans = $this->staff();
        $this->actingAs($sans)->getJson('/api/v1/rapports')->assertStatus(403);

        $avec = $this->staff([['rapports', 'list']]);
        $this->actingAs($avec)->getJson('/api/v1/rapports')->assertOk();

        $this->actingAs($avec)
            ->postJson('/api/v1/rapports', ['date_rapport' => '2026-09-15'])
            ->assertStatus(403);
    }

    public function test_admin_keeps_access_to_chat_and_rapports(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/chat/contacts')->assertOk();
        $this->actingAs($admin)->getJson('/api/v1/rapports')->assertOk();
    }

    // ------------------------- 3bis. module `parametre` (délégable vs admin strict)

    /**
     * bureau_comptabilite / centre_domiciliation / ajouter_services_status /
     * ajouter_cashet_status / ajouter_mail_status sont désormais déléguables à un
     * staff via Paramètres → Assistance (auparavant un garde `admin` brut, non
     * lié au catalogue, rendait ces cases à cocher inopérantes).
     */
    public function test_parametre_delegable_actions_grant_access_once_assigned(): void
    {
        $routes = [
            ['bureau_comptabilite', '/api/v1/settings/cabinet'],
            ['centre_domiciliation', '/api/v1/settings/domiciliation'],
            ['ajouter_services_status', '/api/v1/service-statuses'],
            ['ajouter_cashet_status', '/api/v1/cachet-statuses'],
            ['ajouter_mail_status', '/api/v1/mail-statuses'],
        ];

        $sansPermission = $this->staff();
        foreach ($routes as [, $route]) {
            $this->actingAs($sansPermission)->getJson($route)->assertStatus(403);
        }

        foreach ($routes as [$action, $route]) {
            $avecPermission = $this->staff([['parametre', $action]]);
            // `assertSuccessful` (2xx) plutôt que `assertOk` (200 strict) : certaines de
            // ces routes (ex. /settings/cabinet) créent leur enregistrement par défaut au
            // premier accès via `firstOrCreate`, ce que Laravel reflète en 201.
            $this->actingAs($avecPermission)->getJson($route)->assertSuccessful();
        }
    }

    /**
     * `account` (gérer les utilisateurs), `mot_de_passe` (changer le mot de passe
     * d'un AUTRE utilisateur) et `ajouter_assistance` (voir/modifier les permissions
     * d'autrui) doivent rester strictement admin, même si une ligne user_permissions
     * existait pour ces actions (ex. ancienne donnée, manipulation directe de la
     * table) : le garde de route est `admin` (is_admin), pas `permission:parametre,...`,
     * donc aucune permission accordée ne peut faire passer un non-admin.
     */
    public function test_parametre_account_and_assistance_actions_stay_admin_only_even_if_granted(): void
    {
        $staff = $this->staff([
            ['parametre', 'account'],
            ['parametre', 'mot_de_passe'],
            ['parametre', 'ajouter_assistance'],
        ]);

        $this->actingAs($staff)->getJson('/api/v1/users')->assertStatus(403);
        $this->actingAs($staff)->postJson('/api/v1/users', [
            'name' => 'X', 'email' => 'x@example.com', 'password' => 'password123',
        ])->assertStatus(403);
        $this->actingAs($staff)->getJson('/api/v1/permissions')->assertStatus(403);
        $this->actingAs($staff)->putJson("/api/v1/users/{$this->admin()->id}/permissions", [
            'permission_ids' => [],
        ])->assertStatus(403);
    }

    // ------------------------------------ 4. incrémentation de la numérotation

    private function partyPourFacture(): int
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'C']);

        return $party->id;
    }

    private function facture(User $admin, int $partyId, string $numero): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $partyId,
            'numero' => $numero,
            'date_document' => '2026-09-17 11:00:00',
            'prix_paye' => 0,
            'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100, 'remise_pourcent' => 0, 'tva_pourcent' => 20]],
        ]);
    }

    public function test_counter_advances_after_each_document(): void
    {
        $admin = $this->admin();
        $partyId = $this->partyPourFacture();

        CabinetSetting::firstOrCreate([])->update([
            'facture_prefixe' => 'FAC-', 'facture_prochain_numero' => '291', 'facture_suffixe' => '/25',
        ]);

        // 1re proposition
        $this->actingAs($admin)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite')
            ->assertJsonPath('numero', 'FAC-291/25');

        $this->facture($admin, $partyId, 'FAC-291/25')->assertStatus(201);

        // Le compteur a avancé : la 2e proposition est différente.
        $this->actingAs($admin)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite')
            ->assertJsonPath('numero', 'FAC-292/25');

        $this->facture($admin, $partyId, 'FAC-292/25')->assertStatus(201);

        $this->actingAs($admin)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite')
            ->assertJsonPath('numero', 'FAC-293/25');

        // Colonne entière : comparaison sur la valeur, pas sur le type.
        $this->assertEquals(293, CabinetSetting::first()->facture_prochain_numero);
    }

    public function test_custom_number_does_not_move_the_counter(): void
    {
        $admin = $this->admin();
        $partyId = $this->partyPourFacture();

        CabinetSetting::firstOrCreate([])->update([
            'facture_prefixe' => 'FAC-', 'facture_prochain_numero' => '291', 'facture_suffixe' => '/25',
        ]);

        $this->facture($admin, $partyId, 'NUMERO-MANUEL-1')->assertStatus(201);

        $this->assertEquals(291, CabinetSetting::first()->facture_prochain_numero);
    }

    /** Un compteur vide ne doit pas être inventé. */
    public function test_empty_counter_is_left_untouched(): void
    {
        $admin = $this->admin();
        $partyId = $this->partyPourFacture();

        CabinetSetting::firstOrCreate([])->update([
            'facture_prefixe' => 'FAC-', 'facture_prochain_numero' => null, 'facture_suffixe' => '/26',
        ]);

        $this->facture($admin, $partyId, 'FAC-LIBRE/26')->assertStatus(201);

        $this->assertNull(CabinetSetting::first()->facture_prochain_numero);
    }

    public function test_each_document_type_has_its_own_counter(): void
    {
        $admin = $this->admin();
        $partyId = $this->partyPourFacture();

        CabinetSetting::firstOrCreate([])->update([
            'facture_prefixe' => 'FAC-', 'facture_prochain_numero' => '10', 'facture_suffixe' => '/26',
            'devis_prefixe' => 'DEV-', 'devis_prochain_numero' => '50', 'devis_suffixe' => '/26',
        ]);

        $this->facture($admin, $partyId, 'FAC-10/26')->assertStatus(201);

        $settings = CabinetSetting::first();
        $this->assertEquals(11, $settings->facture_prochain_numero);
        // Le compteur Devis n'a pas bougé.
        $this->assertEquals(50, $settings->devis_prochain_numero);
    }
}
