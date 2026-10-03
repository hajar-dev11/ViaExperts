<?php

use App\Http\Controllers\Api\V1\ArchiveController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CabinetSettingController;
use App\Http\Controllers\Api\V1\CachetStatusController;
use App\Http\Controllers\Api\V1\CachetController;
use App\Http\Controllers\Api\V1\CentreDomiciliationController;
use App\Http\Controllers\Api\V1\ChatController;
use App\Http\Controllers\Api\V1\ClientController;
use App\Http\Controllers\Api\V1\DataCenterController;
use App\Http\Controllers\Api\V1\DeclarationTvaController;
use App\Http\Controllers\Api\V1\DocumentCommercialController;
use App\Http\Controllers\Api\V1\DomiciliationController;
use App\Http\Controllers\Api\V1\DomiciliationSettingController;
use App\Http\Controllers\Api\V1\EntrepriseController;
use App\Http\Controllers\Api\V1\FichierController;
use App\Http\Controllers\Api\V1\MailController;
use App\Http\Controllers\Api\V1\MailStatusController;
use App\Http\Controllers\Api\V1\MouvementController;
use App\Http\Controllers\Api\V1\NoteController;
use App\Http\Controllers\Api\V1\PaiementController;
use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Http\Controllers\Api\V1\PermissionController;
use App\Http\Controllers\Api\V1\RapportController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ServiceController;
use App\Http\Controllers\Api\V1\ServiceEnCoursController;
use App\Http\Controllers\Api\V1\ServiceStatusController;
use App\Http\Controllers\Api\V1\SettingFichierController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/forgot-password', [PasswordResetController::class, 'forgotPassword'])
        ->middleware('throttle:6,1');
    Route::post('/auth/reset-password', [PasswordResetController::class, 'reset'])
        ->middleware('throttle:6,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::put('/profile', [ProfileController::class, 'update']);
        Route::post('/profile/photo', [ProfileController::class, 'uploadPhoto']);
        Route::delete('/profile/photo', [ProfileController::class, 'deletePhoto']);

        // Fichiers / Notes — outils de la Topbar, ouverts à tout utilisateur connecté (pas de permission dédiée).
        Route::get('/fichiers', [FichierController::class, 'index']);
        Route::post('/fichiers', [FichierController::class, 'store']);
        Route::delete('/fichiers/{fichier}', [FichierController::class, 'destroy']);

        // Archive / Corbeille — compteurs toutes catégories, en une requête.
        Route::get('/archive/counts', [ArchiveController::class, 'counts']);

        Route::get('/notes', [NoteController::class, 'index']);
        Route::post('/notes', [NoteController::class, 'store']);
        Route::put('/notes/{note}', [NoteController::class, 'update']);
        Route::delete('/notes/{note}', [NoteController::class, 'destroy']);

        // Clients — chaque action passe par la permission correspondante (admin toujours autorisé)
        Route::get('/clients', [ClientController::class, 'index'])->middleware('permission:clients,list');
        Route::post('/clients', [ClientController::class, 'store'])->middleware('permission:clients,create');
        Route::get('/clients/{client}', [ClientController::class, 'show'])->middleware('permission:clients,list');
        Route::put('/clients/{client}', [ClientController::class, 'update'])->middleware('permission:clients,update');
        Route::patch('/clients/{client}', [ClientController::class, 'update'])->middleware('permission:clients,update');
        Route::post('/clients/{client}/archive', [ClientController::class, 'archive'])->middleware('permission:clients,archive');
        Route::post('/clients/{client}/corbeille', [ClientController::class, 'corbeille'])->middleware('permission:clients,corbeille');
        // Restaurer = inverse d'archiver : on réutilise la permission `archive`,
        // convention déjà appliquée aux 10 modules plus récents. Le catalogue ne
        // comporte aucune action `restore`, aucune n'est inventée ici.
        Route::post('/clients/{client}/restore', [ClientController::class, 'restore'])->middleware('permission:clients,archive');
        Route::delete('/clients/{client}', [ClientController::class, 'destroy'])->middleware('permission:clients,delete');

        // Entreprises — même principe
        Route::get('/entreprises', [EntrepriseController::class, 'index'])->middleware('permission:entreprises,list');
        Route::post('/entreprises', [EntrepriseController::class, 'store'])->middleware('permission:entreprises,create');
        Route::get('/entreprises/{entreprise}', [EntrepriseController::class, 'show'])->middleware('permission:entreprises,list');
        Route::put('/entreprises/{entreprise}', [EntrepriseController::class, 'update'])->middleware('permission:entreprises,update');
        Route::patch('/entreprises/{entreprise}', [EntrepriseController::class, 'update'])->middleware('permission:entreprises,update');
        Route::post('/entreprises/{entreprise}/archive', [EntrepriseController::class, 'archive'])->middleware('permission:entreprises,archive');
        Route::post('/entreprises/{entreprise}/corbeille', [EntrepriseController::class, 'corbeille'])->middleware('permission:entreprises,corbeille');
        Route::post('/entreprises/{entreprise}/restore', [EntrepriseController::class, 'restore'])->middleware('permission:entreprises,archive');
        Route::delete('/entreprises/{entreprise}', [EntrepriseController::class, 'destroy'])->middleware('permission:entreprises,delete');
        // Liste Noire / Bloquer — permissions déjà au catalogue, enfin branchées.
        Route::post('/entreprises/{entreprise}/liste-noire', [EntrepriseController::class, 'listeNoire'])->middleware('permission:entreprises,liste_noire');
        Route::post('/entreprises/{entreprise}/liste-noire/retirer', [EntrepriseController::class, 'retirerListeNoire'])->middleware('permission:entreprises,liste_noire');
        Route::post('/entreprises/{entreprise}/bloquer', [EntrepriseController::class, 'bloquer'])->middleware('permission:entreprises,bloquer');
        Route::post('/entreprises/{entreprise}/debloquer', [EntrepriseController::class, 'debloquer'])->middleware('permission:entreprises,bloquer');

        // Blocs « Documents » et « Observations » de la fiche entreprise.
        // Les permissions réutilisées sont celles déjà présentes au catalogue :
        // add_document / add_observation pour l'ajout, archive / corbeille / delete
        // pour le cycle de vie — aucune nouvelle action n'est inventée.
        Route::post('/entreprises/{entreprise}/documents', [EntrepriseController::class, 'storeDocument'])->middleware('permission:entreprises,add_document');
        Route::get('/entreprises/{entreprise}/documents/{document}/download', [EntrepriseController::class, 'downloadDocument'])->middleware('permission:entreprises,list');
        Route::post('/entreprises/{entreprise}/documents/{document}/archive', [EntrepriseController::class, 'archiveDocument'])->middleware('permission:entreprises,archive');
        Route::post('/entreprises/{entreprise}/documents/{document}/corbeille', [EntrepriseController::class, 'corbeilleDocument'])->middleware('permission:entreprises,corbeille');
        Route::post('/entreprises/{entreprise}/documents/{document}/restore', [EntrepriseController::class, 'restoreDocument'])->middleware('permission:entreprises,archive');
        Route::delete('/entreprises/{entreprise}/documents/{document}', [EntrepriseController::class, 'destroyDocument'])->middleware('permission:entreprises,delete');

        Route::post('/entreprises/{entreprise}/observations', [EntrepriseController::class, 'storeObservation'])->middleware('permission:entreprises,add_observation');
        Route::get('/entreprises/{entreprise}/observations/{observation}/fichiers/{fichier}/download', [EntrepriseController::class, 'downloadObservationFichier'])->middleware('permission:entreprises,list');
        Route::post('/entreprises/{entreprise}/observations/{observation}/archive', [EntrepriseController::class, 'archiveObservation'])->middleware('permission:entreprises,archive');
        Route::post('/entreprises/{entreprise}/observations/{observation}/corbeille', [EntrepriseController::class, 'corbeilleObservation'])->middleware('permission:entreprises,corbeille');
        Route::post('/entreprises/{entreprise}/observations/{observation}/restore', [EntrepriseController::class, 'restoreObservation'])->middleware('permission:entreprises,archive');
        Route::delete('/entreprises/{entreprise}/observations/{observation}', [EntrepriseController::class, 'destroyObservation'])->middleware('permission:entreprises,delete');

        // Domiciliation métier — permissions réutilisées du catalogue existant (module `domiciliation`).
        // ⚠️ Le catalogue ne contient PAS d'action `modifier` pour ce module : la mise à jour
        // réutilise donc `ajouter`, comme la création. Voir le rapport de session.
        Route::get('/domiciliations', [DomiciliationController::class, 'index'])->middleware('permission:domiciliation,list');
        Route::post('/domiciliations', [DomiciliationController::class, 'store'])->middleware('permission:domiciliation,ajouter');
        Route::get('/domiciliations/{domiciliation}', [DomiciliationController::class, 'show'])->middleware('permission:domiciliation,list');
        Route::put('/domiciliations/{domiciliation}', [DomiciliationController::class, 'update'])->middleware('permission:domiciliation,ajouter');
        Route::post('/domiciliations/{domiciliation}/archive', [DomiciliationController::class, 'archive'])->middleware('permission:domiciliation,archive');
        Route::post('/domiciliations/{domiciliation}/corbeille', [DomiciliationController::class, 'corbeille'])->middleware('permission:domiciliation,corbeille');
        Route::post('/domiciliations/{domiciliation}/restore', [DomiciliationController::class, 'restore'])->middleware('permission:domiciliation,archive');
        Route::delete('/domiciliations/{domiciliation}', [DomiciliationController::class, 'destroy'])->middleware('permission:domiciliation,supprimer');
        // « Renouveler » crée une nouvelle période rattachée à la précédente :
        // la permission `renouveler` existait déjà au catalogue, elle est enfin
        // utilisée. Déclarer / Résilier acceptent désormais fichier + commentaire.
        Route::post('/domiciliations/{domiciliation}/renouveler', [DomiciliationController::class, 'renouveler'])->middleware('permission:domiciliation,renouveler');
        Route::get('/domiciliations/{domiciliation}/operations/{operation}/download', [DomiciliationController::class, 'downloadOperationFichier'])->middleware('permission:domiciliation,list');
        Route::post('/domiciliations/{domiciliation}/declarer', [DomiciliationController::class, 'declarer'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/resilier', [DomiciliationController::class, 'resilier'])->middleware('permission:domiciliation,resilier');
        // « Activer » annule Déclarer/Résilier : remet la période à l'état actif.
        Route::post('/domiciliations/{domiciliation}/activer', [DomiciliationController::class, 'activer'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations', [DomiciliationController::class, 'storeObservation'])->middleware('permission:domiciliation,gestion');
        Route::get('/domiciliations/{domiciliation}/observations/{observation}/fichier/download', [DomiciliationController::class, 'downloadObservationFichier'])->middleware('permission:domiciliation,list');
        Route::delete('/domiciliations/{domiciliation}/observations/{observation}', [DomiciliationController::class, 'destroyObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations/{observation}/archive', [DomiciliationController::class, 'archiveObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations/{observation}/corbeille', [DomiciliationController::class, 'corbeilleObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/observations/{observation}/restore', [DomiciliationController::class, 'restoreObservation'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents', [DomiciliationController::class, 'storeDocument'])->middleware('permission:domiciliation,gestion');
        Route::delete('/domiciliations/{domiciliation}/documents/{document}', [DomiciliationController::class, 'destroyDocument'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents/{document}/archive', [DomiciliationController::class, 'archiveDocument'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents/{document}/corbeille', [DomiciliationController::class, 'corbeilleDocument'])->middleware('permission:domiciliation,gestion');
        Route::post('/domiciliations/{domiciliation}/documents/{document}/restore', [DomiciliationController::class, 'restoreDocument'])->middleware('permission:domiciliation,gestion');

        // Services (catalogue métier) — permissions `services` du catalogue existant
        Route::get('/services', [ServiceController::class, 'index'])->middleware('permission:services,list');
        Route::post('/services', [ServiceController::class, 'store'])->middleware('permission:services,ajouter');
        Route::get('/services/{service}', [ServiceController::class, 'show'])->middleware('permission:services,list');
        Route::put('/services/{service}', [ServiceController::class, 'update'])->middleware('permission:services,modifier');
        Route::post('/services/{service}/archive', [ServiceController::class, 'archive'])->middleware('permission:services,archive');
        Route::post('/services/{service}/corbeille', [ServiceController::class, 'corbeille'])->middleware('permission:services,corbeille');
        Route::post('/services/{service}/restore', [ServiceController::class, 'restore'])->middleware('permission:services,archive');
        Route::delete('/services/{service}', [ServiceController::class, 'destroy'])->middleware('permission:services,supprimer');

        // Facturation — 4 types partagent le même contrôleur : {type} vaut
        // facture | devis | bl | avoir. Les permissions étant déclinées par type
        // (liste_facture, ajouter_devis…), le contrôle se fait dans le contrôleur.
        Route::prefix('facturation/{type}')->whereIn('type', ['facture', 'devis', 'bl', 'avoir'])->group(function () {
            Route::get('/numero-propose', [DocumentCommercialController::class, 'numeroPropose']);
            Route::get('/', [DocumentCommercialController::class, 'index']);
            Route::post('/', [DocumentCommercialController::class, 'store']);
            Route::get('/{document}', [DocumentCommercialController::class, 'show']);
            Route::put('/{document}', [DocumentCommercialController::class, 'update']);
            Route::post('/{document}/archive', [DocumentCommercialController::class, 'archive']);
            Route::post('/{document}/corbeille', [DocumentCommercialController::class, 'corbeille']);
            Route::post('/{document}/restore', [DocumentCommercialController::class, 'restore']);
            Route::delete('/{document}', [DocumentCommercialController::class, 'destroy']);
        });

        // Déclaration TVA et Chiffre d'Affaire — même structure, 2 groupes de
        // permissions distincts (`declaration` et `chiffre_affaire`).
        Route::prefix('declarations/{type}')->whereIn('type', ['tva', 'chiffre_affaire'])->group(function () {
            Route::get('/', [DeclarationTvaController::class, 'index']);
            Route::post('/', [DeclarationTvaController::class, 'store']);
            Route::get('/{declaration}', [DeclarationTvaController::class, 'show']);
            Route::put('/{declaration}', [DeclarationTvaController::class, 'update']);
            Route::get('/{declaration}/export/{format}', [DeclarationTvaController::class, 'export']);
            Route::post('/{declaration}/archive', [DeclarationTvaController::class, 'archive']);
            Route::post('/{declaration}/corbeille', [DeclarationTvaController::class, 'corbeille']);
            Route::post('/{declaration}/restore', [DeclarationTvaController::class, 'restore']);
            Route::delete('/{declaration}', [DeclarationTvaController::class, 'destroy']);
        });

        // Centres de domiciliation — permissions `domiciliation` du catalogue
        // existant (centres_list / ajouter_centres / modifier_centres /
        // archive_centres / corbeille_centres / supprimer_centres). La lecture
        // est hors du groupe `admin` : le formulaire Entreprise en a besoin pour
        // sa liste déroulante, et un non-admin autorisé à créer une entreprise
        // doit pouvoir la charger. L'admin passe toujours (bypass natif).
        Route::get('/centres-domiciliation', [CentreDomiciliationController::class, 'index'])
            ->middleware('permission:domiciliation,centres_list');
        Route::get('/centres-domiciliation/{centre}', [CentreDomiciliationController::class, 'show'])
            ->middleware('permission:domiciliation,centres_list');
        Route::post('/centres-domiciliation/{centre}/archive', [CentreDomiciliationController::class, 'archive'])
            ->middleware('permission:domiciliation,archive_centres');
        Route::post('/centres-domiciliation/{centre}/corbeille', [CentreDomiciliationController::class, 'corbeille'])
            ->middleware('permission:domiciliation,corbeille_centres');
        Route::post('/centres-domiciliation/{centre}/restore', [CentreDomiciliationController::class, 'restore'])
            ->middleware('permission:domiciliation,archive_centres');
        Route::post('/centres-domiciliation', [CentreDomiciliationController::class, 'store'])
            ->middleware('permission:domiciliation,ajouter_centres');
        Route::put('/centres-domiciliation/{centre}', [CentreDomiciliationController::class, 'update'])
            ->middleware('permission:domiciliation,modifier_centres');
        Route::delete('/centres-domiciliation/{centre}', [CentreDomiciliationController::class, 'destroy'])
            ->middleware('permission:domiciliation,supprimer_centres');

        // Cachets — permissions `cashet` du catalogue existant.
        // Les statuts viennent de `cachet_statuses` (Paramètres → Cachet).
        Route::get('/cachets/activite', [CachetController::class, 'activite']);
        Route::get('/cachets', [CachetController::class, 'index']);
        Route::post('/cachets', [CachetController::class, 'store']);
        Route::get('/cachets/{cachet}', [CachetController::class, 'show']);
        Route::put('/cachets/{cachet}', [CachetController::class, 'update']);
        Route::post('/cachets/{cachet}/operations', [CachetController::class, 'storeOperation']);
        Route::post('/cachets/{cachet}/archive', [CachetController::class, 'archive']);
        Route::post('/cachets/{cachet}/corbeille', [CachetController::class, 'corbeille']);
        Route::post('/cachets/{cachet}/restore', [CachetController::class, 'restore']);
        Route::delete('/cachets/{cachet}', [CachetController::class, 'destroy']);

        // Mails — permissions `mails` du catalogue existant.
        // Les statuts viennent de `mail_statuses` (Paramètres → Mail).
        Route::get('/mails/activite', [MailController::class, 'activite']);
        Route::get('/mails', [MailController::class, 'index']);
        Route::post('/mails', [MailController::class, 'store']);
        Route::get('/mails/{mail}', [MailController::class, 'show']);
        Route::put('/mails/{mail}', [MailController::class, 'update']);
        Route::post('/mails/{mail}/operations', [MailController::class, 'storeOperation']);
        Route::post('/mails/{mail}/archive', [MailController::class, 'archive']);
        Route::post('/mails/{mail}/corbeille', [MailController::class, 'corbeille']);
        Route::post('/mails/{mail}/restore', [MailController::class, 'restore']);
        Route::delete('/mails/{mail}', [MailController::class, 'destroy']);

        // Rapports — le groupe `rapports` existe dans le catalogue de permissions ;
        // l'accès est vérifié dans le contrôleur (`RapportController::autoriser`)
        // plutôt que par un middleware `permission:` de route, comme pour `chat`.
        Route::get('/rapports', [RapportController::class, 'index']);
        Route::post('/rapports', [RapportController::class, 'store']);
        Route::get('/rapports/{rapport}', [RapportController::class, 'show']);
        Route::post('/rapports/{rapport}', [RapportController::class, 'update']); // POST : multipart
        Route::get('/rapports/{rapport}/document', [RapportController::class, 'telecharger']);
        Route::post('/rapports/{rapport}/archive', [RapportController::class, 'archive']);
        Route::post('/rapports/{rapport}/corbeille', [RapportController::class, 'corbeille']);
        Route::post('/rapports/{rapport}/restore', [RapportController::class, 'restore']);
        Route::delete('/rapports/{rapport}', [RapportController::class, 'destroy']);

        // Data Center — groupe `data_center` déjà au catalogue (6 permissions).
        // `restore` réutilise la permission `archive` (convention du projet :
        // le catalogue ne contient aucune action `restore`).
        Route::get('/data-center', [DataCenterController::class, 'index'])->middleware('permission:data_center,list');
        Route::post('/data-center', [DataCenterController::class, 'store'])->middleware('permission:data_center,ajouter');
        Route::get('/data-center/{fiche}', [DataCenterController::class, 'show'])->middleware('permission:data_center,list');
        Route::put('/data-center/{fiche}', [DataCenterController::class, 'update'])->middleware('permission:data_center,modifier');
        Route::post('/data-center/{fiche}/archive', [DataCenterController::class, 'archive'])->middleware('permission:data_center,archive');
        Route::post('/data-center/{fiche}/corbeille', [DataCenterController::class, 'corbeille'])->middleware('permission:data_center,corbeille');
        Route::post('/data-center/{fiche}/restore', [DataCenterController::class, 'restore'])->middleware('permission:data_center,archive');
        Route::delete('/data-center/{fiche}', [DataCenterController::class, 'destroy'])->middleware('permission:data_center,supprimer');

        // Mouvement — vues d'agrégation, aucune table dédiée.
        Route::get('/mouvements/recu', [MouvementController::class, 'recu']);
        Route::get('/mouvements/facture', [MouvementController::class, 'facture']);

        // Paiements — permissions `paiements` du catalogue existant.
        // La mise à jour de documents_commerciaux.prix_paye est transactionnelle (option C).
        Route::get('/paiements/factures-disponibles', [PaiementController::class, 'facturesDisponibles']);
        Route::get('/paiements/gestion', [PaiementController::class, 'gestion']);
        Route::get('/paiements', [PaiementController::class, 'index']);
        Route::post('/paiements', [PaiementController::class, 'store']);
        Route::get('/paiements/{paiement}', [PaiementController::class, 'show']);
        Route::post('/paiements/{paiement}', [PaiementController::class, 'update']); // POST : multipart (pièce jointe)
        Route::post('/paiements/{paiement}/archive', [PaiementController::class, 'archive']);
        Route::post('/paiements/{paiement}/corbeille', [PaiementController::class, 'corbeille']);
        Route::post('/paiements/{paiement}/restore', [PaiementController::class, 'restore']);
        Route::delete('/paiements/{paiement}', [PaiementController::class, 'destroy']);

        // Services en cours — permissions `services_en_cours` du catalogue existant
        Route::get('/services-en-cours', [ServiceEnCoursController::class, 'index'])->middleware('permission:services_en_cours,list');
        Route::get('/services-en-cours/activite', [ServiceEnCoursController::class, 'activite'])->middleware('permission:services_en_cours,list');
        Route::post('/services-en-cours', [ServiceEnCoursController::class, 'store'])->middleware('permission:services_en_cours,ajouter');
        Route::get('/services-en-cours/{serviceEnCour}', [ServiceEnCoursController::class, 'show'])->middleware('permission:services_en_cours,list');
        Route::put('/services-en-cours/{serviceEnCour}', [ServiceEnCoursController::class, 'update'])->middleware('permission:services_en_cours,modifier');
        Route::post('/services-en-cours/{serviceEnCour}/operations', [ServiceEnCoursController::class, 'storeOperation'])->middleware('permission:services_en_cours,modifier');
        Route::post('/services-en-cours/{serviceEnCour}/archive', [ServiceEnCoursController::class, 'archive'])->middleware('permission:services_en_cours,archive');
        Route::post('/services-en-cours/{serviceEnCour}/corbeille', [ServiceEnCoursController::class, 'corbeille'])->middleware('permission:services_en_cours,corbeille');
        Route::post('/services-en-cours/{serviceEnCour}/restore', [ServiceEnCoursController::class, 'restore'])->middleware('permission:services_en_cours,archive');
        Route::delete('/services-en-cours/{serviceEnCour}', [ServiceEnCoursController::class, 'destroy'])->middleware('permission:services_en_cours,supprimer');

        // Chat interne — le groupe `chat` (list/envoyer/modifier/supprimer) existe
        // dans le catalogue de permissions ; l'accès est vérifié dans le contrôleur
        // (`ChatController::autoriser`) plutôt que par un middleware `permission:`
        // de route, pour rester cohérent avec le reste de ce fichier.
        Route::get('/chat/contacts', [ChatController::class, 'contacts']);
        Route::get('/chat/{user}/messages', [ChatController::class, 'messages']);
        Route::post('/chat/{user}/messages', [ChatController::class, 'send']);
        Route::put('/chat/messages/{message}', [ChatController::class, 'update']);
        Route::delete('/chat/messages/{message}', [ChatController::class, 'destroy']);

        // Users / Permissions — réservé à l'administrateur. Reste volontairement sous
        // le garde `admin` brut (et non `permission:parametre,...`) : la gestion des
        // comptes (account/mot_de_passe) et des permissions d'autrui (ajouter_assistance)
        // ne doit jamais devenir délégable à un membre du staff, même si ces 3 actions
        // existent encore dans le catalogue — `admin` vérifie `is_admin` directement, sans
        // dépendre de la table des permissions, donc aucune permission accordée ne peut
        // faire passer un utilisateur non-admin par ces routes.
        Route::middleware('admin')->group(function () {
            Route::get('/users', [UserController::class, 'index']);
            Route::post('/users', [UserController::class, 'store']);
            Route::get('/users/{user}', [UserController::class, 'show']);
            Route::put('/users/{user}', [UserController::class, 'update']);
            Route::delete('/users/{user}', [UserController::class, 'destroy']);

            Route::get('/permissions', [PermissionController::class, 'index']);
            Route::get('/users/{user}/permissions', [PermissionController::class, 'showForUser']);
            Route::put('/users/{user}/permissions', [PermissionController::class, 'updateForUser']);
        });

        // Paramètres délégables — contrairement au bloc ci-dessus, ces actions sont
        // dans le catalogue ET réellement accordables à un membre du staff via
        // Paramètres → Assistance (l'admin reste toujours passant via `hasPermission`).
        Route::get('/settings/cabinet', [CabinetSettingController::class, 'show'])->middleware('permission:parametre,bureau_comptabilite');
        Route::put('/settings/cabinet', [CabinetSettingController::class, 'update'])->middleware('permission:parametre,bureau_comptabilite');
        Route::post('/settings/cabinet/logo', [CabinetSettingController::class, 'uploadLogo'])->middleware('permission:parametre,bureau_comptabilite');
        Route::delete('/settings/cabinet/logo', [CabinetSettingController::class, 'resetLogo'])->middleware('permission:parametre,bureau_comptabilite');
        Route::post('/settings/cabinet/signature', [CabinetSettingController::class, 'uploadSignature'])->middleware('permission:parametre,bureau_comptabilite');
        Route::delete('/settings/cabinet/signature', [CabinetSettingController::class, 'resetSignature'])->middleware('permission:parametre,bureau_comptabilite');

        Route::get('/settings/domiciliation', [DomiciliationSettingController::class, 'show'])->middleware('permission:parametre,centre_domiciliation');
        Route::put('/settings/domiciliation', [DomiciliationSettingController::class, 'update'])->middleware('permission:parametre,centre_domiciliation');
        Route::post('/settings/domiciliation/logo', [DomiciliationSettingController::class, 'uploadLogo'])->middleware('permission:parametre,centre_domiciliation');
        Route::delete('/settings/domiciliation/logo', [DomiciliationSettingController::class, 'resetLogo'])->middleware('permission:parametre,centre_domiciliation');
        Route::post('/settings/domiciliation/signature', [DomiciliationSettingController::class, 'uploadSignature'])->middleware('permission:parametre,centre_domiciliation');
        Route::delete('/settings/domiciliation/signature', [DomiciliationSettingController::class, 'resetSignature'])->middleware('permission:parametre,centre_domiciliation');

        // Octets du logo / de la signature des réglages, lisibles par le frontend (CORS) pour le PDF des documents.
        Route::get('/settings/fichier', [SettingFichierController::class, 'show']);

        Route::get('/service-statuses', [ServiceStatusController::class, 'index'])->middleware('permission:parametre,ajouter_services_status');
        Route::post('/service-statuses', [ServiceStatusController::class, 'store'])->middleware('permission:parametre,ajouter_services_status');
        Route::put('/service-statuses/{serviceStatus}', [ServiceStatusController::class, 'update'])->middleware('permission:parametre,ajouter_services_status');
        Route::delete('/service-statuses/{serviceStatus}', [ServiceStatusController::class, 'destroy'])->middleware('permission:parametre,ajouter_services_status');

        Route::get('/cachet-statuses', [CachetStatusController::class, 'index'])->middleware('permission:parametre,ajouter_cashet_status');
        Route::post('/cachet-statuses', [CachetStatusController::class, 'store'])->middleware('permission:parametre,ajouter_cashet_status');
        Route::put('/cachet-statuses/{cachetStatus}', [CachetStatusController::class, 'update'])->middleware('permission:parametre,ajouter_cashet_status');
        Route::delete('/cachet-statuses/{cachetStatus}', [CachetStatusController::class, 'destroy'])->middleware('permission:parametre,ajouter_cashet_status');

        Route::get('/mail-statuses', [MailStatusController::class, 'index'])->middleware('permission:parametre,ajouter_mail_status');
        Route::post('/mail-statuses', [MailStatusController::class, 'store'])->middleware('permission:parametre,ajouter_mail_status');
        Route::put('/mail-statuses/{mailStatus}', [MailStatusController::class, 'update'])->middleware('permission:parametre,ajouter_mail_status');
        Route::delete('/mail-statuses/{mailStatus}', [MailStatusController::class, 'destroy'])->middleware('permission:parametre,ajouter_mail_status');
    });
});
