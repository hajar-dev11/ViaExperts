<?php

namespace App\Services\Facturation;

use App\Contracts\Facturation\SynchronisationPaiements;
use App\Models\DocumentCommercial;

/** Implémentation du contrat {@see SynchronisationPaiements} : l'écriture de `prix_paye` qui se trouvait dans Paiement. */
class SynchronisationPaiementsEloquent implements SynchronisationPaiements
{
    public function appliquerTotalPaye(?int $documentId, float $totalPaiementsActifs): void
    {
        if (! $documentId) {
            return;
        }

        $document = DocumentCommercial::find($documentId);

        if (! $document) {
            return;
        }

        $document->forceFill(['prix_paye' => round($totalPaiementsActifs, 2)])->save();
    }
}
