<?php

use App\Http\Controllers\RacineController;
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
