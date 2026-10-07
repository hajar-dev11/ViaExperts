<?php

namespace App\Modules\Facturation\Contracts;

/**
 * Contrat PUBLIC de Facturation : montant d'un document (facture), consommé par Paiements pour refuser un paiement qui
 * dépasse le reste à payer. Paiements ne lit jamais la table des documents directement.
 */
interface MontantFacture
{
    /**
     * Total TTC du document, ou null s'il n'existe pas. Un document en corbeille est pris en compte (comme
     * {@see FactureExiste}) : ses paiements restent rattachés.
     */
    public function totalTtc(int $documentId): ?float;
}