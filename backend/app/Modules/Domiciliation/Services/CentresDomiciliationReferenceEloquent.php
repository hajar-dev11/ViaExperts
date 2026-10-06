<?php

namespace App\Modules\Domiciliation\Services;

use App\Modules\Domiciliation\Contracts\CentresDomiciliationReference;
use App\Modules\Domiciliation\Models\CentreDomiciliation;

/**
 * Implémentation du contrat {@see CentresDomiciliationReference} : les deux requêtes que Parties faisait directement sur
 * `CentreDomiciliation` (résolution par nom dans EntrepriseController, relation `centreDomiciliation` pour l'affichage).
 */
class CentresDomiciliationReferenceEloquent implements CentresDomiciliationReference
{
    public function idParNom(string $nom): ?int
    {
        $id = CentreDomiciliation::where('nom', $nom)->value('id');

        return $id === null ? null : (int) $id;
    }

    public function nomsParIds(array $ids): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));

        if ($ids === []) {
            return [];
        }

        return CentreDomiciliation::whereIn('id', $ids)->pluck('nom', 'id')->all();
    }
}
