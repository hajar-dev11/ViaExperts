<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cachets (capture « Cashet »).
     *
     * Colonnes de la liste de référence : STATUS / LIGNES / CLIENT / DÉPART /
     * DERNIÈRE OPÉRATION / ACTIONS.
     *
     * Le STATUT réutilise la table `cachet_statuses` déjà gérée dans
     * Paramètres → Cachet (nom + couleur texte + couleur fond) : aucun système
     * parallèle n'est créé.
     *
     * `party_id` pointe sur `parties` : la colonne CLIENT de la capture affiche
     * des dénominations d'entreprises (PRIMAGEO, SALIM PACK…), le rattachement
     * doit donc couvrir Clients ET Entreprises.
     */
    public function up(): void
    {
        Schema::create('cachets', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('party_id');
            $table->unsignedBigInteger('cachet_status_id')->nullable();

            $table->unsignedInteger('lignes')->default(0); // colonne LIGNES
            $table->dateTime('date_depart');
            $table->dateTime('derniere_operation')->nullable();

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('status');

            $table->foreign('party_id')->references('id')->on('parties')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('cachet_status_id')->references('id')->on('cachet_statuses')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cachets');
    }
};
