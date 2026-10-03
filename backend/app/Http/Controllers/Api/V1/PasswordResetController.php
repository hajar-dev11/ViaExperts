<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Mot de passe oublié — broker Laravel standard (`password_resets`, déjà
 * migrée, cf. config/auth.php). Aucun mécanisme maison : hachage, expiration
 * (60 min par défaut) et usage unique du token sont gérés nativement par
 * `Password::sendResetLink()` / `Password::reset()`.
 */
class PasswordResetController extends Controller
{
    /**
     * Message volontairement identique que le compte existe ou non —
     * n'expose jamais si un email est enregistré (anti-énumération).
     */
    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);

        // Le statut n'est jamais renvoyé au client (anti-énumération), mais on le
        // journalise : sans ça, un échec réel (ex. transport mail en panne) serait
        // indiscernable d'un email inconnu, et personne ne le remarquerait jamais.
        $status = Password::sendResetLink($request->only('email'));
        if ($status !== Password::RESET_LINK_SENT) {
            Log::info('Demande de réinitialisation sans envoi de lien.', ['status' => $status]);
        }

        return response()->json([
            'message' => 'Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.',
        ]);
    }

    public function reset(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $data,
            function ($user, $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'Ce lien de réinitialisation est invalide ou a expiré.',
            ], 422);
        }

        return response()->json(['message' => 'Mot de passe réinitialisé avec succès.']);
    }
}
