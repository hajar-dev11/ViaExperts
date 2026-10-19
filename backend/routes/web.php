<?php

use App\Http\Controllers\RacineController;
use App\Http\Controllers\StorageFichierController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Cet hôte ne sert que l'API (routes/api.php) : la seule route web est la racine, qui renvoie un statut minimal
| sans information technique (voir RacineController). Pas de closure : `route:cache` doit pouvoir fonctionner.
|
*/

Route::get('/', RacineController::class);

// Fichiers téléversés (photos, logos, signatures, pièces jointes) : servis par l'application, sous session ouverte, là où le
// serveur web ne peut pas publier `storage/app/public` (pas de lien symbolique). Voir StorageFichierController.
Route::get('/storage/{chemin}', StorageFichierController::class)->where('chemin', '.*')->middleware('auth:sanctum');
