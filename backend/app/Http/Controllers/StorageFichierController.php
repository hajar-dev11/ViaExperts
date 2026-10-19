<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sert les fichiers téléversés (`/storage/{chemin}`) pour les hébergements SANS lien symbolique `public/storage`
 * (ex. LWS avec le seul Gestionnaire de fichiers) : le serveur web ne peut alors pas publier `storage/app/public`.
 *
 * Les fichiers restent où ils sont (aucun déplacement, aucune copie) et l'adresse ne change pas : le frontend continue
 * d'utiliser `<API>/storage/<chemin>` pour les photos, logos, signatures et pièces jointes.
 *
 * Contrairement à un lien symbolique public, l'accès EXIGE une session ouverte : un document confidentiel (pièce de
 * paiement, document d'entreprise, rapport, fichier de chat…) n'est jamais lisible sans être connecté. Sans session : 401.
 *
 * Seuls les chemins « propres » sont acceptés (jamais de `..`, de segment caché ni de caractère spécial) ; tout le reste est
 * un 404. Les images et les PDF s'affichent dans le navigateur ; tout autre type (dont HTML et SVG, qui pourraient exécuter
 * du script depuis l'adresse de l'API) est servi en téléchargement, avec une politique « sandbox ».
 */
class StorageFichierController extends Controller
{
    /** Types affichés dans le navigateur ; tous les autres sont téléchargés. */
    private const TYPES_AFFICHABLES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

    public function __invoke(Request $request, string $chemin): Response
    {
        abort_unless(self::cheminValide($chemin), 404);

        $disque = Storage::disk('public');
        abort_unless($disque->exists($chemin), 404);

        $type = (string) ($disque->mimeType($chemin) ?: 'application/octet-stream');
        $affichable = in_array($type, self::TYPES_AFFICHABLES, true);

        $entetes = [
            'Content-Type' => $affichable ? $type : 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            // Le nom du fichier est aléatoire : la copie reste valable, mais strictement privée (jamais un cache partagé).
            'Cache-Control' => 'private, max-age=86400',
        ];
        // Un type non affichable est téléchargé, jamais exécuté. (Pas de « sandbox » pour les images et les PDF : il
        // empêcherait le lecteur PDF du navigateur de s'ouvrir.)
        if (! $affichable) {
            $entetes['Content-Security-Policy'] = "sandbox; default-src 'none'";
        }

        return $disque->response($chemin, basename($chemin), $entetes, $affichable ? 'inline' : 'attachment');
    }

    /**
     * Chemin relatif propre : segments séparés par « / », chacun commençant par une lettre ou un chiffre (donc ni `..`,
     * ni `.htaccess`, ni `.env`) et ne contenant que lettres, chiffres, point, tiret, tiret bas ou espace.
     */
    public static function cheminValide(string $chemin): bool
    {
        if ($chemin === '' || strlen($chemin) > 400) {
            return false;
        }

        return preg_match('#^(?:[A-Za-z0-9][A-Za-z0-9._ -]*/)*[A-Za-z0-9][A-Za-z0-9._ -]*$#', $chemin) === 1
            && ! str_contains($chemin, '..');
    }
}
