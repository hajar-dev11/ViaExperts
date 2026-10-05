<?php

namespace App\Modules\Facturation\Contracts;

/**
 * Mise à jour du « prix payé » d'une facture à partir de ses paiements.
 *
 * `documents_commerciaux.prix_paye` est une colonne stockée (option C) : Paiements calcule la somme de SES paiements
 * actifs rattachés à la facture et demande à Facturation de l'enregistrer. Paiements n'écrit donc plus lui-même dans les
 * données de Facturation.
 *
 * À appeler dans la transaction qui crée / modifie / archive / supprime le paiement, pour qu'aucune divergence ne soit
 * possible entre la facture et ses paiements.
 */
interface SynchronisationPaiements
{
    /**
     * @param  int|null  $documentId  facture concernée (aucun effet si null ou introuvable)
     * @param  float  $totalPaiementsActifs  somme des `prix_paye` des paiements ACTIFS de cette facture
     */
    public function appliquerTotalPaye(?int $documentId, float $totalPaiementsActifs): void;
}
