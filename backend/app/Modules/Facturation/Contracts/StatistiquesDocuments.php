<?php

namespace App\Modules\Facturation\Contracts;

/**
 * Statistiques des documents de Facturation, pour les compteurs Archive / Corbeille.
 */
interface StatistiquesDocuments
{
    /**
     * Nombre de documents par type pour un statut donné (`actif`, `archive` ou `corbeille`).
     *
     * @return array{facture: int, devis: int, bl: int, avoir: int}
     */
    public function compterParType(string $statut): array;
}
