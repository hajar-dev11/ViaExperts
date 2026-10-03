<?php

namespace App\Support;

/**
 * Générateur ZIP minimal, sans dépendance.
 *
 * L'extension PHP `zip` (ZipArchive) n'est pas activée dans le XAMPP du projet et
 * l'environnement ne doit pas être modifié. Cette classe écrit une archive au
 * format « stored » (sans compression), qui reste un .zip parfaitement valide,
 * ouvrable par l'Explorateur Windows, 7-Zip ou WinRAR.
 *
 * Suffisant pour l'export TVA : quelques fichiers texte de petite taille.
 */
class ZipSimple
{
    /** @var array<int, array{nom: string, contenu: string}> */
    private array $fichiers = [];

    public function ajouter(string $nom, string $contenu): self
    {
        $this->fichiers[] = ['nom' => $nom, 'contenu' => $contenu];

        return $this;
    }

    public function generer(): string
    {
        $entrees = '';
        $central = '';
        $decalage = 0;

        [$heure, $date] = $this->horodatageDos();

        foreach ($this->fichiers as $fichier) {
            $nom = $fichier['nom'];
            $contenu = $fichier['contenu'];
            $crc = crc32($contenu);
            $taille = strlen($contenu);

            // En-tête local : méthode 0 (stored), tailles compressée = non compressée.
            $enTete = "\x50\x4b\x03\x04"
                .pack('v', 20)          // version nécessaire
                .pack('v', 0)           // drapeaux
                .pack('v', 0)           // méthode : stored
                .pack('v', $heure)
                .pack('v', $date)
                .pack('V', $crc)
                .pack('V', $taille)
                .pack('V', $taille)
                .pack('v', strlen($nom))
                .pack('v', 0)
                .$nom;

            $entrees .= $enTete.$contenu;

            $central .= "\x50\x4b\x01\x02"
                .pack('v', 20)          // version d'écriture
                .pack('v', 20)          // version nécessaire
                .pack('v', 0)
                .pack('v', 0)
                .pack('v', $heure)
                .pack('v', $date)
                .pack('V', $crc)
                .pack('V', $taille)
                .pack('V', $taille)
                .pack('v', strlen($nom))
                .pack('v', 0)           // extra
                .pack('v', 0)           // commentaire
                .pack('v', 0)           // n° de disque
                .pack('v', 0)           // attributs internes
                .pack('V', 0)           // attributs externes
                .pack('V', $decalage)
                .$nom;

            $decalage += strlen($enTete) + $taille;
        }

        $nombre = count($this->fichiers);

        $fin = "\x50\x4b\x05\x06"
            .pack('v', 0)
            .pack('v', 0)
            .pack('v', $nombre)
            .pack('v', $nombre)
            .pack('V', strlen($central))
            .pack('V', $decalage)
            .pack('v', 0);

        return $entrees.$central.$fin;
    }

    /** Date/heure au format MS-DOS attendu par le format ZIP. */
    private function horodatageDos(): array
    {
        $t = getdate();

        $heure = ($t['hours'] << 11) | ($t['minutes'] << 5) | (intdiv($t['seconds'], 2));
        $date = (($t['year'] - 1980) << 9) | ($t['mon'] << 5) | $t['mday'];

        return [$heure, $date];
    }
}
