<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Échecs tolérés par fenêtre pour un même identifiant depuis une même IP. */
    public const MAX_ECHECS_PAR_COMPTE = 5;

    /** Échecs tolérés par fenêtre pour une même IP (tous identifiants confondus). */
    public const MAX_ECHECS_PAR_IP = 30;

    /** Durée de la fenêtre (et du blocage) en secondes. */
    public const FENETRE_SECONDES = 60;

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $remember = (bool) ($credentials['remember'] ?? false);

        // Anti force brute : seuls les ÉCHECS comptent. Deux compteurs, sans verrouiller le compte lui-même
        // (un tiers ne peut donc pas bloquer l'administrateur depuis une autre adresse) :
        //   - identifiant + IP : MAX_ECHECS_PAR_COMPTE échecs par fenêtre ;
        //   - IP seule : MAX_ECHECS_PAR_IP échecs par fenêtre (large, pour les bureaux derrière une même adresse).
        $cleCompte = 'login:'.Str::lower(trim($credentials['email'])).'|'.$request->ip();
        $cleIp = 'login-ip:'.$request->ip();

        if (RateLimiter::tooManyAttempts($cleCompte, self::MAX_ECHECS_PAR_COMPTE)
            || RateLimiter::tooManyAttempts($cleIp, self::MAX_ECHECS_PAR_IP)) {
            $secondes = max(1, RateLimiter::availableIn($cleCompte), RateLimiter::availableIn($cleIp));
            $message = "Trop de tentatives de connexion. Réessayez dans {$secondes} seconde".($secondes > 1 ? 's' : '').'.';

            return response()->json([
                'message' => $message,
                'errors' => ['email' => [$message]],
                'retry_after' => $secondes,
            ], 429)->header('Retry-After', (string) $secondes);
        }

        if (! Auth::attempt(['email' => $credentials['email'], 'password' => $credentials['password']], $remember)) {
            RateLimiter::hit($cleCompte, self::FENETRE_SECONDES);
            RateLimiter::hit($cleIp, self::FENETRE_SECONDES);

            throw ValidationException::withMessages([
                'email' => ['Identifiant ou mot de passe incorrect.'],
            ]);
        }

        RateLimiter::clear($cleCompte);

        $request->session()->regenerate();

        return response()->json(['user' => Auth::user(), 'permissions' => $this->permissionsPayload(Auth::user())]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Déconnecté.']);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user(),
            'permissions' => $this->permissionsPayload($request->user()),
        ]);
    }

    /**
     * Permissions accordées (module + action), pour que le frontend puisse adapter
     * le menu/dashboard sans redemander le catalogue complet. Vide pour un admin :
     * `hasPermission` côté front, comme côté back, le fait toujours passer via
     * `isAdmin`, sans avoir besoin d'énumérer ses permissions.
     */
    private function permissionsPayload(User $user): array
    {
        if ($user->is_admin) {
            return [];
        }

        return $user->userPermissions()->with('permission')->get()
            ->map(fn ($up) => ['module' => $up->permission->module, 'action' => $up->permission->action])
            ->values()->all();
    }
}
