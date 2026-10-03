<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entreprise_secteurs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('entreprise_id');
            $table->string('secteur', 100);
            $table->string('activite', 200)->nullable();
            $table->unsignedTinyInteger('ordre')->default(1);

            $table->foreign('entreprise_id')->references('party_id')->on('entreprises')
                ->onDelete('cascade')->onUpdate('cascade');
            $table->index('entreprise_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprise_secteurs');
    }
};
