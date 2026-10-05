<?php

namespace Tests\Support;

use PHPUnit\Framework\Assert;

/**
 * Instantanés « golden file » pour détecter une régression pendant la migration Modular Monolith.
 *
 * - Le fichier de référence est versionné dans `tests/Snapshots/`.
 * - Test normal : le résultat courant doit être IDENTIQUE au fichier de référence.
 * - Régénération volontaire (après un changement assumé) :
 *       UPDATE_SNAPSHOTS=1 php artisan test --filter=Snapshot
 *   puis relire le diff Git avant de commiter.
 * - Si le fichier n'existe pas encore, il est créé et le test échoue une fois pour obliger
 *   à relire et commiter la référence.
 */
final class Snapshot
{
    public static function assertMatches(string $nom, array $actuel): void
    {
        $chemin = base_path("tests/Snapshots/{$nom}.json");
        $json = json_encode($actuel, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";

        if (getenv('UPDATE_SNAPSHOTS') === '1') {
            self::ecrire($chemin, $json);
            Assert::assertTrue(true);

            return;
        }

        if (! file_exists($chemin)) {
            self::ecrire($chemin, $json);
            Assert::fail("Instantané « {$nom} » créé : relisez tests/Snapshots/{$nom}.json puis relancez les tests.");
        }

        Assert::assertSame(
            str_replace("\r\n", "\n", file_get_contents($chemin)),
            $json,
            "L'instantané « {$nom} » a changé. Si c'est voulu : UPDATE_SNAPSHOTS=1 php artisan test --filter=Snapshot, puis relire le diff Git."
        );
    }

    /**
     * Décrit la FORME d'une valeur JSON (clés triées + types), sans ses valeurs : insensible aux ids,
     * dates et montants, mais détecte une clé ajoutée, retirée, renommée ou un type modifié.
     */
    public static function forme(mixed $valeur): mixed
    {
        if (is_array($valeur)) {
            if (self::estListe($valeur)) {
                if ($valeur === []) {
                    return ['[]'];
                }
                // Union des formes de tous les éléments (une liste peut avoir des éléments partiellement nuls).
                $formes = array_map(fn ($v) => self::forme($v), $valeur);

                return ['[]', self::fusionner($formes)];
            }
            ksort($valeur);

            return array_map(fn ($v) => self::forme($v), $valeur);
        }

        return match (true) {
            is_null($valeur) => 'null',
            is_bool($valeur) => 'bool',
            is_int($valeur) => 'int',
            is_float($valeur) => 'float',
            default => 'string',
        };
    }

    /** Fusionne plusieurs formes : une clé présente dans au moins un élément est conservée. */
    private static function fusionner(array $formes): mixed
    {
        $assoc = array_filter($formes, fn ($f) => is_array($f) && ! self::estListe($f));
        if (count($assoc) === count($formes)) {
            $fusion = [];
            foreach ($formes as $f) {
                foreach ($f as $cle => $sous) {
                    // Une valeur « null » dans un élément est remplacée par la forme réelle d'un autre élément.
                    if (! array_key_exists($cle, $fusion) || $fusion[$cle] === 'null') {
                        $fusion[$cle] = $sous;
                    }
                }
            }
            ksort($fusion);

            return $fusion;
        }

        // Valeurs scalaires ou mélange : on garde la première forme non nulle.
        foreach ($formes as $f) {
            if ($f !== 'null') {
                return $f;
            }
        }

        return 'null';
    }

    /** array_is_list() n'existe qu'à partir de PHP 8.1 (le projet tourne en PHP 8.0). */
    private static function estListe(array $a): bool
    {
        return $a === [] || array_keys($a) === range(0, count($a) - 1);
    }

    private static function ecrire(string $chemin, string $json): void
    {
        if (! is_dir(dirname($chemin))) {
            mkdir(dirname($chemin), 0777, true);
        }
        file_put_contents($chemin, $json);
    }
}
