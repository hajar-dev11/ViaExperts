<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Migration ADDITIVE : ajoute l'observation du mail, demandée au formulaire « Ajouter Mail » (capture de référence). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mails', function (Blueprint $table) {
            $table->string('observation', 500)->nullable()->after('date_depart');
        });
    }

    public function down(): void
    {
        Schema::table('mails', function (Blueprint $table) {
            $table->dropColumn('observation');
        });
    }
};
