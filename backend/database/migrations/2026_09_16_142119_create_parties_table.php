<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parties', function (Blueprint $table) {
            $table->id();
            $table->string('type', 10); // client | entreprise
            $table->string('status', 10)->default('actif'); // actif | archive | corbeille
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['id', 'type'], 'uq_parties_id_type');
            $table->index('type');
            $table->index('status');
        });

        DB::statement("ALTER TABLE parties ADD CONSTRAINT chk_parties_type CHECK (type IN ('client', 'entreprise'))");
        DB::statement("ALTER TABLE parties ADD CONSTRAINT chk_parties_status CHECK (status IN ('actif', 'archive', 'corbeille'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('parties');
    }
};
