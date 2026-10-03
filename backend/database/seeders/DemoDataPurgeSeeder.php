<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * DemoDataPurgeSeeder — retire INTÉGRALEMENT le jeu de démonstration.
 *
 * Il ne supprime QUE ce que `DemoDataSeeder` a créé, reconnu par ses marqueurs
 * (voir l'en-tête de `DemoDataSeeder`). Les données réelles — 11 centres
 * métier, comptes Hajar et Aya, 148 permissions, paramètres cabinet et
 * domiciliation avec leurs logos — ne sont jamais touchées.
 *
 * L'ordre de suppression respecte les clés étrangères :
 * les tables filles (RESTRICT) partent avant leurs parents.
 *
 * Lancer : php artisan db:seed --class=DemoDataPurgeSeeder --force
 */
class DemoDataPurgeSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            // --- Identification du périmètre de démonstration -----------------
            $clientIds = DB::table('clients')->where('cin', 'like', 'DEMO-C%')->pluck('party_id');
            $entrepriseIds = DB::table('entreprises')->where('numero_dossier', 'like', 'DEMO-E%')->pluck('party_id');
            $partyIds = $clientIds->merge($entrepriseIds)->unique()->values();

            $userIds = DB::table('users')
                ->where('email', 'like', '%@' . DemoDataSeeder::DOMAINE_DEMO)
                ->pluck('id');

            $serviceIds = DB::table('services')->where('nom', 'like', '[Démo]%')->pluck('id');
            $centreIds = DB::table('centres_domiciliation')->where('nom', 'like', '[Démo]%')->pluck('id');

            // --- 1. Paiements (RESTRICT sur parties) --------------------------
            //     `paiement_lignes` part en cascade.
            DB::table('paiements')->where('reference', 'like', '#D%')->delete();

            // --- 2. Documents commerciaux (RESTRICT sur parties) --------------
            //     `document_lignes` part en cascade.
            DB::table('documents_commerciaux')->where('numero', 'like', 'D-%')->delete();

            // --- 3. Déclarations TVA / CA (CASCADE depuis entreprises, mais on
            //        les retire explicitement pour rester lisible) -------------
            if ($entrepriseIds->isNotEmpty()) {
                DB::table('declarations_tva')->whereIn('entreprise_id', $entrepriseIds)->delete();
                DB::table('domiciliations')->whereIn('entreprise_id', $entrepriseIds)->delete();
            }

            // --- 4. Services en cours (RESTRICT sur services) -----------------
            if ($clientIds->isNotEmpty()) {
                DB::table('service_en_cours')->whereIn('client_id', $clientIds)->delete();
            }

            // --- 5. Cachets et mails ------------------------------------------
            if ($partyIds->isNotEmpty()) {
                DB::table('cachets')->whereIn('party_id', $partyIds)->delete();
                DB::table('mails')->whereIn('party_id', $partyIds)->delete();
            }

            // --- 6. Rapports et Data Center -----------------------------------
            DB::table('rapports')->where('rapport_de', 'like', '[Démo]%')->delete();
            DB::table('data_center_fiches')->where('denomination', 'like', '[Démo]%')->delete();

            // --- 7. Tiers : clients et entreprises partent en cascade ---------
            if ($partyIds->isNotEmpty()) {
                DB::table('parties')->whereIn('id', $partyIds)->delete();
            }

            // --- 8. Catalogue de services et centres de démonstration ---------
            if ($serviceIds->isNotEmpty()) {
                DB::table('services')->whereIn('id', $serviceIds)->delete();
            }
            if ($centreIds->isNotEmpty()) {
                DB::table('centres_domiciliation')->whereIn('id', $centreIds)->delete();
            }

            // --- 9. Statuts de démonstration ----------------------------------
            foreach (['service_statuses', 'cachet_statuses', 'mail_statuses'] as $table) {
                DB::table($table)->where('nom', 'like', '[Démo]%')->delete();
            }

            // --- 10. Chat puis comptes de démonstration -----------------------
            if ($userIds->isNotEmpty()) {
                DB::table('chat_messages')
                    ->whereIn('sender_id', $userIds)
                    ->orWhereIn('recipient_id', $userIds)
                    ->delete();
                // `user_permissions` part en cascade avec l'utilisateur.
                DB::table('users')->whereIn('id', $userIds)->delete();
            }
        });

        $this->command?->info('Jeu de démonstration purgé. Les données réelles sont intactes.');
    }
}
