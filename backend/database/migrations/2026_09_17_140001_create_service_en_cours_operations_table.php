<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fil « Activité Services » de la capture de référence : chaque opération porte
     * un statut, son auteur, son horodatage et éventuellement un fichier joint
     * (« Reçu.pdf », « home_preview_1.png » dans la capture).
     */
    public function up(): void
    {
        Schema::create('service_en_cours_operations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_en_cours_id');
            $table->unsignedBigInteger('service_status_id')->nullable();
            $table->text('commentaire')->nullable();
            $table->string('fichier_nom', 200)->nullable();
            $table->string('fichier_chemin', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('service_en_cours_id')->references('id')->on('service_en_cours')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('service_status_id')->references('id')->on('service_statuses')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_en_cours_operations');
    }
};
