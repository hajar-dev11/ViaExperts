<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * « Déclaration TVA » et « Chiffre d'Affaire » ont exactement la même structure
     * dans les captures (mêmes colonnes SITUATION / NOM COMPLET / PERIODE / ANNEE /
     * HT / TVA / TTC / DATE, mêmes actions) et deux groupes de permissions distincts.
     *
     * Une colonne `type` évite une seconde table jumelle.
     */
    public function up(): void
    {
        Schema::table('declarations_tva', function (Blueprint $table) {
            $table->string('type', 20)->default('tva')->after('id'); // tva | chiffre_affaire
            $table->index(['type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('declarations_tva', function (Blueprint $table) {
            $table->dropIndex(['type', 'status']);
            $table->dropColumn('type');
        });
    }
};
