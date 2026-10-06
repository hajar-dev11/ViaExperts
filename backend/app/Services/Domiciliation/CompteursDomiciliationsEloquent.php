<?php

namespace App\Services\Domiciliation;

use App\Contracts\Domiciliation\CompteursDomiciliations;
use App\Models\Domiciliation;

/** Implémentation du contrat {@see CompteursDomiciliations} : le comptage qui se trouvait dans ArchiveController. */
class CompteursDomiciliationsEloquent implements CompteursDomiciliations
{
    public function compterParStatut(string $statut): int
    {
        return Domiciliation::where('status', $statut)->count();
    }
}
