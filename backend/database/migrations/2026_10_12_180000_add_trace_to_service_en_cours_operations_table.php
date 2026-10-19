<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Trace complète d'une activité de « Services en cours » (fil « Activité Services ») :
     *
     *   - `action`            ce qui s'est passé : creation | statut | commentaire | fichier (les lignes déjà enregistrées gardent
     *                         « operation » : on ne sait plus ce qu'elles étaient, on n'invente rien) ;
     *   - `ancien_status_id`  statut AVANT un changement de statut (le nouveau reste `service_status_id`) ;
     *   - `source_*`          document à l'origine de la création automatique (facture, paiement, déclaration TVA…) et, quand il
     *                         en a un, SA pièce jointe. Ce fichier appartient au document d'origine : il est seulement référencé ici,
     *                         jamais copié ni supprimé avec le service. Il est distinct de `fichier_*`, ajouté à la main au service.
     *
     * Colonnes ajoutées seulement : aucune donnée existante n'est modifiée ni supprimée.
     */
    public function up(): void
    {
        Schema::table('service_en_cours_operations', function (Blueprint $table) {
            $table->string('action', 20)->default('operation')->after('service_en_cours_id');
            $table->unsignedBigInteger('ancien_status_id')->nullable()->after('service_status_id');
            $table->string('source_type', 30)->nullable()->after('fichier_chemin');
            $table->unsignedBigInteger('source_id')->nullable()->after('source_type');
            $table->string('source_fichier_nom', 200)->nullable()->after('source_id');
            $table->string('source_fichier_chemin', 255)->nullable()->after('source_fichier_nom');

            $table->foreign('ancien_status_id')->references('id')->on('service_statuses')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('service_en_cours_operations', function (Blueprint $table) {
            $table->dropForeign(['ancien_status_id']);
            $table->dropColumn([
                'action', 'ancien_status_id', 'source_type', 'source_id', 'source_fichier_nom', 'source_fichier_chemin',
            ]);
        });
    }
};
