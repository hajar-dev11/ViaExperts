<?php

namespace App\Modules\Facturation\Services;

use App\Modules\Facturation\Contracts\StatistiquesDocuments;
use App\Modules\Facturation\Models\DocumentCommercial;

/** Implémentation du contrat {@see StatistiquesDocuments} : les 4 comptages qui se trouvaient dans ArchiveController. */
class StatistiquesDocumentsEloquent implements StatistiquesDocuments
{
    public function compterParType(string $statut): array
    {
        return [
            'facture' => DocumentCommercial::where('type', 'facture')->where('status', $statut)->count(),
            'devis' => DocumentCommercial::where('type', 'devis')->where('status', $statut)->count(),
            'bl' => DocumentCommercial::where('type', 'bl')->where('status', $statut)->count(),
            'avoir' => DocumentCommercial::where('type', 'avoir')->where('status', $statut)->count(),
        ];
    }
}
