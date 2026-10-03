<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('centres_domiciliation', function (Blueprint $table) {
            $table->id();
            $table->string('nom', 150)->unique();
            $table->string('if', 20)->nullable();
            $table->string('ice', 20)->nullable();
            $table->string('ville', 80)->nullable();
            $table->string('adresse', 255)->nullable();
            $table->string('telephone', 30)->nullable();
            $table->timestamps();
        });

        // 11 centres réels déjà utilisés par l'application — données métier, pas de démonstration.
        $noms = [
            'CS Plus',
            'VIA EXPERTS',
            'VIVENDIS INVEST',
            'MA EXPERTISE SERVICES',
            'FIDU-FISCASS CONSULTING & SERVICES MOROCCO',
            'MOORISH ACCOUNTING GROUP',
            'stratflow consulting',
            'RECAT BUSINESS GROUP',
            "CENTRE RAKEM D'AFFAIRES",
            'ALMAGHRIBIA LITATWIN',
            'MACHROUHI AFFAIRE',
        ];

        $now = now();
        DB::table('centres_domiciliation')->insert(
            array_map(fn ($nom) => ['nom' => $nom, 'created_at' => $now, 'updated_at' => $now], $noms)
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('centres_domiciliation');
    }
};
