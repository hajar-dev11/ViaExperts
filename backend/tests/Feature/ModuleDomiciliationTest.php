<?php

namespace Tests\Feature;

use App\Models\Entreprise;
use App\Models\Party;
use App\Modules\Domiciliation\Contracts\CompteursDomiciliations;
use App\Modules\Domiciliation\DomiciliationServiceProvider;
use App\Modules\Domiciliation\Http\Controllers\CentreDomiciliationController;
use App\Modules\Domiciliation\Http\Controllers\DomiciliationController;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Modules\Domiciliation\Models\Domiciliation;
use App\Modules\Domiciliation\Models\DomiciliationDocument;
use App\Modules\Domiciliation\Models\DomiciliationObservation;
use App\Modules\Domiciliation\Models\DomiciliationOperation;
use App\Modules\Domiciliation\Services\CompteursDomiciliationsEloquent;
use App\Providers\AppServiceProvider;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use ReflectionClass;
use Tests\TestCase;

/**
 * Module Domiciliation (migration Modular Monolith, étape 18) : le code réel vit dans `App\Modules\Domiciliation`, les anciens
 * noms des modèles sont des alias TEMPORAIRES (retirés à l'étape 19), le provider du module porte la liaison du contrat, et les
 * routes pointent vers les contrôleurs du module dans le même ordre global qu'avant.
 */
class ModuleDomiciliationTest extends TestCase
{
    use RefreshDatabase;

    /** @dataProvider modeles */
    public function test_l_ancien_nom_du_modele_est_un_alias_de_la_classe_du_module(string $ancien, string $nouveau): void
    {
        $this->assertTrue(class_exists($ancien));
        $this->assertSame($nouveau, (new ReflectionClass($ancien))->getName());
        $this->assertFileExists(base_path('app/Modules/Domiciliation/Models/'.class_basename($nouveau).'.php'));
    }

    public static function modeles(): array
    {
        return array_map(
            fn (string $nom) => ["App\\Models\\{$nom}", "App\\Modules\\Domiciliation\\Models\\{$nom}"],
            ['Domiciliation', 'CentreDomiciliation', 'DomiciliationDocument', 'DomiciliationObservation', 'DomiciliationOperation']
        ) + [];
    }

    public function test_domiciliation_setting_n_a_pas_bouge_et_reste_aux_parametres(): void
    {
        $this->assertSame(\App\Models\DomiciliationSetting::class, (new ReflectionClass(\App\Models\DomiciliationSetting::class))->getName());
        $this->assertFileExists(base_path('app/Models/DomiciliationSetting.php'));
        $this->assertFileDoesNotExist(base_path('app/Modules/Domiciliation/Models/DomiciliationSetting.php'));
        $this->assertTrue(class_exists(\App\Http\Controllers\Api\V1\DomiciliationSettingController::class));
    }

    public function test_les_controleurs_requests_et_resource_n_existent_plus_a_leur_ancien_emplacement(): void
    {
        foreach ([
            'App\Http\Controllers\Api\V1\DomiciliationController', 'App\Http\Controllers\Api\V1\CentreDomiciliationController',
            'App\Http\Requests\StoreDomiciliationRequest', 'App\Http\Requests\UpdateDomiciliationRequest',
            'App\Http\Requests\StoreCentreDomiciliationRequest', 'App\Http\Requests\UpdateCentreDomiciliationRequest',
            'App\Http\Resources\DomiciliationResource', 'App\Contracts\Domiciliation\CompteursDomiciliations',
            'App\Services\Domiciliation\CompteursDomiciliationsEloquent',
        ] as $ancien) {
            $this->assertFalse(class_exists($ancien) || interface_exists($ancien), "{$ancien} ne doit plus exister (aucun consommateur externe : pas d'alias).");
        }
    }

    public function test_les_modeles_du_module_conservent_leurs_traits_et_tables(): void
    {
        foreach ([Domiciliation::class, CentreDomiciliation::class, DomiciliationDocument::class, DomiciliationObservation::class] as $classe) {
            $this->assertContains(SoftDeletes::class, class_uses_recursive($classe), $classe);
        }
        $this->assertNotContains(SoftDeletes::class, class_uses_recursive(DomiciliationOperation::class));
        $this->assertSame('centres_domiciliation', (new CentreDomiciliation())->getTable());
        $this->assertSame('domiciliations', (new Domiciliation())->getTable());
        $this->assertSame('domiciliation_operations', (new DomiciliationOperation())->getTable());
        $this->assertSame('domiciliation_documents', (new DomiciliationDocument())->getTable());
        $this->assertSame('domiciliation_observations', (new DomiciliationObservation())->getTable());
    }

