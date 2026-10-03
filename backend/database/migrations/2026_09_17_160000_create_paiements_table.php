<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Paiements — document autonome, conforme aux captures « Ajouter Paiement »
     * et « List Des Paiements » : référence (#904), responsable, client/entreprise,
     * TOTAL (issu des lignes de service), MONTANT PAYE, PRIX RESTANT, méthode,
     * observation et pièce jointe.
     *
     * `document_id` rattache facultativement le paiement à une facture : c'est ce
     * lien qui déclenche la mise à jour transactionnelle de `documents_commerciaux.prix_paye`
     * (décision métier validée — option C hybride).
     */
    public function up(): void
    {
        Schema::create('paiements', function (Blueprint $table) {
            $table->id();

            $table->string('reference', 30)->unique();
            $table->string('emetteur', 30);
            $table->string('responsable', 150)->nullable();

            $table->unsignedBigInteger('party_id');
            $table->unsignedBigInteger('document_id')->nullable(); // facture réglée

            $table->dateTime('date_operation');
            $table->date('date_credit')->nullable();
            $table->string('mode_paiement', 40)->nullable();
            $table->boolean('signature')->default(false);

            $table->string('piece_jointe_nom', 200)->nullable();
            $table->string('piece_jointe_chemin', 255)->nullable();
            $table->text('observation')->nullable();

            $table->decimal('total', 12, 2)->default(0);
            $table->decimal('prix_paye', 12, 2)->default(0);

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('status');

            $table->foreign('party_id')->references('id')->on('parties')
                ->onDelete('restrict')->onUpdate('cascade');

            $table->foreign('document_id')->references('id')->on('documents_commerciaux')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('paiements');
    }
};
