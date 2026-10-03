<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rapports de jour (captures « Ajouter Raport » et « List Raports »).
     *
     * Colonnes reprises telles quelles de la liste de référence :
     * RAPPORT DE / DESCRIPTIVE / MONTANT RESTANT / REVENU LOCAL / REVENU EXTERNE /
     * DEPENSE DU JOUR / SOLDE CAISSE / REVENU DU JOUR / DATE.
     *
     * Le champ « Document » de la capture accepte UN fichier, avec la mention
     * « pour Multi-Document add sur ZIP, RAR » : plusieurs documents se transmettent
     * donc via une archive, d'où une seule paire nom/chemin.
     */
    public function up(): void
    {
        Schema::create('rapports', function (Blueprint $table) {
            $table->id();

            $table->string('emetteur', 30)->default('via_experts');
            $table->string('rapport_de', 150)->nullable(); // colonne RAPPORT DE
            $table->date('date_rapport');

            $table->decimal('montant_restant', 12, 2)->default(0);
            $table->decimal('revenu_local', 12, 2)->default(0);
            $table->decimal('revenu_externe', 12, 2)->default(0);
            $table->decimal('depense_jour', 12, 2)->default(0);
            $table->decimal('solde_caisse', 12, 2)->default(0);
            $table->decimal('total_revenu_jour', 12, 2)->default(0);

            $table->text('descriptive')->nullable();

            $table->string('document_nom', 200)->nullable();
            $table->string('document_chemin', 255)->nullable();

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'date_rapport']);

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rapports');
    }
};
