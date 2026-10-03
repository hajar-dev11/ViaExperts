<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Historique des observations d'une entreprise.
 *
 * Bloc « Observations » de la page Details_Entreprise : une ligne par
 * observation, avec sa date d'ajout et son auteur.
 *
 * ⚠️ La colonne `entreprises.observation` (champ texte unique) est CONSERVÉE :
 * elle reste affichée dans le formulaire et contient les saisies existantes.
 * Cette table lui ajoute un véritable historique, sans rien migrer d'office —
 * aucune donnée n'est déplacée ni supprimée.
 *
 * Structure calquée sur `domiciliation_observations`.
 * Migration ADDITIVE.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entreprise_observations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('entreprise_id');

            $table->text('contenu');

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['entreprise_id', 'status']);

            $table->foreign('entreprise_id')->references('party_id')->on('entreprises')
                ->onDelete('cascade')->onUpdate('cascade');
            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprise_observations');
    }
};
