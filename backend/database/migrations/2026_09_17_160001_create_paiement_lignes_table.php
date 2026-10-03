<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lignes de service d'un paiement — alimentent le TOTAL du document et la vue
     * « Gestion des Paiements », qui affiche une ligne par service.
     */
    public function up(): void
    {
        Schema::create('paiement_lignes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('paiement_id');
            $table->unsignedBigInteger('service_id')->nullable();

            $table->string('designation', 255);
            $table->decimal('quantite', 10, 2)->default(1);
            $table->decimal('prix_unitaire', 12, 2)->default(0);

            $table->unsignedInteger('ordre')->default(0);
            $table->timestamps();

            $table->foreign('paiement_id')->references('id')->on('paiements')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('service_id')->references('id')->on('services')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('paiement_lignes');
    }
};
