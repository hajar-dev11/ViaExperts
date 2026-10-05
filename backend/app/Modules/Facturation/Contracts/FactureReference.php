<?php

namespace App\Modules\Facturation\Contracts;

/**
 * Référence lisible d'une facture, pour les modules qui y sont rattachés (aujourd'hui : Paiements, qui affiche le numéro
 * de la facture réglée).
 *
 * Contrat PUBLIC de Facturation : Paiements n'a pas besoin du modèle `DocumentCommercial`, seulement du numéro.
 */
interface FactureReference
{
    /**
     * Numéros des documents demandés, en UNE requête (évite une requête par paiement dans les listes).
     *
     * Un document absent ou placé dans la corbeille de Facturation (suppression douce) n'apparaît pas dans le résultat,
     * exactement comme l'ancienne relation Eloquent `Paiement::document()`. Le statut actif / archive n'est pas filtré.
     *
     * @param  array<int, int|string>  $documentIds
     * @return array<int, string> numéro par identifiant de document
     */
    public function numeros(array $documentIds): array;
}
