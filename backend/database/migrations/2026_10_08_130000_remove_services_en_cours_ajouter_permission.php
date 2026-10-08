<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * La création manuelle d'un « Service en cours » n'existe plus (route `POST /services-en-cours`, méthode `store` et bouton
 * « Ajouter un Service en Cours » supprimés) : les services ne sont créés que par les actions métier prévues (Facture,
 * Devis, Bon de livraison, Facture d'avoir, Paiement).
 *
 * La permission `services_en_cours.ajouter` ne protégeait que cette route : elle est retirée du catalogue
 * (`PermissionSeeder`) et, ici, des bases déjà installées — sans quoi la case « Ajouter » resterait affichée dans
 * Paramètres → Assistance sans plus rien commander. Les droits accordés sur cette permission disparaissent avec elle
 * (suppression en cascade de `user_permissions`) ; les autres permissions du module ne sont pas touchées.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->where('module', 'services_en_cours')->where('action', 'ajouter')->delete();
    }

    public function down(): void
    {
        // Rétablit la permission (sans ses anciens octrois) : `PermissionSeeder` ne la recrée plus.
        DB::table('permissions')->updateOrInsert(
            ['module' => 'services_en_cours', 'action' => 'ajouter'],
            ['created_at' => now(), 'updated_at' => now()]
        );
    }
};
