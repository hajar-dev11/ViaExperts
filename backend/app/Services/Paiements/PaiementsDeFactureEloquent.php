<?php

namespace App\Services\Paiements;

use App\Contracts\Paiements\PaiementsDeFacture;
use App\Models\Paiement;

/** Implémentation du contrat {@see PaiementsDeFacture}. */
class PaiementsDeFactureEloquent implements PaiementsDeFacture
{
    public function totalActifs(int $documentId): float
    {
        return round((float) Paiement::where('document_id', $documentId)->where('status', 'actif')->sum('prix_paye'), 2);
    }

    public function nombreActifs(int $documentId): int
    {
        return Paiement::where('document_id', $documentId)->where('status', 'actif')->count();
    }
}
