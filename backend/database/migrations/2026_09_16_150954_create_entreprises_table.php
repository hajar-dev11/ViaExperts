<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entreprises', function (Blueprint $table) {
            $table->unsignedBigInteger('party_id');
            $table->string('type', 10)->default('entreprise');

            $table->string('denomination', 200);
            $table->string('tribunal', 150)->nullable();
            $table->string('forme_juridique', 30)->default('SARL');
            $table->string('ice', 20)->nullable();
            $table->string('rc', 30)->nullable();
            $table->string('if', 20)->nullable();
            $table->string('tp', 20)->nullable();
            $table->string('cnss', 20)->nullable();
            $table->date('date_debut_activite')->nullable();
            $table->decimal('capital', 12, 2)->nullable();
            $table->string('situation', 30)->default('Normale');
            $table->string('single', 150)->nullable();
            $table->string('periode_declaration_tva', 15)->default('Mensuel');
            $table->string('local', 40)->nullable();
            $table->unsignedBigInteger('centre_domiciliation_id')->nullable();
            $table->unsignedBigInteger('client_id')->nullable();
            $table->string('numero_dossier', 50)->nullable();
            $table->string('numero_archive', 50)->nullable();
            $table->text('observation')->nullable();

            $table->primary('party_id');
            $table->unique('ice');
            $table->unique('if');
            $table->unique(['tribunal', 'rc']);

            $table->foreign(['party_id', 'type'])
                ->references(['id', 'type'])->on('parties')
                ->onDelete('cascade')->onUpdate('cascade');

            $table->foreign('centre_domiciliation_id')->references('id')->on('centres_domiciliation')
                ->onDelete('restrict')->onUpdate('cascade');

            $table->foreign('client_id')->references('party_id')->on('clients')
                ->onDelete('set null')->onUpdate('cascade');
        });

        DB::statement("ALTER TABLE entreprises ADD CONSTRAINT chk_entreprises_type CHECK (type = 'entreprise')");
    }

    public function down(): void
    {
        Schema::dropIfExists('entreprises');
    }
};
