<?php

namespace App\Modules\Domiciliation\Services;

use App\Modules\Domiciliation\Models\Domiciliation;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Règles de cohérence des PÉRIODES de domiciliation d'une même entreprise (côté serveur, jamais seulement côté écran).
 *
 *   • Une entreprise ne peut pas avoir deux périodes ACTIVES qui se chevauchent.
 *     « Active » = période `actif` (ni archivée ni en corbeille) dont l'état n'est pas « résilié ».
 *     Une `date_fin` vide est une période sans échéance : elle couvre tout ce qui suit sa date de départ.
 *     Les bornes sont inclusives (une période qui démarre le jour de la fin de la précédente chevauche d'un jour).
 *   • Toute écriture de période d'une entreprise est sérialisée par un verrou sur la ligne de l'entreprise
 *     (`verrouillerEntreprise`) : deux requêtes simultanées (double-clic, deux onglets) ne peuvent pas passer le contrôle
 *     « rien ne chevauche » en même temps puis créer chacune leur période.
 *
 * À appeler DANS une transaction : le verrou est relâché à la fin de celle-ci.
 */
class PeriodesDomiciliation
{
    /** Sérialise les écritures de périodes de cette entreprise (verrou de ligne jusqu'à la fin de la transaction). */
    public static function verrouillerEntreprise(int ...$entrepriseIds): void
    {
        $ids = array_values(array_unique($entrepriseIds));
        sort($ids); // ordre constant : pas d'interblocage entre deux transactions qui verrouillent les mêmes entreprises

        foreach ($ids as $id) {
            DB::table('entreprises')->where('party_id', $id)->lockForUpdate()->first();
        }
    }

    /** Première période active de l'entreprise qui chevauche [$depart ; $fin], ou null. */
    public static function periodeChevauchante(int $entrepriseId, string $depart, ?string $fin, ?int $ignorerId = null): ?Domiciliation
    {
        $query = Domiciliation::query()
            ->where('entreprise_id', $entrepriseId)
            ->where('status', 'actif')
            ->where(fn ($q) => $q->whereNull('etat')->orWhere('etat', '!=', 'resilie'))
            ->whereDate('date_depart', '<=', $fin ?? '9999-12-31')
            ->where(fn ($q) => $q->whereNull('date_fin')->orWhereDate('date_fin', '>=', $depart))
            ->orderBy('date_depart');

        if ($ignorerId !== null) {
            $query->where('id', '!=', $ignorerId);
        }

        return $query->first();
    }

    /**
     * Refuse (422) une période qui chevaucherait une période active existante de l'entreprise.
     *
     * @throws ValidationException
     */
    public static function verifierAbsenceDeChevauchement(int $entrepriseId, string $depart, ?string $fin, ?int $ignorerId = null): void
    {
        $depart = self::jour($depart);
        $fin = $fin !== null && $fin !== '' ? self::jour($fin) : null;

        $existante = self::periodeChevauchante($entrepriseId, $depart, $fin, $ignorerId);
        if ($existante === null) {
            return;
        }

        $debut = $existante->date_depart?->format('d/m/Y');
        $echeance = $existante->date_fin?->format('d/m/Y') ?? 'sans date de fin';

        throw ValidationException::withMessages([
            'date_depart' => [
                "Cette période chevauche une période de domiciliation déjà active pour cette entreprise (du {$debut} au {$echeance}). "
                .'Choisissez des dates qui ne se recoupent pas.',
            ],
        ]);
    }

    /** La période peut-elle compter parmi les périodes actives (donc bloquer les autres) ? */
    public static function estBloquante(Domiciliation $d): bool
    {
        return $d->status === 'actif' && $d->etat !== 'resilie';
    }

    private static function jour(string $date): string
    {
        return Carbon::parse($date)->toDateString();
    }
}
