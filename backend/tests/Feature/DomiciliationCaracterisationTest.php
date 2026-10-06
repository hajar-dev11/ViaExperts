<?php

namespace Tests\Feature;

use App\Models\CentreDomiciliation;
use App\Models\Domiciliation;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tests de CARACTÉRISATION de Domiciliation (étape 17, avant la modularisation du backend) : centres, observations privées,
 * filtre `statut`, action `activer`. Ils décrivent le comportement EXISTANT — y compris ses particularités — et ne
 * proposent aucune correction. Écrits et exécutés sur le code actuel.
 */
class DomiciliationCaracterisationTest extends TestCase
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

    /** @param  array<int, string>  $actions  actions du groupe `domiciliation` accordées */
    private function staff(array $actions = []): User
    {
        $user = User::factory()->create(['is_admin' => false]);
        foreach ($actions as $action) {
            $permission = Permission::where('module', 'domiciliation')->where('action', $action)->firstOrFail();
            UserPermission::create(['user_id' => $user->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        }

        return $user;
    }

    private function centre(string $nom = null): CentreDomiciliation
    {
        return CentreDomiciliation::create(['nom' => $nom ?? 'CENTRE '.uniqid()]);
    }

    private function entreprise(): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'ENTREPRISE '.$party->id]);
    }

    private function creerDomiciliation(User $auteur, array $override = []): Domiciliation
    {
        $id = $this->actingAs($auteur)->postJson('/api/v1/domiciliations', array_merge([
            'entreprise_id' => $this->entreprise()->party_id,
            'centre_domiciliation_id' => $this->centre()->id,
            'mois_payee' => 12,
            'date_depart' => now()->toDateString(),
            'date_fin' => now()->addMonths(6)->toDateString(),
            'mode_paiement' => 'Virement',
        ], $override))->assertStatus(201)->json('data.id');

        return Domiciliation::findOrFail($id);
    }

    // =========================================================================================================
    //  A. Centres de domiciliation
    // =========================================================================================================

    public function test_centre_creation_lecture_modification(): void
    {
        $admin = $this->admin();

        $id = $this->actingAs($admin)->postJson('/api/v1/centres-domiciliation', [
            'nom' => 'CENTRE ALPHA', 'ville' => 'Casablanca', 'ice' => '123', 'email' => 'a@b.test',
        ])->assertStatus(201)->assertJsonPath('nom', 'CENTRE ALPHA')->json('id');

        $this->assertDatabaseHas('centres_domiciliation', ['id' => $id, 'nom' => 'CENTRE ALPHA', 'status' => 'actif']);

        $this->actingAs($admin)->getJson("/api/v1/centres-domiciliation/{$id}")
            ->assertOk()->assertJsonPath('nom', 'CENTRE ALPHA')->assertJsonPath('domiciliations', []);

        $this->actingAs($admin)->putJson("/api/v1/centres-domiciliation/{$id}", ['nom' => 'CENTRE BETA', 'ville' => 'Rabat'])
            ->assertOk()->assertJsonPath('nom', 'CENTRE BETA')->assertJsonPath('ville', 'Rabat');
    }

    public function test_centre_validation_nom_obligatoire_et_unique(): void
    {
        $admin = $this->admin();
        $autre = $this->centre('CENTRE EXISTANT');
        $centre = $this->centre('CENTRE A MODIFIER');

        $this->actingAs($admin)->postJson('/api/v1/centres-domiciliation', [])->assertStatus(422)->assertJsonValidationErrors(['nom']);
        $this->actingAs($admin)->postJson('/api/v1/centres-domiciliation', ['nom' => 'CENTRE EXISTANT'])->assertStatus(422)->assertJsonValidationErrors(['nom']);
        // Modification : garder son propre nom est permis, prendre celui d'un autre non.
        $this->actingAs($admin)->putJson("/api/v1/centres-domiciliation/{$centre->id}", ['nom' => 'CENTRE A MODIFIER'])->assertOk();
        $this->actingAs($admin)->putJson("/api/v1/centres-domiciliation/{$centre->id}", ['nom' => $autre->nom])->assertStatus(422)->assertJsonValidationErrors(['nom']);
    }

    public function test_centre_fiche_contient_les_domiciliations_du_centre_les_plus_recentes_d_abord(): void
    {
        $admin = $this->admin();
        $centre = $this->centre();
        $ancienne = $this->creerDomiciliation($admin, ['centre_domiciliation_id' => $centre->id, 'date_depart' => '2025-01-01', 'date_fin' => '2025-12-31']);
        $recente = $this->creerDomiciliation($admin, ['centre_domiciliation_id' => $centre->id, 'date_depart' => '2026-03-01', 'date_fin' => '2027-02-28']);

        $reponse = $this->actingAs($admin)->getJson("/api/v1/centres-domiciliation/{$centre->id}")->assertOk();

        $this->assertSame([$recente->id, $ancienne->id], collect($reponse->json('domiciliations'))->pluck('id')->all());
        $this->assertNotNull($reponse->json('domiciliations.0.entreprise'));
    }

    public function test_centre_liste_pagination_filtre_statut_et_recherche(): void
    {
        // La migration des centres insère des centres de référence : on isole les centres du test par un jeton de recherche.
        $admin = $this->admin();
        $this->centre('ZZT-B CASA')->update(['ville' => 'VilleZZT']);
        $this->centre('ZZT-A RABAT')->update(['ice' => 'ICE-ZZT-777']);
        $this->centre('ZZT-C ARCHIVE')->update(['status' => 'archive']);
        $noms = fn (string $requete) => collect($this->actingAs($admin)->getJson('/api/v1/centres-domiciliation'.$requete)->assertOk()->json('data'))->pluck('nom')->all();

        $this->assertSame(['ZZT-A RABAT', 'ZZT-B CASA'], $noms('?search=ZZT'), 'Statut `actif` par défaut, tri par nom.');
        $this->assertSame(['ZZT-C ARCHIVE'], $noms('?search=ZZT&status=archive'));
        $this->assertSame(['ZZT-A RABAT', 'ZZT-B CASA'], $noms('?search=ZZT&status=nimporte'), 'Statut inconnu → `actif`.');
        $this->assertSame([], $noms('?search=ZZT&status=corbeille'));
        $this->assertSame(['ZZT-A RABAT'], $noms('?search=ICE-ZZT-777'), 'La recherche porte aussi sur l\'ICE.');
        $this->assertSame(['ZZT-B CASA'], $noms('?search=villezzt'), 'La recherche porte aussi sur la ville (insensible à la casse).');

        $page = $this->actingAs($admin)->getJson('/api/v1/centres-domiciliation')->assertOk();
        $this->assertSame(10, $page->json('per_page'));
        $this->assertSame(CentreDomiciliation::where('status', 'actif')->count(), $page->json('total'));
        $this->assertSame(10, $this->actingAs($admin)->getJson('/api/v1/centres-domiciliation?per_page=7')->json('per_page'), 'per_page hors liste → 10.');
        $this->assertSame(25, $this->actingAs($admin)->getJson('/api/v1/centres-domiciliation?per_page=25')->json('per_page'));
    }
    public function test_centre_cycle_archive_corbeille_restore_et_suppression_definitive(): void
    {
        $admin = $this->admin();
        $centre = $this->centre();
        $url = "/api/v1/centres-domiciliation/{$centre->id}";

        $this->actingAs($admin)->postJson("{$url}/archive")->assertOk()->assertJsonPath('status', 'archive');
        $this->actingAs($admin)->postJson("{$url}/restore")->assertOk()->assertJsonPath('status', 'actif');
        $this->actingAs($admin)->postJson("{$url}/corbeille")->assertOk()->assertJsonPath('status', 'corbeille');
        $this->actingAs($admin)->postJson("{$url}/restore")->assertOk()->assertJsonPath('status', 'actif');

        // Suppression définitive : refusée hors Corbeille.
        $this->actingAs($admin)->deleteJson($url)->assertStatus(422);
        $this->assertDatabaseHas('centres_domiciliation', ['id' => $centre->id, 'deleted_at' => null]);

        $this->actingAs($admin)->postJson("{$url}/corbeille")->assertOk();
        $this->actingAs($admin)->deleteJson($url)->assertOk()->assertJsonPath('message', 'Centre supprimé définitivement.');
        $this->assertSoftDeleted('centres_domiciliation', ['id' => $centre->id]);
    }

    public function test_centre_utilise_par_une_domiciliation_peut_etre_supprime_en_douceur_une_fois_en_corbeille(): void
    {
        // Particularité EXISTANTE : le message « utilisé par au moins une entreprise » n'est atteignable que si la base
        // refuse l'opération (FK RESTRICT), or `delete()` est une suppression douce (UPDATE) : la FK ne se déclenche pas.
        $admin = $this->admin();
        $centre = $this->centre();
        $domiciliation = $this->creerDomiciliation($admin, ['centre_domiciliation_id' => $centre->id]);
        $this->actingAs($admin)->postJson("/api/v1/centres-domiciliation/{$centre->id}/corbeille")->assertOk();

        $this->actingAs($admin)->deleteJson("/api/v1/centres-domiciliation/{$centre->id}")->assertOk();

        $this->assertSoftDeleted('centres_domiciliation', ['id' => $centre->id]);
        $this->assertSame($centre->id, $domiciliation->fresh()->centre_domiciliation_id, 'La domiciliation garde son centre.');
    }

    /** Permission accordée → routes autorisées (les autres répondent 403). */
    public function test_centre_chaque_permission_n_ouvre_que_ses_routes(): void
    {
        $routes = [
            'centres_list' => ['GET /centres-domiciliation', 'GET /centres-domiciliation/{id}'],
            'ajouter_centres' => ['POST /centres-domiciliation'],
            'modifier_centres' => ['PUT /centres-domiciliation/{id}'],
            'archive_centres' => ['POST /centres-domiciliation/{id}/archive', 'POST /centres-domiciliation/{id}/restore'],
            'corbeille_centres' => ['POST /centres-domiciliation/{id}/corbeille'],
            'supprimer_centres' => ['DELETE /centres-domiciliation/{id}'],
        ];

        foreach ($routes as $permission => $ouvertes) {
            $staff = $this->staff([$permission]);
            foreach ($routes as $autre => $routesAutre) {
                foreach ($routesAutre as $route) {
                    [$methode, $chemin] = explode(' ', $route);
                    $centre = $this->centre();
                    $reponse = $this->actingAs($staff)->json($methode, '/api/v1'.str_replace('{id}', (string) $centre->id, $chemin), ['nom' => 'NOM '.uniqid()]);
                    if ($autre === $permission) {
                        $this->assertNotSame(403, $reponse->getStatusCode(), "{$permission} doit ouvrir {$route}");
                    } else {
                        $this->assertSame(403, $reponse->getStatusCode(), "{$permission} ne doit pas ouvrir {$route}");
                    }
                }
            }
            $this->assertNotEmpty($ouvertes);
        }
    }

    // =========================================================================================================
    //  B. Observations privées
    // =========================================================================================================

    public function test_observation_privee_visible_seulement_par_son_auteur_et_les_administrateurs(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);
        $auteur = $this->staff(['list', 'gestion']);
        $lecteur = $this->staff(['list']);
        $url = "/api/v1/domiciliations/{$domiciliation->id}";

        $this->actingAs($auteur)->postJson("{$url}/observations", ['contenu' => 'PRIVEE', 'privee' => true])->assertOk();
        $this->actingAs($auteur)->postJson("{$url}/observations", ['contenu' => 'PUBLIQUE'])->assertOk();

        $contenus = fn (User $u) => collect($this->actingAs($u)->getJson($url)->assertOk()->json('data.observations'))->pluck('contenu')->sort()->values()->all();

        $this->assertSame(['PRIVEE', 'PUBLIQUE'], $contenus($auteur), 'L\'auteur voit ses observations privées.');
        $this->assertSame(['PRIVEE', 'PUBLIQUE'], $contenus($admin), 'L\'administrateur voit tout.');
        $this->assertSame(['PUBLIQUE'], $contenus($lecteur), 'Un autre utilisateur ne voit pas la privée.');
        $this->assertDatabaseHas('domiciliation_observations', ['contenu' => 'PRIVEE', 'privee' => 1, 'created_by' => $auteur->id]);
    }

    public function test_piece_jointe_d_une_observation_privee_suit_la_visibilite_de_l_observation(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);
        $auteur = $this->staff(['list', 'gestion']);
        $lecteur = $this->staff(['list']);
        $url = "/api/v1/domiciliations/{$domiciliation->id}";

        $this->actingAs($auteur)->post("{$url}/observations", [
            'contenu' => 'AVEC FICHIER', 'privee' => '1', 'fichier' => UploadedFile::fake()->create('note.pdf', 10, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk();
        $observation = $domiciliation->observations()->first();
        $this->assertNotNull($observation->fichier_chemin);
        Storage::disk('public')->assertExists($observation->fichier_chemin);

        $telechargement = "{$url}/observations/{$observation->id}/fichier/download";
        $this->actingAs($auteur)->get($telechargement)->assertOk();
        $this->actingAs($admin)->get($telechargement)->assertOk();
        $this->actingAs($lecteur)->get($telechargement)->assertStatus(403);
    }

    public function test_observation_privee_une_observation_publique_est_visible_et_telechargeable_par_tous(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);
        $url = "/api/v1/domiciliations/{$domiciliation->id}";

        $this->actingAs($admin)->post("{$url}/observations", [
            'contenu' => 'PUBLIQUE', 'fichier' => UploadedFile::fake()->create('pub.pdf', 5, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk();
        $observation = $domiciliation->observations()->first();

        $this->assertFalse((bool) $observation->privee);
        $this->actingAs($this->staff(['list']))->get("{$url}/observations/{$observation->id}/fichier/download")->assertOk();
    }

    // =========================================================================================================
    //  C. Filtre `statut` de la liste
    // =========================================================================================================

    public function test_liste_filtre_statut_d_affichage(): void
    {
        $admin = $this->admin();
        $active = $this->creerDomiciliation($admin, ['date_fin' => now()->addMonths(6)->toDateString()]);
        $alerte = $this->creerDomiciliation($admin, ['date_depart' => now()->subMonth()->toDateString(), 'date_fin' => now()->addDays(10)->toDateString()]);
        $expiree = $this->creerDomiciliation($admin, ['date_depart' => now()->subYear()->toDateString(), 'date_fin' => now()->subMonth()->toDateString()]);
        $declaree = $this->creerDomiciliation($admin);
        $resiliee = $this->creerDomiciliation($admin);
        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$declaree->id}/declarer")->assertOk();
        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$resiliee->id}/resilier")->assertOk();

        $ids = fn (string $requete) => collect($this->actingAs($admin)->getJson('/api/v1/domiciliations'.$requete)->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$active->id, $alerte->id, $expiree->id, $declaree->id, $resiliee->id])->sort()->values()->all(), $ids(''), 'Sans filtre : toutes les domiciliations actives.');
        $this->assertSame([$active->id], $ids('?statut=active'));
        $this->assertSame([$alerte->id], $ids('?statut=alerte'));
        $this->assertSame([$expiree->id], $ids('?statut=expire'));
        $this->assertSame([$declaree->id], $ids('?statut=declare'));
        $this->assertSame([$resiliee->id], $ids('?statut=resilie'));
        $this->assertSame([], $ids('?statut=inconnu'), 'Statut inconnu → liste vide.');
    }

    public function test_liste_filtre_status_archive_et_entreprise_se_combinent_avec_statut(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise();
        $a = $this->creerDomiciliation($admin, ['entreprise_id' => $entreprise->party_id]);
        $b = $this->creerDomiciliation($admin, ['entreprise_id' => $entreprise->party_id]);
        $this->creerDomiciliation($admin); // autre entreprise
        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$b->id}/archive")->assertOk();

        $ids = fn (string $requete) => collect($this->actingAs($admin)->getJson('/api/v1/domiciliations'.$requete)->json('data'))->pluck('id')->all();

        $this->assertSame([$a->id], $ids("?entreprise_id={$entreprise->party_id}"));
        $this->assertSame([$b->id], $ids("?entreprise_id={$entreprise->party_id}&status=archive"));
        $this->assertSame([$a->id], $ids("?entreprise_id={$entreprise->party_id}&statut=active"));
        $this->assertSame([], $ids("?entreprise_id={$entreprise->party_id}&statut=expire"));
    }

    // =========================================================================================================
    //  D. Action `activer`
    // =========================================================================================================

    public function test_activer_remet_une_domiciliation_declaree_ou_resiliee_a_l_etat_active(): void
    {
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);
        $url = "/api/v1/domiciliations/{$domiciliation->id}";

        $this->actingAs($admin)->postJson("{$url}/declarer")->assertOk();
        $this->assertSame('declare', $domiciliation->fresh()->etat);
        $this->assertNotNull($domiciliation->fresh()->date_declaration);

        $this->actingAs($admin)->postJson("{$url}/activer")->assertOk()->assertJsonPath('data.statutAffichage', 'active');
        $actuelle = $domiciliation->fresh();
        $this->assertSame('active', $actuelle->etat);
        $this->assertNull($actuelle->date_declaration);
        $this->assertNull($actuelle->date_resiliation);

        $this->actingAs($admin)->postJson("{$url}/resilier")->assertOk();
        $this->assertSame('resilie', $domiciliation->fresh()->etat);
        $this->assertNotNull($domiciliation->fresh()->date_resiliation);

        $this->actingAs($admin)->postJson("{$url}/activer")->assertOk();
        $this->assertSame('active', $domiciliation->fresh()->etat);
        $this->assertNull($domiciliation->fresh()->date_resiliation);
    }

    public function test_activer_journalise_une_operation_et_ne_change_pas_le_statut_de_conservation(): void
    {
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);
        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$domiciliation->id}/resilier")->assertOk();

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$domiciliation->id}/activer")->assertOk();

        $this->assertSame('actif', $domiciliation->fresh()->status, '`status` (archive/corbeille) n\'est pas touché par `activer`.');
        $this->assertDatabaseHas('domiciliation_operations', ['domiciliation_id' => $domiciliation->id, 'type' => 'activation', 'created_by' => $admin->id]);
        $this->assertSame(
            ['resiliation', 'activation'],
            \DB::table('domiciliation_operations')->where('domiciliation_id', $domiciliation->id)->orderBy('id')->pluck('type')->all()
        );
    }

    public function test_activer_sur_une_domiciliation_deja_active_reste_possible(): void
    {
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);

        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$domiciliation->id}/activer")->assertOk();

        $this->assertSame('active', $domiciliation->fresh()->etat);
        $this->assertDatabaseHas('domiciliation_operations', ['domiciliation_id' => $domiciliation->id, 'type' => 'activation']);
    }

    public function test_activer_exige_la_permission_gestion(): void
    {
        $admin = $this->admin();
        $domiciliation = $this->creerDomiciliation($admin);
        $url = "/api/v1/domiciliations/{$domiciliation->id}/activer";

        $this->actingAs($this->staff())->postJson($url)->assertStatus(403);
        $this->actingAs($this->staff(['list', 'ajouter']))->postJson($url)->assertStatus(403);
        $this->actingAs($this->staff(['gestion']))->postJson($url)->assertOk();
    }

    public function test_activer_domiciliation_inconnue_donne_404(): void
    {
        $this->actingAs($this->admin())->postJson('/api/v1/domiciliations/999999/activer')->assertStatus(404);
    }
}
