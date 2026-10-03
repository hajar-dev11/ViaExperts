<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lien de renouvellement : une domiciliation créée par l'action « Renouveler »
 * pointe vers celle qu'elle prolonge.
 *
 * Jusqu'ici la distinction Nouveau / Renouveler n'était que DÉDUITE côté
 * frontend (la plus ancienne domiciliation d'une entreprise = Nouveau, les
 * suivantes = Renouveler). Cette déduction reste le repli pour les lignes
 * historiques ; le lien explicite la remplace dès qu'il existe.
 *
 * Migration ADDITIVE : colonne nullable, aucune ligne existante modifiée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('domiciliations', function (Blueprint $table) {
            $table->unsignedBigInteger('renouvelle_de_id')->nullable()->after('status');

            $table->foreign('renouvelle_de_id')->references('id')->on('domiciliations')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('domiciliations', function (Blueprint $table) {
            $table->dropForeign(['renouvelle_de_id']);
            $table->dropColumn('renouvelle_de_id');
        });
    }
};
