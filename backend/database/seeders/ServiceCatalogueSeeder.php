<?php

namespace Database\Seeders;

use App\Models\Service;
use Illuminate\Database\Seeder;

/**
 * Catalogue réel des services proposés par le cabinet, tel que demandé pour
 * alimenter le sélecteur de services du module Facturation (Facture, Devis,
 * Bon de Livraison, Facture d'Avoir — ils partagent tous `listServices()`).
 *
 * `updateOrCreate` sur `nom` : rejouable sans dupliquer. Le catalogue doit
 * correspondre EXACTEMENT à cette liste : toute fiche Service dont le nom
 * n'y figure pas (anciennes démos, etc.) est supprimée (soft delete).
 */
class ServiceCatalogueSeeder extends Seeder
{
    private const NOMS = [
        "Domiciliation",
        "Location de salle de réception",
        "Création D'entreprise Au Maroc",
        "Enregistrement de contrat de domiciliation",
        "Certificat négatif (Nom de votre société)",
        "Taxe professionnelle",
        "Comptabilité",
        "Service juridique",
        "Déclaration fiscale",
        "Déclaration IS",
        "Déclaration IR",
        "Déclaration la Taxe Professionnelle",
        "Déclaration TVA",
        "Pénalités de Retard",
        "Assemblées générales de société",
        "Radiation d'une société",
        "Radiation personne physique",
        "Consultation juridique",
        "Préparation des bulletins de paie mensuels",
        "Déclaration de sécurité sociale(CNSS)",
        "établissement des contrats de travail",
        "bilan Comptable pour les très petites entreprises (TPE)",
        "bilan comptable pour les moyennes entreprises",
        "extration du modèle 7 du registre du commerce",
        "audit fiscal",
        "chargement d'activité",
        "transfert de siège social",
        "dépôt et enregistrement de marques au maroc",
        "dépôt et enregistrement de dessins et modèles au maroc",
        "dépôt et enregistrement de marques au maroc et à l'international",
        "pénalités et majorations de retard",
        "diagnastic & situation fiscale",
    ];

    public function run(): void
    {
        foreach (self::NOMS as $nom) {
            Service::updateOrCreate(
                ['nom' => $nom],
                ['via_experts' => true, 'status' => 'actif']
            );
        }

        Service::whereNotIn('nom', self::NOMS)->delete();
    }
}
