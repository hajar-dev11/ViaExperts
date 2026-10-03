<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Module Domiciliation métier.
     *
     * - `etat`   : état métier du contrat (active / declare / resilie).
     * - `status` : cycle archive, identique à `parties` (actif / archive / corbeille)
     *              + SoftDeletes pour la « suppression définitive ».
     *
     * Les statuts d'affichage « Alerte » et « Expiré » de la Liste des domiciliations
     * ne sont PAS stockés : ils se déduisent de `date_fin` (voir Domiciliation::statutAffichage).
     */
    public function up(): void
    {
        Schema::create('domiciliations', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('entreprise_id');
            $table->unsignedBigInteger('centre_domiciliation_id');

            $table->unsignedInteger('mois_payee')->default(0);
            $table->unsignedInteger('mois_gratuits')->default(0);
            $table->date('date_depart');
            $table->date('date_fin')->nullable();

            $table->string('mode_paiement', 40)->nullable();
            $table->decimal('prix_par_mois', 10, 2)->default(0);
            $table->decimal('prix_total', 10, 2)->default(0);

            $table->boolean('signature_sur_facture')->default(false);
            $table->date('date_facture')->nullable();
            $table->date('date_paiement')->nullable();
            $table->date('date_legalisation')->nullable();

            // Documents à générer, cochés à la création (cf. écran « Ajouter Domiciliation »).
            $table->boolean('doc_facture')->default(false);
            $table->boolean('doc_contrat')->default(false);
            $table->boolean('doc_attestation')->default(false);
            $table->boolean('doc_procuration')->default(false);

            $table->string('etat', 20)->default('active');
            $table->string('status', 20)->default('actif');
            $table->date('date_resiliation')->nullable();
            $table->date('date_declaration')->nullable();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'etat']);
            $table->index('date_fin');

            $table->foreign('entreprise_id')->references('party_id')->on('entreprises')
                ->onDelete('cascade')->onUpdate('cascade');

            // Même garde-fou que sur `entreprises` : on ne supprime pas un centre utilisé.
            $table->foreign('centre_domiciliation_id')->references('id')->on('centres_domiciliation')
                ->onDelete('restrict')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domiciliations');
    }
};
