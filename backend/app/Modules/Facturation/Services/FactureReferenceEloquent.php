<?php

namespace App\Modules\Facturation\Services;

use App\Modules\Facturation\Contracts\FactureReference;
use App\Modules\Facturation\Models\DocumentCommercial;

/** Implémentation du contrat {@see FactureReference} : le numéro que Paiements lisait via la relation `document`. */
class FactureReferenceEloquent implements FactureReference
{
    public function numeros(array $documentIds): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $documentIds))));

        if ($ids === []) {
            return [];
        }

        return DocumentCommercial::whereIn('id', $ids)->pluck('numero', 'id')->all();
    }
}
