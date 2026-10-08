<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Politique unique des mots de passe (création de compte, changement, réinitialisation) :
 *   - au moins 12 caractères ;
 *   - au moins une lettre et au moins un chiffre ;
 *   - pas une suite d'un seul caractère répété.
 *
 * Les comptes existants ne sont PAS touchés : la règle ne s'applique qu'au moment où un mot de passe est défini.
 * La connexion, elle, n'applique aucune règle (un ancien mot de passe plus court reste utilisable tel quel).
 */
class MotDePasseFort implements ValidationRule
{
    public const LONGUEUR_MINIMALE = 12;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $mot = (string) $value;

        if (mb_strlen($mot) < self::LONGUEUR_MINIMALE) {
            $fail('Le mot de passe doit comporter au moins '.self::LONGUEUR_MINIMALE.' caractères.');

            return;
        }

        if (! preg_match('/\p{L}/u', $mot) || ! preg_match('/\p{N}/u', $mot)) {
            $fail('Le mot de passe doit contenir au moins une lettre et au moins un chiffre.');

            return;
        }

        if (mb_strlen(count_chars($mot, 3)) < 4) {
            $fail('Ce mot de passe est trop prévisible : utilisez des caractères plus variés.');
        }
    }
}
