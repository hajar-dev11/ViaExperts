<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('nom', 100)->unique();
            $table->string('couleur_texte', 7);
            $table->string('couleur_fond', 7);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_statuses');
    }
};
