<?php

namespace App\Contracts\Facturation;

/**
 * Lecture des factures pour la vue « Mouvement → Entrées (Facturé) ».
 *
 * Mouvement est une vue d'agrégation en lecture seule : il demande à Facturation les factures de la période et fait
 * lui-même les totaux, sans accéder au modèle `DocumentCommercial`.
 */
interface FacturesPourMouvements
{
    /**
     * Factures actives de la période, de la plus récente à la plus ancienne.
     *
     * @param  array{date_debut?: mixed, date_fin?: mixed, annee?: mixed, trimestre?: mixed}  $periode  mêmes filtres que l'API
     * @return list<array{id: int, numero: string, responsable: ?string, clientId: ?int, entrepriseId: ?int, client: ?string, dateDocument: ?string, totalHt: string, totalTtc: string, prixPaye: string, prixRestant: string}>
     */
    public function entrees(array $periode): array;

    /**
     * Années présentes dans les documents de Facturation (alimente le sélecteur d'année), de la plus récente à la plus
     * ancienne.
     *
     * @return list<int>
     */
    public function anneesDisponibles(): array;
}
