<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    /**
     * Catalogue de permissions de la maquette de référence (permissions_assistance.json).
     *
     * ⚠️ Seules les permissions `clients` et `entreprises` (hors liste_noire/bloquer) sont
     * réellement appliquées aujourd'hui, via le middleware `permission:<module>,<action>`
     * sur les routes Clients/Entreprises. Les autres modules n'ont pas encore de backend :
     * leurs permissions sont attribuables dans Paramètres → Assistance, mais ne contrôlent
     * encore aucun accès. Elles seront branchées au fur et à mesure des modules.
     *
     * Les clés d'action de `clients`/`entreprises` restent celles d'origine
     * (create/update/delete) : les renommer casserait les routes existantes.
     * Seuls les libellés affichés côté frontend suivent la maquette.
     */
    public const CATALOGUE = [
        'clients' => [
            'list', 'create', 'update', 'archive', 'corbeille', 'delete',
            'add_observation', 'add_document',
        ],

        'entreprises' => [
            'list', 'create', 'update', 'archive', 'corbeille', 'delete',
            'add_observation', 'add_document', 'liste_noire', 'bloquer',
        ],

        'domiciliation' => [
            'ajouter', 'renouveler', 'facture', 'contrat', 'attestation', 'procuration',
            'resilier', 'corbeille', 'archive', 'supprimer', 'list', 'gestion', 'calendrier',
            'centres_list', 'ajouter_centres', 'modifier_centres', 'export_list',
            // Cycle archive/corbeille/suppression définitive des centres de domiciliation
            // (ajouté en même temps que leur backend — jusqu'ici seules les permissions
            // list/ajouter/modifier existaient, et l'accès réel passait par le garde
            // `admin` brut des routes plutôt que par ce catalogue).
            'archive_centres', 'corbeille_centres', 'supprimer_centres',
        ],

        'services' => [
            'ajouter', 'modifier', 'archive', 'corbeille', 'supprimer', 'list',
        ],

        'services_en_cours' => [
            'modifier', 'archive', 'corbeille', 'supprimer', 'list',
        ],

        'facturation' => [
            'ajouter_facture', 'ajouter_devis', 'ajouter_bon_livraison', 'ajouter_facture_avoir',
            'liste_facture', 'liste_devis', 'liste_bon_livraison', 'liste_facture_avoir',
            'ajouter_centre_domiciliation_facture', 'ajouter_centre_domiciliation_devis',
            'ajouter_centre_domiciliation_bon_livraison', 'ajouter_centre_domiciliation_facture_avoir',
            'ajouter_bureau_comptabilite_facture', 'ajouter_bureau_comptabilite_devis',
            'ajouter_bureau_comptabilite_bon_livraison', 'ajouter_bureau_comptabilite_facture_avoir',
            'exporter_list_facture', 'exporter_list_devis', 'exporter_list_bon_livraison',
            'exporter_list_facture_avoir',
            'archive_facture', 'archive_devis', 'archive_bon_livraison', 'archive_facture_avoir',
            'corbeille_facture', 'corbeille_devis', 'corbeille_bon_livraison', 'corbeille_facture_avoir',
            'supprimer_facture', 'supprimer_devis', 'supprimer_bon_livraison', 'supprimer_facture_avoir',
        ],

        'paiements' => [
            'ajouter_paiement', 'ajouter_centre_domiciliation_paiement',
            'ajouter_bureau_comptabilite_paiement', 'modifier_date_credits',
            'gestion_paiements', 'list_paiements', 'exporter', 'archive', 'corbeille', 'supprimer',
        ],

        'mouvement' => [
            'mouvement_entres_recu', 'mouvement_entres_facture',
        ],

        'declaration' => [
            'ajouter', 'modifier', 'importeur', 'liste',
            'sauvegarder_non_declare', 'sauvegarder_declaree',
            'exporter_zip', 'exporter_xml', 'exporter_excel', 'exporter_list',
            'archive', 'corbeille', 'supprimer',
        ],

        'cashet' => [
            'list', 'ajouter', 'modifier', 'archive', 'corbeille', 'supprimer',
        ],

        'mails' => [
            'list', 'ajouter', 'modifier', 'archive', 'corbeille', 'supprimer',
        ],

        'data_center' => [
            'list', 'ajouter', 'modifier', 'archive', 'corbeille', 'supprimer',
        ],

        'chiffre_affaire' => [
            'ajouter', 'modifier', 'liste',
            'sauvegarder_non_declare', 'sauvegarder_declaree',
            'exporter_excel', 'exporter_list',
            'archive', 'corbeille', 'supprimer',
        ],

        'parametre' => [
            'account', 'mot_de_passe', 'bureau_comptabilite', 'centre_domiciliation',
            'ajouter_services_status', 'ajouter_cashet_status', 'ajouter_mail_status',
            'ajouter_assistance',
        ],

        // ------------------------------------------------------------------
        // Groupes AJOUTÉS APRÈS la maquette de référence.
        //
        // `permissions_assistance.json` ne les contient pas, parce que la maquette
        // n'affiche pas ces deux modules dans sa matrice. Mais les modules Chat et
        // Rapports existent réellement ici, avec leurs routes : sans ces clés, ils
        // restaient ouverts à TOUT utilisateur authentifié, ce qui contredit la
        // règle « non-admin = refus par défaut ».
        //
        // Les actions reprennent la nomenclature des groupes voisins
        // (cashet / mails / data_center) : rien n'est inventé au-delà du nécessaire.
        // ------------------------------------------------------------------
        'rapports' => [
            'list', 'ajouter', 'modifier', 'archive', 'corbeille', 'supprimer',
        ],

        'chat' => [
            'list', 'envoyer', 'modifier', 'supprimer',
        ],
    ];

    public function run(): void
    {
        foreach (self::CATALOGUE as $module => $actions) {
            foreach ($actions as $action) {
                Permission::firstOrCreate(['module' => $module, 'action' => $action]);
            }
        }
    }
}
