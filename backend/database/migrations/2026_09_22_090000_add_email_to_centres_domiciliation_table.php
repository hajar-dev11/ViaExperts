<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Migration ADDITIVE : ajoute l'email du centre, demandé au formulaire « Ajouter Centre de domiciliation ». */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('centres_domiciliation', function (Blueprint $table) {
            $table->string('email', 150)->nullable()->after('telephone');
        });
    }

    public function down(): void
    {
        Schema::table('centres_domiciliation', function (Blueprint $table) {
            $table->dropColumn('email');
        });
    }
};
