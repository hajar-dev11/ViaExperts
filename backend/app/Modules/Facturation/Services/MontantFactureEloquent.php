<?php

namespace App\Modules\Facturation\Services;

use App\Modules\Facturation\Contracts\MontantFacture;
use App\Modules\Facturation\Models\DocumentCommercial;

/** Implémentation du contrat {@see MontantFacture}. */
class MontantFactureEloquent implements MontantFacture
{
    public function totalTtc(int $documentId): ?float
    {
        $document = DocumentCommercial::withTrashed()->find($documentId);

        return $document ? round((float) $document->total_ttc, 2) : null;
    }

    public function prixPaye(int $documentId): ?float
    {
        $document = DocumentCommercial::withTrashed()->find($documentId);

        return $document ? round((float) $document->prix_paye, 2) : null;
    }
}