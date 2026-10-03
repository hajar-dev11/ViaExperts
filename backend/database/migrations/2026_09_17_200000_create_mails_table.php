<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Mails (capture « les Mails »).
     *
     * Colonnes de la liste de référence : STATUS / CLIENT / DÉPART /
     * DERNIÈRE OPÉRATION / ACTIONS. Contrairement aux Cachets, la capture
     * Mails ne comporte PAS de colonne LIGNES : elle n'est donc pas reprise.
     *
     * Le STATUT réutilise `mail_statuses`, déjà gérée dans Paramètres → Mail
     * (nom + couleur texte + couleur fond) — aucun système parallèle.
     *
     * `party_id` pointe sur `parties` : la colonne CLIENT affiche des
     * dénominations d'entreprises (YOH IMMOBILIER, COMPTOIR TGHAT…).
     */
    public function up(): void
    {
        Schema::create('mails', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('party_id');
            $table->unsignedBigInteger('mail_status_id')->nullable();

            $table->dateTime('date_depart');
            $table->dateTime('derniere_operation')->nullable();

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('status');

            $table->foreign('party_id')->references('id')->on('parties')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('mail_status_id')->references('id')->on('mail_statuses')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mails');
    }
};
