<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * « Services en cours » : instance d'un service du catalogue rendue à un client.
     *
     * Le STATUT affiché vient de `service_statuses` (Paramètres → Services) : c'est
     * ce que montre la capture de référence (badges colorés « En Attente »,
     * « Demande Certificat Négatif »…). Les statuts existaient déjà mais n'étaient
     * consommés par aucune page métier — c'est ici qu'ils le deviennent.
     */
    public function up(): void
    {
        Schema::create('service_en_cours', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('service_id');
            $table->unsignedBigInteger('client_id');
            $table->unsignedBigInteger('service_status_id')->nullable();

            $table->dateTime('date_depart');
            $table->dateTime('derniere_operation')->nullable();

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('status');

            // On ne supprime pas un service du catalogue encore utilisé.
            $table->foreign('service_id')->references('id')->on('services')
                ->onDelete('restrict')->onUpdate('cascade');

            $table->foreign('client_id')->references('party_id')->on('clients')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('service_status_id')->references('id')->on('service_statuses')
                ->onDelete('set null')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_en_cours');
    }
};
