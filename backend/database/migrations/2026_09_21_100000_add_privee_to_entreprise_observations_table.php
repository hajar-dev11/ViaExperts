<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Case « Observation privée » du formulaire d'ajout d'observation.
 *
 * Règle de visibilité validée avec l'utilisatrice : une observation cochée
 * privée n'est lisible que par **son auteur et les administrateurs**. Les
 * autres utilisateurs ne la voient pas du tout dans le bloc Observations.
 * Le filtrage est appliqué dans `EntrepriseResource` (lecture) et dans
 * `EntrepriseController` (actions), pas seulement à l'affichage.
 *
 * Migration ADDITIVE : une colonne, valeur par défaut `false`, donc toutes
 * les observations déjà saisies restent visibles de tous comme avant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('entreprise_observations', function (Blueprint $table) {
            $table->boolean('privee')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('entreprise_observations', function (Blueprint $table) {
            $table->dropColumn('privee');
        });
    }
};
