<?php

namespace App\Contracts\Paiements;

/**
 * Contrat de Paiements consommé par Facturation : ce qui est déjà payé sur une facture, par les paiements ACTIFS
 * enregistrés (hors archivés / corbeille). Facturation ne lit jamais la table des paiements.
 */
interface PaiementsDeFacture
{
    /** Somme des montants payés (`prix_paye`) des paiements actifs rattachés à la facture. */
    public function totalActifs(int $documentId): float;

    /** Nombre de paiements actifs rattachés à la facture. */
    public function nombreActifs(int $documentId): int;
}
