<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Archiver/Corbeille sur les Documents et Observations de la fiche
 * Domiciliation — même colonne `status` (actif/archive/corbeille) que
 * partout ailleurs dans l'application.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('domiciliation_documents', function (Blueprint $table) {
            $table->string('status', 20)->default('actif')->after('taille');
        });

        Schema::table('domiciliation_observations', function (Blueprint $table) {
            $table->string('status', 20)->default('actif')->after('privee');
        });
    }

    public function down(): void
    {
        Schema::table('domiciliation_documents', function (Blueprint $table) {
            $table->dropColumn('status');
        });

        Schema::table('domiciliation_observations', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
