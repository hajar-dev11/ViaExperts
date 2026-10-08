<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;

class Authenticate extends Middleware
{
    /**
     * Get the path the user should be redirected to when they are not authenticated.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return string|null
     */
    protected function redirectTo($request)
    {
        // Application d'API pure : aucune page de connexion côté serveur (le SPA gère /login). Toujours 401, jamais une
        // redirection vers une route inexistante — ce qui donnait une erreur 500 pour un lien de téléchargement ouvert
        // dans le navigateur (sans en-tête Accept: application/json) après l'expiration de la session.
        return null;
    }
}
