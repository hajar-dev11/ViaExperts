<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckPermission
{
    /**
     * admin => toujours autorisé, sans lire user_permissions.
     * non-admin => autorisé uniquement si une ligne existe dans user_permissions
     * pour (module, action). Absence de ligne = refus (403).
     */
    public function handle(Request $request, Closure $next, string $module, string $action)
    {
        $user = $request->user();

        if (! $user) {
            abort(401);
        }

        if (! $user->hasPermission($module, $action)) {
            abort(403, "Permission refusée ({$module}.{$action}).");
        }

        return $next($request);
    }
}
