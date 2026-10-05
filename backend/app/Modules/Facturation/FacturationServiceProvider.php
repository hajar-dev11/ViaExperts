<?php

namespace App\Modules\Facturation;

use App\Modules\Facturation\Contracts\FactureExiste;
use App\Modules\Facturation\Contracts\FactureReference;
use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Modules\Facturation\Contracts\FacturesPourMouvements;
use App\Modules\Facturation\Contracts\StatistiquesDocuments;
use App\Modules\Facturation\Contracts\SynchronisationPaiements;
use App\Modules\Facturation\Services\FactureExisteEloquent;
use App\Modules\Facturation\Services\FactureReferenceEloquent;
use App\Modules\Facturation\Services\FacturesDisponiblesEloquent;
use App\Modules\Facturation\Services\FacturesPourMouvementsEloquent;
use App\Modules\Facturation\Services\StatistiquesDocumentsEloquent;
use App\Modules\Facturation\Services\SynchronisationPaiementsEloquent;
use Illuminate\Support\ServiceProvider;

/**
 * Point d'entrée du module Facturation (enregistré dans `config/app.php`).
 *
 * Il porte les liaisons des contrats PUBLICS de Facturation (ceux que Paiements, Mouvement et Archive consomment).
 * Les routes du module sont dans `routes.php`, incluses par `routes/api.php` pour garder leur ordre (voir ce fichier).
 */
class FacturationServiceProvider extends ServiceProvider
{
    /**
     * Contrat → implémentation actuelle.
     *
     * @var array<class-string, class-string>
     */
    public array $bindings = [
        FacturesDisponibles::class => FacturesDisponiblesEloquent::class,
        SynchronisationPaiements::class => SynchronisationPaiementsEloquent::class,
        StatistiquesDocuments::class => StatistiquesDocumentsEloquent::class,
        FacturesPourMouvements::class => FacturesPourMouvementsEloquent::class,
        FactureReference::class => FactureReferenceEloquent::class,
        FactureExiste::class => FactureExisteEloquent::class,
    ];
}
