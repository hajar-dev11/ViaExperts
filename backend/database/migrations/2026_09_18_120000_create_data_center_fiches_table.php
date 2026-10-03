<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Data Center — capture « Page Data center » (image68), page « List des Data ».
     *
     * Colonnes reprises EXACTEMENT de la capture, dans son ordre :
     * DENOMINATION / I_C_E / I_F / R_C / TP_NUMBER.
     *
     * Table DÉDIÉE, et non une réutilisation de `entreprises`, bien que cette
     * dernière porte les mêmes 5 champs : `entreprises` est liée à `parties` par
     * la FK composite typée (décision métier n° 5 de la passation). Y insérer une
     * fiche Data Center créerait aussi une entreprise visible dans le module
     * Entreprises — un couplage métier qui n'a jamais été validé. Le Data Center a
     * par ailleurs son propre groupe de 6 permissions et son propre cycle
     * archive/corbeille, distincts de ceux des Entreprises.
     *
     * Aucune contrainte d'unicité sur ICE/IF : la référence ne la montre pas et
     * plusieurs lignes de la capture ont R_C et TP_NUMBER vides (voir « À VALIDER »).
     *
     * Migration ADDITIVE : elle ne crée qu'une table neuve, ne touche à aucune
     * table ni à aucune donnée existante.
     */
    public function up(): void
    {
        Schema::create('data_center_fiches', function (Blueprint $table) {
            $table->id();

            $table->string('denomination', 200);
            $table->string('ice', 20)->nullable();
            $table->string('if', 20)->nullable();
            $table->string('rc', 30)->nullable();
            $table->string('tp', 20)->nullable();

            // Cycle standard du projet : actif → archive → corbeille,
            // puis « suppression définitive » = soft delete.
            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'denomination']);

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_center_fiches');
    }
};