    public function test_les_relations_eloquent_pointent_vers_les_classes_du_module_et_entreprise_reste_hors_module(): void
    {
        $d = new Domiciliation();
        $this->assertInstanceOf(Entreprise::class, $d->entreprise()->getRelated());
        $this->assertInstanceOf(CentreDomiciliation::class, $d->centre()->getRelated());
        $this->assertInstanceOf(DomiciliationObservation::class, $d->observations()->getRelated());
        $this->assertInstanceOf(DomiciliationDocument::class, $d->documents()->getRelated());
        $this->assertInstanceOf(DomiciliationOperation::class, $d->operations()->getRelated());
        $this->assertInstanceOf(Domiciliation::class, $d->renouvelleDe()->getRelated());
        $this->assertInstanceOf(Domiciliation::class, (new CentreDomiciliation())->domiciliations()->getRelated());
        $this->assertInstanceOf(Domiciliation::class, (new DomiciliationObservation())->domiciliation()->getRelated());

        // Entreprise (Parties) est hors module : sa relation passe par l'alias temporaire vers le centre du module.
        $this->assertInstanceOf(CentreDomiciliation::class, (new Entreprise())->centreDomiciliation()->getRelated());
    }

    public function test_les_relations_fonctionnent_sur_des_donnees_reelles(): void
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        $entreprise = Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'E']);
        $centre = CentreDomiciliation::create(['nom' => 'CENTRE MODULE '.uniqid()]);
        $entreprise->update(['centre_domiciliation_id' => $centre->id]);
        $domiciliation = Domiciliation::create(['entreprise_id' => $party->id, 'centre_domiciliation_id' => $centre->id, 'date_depart' => '2026-01-01']);

        $this->assertSame($centre->id, $entreprise->fresh()->centreDomiciliation->id);
        $this->assertSame($party->id, $domiciliation->entreprise->party_id);
        $this->assertSame($centre->id, $domiciliation->centre->id);
        $this->assertSame([$domiciliation->id], $centre->domiciliations()->pluck('id')->all());

        $domiciliation->delete();
        $this->assertNull(Domiciliation::find($domiciliation->id));
        $this->assertNotNull(Domiciliation::withTrashed()->find($domiciliation->id)->deleted_at);
    }

    public function test_les_routes_domiciliation_pointent_vers_les_controleurs_du_module_dans_l_ordre(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes())->filter(fn (Route $r) => str_starts_with($r->uri(), 'api/v1/'));
        $domiciliations = $routes->filter(fn (Route $r) => str_starts_with($r->uri(), 'api/v1/domiciliations'))->values();
        $centres = $routes->filter(fn (Route $r) => str_starts_with($r->uri(), 'api/v1/centres-domiciliation'))->values();
        $reglages = $routes->filter(fn (Route $r) => str_starts_with($r->uri(), 'api/v1/settings/domiciliation'))->values();

        $this->assertCount(24, $domiciliations);
        $this->assertCount(8, $centres);
        $this->assertCount(6, $reglages);
        foreach ($domiciliations as $route) {
            $this->assertSame(DomiciliationController::class, explode('@', $route->getActionName())[0]);
            $this->assertContains('auth:sanctum', $route->gatherMiddleware());
        }
        foreach ($centres as $route) {
            $this->assertSame(CentreDomiciliationController::class, explode('@', $route->getActionName())[0]);
            $this->assertContains('auth:sanctum', $route->gatherMiddleware());
        }
        foreach ($reglages as $route) {
            $this->assertSame(\App\Http\Controllers\Api\V1\DomiciliationSettingController::class, explode('@', $route->getActionName())[0], 'Les réglages restent aux Paramètres.');
        }

        // Les deux blocs sont séparés par d'autres modules (Services, Facturation, Déclarations) : l'ordre global est conservé.
        $ordre = $routes->values()->map(fn (Route $r) => $r->uri())->all();
        $dernierDomiciliation = array_search($domiciliations->last()->uri(), $ordre, true);
        $premierCentre = array_search($centres->first()->uri(), $ordre, true);
        $this->assertGreaterThan($dernierDomiciliation + 20, $premierCentre, 'Les routes de centres ne sont pas accolées à celles des domiciliations.');
        $this->assertSame('api/v1/domiciliations', $domiciliations->first()->uri());
    }

    public function test_le_contrat_est_lie_par_le_provider_du_module_uniquement(): void
    {
        $this->assertContains(DomiciliationServiceProvider::class, array_keys(app()->getLoadedProviders()));
        $provider = new DomiciliationServiceProvider(app());

        $this->assertSame(CompteursDomiciliationsEloquent::class, $provider->bindings[CompteursDomiciliations::class]);
        $this->assertInstanceOf(CompteursDomiciliationsEloquent::class, app(CompteursDomiciliations::class));
        $this->assertArrayNotHasKey(CompteursDomiciliations::class, (new AppServiceProvider(app()))->bindings, 'Pas de double liaison.');
    }

    public function test_archive_utilise_le_contrat_du_module_et_pas_le_modele(): void
    {
        $source = file_get_contents(base_path('app/Http/Controllers/Api/V1/ArchiveController.php'));

        $this->assertStringContainsString('App\Modules\Domiciliation\Contracts\CompteursDomiciliations', $source);
        $this->assertStringNotContainsString('Models\Domiciliation', $source);
    }
}
