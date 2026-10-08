<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Réserve une route aux utilisateurs qui peuvent produire un document imprimable
 * (administrateur, ou au moins une permission Facturation / Paiements / Domiciliation / Mouvement).
 */
class PeutImprimer
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if (! $user) {
            abort(401);
        }

        abort_unless($user->peutImprimer(), 403, 'Permission refusée (impression).');

        return $next($request);
    }
}