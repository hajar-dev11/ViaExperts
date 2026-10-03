<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fichiers — page « Fichiers » et widget rapide de la Topbar.
 *
 * Bibliothèque de fichiers globale (pas rattachée à une entreprise/client en
 * particulier), jusqu'ici purement en mémoire côté frontend (perdue au
 * rafraîchissement). Structure calquée sur `entreprise_documents`.
 *
 * Migration ADDITIVE.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fichiers', function (Blueprint $table) {
            $table->id();

            $table->string('nom', 255);
            $table->string('chemin', 255);
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('taille')->nullable();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fichiers');
    }
};
