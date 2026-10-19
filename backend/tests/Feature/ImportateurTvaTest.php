<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\DeclarationTva;
use App\Models\DeclarationTvaLigne;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\User;
use App\Models\UserPermission;
use App\Support\ImportLignesTva;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * « Importateur de TVA » : aperçu (aucune écriture), import après confirmation, droits, doublons, tout-ou-rien.
 * Utilise uniquement la base de test (RefreshDatabase) — jamais la base de développement ni celle de production.
 */
class ImportateurTvaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    // ------------------------------------------------------------------ helpers

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    /** @param  array<int, string>  $actions  actions du module `declaration` accordées */
    private function staff(array $actions): User
    {
        $user = User::factory()->create(['is_admin' => false]);
        foreach ($actions as $action) {
            $permission = Permission::where('module', 'declaration')->where('action', $action)->firstOrFail();
            UserPermission::create(['user_id' => $user->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        }

        return $user;
    }

    private function entreprise(string $denomination = 'WINOPACK TEST', ?int $clientId = null): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => $denomination, 'client_id' => $clientId]);
    }

    /** @param  array<int, array<string, mixed>>  $lignes */
    private function declaration(array $lignes = [], array $override = []): DeclarationTva
    {
        $declaration = DeclarationTva::create(array_merge([
            'type' => 'tva', 'entreprise_id' => $this->entreprise()->party_id, 'client_if' => '12345678', 'identifiant_paiement' => '1-ESPECES',
            'periode_type' => 'trimestre', 'periode_valeur' => 1, 'annee' => 2026, 'regime' => '2', 'situation' => 'non_declaree',
        ], $override));
        foreach ($lignes as $ordre => $ligne) {
            $declaration->lignes()->create($ligne + ['ordre' => $ordre]);
        }
        $declaration->load('lignes');
        $declaration->recalculerTotaux();

        return $declaration->fresh();
    }

    /** @return array<string, mixed> */
    private function ligne(array $o = []): array
    {
        return array_merge([
            'fact_num' => 'F-1', 'designation' => 'Achat', 'ht' => '1000', 'tva' => '200', 'ttc' => '1200',
            'identifiant_fiscal' => 'IF100', 'taux' => '20', 'date_fac' => '2026-03-15',
        ], $o);
    }

    /** Numérote comme le fait le navigateur : la 1re ligne de données d'un fichier est la ligne 2 (après l'en-tête). */
    private function lignes(array ...$lignes): array
    {
        return array_values(array_map(fn ($l, $i) => $l + ['ligne' => $i + 2], $lignes, array_keys($lignes)));
    }

    private function existante(DeclarationTva $d): array
    {
        return ['type' => 'existante', 'declaration_id' => $d->id];
    }

    private function nombreLignesEnBase(): int
    {
        return DeclarationTvaLigne::count();
    }

    // ------------------------------------------------------------------ authentification et droits

    public function test_un_visiteur_est_refuse(): void
    {
        $this->postJson('/api/v1/importateur-tva/apercu', [])->assertStatus(401);
        $this->postJson('/api/v1/importateur-tva/importer', [])->assertStatus(401);
    }

    public function test_sans_la_permission_importeur_tout_est_refuse_meme_avec_modifier(): void
    {
        $d = $this->declaration();
        $staff = $this->staff(['liste', 'modifier', 'ajouter', 'sauvegarder_non_declare']);
        $payload = ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne())];

        $this->actingAs($staff)->postJson('/api/v1/importateur-tva/apercu', $payload)->assertStatus(403)->assertJsonPath('message', 'Permission refusée (declaration.importeur).');
        $this->actingAs($staff)->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(403);
        $this->assertSame(0, $this->nombreLignesEnBase());
    }

    public function test_importeur_ne_suffit_pas_pour_modifier_une_declaration_existante(): void
    {
        $d = $this->declaration();
        $payload = ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne())];

        // importeur seul, ou importeur + modifier sans liste : refusé
        $this->actingAs($this->staff(['importeur']))->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(403);
        $this->actingAs($this->staff(['importeur', 'modifier']))->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(403);
        $this->assertSame(0, $this->nombreLignesEnBase());

        $this->actingAs($this->staff(['importeur', 'modifier', 'liste']))->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(201);
        $this->assertSame(1, $this->nombreLignesEnBase());
    }

    public function test_un_administrateur_a_tous_les_droits(): void
    {
        $d = $this->declaration();

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne())])->assertOk();
    }

    // ------------------------------------------------------------------ aperçu : aucune écriture

    public function test_l_apercu_n_ecrit_rien_en_base(): void
    {
        $d = $this->declaration([$this->ligne(['fact_num' => 'EXIST'])]);
        $avant = [DeclarationTva::count(), $this->nombreLignesEnBase(), $d->fresh()->total_ht];

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($d),
            'lignes' => $this->lignes($this->ligne(['fact_num' => 'N1']), $this->ligne(['fact_num' => 'N2'])),
        ])->assertOk()->assertJsonPath('resume.valides', 2);

        $this->assertSame($avant, [DeclarationTva::count(), $this->nombreLignesEnBase(), $d->fresh()->total_ht]);
    }

    public function test_apercu_signale_valides_doublons_et_rejets_avec_numero_de_ligne_et_raison(): void
    {
        $d = $this->declaration([$this->ligne(['fact_num' => 'DEJA'])]);

        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($d),
            'lignes' => $this->lignes(
                $this->ligne(['fact_num' => 'A']),                         // ligne 2 : valide
                $this->ligne(['fact_num' => 'A']),                         // ligne 3 : doublon de la ligne 2
                $this->ligne(['fact_num' => 'DEJA']),                      // ligne 4 : déjà dans la déclaration
                $this->ligne(['fact_num' => 'B', 'ht' => 'abc']),          // ligne 5 : HT non numérique
                $this->ligne(['fact_num' => 'C', 'tva' => '']),            // ligne 6 : TVA obligatoire
                $this->ligne(['fact_num' => 'D', 'date_fac' => '31/02/2026']), // ligne 7 : date impossible
                $this->ligne(['fact_num' => 'E', 'taux' => '150']),        // ligne 8 : taux > 100
            ),
        ])->assertOk();

        $reponse->assertJsonPath('resume', ['total' => 7, 'valides' => 1, 'doublons' => 2, 'rejetees' => 4]);
        $lignes = collect($reponse->json('lignes'))->keyBy('ligne');

        $this->assertSame('valide', $lignes[2]['etat']);
        $this->assertSame('doublon', $lignes[3]['etat']);
        $this->assertStringContainsString('ligne 2 du fichier', $lignes[3]['motif']);
        $this->assertSame('doublon', $lignes[4]['etat']);
        $this->assertStringContainsString('existe déjà dans la déclaration', $lignes[4]['motif']);
        $this->assertSame('rejetee', $lignes[5]['etat']);
        $this->assertStringContainsString('HT : valeur non numérique « abc »', $lignes[5]['erreurs'][0]);
        $this->assertStringContainsString('TVA : valeur obligatoire', $lignes[6]['erreurs'][0]);
        $this->assertStringContainsString('DATE FAC : date invalide « 31/02/2026 »', $lignes[7]['erreurs'][0]);
        $this->assertStringContainsString('TAUX : doit être compris entre 0 et 100', $lignes[8]['erreurs'][0]);
        $reponse->assertJsonPath('totaux.ht', '1000.00');
    }

    public function test_apercu_normalise_les_formats_francais_et_deduit_le_ttc(): void
    {
        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($this->declaration()),
            'lignes' => $this->lignes(['fact_num' => 'F', 'ht' => '1 234,56', 'tva' => '246,91', 'ttc' => '', 'date_fac' => '15/03/2026', 'date_paie' => '2026-03-20 10:30:00', 'taux' => '']),
        ])->assertOk();

        $valeurs = $reponse->json('lignes.0.valeurs');
        $this->assertSame('1234.56', $valeurs['ht']);
        $this->assertSame('246.91', $valeurs['tva']);
        $this->assertSame('1481.47', $valeurs['ttc']); // TTC = HT + TVA quand il n'est pas fourni
        $this->assertSame('2026-03-15', $valeurs['date_fac']);
        $this->assertSame('2026-03-20', $valeurs['date_paie']);
        $this->assertNull($valeurs['taux']); // vide : valeur par défaut de la base à l'enregistrement
    }

    public function test_apercu_avertit_quand_le_ttc_du_fichier_differe_de_ht_plus_tva(): void
    {
        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($this->declaration()),
            'lignes' => $this->lignes($this->ligne(['ttc' => '1300'])),
        ])->assertOk()->assertJsonPath('resume.valides', 1);

        $this->assertStringContainsString('TTC (1300.00) différent de HT + TVA (1200.00)', $reponse->json('lignes.0.avertissements.0'));
    }

    public function test_apercu_reproduit_le_controle_especes_du_formulaire(): void
    {
        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($this->declaration()), // identifiant de paiement de l'en-tête : « 1-ESPECES »
            'lignes' => $this->lignes(
                $this->ligne(['fact_num' => 'A', 'ht' => '2500', 'tva' => '500', 'ttc' => '3000', 'identifiant_fiscal' => 'IF9']),
                $this->ligne(['fact_num' => 'B', 'ht' => '2500', 'tva' => '500', 'ttc' => '3000', 'identifiant_fiscal' => 'IF9']),
                $this->ligne(['fact_num' => 'C', 'ht' => '9000', 'tva' => '1800', 'ttc' => '10800', 'identifiant_fiscal' => 'IF7', 'id_paie' => 'VIREMENT']),
            ),
        ])->assertOk();

        $alertes = $reponse->json('alertes_especes');
        $this->assertCount(1, $alertes);
        $this->assertSame('IF9', $alertes[0]['identifiant_fiscal']);
        $this->assertSame('6000.00', $alertes[0]['total']);
        $this->assertSame([2, 3], $alertes[0]['lignes']);
    }

    // ------------------------------------------------------------------ import : confirmation, doublons, ajout sans écrasement

    public function test_import_ajoute_les_lignes_sans_ecraser_celles_existantes_et_recalcule_les_totaux(): void
    {
        $d = $this->declaration([$this->ligne(['fact_num' => 'AVANT'])]);
        $idExistante = $d->lignes->first()->id;

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', [
            'cible' => $this->existante($d),
            'lignes' => $this->lignes(
                $this->ligne(['fact_num' => 'N1', 'ht' => '500', 'tva' => '100', 'ttc' => '600']),
                $this->ligne(['fact_num' => 'N2', 'ht' => '300', 'tva' => '60', 'ttc' => '360']),
            ),
        ])->assertStatus(201)
            ->assertJsonPath('importees', 2)
            ->assertJsonPath('resume.valides', 2)
            ->assertJsonPath('declaration.nombre_lignes', 3)
            ->assertJsonPath('declaration.total_ht', '1800.00')
            ->assertJsonPath('declaration.total_ttc', '2160.00');

        $d->refresh();
        $this->assertSame(['AVANT', 'N1', 'N2'], $d->lignes->pluck('fact_num')->all());
        $this->assertSame([0, 1, 2], $d->lignes->pluck('ordre')->all());
        $this->assertSame($idExistante, $d->lignes->first()->id, 'la ligne existante est conservée telle quelle');
        $this->assertSame('1800.00', $d->total_ht);
    }

    public function test_import_rejoue_deux_fois_ne_cree_aucun_doublon(): void
    {
        $d = $this->declaration();
        $payload = ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne(['fact_num' => 'X1']), $this->ligne(['fact_num' => 'X2']))];

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(201);
        $this->assertSame(2, $this->nombreLignesEnBase());

        // Double clic / second envoi du même fichier : tout est reconnu comme déjà présent, rien n'est ajouté.
        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', $payload)
            ->assertStatus(422)->assertJsonPath('resume.doublons', 2)->assertJsonPath('resume.valides', 0);
        $this->assertSame(2, $this->nombreLignesEnBase());
    }

    public function test_des_lignes_rejetees_bloquent_l_import_sauf_confirmation_explicite(): void
    {
        $d = $this->declaration();
        $payload = ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne(['fact_num' => 'OK']), $this->ligne(['fact_num' => 'KO', 'ht' => 'x']))];

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', $payload)
            ->assertStatus(422)->assertJsonPath('resume.rejetees', 1);
        $this->assertSame(0, $this->nombreLignesEnBase(), 'rien n\'est enregistré sans confirmation');

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', $payload + ['ignorer_rejetees' => true])
            ->assertStatus(201)->assertJsonPath('importees', 1)->assertJsonPath('resume.rejetees', 1);
        $this->assertSame(['OK'], DeclarationTvaLigne::pluck('fact_num')->all());
    }

    public function test_un_fichier_sans_aucune_ligne_valide_est_refuse(): void
    {
        $d = $this->declaration();

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', [
            'cible' => $this->existante($d), 'ignorer_rejetees' => true,
            'lignes' => $this->lignes($this->ligne(['ht' => 'x']), $this->ligne(['tva' => ''])),
        ])->assertStatus(422)->assertJsonPath('resume.valides', 0);
        $this->assertSame(0, $this->nombreLignesEnBase());
    }

    public function test_une_erreur_en_cours_d_import_ne_laisse_aucun_import_partiel(): void
    {
        $d = $this->declaration([$this->ligne(['fact_num' => 'AVANT'])]);
        $totalAvant = $d->total_ht;

        $compteur = 0;
        DeclarationTvaLigne::creating(function () use (&$compteur) {
            if (++$compteur === 2) {
                throw new \RuntimeException('panne simulée à la 2e ligne');
            }
        });

        try {
            $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', [
                'cible' => $this->existante($d),
                'lignes' => $this->lignes($this->ligne(['fact_num' => 'N1']), $this->ligne(['fact_num' => 'N2']), $this->ligne(['fact_num' => 'N3'])),
            ])->assertStatus(500);
        } finally {
            DeclarationTvaLigne::flushEventListeners();
        }

        $this->assertSame(['AVANT'], DeclarationTvaLigne::pluck('fact_num')->all(), 'la 1re ligne importée est annulée avec le reste');
        $this->assertSame($totalAvant, $d->fresh()->total_ht);
    }

    public function test_taux_vide_prend_la_valeur_par_defaut_de_la_base(): void
    {
        $d = $this->declaration();

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', [
            'cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne(['taux' => '']), $this->ligne(['fact_num' => 'F-2', 'taux' => '10'])),
        ])->assertStatus(201);

        $this->assertSame(['20.00', '10.00'], $d->fresh()->lignes->pluck('taux')->all());
    }

    // ------------------------------------------------------------------ cible

    public function test_une_declaration_deja_declaree_ne_recoit_aucune_ligne(): void
    {
        $d = $this->declaration([], ['situation' => 'declaree']);

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne())])
            ->assertStatus(422);
        $this->assertStringContainsString('déjà « Déclarée »', $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne())])->json('message'));
        $this->assertSame(0, $this->nombreLignesEnBase());
    }

    public function test_une_declaration_archivee_ou_en_corbeille_est_refusee(): void
    {
        foreach (['archive', 'corbeille'] as $status) {
            $d = $this->declaration([], ['status' => $status]);
            $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', ['cible' => $this->existante($d), 'lignes' => $this->lignes($this->ligne())])->assertStatus(422);
        }
        $this->assertSame(0, $this->nombreLignesEnBase());
    }

    public function test_declaration_inconnue_ou_d_un_autre_type_est_introuvable(): void
    {
        $chiffreAffaire = $this->declaration([], ['type' => 'chiffre_affaire']);

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', ['cible' => ['type' => 'existante', 'declaration_id' => 999999], 'lignes' => $this->lignes($this->ligne())])->assertStatus(404);
        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', ['cible' => $this->existante($chiffreAffaire), 'lignes' => $this->lignes($this->ligne())])->assertStatus(404);
    }

    public function test_nouvelle_declaration_creee_non_declaree_avec_les_lignes_importees(): void
    {
        $entreprise = $this->entreprise('NOUVELLE SARL');

        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', [
            'cible' => ['type' => 'nouvelle', 'entreprise_id' => $entreprise->party_id, 'client_if' => '99887766', 'identifiant_paiement' => '1-ESPECES', 'periode_type' => 'trimestre', 'periode_valeur' => 3, 'annee' => 2026, 'regime' => '2'],
            'lignes' => $this->lignes($this->ligne(['fact_num' => 'A']), $this->ligne(['fact_num' => 'B', 'ht' => '500', 'tva' => '100', 'ttc' => '600'])),
        ])->assertStatus(201)->assertJsonPath('importees', 2)->assertJsonPath('cible.type', 'nouvelle');

        $declaration = DeclarationTva::findOrFail($reponse->json('declaration.id'));
        $this->assertSame('tva', $declaration->type);
        $this->assertSame('non_declaree', $declaration->situation);
        $this->assertSame('actif', $declaration->status);
        $this->assertSame('1500.00', $declaration->total_ht);
        $this->assertSame(2, $declaration->lignes()->count());
        $this->assertSame($reponse->json('declaration.id'), $reponse->json('cible.declaration_id'));
    }

    public function test_nouvelle_declaration_fait_apparaitre_le_service_comme_l_enregistrement_normal(): void
    {
        $service = Service::create(['nom' => 'Déclaration TVA', 'prix' => 0, 'status' => 'actif', 'emetteur' => 'via_experts']);
        $partyClient = Party::create(['type' => 'client', 'status' => 'actif']);
        $client = Client::create(['party_id' => $partyClient->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT TITULAIRE']);
        $entreprise = $this->entreprise('AVEC CLIENT', $client->party_id);

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', [
            'cible' => ['type' => 'nouvelle', 'entreprise_id' => $entreprise->party_id, 'client_if' => '1', 'periode_type' => 'mois', 'periode_valeur' => 5, 'annee' => 2026],
            'lignes' => $this->lignes($this->ligne()),
        ])->assertStatus(201);

        $this->assertTrue(ServiceEnCours::where('service_id', $service->id)->where('client_id', $client->party_id)->exists());
    }

    public function test_nouvelle_declaration_exige_ajouter_et_sauvegarder_non_declare(): void
    {
        $entreprise = $this->entreprise();
        $payload = [
            'cible' => ['type' => 'nouvelle', 'entreprise_id' => $entreprise->party_id, 'client_if' => '1', 'periode_type' => 'trimestre', 'periode_valeur' => 1, 'annee' => 2026],
            'lignes' => $this->lignes($this->ligne()),
        ];

        $this->actingAs($this->staff(['importeur', 'ajouter']))->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(403);
        $this->actingAs($this->staff(['importeur', 'modifier', 'liste']))->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(403);
        $this->assertSame(0, DeclarationTva::count());

        $this->actingAs($this->staff(['importeur', 'ajouter', 'sauvegarder_non_declare']))->postJson('/api/v1/importateur-tva/importer', $payload)->assertStatus(201);
        $this->assertSame(1, DeclarationTva::count());
    }

    public function test_nouvelle_declaration_refusee_si_la_periode_existe_deja(): void
    {
        $existante = $this->declaration([], ['periode_type' => 'trimestre', 'periode_valeur' => 2, 'annee' => 2026]);
        $payload = [
            'cible' => ['type' => 'nouvelle', 'entreprise_id' => $existante->entreprise_id, 'client_if' => '1', 'periode_type' => 'trimestre', 'periode_valeur' => 2, 'annee' => 2026],
            'lignes' => $this->lignes($this->ligne()),
        ];

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/importer', $payload)
            ->assertStatus(422)->assertJsonPath('declaration_existante_id', $existante->id);
        $this->assertSame(1, DeclarationTva::count());
    }

    public function test_les_champs_de_la_nouvelle_declaration_sont_valides(): void
    {
        $entreprise = $this->entreprise();
        $base = ['type' => 'nouvelle', 'entreprise_id' => $entreprise->party_id, 'client_if' => '1', 'periode_type' => 'trimestre', 'periode_valeur' => 2, 'annee' => 2026];

        foreach ([
            ['periode_valeur' => 5],                 // trimestre > 4
            ['periode_type' => 'semestre'],
            ['annee' => 1999],
            ['entreprise_id' => 987654],
            ['client_if' => str_repeat('9', 31)],
        ] as $changement) {
            $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => array_merge($base, $changement), 'lignes' => $this->lignes($this->ligne())])
                ->assertStatus(422);
        }
        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => $base, 'lignes' => $this->lignes($this->ligne())])->assertOk();
    }

    // ------------------------------------------------------------------ taille et contenu du fichier

    public function test_un_fichier_trop_volumineux_ou_vide_est_refuse(): void
    {
        $d = $this->declaration();
        $trop = array_fill(0, ImportLignesTva::MAX_LIGNES + 1, $this->ligne());

        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => $this->existante($d), 'lignes' => $trop])
            ->assertStatus(422)->assertJsonValidationErrors('lignes');
        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => $this->existante($d), 'lignes' => []])
            ->assertStatus(422)->assertJsonValidationErrors('lignes');

        $limite = array_map(fn ($i) => $this->ligne(['fact_num' => "F{$i}", 'ligne' => $i + 2]), range(1, ImportLignesTva::MAX_LIGNES));
        $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', ['cible' => $this->existante($d), 'lignes' => $limite])
            ->assertOk()->assertJsonPath('resume.valides', ImportLignesTva::MAX_LIGNES);
    }

    public function test_donnees_hostiles_ou_mal_formees_sont_rejetees_ligne_par_ligne(): void
    {
        $d = $this->declaration();

        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($d),
            'lignes' => [
                $this->ligne(['fact_num' => str_repeat('X', 61), 'ligne' => 2]),                  // trop long
                $this->ligne(['designation' => "ligne\x00nulle", 'ligne' => 3]),                  // octet nul
                $this->ligne(['fact_num' => ['a' => 'b'], 'ligne' => 4]),                          // tableau à la place d'un texte
                $this->ligne(['ht' => '1E+3', 'ligne' => 5]),                                      // notation scientifique
                $this->ligne(['ht' => '99999999999999', 'ligne' => 6]),                            // dépasse decimal(14,2)
                ['ligne' => 7],                                                                    // ligne vide
                $this->ligne(['designation' => '<script>alert(1)</script>', 'fact_num' => 'S', 'ligne' => 8]), // texte inerte : accepté tel quel
                'pas-un-tableau',                                                                  // ne doit pas faire planter
            ],
        ]);

        // L'élément qui n'est pas un tableau est refusé par la validation de la requête (lignes.*).
        $reponse->assertStatus(422);

        $reponse = $this->actingAs($this->admin())->postJson('/api/v1/importateur-tva/apercu', [
            'cible' => $this->existante($d),
            'lignes' => [
                $this->ligne(['fact_num' => str_repeat('X', 61), 'ligne' => 2]),
                $this->ligne(['designation' => "ligne\x00nulle", 'ligne' => 3]),
                $this->ligne(['fact_num' => ['a' => 'b'], 'ligne' => 4]),
                $this->ligne(['ht' => '1E+3', 'ligne' => 5]),
                $this->ligne(['ht' => '99999999999999', 'ligne' => 6]),
                ['ligne' => 7],
                $this->ligne(['designation' => '<script>alert(1)</script>', 'fact_num' => 'S', 'ligne' => 8]),
            ],
        ])->assertOk();

        $etats = collect($reponse->json('lignes'))->pluck('etat', 'ligne')->all();
        $this->assertSame([2 => 'rejetee', 3 => 'rejetee', 4 => 'rejetee', 5 => 'rejetee', 6 => 'rejetee', 7 => 'rejetee', 8 => 'valide'], $etats);
        $this->assertStringContainsString('60 caractères maximum', $reponse->json('lignes.0.erreurs.0'));
        $this->assertStringContainsString('Ligne vide', $reponse->json('lignes.5.erreurs.0'));
    }

    public function test_aucune_ecriture_dans_le_module_declaration_tva_existant(): void
    {
        // Les routes de la Déclaration TVA existantes restent celles d'avant : l'importateur est un préfixe distinct.
        $d = $this->declaration([$this->ligne()]);

        $this->actingAs($this->admin())->getJson("/api/v1/declarations/tva/{$d->id}")->assertOk()->assertJsonPath('data.lignes.0.factNum', 'F-1');
        $this->actingAs($this->admin())->getJson('/api/v1/declarations/tva')->assertOk();
    }
}
