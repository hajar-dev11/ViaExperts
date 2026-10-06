<?php

namespace Tests\Feature;

use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Models\Client;
use App\Modules\Domiciliation\Models\Domiciliation;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Service;
use App\Models\ServiceEnCours;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * `GET /api/v1/archive/counts` : compteurs Archive / Corbeille de toutes les catégories en UNE requête HTTP.
 *
 * Ces tests CARACTÉRISENT le comportement existant (notamment la clé `services_en_cours`). Ils ont été écrits et exécutés
 * AVANT le découplage d'Archive vis-à-vis de Services en cours, et doivent passer à l'identique après.
 */
class ArchiveCountsTest extends TestCase
{
    use RefreshDatabase;

    private const CLES = [
        'clients', 'entreprises', 'domiciliation', 'services', 'services_en_cours',
        'facture', 'devis', 'bl', 'avoir', 'paiements', 'tva', 'chiffre_affaire',
        'rapports', 'cachets', 'mails', 'data_center',
    ];

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function serviceEnCours(string $status = 'actif', bool $supprime = false): ServiceEnCours
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT '.$party->id]);
        $service = Service::create(['nom' => 'Service '.$party->id, 'prix' => 100, 'status' => 'actif']);

        $sec = ServiceEnCours::create([
            'service_id' => $service->id, 'client_id' => $party->id, 'status' => $status,
            'date_depart' => now(), 'derniere_operation' => now(),
        ]);
        if ($supprime) {
            $sec->delete(); // suppression douce
        }

