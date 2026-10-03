<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notes — page « Notes » et widget rapide de la Topbar.
 *
 * Jusqu'ici persistées uniquement dans le `localStorage` du navigateur (donc
 * propres à un appareil, jamais partagées ni sauvegardées côté serveur).
 *
 * Migration ADDITIVE.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->id();

            $table->string('titre', 255)->nullable();
            $table->text('contenu')->nullable();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
