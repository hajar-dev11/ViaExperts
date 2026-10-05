<?php

namespace App\Services\Facturation;

use App\Contracts\Facturation\FacturesPourMouvements;
use App\Models\DocumentCommercial;

/**
 * Implémentation du contrat {@see FacturesPourMouvements} : la requête et le filtrage par période qui se trouvaient dans
 * MouvementController (les mêmes filtres, sur `date_document`).
 */
class FacturesPourMouvementsEloquent implements FacturesPourMouvements
{
    public function entrees(array $periode): array
    {
        $query = DocumentCommercial::with(['client', 'entreprise'])->type('facture')->status('actif');

        if ($debut = $periode['date_debut'] ?? null) {
            $query->whereDate('date_document', '>=', $debut);
        }

        if ($fin = $periode['date_fin'] ?? null) {
            $query->whereDate('date_document', '<=', $fin);
        }

        if (($annee = $periode['annee'] ?? null) !== null && $annee !== '') {
            $query->whereYear('date_document', (int) $annee);
        }

        // Trimestre 1 à 4 → intervalle de mois correspondant.
        if (($trimestre = $periode['trimestre'] ?? null) !== null && $trimestre !== '') {
            $t = max(1, min(4, (int) $trimestre));
            $query->whereRaw('QUARTER(date_document) = ?', [$t]);
        }

        return $query->orderByDesc('id')->get()->map(fn ($f) => [
            'id' => $f->id,
            'numero' => $f->numero,
            'responsable' => $f->responsable,
            'clientId' => $f->client->party_id ?? null,
            'entrepriseId' => $f->entreprise->party_id ?? null,
            'client' => $f->tiers_nom,
            'dateDocument' => optional($f->date_document)->toDateString(),
            'totalHt' => $f->total_ht,
            'totalTtc' => $f->total_ttc,
            'prixPaye' => $f->prix_paye,
            'prixRestant' => $f->prix_restant,
        ])->all();
    }

    public function anneesDisponibles(): array
    {
        return DocumentCommercial::selectRaw('DISTINCT YEAR(date_document) as annee')
            ->orderByDesc('annee')
            ->pluck('annee')
            ->filter()
            ->values()
            ->all();
    }
}
