<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cycle actif → archive → corbeille pour les centres de domiciliation,
     * comme partout ailleurs dans le projet (Data Center, Services, Cachet…).
     * Migration ADDITIVE : ajoute une colonne avec valeur par défaut et le
     * soft delete standard — ne touche à aucune donnée existante, les 11
     * centres réels restent `actif`.
     */
    public function up(): void
    {
        Schema::table('centres_domiciliation', function (Blueprint $table) {
            $table->string('status', 20)->default('actif')->after('telephone');
            $table->softDeletes();
            $table->index(['status', 'nom']);
        });
    }

    public function down(): void
    {
        Schema::table('centres_domiciliation', function (Blueprint $table) {
            $table->dropIndex(['status', 'nom']);
            $table->dropSoftDeletes();
            $table->dropColumn('status');
        });
    }
};
