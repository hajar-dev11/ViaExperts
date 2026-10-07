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

    /**
     * Montant « payé » STOCKÉ sur le document (documents_commerciaux.prix_paye), ou null s'il n'existe pas. Il peut avoir été
     * saisi à la main sur la facture, sans paiement enregistré correspondant.
     */
    public function prixPaye(int $documentId): ?float;
}