<?php

namespace App\Modules\Domiciliation\Contracts;

/**
 * Référence d'un centre de domiciliation, pour les modules qui y sont rattachés (aujourd'hui : Parties — la fiche d'une
 * entreprise désigne son centre par son NOM à l'écriture et affiche son NOM en lecture).
 *
 * Contrat PUBLIC de Domiciliation : Parties n'a pas besoin du modèle `CentreDomiciliation`, seulement d'un nom et d'un identifiant.
 * Dans les deux méthodes, un centre supprimé en douceur (`deleted_at` renseigné) est invisible, exactement comme l'ancienne relation
 * Eloquent `Entreprise::centreDomiciliation()` ; le statut actif / archive / corbeille n'est pas filtré.
 */
interface CentresDomiciliationReference
{
    /** Identifiant du centre portant ce nom exact, ou null s'il n'existe pas (ou est supprimé en douceur). */
    public function idParNom(string $nom): ?int;

    /**
     * Noms des centres demandés, en UNE requête (évite une requête par entreprise dans les listes).
     *
     * @param  array<int, int|string|null>  $ids
     * @return array<int, string> nom par identifiant ; les identifiants absents ou supprimés en douceur n'y figurent pas
     */
    public function nomsParIds(array $ids): array;
}
