<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('domiciliation_settings', function (Blueprint $table) {
            $table->id();
            $table->string('nom_societe', 150)->nullable();
            $table->string('gerant', 150)->nullable();
            $table->decimal('prix_domiciliation', 10, 2)->nullable();
            $table->string('references_recu', 50)->nullable();
            $table->boolean('afficher_entreprise_info_recu')->default(false);
            $table->string('ice_societe', 50)->nullable();
            $table->text('entreprise_info')->nullable();
            $table->string('facture_prefixe', 20)->nullable();
            $table->unsignedInteger('facture_prochain_numero')->nullable();
            $table->string('facture_suffixe', 20)->nullable();
            $table->string('devis_prefixe', 20)->nullable();
            $table->unsignedInteger('devis_prochain_numero')->nullable();
            $table->string('devis_suffixe', 20)->nullable();
            $table->string('bl_prefixe', 20)->nullable();
            $table->unsignedInteger('bl_prochain_numero')->nullable();
            $table->string('bl_suffixe', 20)->nullable();
            $table->string('avoir_prefixe', 20)->nullable();
            $table->unsignedInteger('avoir_prochain_numero')->nullable();
            $table->string('avoir_suffixe', 20)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domiciliation_settings');
    }
};
