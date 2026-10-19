<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->unsignedBigInteger('party_id');
            $table->string('type', 10)->default('client');

            $table->string('genre', 5)->default('Mr'); // Mr | Mme
            $table->string('nom', 150);
            $table->string('nom_ar', 150)->nullable();
            $table->string('nationalite', 80)->default('MAROCAINE');
            $table->date('date_naissance')->nullable();
            $table->string('cin', 20)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('telephone', 30)->nullable();
            $table->string('telephone_2', 30)->nullable();
            $table->string('adresse', 255)->nullable();
            $table->string('adresse_ar', 255)->nullable();

            $table->primary('party_id');
            $table->unique('cin');
            $table->unique('email');

            $table->foreign(['party_id', 'type'])
                ->references(['id', 'type'])->on('parties')
                ->onDelete('cascade')->onUpdate('cascade');
        });

        try {
            DB::statement("ALTER TABLE clients ADD CONSTRAINT chk_clients_type CHECK (type = 'client')");
        } catch (QueryException $e) {
            // MariaDB récent (ex. 10.11) refuse un CHECK sur une colonne d'une clé étrangère ON UPDATE CASCADE (erreur 1901).
            // Dans ce cas seulement, la contrainte est omise : la clé étrangère (party_id, type) garde le lien avec parties,
            // et l'application n'écrit jamais d'autre type. Toute autre erreur est relancée.
            if ((int) ($e->errorInfo[1] ?? 0) !== 1901) {
                throw $e;
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
