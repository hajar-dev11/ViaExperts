<?php

namespace App\Modules\Facturation\Services;

use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Modules\Facturation\Models\DocumentCommercial;
use Illuminate\Support\Collection;

/** Implémentation du contrat {@see FacturesDisponibles} : la requête qui se trouvait dans PaiementController. */
class FacturesDisponiblesEloquent implements FacturesDisponibles
{
    public function lister(): Collection
    {
        return DocumentCommercial::with(['client', 'entreprise'])
            ->type('facture')
            ->status('actif')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($d) => [
                'id' => $d->id,
                'numero' => $d->numero,
                'tiers' => $d->tiers_nom,
                'partyId' => $d->party_id,
                'totalTtc' => $d->total_ttc,
                'prixPaye' => $d->prix_paye,
                'prixRestant' => $d->prix_restant,
            ]);
    }
}
