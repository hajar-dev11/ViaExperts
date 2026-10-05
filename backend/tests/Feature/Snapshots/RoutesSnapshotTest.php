<?php

namespace Tests\Feature\Snapshots;

use Illuminate\Routing\Route;
use Tests\Support\Snapshot;
use Tests\TestCase;

/**
 * Filet de sécurité de la migration Modular Monolith : l'ensemble des routes de l'API (URI, méthode, nom,
 * middleware, contrôleur@méthode) doit rester IDENTIQUE. L'ORDRE compte (ex. `/paiements/gestion` doit
 * précéder `/paiements/{paiement}`). Seul le nom court du contrôleur est comparé : déplacer un contrôleur
 * dans un module (changement d'espace de noms) ne fait donc pas échouer le test.
 */
class RoutesSnapshotTest extends TestCase
{
    public function test_les_routes_de_l_api_sont_inchangees(): void
    {
        $routes = [];

        foreach (app('router')->getRoutes()->getRoutes() as $route) {
            /** @var Route $route */
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            $action = $route->getActionName();
            $routes[] = [
                'methodes' => array_values(array_diff($route->methods(), ['HEAD'])),
                'uri' => $route->uri(),
                'nom' => $route->getName(),
                'middleware' => array_values($route->gatherMiddleware()),
                'action' => $action === 'Closure' ? 'Closure' : class_basename(explode('@', $action)[0]).'@'.(explode('@', $action)[1] ?? '__invoke'),
            ];
        }

        $this->assertNotEmpty($routes);
        Snapshot::assertMatches('routes', $routes);
    }
}
