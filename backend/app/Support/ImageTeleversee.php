<?php

namespace App\Support;

/**
 * Règles et messages (en français) des images téléversées dans les paramètres : photo de profil, logos et signatures.
 *
 * La taille de 2 Mo correspond à la limite habituelle de PHP (`upload_max_filesize`) : au-delà, PHP écarte le fichier
 * avant même que Laravel ne le voie. Le frontend réduit automatiquement les images (voir `utils/images.js`) pour rester
 * très en dessous ; ces règles protègent le serveur et fournissent des messages utiles si elles sont tout de même dépassées.
 */
final class ImageTeleversee
{
    public const TAILLE_MAX_KO = 2048;

    /** @return array<int, string> */
    public static function regles(): array
    {
        return ['required', 'image', 'mimes:jpg,jpeg,png,gif', 'max:'.self::TAILLE_MAX_KO];
    }

    /** @return array<string, string> */
    public static function messages(string $champ = 'file'): array
    {
        $mo = self::TAILLE_MAX_KO / 1024;

        return [
            "{$champ}.required" => "Aucune image n'a été reçue par le serveur : elle dépasse peut-être la taille acceptée ({$mo} Mo maximum).",
            "{$champ}.uploaded" => "L'envoi de l'image a échoué (fichier trop volumineux pour le serveur ou envoi interrompu). Choisissez une image de {$mo} Mo maximum.",
            "{$champ}.image" => "Le fichier choisi n'est pas une image valide.",
            "{$champ}.mimes" => 'Format non pris en charge : utilisez une image JPG, PNG ou GIF.',
            "{$champ}.max" => "L'image dépasse {$mo} Mo. Choisissez une image plus légère.",
        ];
    }
}
