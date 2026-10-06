<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * DemoDataSeeder — jeu de données ENTIÈREMENT FICTIF pour tester l'application.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ RÈGLES DE SÛRETÉ                                                          │
 * │                                                                           │
 * │ • Ce seeder est ADDITIF : il ne modifie ni ne supprime AUCUNE donnée      │
 * │   réelle (11 centres métier, comptes Hajar et Aya, 148 permissions,      │
 * │   123 attributions, paramètres cabinet/domiciliation avec leurs logos).  │
 * │ • Il est IDEMPOTENT : il purge son propre jeu de démo avant de le        │
 * │   recréer. Le relancer ne crée jamais de doublon.                        │
 * │ • Tout ce qu'il crée est RECONNAISSABLE et donc supprimable proprement :  │
 * │                                                                           │
 * │      clients            cin      = DEMO-C…                                │
 * │      entreprises        n° dossier = DEMO-E…                              │
 * │      centres            nom      commence par « [Démo] »                  │
 * │      services           nom      commence par « [Démo] »                  │
 * │      statuts            nom      commence par « [Démo] »                  │
 * │      data center        dénom.   commence par « [Démo] »                  │
 * │      rapports           rapport_de commence par « [Démo] »                │
 * │      documents comm.    numéro   commence par « D-  »                     │
 * │      paiements          référence commence par « #D »                     │
 * │      utilisateurs       email    @demo.viaexperts.test                    │
 * │                                                                           │
 * │   tout le reste (domiciliations, lignes, opérations, observations,       │
 * │   déclarations, cachets, mails, services en cours, chat) est rattaché    │
 * │   à ces enregistrements et purgé avec eux.                               │
 * │                                                                           │
 * │ ⛔ NE JAMAIS utiliser `migrate:fresh` : ce seeder n'en a pas besoin.       │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Lancer :   php artisan db:seed --class=DemoDataSeeder --force
 * Purger :   php artisan db:seed --class=DemoDataPurgeSeeder --force
 */
class DemoDataSeeder extends Seeder
{
    /** Domaine de messagerie réservé aux comptes de démonstration. */
    public const DOMAINE_DEMO = 'demo.viaexperts.test';

    /** Mot de passe des comptes de démonstration : généré à chaque exécution, affiché une seule fois dans la console. */
    private string $motDePasseDemo;

    private int $adminId;
    private Carbon $today;

    /** @var array<string,int> dénomination/nom → party_id */
    private array $parties = [];
    private array $centres = [];
    private array $services = [];
    private array $statuts = [];
    private array $users = [];

    public function run(): void
    {
        // Jeu fictif avec comptes de démonstration : ne doit JAMAIS tourner en production.
        if (app()->environment('production')) {
            throw new \RuntimeException('DemoDataSeeder est interdit en production.');
        }

        $this->motDePasseDemo = Str::random(20);
        $this->today = Carbon::today();
        $this->adminId = (int) (DB::table('users')->where('is_admin', true)->min('id') ?? 1);

        DB::transaction(function () {
            (new DemoDataPurgeSeeder())->run();

            $this->creerUtilisateurs();
            $this->creerStatuts();
            $this->creerCentres();
            $this->creerServices();
            $this->creerClients();
            $this->creerEntreprises();
            $this->creerDomiciliations();
            $this->creerHistoriqueDomiciliations();
            $this->creerScenariosAlerte();
            $this->creerServicesEnCours();
            $this->creerDocumentsCommerciaux();
            $this->creerPaiements();
            $this->creerDeclarations();
            $this->creerRapports();
            $this->creerCachetsEtMails();
            $this->creerDataCenter();
            $this->creerChat();
        });

        $this->command?->info('Mot de passe des comptes de démonstration (@'.self::DOMAINE_DEMO.') : '.$this->motDePasseDemo);
        $this->command?->info('Jeu de démonstration créé. Purge : php artisan db:seed --class=DemoDataPurgeSeeder --force');
    }

