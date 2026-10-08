<?php

namespace App\Support;

use Closure;
use Illuminate\Support\Facades\DB;

/**
 * Exclusion mutuelle des écritures qui touchent au MONTANT PAYÉ d'une facture (verrou nommé MySQL, partagé entre processus).
 *
 * Les créations / modifications / restaurations de paiements et les modifications de facture (lignes, montant payé) passent
 * toutes par ce même verrou : un paiement et une modification de facture simultanés ne peuvent donc pas se croiser, et le
 * contrôle « total payé ≤ TTC » est évalué sur l'état réel de cet instant. La section critique est courte ; le verrou est
 * toujours relâché.
 */
class VerrouPaiements
{
    public const NOM = 'via_experts.paiements.creation';

    public static function executer(Closure $operation): mixed
    {
        if ((int) (DB::selectOne('SELECT GET_LOCK(?, 20) AS ok', [self::NOM])->ok ?? 0) !== 1) {
            abort(503, 'Le serveur est occupé, veuillez réessayer dans un instant.');
        }

        try {
            return $operation();
        } finally {
            DB::select('SELECT RELEASE_LOCK(?)', [self::NOM]);
        }
    }
}
