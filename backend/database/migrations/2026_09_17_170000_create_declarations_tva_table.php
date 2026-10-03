<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Déclarations de TVA (captures « Nouvelle Declaration » et « Liste des Déclarations »).
     *
     * `situation` reprend les 2 badges de la liste — « Déclarée » / « Non Déclaré » —
     * et correspond aux 2 permissions du catalogue `declaration` :
     * sauvegarder_declaree et sauvegarder_non_declare.
     */
    public function up(): void
    {
        Schema::create('declarations_tva', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('entreprise_id');
            $table->string('client_if', 30);
            $table->string('identifiant_paiement', 40)->nullable();

            $table->string('periode_type', 20)->default('trimestre'); // trimestre | mois
            $table->unsignedTinyInteger('periode_valeur');
            $table->unsignedSmallInteger('annee');
            $table->string('regime', 40)->nullable();

            $table->string('situation', 20)->default('non_declaree'); // declaree | non_declaree

            $table->decimal('total_ht', 14, 2)->default(0);
            $table->decimal('total_tva', 14, 2)->default(0);
            $table->decimal('total_ttc', 14, 2)->default(0);

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'situation']);
            $table->index(['annee', 'periode_valeur']);

            $table->foreign('entreprise_id')->references('party_id')->on('entreprises')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('declarations_tva');
    }
};
