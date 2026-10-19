<?php

namespace App\Rules;

use App\Models\Entreprise;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Dénomination unique d'une entreprise, sans tenir compte de la casse, des accents ni des espaces superflus
 * (« Société X » et « societe  x » désignent la même entreprise).
 *
 * Création : aucune entreprise ne doit déjà porter ce nom. Modification : l'entreprise elle-même n'est jamais un doublon ; et si
 * sa dénomination n'a PAS changé, elle n'est pas contrôlée — une entreprise qui figure déjà en double (données anciennes)
 * reste modifiable (autres champs) sans être bloquée par un doublon qu'elle n'a pas créé.
 */
class DenominationEntrepriseUnique implements ValidationRule
{
    public function __construct(private readonly ?Entreprise $courante = null)
    {
    }

    public static function normaliser(?string $nom): string
    {
        return mb_strtolower(preg_replace('/\s+/u', ' ', trim((string) $nom)));
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $nom = trim((string) $value);
        if ($nom === '') {
            return;
        }

        if ($this->courante !== null && self::normaliser($this->courante->denomination) === self::normaliser($nom)) {
            return;
        }

        // La collation de la base (utf8mb4_unicode_ci) ignore déjà casse et accents ; TRIM et REPLACE (répété, donc portable
        // sur MySQL comme MariaDB) neutralisent les espaces de bord et les espaces multiples.
        $existe = Entreprise::query()
            ->whereRaw("REPLACE(REPLACE(REPLACE(TRIM(denomination), '  ', ' '), '  ', ' '), '  ', ' ') = ?", [preg_replace('/\s+/u', ' ', $nom)])
            ->when($this->courante, fn ($q) => $q->where('party_id', '!=', $this->courante->party_id))
            ->exists();

        if ($existe) {
            $fail('Une entreprise avec cette dénomination existe déjà.');
        }
    }
}
