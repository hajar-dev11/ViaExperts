<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_admin')->default(false)->after('email');
            $table->string('fonction', 30)->nullable()->after('is_admin'); // Assistant | Comptable | Autre — informatif uniquement
            $table->string('telephone', 30)->nullable()->after('fonction');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['is_admin', 'fonction', 'telephone']);
        });
    }
};
