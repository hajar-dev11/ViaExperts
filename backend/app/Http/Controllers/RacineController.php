<?php

namespace App\Http\Controllers;

/**
 * Racine de l'hôte API (`/`). Cet hôte ne sert que l'API : l'interface est le frontend (React).
 *
 * Réponse volontairement minimale — elle sert de simple contrôle « le serveur répond » — et sans aucune information
 * technique (version de Laravel / de PHP, nom de l'application…), contrairement à la page d'accueil par défaut de Laravel.
 * Un contrôleur invokable (et non une closure) reste compatible avec `php artisan route:cache`.
 */
class RacineController extends Controller
{
    public function __invoke()
    {
        return response()->json(['status' => 'ok']);
    }
}
