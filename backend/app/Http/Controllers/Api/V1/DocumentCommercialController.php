<?php

/*
 * COMPATIBILITÉ TEMPORAIRE — migration Modular Monolith (Facturation, étape 4).
 *
 * Cette classe a été déplacée dans le module Facturation. Ce fichier ne contient AUCUNE logique : il déclare seulement
 * l'ancien nom comme alias de la classe réelle, pour que le code qui référence encore l'ancien espace de noms
 * (Paiement, tests, ...) continue de fonctionner. À supprimer quand plus aucune référence à l'ancien nom ne subsiste.
 *
 * Classe réelle : App\Modules\Facturation\Http\Controllers\DocumentCommercialController
 */

if (! class_exists('App\Http\Controllers\Api\V1\DocumentCommercialController', false)) {
    class_alias('App\Modules\Facturation\Http\Controllers\DocumentCommercialController', 'App\Http\Controllers\Api\V1\DocumentCommercialController');
}