    // =========================================================================
    //  Utilisateurs de test (non-admin) — pour éprouver les 403
    // =========================================================================
    private function creerUtilisateurs(): void
    {
        $comptes = [
            ['Demo Assistante', 'assistante@' . self::DOMAINE_DEMO, 'Assistant', ['clients', 'entreprises']],
            ['Demo Comptable', 'comptable@' . self::DOMAINE_DEMO, 'Comptable', ['facturation', 'paiements', 'declaration']],
            ['Demo Stagiaire', 'stagiaire@' . self::DOMAINE_DEMO, 'Autre', []],
        ];

        foreach ($comptes as [$nom, $email, $fonction, $modules]) {
            $id = DB::table('users')->insertGetId([
                'name' => $nom,
                'email' => $email,
                'password' => Hash::make($this->motDePasseDemo),
                'is_admin' => false,
                'fonction' => $fonction,
                'telephone' => '06 00 00 00 00',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->users[$email] = $id;

            // Quelques permissions seulement : le reste doit renvoyer 403.
            if ($modules !== []) {
                $permissions = DB::table('permissions')->whereIn('module', $modules)->pluck('id');
                foreach ($permissions as $pid) {
                    DB::table('user_permissions')->insert([
                        'user_id' => $id, 'permission_id' => $pid,
                        'granted_by' => $this->adminId, 'granted_at' => now(),
                    ]);
                }
            }
        }
    }

    // =========================================================================
    //  Statuts (Paramètres → Services / Cachet / Mail)
    // =========================================================================
    private function creerStatuts(): void
    {
        $palette = [
            ['[Démo] En cours', '#7367f0', '#f3f2fe'],
            ['[Démo] En attente', '#d4761a', '#fff4e9'],
            ['[Démo] Terminé', '#1c9553', '#e8f9f0'],
        ];

        foreach (['service_statuses', 'cachet_statuses', 'mail_statuses'] as $table) {
            foreach ($palette as [$nom, $texte, $fond]) {
                $this->statuts[$table][] = DB::table($table)->insertGetId([
                    'nom' => $nom, 'couleur_texte' => $texte, 'couleur_fond' => $fond,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    // =========================================================================
    //  Centres de domiciliation fictifs (les 11 réels ne sont pas touchés)
    // =========================================================================
    private function creerCentres(): void
    {
        $lignes = [
            ['[Démo] Centre Atlas Business', 'Casablanca', '12 rue des Palmiers Fictifs', '05 00 00 00 01'],
            ['[Démo] Centre Anfa Partners', 'Rabat', '45 avenue Imaginaire', '05 00 00 00 02'],
        ];

        foreach ($lignes as $i => [$nom, $ville, $adresse, $tel]) {
            $this->centres[] = DB::table('centres_domiciliation')->insertGetId([
                'nom' => $nom,
                'if' => '9000000' . $i,
                'ice' => '00000000000' . str_pad((string) (90 + $i), 2, '0', STR_PAD_LEFT),
                'ville' => $ville, 'adresse' => $adresse, 'telephone' => $tel,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    // =========================================================================
    //  Catalogue de services
    // =========================================================================
    private function creerServices(): void
    {
        $lignes = [
            ['[Démo] Création d\'entreprise', 3500, 'actif', true],
            ['[Démo] Déclaration CNSS', 800, 'actif', true],
            ['[Démo] Bilan annuel', 6000, 'actif', false],
            ['[Démo] Déclaration TVA mensuelle', 450, 'actif', true],
            ['[Démo] Certificat négatif', 300, 'actif', true],
            ['[Démo] Service clôturé', 1200, 'archive', false],
        ];

        foreach ($lignes as [$nom, $prix, $status, $viaExperts]) {
            $this->services[] = DB::table('services')->insertGetId([
                'via_experts' => $viaExperts,
                'maitre' => 'Morad Bendeq',
                'nom' => $nom, 'prix' => $prix, 'status' => $status,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    // =========================================================================
    //  Clients — actifs / archivé / corbeille
    // =========================================================================
    private function creerClients(): void
    {
        $lignes = [
            ['Amine Benali', 'Mr', 'actif'],
            ['Salma Cherkaoui', 'Mme', 'actif'],
            ['Youssef Tazi', 'Mr', 'actif'],
            ['Nadia El Fassi', 'Mme', 'actif'],
            ['Karim Idrissi', 'Mr', 'actif'],
            ['Imane Bouzid', 'Mme', 'actif'],
            ['Omar Sabri', 'Mr', 'archive'],
            ['Hind Lamrani', 'Mme', 'corbeille'],
        ];

        foreach ($lignes as $i => [$nom, $genre, $status]) {
            $n = $i + 1;
            $partyId = DB::table('parties')->insertGetId([
                'type' => 'client', 'status' => $status,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            DB::table('clients')->insert([
                'party_id' => $partyId, 'type' => 'client',
                'genre' => $genre, 'nom' => $nom, 'nom_ar' => null,
                'nationalite' => 'MAROCAINE',
                'date_naissance' => $this->today->copy()->subYears(30 + $i)->toDateString(),
                'cin' => sprintf('DEMO-C%03d', $n),
                'email' => sprintf('client%02d@exemple-demo.ma', $n),
                'telephone' => sprintf('06 00 00 %02d %02d', $n, $n),
                'telephone_2' => null,
                'adresse' => sprintf('%d rue Fictive, Quartier Démo, Casablanca', 10 + $n),
                'adresse_ar' => null,
            ]);

            $this->parties['client:' . $nom] = $partyId;
        }
    }

    // =========================================================================
    //  Entreprises — dont 6 domiciliées, 2 archivées, 1 en corbeille
    // =========================================================================
    private function creerEntreprises(): void
    {
        $clients = array_values(array_filter(
            $this->parties,
            fn ($k) => str_starts_with($k, 'client:'),
            ARRAY_FILTER_USE_KEY
        ));

        $lignes = [
            ['DEMO ATLAS TRADING', 'SARL', 'Casablanca', 'actif', true],
            ['DEMO SAHARA LOGISTICS', 'SARL AU', 'Casablanca', 'actif', true],
            ['DEMO MEDINA CONSEIL', 'SARL', 'Rabat', 'actif', true],
            ['DEMO ARGAN DISTRIBUTION', 'SA', 'Marrakech', 'actif', true],
            ['DEMO OASIS DIGITAL', 'SARL AU', 'Casablanca', 'actif', true],
            ['DEMO ZELLIGE ARTISANAT', 'SNC', 'Fès', 'actif', true],
            ['DEMO CEDRE IMMOBILIER', 'SARL', 'Tanger', 'actif', false],
            ['DEMO TAFILALET AGRO', 'SARL', 'Agadir', 'archive', false],
            ['DEMO RIF TEXTILE', 'SARL AU', 'Tétouan', 'archive', false],
            ['DEMO SOUSS EXPORT', 'SARL', 'Agadir', 'corbeille', false],
        ];

        $secteurs = [
            ['Commerce', 'Négoce de matériel de bureau'],
            ['Transport & Logistique', 'Transport routier de marchandises'],
            ['Conseil', 'Conseil en organisation'],
            ['Import-Export', 'Distribution alimentaire'],
            ['Informatique / IT', 'Développement logiciel'],
            ['Artisanat', 'Fabrication de zellige'],
        ];

        foreach ($lignes as $i => [$denom, $forme, $tribunal, $status, $domicilie]) {
            $n = $i + 1;
            $partyId = DB::table('parties')->insertGetId([
                'type' => 'entreprise', 'status' => $status,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            DB::table('entreprises')->insert([
                'party_id' => $partyId, 'type' => 'entreprise',
                'denomination' => $denom, 'tribunal' => $tribunal, 'forme_juridique' => $forme,
                'ice' => sprintf('90000000000%03d', $n),
                'rc' => sprintf('D%05d', 10000 + $n),
                'if' => sprintf('900%05d', $n),
                'tp' => sprintf('TP-D%04d', $n),
                'cnss' => sprintf('CNSS-D%05d', $n),
                'date_debut_activite' => $this->today->copy()->subMonths(18 + $i)->toDateString(),
                'capital' => 100000 * $n,
                'situation' => 'Normale',
                'single' => null,
                'periode_declaration_tva' => $i % 2 === 0 ? 'Mensuel' : 'Trimestriel',
                'local' => $domicilie ? 'Contrat de domiciliation' : 'Contrat de bail',
                'centre_domiciliation_id' => $domicilie ? $this->centres[$i % count($this->centres)] : null,
                'client_id' => $clients[$i % count($clients)] ?? null,
                'numero_dossier' => sprintf('DEMO-E%03d', $n),
                'numero_archive' => sprintf('BOX-D%02d', $n),
                'observation' => $i % 3 === 0 ? 'Dossier de démonstration — aucune valeur réelle.' : null,
            ]);

            // 1 à 2 secteurs par entreprise
            $nbSecteurs = ($i % 2) + 1;
            for ($s = 0; $s < $nbSecteurs; $s++) {
                [$secteur, $activite] = $secteurs[($i + $s) % count($secteurs)];
                DB::table('entreprise_secteurs')->insert([
                    'entreprise_id' => $partyId, 'secteur' => $secteur,
                    'activite' => $activite, 'ordre' => $s,
                ]);
            }

            $this->parties['entreprise:' . $denom] = $partyId;
        }
    }

    // =========================================================================
    //  Domiciliations — tous les statuts + renouvellements + mois gratuits
    // =========================================================================
    private function creerDomiciliations(): void
    {
        $e = fn (string $nom) => $this->parties['entreprise:' . $nom];

        // [entreprise, mois avant aujourd'hui pour le départ, durée en mois,
        //  mois payés, mois gratuits, etat, status, prix/mois]
        $lignes = [
            // --- Actives (échéance lointaine) ---
            [$e('DEMO ATLAS TRADING'), 2, 12, 12, 0, 'active', 'actif', 500],
            [$e('DEMO MEDINA CONSEIL'), 4, 12, 10, 2, 'active', 'actif', 450],
            [$e('DEMO OASIS DIGITAL'), 1, 24, 24, 0, 'active', 'actif', 600],

            // --- ALERTE : échéance dans 10 et 25 jours (bandeau rose de la topbar) ---
            [$e('DEMO SAHARA LOGISTICS'), 12, 12, 12, 0, 'active', 'actif', 550, 10],
            [$e('DEMO ARGAN DISTRIBUTION'), 11, 12, 11, 1, 'active', 'actif', 500, 25],

            // --- Déclarées ---
            [$e('DEMO ZELLIGE ARTISANAT'), 6, 12, 12, 0, 'declare', 'actif', 400],
            [$e('DEMO ATLAS TRADING'), 20, 12, 12, 0, 'declare', 'actif', 480],

            // --- Résiliées ---
            [$e('DEMO MEDINA CONSEIL'), 22, 12, 6, 0, 'resilie', 'actif', 450],
            [$e('DEMO CEDRE IMMOBILIER'), 18, 12, 12, 0, 'resilie', 'actif', 520],

            // --- Expirées (date de fin dépassée, jamais renouvelées) ---
            [$e('DEMO TAFILALET AGRO'), 26, 12, 12, 0, 'active', 'actif', 430],
            [$e('DEMO RIF TEXTILE'), 30, 12, 9, 3, 'active', 'actif', 410],

            // --- RENOUVELLEMENTS : 2e et 3e contrat des mêmes entreprises ---
            [$e('DEMO SAHARA LOGISTICS'), 24, 12, 12, 0, 'active', 'actif', 500],
            [$e('DEMO ARGAN DISTRIBUTION'), 23, 12, 12, 0, 'active', 'actif', 470],
            [$e('DEMO ZELLIGE ARTISANAT'), 18, 12, 12, 0, 'active', 'actif', 390],

            // --- Archivée / corbeille (pour Archive et Corbeille) ---
            [$e('DEMO OASIS DIGITAL'), 28, 12, 12, 0, 'active', 'archive', 600],
            [$e('DEMO CEDRE IMMOBILIER'), 32, 12, 12, 0, 'active', 'corbeille', 520],
        ];

        foreach ($lignes as $i => $l) {
            [$entrepriseId, $moisAvant, $duree, $moisPayee, $moisGratuits, $etat, $status, $prixMois] = $l;
            $joursAvantFin = $l[8] ?? null;

            $depart = $this->today->copy()->subMonths($moisAvant);
            $fin = $joursAvantFin !== null
                ? $this->today->copy()->addDays($joursAvantFin)
                : $depart->copy()->addMonths($duree);

            DB::table('domiciliations')->insert([
                'entreprise_id' => $entrepriseId,
                'centre_domiciliation_id' => $this->centres[$i % count($this->centres)],
                'mois_payee' => $moisPayee, 'mois_gratuits' => $moisGratuits,
                'date_depart' => $depart->toDateString(),
                'date_fin' => $fin->toDateString(),
                'mode_paiement' => ['Virement', 'Chèque', 'Espèce', 'Crédit'][$i % 4],
                'prix_par_mois' => $prixMois,
                'prix_total' => $prixMois * $moisPayee,
                'signature_sur_facture' => $i % 3 !== 0,
                'date_facture' => $depart->toDateString(),
                'date_paiement' => $depart->copy()->addDays(5)->toDateString(),
                'date_legalisation' => $i % 2 === 0 ? $depart->copy()->addDays(10)->toDateString() : null,
                'doc_facture' => true,
                'doc_contrat' => $i % 2 === 0,
                'doc_attestation' => $i % 3 === 0,
                'doc_procuration' => false,
                'etat' => $etat, 'status' => $status,
                'date_resiliation' => $etat === 'resilie' ? $depart->copy()->addMonths(6)->toDateString() : null,
                'date_declaration' => $etat === 'declare' ? $depart->copy()->addMonths(1)->toDateString() : null,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $domId = (int) DB::getPdo()->lastInsertId();

            // Observations : présentes sur certaines seulement
            if ($i % 3 === 0) {
                DB::table('domiciliation_observations')->insert([
                    'domiciliation_id' => $domId,
                    'contenu' => 'Observation de démonstration n° ' . ($i + 1) . ' — contrat suivi par l\'assistante.',
                    'created_by' => $this->adminId,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            // Documents : présents sur certaines seulement (fichier non physique)
            if ($i % 4 === 0) {
                DB::table('domiciliation_documents')->insert([
                    'domiciliation_id' => $domId,
                    'nom' => 'Contrat-demo-' . ($i + 1) . '.pdf',
                    'chemin' => 'domiciliations/demo/contrat-' . ($i + 1) . '.pdf',
                    'mime' => 'application/pdf', 'taille' => 102400,
                    'uploaded_by' => $this->adminId,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    // =========================================================================
    //  Historique de domiciliation — volume réparti sur les 12 derniers mois
    //
    //  Objectif : alimenter réellement le graphique « Analyse de Domiciliation »
    //  et le donut « Expense Ratio » du tableau de bord, avec les 4 séries et
    //  une courbe qui varie d'un mois à l'autre. Les entreprises revenant
    //  plusieurs fois, les contrats suivants sont comptés en « Renouveler ».
    // =========================================================================
    private function creerHistoriqueDomiciliations(): void
    {
        $entreprises = array_values(array_filter(
            $this->parties,
            fn ($k) => str_starts_with($k, 'entreprise:'),
            ARRAY_FILTER_USE_KEY
        ));

        // Volume par mois (de M-11 à M-0) : profil irrégulier, comme la référence.
        $volumes = [5, 3, 6, 4, 7, 5, 8, 4, 6, 3, 7, 5];

        foreach ($volumes as $rang => $nb) {
            $moisAvant = 11 - $rang;

            for ($k = 0; $k < $nb; $k++) {
                $entrepriseId = $entreprises[($rang * 3 + $k) % count($entreprises)];
                $depart = $this->today->copy()->subMonths($moisAvant)->addDays(($k * 3) % 26);
                $duree = [6, 12, 12, 24][$k % 4];
                $moisPayee = $duree - ($k % 3);
                $moisGratuits = $k % 3;
                $prixMois = [380, 420, 450, 500, 550, 600][$k % 6];

                // Résiliation testée en premier : sinon la règle « déclaré »
                // capturerait le même rang et la série Résilier resterait vide.
                $etat = 'active';
                if ($k % 5 === 4) {
                    $etat = 'resilie';
                } elseif ($k % 4 === 1) {
                    $etat = 'declare';
                }

                DB::table('domiciliations')->insert([
                    'entreprise_id' => $entrepriseId,
                    'centre_domiciliation_id' => $this->centres[($rang + $k) % count($this->centres)],
                    'mois_payee' => $moisPayee, 'mois_gratuits' => $moisGratuits,
                    'date_depart' => $depart->toDateString(),
                    'date_fin' => $depart->copy()->addMonths($duree)->toDateString(),
                    'mode_paiement' => ['Virement', 'Chèque', 'Espèce', 'Traite', 'Versement'][$k % 5],
                    'prix_par_mois' => $prixMois,
                    'prix_total' => $prixMois * $moisPayee,
                    'signature_sur_facture' => $k % 2 === 0,
                    'date_facture' => $depart->toDateString(),
                    'date_paiement' => $depart->copy()->addDays(3)->toDateString(),
                    'date_legalisation' => null,
                    'doc_facture' => true,
                    'doc_contrat' => $k % 2 === 0,
                    'doc_attestation' => false,
                    'doc_procuration' => false,
                    'etat' => $etat,
                    // Un contrat sur neuf part en archive, pour peupler Archive.
                    'status' => ($rang * 7 + $k) % 9 === 0 ? 'archive' : 'actif',
                    'date_resiliation' => $etat === 'resilie'
                        ? $depart->copy()->addMonths(max(1, (int) ($duree / 2)))->toDateString()
                        : null,
                    'date_declaration' => $etat === 'declare'
                        ? $depart->copy()->addDays(20)->toDateString()
                        : null,
                    'created_by' => $this->adminId,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    // =========================================================================
    //  Scénarios d'ALERTE D'ÉCHÉANCE (bandeau de la barre supérieure)
    //
    //  La règle métier retenue est : une entreprise reste en alerte tant que son
    //  contrat LE PLUS RÉCENT arrive à échéance sous 30 jours — ou l'a déjà
    //  dépassée — et disparaît dès qu'un contrat plus récent la repousse.
    //
    //  Ces entreprises sont créées APRÈS l'historique pour qu'aucun contrat
    //  supplémentaire ne vienne les « renouveler » par accident. Chacune illustre
    //  un cas précis, y compris le cas de contrôle qui NE doit PAS s'afficher.
    // =========================================================================
    private function creerScenariosAlerte(): void
    {
        $scenarios = [
            // [dénomination, jours avant échéance (négatif = déjà expirée), renouvelée ?]
            ['DEMO ALERTE 8 JOURS', 8, false],
            ['DEMO ALERTE 22 JOURS', 22, false],
            ['DEMO EXPIREE NON RENOUVELEE', -15, false],
            ['DEMO EXPIREE PUIS RENOUVELEE', -40, true],
        ];

        foreach ($scenarios as $i => [$denom, $joursAvantFin, $renouvelee]) {
            $n = 100 + $i;

            $partyId = DB::table('parties')->insertGetId([
                'type' => 'entreprise', 'status' => 'actif',
                'created_at' => now(), 'updated_at' => now(),
            ]);

            DB::table('entreprises')->insert([
                'party_id' => $partyId, 'type' => 'entreprise',
                'denomination' => $denom, 'tribunal' => 'Casablanca', 'forme_juridique' => 'SARL',
                'ice' => sprintf('90000000000%03d', $n),
                'rc' => sprintf('D%05d', 10000 + $n),
                'if' => sprintf('900%05d', $n),
                'tp' => sprintf('TP-D%04d', $n),
                'cnss' => sprintf('CNSS-D%05d', $n),
                'date_debut_activite' => $this->today->copy()->subYears(2)->toDateString(),
                'capital' => 100000, 'situation' => 'Normale', 'single' => null,
                'periode_declaration_tva' => 'Trimestriel',
                'local' => 'Contrat de domiciliation',
                'centre_domiciliation_id' => $this->centres[$i % count($this->centres)],
                'client_id' => null,
                'numero_dossier' => sprintf('DEMO-E%03d', $n),
                'numero_archive' => sprintf('BOX-D%02d', $n),
                'observation' => 'Scénario d\'alerte d\'échéance (démonstration).',
            ]);

            $this->parties['entreprise:' . $denom] = $partyId;

            // Contrat courant, qui porte l'échéance testée.
            $fin = $this->today->copy()->addDays($joursAvantFin);
            $depart = $fin->copy()->subMonths(12);

            DB::table('domiciliations')->insert([
                'entreprise_id' => $partyId,
                'centre_domiciliation_id' => $this->centres[$i % count($this->centres)],
                'mois_payee' => 12, 'mois_gratuits' => 0,
                'date_depart' => $depart->toDateString(),
                'date_fin' => $fin->toDateString(),
                'mode_paiement' => 'Virement',
                'prix_par_mois' => 500, 'prix_total' => 6000,
                'signature_sur_facture' => true,
                'date_facture' => $depart->toDateString(),
                'date_paiement' => $depart->copy()->addDays(5)->toDateString(),
                'date_legalisation' => null,
                'doc_facture' => true, 'doc_contrat' => true,
                'doc_attestation' => false, 'doc_procuration' => false,
                'etat' => 'active', 'status' => 'actif',
                'date_resiliation' => null, 'date_declaration' => null,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            // Cas de contrôle : un contrat PLUS RÉCENT repousse l'échéance.
            // Cette entreprise ne doit PAS apparaître dans l'alerte.
            if ($renouvelee) {
                $nouveauDepart = $fin->copy()->addDay();
                DB::table('domiciliations')->insert([
                    'entreprise_id' => $partyId,
                    'centre_domiciliation_id' => $this->centres[$i % count($this->centres)],
                    'mois_payee' => 12, 'mois_gratuits' => 1,
                    'date_depart' => $nouveauDepart->toDateString(),
                    'date_fin' => $nouveauDepart->copy()->addMonths(12)->toDateString(),
                    'mode_paiement' => 'Virement',
                    'prix_par_mois' => 520, 'prix_total' => 6240,
                    'signature_sur_facture' => true,
                    'date_facture' => $nouveauDepart->toDateString(),
                    'date_paiement' => $nouveauDepart->toDateString(),
                    'date_legalisation' => null,
                    'doc_facture' => true, 'doc_contrat' => true,
                    'doc_attestation' => false, 'doc_procuration' => false,
                    'etat' => 'active', 'status' => 'actif',
                    'date_resiliation' => null, 'date_declaration' => null,
                    'created_by' => $this->adminId,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    // =========================================================================
    //  Services en cours + fil d'activité
    // =========================================================================
    private function creerServicesEnCours(): void
    {
        $clients = array_values(array_filter(
            $this->parties,
            fn ($k) => str_starts_with($k, 'client:'),
            ARRAY_FILTER_USE_KEY
        ));
        $statuts = $this->statuts['service_statuses'];

        $lignes = [
            [0, 0, 0, 'actif'],
            [1, 1, 1, 'actif'],
            [2, 3, 2, 'actif'],
            [3, 4, 0, 'actif'],
            [4, 1, 2, 'archive'],
        ];

        foreach ($lignes as $i => [$cIdx, $sIdx, $stIdx, $status]) {
            $depart = $this->today->copy()->subDays(5 * ($i + 1));

            $id = DB::table('service_en_cours')->insertGetId([
                'service_id' => $this->services[$sIdx],
                'client_id' => $clients[$cIdx],
                'service_status_id' => $statuts[$stIdx],
                'date_depart' => $depart->toDateTimeString(),
                'derniere_operation' => $depart->copy()->addDays(2)->toDateTimeString(),
                'status' => $status,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            foreach (range(0, $i % 3) as $op) {
                DB::table('service_en_cours_operations')->insert([
                    'service_en_cours_id' => $id,
                    'service_status_id' => $statuts[($stIdx + $op) % count($statuts)],
                    'commentaire' => 'Opération de démonstration ' . ($op + 1),
                    'fichier_nom' => null, 'fichier_chemin' => null,
                    'created_by' => $this->adminId,
                    'created_at' => $depart->copy()->addDays($op)->toDateTimeString(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    // =========================================================================
    //  Facturation — 4 types, payées / partielles / impayées
    // =========================================================================
    private function creerDocumentsCommerciaux(): void
    {
        $tiers = array_values($this->parties);

        // [type, n°, mois avant, HT, remise %, TVA %, part déjà payée, status]
        $lignes = [
            ['facture', 1, 1, 12000, 0, 20, 1.0, 'actif'],
            ['facture', 2, 2, 8000, 10, 20, 1.0, 'actif'],
            ['facture', 3, 3, 15000, 0, 20, 0.5, 'actif'],
            ['facture', 4, 4, 6000, 5, 20, 0.3, 'actif'],
            ['facture', 5, 5, 4500, 0, 20, 0.0, 'actif'],
            ['facture', 6, 7, 22000, 15, 20, 0.0, 'archive'],
            ['devis', 1, 1, 9000, 0, 20, 0.0, 'actif'],
            ['devis', 2, 2, 3000, 0, 20, 0.0, 'actif'],
            ['devis', 3, 6, 17000, 10, 20, 0.0, 'actif'],
            ['devis', 4, 8, 5000, 0, 20, 0.0, 'corbeille'],
            ['bl', 1, 1, 7000, 0, 20, 0.0, 'actif'],
            ['bl', 2, 3, 2500, 0, 20, 0.0, 'actif'],
            ['bl', 3, 5, 11000, 5, 20, 0.0, 'archive'],
            ['avoir', 1, 2, 1500, 0, 20, 0.0, 'actif'],
            ['avoir', 2, 4, 900, 0, 20, 0.0, 'actif'],
            ['avoir', 3, 6, 3200, 0, 20, 0.0, 'actif'],
        ];

        foreach ($lignes as $i => [$type, $num, $moisAvant, $ht, $remisePct, $tvaPct, $partPayee, $status]) {
            $date = $this->today->copy()->subMonths($moisAvant);
            $remise = round($ht * $remisePct / 100, 2);
            $netHt = round($ht - $remise, 2);
            $tva = round($netHt * $tvaPct / 100, 2);
            $ttc = round($netHt + $tva, 2);

            $id = DB::table('documents_commerciaux')->insertGetId([
                'type' => $type,
                'emetteur' => $i % 2 === 0 ? 'via_experts' : 'bureau_comptabilite',
                'responsable' => $i % 2 === 0 ? 'Via Experts' : 'Maitre : Morad Bendeq',
                'party_id' => $tiers[$i % count($tiers)],
                'numero' => sprintf('D-%s-%03d/26', strtoupper(substr($type, 0, 3)), $num),
                'date_document' => $date->toDateString(),
                'date_paiement' => $date->copy()->addDays(30)->toDateString(),
                'date_credit' => null,
                'mode_paiement' => ['Virement', 'Chèque', 'Espèce'][$i % 3],
                'signature' => $i % 2 === 0,
                'note' => 'Document de démonstration.',
                'total_ht' => $ht, 'total_remise' => $remise, 'total_net_ht' => $netHt,
                'total_tva' => $tva, 'total_ttc' => $ttc,
                // `prix_paye` est recalculé plus bas à partir des paiements réels
                // rattachés, conformément à l'option C du projet.
                'prix_paye' => 0,
                'status' => $status,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            $nbLignes = ($i % 3) + 1;
            for ($l = 0; $l < $nbLignes; $l++) {
                DB::table('document_lignes')->insert([
                    'document_id' => $id,
                    'service_id' => $this->services[($i + $l) % count($this->services)],
                    'designation' => 'Prestation de démonstration ' . ($l + 1),
                    'quantite' => $l + 1,
                    'prix_unitaire' => round($ht / $nbLignes / ($l + 1), 2),
                    'remise_pourcent' => $remisePct,
                    'tva_pourcent' => $tvaPct,
                    'ordre' => $l,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            $this->documentsAPayer[] = [$id, $tiers[$i % count($tiers)], $ttc, $partPayee, $status];
        }
    }

    /** @var array<int,array> factures à couvrir par des paiements */
    private array $documentsAPayer = [];

    // =========================================================================
    //  Paiements — synchronisés avec `prix_paye` (option C du projet)
    // =========================================================================
    private function creerPaiements(): void
    {
        $ref = 1;

        foreach ($this->documentsAPayer as [$docId, $partyId, $ttc, $part, $statusDoc]) {
            if ($part <= 0) {
                continue;
            }

            $montant = round($ttc * $part, 2);
            $date = $this->today->copy()->subDays(10 * $ref);

            DB::table('paiements')->insert([
                'reference' => '#D' . $ref,
                'emetteur' => 'via_experts',
                'responsable' => 'Via Experts',
                'party_id' => $partyId,
                'document_id' => $docId,
                'date_operation' => $date->toDateString(),
                'date_credit' => null,
                'mode_paiement' => ['Virement', 'Chèque', 'Espèce'][$ref % 3],
                'signature' => false,
                'piece_jointe_nom' => null, 'piece_jointe_chemin' => null,
                'observation' => 'Paiement de démonstration.',
                'total' => $montant, 'prix_paye' => $montant,
                'status' => 'actif',
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $paiementId = (int) DB::getPdo()->lastInsertId();

            DB::table('paiement_lignes')->insert([
                'paiement_id' => $paiementId,
                'service_id' => $this->services[$ref % count($this->services)],
                'designation' => 'Règlement de démonstration',
                'quantite' => 1, 'prix_unitaire' => $montant, 'ordre' => 0,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            // Cohérence option C : prix_paye = somme des paiements ACTIFS.
            DB::table('documents_commerciaux')->where('id', $docId)->update(['prix_paye' => $montant]);

            $ref++;
        }

        // Deux paiements libres (sans facture rattachée) + un archivé
        $tiers = array_values($this->parties);
        foreach ([['actif', 2400], ['actif', 750], ['archive', 1800]] as $i => [$status, $montant]) {
            DB::table('paiements')->insert([
                'reference' => '#D' . $ref,
                'emetteur' => 'bureau_comptabilite',
                'responsable' => 'Maitre : Morad Bendeq',
                'party_id' => $tiers[($i + 2) % count($tiers)],
                'document_id' => null,
                'date_operation' => $this->today->copy()->subDays(5 * ($i + 1))->toDateString(),
                'date_credit' => null,
                'mode_paiement' => 'Espèce',
                'signature' => false,
                'piece_jointe_nom' => null, 'piece_jointe_chemin' => null,
                'observation' => 'Paiement sans facture rattachée (démonstration).',
                'total' => $montant, 'prix_paye' => $montant,
                'status' => $status,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $ref++;
        }
    }

    // =========================================================================
    //  Déclaration TVA et Chiffre d'Affaire
    // =========================================================================
    private function creerDeclarations(): void
    {
        $entreprises = array_values(array_filter(
            $this->parties,
            fn ($k) => str_starts_with($k, 'entreprise:'),
            ARRAY_FILTER_USE_KEY
        ));

        // `periode_type` ∈ {mois, trimestre} et `periode_valeur` est un ENTIER
        // (1-12 pour un mois, 1-4 pour un trimestre) — contrainte du modèle.
        $lignes = [
            ['tva', 'mois', 1, 'declaree', 'actif'],
            ['tva', 'mois', 2, 'non_declaree', 'actif'],
            ['tva', 'trimestre', 1, 'declaree', 'actif'],
            ['tva', 'trimestre', 2, 'non_declaree', 'actif'],
            ['tva', 'mois', 3, 'declaree', 'archive'],
            ['chiffre_affaire', 'trimestre', 1, 'declaree', 'actif'],
            ['chiffre_affaire', 'trimestre', 2, 'non_declaree', 'actif'],
            ['chiffre_affaire', 'mois', 4, 'declaree', 'corbeille'],
        ];

        foreach ($lignes as $i => [$type, $periodeType, $periode, $situation, $status]) {
            $ht = 10000 + $i * 2500;
            $tva = round($ht * 0.2, 2);

            $id = DB::table('declarations_tva')->insertGetId([
                'type' => $type,
                'entreprise_id' => $entreprises[$i % count($entreprises)],
                'client_if' => sprintf('900%05d', ($i % 10) + 1),
                'identifiant_paiement' => 'IDP-D' . (1000 + $i),
                'periode_type' => $periodeType, 'periode_valeur' => $periode,
                'annee' => (int) $this->today->format('Y'),
                'regime' => $i % 2 === 0 ? 'Débit' : 'Encaissement',
                'situation' => $situation,
                'total_ht' => $ht, 'total_tva' => $tva, 'total_ttc' => $ht + $tva,
                'status' => $status,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            foreach (range(0, ($i % 3)) as $l) {
                $lht = round($ht / (($i % 3) + 1), 2);
                $ltva = round($lht * 0.2, 2);
                DB::table('declaration_tva_lignes')->insert([
                    'declaration_id' => $id,
                    'ordre_ref' => $l + 1,
                    'fact_num' => sprintf('D-FAC-%03d/26', $l + 1),
                    'designation' => 'Ligne de démonstration ' . ($l + 1),
                    'ht' => $lht, 'tva' => $ltva, 'ttc' => $lht + $ltva,
                    'identifiant_fiscal' => sprintf('900%05d', $l + 1),
                    'libelle_fournisseur' => 'DEMO FOURNISSEUR ' . ($l + 1),
                    'ice' => sprintf('90000000000%03d', $l + 1),
                    'taux' => 20,
                    'id_paie' => 'IDP-D' . (2000 + $l),
                    'date_paie' => $this->today->copy()->subDays(20 + $l)->toDateString(),
                    'date_fac' => $this->today->copy()->subDays(40 + $l)->toDateString(),
                    'ordre' => $l,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    // =========================================================================
    //  Rapports — Total Revenu du jour = Revenu Local + Revenu Externe
    // =========================================================================
    private function creerRapports(): void
    {
        foreach (range(0, 3) as $i) {
            $local = 3000 + $i * 500;
            $externe = 1200 + $i * 300;
            $depense = 400 * $i;
            $restant = 15000 - $i * 1000;

            DB::table('rapports')->insert([
                'emetteur' => $i % 2 === 0 ? 'via_experts' : 'bureau_comptabilite',
                'rapport_de' => '[Démo] Rapport ' . ($i + 1),
                'date_rapport' => $this->today->copy()->subDays($i)->toDateString(),
                'montant_restant' => $restant,
                'revenu_local' => $local,
                'revenu_externe' => $externe,
                'depense_jour' => $depense,
                'solde_caisse' => $restant - $depense,
                'total_revenu_jour' => $local + $externe,
                'descriptive' => 'Rapport journalier de démonstration.',
                'document_nom' => null, 'document_chemin' => null,
                'status' => $i === 3 ? 'archive' : 'actif',
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    // =========================================================================
    //  Cachets et Mails (+ fils d'opérations)
    // =========================================================================
    private function creerCachetsEtMails(): void
    {
        $tiers = array_values($this->parties);

        foreach ([['cachets', 'cachet_operations', 'cachet_status_id', 'cachet_statuses'],
                  ['mails', 'mail_operations', 'mail_status_id', 'mail_statuses']] as [$table, $opTable, $fk, $statutTable]) {
            $statuts = $this->statuts[$statutTable];

            foreach (range(0, 3) as $i) {
                $depart = $this->today->copy()->subDays(3 * ($i + 1));

                $data = [
                    'party_id' => $tiers[($i * 2) % count($tiers)],
                    $fk => $statuts[$i % count($statuts)],
                    'date_depart' => $depart->toDateTimeString(),
                    'derniere_operation' => $depart->copy()->addDay()->toDateTimeString(),
                    'status' => $i === 3 ? 'archive' : 'actif',
                    'created_by' => $this->adminId,
                    'created_at' => now(), 'updated_at' => now(),
                ];
                if ($table === 'cachets') {
                    $data['lignes'] = ($i + 1) * 3;
                }

                $id = DB::table($table)->insertGetId($data);

                foreach (range(0, $i % 2) as $op) {
                    DB::table($opTable)->insert([
                        rtrim($table, 's') . '_id' => $id,
                        $fk => $statuts[($i + $op) % count($statuts)],
                        'commentaire' => 'Opération de démonstration ' . ($op + 1),
                        'fichier_nom' => null, 'fichier_chemin' => null,
                        'created_by' => $this->adminId,
                        'created_at' => $depart->copy()->addDays($op)->toDateTimeString(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    // =========================================================================
    //  Data Center
    // =========================================================================
    private function creerDataCenter(): void
    {
        $lignes = [
            ['[Démo] INTER DEMO SARL', 'actif'],
            ['[Démo] NORD DEMO TRADING', 'actif'],
            ['[Démo] SUD DEMO SERVICES', 'actif'],
            ['[Démo] EST DEMO LOGISTIQUE', 'archive'],
            ['[Démo] OUEST DEMO CONSEIL', 'corbeille'],
        ];

        foreach ($lignes as $i => [$denom, $status]) {
            DB::table('data_center_fiches')->insert([
                'denomination' => $denom,
                'ice' => sprintf('80000000000%03d', $i + 1),
                'if' => sprintf('800%05d', $i + 1),
                'rc' => $i === 2 ? null : sprintf('RC-D%04d', $i + 1),
                'tp' => $i === 3 ? null : sprintf('TP-D%04d', $i + 1),
                'status' => $status,
                'created_by' => $this->adminId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    // =========================================================================
    //  Chat interne
    // =========================================================================
    private function creerChat(): void
    {
        $ids = array_values($this->users);
        if ($ids === []) {
            return;
        }

        $messages = [
            [$ids[0], $this->adminId, 'Bonjour, le dossier DEMO ATLAS TRADING est prêt.', true],
            [$this->adminId, $ids[0], 'Parfait, merci. Pensez à la facture.', true],
            [$ids[0], $this->adminId, 'Facture D-FAC-001/26 envoyée.', false],
            [$ids[1], $this->adminId, 'La déclaration TVA de février est en attente.', false],
            [$this->adminId, $ids[1], 'Je regarde ça aujourd\'hui.', true],
            [$ids[2], $this->adminId, 'Question sur les mois gratuits d\'une domiciliation.', false],
        ];

        foreach ($messages as $i => [$from, $to, $body, $lu]) {
            DB::table('chat_messages')->insert([
                'sender_id' => $from, 'recipient_id' => $to, 'body' => $body,
                'read_at' => $lu ? now() : null,
                'created_at' => $this->today->copy()->subHours(12 - $i)->toDateTimeString(),
                'updated_at' => now(),
            ]);
        }
    }
}
