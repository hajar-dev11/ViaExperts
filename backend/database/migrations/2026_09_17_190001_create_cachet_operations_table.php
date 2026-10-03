<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fil « Cashet Activité » de la capture : statut, auteur, horodatage et
     * fichier joint téléchargeable (« WhatsApp Image ….jpeg » dans la référence).
     */
    public function up(): void
    {
        Schema::create('cachet_operations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('cachet_id');
            $table->unsignedBigInteger('cachet_status_id')->nullable();
            $table->text('commentaire')->nullable();
            $table->string('fichier_nom', 200)->nullable();
            $table->string('fichier_chemin', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('cachet_id')->references('id')->on('cachets')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('cachet_status_id')->references('id')->on('cachet_statuses')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cachet_operations');
    }
};
