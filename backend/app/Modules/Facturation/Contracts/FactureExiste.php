<?php

namespace App\Modules\Facturation\Contracts;

/**
 * Un document de Facturation existe-t-il ? Utilisé par Paiements pour valider le `document_id` d'un paiement avant toute
 * écriture, sans connaître la table `documents_commerciaux`.
 *
 * Contrat PUBLIC de Facturation, volontairement minimal : un booléen, jamais un modèle ni une requête.
 */
interface FactureExiste
{
    /**
     * Vrai si une ligne existe pour cet identifiant, quel que soit le type du document (facture, devis, bl, avoir) et son
     * statut (actif, archive, corbeille). Un document en suppression douce (`deleted_at` renseigné) EXISTE toujours : c'est
     * le comportement de l'ancienne règle `exists:documents_commerciaux,id`, qui interrogeait la table sans la portée
     * « suppression douce ». Il diffère donc volontairement de `FactureReference::numeros()`, qui l'exclut.
     */
    public function existe(int $documentId): bool;
}
