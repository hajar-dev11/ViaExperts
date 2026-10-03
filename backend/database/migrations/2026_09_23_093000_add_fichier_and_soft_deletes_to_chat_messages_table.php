<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration ADDITIVE : pièce jointe (fichier) sur un message, et suppression
 * douce pour permettre à l'auteur de supprimer son propre message.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->string('fichier_nom', 200)->nullable()->after('body');
            $table->string('fichier_chemin', 255)->nullable()->after('fichier_nom');
            $table->string('fichier_mime', 100)->nullable()->after('fichier_chemin');
            $table->unsignedInteger('fichier_taille')->nullable()->after('fichier_mime');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn(['fichier_nom', 'fichier_chemin', 'fichier_mime', 'fichier_taille']);
            $table->dropSoftDeletes();
        });
    }
};
