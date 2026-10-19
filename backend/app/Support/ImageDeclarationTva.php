<?php

namespace App\Support;

use Closure;
use Illuminate\Http\UploadedFile;

/**
 * Règles et messages (en français) du document envoyé à l'« Importateur de Déclaration » : photo (JPG, PNG, WebP) ou PDF.
 *
 * Le contenu RÉEL du fichier est contrôlé par le serveur, jamais seulement son nom ou le type annoncé par le navigateur :
 *   - image : lecture des octets (`getimagesize`) — format JPG/PNG/WebP et dimensions (une image trop petite ne peut pas être
 *     un document lisible) ; le SVG, le GIF et le HEIC sont refusés ;
 *   - PDF : signature `%PDF-`, fin de fichier `%%EOF`, ni chiffré ni contenant d'éléments actifs (JavaScript, lancement de
 *     programme, fichier incorporé), nombre de pages raisonnable lorsqu'il est lisible.
 * Le serveur ne stocke ni n'ouvre le document : l'analyse (OCR) se fait dans le navigateur de l'utilisateur. Ces contrôles
 * protègent donc surtout contre les fichiers déguisés et excessifs ; ils ne remplacent pas la vérification humaine.
 *
 * Le navigateur réduit les photos avant l'envoi (voir `frontend/src/utils/images.js`) : 2 Mo correspond à la limite
 * habituelle de PHP (`upload_max_filesize`).
 */
final class ImageDeclarationTva
{
    public const TAILLE_MAX_KO = 2048;

    public const COTE_MIN = 300;

    public const COTE_MAX = 12000;

    public const PAGES_MAX = 20;

    public const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    /** Éléments PDF actifs refusés (liste de précaution : le serveur n'ouvre jamais le document). */
    private const PDF_ACTIFS = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA'];

    /** Message renvoyé avec chaque document reçu : l'analyse du contenu se fait dans le navigateur, et se vérifie à la main. */
    public const MESSAGE_ANALYSE = "Le document a été contrôlé par le serveur. L'analyse de son contenu (OCR) se fait dans votre navigateur : "
        .'elle peut être incomplète ou inexacte, et rien n\'est enregistré avant votre vérification et votre validation.';

    /** @return array<int, mixed> */
    public static function regles(): array
    {
        return [
            'required', 'file', 'max:'.self::TAILLE_MAX_KO,
            'mimetypes:'.implode(',', self::TYPES),
            fn (string $attribut, mixed $valeur, Closure $echec) => self::controlerContenu($valeur, $echec),
        ];
    }

    /** @return array<string, string> */
    public static function messages(string $champ = 'fichier'): array
    {
        $mo = self::TAILLE_MAX_KO / 1024;

        return [
            "{$champ}.required" => "Aucun fichier n'a été reçu par le serveur : choisissez la photo ou le PDF de la déclaration (il dépasse peut-être la taille acceptée, {$mo} Mo maximum).",
            "{$champ}.file" => 'Le fichier reçu est invalide : choisissez la photo ou le PDF de la déclaration.',
            "{$champ}.uploaded" => "L'envoi du fichier a échoué (fichier trop volumineux pour le serveur ou envoi interrompu). Choisissez un fichier de {$mo} Mo maximum.",
            "{$champ}.mimetypes" => "Format non pris en charge : le fichier doit être une image JPG, PNG ou WebP, ou un PDF (pas d'Excel, de CSV, de GIF, de HEIC ni de SVG).",
            "{$champ}.max" => "Le fichier dépasse {$mo} Mo. Choisissez un fichier plus léger.",
        ];
    }

    /** Contrôle le contenu réel (octets) du fichier reçu. */
    private static function controlerContenu(mixed $fichier, Closure $echec): void
    {
        if (! $fichier instanceof UploadedFile || ! $fichier->isValid() || ! is_readable((string) $fichier->getRealPath())) {
            return; // déjà signalé par les règles précédentes
        }

        if ($fichier->getMimeType() === 'application/pdf') {
            $probleme = self::problemePdf((string) file_get_contents($fichier->getRealPath(), false, null, 0, self::TAILLE_MAX_KO * 1024 + 1));
        } else {
            $probleme = self::problemeImage($fichier->getRealPath());
        }

        if ($probleme !== null) {
            $echec($probleme);
        }
    }

    private static function problemeImage(string $chemin): ?string
    {
        $infos = @getimagesize($chemin);
        if ($infos === false || ! in_array($infos[2] ?? null, [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            return "Le fichier choisi n'est pas une image valide : l'Importateur de Déclaration n'accepte que la photo ou le PDF de la déclaration (JPG, PNG, WebP ou PDF).";
        }

        [$largeur, $hauteur] = $infos;
        if ($largeur < self::COTE_MIN || $hauteur < self::COTE_MIN || $largeur > self::COTE_MAX || $hauteur > self::COTE_MAX) {
            return 'Les dimensions de l\'image ne conviennent pas : elle doit mesurer au moins '.self::COTE_MIN.' × '.self::COTE_MIN
                .' pixels (et au plus '.self::COTE_MAX.') pour être lisible.';
        }

        return null;
    }

    /** @param  string  $contenu  contenu du PDF (tronqué à la taille maximale + 1 octet) */
    private static function problemePdf(string $contenu): ?string
    {
        if (! preg_match('/^%PDF-1\.[0-7]/', $contenu) && ! str_starts_with($contenu, '%PDF-2.')) {
            return "Le fichier n'est pas un PDF valide.";
        }
        if (strlen($contenu) < 100 || ! str_contains(substr($contenu, -2048), '%%EOF')) {
            return 'Ce PDF est incomplet ou corrompu : choisissez-en un autre.';
        }
        if (str_contains($contenu, '/Encrypt')) {
            return 'Ce PDF est protégé par un mot de passe : retirez la protection avant de l\'importer.';
        }
        foreach (self::PDF_ACTIFS as $actif) {
            if (preg_match('#'.preg_quote($actif, '#').'(?![A-Za-z])#', $contenu)) {
                return 'Ce PDF contient des éléments actifs (script, programme ou fichier incorporé) : il est refusé par sécurité.';
            }
        }
        if (self::pagesPdf($contenu) > self::PAGES_MAX) {
            return 'Ce PDF contient trop de pages : '.self::PAGES_MAX.' au maximum.';
        }

        return null;
    }

    /** Nombre de pages lisible dans le fichier (0 si les objets sont compressés et donc illisibles ici). */
    public static function pagesPdf(string $contenu): int
    {
        return (int) preg_match_all('#/Type\s*/Page(?![A-Za-z])#', $contenu);
    }
}
