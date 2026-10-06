<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Parties (Entreprise / Client) ↔ centres de domiciliation : tests de CARACTÉRISATION (étape 19).
 *
 * Ils décrivent ce que Parties fait AUJOURD'HUI avec le centre de domiciliation d'une entreprise, avant que ce lien ne passe
 * par un contrat : résolution du centre par son NOM à l'écriture (EntrepriseController), affichage de son NOM et de son
 * identifiant dans EntrepriseResource et ClientResource. Écrits et exécutés sur l'implémentation par relation Eloquent, ils
 * doivent passer à l'identique après le découplage. Ils n'importent aucune classe du module Domiciliation (accès par la base).
 */
class PartiesCentreDomiciliationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function centre(string $nom, string $status = 'actif', bool $supprime = false): int
    {
        $id = DB::table('centres_domiciliation')->insertGetId([
            'nom' => $nom, 'status' => $status, 'created_at' => now(), 'updated_at' => now(),
            'deleted_at' => $supprime ? now() : null,
        ]);

        return $id;
    }

    private function entreprise(?int $centreId = null, ?int $clientId = null, string $denomination = 'ENTREPRISE TEST'): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create([
            'party_id' => $party->id, 'type' => 'entreprise', 'denomination' => $denomination,
            'centre_domiciliation_id' => $centreId, 'client_id' => $clientId,
        ]);
    }

    private function payload(array $override = []): array
    {
        return array_merge(['denomination' => 'Atlas SARL', 'forme' => 'SARL', 'periode' => 'Mensuel'], $override);
    }

    // ---- Écriture : le centre est désigné par son NOM --------------------------------------------------------------

    public function test_creation_resout_le_centre_par_son_nom_et_expose_nom_et_identifiant(): void
    {
        $id = $this->centre('ZZ CENTRE ALPHA');

        $this->actingAs($this->admin())->postJson('/api/v1/entreprises', $this->payload(['centreDomiciliation' => 'ZZ CENTRE ALPHA']))
            ->assertStatus(201)
            ->assertJsonPath('data.centreDomiciliation', 'ZZ CENTRE ALPHA')
            ->assertJsonPath('data.centreDomiciliationId', $id);

        $this->assertDatabaseHas('entreprises', ['denomination' => 'Atlas SARL', 'centre_domiciliation_id' => $id]);
    }

    public function test_sans_centre_les_deux_champs_sont_nuls(): void
    {
        $this->actingAs($this->admin())->postJson('/api/v1/entreprises', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('data.centreDomiciliation', null)
            ->assertJsonPath('data.centreDomiciliationId', null);
    }

    public function test_un_nom_inconnu_donne_silencieusement_un_centre_nul(): void
    {
        // Particularité EXISTANTE : aucune erreur de validation, le centre est simplement vide.
        $this->actingAs($this->admin())->postJson('/api/v1/entreprises', $this->payload(['centreDomiciliation' => 'CENTRE QUI N EXISTE PAS']))
            ->assertStatus(201)
            ->assertJsonPath('data.centreDomiciliation', null)
            ->assertJsonPath('data.centreDomiciliationId', null);
    }

    public function test_modification_change_vide_ou_conserve_le_centre(): void
    {
        $a = $this->centre('ZZ CENTRE A');
        $b = $this->centre('ZZ CENTRE B');
        $entreprise = $this->entreprise($a);
        $admin = $this->admin();
        $url = "/api/v1/entreprises/{$entreprise->party_id}";

        $this->actingAs($admin)->putJson($url, ['centreDomiciliation' => 'ZZ CENTRE B'])
            ->assertOk()->assertJsonPath('data.centreDomiciliation', 'ZZ CENTRE B')->assertJsonPath('data.centreDomiciliationId', $b);

        // Clé absente → inchangé.
        $this->actingAs($admin)->putJson($url, ['denomination' => 'NOUVEAU NOM'])
            ->assertOk()->assertJsonPath('data.centreDomiciliation', 'ZZ CENTRE B');

        // Nom inconnu → centre vidé (comportement existant).
        $this->actingAs($admin)->putJson($url, ['centreDomiciliation' => 'INCONNU'])
            ->assertOk()->assertJsonPath('data.centreDomiciliation', null)->assertJsonPath('data.centreDomiciliationId', null);
        $this->assertNull($entreprise->fresh()->centre_domiciliation_id);

        // Valeur vide / nulle → centre vidé.
        $entreprise->update(['centre_domiciliation_id' => $a]);
        $this->actingAs($admin)->putJson($url, ['centreDomiciliation' => null])->assertOk()->assertJsonPath('data.centreDomiciliationId', null);
        $entreprise->update(['centre_domiciliation_id' => $a]);
        $this->actingAs($admin)->putJson($url, ['centreDomiciliation' => ''])->assertOk()->assertJsonPath('data.centreDomiciliationId', null);
    }

    // ---- Centres archivés / supprimés en douceur -------------------------------------------------------------------

    public function test_un_centre_archive_est_toujours_resolu_et_affiche(): void
    {
        $id = $this->centre('ZZ CENTRE ARCHIVE', 'archive');
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/entreprises', $this->payload(['centreDomiciliation' => 'ZZ CENTRE ARCHIVE']))
            ->assertStatus(201)->assertJsonPath('data.centreDomiciliation', 'ZZ CENTRE ARCHIVE')->assertJsonPath('data.centreDomiciliationId', $id);
        $this->actingAs($admin)->getJson('/api/v1/entreprises/'.$this->entreprise($id)->party_id)->assertOk()->assertJsonPath('data.centreDomiciliation', 'ZZ CENTRE ARCHIVE');
    }

    public function test_un_centre_supprime_en_douceur_n_est_plus_resolu_par_nom_et_son_nom_disparait_de_l_affichage(): void
    {
        $id = $this->centre('ZZ CENTRE SUPPRIME', 'corbeille', supprime: true);
        $admin = $this->admin();

        // Écriture : le nom d'un centre supprimé est « inconnu ».
        $this->actingAs($admin)->postJson('/api/v1/entreprises', $this->payload(['centreDomiciliation' => 'ZZ CENTRE SUPPRIME']))
            ->assertStatus(201)->assertJsonPath('data.centreDomiciliationId', null)->assertJsonPath('data.centreDomiciliation', null);

        // Lecture : une entreprise qui référence déjà ce centre garde l'identifiant mais plus le nom.
        $entreprise = $this->entreprise($id);
        $this->actingAs($admin)->getJson("/api/v1/entreprises/{$entreprise->party_id}")
            ->assertOk()->assertJsonPath('data.centreDomiciliationId', $id)->assertJsonPath('data.centreDomiciliation', null);
    }

    // ---- Lecture : liste, fiche, client -----------------------------------------------------------------------------

    public function test_liste_des_entreprises_expose_les_noms_de_centres_en_une_seule_requete(): void
    {
        $a = $this->centre('ZZ CENTRE LISTE A');
        $b = $this->centre('ZZ CENTRE LISTE B');
        $e1 = $this->entreprise($a, null, 'E1');
        $e2 = $this->entreprise($b, null, 'E2');
        $e3 = $this->entreprise($a, null, 'E3');
        $e4 = $this->entreprise(null, null, 'E4');
        $admin = $this->admin();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $liste = $this->actingAs($admin)->getJson('/api/v1/entreprises')->assertOk()->json('data');
        $requetes = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        $parId = collect($liste)->keyBy('id');
        $this->assertSame('ZZ CENTRE LISTE A', $parId[$e1->party_id]['centreDomiciliation']);
        $this->assertSame('ZZ CENTRE LISTE B', $parId[$e2->party_id]['centreDomiciliation']);
        $this->assertSame('ZZ CENTRE LISTE A', $parId[$e3->party_id]['centreDomiciliation']);
        $this->assertNull($parId[$e4->party_id]['centreDomiciliation']);
        $this->assertSame($a, $parId[$e1->party_id]['centreDomiciliationId']);
        $this->assertSame(1, $requetes->filter(fn ($q) => str_contains($q, 'from `centres_domiciliation`'))->count(), 'Une requête pour toute la liste (pas de N+1).');
    }

    public function test_fiche_entreprise_charge_le_centre_en_une_requete(): void
    {
        $entreprise = $this->entreprise($this->centre('ZZ CENTRE FICHE'));
        $admin = $this->admin();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)->getJson("/api/v1/entreprises/{$entreprise->party_id}")->assertOk()->assertJsonPath('data.centreDomiciliation', 'ZZ CENTRE FICHE');
        $requetes = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        $this->assertSame(1, $requetes->filter(fn ($q) => str_contains($q, 'from `centres_domiciliation`'))->count());
    }

    public function test_fiche_client_expose_le_nom_du_centre_de_ses_entreprises(): void
    {
        $partyClient = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $partyClient->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT CENTRE']);
        $a = $this->centre('ZZ CENTRE CLIENT A');
        $this->entreprise($a, $partyClient->id, 'AVEC CENTRE');
        $this->entreprise(null, $partyClient->id, 'SANS CENTRE');
        $this->entreprise($this->centre('ZZ CENTRE SUPPRIME 2', 'corbeille', true), $partyClient->id, 'CENTRE SUPPRIME');
        $admin = $this->admin();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $reponse = $this->actingAs($admin)->getJson("/api/v1/clients/{$partyClient->id}")->assertOk();
        $requetes = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        $centres = collect($reponse->json('data.entreprises'))->pluck('centreDomiciliation', 'denomination')->all();
        $this->assertSame(['AVEC CENTRE' => 'ZZ CENTRE CLIENT A', 'SANS CENTRE' => null, 'CENTRE SUPPRIME' => null], $centres);
        $this->assertSame(
            ['id', 'denomination', 'forme', 'ice', 'if', 'situation', 'local', 'centreDomiciliation'],
            array_keys($reponse->json('data.entreprises.0')),
            'Forme des entreprises dans la fiche client inchangée.'
        );
        $this->assertSame(1, $requetes->filter(fn ($q) => str_contains($q, 'from `centres_domiciliation`'))->count(), 'Une requête pour toutes les entreprises du client.');
    }

    public function test_liste_des_clients_n_expose_pas_les_entreprises(): void
    {
        $partyClient = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $partyClient->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT LISTE']);
        $this->entreprise($this->centre('ZZ CENTRE X'), $partyClient->id);

        $liste = $this->actingAs($this->admin())->getJson('/api/v1/clients')->assertOk()->json('data');

        $this->assertSame([], collect($liste)->firstWhere('nom', 'CLIENT LISTE')['entreprises']);
    }
}
