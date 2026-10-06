<?php

namespace App\Modules\Domiciliation\Contracts;

/**
 * Compteurs de Domiciliation pour les autres modules (aujourd'hui : la page Archive / Corbeille).
 *
 * Contrat PUBLIC du domaine Domiciliation : Archive n'a pas besoin du modèle `Domiciliation`, seulement d'un nombre.
 */
interface CompteursDomiciliations
{
    /**
     * Nombre de domiciliations pour un statut donné (`actif`, `archive` ou `corbeille`) — une seule requête de comptage.
     * Les lignes supprimées en douceur (`deleted_at` renseigné) ne sont jamais comptées ; un statut inconnu donne 0.
     */
    public function compterParStatut(string $statut): int;
}
