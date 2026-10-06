<?php

namespace App\Modules\Domiciliation\Tests\Feature;

use App\Models\Entreprise;
use App\Models\Party;
use App\Modules\Domiciliation\Contracts\CentresDomiciliationReference;
use App\Modules\Domiciliation\Contracts\CompteursDomiciliations;
use App\Modules\Domiciliation\DomiciliationServiceProvider;
use App\Modules\Domiciliation\Http\Controllers\CentreDomiciliationController;
use App\Modules\Domiciliation\Http\Controllers\DomiciliationController;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use App\Modules\Domiciliation\Models\Domiciliation;
use App\Modules\Domiciliation\Models\DomiciliationDocument;
use App\Modules\Domiciliation\Models\DomiciliationObservation;
use App\Modules\Domiciliation\Models\DomiciliationOperation;
use App\Modules\Domiciliation\Services\CentresDomiciliationReferenceEloquent;
use App\Modules\Domiciliation\Services\CompteursDomiciliationsEloquent;
use App\Providers\AppServiceProvider;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Tests\TestCase;

/**
 * Module Domiciliation : le code réel vit dans `App\Modules\Domiciliation` et UNIQUEMENT là (les alias temporaires de l'étape 18
 * ont été supprimés à l'étape 19), le provider du module porte les liaisons des contrats, les routes pointent vers ses contrôleurs
 * dans le même ordre global qu'avant, et Parties ne dépend plus de ses modèles Eloquent.
 */
class ModuleDomiciliationTest extends TestCase
{
    use RefreshDatabase;

    private const ANCIENS_NOMS = [
        'App\Models\Domiciliation', 'App\Models\CentreDomiciliation', 'App\Models\DomiciliationDocument',
        'App\Models\DomiciliationObservation', 'App\Models\DomiciliationOperation',
        'App\Http\Controllers\Api\V1\DomiciliationController', 'App\Http\Controllers\Api\V1\CentreDomiciliationController',
        'App\Http\Requests\StoreDomiciliationRequest', 'App\Http\Requests\UpdateDomiciliationRequest',
        'App\Http\Requests\StoreCentreDomiciliationRequest', 'App\Http\Requests\UpdateCentreDomiciliationRequest',
        'App\Http\Resources\DomiciliationResource', 'App\Contracts\Domiciliation\CompteursDomiciliations',
        'App\Services\Domiciliation\CompteursDomiciliationsEloquent',
    ];

    // ---- Anciens namespaces ----------------------------------------------------------------------------------------

    public function test_les_anciens_namespaces_domiciliation_n_existent_plus(): void
    {
        foreach (self::ANCIENS_NOMS as $ancien) {
            $this->assertFalse(class_exists($ancien) || interface_exists($ancien), "{$ancien} ne doit plus exister (plus d'alias).");
        }
        foreach (['Domiciliation', 'CentreDomiciliation', 'DomiciliationDocument', 'DomiciliationObservation', 'DomiciliationOperation'] as $nom) {
            $this->assertFileDoesNotExist(base_path("app/Models/{$nom}.php"));
            $this->assertFileExists(base_path("app/Modules/Domiciliation/Models/{$nom}.php"));
        }
    }

    public function test_aucune_reference_aux_anciens_namespaces_dans_le_code_de_production(): void
    {
        $fautes = [];
        foreach ($this->fichiersPhp(base_path('app')) as $fichier) {
            $source = file_get_contents($fichier);
            foreach (self::ANCIENS_NOMS as $ancien) {
                // `(?!\w)` : `App\Models\Domiciliation` ne doit pas déclencher sur `App\Models\DomiciliationSetting` (Paramètres).
                if (preg_match('/'.preg_quote($ancien, '/').'(?!\w)/', $source)) {
                    $fautes[] = str_replace(base_path().DIRECTORY_SEPARATOR, '', $fichier)." → {$ancien}";
                }
            }
        }
        // Les tests d'architecture (ce fichier) citent les anciens noms pour vérifier leur absence.
        $this->assertSame([], array_values(array_filter($fautes, fn ($f) => ! str_contains($f, 'ModuleDomiciliationTest'))));
    }