        return $sec;
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/archive/counts')->assertStatus(401);
    }

    public function test_la_reponse_a_les_memes_cles_dans_le_meme_ordre_et_des_entiers_a_zero_sans_donnees(): void
    {
        $reponse = $this->actingAs($this->admin())->getJson('/api/v1/archive/counts')->assertOk();

        $this->assertSame(self::CLES, array_keys($reponse->json()));
        foreach (self::CLES as $cle) {
            $this->assertSame(0, $reponse->json($cle), "{$cle} doit valoir l'entier 0 sans donnée.");
        }
        $this->assertSame(
            '{"clients":0,"entreprises":0,"domiciliation":0,"services":0,"services_en_cours":0,"facture":0,"devis":0,"bl":0,"avoir":0,"paiements":0,"tva":0,"chiffre_affaire":0,"rapports":0,"cachets":0,"mails":0,"data_center":0}',
            $reponse->getContent()
        );
    }

    public function test_services_en_cours_est_compte_par_statut_et_sans_les_lignes_supprimees(): void
    {
        $this->serviceEnCours('actif');
        $this->serviceEnCours('actif');
        $this->serviceEnCours('archive');
        $this->serviceEnCours('corbeille');
        $this->serviceEnCours('corbeille');
        $this->serviceEnCours('corbeille');
        $this->serviceEnCours('actif', supprime: true);   // suppression douce : jamais comptée
        $this->serviceEnCours('archive', supprime: true);
        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('services_en_cours', 2);
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=archive')->assertOk()->assertJsonPath('services_en_cours', 1);
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=corbeille')->assertOk()->assertJsonPath('services_en_cours', 3);
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=inconnu')->assertOk()->assertJsonPath('services_en_cours', 0);
        // Sans paramètre, le statut par défaut est « archive ».
        $this->actingAs($admin)->getJson('/api/v1/archive/counts')->assertOk()->assertJsonPath('services_en_cours', 1);
    }

    public function test_les_autres_compteurs_ne_sont_pas_affectes_par_services_en_cours(): void
    {
        $this->serviceEnCours('actif');
        $admin = $this->admin();

        $reponse = $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk();

        // Le helper crée 1 client (Party) et 1 service ; rien d'autre.
        $this->assertSame(1, $reponse->json('clients'));
        $this->assertSame(1, $reponse->json('services'));
        $this->assertSame(1, $reponse->json('services_en_cours'));
        foreach (['entreprises', 'domiciliation', 'facture', 'devis', 'bl', 'avoir', 'paiements', 'tva', 'chiffre_affaire', 'rapports', 'cachets', 'mails', 'data_center'] as $cle) {
            $this->assertSame(0, $reponse->json($cle), $cle);
        }
    }

    public function test_services_en_cours_est_compte_par_une_seule_requete_et_sans_n_plus_un(): void
    {
        foreach (range(1, 5) as $i) {
            $this->serviceEnCours('actif');
        }
        $admin = $this->admin();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('services_en_cours', 5);
        $requetes = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        $this->assertSame(1, $requetes->filter(fn ($q) => str_contains($q, 'from `service_en_cours`'))->count(), 'Un seul comptage SQL pour services_en_cours.');
        $this->assertTrue(
            $requetes->contains(fn ($q) => str_contains($q, 'select count(*) as aggregate from `service_en_cours` where `status` = ? and `service_en_cours`.`deleted_at` is null')),
            'Requête agrégée attendue (count) avec la portée de suppression douce.'
        );
        // Une requête par compteur (16) : le nombre total ne dépend pas du nombre de lignes.
        $this->assertSame(16, $requetes->filter(fn ($q) => str_contains($q, 'count(*) as aggregate'))->count());
    }

    // ---- Caractérisation du compteur « domiciliation » (écrite AVANT son contrat, étape 17) -------------------------

    private function domiciliation(string $status = 'actif', bool $supprime = false): Domiciliation
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'ENTREPRISE '.$party->id]);
        $centre = CentreDomiciliation::create(['nom' => 'CENTRE '.$party->id]);

        $domiciliation = Domiciliation::create([
            'entreprise_id' => $party->id, 'centre_domiciliation_id' => $centre->id,
            'date_depart' => '2026-01-01', 'date_fin' => '2026-12-31', 'status' => $status,
        ]);
        if ($supprime) {
            $domiciliation->delete(); // suppression douce
        }

        return $domiciliation;
    }

    public function test_domiciliation_est_comptee_par_statut_sans_les_lignes_supprimees(): void
    {
        $this->domiciliation('actif');
        $this->domiciliation('actif');
        $this->domiciliation('archive');
        $this->domiciliation('corbeille');
        $this->domiciliation('corbeille');
        $this->domiciliation('corbeille');
        $this->domiciliation('actif', supprime: true);   // suppression douce : jamais comptée
        $this->domiciliation('corbeille', supprime: true);
        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('domiciliation', 2);
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=archive')->assertOk()->assertJsonPath('domiciliation', 1);
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=corbeille')->assertOk()->assertJsonPath('domiciliation', 3);
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=inconnu')->assertOk()->assertJsonPath('domiciliation', 0);
        // Sans paramètre, le statut par défaut est « archive ».
        $this->actingAs($admin)->getJson('/api/v1/archive/counts')->assertOk()->assertJsonPath('domiciliation', 1);
    }

    public function test_domiciliation_vaut_zero_sans_donnee_et_les_autres_compteurs_sont_independants(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('domiciliation', 0);

        $this->domiciliation('actif');
        $reponse = $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk();

        $this->assertSame(1, $reponse->json('domiciliation'));
        $this->assertSame(1, $reponse->json('entreprises'), 'Le helper crée 1 entreprise (Party) ; elle reste comptée à part.');
        $this->assertSame(0, $reponse->json('services_en_cours'));
        $this->assertSame(self::CLES, array_keys($reponse->json()), 'Clés et ordre inchangés.');
    }

    public function test_domiciliation_est_comptee_par_une_seule_requete_sans_n_plus_un(): void
    {
        foreach (range(1, 4) as $i) {
            $this->domiciliation('actif');
        }
        $admin = $this->admin();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('domiciliation', 4);
        $requetes = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        $this->assertSame(1, $requetes->filter(fn ($q) => str_contains($q, 'from `domiciliations`'))->count());
        $this->assertTrue($requetes->contains(fn ($q) => str_contains($q, 'select count(*) as aggregate from `domiciliations` where `status` = ? and `domiciliations`.`deleted_at` is null')));
        $this->assertSame(16, $requetes->filter(fn ($q) => str_contains($q, 'count(*) as aggregate'))->count(), 'Toujours une requête de comptage par catégorie.');
    }
    // ---- Découplage : Archive passe par le contrat de Services en cours -------------------------------------------

    public function test_le_contrat_est_resolu_et_lie_a_son_implementation(): void
    {
        $this->assertInstanceOf(
            \App\Services\ServicesEnCours\CompteursServicesEnCoursEloquent::class,
            app(\App\Contracts\ServicesEnCours\CompteursServicesEnCours::class)
        );
    }

    public function test_le_contrat_compte_comme_l_ancienne_requete_directe(): void
    {
        $this->serviceEnCours('actif');
        $this->serviceEnCours('actif');
        $this->serviceEnCours('archive');
        $this->serviceEnCours('actif', supprime: true);
        $contrat = app(\App\Contracts\ServicesEnCours\CompteursServicesEnCours::class);

        foreach (['actif', 'archive', 'corbeille', 'inconnu'] as $statut) {
            $this->assertSame(ServiceEnCours::where('status', $statut)->count(), $contrat->compterParStatut($statut), $statut);
        }
        $this->assertSame(2, $contrat->compterParStatut('actif'));
        $this->assertSame(0, $contrat->compterParStatut('corbeille'));
    }

    public function test_archive_obtient_services_en_cours_depuis_le_contrat_avec_le_statut_demande(): void
    {
        $appels = [];
        $this->app->instance(\App\Contracts\ServicesEnCours\CompteursServicesEnCours::class, new class($appels) implements \App\Contracts\ServicesEnCours\CompteursServicesEnCours {
            public function __construct(public array &$appels)
            {
            }

            public function compterParStatut(string $statut): int
            {
                $this->appels[] = $statut;

                return 42;
            }
        });
        $admin = $this->admin();

        $reponse = $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=corbeille')->assertOk();
        $this->assertSame(42, $reponse->json('services_en_cours'));
        $this->assertSame(['corbeille'], $appels, 'Un seul appel, avec le statut demandé.');
        $this->assertSame(self::CLES, array_keys($reponse->json()), 'Les clés (et leur ordre) ne changent pas.');

        $this->actingAs($admin)->getJson('/api/v1/archive/counts')->assertOk();
        $this->assertSame(['corbeille', 'archive'], $appels, 'Statut par défaut : archive.');
    }

    public function test_archive_controller_ne_reference_plus_le_modele_service_en_cours(): void
    {
        $source = file_get_contents(base_path('app/Http/Controllers/Api/V1/ArchiveController.php'));

        $this->assertStringNotContainsString('App\Models\ServiceEnCours;', $source);
        $this->assertStringNotContainsString('ServiceEnCours::', $source);
        $this->assertStringNotContainsString('CompteursServicesEnCoursEloquent', $source, 'Pas de connaissance de l\'implémentation concrète.');
        $this->assertStringContainsString('CompteursServicesEnCours', $source);
    }

    // ---- Découplage : Archive passe par le contrat de Domiciliation ------------------------------------------------

    public function test_le_contrat_domiciliations_est_resolu_et_lie_a_son_implementation(): void
    {
        $this->assertInstanceOf(
            \App\Modules\Domiciliation\Services\CompteursDomiciliationsEloquent::class,
            app(\App\Modules\Domiciliation\Contracts\CompteursDomiciliations::class)
        );
    }

    public function test_le_contrat_domiciliations_compte_comme_l_ancienne_requete_directe(): void
    {
        $this->domiciliation('actif');
        $this->domiciliation('actif');
        $this->domiciliation('archive');
        $this->domiciliation('actif', supprime: true);
        $contrat = app(\App\Modules\Domiciliation\Contracts\CompteursDomiciliations::class);

        foreach (['actif', 'archive', 'corbeille', 'inconnu'] as $statut) {
            $this->assertSame(Domiciliation::where('status', $statut)->count(), $contrat->compterParStatut($statut), $statut);
        }
        $this->assertSame(2, $contrat->compterParStatut('actif'));
        $this->assertSame(0, $contrat->compterParStatut('corbeille'));
    }

    public function test_archive_obtient_domiciliation_depuis_le_contrat_avec_le_statut_demande(): void
    {
        $appels = [];
        $this->app->instance(\App\Modules\Domiciliation\Contracts\CompteursDomiciliations::class, new class($appels) implements \App\Modules\Domiciliation\Contracts\CompteursDomiciliations {
            public function __construct(public array &$appels)
            {
            }

            public function compterParStatut(string $statut): int
            {
                $this->appels[] = $statut;

                return 77;
            }
        });
        $admin = $this->admin();

        $reponse = $this->actingAs($admin)->getJson('/api/v1/archive/counts?status=corbeille')->assertOk();
        $this->assertSame(77, $reponse->json('domiciliation'));
        $this->assertSame(['corbeille'], $appels, 'Un seul appel, avec le statut demandé.');
        $this->assertSame(self::CLES, array_keys($reponse->json()), 'Les clés (et leur ordre) ne changent pas.');

        $this->actingAs($admin)->getJson('/api/v1/archive/counts')->assertOk();
        $this->assertSame(['corbeille', 'archive'], $appels, 'Statut par défaut : archive.');
    }

    public function test_archive_controller_ne_reference_plus_le_modele_domiciliation(): void
    {
        $source = file_get_contents(base_path('app/Http/Controllers/Api/V1/ArchiveController.php'));

        $this->assertStringNotContainsString('App\Models\Domiciliation;', $source);
        $this->assertStringNotContainsString('Domiciliation::', $source);
        $this->assertStringNotContainsString('CompteursDomiciliationsEloquent', $source, 'Pas de connaissance de l\'implémentation concrète.');
        $this->assertStringContainsString('CompteursDomiciliations', $source);
    }
}
