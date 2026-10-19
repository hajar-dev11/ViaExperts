<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paiements complémentaires : un paiement ajouté plus tard pour le MÊME service / le MÊME client pointe vers le paiement
 * d'origine (`paiement_origine_id`). Le paiement d'origine et ses compléments forment un « dossier » dont le reste à payer est
 * calculé sur l'ensemble des paiements. Les paiements existants gardent la valeur NULL : ils restent des paiements d'origine,
 * rien n'est modifié ni recalculé dans les données déjà enregistrées.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('paiements', function (Blueprint $table) {
            $table->foreignId('paiement_origine_id')->nullable()->after('document_id')
                ->constrained('paiements')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('paiements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('paiement_origine_id');
        });
    }
};
