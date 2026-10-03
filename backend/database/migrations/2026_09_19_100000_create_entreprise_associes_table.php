<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Personnes rattachées à une entreprise — gérants, associés, partenaires.
 *
 * La référence (captures « Modifier Entreprise » et « Details Entreprise »)
 * affiche une LISTE de personnes, chacune avec son nom, son CIN et son TYPE
 * de rôle, que l'on peut ajouter et retirer.
 *
 * Le modèle ne savait représenter qu'UN seul client par entreprise
 * (`entreprises.client_id`), sans rôle : cette table comble ce manque.
 * `entreprises.client_id` est CONSERVÉ tel quel — rien n'y est touché.
 *
 * Migration ADDITIVE : elle ne crée qu'une table neuve.
 */
return new class extends Migration
{
    /** Rôles proposés, validés avec l'utilisatrice. */
    public const TYPES = [
        'Partenaire',
        'Gèrent',
        'Co-Gèrent',
        'Associé',
        'Gérant non Associé',
    ];

    public function up(): void
    {
        Schema::create('entreprise_associes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('entreprise_id');

            $table->string('nom', 150);
            $table->string('cin', 30)->nullable();
            $table->string('type', 40)->nullable();
            $table->string('adresse', 255)->nullable();
            $table->string('telephone', 30)->nullable();
            $table->string('telephone_2', 30)->nullable();
            $table->string('email', 150)->nullable();
            $table->unsignedInteger('ordre')->default(0);

            $table->timestamps();

            $table->index(['entreprise_id', 'ordre']);

            // Même règle que `entreprise_secteurs` : la liste suit l'entreprise.
            $table->foreign('entreprise_id')->references('party_id')->on('entreprises')
                ->onDelete('cascade')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprise_associes');
    }
};
