<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Facturation — une seule table pour les 4 types de documents
     * (facture / devis / bon de livraison / facture d'avoir).
     *
     * Les captures de référence montrent 4 écrans identiques au type près, et le
     * frontend utilise déjà 2 composants génériques (DocumentList / DocumentForm)
     * pour les 4 sous-modules : une table typée évite 4 tables jumelles.
     *
     * `emetteur` reflète les 2 options de l'écran « Ajouter Facture » :
     *   - 'via_experts'          → numérotation et branding de `domiciliation_settings`
     *   - 'bureau_comptabilite'  → numérotation et branding de `cabinet_settings`
     * Les deux tables de paramètres portent les mêmes blocs de numérotation
     * (facture_/devis_/bl_/avoir_ prefixe + prochain_numero + suffixe).
     *
     * PRIX PAYÉ / PRIX RESTANT — décision métier validée : option C (hybride).
     *   - `prix_paye` est STOCKÉ ici, saisissable à la création (champ blanc dans la capture) ;
     *   - il est ensuite mis à jour transactionnellement par le module Paiements ;
     *   - `prix_restant` n'est PAS stocké : il vaut total_ttc - prix_paye (champ grisé).
     */
    public function up(): void
    {
        Schema::create('documents_commerciaux', function (Blueprint $table) {
            $table->id();

            $table->string('type', 10);      // facture | devis | bl | avoir
            $table->string('emetteur', 30);  // via_experts | bureau_comptabilite
            $table->string('responsable', 150)->nullable(); // libellé affiché en colonne RESPONSABLE

            $table->unsignedBigInteger('party_id'); // colonne CLIENT/ENTREPRISE de la capture
            $table->string('numero', 60);

            $table->dateTime('date_document');
            $table->date('date_paiement')->nullable();
            $table->date('date_credit')->nullable();
            $table->string('mode_paiement', 40)->nullable();
            $table->boolean('signature')->default(false);
            $table->text('note')->nullable();

            $table->decimal('total_ht', 12, 2)->default(0);
            $table->decimal('total_remise', 12, 2)->default(0);
            $table->decimal('total_net_ht', 12, 2)->default(0);
            $table->decimal('total_tva', 12, 2)->default(0);
            $table->decimal('total_ttc', 12, 2)->default(0);
            $table->decimal('prix_paye', 12, 2)->default(0);

            $table->string('status', 20)->default('actif');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            // Un même numéro ne peut pas servir deux fois pour un même type de document.
            $table->unique(['type', 'numero']);
            $table->index(['type', 'status']);

            $table->foreign('party_id')->references('id')->on('parties')
                ->onDelete('restrict')->onUpdate('cascade');

            $table->foreign('created_by')->references('id')->on('users')
                ->onDelete('set null')->onUpdate('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents_commerciaux');
    }
};
