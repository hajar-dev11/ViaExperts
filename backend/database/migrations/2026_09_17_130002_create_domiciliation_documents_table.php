<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Documents joints à une domiciliation (action « Ajouter Document »).
     * Fichiers stockés sur le disque `public`, sous storage/app/public/domiciliations/.
     */
    public function up(): void
    {
        Schema::create('domiciliation_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('domiciliation_id');
            $table->string('nom', 200);
            $table->string('chemin', 255);
            $table->string('mime', 100)->nullable();
            $table->unsignedInteger('taille')->nullable();
            $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->timestamps();

            $table->foreign('domiciliation_id')->references('id')->on('domiciliations')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('uploaded_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domiciliation_documents');
    }
};
