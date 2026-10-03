<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lignes de déclaration — colonnes reprises telles quelles du tableau de la
     * capture : OR / FACT NUM / DESIGNATION / HT / TVA / TTC / IF / LIB FRSS /
     * ICE / TAUX / ID PAIE / DATE PAIE / DATE FAC.
     */
    public function up(): void
    {
        Schema::create('declaration_tva_lignes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('declaration_id');

            $table->string('ordre_ref', 30)->nullable();     // OR
            $table->string('fact_num', 60)->nullable();      // FACT NUM
            $table->string('designation', 255)->nullable();  // DESIGNATION
            $table->decimal('ht', 14, 2)->default(0);
            $table->decimal('tva', 14, 2)->default(0);
            $table->decimal('ttc', 14, 2)->default(0);
            $table->string('identifiant_fiscal', 30)->nullable();  // IF
            $table->string('libelle_fournisseur', 200)->nullable(); // LIB FRSS
            $table->string('ice', 30)->nullable();
            $table->decimal('taux', 5, 2)->default(20);      // TAUX
            $table->string('id_paie', 40)->nullable();       // ID PAIE
            $table->date('date_paie')->nullable();           // DATE PAIE
            $table->date('date_fac')->nullable();            // DATE FAC

            $table->unsignedInteger('ordre')->default(0);
            $table->timestamps();

            $table->foreign('declaration_id')->references('id')->on('declarations_tva')
                ->onDelete('cascade')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('declaration_tva_lignes');
    }
};
