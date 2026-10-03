<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Suppression définitive protégée depuis la Corbeille : `destroyDocument()` et
 * `destroyObservation()` de `DomiciliationController` exigeaient déjà
 * `status === 'corbeille'`... pour tous les autres modules, pas celui-ci —
 * un oubli corrigé en même temps que l'ajout de `SoftDeletes`, pour que ces
 * deux tables suivent exactement la même règle que `entreprise_documents` /
 * `entreprise_observations` (déjà soft-deletables).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('domiciliation_documents', function (Blueprint $table) {
            $table->softDeletes();
        });

        Schema::table('domiciliation_observations', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('domiciliation_documents', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });

        Schema::table('domiciliation_observations', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
