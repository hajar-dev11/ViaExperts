<?php

/*
 * COMPATIBILITÉ TEMPORAIRE — migration Modular Monolith (Domiciliation, étape 18).
 *
 * Ce modèle a été déplacé dans le module Domiciliation. Ce fichier ne contient AUCUNE logique : il déclare seulement l'ancien nom
 * comme alias de la classe réelle, pour que le code qui référence encore l'ancien espace de noms (Entreprise, EntrepriseController,
 * tests, ...) continue de fonctionner. À supprimer à l'étape 19, quand plus aucune référence à l'ancien nom ne subsistera.
 *
 * Classe réelle : App\Modules\Domiciliation\Models\DomiciliationOperation
 */

if (! class_exists('App\Models\DomiciliationOperation', false)) {
    class_alias('App\Modules\Domiciliation\Models\DomiciliationOperation', 'App\Models\DomiciliationOperation');
}