    public function test_domiciliation_setting_n_a_pas_bouge_et_reste_aux_parametres(): void
    {
        $this->assertFileExists(base_path('app/Models/DomiciliationSetting.php'));
        $this->assertFileDoesNotExist(base_path('app/Modules/Domiciliation/Models/DomiciliationSetting.php'));
        $this->assertTrue(class_exists(\App\Models\DomiciliationSetting::class));
        $this->assertTrue(class_exists(\App\Http\Controllers\Api\V1\DomiciliationSettingController::class));
    }

    // ---- Modèles et relations --------------------------------------------------------------------------------------

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

    public function test_les_relations_internes_du_module_pointent_vers_ses_classes(): void
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
    }

    public function test_entreprise_n_a_plus_de_relation_eloquent_vers_le_centre_et_passe_par_le_contrat(): void
    {
        $this->assertFalse(method_exists(Entreprise::class, 'centreDomiciliation'));
        $this->assertTrue(method_exists(Entreprise::class, 'nomCentreDomiciliation'));

        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        $centre = CentreDomiciliation::create(['nom' => 'CENTRE MODULE '.uniqid()]);
        $entreprise = Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => 'E', 'centre_domiciliation_id' => $centre->id]);
        $domiciliation = Domiciliation::create(['entreprise_id' => $party->id, 'centre_domiciliation_id' => $centre->id, 'date_depart' => '2026-01-01']);

        $this->assertSame($centre->nom, $entreprise->fresh()->nomCentreDomiciliation());
        $this->assertSame($party->id, $domiciliation->entreprise->party_id);
        $this->assertSame($centre->id, $domiciliation->centre->id);
        $this->assertSame([$domiciliation->id], $centre->domiciliations()->pluck('id')->all());

        $domiciliation->delete();
        $this->assertNull(Domiciliation::find($domiciliation->id));
        $this->assertNotNull(Domiciliation::withTrashed()->find($domiciliation->id)->deleted_at);
    }

    // ---- Routes ----------------------------------------------------------------------------------------------------

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

        $ordre = $routes->values()->map(fn (Route $r) => $r->uri())->all();
        $dernierDomiciliation = array_search($domiciliations->last()->uri(), $ordre, true);
        $premierCentre = array_search($centres->first()->uri(), $ordre, true);
        $this->assertGreaterThan($dernierDomiciliation + 20, $premierCentre, 'Les routes de centres ne sont pas accolées à celles des domiciliations.');
        $this->assertSame('api/v1/domiciliations', $domiciliations->first()->uri());
    }

    // ---- Contrats --------------------------------------------------------------------------------------------------

    public function test_les_contrats_sont_lies_par_le_provider_du_module_uniquement(): void
    {
        $this->assertContains(DomiciliationServiceProvider::class, array_keys(app()->getLoadedProviders()));
        $provider = new DomiciliationServiceProvider(app());

        $this->assertSame(CompteursDomiciliationsEloquent::class, $provider->bindings[CompteursDomiciliations::class]);
        $this->assertSame(CentresDomiciliationReferenceEloquent::class, $provider->bindings[CentresDomiciliationReference::class]);
        $this->assertInstanceOf(CompteursDomiciliationsEloquent::class, app(CompteursDomiciliations::class));
        $this->assertInstanceOf(CentresDomiciliationReferenceEloquent::class, app(CentresDomiciliationReference::class));
        foreach ([CompteursDomiciliations::class, CentresDomiciliationReference::class] as $contrat) {
            $this->assertArrayNotHasKey($contrat, (new AppServiceProvider(app()))->bindings, 'Pas de double liaison.');
        }
    }

    public function test_le_contrat_de_reference_se_comporte_comme_l_ancienne_relation(): void
    {
        $actif = CentreDomiciliation::create(['nom' => 'ZZ REF ACTIF']);
        $archive = CentreDomiciliation::create(['nom' => 'ZZ REF ARCHIVE', 'status' => 'archive']);
        $supprime = CentreDomiciliation::create(['nom' => 'ZZ REF SUPPRIME']);
        $supprime->delete();
        $contrat = app(CentresDomiciliationReference::class);

        $this->assertSame($actif->id, $contrat->idParNom('ZZ REF ACTIF'));
        $this->assertSame($archive->id, $contrat->idParNom('ZZ REF ARCHIVE'), 'Le statut archive/corbeille n\'est pas filtré.');
        $this->assertNull($contrat->idParNom('ZZ REF SUPPRIME'), 'Supprimé en douceur : invisible.');
        $this->assertNull($contrat->idParNom('INCONNU'));

        $this->assertSame([$actif->id => 'ZZ REF ACTIF', $archive->id => 'ZZ REF ARCHIVE'], $contrat->nomsParIds([$actif->id, $archive->id, $supprime->id, 999999, null, 0, $actif->id]));
        $this->assertSame([], $contrat->nomsParIds([]));
        $this->assertSame([], $contrat->nomsParIds([null, 0]));
    }

    // ---- Frontières ------------------------------------------------------------------------------------------------

    public function test_parties_ne_depend_plus_des_modeles_eloquent_de_domiciliation(): void
    {
        $parties = [
            'app/Models/Entreprise.php', 'app/Models/Client.php', 'app/Models/Party.php',
            'app/Http/Controllers/Api/V1/EntrepriseController.php', 'app/Http/Controllers/Api/V1/ClientController.php',
            'app/Http/Resources/EntrepriseResource.php', 'app/Http/Resources/ClientResource.php',
            'app/Http/Requests/StoreEntrepriseRequest.php', 'app/Http/Requests/UpdateEntrepriseRequest.php',
        ];
        foreach ($parties as $fichier) {
            $source = file_get_contents(base_path($fichier));
            $this->assertStringNotContainsString('Modules\Domiciliation\Models', $source, $fichier);
            $this->assertStringNotContainsString('CentreDomiciliation::', $source, $fichier);
            $this->assertStringNotContainsString('CentreDomiciliation::class', $source, $fichier);
            $this->assertStringNotContainsString('centreDomiciliation()', $source, $fichier);
        }
        // Parties n'utilise que le contrat public.
        $this->assertStringContainsString('Modules\Domiciliation\Contracts\CentresDomiciliationReference', file_get_contents(base_path('app/Models/Entreprise.php')));
        $this->assertStringContainsString('Modules\Domiciliation\Contracts\CentresDomiciliationReference', file_get_contents(base_path('app/Http/Controllers/Api/V1/EntrepriseController.php')));
    }

    public function test_aucun_code_hors_module_ne_depend_des_modeles_domiciliation(): void
    {
        $fautes = [];
        foreach ($this->fichiersPhp(base_path('app')) as $fichier) {
            $relatif = str_replace(base_path().DIRECTORY_SEPARATOR, '', $fichier);
            if (str_contains($relatif, 'app'.DIRECTORY_SEPARATOR.'Modules'.DIRECTORY_SEPARATOR.'Domiciliation'.DIRECTORY_SEPARATOR)) {
                continue;
            }
            if (str_contains(file_get_contents($fichier), 'Modules\Domiciliation\Models')) {
                $fautes[] = $relatif;
            }
        }
        $this->assertSame([], $fautes, 'Hors du module, seuls ses contrats (et son provider) sont utilisés.');
    }

    public function test_le_module_n_utilise_de_parties_que_entreprise_et_user(): void
    {
        $autorises = ['Entreprise', 'User'];
        foreach ($this->fichiersPhp(base_path('app/Modules/Domiciliation')) as $fichier) {
            if (str_contains($fichier, DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR)) {
                continue;
            }
            preg_match_all('/^use App\\\\Models\\\\(\w+);/m', file_get_contents($fichier), $m);
            foreach ($m[1] as $classe) {
                $this->assertContains($classe, $autorises, "{$fichier} importe App\\Models\\{$classe} (non prévu).");
            }
        }
    }

    public function test_archive_utilise_le_contrat_du_module_et_pas_le_modele(): void
    {
        $source = file_get_contents(base_path('app/Http/Controllers/Api/V1/ArchiveController.php'));

        $this->assertStringContainsString('App\Modules\Domiciliation\Contracts\CompteursDomiciliations', $source);
        $this->assertStringNotContainsString('Models\Domiciliation', $source);
    }

    /** @return list<string> */
    private function fichiersPhp(string $dossier): array
    {
        $fichiers = [];
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dossier, \FilesystemIterator::SKIP_DOTS)) as $f) {
            if ($f->isFile() && $f->getExtension() === 'php') {
                $fichiers[] = $f->getPathname();
            }
        }

        return $fichiers;
    }
}
