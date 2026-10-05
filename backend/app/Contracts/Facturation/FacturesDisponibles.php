<?php

namespace App\Contracts\Facturation;

use Illuminate\Support\Collection;

/**
 * Factures que le module Paiements peut proposer de rattacher à un paiement (liste déroulante du formulaire).
 *
 * Contrat PUBLIC de Facturation : Paiements n'a pas besoin de connaître le modèle `DocumentCommercial`, seulement de
 * ces quelques champs.
 */
interface FacturesDisponibles
{
    /**
     * Factures actives (type « facture », statut « actif »), de la plus récente à la plus ancienne.
     *
     * @return Collection<int, array{id: int, numero: string, tiers: ?string, partyId: int, totalTtc: string, prixPaye: string, prixRestant: string}>
     */
    public function lister(): Collection;
}
