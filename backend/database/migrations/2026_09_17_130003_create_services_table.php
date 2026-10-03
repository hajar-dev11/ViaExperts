<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Catalogue métier Services (écran « Nouveau Service » + « Liste des Services »).
     *
     * `status` reprend le cycle archive de `parties` (actif / archive / corbeille)
     * + SoftDeletes, pour rester cohérent avec Clients/Entreprises.
     *
     * ⚠️ Ne pas confondre avec `service_statuses` (Paramètres → Services),
     * qui ne gère QUE des statuts colorés.
     */
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->boolean('via_experts')->default(false);
            $table->string('maitre', 150)->nullable();
            $table->string('nom', 200);
            $table->decimal('prix', 10, 2)->default(0);
            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('status');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
