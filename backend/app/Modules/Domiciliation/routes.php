<?php

use App\Modules\Domiciliation\Http\Controllers\CentreDomiciliationController;
use App\Modules\Domiciliation\Http\Controllers\DomiciliationController;
use Illuminate\Support\Facades\Route;

/*
 * Routes du module Domiciliation (24 routes `domiciliations` + 8 routes `centres-domiciliation`).
 *
 * Ce fichier RETOURNE deux fonctions, appelées par `routes/api.php` (via `DomiciliationServiceProvider::routes()`) aux deux
 * endroits EXACTS où ces blocs se trouvaient (dans `v1` → `auth:sanctum`) : les routes d'autres modules s'intercalent entre les
 * deux (Services, Facturation, Déclarations), et le snapshot de routes compare l'ORDRE GLOBAL. Un chargement par le provider
 * lui-même, ou en un seul bloc, déplacerait des routes et changerait cet ordre.
 *
 * Les 6 routes `settings/domiciliation` ne sont PAS ici : elles appartiennent aux Paramètres (restent dans `routes/api.php`).
 */
return [
    'domiciliations' => function () {
        // Domiciliation métier — permissions réutilisées du catalogue existant (module `domiciliation`).
        // ⚠️ Le catalogue ne contient PAS d'action `modifier` pour ce module : la mise à jour
        // réutilise donc `ajouter`, comme la création. Voir le rapport de session.
        Route::get('/domiciliations', [DomiciliationController::class, 'index'])->middleware('permission:domiciliation,list');
        Route::post('/domiciliations', [DomiciliationController::class, 'store'])->middleware('permission:domiciliation,ajouter');
        Route::get('/domiciliations/{domiciliation}', [DomiciliationController::class, 'show'])->middleware('permission:domiciliation,list');
        Route::put('/domiciliations/{domiciliation}', [DomiciliationController::class, 'update'])->middleware('permission:domiciliation,ajouter');
        Route::post('/domiciliations/{domiciliation}/archive', [DomiciliationController::class, 'archive'])->middleware('permission:domiciliation,archive');
        Route::post('/domiciliations/{domiciliation}/corbeille', [DomiciliationController::class, 'corbeille'])->middleware('permission:domiciliation,corbeille');
        Route::post('/domiciliations/{domiciliation}/restore', [DomiciliationController::class, 'restore'])->middleware('permission:domiciliation,archive');
        Route::delete('/domiciliations/{domiciliation}', [DomiciliationController::class, 'destroy'])->middleware('permission:domiciliation,supprimer');
        // « Renouveler » crée une nouvelle période rattachée à la précédente :
        // la permission `renouveler` existait déjà au catalogue, elle est enfin
        // utilisée. Déclarer / Résilier acceptent désormais fichier + commentaire.
        Route::post('/domiciliations/{domiciliation}/renouveler', [DomiciliationController::class, 'renouveler'])->middleware('permission:domiciliation,renouveler');
        Route::get('/domiciliations/{domiciliation}/operations/{operation}/download', [DomiciliationController::class, 'downloadOperationFichier'])->middleware('permission:domiciliation,list');
        Route::post('/domiciliations/{domiciliation}/declarer', [DomiciliationController::class, 'declarer'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/resilier', [DomiciliationController::class, 'resilier'])->middleware('permission:domiciliation,resilier');
        // « Activer » annule Déclarer/Résilier : remet la période à l'état actif.
        Route::post('/domiciliations/{domiciliation}/activer', [DomiciliationController::class, 'activer'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations', [DomiciliationController::class, 'storeObservation'])->middleware('permission:domiciliation,gestion');
        Route::get('/domiciliations/{domiciliation}/observations/{observation}/fichier/download', [DomiciliationController::class, 'downloadObservationFichier'])->middleware('permission:domiciliation,list');
        Route::delete('/domiciliations/{domiciliation}/observations/{observation}', [DomiciliationController::class, 'destroyObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations/{observation}/archive', [DomiciliationController::class, 'archiveObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations/{observation}/corbeille', [DomiciliationController::class, 'corbeilleObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations/{observation}/restore', [DomiciliationController::class, 'restoreObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents', [DomiciliationController::class, 'storeDocument'])->middleware('permission:domiciliation,gestion');
        Route::delete('/domiciliations/{domiciliation}/documents/{document}', [DomiciliationController::class, 'destroyDocument'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents/{document}/archive', [DomiciliationController::class, 'archiveDocument'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents/{document}/corbeille', [DomiciliationController::class, 'corbeilleDocument'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents/{document}/restore', [DomiciliationController::class, 'restoreDocument'])->middleware('permission:domiciliation,gestion');
    },

    'centres' => function () {
        // Centres de domiciliation — permissions `domiciliation` du catalogue
        // existant (centres_list / ajouter_centres / modifier_centres /
        // archive_centres / corbeille_centres / supprimer_centres). La lecture
        // est hors du groupe `admin` : le formulaire Entreprise en a besoin pour
        // sa liste déroulante, et un non-admin autorisé à créer une entreprise
        // doit pouvoir la charger. L'admin passe toujours (bypass natif).
        Route::get('/centres-domiciliation', [CentreDomiciliationController::class, 'index'])
            ->middleware('permission:domiciliation,centres_list');
        Route::get('/centres-domiciliation/{centre}', [CentreDomiciliationController::class, 'show'])
            ->middleware('permission:domiciliation,centres_list');
        Route::post('/centres-domiciliation/{centre}/archive', [CentreDomiciliationController::class, 'archive'])
            ->middleware('permission:domiciliation,archive_centres');
        Route::post('/centres-domiciliation/{centre}/corbeille', [CentreDomiciliationController::class, 'corbeille'])
            ->middleware('permission:domiciliation,corbeille_centres');
        Route::post('/centres-domiciliation/{centre}/restore', [CentreDomiciliationController::class, 'restore'])
            ->middleware('permission:domiciliation,archive_centres');
        Route::post('/centres-domiciliation', [CentreDomiciliationController::class, 'store'])
            ->middleware('permission:domiciliation,ajouter_centres');
        Route::put('/centres-domiciliation/{centre}', [CentreDomiciliationController::class, 'update'])
            ->middleware('permission:domiciliation,modifier_centres');
        Route::delete('/centres-domiciliation/{centre}', [CentreDomiciliationController::class, 'destroy'])
            ->middleware('permission:domiciliation,supprimer_centres');
    },
];
