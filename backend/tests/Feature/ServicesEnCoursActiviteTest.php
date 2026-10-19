<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\ServiceEnCoursOperation;
use App\Models\ServiceStatus;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * « Services en cours » et « Activité Services » : l'activité est ENREGISTRÉE (création automatique, statut, commentaire,
 * fichier), avec auteur, date et heure réels, sans doublon, et les fichiers du document d'origine ne sont jamais supprimés.
 */
class ServicesEnCoursActiviteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        Storage::fake('public');
    }

    private function admin(string $nom = 'Via Experts'): User
    {
        return User::factory()->create(['is_admin' => true, 'name' => $nom]);
    }

    /** Utilisateur non administrateur avec seulement les droits `services_en_cours.<action>` donnés. */
    private function utilisateur(array $actions): User
    {
        $u = User::factory()->create(['is_admin' => false]);
        foreach ($actions as $action) {
            $p = Permission::where('module', 'services_en_cours')->where('action', $action)->firstOrFail();
            UserPermission::create(['user_id' => $u->id, 'permission_id' => $p->id, 'granted_at' => now()]);
        }

        return $u;
    }

    private function statut(string $nom = 'En Attente', string $fond = '#E0E7FF'): ServiceStatus
    {
        return ServiceStatus::create(['nom' => $nom, 'couleur_texte' => '#1616a2', 'couleur_fond' => $fond]);
    }

    private function client(string $nom = 'CLIENT TEST'): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);

        return Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => $nom]);
    }

    private function entrepriseDe(Client $client, string $nom = 'ENTREPRISE TEST'): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => $nom, 'client_id' => $client->party_id]);
    }

    private function serviceTva(): Service
    {
        return Service::firstOrCreate(['nom' => 'Déclaration TVA'], ['prix' => 0, 'status' => 'actif']);
    }

    private function declarerTva(User $u, Entreprise $e, int $mois = 3)
    {
        return $this->actingAs($u)->postJson('/api/v1/declarations/tva', [
            'entreprise_id' => $e->party_id, 'client_if' => '12345678', 'periode_type' => 'mois', 'periode_valeur' => $mois, 'annee' => 2026,
            'lignes' => [['ht' => 1000, 'tva' => 200, 'ttc' => 1200, 'taux' => 20]],
        ]);
    }

    // ---- 1 & 2. Déclaration TVA → service ET activité ------------------------------------------------------------

    public function test_une_declaration_tva_cree_le_service_et_son_activite_visible_dans_le_fil(): void
    {
        $enAttente = $this->statut();
        $this->serviceTva();
        $client = $this->client();
        $admin = $this->admin('Via Experts');

        $this->declarerTva($admin, $this->entrepriseDe($client))->assertStatus(201);

        // 1. Le service est dans « Services en cours ».
        $liste = $this->actingAs($admin)->getJson('/api/v1/services-en-cours')->assertOk()->assertJsonCount(1, 'data');
        $liste->assertJsonPath('data.0.service', 'Déclaration TVA')->assertJsonPath('data.0.client', 'CLIENT TEST')
            ->assertJsonPath('data.0.statut.nom', 'En Attente');

        // 2. Son activité est dans le fil « Activité Services » du tableau de bord, avec les vraies informations.
        $fil = $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')->assertOk()->assertJsonCount(1);
        $fil->assertJsonPath('0.action', 'creation')
            ->assertJsonPath('0.statut.id', $enAttente->id)
            ->assertJsonPath('0.statut.nom', 'En Attente')
            ->assertJsonPath('0.par', 'Via Experts')
            ->assertJsonPath('0.service', 'Déclaration TVA')
            ->assertJsonPath('0.client', 'CLIENT TEST')
            ->assertJsonPath('0.source.type', 'declaration_tva')
            ->assertJsonPath('0.fichierSource', null)
            ->assertJsonPath('0.fichierChemin', null);

        $operation = ServiceEnCoursOperation::firstOrFail();
        $this->assertSame($admin->id, $operation->created_by);
        // Date et heure RÉELLES de l'opération (pas une valeur inventée).
        $this->assertTrue($operation->created_at->between(now()->subMinute(), now()->addMinute()));
        $this->assertSame($operation->created_at->toDateTimeString(), $fil->json('0.createdAt'));
    }

    public function test_l_auteur_affiche_est_l_utilisateur_reel_pas_un_nom_fixe(): void
    {
        $this->statut();
        $this->serviceTva();
        $autre = $this->admin('Hajar Test');

        $this->declarerTva($autre, $this->entrepriseDe($this->client()))->assertStatus(201);

        $this->actingAs($autre)->getJson('/api/v1/services-en-cours/activite')->assertJsonPath('0.par', 'Hajar Test');
    }

    public function test_sans_statut_en_attente_le_service_est_cree_sans_statut_et_l_anomalie_est_journalisee(): void
    {
        Log::spy();
        $this->serviceTva();
        $admin = $this->admin();

        $this->declarerTva($admin, $this->entrepriseDe($this->client()))->assertStatus(201);

        // Le dépôt de la déclaration n'est pas bloqué, mais le défaut n'est pas silencieux : journalisé, et le statut reste vide
        // (jamais un statut inventé) — l'écran affiche « Sans statut » et un avertissement.
        Log::shouldHaveReceived('warning')->once();
        $this->assertNull(ServiceEnCours::firstOrFail()->service_status_id);
        $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')->assertJsonPath('0.statut', null);
    }

    public function test_la_liste_des_statuts_est_celle_de_parametres_sans_ajout_ni_doublon(): void
    {
        $a = $this->statut('En Attente');
        $b = $this->statut('Terminé', '#DCFCE7');

        $reponse = $this->actingAs($this->admin())->getJson('/api/v1/services-en-cours/statuts')->assertOk();

        $this->assertSame([$a->id, $b->id], array_column($reponse->json(), 'id'));
        $this->assertSame(['En Attente', 'Terminé'], array_column($reponse->json(), 'nom'));
        $this->assertSame(ServiceStatus::count(), count($reponse->json()));
    }

    public function test_la_liste_des_statuts_n_exige_que_le_droit_de_lecture_des_services_en_cours(): void
    {
        $this->statut();
        // Sans aucun droit : refusé. Avec « list » seulement (pas Paramètres) : la liste est servie.
        $this->actingAs($this->utilisateur([]))->getJson('/api/v1/services-en-cours/statuts')->assertStatus(403);
        $this->actingAs($this->utilisateur(['list']))->getJson('/api/v1/services-en-cours/statuts')->assertOk()->assertJsonCount(1);
    }

    // ---- 10. Pas de doublon ---------------------------------------------------------------------------------------

    public function test_modifier_ou_redeclarer_ne_duplique_pas_l_activite(): void
    {
        $this->statut();
        $this->serviceTva();
        $admin = $this->admin();
        $client = $this->client();
        $entreprise = $this->entrepriseDe($client);

        $id = $this->declarerTva($admin, $entreprise)->json('data.id');
        $this->assertSame(1, ServiceEnCoursOperation::count());

        // Modification de la déclaration, autre période du même client, rechargements de la liste et du fil : aucune activité en plus.
        $this->actingAs($admin)->putJson("/api/v1/declarations/tva/{$id}", ['regime' => '1'])->assertOk();
        $this->declarerTva($admin, $entreprise, 4)->assertStatus(201);
        foreach (range(1, 3) as $_) {
            $this->actingAs($admin)->getJson('/api/v1/services-en-cours')->assertOk();
            $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')->assertOk()->assertJsonCount(1);
        }

        $this->assertSame(1, ServiceEnCours::count());
        $this->assertSame(1, ServiceEnCoursOperation::count());
    }

    public function test_une_facture_modifiee_n_ajoute_pas_d_activite_pour_un_service_deja_suivi(): void
    {
        $this->statut();
        $admin = $this->admin();
        $client = $this->client();
        $service = Service::create(['nom' => 'Comptabilité', 'prix' => 100, 'status' => 'actif']);
        $payload = [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $client->party_id, 'numero' => 'ACT-1', 'date_document' => '2026-10-12',
            'lignes' => [['service_id' => $service->id, 'designation' => 'x', 'quantite' => 1, 'prix_unitaire' => 100]],
        ];

        $id = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $payload)->assertStatus(201)->json('data.id');
        $this->actingAs($admin)->putJson("/api/v1/facturation/facture/{$id}", ['lignes' => $payload['lignes']])->assertOk();

        $this->assertSame(1, ServiceEnCoursOperation::count());
        $this->assertSame('facture', ServiceEnCoursOperation::first()->source_type);
        $this->assertSame($id, ServiceEnCoursOperation::first()->source_id);
    }

    public function test_un_double_envoi_du_meme_changement_n_enregistre_qu_une_activite(): void
    {
        $this->statut();
        $termine = $this->statut('Terminé');
        $admin = $this->admin();
        $id = $this->serviceSuivi($admin)->id;

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['service_status_id' => $termine->id])->assertOk();
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['service_status_id' => $termine->id])->assertOk();
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['commentaire' => 'Dossier transmis'])->assertOk();
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$id}/operations", ['commentaire' => 'Dossier transmis'])->assertOk();

        // création + 1 statut + 1 commentaire
        $this->assertSame(3, ServiceEnCoursOperation::where('service_en_cours_id', $id)->count());
    }

    // ---- 3. Statut : changement conservé, ancien/nouveau ------------------------------------------------------------

    private function serviceSuivi(User $u, ?Client $client = null): ServiceEnCours
    {
        $this->serviceTva();
        $client ??= $this->client('CLIENT '.uniqid());
        $this->declarerTva($u, $this->entrepriseDe($client))->assertStatus(201);

        return ServiceEnCours::where('client_id', $client->party_id)->firstOrFail();
    }

    public function test_le_changement_de_statut_est_enregistre_conserve_et_trace_avec_l_ancien_statut(): void
    {
        $enAttente = $this->statut('En Attente');
        $termine = $this->statut('Terminé', '#DCFCE7');
        $admin = $this->admin('Via Experts');
        $service = $this->serviceSuivi($admin);

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['service_status_id' => $termine->id])
            ->assertOk()->assertJsonPath('data.statut.id', $termine->id);

        // « Actualisation » : le statut est relu de la base.
        $this->actingAs($admin)->getJson('/api/v1/services-en-cours')->assertJsonPath('data.0.statut.nom', 'Terminé');
        $this->assertSame($termine->id, $service->fresh()->service_status_id);

        $operation = ServiceEnCoursOperation::where('action', 'statut')->firstOrFail();
        $this->assertSame($enAttente->id, $operation->ancien_status_id);
        $this->assertSame($termine->id, $operation->service_status_id);
        $this->assertSame($admin->id, $operation->created_by);

        $fil = $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite');
        $fil->assertJsonPath('0.action', 'statut')->assertJsonPath('0.statut.nom', 'Terminé')->assertJsonPath('0.ancienStatut.nom', 'En Attente');
    }

    public function test_la_modification_depuis_le_formulaire_laisse_la_meme_trace(): void
    {
        $enAttente = $this->statut('En Attente');
        $termine = $this->statut('Terminé');
        $admin = $this->admin();
        $service = $this->serviceSuivi($admin);

        $this->actingAs($admin)->putJson("/api/v1/services-en-cours/{$service->id}", ['service_status_id' => $termine->id])->assertOk();

        $operation = ServiceEnCoursOperation::where('action', 'statut')->firstOrFail();
        $this->assertSame([$enAttente->id, $termine->id], [$operation->ancien_status_id, $operation->service_status_id]);
    }

    public function test_une_operation_vide_ou_un_statut_identique_sont_refuses_clairement(): void
    {
        $enAttente = $this->statut('En Attente');
        $admin = $this->admin();
        $service = $this->serviceSuivi($admin);

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", [])->assertStatus(422);

        // Au-delà du délai anti-doublon, re-sélectionner le statut actuel sans rien d'autre n'est pas un changement.
        $this->travel(30)->seconds();
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['service_status_id' => $enAttente->id])
            ->assertStatus(422)->assertJsonValidationErrors('service_status_id');

        $this->assertSame(1, ServiceEnCoursOperation::count()); // seulement la création
    }

    // ---- 4. Permissions --------------------------------------------------------------------------------------------

    public function test_un_utilisateur_non_autorise_ne_peut_modifier_ni_le_statut_ni_commenter_ni_ajouter_un_fichier(): void
    {
        $enAttente = $this->statut('En Attente');
        $termine = $this->statut('Terminé');
        $service = $this->serviceSuivi($this->admin());
        $lecteur = $this->utilisateur(['list']); // peut consulter, pas modifier

        $this->actingAs($lecteur)->getJson("/api/v1/services-en-cours/{$service->id}")->assertOk();
        $this->actingAs($lecteur)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['service_status_id' => $termine->id])->assertStatus(403);
        $this->actingAs($lecteur)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['commentaire' => 'x'])->assertStatus(403);
        $this->actingAs($lecteur)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['fichier' => UploadedFile::fake()->create('a.pdf', 5, 'application/pdf')])->assertStatus(403);

        $this->assertSame($enAttente->id, $service->fresh()->service_status_id);
        $this->assertSame(1, ServiceEnCoursOperation::count());

        $this->actingAs($this->utilisateur([]))->getJson("/api/v1/services-en-cours/{$service->id}")->assertStatus(403);
        $this->actingAs($this->utilisateur(['modifier']))->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['service_status_id' => $termine->id])->assertOk();
    }

    // ---- 5. Fichier : ajout, consultation, téléchargement ------------------------------------------------------------

    public function test_un_fichier_ajoute_est_stocke_par_service_consultable_et_telechargeable(): void
    {
        $this->statut();
        $admin = $this->admin('Via Experts');
        $service = $this->serviceSuivi($admin);

        $reponse = $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", [
            'fichier' => UploadedFile::fake()->create('Recu.pdf', 12, 'application/pdf'),
        ])->assertOk();

        $operation = ServiceEnCoursOperation::where('action', 'fichier')->firstOrFail();
        $this->assertSame('Recu.pdf', $operation->fichier_nom);
        // Un dossier par service en cours (donc par client) : jamais de mélange entre clients.
        $this->assertStringStartsWith("services-en-cours/{$service->id}/", $operation->fichier_chemin);
        Storage::disk('public')->assertExists($operation->fichier_chemin);

        $reponse->assertJsonPath('data.operations.0.fichierNom', 'Recu.pdf')->assertJsonPath('data.operations.0.fichierChemin', $operation->fichier_chemin);
        $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')->assertJsonPath('0.fichierNom', 'Recu.pdf')->assertJsonPath('0.action', 'fichier');

        // Téléchargement / ouverture : route de service des fichiers (session obligatoire).
        $this->actingAs($admin)->get('/storage/'.$operation->fichier_chemin)->assertOk();
        auth()->forgetGuards();
        $this->get('/storage/'.$operation->fichier_chemin)->assertStatus(401);
    }

    public function test_les_fichiers_de_deux_clients_vont_dans_deux_dossiers_distincts(): void
    {
        $this->statut();
        $admin = $this->admin();
        $a = $this->serviceSuivi($admin);
        $b = $this->serviceSuivi($admin);

        foreach ([$a, $b] as $s) {
            $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$s->id}/operations", [
                'fichier' => UploadedFile::fake()->create('meme-nom.pdf', 5, 'application/pdf'),
            ])->assertOk();
        }

        $chemins = ServiceEnCoursOperation::where('action', 'fichier')->orderBy('service_en_cours_id')->pluck('fichier_chemin')->all();
        $this->assertStringStartsWith("services-en-cours/{$a->id}/", $chemins[0]);
        $this->assertStringStartsWith("services-en-cours/{$b->id}/", $chemins[1]);
        $this->assertNotSame($chemins[0], $chemins[1]);
    }

    public function test_un_fichier_non_autorise_ou_trop_lourd_est_refuse_et_rien_n_est_enregistre(): void
    {
        $this->statut();
        $admin = $this->admin();
        $service = $this->serviceSuivi($admin);
        $url = "/api/v1/services-en-cours/{$service->id}/operations";

        $this->actingAs($admin)->postJson($url, ['fichier' => UploadedFile::fake()->create('script.php', 1, 'application/x-php')])->assertStatus(422)->assertJsonValidationErrors('fichier');
        $this->actingAs($admin)->postJson($url, ['fichier' => UploadedFile::fake()->create('trop-lourd.pdf', 6000, 'application/pdf')])->assertStatus(422)->assertJsonValidationErrors('fichier');

        $this->assertSame(1, ServiceEnCoursOperation::count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_remplacer_et_supprimer_un_fichier_ajoute(): void
    {
        $this->statut();
        $admin = $this->admin();
        $service = $this->serviceSuivi($admin);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['fichier' => UploadedFile::fake()->create('ancien.pdf', 5, 'application/pdf')])->assertOk();
        $operation = ServiceEnCoursOperation::where('action', 'fichier')->firstOrFail();
        $ancien = $operation->fichier_chemin;

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations/{$operation->id}/fichier", [
            'fichier' => UploadedFile::fake()->create('nouveau.pdf', 5, 'application/pdf'),
        ])->assertOk();

        $operation->refresh();
        $this->assertSame('nouveau.pdf', $operation->fichier_nom);
        Storage::disk('public')->assertMissing($ancien);
        Storage::disk('public')->assertExists($operation->fichier_chemin);

        $nouveau = $operation->fichier_chemin;
        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$service->id}/operations/{$operation->id}/fichier")->assertOk();
        Storage::disk('public')->assertMissing($nouveau);
        $this->assertNull(ServiceEnCoursOperation::find($operation->id), 'Une opération qui n\'était qu\'un fichier disparaît avec lui.');
        $this->assertSame(1, ServiceEnCoursOperation::count()); // la création est conservée
    }

    public function test_supprimer_le_fichier_d_une_operation_avec_commentaire_garde_le_commentaire(): void
    {
        $this->statut();
        $admin = $this->admin();
        $service = $this->serviceSuivi($admin);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", [
            'commentaire' => 'Pièce jointe au dossier', 'fichier' => UploadedFile::fake()->create('a.pdf', 5, 'application/pdf'),
        ])->assertOk();
        $operation = ServiceEnCoursOperation::where('action', 'fichier')->firstOrFail();

        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$service->id}/operations/{$operation->id}/fichier")->assertOk();

        $this->assertSame('Pièce jointe au dossier', $operation->fresh()->commentaire);
        $this->assertNull($operation->fresh()->fichier_chemin);
    }

    public function test_une_operation_d_un_autre_service_est_inaccessible_par_ce_service(): void
    {
        $this->statut();
        $admin = $this->admin();
        $a = $this->serviceSuivi($admin);
        $b = $this->serviceSuivi($admin);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$b->id}/operations", ['fichier' => UploadedFile::fake()->create('b.pdf', 5, 'application/pdf')])->assertOk();
        $operationDeB = ServiceEnCoursOperation::where('service_en_cours_id', $b->id)->where('action', 'fichier')->firstOrFail();

        // Passer par le service A avec l'opération de B : introuvable, rien n'est touché.
        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$a->id}/operations/{$operationDeB->id}/fichier")->assertStatus(404);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$a->id}/operations/{$operationDeB->id}/fichier", ['fichier' => UploadedFile::fake()->create('x.pdf', 5, 'application/pdf')])->assertStatus(404);

        Storage::disk('public')->assertExists($operationDeB->fresh()->fichier_chemin);
    }

    // ---- 6. Fichier du document d'origine ----------------------------------------------------------------------------

    public function test_la_piece_jointe_du_paiement_est_referencee_jamais_copiee_ni_supprimee(): void
    {
        $this->statut();
        $admin = $this->admin();
        $client = $this->client();
        $service = Service::create(['nom' => 'Comptabilité', 'prix' => 100, 'status' => 'actif']);

        $this->actingAs($admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $client->party_id, 'date_operation' => '2026-10-12',
            'piece_jointe' => UploadedFile::fake()->create('recu.pdf', 10, 'application/pdf'),
            'lignes' => [['service_id' => $service->id, 'designation' => 'x', 'quantite' => 1, 'prix_unitaire' => 100]],
        ])->assertStatus(201);

        $paiement = \App\Models\Paiement::firstOrFail();
        $cheminSource = $paiement->piece_jointe_chemin;
        Storage::disk('public')->assertExists($cheminSource);

        // Le fil référence le fichier du paiement (même chemin, aucune copie) et le distingue du fichier du service.
        $fil = $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')->assertOk();
        $fil->assertJsonPath('0.fichierSource.nom', 'recu.pdf')->assertJsonPath('0.fichierSource.chemin', $cheminSource)
            ->assertJsonPath('0.fichierChemin', null)->assertJsonPath('0.source.type', 'paiement')->assertJsonPath('0.source.id', $paiement->id);
        $this->assertCount(1, Storage::disk('public')->allFiles());

        $service = ServiceEnCours::firstOrFail();
        $creation = ServiceEnCoursOperation::where('action', 'creation')->firstOrFail();

        // Un fichier ajouté à la main, remplacé puis supprimé : le fichier du paiement reste intact.
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['fichier' => UploadedFile::fake()->create('manuel.pdf', 5, 'application/pdf')])->assertOk();
        $manuel = ServiceEnCoursOperation::where('action', 'fichier')->firstOrFail();
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations/{$manuel->id}/fichier", ['fichier' => UploadedFile::fake()->create('manuel2.pdf', 5, 'application/pdf')])->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$service->id}/operations/{$manuel->id}/fichier")->assertOk();
        Storage::disk('public')->assertExists($cheminSource);

        // Même la suppression DÉFINITIVE du service en cours ne supprime pas la pièce jointe du paiement.
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/corbeille")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/services-en-cours/{$service->id}")->assertOk();
        Storage::disk('public')->assertExists($cheminSource);
        $this->assertNotNull(\App\Models\Paiement::find($paiement->id)->piece_jointe_chemin);
        $this->assertSame($cheminSource, $creation->source_fichier_chemin);
    }

    public function test_un_fichier_source_qui_n_existe_plus_n_est_pas_propose(): void
    {
        $this->statut();
        $admin = $this->admin();
        $client = $this->client();
        $service = Service::create(['nom' => 'Comptabilité', 'prix' => 100, 'status' => 'actif']);
        $this->actingAs($admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $client->party_id, 'date_operation' => '2026-10-12',
            'piece_jointe' => UploadedFile::fake()->create('recu.pdf', 10, 'application/pdf'),
            'lignes' => [['service_id' => $service->id, 'designation' => 'x', 'quantite' => 1, 'prix_unitaire' => 100]],
        ])->assertStatus(201);
        Storage::disk('public')->delete(\App\Models\Paiement::first()->piece_jointe_chemin);

        $this->actingAs($admin)->getJson('/api/v1/services-en-cours/activite')->assertJsonPath('0.fichierSource', null);
    }

    // ---- 7 & 8. Commentaires -----------------------------------------------------------------------------------------

    public function test_plusieurs_commentaires_sont_conserves_avec_leur_auteur_et_leur_horodatage(): void
    {
        $this->statut();
        $premier = $this->admin('Premier Auteur');
        $second = $this->admin('Second Auteur');
        $service = $this->serviceSuivi($premier);

        $this->actingAs($premier)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['commentaire' => 'Premier commentaire'])->assertOk();
        $this->travel(1)->minutes();
        $this->actingAs($second)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['commentaire' => 'Deuxième commentaire'])->assertOk();
        $this->travel(1)->minutes();
        $this->actingAs($premier)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['commentaire' => '  Troisième commentaire  '])->assertOk();

        $fiche = $this->actingAs($premier)->getJson("/api/v1/services-en-cours/{$service->id}")->assertOk();
        $commentaires = collect($fiche->json('data.operations'))->where('action', 'commentaire')->values();

        // Le plus récent d'abord ; les anciens sont intacts.
        $this->assertSame(['Troisième commentaire', 'Deuxième commentaire', 'Premier commentaire'], $commentaires->pluck('commentaire')->all());
        $this->assertSame(['Premier Auteur', 'Second Auteur', 'Premier Auteur'], $commentaires->pluck('par')->reverse()->values()->all());
        $dates = $commentaires->pluck('createdAt')->all();
        $this->assertSame($dates, collect($dates)->sortDesc()->values()->all());
        $this->assertCount(3, array_unique($dates), 'Chaque commentaire a sa propre date et heure.');
        // Le statut affiché sur un commentaire est celui du service à ce moment (aucun statut inventé).
        $this->assertSame($service->fresh()->service_status_id, $commentaires[0]['statut']['id']);
        $this->assertNull($commentaires[0]['ancienStatut']);
    }

    public function test_les_commentaires_d_un_service_n_apparaissent_pas_dans_la_fiche_d_un_autre(): void
    {
        $this->statut();
        $admin = $this->admin();
        $a = $this->serviceSuivi($admin);
        $b = $this->serviceSuivi($admin);
        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$a->id}/operations", ['commentaire' => 'Confidentiel client A'])->assertOk();

        $ficheB = $this->actingAs($admin)->getJson("/api/v1/services-en-cours/{$b->id}")->assertOk();

        $this->assertStringNotContainsString('Confidentiel client A', $ficheB->getContent());
        $this->assertSame($b->id, $ficheB->json('data.id'));
        $this->assertSame($b->client_id, $ficheB->json('data.clientId'));
    }

    public function test_un_commentaire_trop_long_est_refuse(): void
    {
        $this->statut();
        $admin = $this->admin();
        $service = $this->serviceSuivi($admin);

        $this->actingAs($admin)->postJson("/api/v1/services-en-cours/{$service->id}/operations", ['commentaire' => str_repeat('a', 2001)])
            ->assertStatus(422)->assertJsonValidationErrors('commentaire');
    }

    // ---- Divers : renouvellement de domiciliation sans effet -----------------------------------------------------------

    public function test_domiciliation_et_renouvellement_ne_creent_ni_service_ni_activite(): void
    {
        $this->statut();
        $admin = $this->admin();
        $client = $this->client();
        $entreprise = $this->entrepriseDe($client);
        $centre = \App\Modules\Domiciliation\Models\CentreDomiciliation::firstOrFail();

        $id = $this->actingAs($admin)->postJson('/api/v1/domiciliations', [
            'entreprise_id' => $entreprise->party_id, 'centre_domiciliation_id' => $centre->id, 'mois_payee' => 12,
            'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31',
        ])->assertStatus(201)->json('data.id');
        $this->actingAs($admin)->postJson("/api/v1/domiciliations/{$id}/renouveler", ['date_depart' => '2027-01-01', 'date_fin' => '2027-12-31', 'mois_payee' => 12])->assertSuccessful();

        $this->assertSame(0, ServiceEnCours::count());
        $this->assertSame(0, ServiceEnCoursOperation::count());
    }
}
