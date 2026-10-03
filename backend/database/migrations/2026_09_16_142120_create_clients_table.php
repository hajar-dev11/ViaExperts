<?php

use Illuminate\Database\Migrations\Migration;
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

        DB::statement("ALTER TABLE clients ADD CONSTRAINT chk_clients_type CHECK (type = 'client')");
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
