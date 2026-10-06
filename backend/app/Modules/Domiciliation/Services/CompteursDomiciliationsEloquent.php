<?php

namespace App\Modules\Domiciliation\Services;

use App\Modules\Domiciliation\Contracts\CompteursDomiciliations;
use App\Modules\Domiciliation\Models\Domiciliation;

/** Implémentation du contrat {@see CompteursDomiciliations} : le comptage qui se trouvait dans ArchiveController. */
class CompteursDomiciliationsEloquent implements CompteursDomiciliations
{
    public function compterParStatut(string $statut): int
    {
        return Domiciliation::where('status', $statut)->count();
    }
}
