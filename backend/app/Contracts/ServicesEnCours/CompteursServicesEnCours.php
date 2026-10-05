<?php

namespace App\Contracts\ServicesEnCours;

/**
 * Compteurs de « Services en cours » pour les autres modules (aujourd'hui : la page Archive / Corbeille).
 *
 * Contrat PUBLIC du domaine Services en cours : Archive n'a pas besoin du modèle `ServiceEnCours`, seulement d'un nombre.
 */
interface CompteursServicesEnCours
{
    /**
     * Nombre de services en cours pour un statut donné (`actif`, `archive` ou `corbeille`) — une seule requête de comptage.
     * Les lignes supprimées en douceur (`deleted_at` renseigné) ne sont jamais comptées ; un statut inconnu donne 0.
     */
    public function compterParStatut(string $statut): int;
}
