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
 *     Le contrôle ne porte QUE sur l'entreprise concernée (`entreprise_id` = `entreprises.party_id`) : deux entreprises
 *     différentes peuvent avoir exactement les mêmes dates. Une nouvelle tentative identique à une période déjà enregistrée
 *     (même entreprise, mêmes dates, même centre) reçoit un message dédié et n'ajoute rien.
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

    /**
     * Périodes ACTIVES de l'entreprise (identifiant stable `entreprises.party_id`, jamais le nom ni la date seule).
     * Une ancienne ligne dont la fin précède le départ (donnée incohérente) n'est pas une vraie période : elle ne bloque rien.
     */
    private static function periodesActives(int $entrepriseId, ?int $ignorerId)
    {
        $query = Domiciliation::query()
            ->where('entreprise_id', $entrepriseId)
            ->where('status', 'actif')
            ->where(fn ($q) => $q->whereNull('etat')->orWhere('etat', '!=', 'resilie'))
            ->whereNotNull('date_depart')
            ->where(fn ($q) => $q->whereNull('date_fin')->orWhereColumn('date_fin', '>=', 'date_depart'));

        if ($ignorerId !== null) {
            $query->where('id', '!=', $ignorerId);
        }

        return $query;
    }

    /** Première période active de l'entreprise qui chevauche [$depart ; $fin], ou null. Bornes inclusives. */
    public static function periodeChevauchante(int $entrepriseId, string $depart, ?string $fin, ?int $ignorerId = null): ?Domiciliation
    {
        return self::periodesActives($entrepriseId, $ignorerId)
            ->whereDate('date_depart', '<=', $fin ?? '9999-12-31')
            ->where(fn ($q) => $q->whereNull('date_fin')->orWhereDate('date_fin', '>=', $depart))
            ->orderBy('date_depart')
            ->first();
    }

    /**
     * Période active IDENTIQUE (même entreprise, mêmes dates, même centre) : c'est ce que produit une nouvelle tentative
     * (double clic, réponse perdue) après un premier enregistrement réussi — pas un vrai conflit de dates.
     */
    public static function periodeIdentique(int $entrepriseId, string $depart, ?string $fin, ?int $centreId = null): ?Domiciliation
    {
        $query = self::periodesActives($entrepriseId, null)->whereDate('date_depart', $depart);

        $fin === null ? $query->whereNull('date_fin') : $query->whereDate('date_fin', $fin);

        if ($centreId !== null) {
            $query->where('centre_domiciliation_id', $centreId);
        }

        return $query->orderBy('id')->first();
    }

    /**
     * Refuse (422) une période qui chevaucherait une période active existante de l'entreprise.
     * Une nouvelle tentative identique à une période déjà enregistrée reçoit un message dédié (et n'ajoute rien).
     *
     * @throws ValidationException
     */
    public static function verifierAbsenceDeChevauchement(int $entrepriseId, string $depart, ?string $fin, ?int $ignorerId = null, ?int $centreId = null, bool $detecterDoublon = false): void
    {
        $depart = self::jour($depart);
        $fin = $fin !== null && $fin !== '' ? self::jour($fin) : null;

        if ($detecterDoublon) {
            $identique = self::periodeIdentique($entrepriseId, $depart, $fin, $centreId);
            if ($identique !== null) {
                throw ValidationException::withMessages([
                    'date_depart' => [
                        "Cette domiciliation est déjà enregistrée pour {$identique->entreprise?->denomination} (n° {$identique->id}, du "
                        .$identique->date_depart?->format('d/m/Y').' au '.($identique->date_fin?->format('d/m/Y') ?? 'sans date de fin')
                        .') : elle n\'a pas été ajoutée une seconde fois. Actualisez la liste pour la consulter.',
                    ],
                ]);
            }
        }

        $existante = self::periodeChevauchante($entrepriseId, $depart, $fin, $ignorerId);
        if ($existante === null) {
            return;
        }

        $debut = $existante->date_depart?->format('d/m/Y');
        $echeance = $existante->date_fin?->format('d/m/Y') ?? 'sans date de fin';
        $nom = $existante->entreprise?->denomination;
        $pour = $nom !== null && $nom !== '' ? "l'entreprise « {$nom} »" : 'cette entreprise';

        throw ValidationException::withMessages([
            'date_depart' => [
                "Cette période chevauche une période de domiciliation déjà active pour {$pour} (du {$debut} au {$echeance}). "
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
