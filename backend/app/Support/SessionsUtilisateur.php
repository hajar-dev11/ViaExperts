<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Invalidation des sessions d'un utilisateur quand son mot de passe change.
 *
 * Le middleware `Laravel\Sanctum\Http\Middleware\AuthenticateSession` (déclaré dans config/sanctum.php) compare à chaque
 * requête l'empreinte du mot de passe mémorisée dans la session à celle du compte : dès que le mot de passe change
 * (changement du profil, modification par l'administrateur, réinitialisation), toutes les AUTRES sessions du compte sont
 * déconnectées à leur prochaine requête, quel que soit le pilote de session. Ce service fait le reste :
 *   - il renouvelle le jeton « se souvenir de moi », pour que les anciens cookies de reconnexion ne rouvrent plus rien ;
 *   - il rafraîchit l'empreinte de la session COURANTE quand c'est l'utilisateur lui-même qui change son mot de passe,
 *     afin qu'il ne soit pas déconnecté de l'appareil qu'il utilise.
 */
final class SessionsUtilisateur
{
    /** À appeler APRÈS l'enregistrement du nouveau mot de passe. */
    public static function apresChangementDeMotDePasse(User $user, ?Request $requete = null): void
    {
        $user->forceFill(['remember_token' => Str::random(60)])->save();

        if ($requete !== null && $requete->hasSession() && $requete->user()?->is($user)) {
            self::memoriserEmpreinte($requete, $user);
        }
    }

    /** Mémorise dans la session courante l'empreinte du mot de passe actuel (appelé aussi à la connexion). */
    public static function memoriserEmpreinte(Request $requete, User $user): void
    {
        foreach (Arr::wrap(config('sanctum.guard', 'web')) as $nomGarde) {
            $garde = Auth::guard($nomGarde);

            if (! $garde instanceof SessionGuard) {
                continue;
            }

            $requete->session()->put(
                "password_hash_{$nomGarde}",
                method_exists($garde, 'hashPasswordForCookie')
                    ? $garde->hashPasswordForCookie($user->getAuthPassword())
                    : $user->getAuthPassword()
            );
        }
    }
}
