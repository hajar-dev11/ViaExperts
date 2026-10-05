<?php

namespace App\Contracts\ServicesEnCours;

/**
 * Fait apparaître dans « Services en cours » les services réellement saisis sur les lignes d'un document.
 *
 * Contrat PUBLIC du module Services en cours : Facturation (et plus tard Paiements, Déclarations) l'appelle sans connaître
 * le modèle `ServiceEnCours`, et Services en cours n'a aucune dépendance vers Facturation — pas de dépendance circulaire.
 *
 * L'appel est SYNCHRONE : il s'exécute dans la transaction de l'appelant (création / modification du document), donc le
 * service apparaît ou disparaît avec le document.
 */
interface AssureServicesEnCours
{
    /**
     * @param  int|null  $partyId  tiers du document (client, ou entreprise → son client titulaire)
     * @param  iterable<int|null>  $serviceIds  `service_id` des lignes (les lignes libres, sans service, sont ignorées)
     * @param  int  $creePar  utilisateur à l'origine de l'opération
     */
    public function assurerPourTiers(?int $partyId, iterable $serviceIds, int $creePar): void;
}
