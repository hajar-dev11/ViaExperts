<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Migration ADDITIVE : un message peut désormais être une pièce jointe seule,
 * sans texte (`ChatController::send` l'autorise déjà) — `body` doit donc
 * pouvoir être NULL.
 *
 * SQL brut plutôt que `Blueprint::change()` : ce projet est en Laravel 9 sans
 * `doctrine/dbal` (nécessaire à `change()`), qu'on n'ajoute pas pour une seule
 * colonne — cette base est MySQL (voir `.env` : DB_CONNECTION=mysql).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE chat_messages MODIFY body TEXT NULL');
    }

    public function down(): void
    {
        DB::statement("UPDATE chat_messages SET body = '' WHERE body IS NULL");
        DB::statement('ALTER TABLE chat_messages MODIFY body TEXT NOT NULL');
    }
};
