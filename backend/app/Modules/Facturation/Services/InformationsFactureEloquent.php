<?php

namespace App\Modules\Facturation\Services;

use App\Modules\Facturation\Contracts\InformationsFacture;
use App\Modules\Facturation\Models\DocumentCommercial;

/** Implémentation du contrat {@see InformationsFacture}. `withTrashed()` : même périmètre que {@see FactureExisteEloquent}. */
class InformationsFactureEloquent implements InformationsFacture
{
    public function typeEtTiers(int $documentId): ?array
    {
        $document = DocumentCommercial::withTrashed()->select(['id', 'type', 'party_id'])->find($documentId);

        return $document ? ['type' => (string) $document->type, 'party_id' => (int) $document->party_id] : null;
    }
}
