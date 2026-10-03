<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Le catalogue de permissions couvre désormais tous les modules de la maquette
     * de référence. Certaines actions dépassent 30 caractères
     * (ex. ajouter_centre_domiciliation_bon_livraison = 42), d'où l'élargissement.
     *
     * ALTER TABLE brut plutôt que ->change() : doctrine/dbal n'est pas installé
     * et n'a pas à l'être pour ça.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE permissions MODIFY action VARCHAR(80) NOT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE permissions MODIFY action VARCHAR(30) NOT NULL');
    }
};
