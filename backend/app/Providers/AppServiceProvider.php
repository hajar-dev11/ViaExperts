<?php

namespace App\Providers;

use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Contracts\Domiciliation\CompteursDomiciliations;
use App\Contracts\ServicesEnCours\CompteursServicesEnCours;
use App\Services\ServicesEnCours\AssureServicesEnCoursEloquent;
use App\Services\Domiciliation\CompteursDomiciliationsEloquent;
use App\Services\ServicesEnCours\CompteursServicesEnCoursEloquent;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Contrats entre modules (migration vers un monolithe modulaire) qui n'appartiennent pas à Facturation. Ceux de
     * Facturation sont liés dans App\Modules\Facturation\FacturationServiceProvider.
     *
     * @var array<class-string, class-string>
     */
    public array $bindings = [
        AssureServicesEnCours::class => AssureServicesEnCoursEloquent::class,
        CompteursServicesEnCours::class => CompteursServicesEnCoursEloquent::class,
        CompteursDomiciliations::class => CompteursDomiciliationsEloquent::class,
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
