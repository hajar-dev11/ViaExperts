<?php

namespace App\Services\ServicesEnCours;

use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Models\ServiceEnCours;

/**
 * Implémentation du contrat {@see AssureServicesEnCours} : délègue à la méthode existante
 * `ServiceEnCours::assurerServicesPourTiers`, qui reste en place (compatibilité) et porte toute la logique.
 */
class AssureServicesEnCoursEloquent implements AssureServicesEnCours
{
    public function assurerPourTiers(?int $partyId, iterable $serviceIds, int $creePar, array $source = []): void
    {
        ServiceEnCours::assurerServicesPourTiers($partyId, $serviceIds, $creePar, $source);
    }

    public function assurerPourClient(string $nomService, ?int $clientId, int $creePar, array $source = []): void
    {
        ServiceEnCours::assurerPourClient($nomService, $clientId, $creePar, $source);
    }
}
