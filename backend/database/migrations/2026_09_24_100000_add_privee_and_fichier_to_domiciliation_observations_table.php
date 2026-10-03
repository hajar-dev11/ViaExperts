<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Case « Observation privée » + fichier joint du formulaire d'ajout
 * d'observation de domiciliation — même besoin que
 * `entreprise_observations.privee` (2026_09_21_100000), transposé ici.
 *
 * Règle de visibilité (appliquée dans `DomiciliationObservation::estVisiblePar`,
 * lue par `DomiciliationResource` et `DomiciliationController`) : une
 * observation cochée privée n'est lisible que par son auteur et les
 * administrateurs.
 *
 * Migration ADDITIVE : colonnes nullables / valeur par défaut `false`, les
 * observations déjà saisies restent inchangées (non privées, sans fichier).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('domiciliation_observations', function (Blueprint $table) {
            $table->boolean('privee')->default(false)->after('contenu');
            $table->string('fichier_nom')->nullable()->after('privee');
            $table->string('fichier_chemin')->nullable()->after('fichier_nom');
        });
    }

    public function down(): void
    {
        Schema::table('domiciliation_observations', function (Blueprint $table) {
            $table->dropColumn(['privee', 'fichier_nom', 'fichier_chemin']);
        });
    }
};
