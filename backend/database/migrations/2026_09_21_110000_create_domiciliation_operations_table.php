<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal des actions métier d'une domiciliation : renouvellement, déclaration,
 * résiliation. Chaque action peut porter un commentaire et un fichier joint.
 *
 * Structure calquée sur `service_en_cours_operations`, `cachet_operations` et
 * `mail_operations`, qui rendent déjà ce service dans les autres modules :
 * même nommage (`commentaire`, `fichier_nom`, `fichier_chemin`, `created_by`).
 *
 * Migration ADDITIVE.
 */
return new class extends Migration
{
    /** Actions journalisées. */
    public const TYPES = ['renouvellement', 'declaration', 'resiliation'];

    public function up(): void
    {
        Schema::create('domiciliation_operations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('domiciliation_id');

            $table->string('type', 20);
            $table->text('commentaire')->nullable();
            $table->string('fichier_nom', 200)->nullable();
            $table->string('fichier_chemin', 255)->nullable();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['domiciliation_id', 'type']);

            $table->foreign('domiciliation_id')->references('id')->on('domiciliations')
                ->onDelete('cascade')->onUpdate('cascade');
            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domiciliation_operations');
    }
};
