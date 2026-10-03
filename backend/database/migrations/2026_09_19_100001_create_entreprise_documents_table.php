<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Documents joints à une entreprise.
 *
 * Bloc « Documents » de la page Details_Entreprise : nom du document, date
 * d'ajout, auteur, puis téléchargement / archivage / suppression.
 *
 * Structure calquée sur `domiciliation_documents`, qui rend déjà ce service
 * pour les domiciliations, avec en plus un cycle archive/corbeille propre au
 * bloc (colonne `status`) et un soft delete, conformément à la règle du
 * projet : « suppression définitive = soft delete ».
 *
 * Migration ADDITIVE.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entreprise_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('entreprise_id');

            $table->string('nom', 200);
            $table->string('chemin', 255);
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('taille')->nullable();

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['entreprise_id', 'status']);

            $table->foreign('entreprise_id')->references('party_id')->on('entreprises')
                ->onDelete('cascade')->onUpdate('cascade');
            $table->foreign('uploaded_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprise_documents');
    }
};
