<?php

namespace App\Rules;

use Illuminate\Contracts\Validation\Rule;
use Illuminate\Http\UploadedFile;
use Symfony\Component\Mime\MimeTypes;

/**
 * Liste blanche des fichiers téléversés (pièces jointes, documents clients, rapports, chat…).
 *
 * Vérifie à la fois :
 *   - l'extension déclarée, qui doit figurer dans la liste blanche ;
 *   - le contenu RÉEL du fichier (type MIME détecté par finfo, pas celui annoncé par le navigateur), qui doit
 *     correspondre à cette extension : un script PHP renommé « facture.pdf » est refusé ;
 *   - le nom : pas de séparateur de chemin, d'octet nul ni de caractère de contrôle, et aucune extension
 *     exécutable intermédiaire (« shell.php.jpg », que certaines configurations Apache exécutent).
 *
 * La taille reste contrôlée par la règle `max:` de chaque endpoint. Les images de paramétrage (logos, signatures,
 * photo de profil) utilisent déjà `image` + `mimes:jpg,jpeg,png,gif` (contenu réel) et ne sont pas concernées.
 */
class FichierAutorise implements Rule
{
    /** Extensions autorisées pour un document → types MIME réels acceptés pour cette extension. */
    private const DOCUMENTS = [
        'pdf' => ['application/pdf'],
        'jpg' => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'png' => ['image/png'],
        'gif' => ['image/gif'],
        'webp' => ['image/webp'],
        'doc' => ['application/msword', 'application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage'],
        'xls' => ['application/vnd.ms-excel', 'application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage'],
        'ppt' => ['application/vnd.ms-powerpoint', 'application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
        'pptx' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
        'odt' => ['application/vnd.oasis.opendocument.text', 'application/zip'],
        'ods' => ['application/vnd.oasis.opendocument.spreadsheet', 'application/zip'],
        'odp' => ['application/vnd.oasis.opendocument.presentation', 'application/zip'],
        'txt' => ['text/plain'],
        'csv' => ['text/csv', 'text/plain', 'application/csv'],
        'rtf' => ['text/rtf', 'application/rtf'],
    ];

    /** Extensions qui ne doivent apparaître nulle part dans le nom (même au milieu : « a.php.jpg »). */
    public const EXTENSIONS_INTERDITES = [
        'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'pht', 'phtml', 'phtm', 'phar', 'phps',
        'cgi', 'pl', 'py', 'sh', 'bash', 'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'jar',
        'js', 'mjs', 'jsp', 'asp', 'aspx', 'htm', 'html', 'xhtml', 'svg', 'htaccess',
    ];

    /** Archives, acceptées seulement là où le besoin métier est démontré (Rapports, Fichiers). */
    private const ARCHIVES = [
        'zip' => ['application/zip', 'application/x-zip-compressed'],
        'rar' => ['application/vnd.rar', 'application/x-rar-compressed', 'application/x-rar'],
        '7z' => ['application/x-7z-compressed'],
    ];

    private bool $archives = false;

    private string $raison = 'type de fichier non autorisé';

    /** Documents de travail : PDF, images, bureautique (Word, Excel, PowerPoint, LibreOffice), texte. */
    public static function document(): self
    {
        return new self();
    }

    /** Documents de travail + archives (zip, rar, 7z) : Rapports et espace Fichiers. */
    public static function avecArchives(): self
    {
        $regle = new self();
        $regle->archives = true;

        return $regle;
    }

    /** @return array<string,array<int,string>> */
    public static function extensionsAutorisees(bool $archives = false): array
    {
        return $archives ? self::DOCUMENTS + self::ARCHIVES : self::DOCUMENTS;
    }

    public function passes($attribute, $value): bool
    {
        if (! $value instanceof UploadedFile || ! $value->isValid()) {
            return $this->refuser('fichier invalide');
        }

        $nom = (string) $value->getClientOriginalName();

        if ($nom === '' || preg_match('/[\x00-\x1F\x7F\/\\\\]/', $nom) === 1) {
            return $this->refuser('nom de fichier invalide');
        }

        $segments = explode('.', strtolower($nom));
        $extension = count($segments) > 1 ? array_pop($segments) : '';

        foreach ($segments as $segment) {
            if (in_array(trim($segment), self::EXTENSIONS_INTERDITES, true)) {
                return $this->refuser('nom de fichier suspect (extension exécutable)');
            }
        }

        $autorisees = self::extensionsAutorisees($this->archives);

        if (! array_key_exists($extension, $autorisees)) {
            return $this->refuser('type de fichier non autorisé');
        }

        // Fichier vide : aucun contenu à exécuter, accepté tel quel.
        if (@filesize($value->getPathname()) === 0) {
            return true;
        }

        // Contenu RÉEL (finfo sur le fichier), jamais le type annoncé par le client ni celui déduit du nom.
        try {
            $mime = (string) MimeTypes::getDefault()->guessMimeType($value->getPathname());
        } catch (\Throwable) {
            return $this->refuser('fichier illisible');
        }

        if (! in_array($mime, $autorisees[$extension], true)) {
            return $this->refuser('le contenu du fichier ne correspond pas à son extension');
        }

        return true;
    }

    public function message(): string
    {
        return "Le fichier :attribute est refusé : {$this->raison}. Formats acceptés : "
            .implode(', ', array_keys(self::extensionsAutorisees($this->archives))).'.';
    }

    private function refuser(string $raison): bool
    {
        $this->raison = $raison;

        return false;
    }
}
