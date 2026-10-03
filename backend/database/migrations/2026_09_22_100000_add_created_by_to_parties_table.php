<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * « Créé par » — le membre du système (assistant ou administrateur) qui a
 * créé la fiche. Posée sur `parties` plutôt que sur `clients`/`entreprises`
 * séparément : les deux partagent déjà `party_id` comme clé primaire, une
 * seule colonne suffit pour les deux.
 *
 * Migration ADDITIVE : colonne nullable, aucune ligne existante modifiée.
 * Les fiches déjà en base affichent simplement « — » (auteur inconnu),
 * comme le fait déjà `domiciliations.created_by` pour le même cas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parties', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable()->after('status');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('parties', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropColumn('created_by');
        });
    }
};
