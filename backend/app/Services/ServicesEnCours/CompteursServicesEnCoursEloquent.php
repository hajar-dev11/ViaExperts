<?php

namespace App\Services\ServicesEnCours;

use App\Contracts\ServicesEnCours\CompteursServicesEnCours;
use App\Models\ServiceEnCours;

/** Implémentation du contrat {@see CompteursServicesEnCours} : le comptage qui se trouvait dans ArchiveController. */
class CompteursServicesEnCoursEloquent implements CompteursServicesEnCours
{
    public function compterParStatut(string $statut): int
    {
        return ServiceEnCours::where('status', $statut)->count();
    }
}
