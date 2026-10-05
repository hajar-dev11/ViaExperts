<?php

namespace App\Modules\Facturation\Tests\Feature;

use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Modules\Facturation\Contracts\FacturesPourMouvements;
use App\Modules\Facturation\Contracts\StatistiquesDocuments;
use App\Modules\Facturation\Contracts\SynchronisationPaiements;
use App\Modules\Facturation\FacturationServiceProvider;
use App\Modules\Facturation\Http\Controllers\DocumentCommercialController;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Modules\Facturation\Models\DocumentLigne;
use App\Providers\AppServiceProvider;
use Illuminate\Routing\Route;
use Tests\TestCase;

/**
 * Module Facturation (migration Modular Monolith) : le code réel vit dans `App\Modules\Facturation` et UNIQUEMENT là (les
 * alias de compatibilité de l'étape 4 ont été supprimés à l'étape 6), le ServiceProvider du module porte les liaisons des
 * contrats et les routes pointent vers le contrôleur du module.
 */
class ModuleFacturationTest extends TestCase
{
    /** @dataProvider anciensNoms */
    public function test_les_anciens_noms_n_existent_plus_et_les_classes_du_module_existent(string $ancien, string $nouveau): void
    {
        $this->assertFalse(class_exists($ancien), "L'ancien nom {$ancien} ne doit plus exister (plus d'alias).");
        $this->assertTrue(class_exists($nouveau));
    }

    public static function anciensNoms(): array
    {
        return [
            ['App\Models\DocumentCommercial', 'App\Modules\Facturation\Models\DocumentCommercial'],
            ['App\Models\DocumentLigne', 'App\Modules\Facturation\Models\DocumentLigne'],
            ['App\Http\Controllers\Api\V1\DocumentCommercialController', 'App\Modules\Facturation\Http\Controllers\DocumentCommercialController'],
            ['App\Http\Requests\StoreDocumentCommercialRequest', 'App\Modules\Facturation\Http\Requests\StoreDocumentCommercialRequest'],
            ['App\Http\Requests\UpdateDocumentCommercialRequest', 'App\Modules\Facturation\Http\Requests\UpdateDocumentCommercialRequest'],
            ['App\Http\Resources\DocumentCommercialResource', 'App\Modules\Facturation\Http\Resources\DocumentCommercialResource'],
            ['App\Services\NumerotationDocuments', 'App\Modules\Facturation\Services\NumerotationDocuments'],
        ];
    }

    public function test_les_relations_eloquent_pointent_vers_les_classes_du_module(): void
    {
        $ligne = new DocumentLigne();
        $document = new DocumentCommercial();

        $this->assertInstanceOf(DocumentCommercial::class, $ligne->document()->getRelated());
        $this->assertInstanceOf(DocumentLigne::class, $document->lignes()->getRelated());
        $this->assertSame('documents_commerciaux', $document->getTable());
        $this->assertSame('document_lignes', $ligne->getTable());

        // Paiements ne dépend plus du modèle de Facturation : plus de relation Eloquent, le numéro passe par le contrat.
        $this->assertFalse(method_exists(\App\Models\Paiement::class, 'document'));
        $this->assertTrue(method_exists(\App\Models\Paiement::class, 'numeroFacture'));
    }
    public function test_les_routes_facturation_pointent_vers_le_controleur_du_module_dans_le_bon_ordre(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn (Route $r) => str_starts_with($r->uri(), 'api/v1/facturation/'))
            ->values();

        $this->assertCount(9, $routes);
        $this->assertSame('api/v1/facturation/{type}/numero-propose', $routes[0]->uri());
        $this->assertSame('api/v1/facturation/{type}/{document}', $routes[3]->uri());
        foreach ($routes as $route) {
            $this->assertSame(DocumentCommercialController::class, ltrim(explode('@', $route->getActionName())[0], '\\'));
            $this->assertContains('auth:sanctum', $route->gatherMiddleware());
        }
    }

    public function test_les_contrats_de_facturation_sont_lies_par_le_provider_du_module_uniquement(): void
    {
        $this->assertContains(FacturationServiceProvider::class, array_keys(app()->getLoadedProviders()));

        $provider = new FacturationServiceProvider(app());
        foreach ([FacturesDisponibles::class, SynchronisationPaiements::class, StatistiquesDocuments::class, FacturesPourMouvements::class] as $contrat) {
            $this->assertArrayHasKey($contrat, $provider->bindings);
            $this->assertInstanceOf($provider->bindings[$contrat], app($contrat));
            $this->assertArrayNotHasKey($contrat, (new AppServiceProvider(app()))->bindings, 'Pas de double liaison.');
        }
    }
}
