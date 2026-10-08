<?php

namespace App\Modules\Facturation\Contracts;

/**
 * Contrat PUBLIC de Facturation : de quel type est un document et à quel tiers (client / entreprise) appartient-il ?
 * Consommé par Paiements pour n'accepter un paiement que sur une FACTURE du BON client, sans lire la table des documents.
 */
interface InformationsFacture
{
    /**
     * Type (facture, devis, bl, avoir) et tiers (`party_id`) du document, ou null s'il n'existe pas. Un document en
     * corbeille est pris en compte (comme {@see FactureExiste}) : ses paiements restent rattachés.
     *
     * @return array{type: string, party_id: int}|null
     */
    public function typeEtTiers(int $documentId): ?array;
}
