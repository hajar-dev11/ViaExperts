<?php

namespace App\Modules\Domiciliation;

use App\Modules\Domiciliation\Contracts\CompteursDomiciliations;
use App\Modules\Domiciliation\Services\CompteursDomiciliationsEloquent;
use Illuminate\Support\ServiceProvider;

/**
 * Point d'entrée du module Domiciliation (enregistré dans `config/app.php`).
 *
 * - Liaisons : le contrat public `CompteursDomiciliations` (compteurs de la page Archive).
 * - Routes : `routes.php` du module, chargé par `routes/api.php` via {@see self::routes()} aux positions exactes des anciens
 *   blocs (l'ORDRE global des routes est verrouillé par un snapshot). Les routes `settings/domiciliation` ne font pas partie
 *   du module : ce sont des réglages (Paramètres) et elles restent dans `routes/api.php`.
 */
class DomiciliationServiceProvider extends ServiceProvider
{
    /**
     * Contrat → implémentation actuelle.
     *
     * @var array<class-string, class-string>
     */
    public array $bindings = [
        CompteursDomiciliations::class => CompteursDomiciliationsEloquent::class,
    ];

    /**
     * Enregistre un segment des routes du module dans le groupe de routes COURANT (à appeler depuis `routes/api.php`).
     *
     * @param  'domiciliations'|'centres'  $segment
     */
    public static function routes(string $segment): void
    {
        $segments = require __DIR__.'/routes.php';

        $segments[$segment]();
    }
}
