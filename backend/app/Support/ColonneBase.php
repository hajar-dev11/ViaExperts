<?php

namespace App\Support;

use Illuminate\Support\Facades\Schema;

/**
 * « Cette colonne existe-t-elle dans la base utilisée ? » — détection du schéma RÉEL, mémorisée pour la durée de la requête.
 *
 * Sert à écrire sans erreur SQL sur une base à laquelle une migration récente n'a pas encore été appliquée (poste local en
 * retard, serveur avant mise à jour). Le code qui s'en sert doit dire clairement ce qui est perdu ou refusé : jamais ignorer
 * silencieusement une donnée métier.
 */
class ColonneBase
{
    /** @var array<string, bool> */
    private static array $cache = [];

    public static function existe(string $table, string $colonne): bool
    {
        return self::$cache["{$table}.{$colonne}"] ??= Schema::hasColumn($table, $colonne);
    }

    /** Test seam : force (true / false) ou oublie (null) le résultat pour une colonne. */
    public static function forcer(string $table, string $colonne, ?bool $existe): void
    {
        if ($existe === null) {
            unset(self::$cache["{$table}.{$colonne}"]);

            return;
        }

        self::$cache["{$table}.{$colonne}"] = $existe;
    }
}
