<?php

use App\Modules\Facturation\Http\Controllers\DocumentCommercialController;
use Illuminate\Support\Facades\Route;

/*
 * Routes du module Facturation.
 *
 * Ce fichier est INCLUS par `routes/api.php` à l'endroit exact où ce bloc se trouvait (dans `v1` → `auth:sanctum`), et
 * non chargé par le FacturationServiceProvider : ainsi le préfixe `api/v1`, les middlewares et — surtout — l'ORDRE des
 * routes restent identiques (le test de snapshot des routes compare l'ordre).
 *
 * 4 types partagent le même contrôleur : {type} vaut facture | devis | bl | avoir. Les permissions étant déclinées par
 * type (liste_facture, ajouter_devis…), le contrôle se fait dans le contrôleur.
 * `/numero-propose` doit rester AVANT `/{document}`.
 */
Route::prefix('facturation/{type}')->whereIn('type', ['facture', 'devis', 'bl', 'avoir'])->group(function () {
    Route::get('/numero-propose', [DocumentCommercialController::class, 'numeroPropose']);
    Route::get('/', [DocumentCommercialController::class, 'index']);
    Route::post('/', [DocumentCommercialController::class, 'store']);
    Route::get('/{document}', [DocumentCommercialController::class, 'show']);
    Route::put('/{document}', [DocumentCommercialController::class, 'update']);
    Route::post('/{document}/archive', [DocumentCommercialController::class, 'archive']);
    Route::post('/{document}/corbeille', [DocumentCommercialController::class, 'corbeille']);
    Route::post('/{document}/restore', [DocumentCommercialController::class, 'restore']);
    Route::delete('/{document}', [DocumentCommercialController::class, 'destroy']);
});
