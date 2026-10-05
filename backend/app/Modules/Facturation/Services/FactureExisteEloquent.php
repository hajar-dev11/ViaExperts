<?php

namespace App\Modules\Facturation\Services;

use App\Modules\Facturation\Contracts\FactureExiste;
use App\Modules\Facturation\Models\DocumentCommercial;

/**
 * Implémentation du contrat {@see FactureExiste}. `withTrashed()` est INDISPENSABLE : l'ancienne règle
 * `exists:documents_commerciaux,id` ne tenait pas compte de la suppression douce.
 */
class FactureExisteEloquent implements FactureExiste
{
    public function existe(int $documentId): bool
    {
        return DocumentCommercial::withTrashed()->whereKey($documentId)->exists();
    }
}
