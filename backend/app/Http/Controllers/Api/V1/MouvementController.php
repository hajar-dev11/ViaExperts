<?php

namespace App\Http\Controllers\Api\V1;

use App\Modules\Facturation\Contracts\FacturesPourMouvements;
use App\Http\Controllers\Controller;
use App\Models\Paiement;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class MouvementController extends Controller
{
    public function __construct(private FacturesPourMouvements $factures)
    {
    }

    /**
     * Module Mouvement — deux vues d'AGRÉGATION, sans table dédiée :
     *   - Entrés (Reçu)     : agrège les paiements       (permission mouvement_entres_recu)
     *   - Entrés (Facturé)  : agrège les factures        (permission mouvement_entres_facture)
     *
     * Filtres communs aux 2 captures : plage de dates, année et trimestre.
     */
    private function appliquerFiltres(Builder $query, Request $request, string $colonneDate): Builder
    {
        if ($debut = $request->query('date_debut')) {
            $query->whereDate($colonneDate, '>=', $debut);
        }

        if ($fin = $request->query('date_fin')) {
            $query->whereDate($colonneDate, '<=', $fin);
        }

        if (($annee = $request->query('annee')) !== null && $annee !== '') {
            $query->whereYear($colonneDate, (int) $annee);
        }

        // Trimestre 1 à 4 → intervalle de mois correspondant.
        if (($trimestre = $request->query('trimestre')) !== null && $trimestre !== '') {
            $t = max(1, min(4, (int) $trimestre));
            $query->whereRaw("QUARTER({$colonneDate}) = ?", [$t]);
        }

        return $query;
    }

    public function recu(Request $request)
    {
        abort_unless($request->user()->hasPermission('mouvement', 'mouvement_entres_recu'), 403);

        $paiements = $this->appliquerFiltres(
            Paiement::with(['client', 'entreprise', 'lignes'])->status('actif'),
            $request,
            'date_operation'
        )->orderByDesc('id')->get();

        $total = $paiements->sum(fn ($p) => (float) $p->total);
        $paye = $paiements->sum(fn ($p) => (float) $p->prix_paye);

        return response()->json([
            'totaux' => [
                'montantRestante' => number_format($total - $paye, 2, '.', ''),
                'montantPaye' => number_format($paye, 2, '.', ''),
                'montantTotal' => number_format($total, 2, '.', ''),
            ],
            'lignes' => $paiements->map(fn ($p) => [
                'id' => $p->id,
                'reference' => $p->reference,
                'responsable' => $p->responsable,
                'clientId' => $p->client->party_id ?? null,
                'entrepriseId' => $p->entreprise->party_id ?? null,
                'client' => $p->tiers_nom,
                'prixTotal' => $p->total,
                'prixPaye' => $p->prix_paye,
                'prixRestant' => $p->prix_restant,
                'dateOperation' => optional($p->date_operation)->toDateString(),
                'dateCredit' => optional($p->date_credit)->toDateString(),
                'regle' => (float) $p->prix_restant <= 0,
            ]),
            'annees' => $this->anneesDisponibles(Paiement::class, 'date_operation'),
        ]);
    }

    public function facture(Request $request)
    {
        abort_unless($request->user()->hasPermission('mouvement', 'mouvement_entres_facture'), 403);

        // Les factures viennent du contrat de Facturation (mêmes filtres de période) ; les totaux restent calculés ici.
        $factures = collect($this->factures->entrees(array_intersect_key($request->query(), array_flip(['date_debut', 'date_fin', 'annee', 'trimestre']))));

        return response()->json([
            'totaux' => [
                'montantTotal' => number_format($factures->sum(fn ($f) => (float) $f['totalTtc']), 2, '.', ''),
                'montantHt' => number_format($factures->sum(fn ($f) => (float) $f['totalHt']), 2, '.', ''),
                'montantPaye' => number_format($factures->sum(fn ($f) => (float) $f['prixPaye']), 2, '.', ''),
            ],
            'lignes' => $factures,
            'annees' => $this->factures->anneesDisponibles(),
        ]);
    }

    /** Années réellement présentes en base, pour alimenter le sélecteur. */
    private function anneesDisponibles(string $modele, string $colonne): array
    {
        return $modele::selectRaw("DISTINCT YEAR({$colonne}) as annee")
            ->orderByDesc('annee')
            ->pluck('annee')
            ->filter()
            ->values()
            ->all();
    }
}
