<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Observations rattachées à une domiciliation (action « Ajouter Observation »).
     *
     * ⚠️ Distinct du module Documents/Observations prévu pour Client/Entreprise
     * (rattaché à `party_id`) : ici la cible est la domiciliation elle-même,
     * conformément à la demande explicite de l'utilisateur.
     */
    public function up(): void
    {
        Schema::create('domiciliation_observations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('domiciliation_id');
            $table->text('contenu');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('domiciliation_id')->references('id')->on('domiciliations')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domiciliation_observations');
    }
};
