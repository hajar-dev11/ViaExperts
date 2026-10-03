<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fil « Mail Activité » de la capture : statut, auteur et horodatage.
     *
     * Le champ fichier reprend la mécanique déjà en place sur les opérations de
     * Cachets ; aucun fichier n'apparaît sur la capture Mails, il reste donc
     * facultatif (voir « À VALIDER » du rapport).
     */
    public function up(): void
    {
        Schema::create('mail_operations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('mail_id');
            $table->unsignedBigInteger('mail_status_id')->nullable();
            $table->text('commentaire')->nullable();
            $table->string('fichier_nom', 200)->nullable();
            $table->string('fichier_chemin', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('mail_id')->references('id')->on('mails')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('mail_status_id')->references('id')->on('mail_statuses')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mail_operations');
    }
};
