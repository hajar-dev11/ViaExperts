<?php

namespace App\Modules\Domiciliation\Services;

use App\Support\ArrondiPrix;

/**
 * Règle de calcul du prix d'une domiciliation (HT) — la MÊME que le frontend (`calculerPrixTotal`) :
 *
 *   • durée du contrat  = mois payés + mois gratuits  → sert uniquement à la date de fin ;
 *   • mois facturables  = mois payés                  → les mois gratuits ne sont JAMAIS facturés ;
 *   • prix par mois     = EXACT, au centime (104,17 reste 104,17 : prix par défaut d'une domiciliation) ;
 *   • prix total        = prix par mois × mois payés, puis arrondi à l'entier par la règle de {@see ArrondiPrix}
 *                         (partie décimale < 0,50 → inférieur, ≥ 0,50 → supérieur : 104,17 × 12 = 1 250,04 → 1 250).
 *
 * Le PRIX TOTAL est modifiable à la main dans le formulaire : une valeur saisie est enregistrée telle quelle (arrondie à
 * l'entier), jamais recalculée par le serveur. Le serveur ne calcule le total que si aucun n'est fourni.
 * Les montants DÉJÀ enregistrés ne sont jamais recalculés d'office (voir `totalSiChange`).
 */
class PrixDomiciliation
{
    /** Prix par mois au centime : « 104.17 ». */
    public static function exact(float|int|string|null $prix): string
    {
        return number_format(round((float) $prix, 2), 2, '.', '');
    }

    /** Prix total « 1250.00 » : prix par mois exact × mois facturables (= mois payés), arrondi à l'entier. */
    public static function total(float|int|string $prixParMois, int $moisPayes): string
    {
        $mois = max(0, $moisPayes);

        return ArrondiPrix::decimal(round((float) $prixParMois * $mois, 2));
    }

    /** Prix par mois ramené au centime ; prix total arrondi à l'entier — quand ils sont fournis. */
    public static function arrondir(array $donnees): array
    {
        $fourni = fn (string $champ) => array_key_exists($champ, $donnees) && $donnees[$champ] !== null && $donnees[$champ] !== '';

        if ($fourni('prix_par_mois')) {
            $donnees['prix_par_mois'] = self::exact($donnees['prix_par_mois']);
        }
        if ($fourni('prix_total')) {
            $donnees['prix_total'] = ArrondiPrix::decimal($donnees['prix_total']);
        }

        return $donnees;
    }

    /**
     * Création / renouvellement : prix normalisés, et total calculé SEULEMENT si aucun total n'est fourni (le total saisi
     * à la main est conservé).
     */
    public static function avecTotal(array $donnees): array
    {
        $donnees = self::arrondir($donnees);

        $aTotal = array_key_exists('prix_total', $donnees) && $donnees['prix_total'] !== null && $donnees['prix_total'] !== '';
        $aPrix = array_key_exists('prix_par_mois', $donnees) && $donnees['prix_par_mois'] !== null && $donnees['prix_par_mois'] !== '';
        if (! $aTotal && $aPrix) {
            $donnees['prix_total'] = self::total($donnees['prix_par_mois'], (int) ($donnees['mois_payee'] ?? 0));
        }

        return $donnees;
    }

    /**
     * Nouveau total à enregistrer lors d'une MODIFICATION qui ne fournit pas de total, ou null si le montant existant doit
     * rester tel quel. Le total n'est recalculé que si le prix par mois ou les mois payés changent réellement : enregistrer
     * une fiche sans toucher à ces valeurs ne réécrit pas un montant historique (calculé autrefois avec une autre règle).
     *
     * @param  array<string, mixed>  $donnees  champs validés de la requête
     */
    public static function totalSiChange(array $donnees, float|int|string|null $prixActuel, int $moisPayesActuels): ?string
    {
        $prix = array_key_exists('prix_par_mois', $donnees) ? $donnees['prix_par_mois'] : $prixActuel;
        $mois = array_key_exists('mois_payee', $donnees) ? (int) $donnees['mois_payee'] : $moisPayesActuels;

        if ($prix === null || $prix === '') {
            return null;
        }

        $prixChange = self::exact($prix) !== self::exact($prixActuel ?? 0);
        if (! $prixChange && $mois === $moisPayesActuels) {
            return null;
        }

        return self::total($prix, $mois);
    }
}