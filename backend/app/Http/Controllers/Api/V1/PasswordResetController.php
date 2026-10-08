<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Rules\MotDePasseFort;
use App\Support\SessionsUtilisateur;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Throwable;

/**
 * Mot de passe oublié — broker Laravel standard (`password_resets`, déjà
 * migrée, cf. config/auth.php). Aucun mécanisme maison : hachage, expiration
 * (60 min par défaut) et usage unique du token sont gérés nativement par
 * `Password::sendResetLink()` / `Password::reset()`.
 */
class PasswordResetController extends Controller
{
    /** Réponse unique, quel que soit le résultat (compte inconnu, envoi réussi, transport mail en panne). */
    public const MESSAGE_NEUTRE = 'Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.';

    /**
     * Réponse volontairement identique que le compte existe ou non ET que l'envoi du mail réussisse ou non —
     * n'expose jamais si un email est enregistré (anti-énumération).
     *
     * L'envoi se fait APRÈS l'envoi de la réponse (callback `terminating`) : une panne SMTP ne peut donc ni changer le
     * code HTTP, ni se voir dans le temps de réponse (un envoi réel est bien plus lent qu'un compte inconnu). L'échec
     * éventuel est journalisé côté serveur, sans jamais écrire l'adresse, le jeton ni le lien.
     */
    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);

        $identifiants = $request->only('email');

        app()->terminating(static function () use ($identifiants) {
            try {
                $statut = Password::sendResetLink($identifiants);

                if ($statut !== Password::RESET_LINK_SENT) {
                    Log::info('Demande de réinitialisation sans envoi de lien.', ['status' => $statut]);
                }
            } catch (Throwable $e) {
                Log::error('Échec de l\'envoi du lien de réinitialisation du mot de passe.', [
                    'exception' => $e::class,
                    'message' => Str::limit($e->getMessage(), 300),
                ]);
            }
        });

        return response()->json(['message' => self::MESSAGE_NEUTRE]);
    }

    public function reset(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', new MotDePasseFort, 'confirmed'],
        ]);

        $status = Password::reset(
            $data,
            function ($user, $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                ])->save();

                // Toutes les sessions ouvertes de ce compte sont fermées (empreinte du mot de passe + jeton « se souvenir de moi »).
                SessionsUtilisateur::apresChangementDeMotDePasse($user);
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
