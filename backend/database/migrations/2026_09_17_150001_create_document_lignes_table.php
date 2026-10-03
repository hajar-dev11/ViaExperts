<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lignes d'un document commercial.
     *
     * La capture « Ajouter Facture » alimente les lignes depuis le catalogue
     * Services (select « Sélectionner le Service » + bouton « Ajouter »),
     * d'où `service_id`. La désignation est recopiée pour rester figée même si
     * le service du catalogue est renommé plus tard.
     */
    public function up(): void
    {
        Schema::create('document_lignes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('service_id')->nullable();

            $table->string('designation', 255);
            $table->decimal('quantite', 10, 2)->default(1);
            $table->decimal('prix_unitaire', 12, 2)->default(0);
            $table->decimal('remise_pourcent', 5, 2)->default(0);
            $table->decimal('tva_pourcent', 5, 2)->default(20);

            $table->unsignedInteger('ordre')->default(0);
            $table->timestamps();

            $table->foreign('document_id')->references('id')->on('documents_commerciaux')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('service_id')->references('id')->on('services')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_lignes');
    }
};
