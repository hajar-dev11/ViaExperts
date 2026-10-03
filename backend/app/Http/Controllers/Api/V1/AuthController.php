<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $remember = (bool) ($credentials['remember'] ?? false);

        if (! Auth::attempt(['email' => $credentials['email'], 'password' => $credentials['password']], $remember)) {
            throw ValidationException::withMessages([
                'email' => ['Identifiant ou mot de passe incorrect.'],
            ]);
        }

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
