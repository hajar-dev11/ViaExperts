<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Remise d'une ligne de document EN MONTANT (Dh), à la place du pourcentage.
     *
     * `remise_montant` NULL  = ligne enregistrée AVANT cette migration : sa remise reste celle de `remise_pourcent`, inchangée.
     * `remise_montant` non NULL = remise en Dh de la ligne (le pourcentage est alors ignoré).
     *
     * Colonne ajoutée seulement : aucune donnée existante n'est modifiée, aucun montant historique n'est converti ni recalculé.
     * (`remise_pourcent decimal(5,2)` ne peut pas porter un montant : d'où une colonne dédiée.)
     */
    public function up(): void
    {
        Schema::table('document_lignes', function (Blueprint $table) {
            $table->decimal('remise_montant', 12, 2)->nullable()->after('remise_pourcent');
        });
    }

    public function down(): void
    {
        Schema::table('document_lignes', function (Blueprint $table) {
            $table->dropColumn('remise_montant');
        });
    }
};
