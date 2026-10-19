<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Paiement;
use App\Models\PaiementLigne;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\User;
use App\Models\UserPermission;
use App\Modules\Facturation\Models\DocumentCommercial;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Paiements complémentaires : un service de 3 000 Dh payé en plusieurs fois reste UN dossier (paiement d'origine + compléments),
 * dont le reste à payer tient compte de TOUS les paiements.
 */
class PaiementComplementTest extends TestCase
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

    private function party(string $nom = 'CLIENT TEST'): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => $nom]);

        return $party;
    }

    /** Paiement d'origine : service de 3 000 Dh, `$paye` déjà payé. Renvoie son identifiant. */
    private function origine(User $admin, Party $party, float $paye = 1000, array $extra = []): int
    {
        $service = Service::firstOrCreate(['nom' => 'Service A'], ['prix' => 3000, 'status' => 'actif']);

        return (int) $this->actingAs($admin)->postJson('/api/v1/paiements', array_merge([
            'emetteur' => 'bureau_comptabilite',
            'responsable' => 'Maitre : Morad Bendeq',
            'party_id' => $party->id,
            'date_operation' => '2026-10-01 10:00:00',
            'mode_paiement' => 'Espèce',
            'prix_paye' => $paye,
            'lignes' => [['service_id' => $service->id, 'designation' => 'Service A', 'quantite' => 1, 'prix_unitaire' => 3000]],
        ], $extra))->assertStatus(201)->json('data.id');
    }

    private function complement(User $admin, int $id, float $montant, array $extra = [])
    {
        return $this->actingAs($admin)->postJson("/api/v1/paiements/{$id}/complements", array_merge([
            'prix_paye' => $montant, 'date_operation' => '2026-10-10', 'mode_paiement' => 'Virement',
        ], $extra));
    }

    public function test_un_paiement_partiel_laisse_un_reste_et_le_complement_le_reduit(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);

        $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->assertOk()->json('0');
        $this->assertSame('1000.00', $ligne['prixPaye']);
        $this->assertSame('2000.00', $ligne['prixRestant']);
        $this->assertFalse($ligne['regle']);

        $this->complement($admin, $origine, 500)->assertStatus(201)
            ->assertJsonPath('data.prixPaye', '500.00')
            ->assertJsonPath('data.prixRestant', '1500.00')
            ->assertJsonPath('data.estComplement', true)
            ->assertJsonPath('data.paiementOrigineId', $origine);

        $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0');
        $this->assertSame('1500.00', $ligne['prixPaye']);
        $this->assertSame('1500.00', $ligne['prixRestant']);
        $this->assertFalse($ligne['regle']);
        $this->assertSame(2, $ligne['nbPaiements']);
    }

    public function test_plusieurs_paiements_pour_un_meme_service_ne_donnent_qu_une_ligne_et_ne_sont_solde_qu_au_total_exact(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);

        $this->complement($admin, $origine, 1000)->assertStatus(201);
        $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->assertJsonCount(1)->json('0');
        $this->assertFalse($ligne['regle'], 'Deux paiements sur trois : pas de faux solde.');
        $this->assertSame('1000.00', $ligne['prixRestant']);

        $this->complement($admin, $origine, 1000)->assertStatus(201);
        $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->assertJsonCount(1)->json('0');
        $this->assertTrue($ligne['regle']);
        $this->assertSame('0.00', $ligne['prixRestant']);
        $this->assertSame('3000.00', $ligne['prixPaye']);
        $this->assertSame(3, $ligne['nbPaiements']);

        // Les filtres de la gestion s'appuient sur le même calcul.
        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion?regle=false')->assertJsonCount(0);
        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion?regle=true')->assertJsonCount(1);
    }

    public function test_le_montant_ne_peut_pas_depasser_le_reste_dû_et_rien_n_est_cree(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);

        $this->complement($admin, $origine, 2000.01)->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);
        $this->complement($admin, $origine, 0)->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);
        $this->complement($admin, $origine, -5)->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);

        $this->assertSame(1, Paiement::count());

        // Le reste exact est accepté, puis le service est soldé : plus rien à ajouter.
        $this->complement($admin, $origine, 2000)->assertStatus(201);
        $this->complement($admin, $origine, 1)->assertStatus(422)->assertJsonValidationErrors(['prix_paye']);
        $this->assertSame(2, Paiement::count());
    }

    public function test_le_complement_ne_cree_ni_service_ni_ligne_et_ne_modifie_pas_le_paiement_d_origine(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000, ['observation' => 'Acompte', 'mode_paiement' => 'Chèque']);
        $etat = fn () => array_map('strval', Paiement::find($origine)->only(['prix_paye', 'total', 'observation', 'mode_paiement', 'reference', 'date_operation', 'signature', 'piece_jointe_nom']));
        $avant = $etat();
        $servicesAvant = ServiceEnCours::count();
        $lignesAvant = PaiementLigne::count();

        $this->complement($admin, $origine, 700)->assertStatus(201);

        $this->assertSame($avant, $etat());
        $this->assertSame($servicesAvant, ServiceEnCours::count(), 'Aucun doublon de service en cours.');
        $this->assertSame($lignesAvant, PaiementLigne::count(), 'Aucune ligne de service dupliquée.');
    }

    public function test_le_complement_reste_lie_au_meme_client_meme_si_on_vise_un_autre_complement(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $origine = $this->origine($admin, $party, 1000);

        $premier = $this->complement($admin, $origine, 500)->json('data.id');
        $second = $this->complement($admin, $premier, 500)->assertStatus(201);

        $second->assertJsonPath('data.paiementOrigineId', $origine)->assertJsonPath('data.partyId', $party->id);
        $this->assertSame(0, Paiement::where('paiement_origine_id', $premier)->count(), 'Pas de chaîne : tout pointe vers le paiement d\'origine.');
    }

    public function test_l_historique_liste_tous_les_paiements_avec_leur_reste_cumule(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000, ['observation' => 'Premier versement']);
        $this->complement($admin, $origine, 1000, ['observation' => 'Deuxième']);
        $dernier = $this->complement($admin, $origine, 1000)->json('data.id');

        // Depuis n'importe quel paiement du dossier, l'historique est complet.
        foreach ([$origine, $dernier] as $id) {
            $reponse = $this->actingAs($admin)->getJson("/api/v1/paiements/{$id}/historique")->assertOk();
            $reponse->assertJsonCount(3, 'data');
            $this->assertSame(['1000.00', '1000.00', '1000.00'], array_column($reponse->json('data'), 'prixPaye'));
            $this->assertSame(['2000.00', '1000.00', '0.00'], array_column($reponse->json('data'), 'prixRestant'));
            $this->assertSame(['3000.00', '3000.00', '3000.00'], array_column($reponse->json('data'), 'total'));
            $this->assertCount(3, array_unique(array_column($reponse->json('data'), 'reference')));
            // Les services affichés sont ceux du paiement d'origine, y compris pour les compléments.
            $this->assertSame('Service A', $reponse->json('data.2.lignes.0.designation'));
        }

        // La liste des paiements porte aussi le reste cumulé de chaque paiement (utile au reçu).
        $liste = collect($this->actingAs($admin)->getJson('/api/v1/paiements')->json('data'))->keyBy('id');
        $this->assertSame('0.00', $liste[$dernier]['prixRestant']);
        $this->assertSame('2000.00', $liste[$origine]['prixRestant']);
    }

    public function test_un_paiement_archive_du_dossier_ne_compte_plus_et_le_dossier_suit_son_origine(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);
        $complement = $this->complement($admin, $origine, 1000)->json('data.id');

        // Archiver seulement le complément : le reste se rouvre.
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$complement}/archive")->assertOk();
        $this->assertSame('2000.00', $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0.prixRestant'));
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$complement}/restore")->assertOk();
        $this->assertSame('1000.00', $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0.prixRestant'));

        // Archiver l'origine emmène ses compléments ; la restauration les ramène.
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$origine}/archive")->assertOk();
        $this->assertSame('archive', Paiement::find($complement)->status);
        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->assertJsonCount(0);
        $archive = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion?status=archive')->assertJsonCount(1)->json('0');
        $this->assertSame('2000.00', $archive['prixPaye']);
        $this->assertSame('1000.00', $archive['prixRestant']);

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$origine}/restore")->assertOk();
        $this->assertSame('actif', Paiement::find($complement)->status);

        // Un complément ne peut pas être restauré tant que l'origine est archivée.
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$origine}/archive")->assertOk();
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$complement}/restore")->assertStatus(422);
    }

    public function test_supprimer_definitivement_l_origine_supprime_le_dossier_et_ses_fichiers(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);
        $complement = $this->complement($admin, $origine, 500, ['piece_jointe' => UploadedFile::fake()->create('recu.pdf', 10, 'application/pdf')])
            ->assertStatus(201)->json('data.id');
        $chemin = Paiement::find($complement)->piece_jointe_chemin;
        Storage::disk('public')->assertExists($chemin);

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$origine}/corbeille")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/paiements/{$origine}")->assertOk();

        $this->assertNull(Paiement::find($origine));
        $this->assertNull(Paiement::find($complement));
        Storage::disk('public')->assertMissing($chemin);
    }

    public function test_un_complement_resynchronise_la_facture_rattachee(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $party->id, 'numero' => 'FAC-001/26',
            'date_document' => '2026-10-01 11:00:00', 'prix_paye' => 0,
            'lignes' => [['designation' => 'Service A', 'quantite' => 1, 'prix_unitaire' => 3000, 'remise_pourcent' => 0, 'tva_pourcent' => 0]],
        ])->json('data.id');

        $origine = $this->origine($admin, $party, 1000, ['document_id' => $facture]);
        $this->assertSame('1000.00', DocumentCommercial::find($facture)->prix_paye);

        $this->complement($admin, $origine, 1500)->assertStatus(201)->assertJsonPath('data.documentId', $facture);
        $this->assertSame('2500.00', DocumentCommercial::find($facture)->prix_paye);

        // La facture a aussi son propre plafond : 500 de reste, 600 refusés.
        $this->complement($admin, $origine, 600)->assertStatus(422);
        $this->assertSame('2500.00', DocumentCommercial::find($facture)->fresh()->prix_paye);
    }

    public function test_le_fichier_se_telecharge_par_l_api_avec_controle_d_acces(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000, ['piece_jointe' => UploadedFile::fake()->createWithContent('origine.pdf', '%PDF-1.4 origine')]);
        $complement = $this->complement($admin, $origine, 500, ['piece_jointe' => UploadedFile::fake()->createWithContent('complement.pdf', '%PDF-1.4 complement')])->json('data.id');
        $sansFichier = $this->complement($admin, $origine, 100)->json('data.id');

        // Chaque paiement télécharge SON fichier.
        $this->actingAs($admin)->get("/api/v1/paiements/{$origine}/fichier")->assertOk()->assertDownload('origine.pdf');
        $this->actingAs($admin)->get("/api/v1/paiements/{$complement}/fichier")->assertOk()->assertDownload('complement.pdf');
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$complement}")->assertJsonPath('data.aFichier', true);

        // Sans fichier : 404, jamais un fichier d'un autre paiement.
        $this->actingAs($admin)->get("/api/v1/paiements/{$sansFichier}/fichier")->assertStatus(404);
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$sansFichier}")->assertJsonPath('data.aFichier', false);

        // Accès : connecté ET autorisé.
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/paiements/{$origine}/fichier")->assertStatus(401);
        $employe = User::factory()->create(['is_admin' => false]);
        $this->actingAs($employe)->get("/api/v1/paiements/{$origine}/fichier")->assertStatus(403);
        $permission = Permission::where('module', 'paiements')->where('action', 'gestion_paiements')->firstOrFail();
        UserPermission::create(['user_id' => $employe->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        $this->actingAs($employe)->get("/api/v1/paiements/{$origine}/fichier")->assertOk();
    }

    public function test_les_droits_sont_verifies_pour_ajouter_un_complement_et_lire_l_historique(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);
        $employe = User::factory()->create(['is_admin' => false]);

        $this->complement($employe, $origine, 100)->assertStatus(403);
        $this->actingAs($employe)->getJson("/api/v1/paiements/{$origine}/historique")->assertStatus(403);

        foreach (['ajouter_paiement', 'gestion_paiements'] as $action) {
            $permission = Permission::where('module', 'paiements')->where('action', $action)->firstOrFail();
            UserPermission::create(['user_id' => $employe->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        }

        $this->complement($employe, $origine, 100)->assertStatus(201);
        $this->actingAs($employe)->getJson("/api/v1/paiements/{$origine}/historique")->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_un_complement_ne_peut_pas_etre_detache_de_son_client_ni_de_son_service(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party('CLIENT A'), 1000);
        $autre = $this->party('CLIENT B');
        $complement = $this->complement($admin, $origine, 500)->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$complement}", [
            'party_id' => $autre->id, 'observation' => 'corrigé',
            'lignes' => [['designation' => 'Autre', 'quantite' => 1, 'prix_unitaire' => 10]],
        ])->assertOk();

        $modifie = Paiement::find($complement);
        $this->assertSame(Paiement::find($origine)->party_id, $modifie->party_id);
        $this->assertSame('corrigé', $modifie->observation);
        $this->assertSame('3000.00', $modifie->total);
        $this->assertSame(0, $modifie->lignes()->count());

        // Augmenter ce complément au-delà du reste dû est refusé.
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$complement}", ['prix_paye' => 2500])->assertStatus(422);
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$complement}", ['prix_paye' => 2000])->assertOk();
    }

    public function test_le_nom_reel_du_service_de_chaque_ligne_sert_au_motif_du_recu(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $domiciliation = Service::create(['nom' => 'Domiciliation', 'prix' => 100, 'status' => 'actif']);
        $audit = Service::create(['nom' => 'audit fiscal', 'prix' => 200, 'status' => 'actif']);

        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'via_experts', 'party_id' => $party->id, 'date_operation' => '2026-10-01', 'prix_paye' => 300,
            'lignes' => [
                // La désignation libre peut diverger du service (« Service » générique) : le motif vient du service réel.
                ['service_id' => $domiciliation->id, 'designation' => 'Service', 'quantite' => 1, 'prix_unitaire' => 100],
                ['service_id' => $audit->id, 'designation' => 'Autre libellé', 'quantite' => 1, 'prix_unitaire' => 200],
                ['designation' => 'Ligne libre sans service', 'quantite' => 1, 'prix_unitaire' => 0],
            ],
        ])->assertStatus(201)->json('data.id');

        // Création, consultation, liste, historique (et reçu d'un complément) : le nom réel du service figure sur chaque ligne.
        $verifier = function (array $lignes) {
            $this->assertSame(['Domiciliation', 'audit fiscal', null], array_column($lignes, 'service'));
        };
        $verifier($this->actingAs($admin)->getJson("/api/v1/paiements/{$id}")->json('data.lignes'));
        $verifier($this->actingAs($admin)->getJson('/api/v1/paiements')->json('data.0.lignes'));
        $this->complement($admin, $id, 0.01)->assertStatus(422); // soldé : pas de complément, mais l'historique reste lisible
        $verifier($this->actingAs($admin)->getJson("/api/v1/paiements/{$id}/historique")->json('data.0.lignes'));

        // Un complément reprend les services du paiement d'origine pour son propre reçu.
        $origine = $this->origine($admin, $party, 1000);
        $complement = $this->complement($admin, $origine, 500)->assertStatus(201);
        $this->assertSame(['Service A'], array_column($complement->json('data.lignes'), 'service'));
    }

    public function test_exemple_3000_1000_puis_800_les_montants_se_cumulent_sans_double_comptage(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);

        $avant = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0');
        $this->assertSame(['3000.00', '1000.00', '2000.00'], [$avant['prixTotal'], $avant['prixPaye'], $avant['prixRestant']]);

        $this->complement($admin, $origine, 800)->assertStatus(201);

        $apres = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->assertJsonCount(1)->json('0');
        $this->assertSame(['3000.00', '1800.00', '1200.00'], [$apres['prixTotal'], $apres['prixPaye'], $apres['prixRestant']]);
        $this->assertSame(2, $apres['nbPaiements']);
        // Deux opérations distinctes en base : 1 000 et 800 (jamais remplacées, jamais comptées deux fois).
        $this->assertSame(['1000.00', '800.00'], Paiement::orderBy('id')->pluck('prix_paye')->all());
        $this->assertSame(1800.0, Paiement::cumulPaye($origine));
    }

    public function test_aucun_paiement_encore_effectue_l_ajout_est_possible_et_l_historique_est_vide(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 0);

        $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0');
        $this->assertSame('3000.00', $ligne['prixRestant']);
        $this->assertFalse($ligne['regle']);
        $this->assertTrue($ligne['complementsPossibles']);

        // Aucun versement : aucune ligne de paiement dans l'historique.
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$origine}/historique")->assertOk()->assertJsonCount(0, 'data');

        // Le premier versement s'ajoute au dossier : une seule ligne d'historique (le dossier vide n'en est pas une).
        $this->complement($admin, $origine, 1000)->assertStatus(201);
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$origine}/historique")->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('2000.00', $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0.prixRestant'));
    }

    public function test_historique_deux_puis_trois_lignes_et_une_seule_pour_un_paiement_integral(): void
    {
        $admin = $this->admin();
        $party = $this->party();

        // Paiement intégral en une seule fois : une ligne, dossier soldé.
        $integral = $this->origine($admin, $party, 3000);
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$integral}/historique")->assertJsonCount(1, 'data');
        $this->assertTrue(collect($this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json())->firstWhere('paiementId', $integral)['regle']);

        // Deux paiements : deux lignes ; trois paiements : trois lignes (dossier d'un autre service du même client).
        $dossier = $this->origine($admin, $party, 500);
        $this->complement($admin, $dossier, 500)->assertStatus(201);
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$dossier}/historique")->assertJsonCount(2, 'data');
        $this->complement($admin, $dossier, 500)->assertStatus(201);
        $reponse = $this->actingAs($admin)->getJson("/api/v1/paiements/{$dossier}/historique")->assertJsonCount(3, 'data');
        $this->assertSame(['500.00', '500.00', '500.00'], array_column($reponse->json('data'), 'prixPaye'));

        // Le dossier intégral n'est pas touché par ceux des autres paiements.
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$integral}/historique")->assertJsonCount(1, 'data');
    }

    public function test_apres_plusieurs_versements_le_dossier_est_solde_et_l_ajout_n_est_plus_possible(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);
        $this->complement($admin, $origine, 1000)->assertStatus(201);
        $this->complement($admin, $origine, 1000)->assertStatus(201);

        $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json('0');
        $this->assertSame('0.00', $ligne['prixRestant']);
        $this->assertTrue($ligne['regle']);
        $this->assertFalse($ligne['enRetard']);
        // Plus rien à payer : le serveur refuse tout nouvel ajout (le menu masque l'action sur le même critère : reste > 0).
        $this->complement($admin, $origine, 1)->assertStatus(422);
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$origine}/historique")->assertJsonCount(3, 'data');
    }

    public function test_echeance_depassee_avec_reste_ligne_en_retard_jamais_pour_un_dossier_solde(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $passee = now()->subDays(3)->toDateString();
        $enRetard = fn (int $id) => collect($this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json())->firstWhere('paiementId', $id)['enRetard'];

        // Échéance (date de crédit) passée et reste à payer : en retard.
        $retard = $this->origine($admin, $party, 1000, ['date_credit' => $passee]);
        $this->assertTrue($enRetard($retard));

        // Ni la date de création du dossier, ni la date du dernier paiement n'entrent en jeu : un nouveau versement partiel reste en retard.
        $this->complement($admin, $retard, 500, ['date_operation' => now()->toDateString()])->assertStatus(201);
        $this->assertTrue($enRetard($retard));

        // Dossier entièrement payé, même échéance passée : pas de retard.
        $this->complement($admin, $retard, 1500)->assertStatus(201);
        $this->assertFalse($enRetard($retard));
        $this->assertTrue(collect($this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->json())->firstWhere('paiementId', $retard)['regle']);

        // Paiement intégral dès le départ avec échéance passée : pas de retard non plus.
        $this->assertFalse($enRetard($this->origine($admin, $party, 3000, ['date_credit' => $passee])));

        // Échéance aujourd'hui (pas encore dépassée), future, ou absente : pas de retard.
        $this->assertFalse($enRetard($this->origine($admin, $party, 1000, ['date_credit' => now()->toDateString()])));
        $this->assertFalse($enRetard($this->origine($admin, $party, 1000, ['date_credit' => now()->addDays(5)->toDateString()])));
        $this->assertFalse($enRetard($this->origine($admin, $party, 1000)));
    }

    public function test_sans_la_migration_les_listes_se_chargent_et_l_ajout_est_refuse_clairement(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);

        // Simule une base dont la migration des compléments n'est pas appliquée (le code n'utilise alors jamais la colonne).
        $propriete = new \ReflectionProperty(Paiement::class, 'complementsDisponibles');
        $propriete->setValue(null, false);

        try {
            $ligne = $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')->assertOk()->json('0');
            $this->assertSame('2000.00', $ligne['prixRestant']);
            $this->assertFalse($ligne['complementsPossibles']);

            $this->actingAs($admin)->getJson('/api/v1/paiements')->assertOk()->assertJsonPath('data.0.prixRestant', '2000.00');
            $this->actingAs($admin)->getJson("/api/v1/paiements/{$origine}/historique")->assertOk()->assertJsonCount(1, 'data');
            $this->actingAs($admin)->getJson('/api/v1/mouvements/recu')->assertOk();
            $this->actingAs($admin)->postJson("/api/v1/paiements/{$origine}/archive")->assertOk();

            $this->complement($admin, $origine, 100)->assertStatus(503);
        } finally {
            $propriete->setValue(null, null);
        }
    }

    public function test_les_totaux_des_mouvements_comptent_le_montant_du_une_seule_fois(): void
    {
        $admin = $this->admin();
        $origine = $this->origine($admin, $this->party(), 1000);
        $this->complement($admin, $origine, 1000)->assertStatus(201);

        $reponse = $this->actingAs($admin)->getJson('/api/v1/mouvements/recu')->assertOk();
        $this->assertSame('3000.00', $reponse->json('totaux.montantTotal'));
        $this->assertSame('2000.00', $reponse->json('totaux.montantPaye'));
        $this->assertSame('1000.00', $reponse->json('totaux.montantRestante'));
    }
}
