<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cabinet_settings', function (Blueprint $table) {
            $table->string('logo_path', 255)->nullable()->after('id');
            $table->string('signature_path', 255)->nullable()->after('logo_path');
        });
    }

    public function down(): void
    {
        Schema::table('cabinet_settings', function (Blueprint $table) {
            $table->dropColumn(['logo_path', 'signature_path']);
        });
    }
};
