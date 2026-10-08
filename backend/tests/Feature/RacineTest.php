<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** La racine de l'hôte API ne montre plus la page Laravel par défaut et n'expose aucune information technique. */
class RacineTest extends TestCase
{
    public function test_la_racine_repond_avec_un_statut_minimal_sans_information_technique(): void
    {
        $reponse = $this->get('/');

        $reponse->assertOk()->assertExactJson(['status' => 'ok']);

        $corps = $reponse->getContent();
        $this->assertStringNotContainsStringIgnoringCase('laravel', $corps);
        $this->assertStringNotContainsStringIgnoringCase('php', $corps);
        $this->assertStringNotContainsString(app()->version(), $corps);
        $this->assertStringNotContainsString(PHP_VERSION, $corps);
    }

    public function test_la_vue_welcome_de_laravel_n_existe_plus(): void
    {
        $this->assertFileDoesNotExist(resource_path('views/welcome.blade.php'));
        $this->assertFalse(view()->exists('welcome'));
    }

    public function test_aucune_route_n_utilise_une_closure_pour_que_route_cache_fonctionne(): void
    {
        $closures = collect(Route::getRoutes()->getRoutes())
            ->filter(fn ($route) => $route->getAction('uses') instanceof \Closure)
            ->map(fn ($route) => $route->methods()[0].' /'.ltrim($route->uri(), '/'))
            ->values()->all();

        $this->assertSame([], $closures, 'Une route avec closure empêche `php artisan route:cache`.');
    }
}
