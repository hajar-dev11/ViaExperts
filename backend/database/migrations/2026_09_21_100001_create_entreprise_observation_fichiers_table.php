<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pièces jointes d'une observation d'entreprise.
 *
 * Choix validé avec l'utilisatrice : **plusieurs fichiers par observation**,
 * donc une table dédiée plutôt que des colonnes `fichier_*` sur
 * `entreprise_observations` (comme le fait `paiements.piece_jointe_chemin`,
 * qui lui est limité à une seule pièce).
 *
 * Les fichiers suivent l'observation : CASCADE. Il n'y a pas de cycle
 * archive/corbeille propre au fichier — c'est l'observation qui porte le
 * `status`, le fichier n'est qu'un attachement.
 *
 * Migration ADDITIVE.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entreprise_observation_fichiers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('observation_id');

            $table->string('nom', 200);
            $table->string('chemin', 255);
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('taille')->nullable();

            $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('observation_id');

            $table->foreign('observation_id')->references('id')->on('entreprise_observations')
                ->onDelete('cascade')->onUpdate('cascade');
            $table->foreign('uploaded_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprise_observation_fichiers');
    }
};
