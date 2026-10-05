<?php

namespace App\Providers;

use App\Contracts\Facturation\FacturesDisponibles;
use App\Contracts\Facturation\FacturesPourMouvements;
use App\Contracts\Facturation\StatistiquesDocuments;
use App\Contracts\Facturation\SynchronisationPaiements;
use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Services\Facturation\FacturesDisponiblesEloquent;
use App\Services\Facturation\FacturesPourMouvementsEloquent;
use App\Services\Facturation\StatistiquesDocumentsEloquent;
use App\Services\Facturation\SynchronisationPaiementsEloquent;
use App\Services\ServicesEnCours\AssureServicesEnCoursEloquent;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Contrats entre modules (migration vers un monolithe modulaire) : chaque contrat est lié à son implémentation
     * actuelle. Remplacer une implémentation ne demandera qu'une ligne ici.
     *
     * @var array<class-string, class-string>
     */
    public array $bindings = [
        FacturesDisponibles::class => FacturesDisponiblesEloquent::class,
        SynchronisationPaiements::class => SynchronisationPaiementsEloquent::class,
        StatistiquesDocuments::class => StatistiquesDocumentsEloquent::class,
        FacturesPourMouvements::class => FacturesPourMouvementsEloquent::class,
        AssureServicesEnCours::class => AssureServicesEnCoursEloquent::class,
    ];

    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        //
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        //
    }
}
