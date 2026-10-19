<?php

namespace App\Contracts\ServicesEnCours;

/**
 * Fait apparaître dans « Services en cours » les services réellement saisis sur les lignes d'un document.
 *
 * Contrat PUBLIC du module Services en cours : Facturation (et plus tard Paiements, Déclarations) l'appelle sans connaître
 * le modèle `ServiceEnCours`, et Services en cours n'a aucune dépendance vers Facturation — pas de dépendance circulaire.
 *
 * L'appel est SYNCHRONE : il s'exécute dans la transaction de l'appelant (création / modification du document), donc le
 * service apparaît avec le document (et annulé avec lui si la transaction échoue). Il ne DISPARAÎT jamais de lui-même :
 * retirer un service d'un document, ou archiver / supprimer le document, ne touche pas au service en cours.
 */
interface AssureServicesEnCours
{
    /**
     * @param  int|null  $partyId  tiers du document (client, ou entreprise → son client titulaire)
     * @param  iterable<int|null>  $serviceIds  `service_id` des lignes (les lignes libres, sans service, sont ignorées)
     * @param  int  $creePar  utilisateur à l'origine de l'opération
     * @param  array{type?: string, id?: int, fichier_nom?: ?string, fichier_chemin?: ?string}  $source  document à l'origine de
     *         l'opération (type, identifiant, et sa pièce jointe s'il en a une) : enregistré dans l'activité de création, jamais
     *         copié ni supprimé avec le service
     */
    public function assurerPourTiers(?int $partyId, iterable $serviceIds, int $creePar, array $source = []): void;

    /**
     * Variante par NOM de service, pour un client déjà identifié : utilisée par la Déclaration TVA, dont le service
     * (« Déclaration TVA ») est connu par son nom et non par une ligne de document. Ne fait rien si `$clientId` est vide,
     * si le service n'existe pas au catalogue, ou si le couple (service, client) existe déjà (quel que soit son statut).
     *
     * @param  string  $nomService  nom exact du service au catalogue
     * @param  int|null  $clientId  client titulaire (déjà résolu par l'appelant)
     * @param  int  $creePar  utilisateur à l'origine de l'opération
     * @param  array{type?: string, id?: int, fichier_nom?: ?string, fichier_chemin?: ?string}  $source  document d'origine (voir assurerPourTiers)
     */
    public function assurerPourClient(string $nomService, ?int $clientId, int $creePar, array $source = []): void;
}
