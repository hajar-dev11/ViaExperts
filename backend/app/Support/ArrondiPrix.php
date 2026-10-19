<?php

namespace App\Support;

/**
 * Règle d'arrondi du PRIX TOTAL — la même que le frontend (`utils/arrondi.js`) :
 *
 *   • partie décimale < 0,50   → entier inférieur   (1 250,49 → 1 250)
 *   • partie décimale ≥ 0,50   → entier supérieur   (1 250,50 → 1 251 ; 1 250,75 → 1 251)
 *   • un total déjà entier ne change pas            (1 250,00 → 1 250)
 *
 * Elle s'applique UNIQUEMENT à : le prix total de domiciliation et le total HT d'un document (TVA et TTC calculés ensuite
 * sur ce total). Les prix unitaires (service, ligne de document ou de paiement, prix par mois de domiciliation), les
 * quantités, les montants de ligne et le total d'un PAIEMENT (somme exacte de ses lignes) gardent leurs centimes.
 *
 * Elle n'est appliquée qu'à l'ENREGISTREMENT : les montants déjà enregistrés ne sont jamais réécrits.
 */
class ArrondiPrix
{
    /** Prix entier (« demi vers le haut »). Les centimes sont d'abord fixés (« 100,495 » → 100,50) pour éviter le bruit des flottants. */
    public static function entier(float|int|string|null $prix): int
    {
        if ($prix === null || $prix === '') {
            return 0;
        }

        return (int) round(round((float) $prix, 2), 0, PHP_ROUND_HALF_UP);
    }

    /** Montant en CENTIMES entiers (demi vers le haut), sans erreur de flottant : 625,02 → 62502. */
    public static function centimes(float|int|string|null $montant): int
    {
        return (int) floor(((float) $montant) * 100 + 0.5);
    }

    /** Montant en centimes arrondi à l'entier de Dh (règle du demi) : 62502 → 62500 ; 62550 → 62600. */
    public static function centimesEnEntier(int $centimes): int
    {
        return (int) (floor(($centimes + 50) / 100) * 100);
    }

    /**
     * Totaux d'un document : le TOTAL HT est arrondi à l'entier (règle du demi), les prix unitaires et les lignes gardent
     * leurs centimes. TVA calculée sur le total HT arrondi (proportionnellement aux taux des lignes), TTC = HT + TVA.
     * Même calcul que le frontend (`utils/arrondi.js`, `totauxDocument`).
     *
     * @param  iterable<array{brut: float|int|string, remise: float|int|string, tva_pourcent: float|int|string}>  $lignes  montants en Dh
     * @return array{total_ht: float, total_remise: float, total_net_ht: float, total_tva: float, total_ttc: float}
     */
    public static function totauxDocument(iterable $lignes): array
    {
        $remiseC = 0;
        $netC = 0;
        $tvaBruteC = 0.0;

        foreach ($lignes as $l) {
            $brutC = self::centimes($l['brut']);
            $remC = min(max(self::centimes($l['remise']), 0), $brutC);
            $ligneNetC = $brutC - $remC;

            $remiseC += $remC;
            $netC += $ligneNetC;
            $tvaBruteC += $ligneNetC * ((float) $l['tva_pourcent'] / 100);
        }

        $netArrondiC = self::centimesEnEntier($netC);
        $tvaC = $netC > 0 ? (int) floor($tvaBruteC * $netArrondiC / $netC + 0.5) : 0;

        return [
            'total_ht' => ($netArrondiC + $remiseC) / 100.0,
            'total_remise' => $remiseC / 100.0,
            'total_net_ht' => $netArrondiC / 100.0,
            'total_tva' => $tvaC / 100.0,
            'total_ttc' => ($netArrondiC + $tvaC) / 100.0,
        ];
    }

    /** Même arrondi, au format d'une colonne `decimal(…,2)` : « 104.00 ». */
    public static function decimal(float|int|string|null $prix): string
    {
        return number_format(self::entier($prix), 2, '.', '');
    }
}
