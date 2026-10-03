<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Chat interne entre utilisateurs de l'application (conversations 1-à-1).
     * Aucun invité, aucun contact externe : expéditeur et destinataire sont
     * toujours des lignes de `users`.
     */
    public function up(): void
    {
        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sender_id');
            $table->unsignedBigInteger('recipient_id');
            $table->text('body');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            // Sert à charger une conversation et à compter les non-lus.
            $table->index(['sender_id', 'recipient_id', 'id']);
            $table->index(['recipient_id', 'read_at']);

            $table->foreign('sender_id')->references('id')->on('users')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('recipient_id')->references('id')->on('users')
                ->onDelete('cascade')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
    }
};
