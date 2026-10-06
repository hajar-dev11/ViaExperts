# Domiciliation — Étape 16 : audit complet avant modularisation

Tag de départ : `pre-domiciliation-etape16` (= `d5000c9`). Étape d'**audit** : aucun code applicatif, migration, route,
permission, API, PDF, template ni donnée modifié. Seul ajout : un fichier de **tests de caractérisation frontend** (9 tests,
Node, sans jsdom) et ce document. Les chiffres ci-dessous proviennent de recherches dans le dépôt, du graphe d'imports de
`frontend/src` et de requêtes **en lecture seule** sur la base de développement.

## 1. État initial

HEAD `d5000c9`, working tree propre. Backend 331 passés + 1 échec connu (`ServiceChatTest::test_empty_message_is_rejected`),
Vitest 58, 32 instantanés, lint 0 erreur / 45 avertissements, build OK. Le backend n'a **aucun** dossier `Modules/Domiciliation`
(tout est dans les dossiers Laravel classiques) ; le frontend a seulement `modules/domiciliation/` (impression de la facture,
étape 15).

## 2. Fichiers backend Domiciliation

| Catégorie | Fichiers |
|---|---|
| Models (`app/Models`) | `Domiciliation`, `CentreDomiciliation`, `DomiciliationDocument`, `DomiciliationObservation`, `DomiciliationOperation`, `DomiciliationSetting` |
| Controllers (`Api/V1`) | `DomiciliationController` (24 actions publiques), `CentreDomiciliationController`, `DomiciliationSettingController` |
| Requests | `Store/UpdateDomiciliationRequest`, `Store/UpdateCentreDomiciliationRequest`, `UpdateDomiciliationSettingRequest` |
| Resources | `DomiciliationResource` |
| Migrations (14) | `create_centres_domiciliation`, `create_domiciliation_settings`, `add_branding_to_domiciliation_settings`, `create_domiciliations`, `…_observations`, `…_documents`, `…_operations`, `add_renouvelle_de_id_to_domiciliations`, `add_email_/numero_archive_/status_to_centres_domiciliation`, `add_privee_and_fichier_to_domiciliation_observations`, `add_status_to_domiciliation_documents_and_observations`, `add_soft_deletes_to_domiciliation_documents_and_observations` |
| Seeders | `DemoDataSeeder` (centres, domiciliations, historique, scénarios d'alerte, observations, documents), `DemoDataPurgeSeeder`, `ServiceCatalogueSeeder` (service « Domiciliation »), `PermissionSeeder` (groupe `domiciliation`) |
| Tests | `DomiciliationTest` (12), `DomiciliationActionsTest` (10) ; cas Domiciliation dans `SettingsTest`, `CorrectionsAuditTest`, `EntrepriseTest`, `ServicesEnCoursAutomatiquesTest`, `ApiShapeSnapshotTest`, `ArchiveCountsTest` ; snapshots `routes.json`, `permissions.json`, `api-shapes.json` |
| Absents | aucun Service, Action, Contract, Event, Listener, Job, Policy ni Observer propre à Domiciliation |

Stockage : fichiers sur le disque `public` — `domiciliations/` (documents), `domiciliations/observations`,
`domiciliations/operations`, et `settings/domiciliation/` (logo, cachet du Centre).

## 3. Contrôleurs, routes, permissions

**Routes** (`routes/api.php`, groupe `v1` + `auth:sanctum`) : 24 routes `domiciliations` (l. 108–138 : CRUD + archive / corbeille /
restore, `renouveler`, `declarer`, `resilier`, `activer`, observations (+ cycle + téléchargement), documents (+ cycle), téléchargement
d'opération), 8 routes `centres-domiciliation` (l. 167–188), 6 routes `settings/domiciliation` (l. 309–314). L'ordre actuel
des routes est verrouillé par le snapshot de routes.

**Permissions** (middleware de route `permission:module,action`, catalogue `domiciliation`) : `list`, `ajouter`, `archive`, `corbeille`,
`supprimer`, `renouveler`, `gestion`, `resilier`, `centres_list`, `ajouter_centres`, `modifier_centres`, `archive_centres`,
`corbeille_centres`, `supprimer_centres`. Les réglages du Centre utilisent le groupe **`parametre`** (`centre_domiciliation`).
Catalogue **non appliqué** par une route : `facture`, `contrat`, `attestation`, `procuration`, `calendrier`, `export_list`. Côté
frontend, les entrées du menu Domiciliation **n'ont aucune permission** déclarée (visibles de tous) ; les pages affichent un message
sur 403.

## 4. Base de données (lecture seule, base de développement)

| Table | Lignes | `deleted_at` | `status` | FK sortantes |
|---|---|---|---|---|
| `domiciliations` | 100 | oui | oui | `entreprise_id → entreprises.party_id` (CASCADE), `centre_domiciliation_id → centres_domiciliation.id` (**RESTRICT**), `created_by → users` (SET NULL), `renouvelle_de_id → domiciliations.id` (SET NULL) |
| `domiciliation_observations` | 9 | oui | oui | `domiciliation_id` (CASCADE), `created_by → users` (SET NULL) |
| `domiciliation_documents` | 5 | oui | oui | `domiciliation_id` (CASCADE), `uploaded_by → users` (SET NULL) |
| `domiciliation_operations` | 14 | non | non | `domiciliation_id` (CASCADE), `created_by → users` (SET NULL) |
| `centres_domiciliation` | 13 | oui | oui | — |
| `domiciliation_settings` | 1 | non | non | — (table de **paramètres** : logo, cachet, gérant, numérotation) |

**FK entrante depuis un autre domaine : une seule** — `entreprises.centre_domiciliation_id → centres_domiciliation.id` (RESTRICT).
**Aucune FK entre Domiciliation et Facturation** (ni `document_id`, ni lien vers `documents_commerciaux`) : la facture de domiciliation
n'est **pas persistée**, c'est une présentation calculée côté navigateur.

## 5. Couplages backend

| Sens | Détail | Nature |
|---|---|---|
| Domiciliation → Parties | `Domiciliation::entreprise()` (`Entreprise`), `exists:entreprises,party_id`, `DomiciliationResource` lit `entreprise` et `entreprise->client` (dénomination, ICE, IF, n° archive, client, CIN, adresse, email) ; `CentreDomiciliationController::show` charge les entreprises du centre | **fort** (lecture directe du modèle) |
| Parties → Domiciliation | `Entreprise::centreDomiciliation()`, `EntrepriseController` (résolution du centre par nom), `EntrepriseResource`, `ClientResource`, `Store/UpdateEntrepriseRequest` (champ `centreDomiciliation`) | **fort** (le centre est une donnée de la fiche entreprise) |
| Archive → Domiciliation | `ArchiveController` : `Domiciliation::where('status', …)->count()` | direct, à passer par un contrat de comptage (comme Services en cours) |
| Facturation → Domiciliation | `NumerotationDocuments` lit `DomiciliationSetting` (compteurs et préfixes de l'émetteur `via_experts`) | **couplage Paramètres**, pas Domiciliation métier |
| Paramètres | `DomiciliationSetting` = identité (logo, cachet, pied de page) et numérotation de l'émetteur « Via Experts » ; utilisé aussi par Facturation, Paiements et tous les PDF | **appartient à Paramètres**, pas au futur module |
| Services | le service « Domiciliation » du catalogue (`ServiceCatalogueSeeder`) ; `Domiciliation` n'appelle ni `Service` ni `ServiceEnCours` côté backend | indirect (données) |
| Identity | `User` (auteur : `created_by`, `uploaded_by`), `User::hasPermission` via middleware | noyau |
| Facturation métier | **aucun** | — |

`StoreDomiciliationRequest::MODES_PAIEMENT` est une **3ᵉ copie** de la liste des modes de paiement (les deux autres : `shared/constants/documents.js`
et `api/domiciliations.js`).

## 6. Fichiers frontend Domiciliation

| Zone | Fichiers |
|---|---|
| `api/` | `domiciliations.js` (≈ 25 fonctions + une copie de `MODES_PAIEMENT`), `centres.js` ; fonctions de réglages dans `api/settings.js` (`getDomiciliationSettings`, logo, cachet) |
| `pages/` | `DomiciliationList`, `DomiciliationForm`, `DomiciliationDetails`, `DomiciliationStatuts`, `DomiciliationCalendar`, `DomiciliationCentres`, `CentreDomiciliationDetails`, `AttestationDomiciliation`, `ContratDomiciliation`, `ProcurationDomiciliation` |
| `components/` | `DomiciliationActions`, `DocumentDomiciliationEditable`, `StatutDomiciliation` |
| `utils/` | `domiciliation.js`, `documentsDomiciliation.js`, `factureDomiciliation.js` (ré-export historique), `attestation.js`, `contrat.js` (utilise le paquet `qrcode`), `procuration.js` |
| `modules/domiciliation/` | `index.js`, `print/factureDomiciliation.js` (étape 15) |
| Routes `App.jsx` | 11 routes `/domiciliation…` (verrouillées par test, voir §10) |

**Consommateurs extérieurs de code Domiciliation** (graphe d'imports) : `BlocsEntreprise`, `ClientDetails`, `EntrepriseDetails`, `EntrepriseForm`
(pages Parties), `Dashboard`, `Topbar`, `Archive`, `Parametres` (onglets Centre + réglages), et **`modules/facturation/pages/DocumentForm.jsx`
et `pages/PaiementForm.jsx`** qui importent `utils/domiciliation.js`.

## 7. Cartographie des dépendances

| Élément | Type | Domaine | Dépend de | Utilisé par | Destination cible | Risque |
|---|---|---|---|---|---|---|
| `api/domiciliations.js` | API | Domiciliation | `http.js` | 14 fichiers dont Parties, Dashboard, Topbar, Archive | `modules/domiciliation/api` + point d'entrée | **moyen** (nombreux consommateurs) |
| `api/centres.js` | API | Domiciliation | `http.js` | `EntrepriseForm`, 2 pages centres | idem | moyen |
| `pages/Domiciliation*`, `CentreDomiciliationDetails` | pages | Domiciliation | `api/*`, composants UI partagés | `App.jsx` (+ `DomiciliationCentres` dans `Parametres`) | `modules/domiciliation/pages` | faible |
| `components/DomiciliationActions`, `StatutDomiciliation` | composants | Domiciliation | `api/domiciliations`, `utils/documentsDomiciliation` | **`BlocsEntreprise`** (Parties) | `modules/domiciliation/components` | moyen (consommé par Parties) |
| `components/DocumentDomiciliationEditable` + 3 pages document | composants | Domiciliation | `api/domiciliations`, **`api/entreprises` (Parties)**, `utils/print/identite` (Paramètres) | App | `modules/domiciliation/documents` | faible |
| `utils/attestation|contrat|procuration.js` | génération de documents | Domiciliation | partagé (`exporters`, `print/commun`, `ouvrirPdf`), `api/clients` (procuration) | pages documents, **snapshots** | `modules/domiciliation/documents` | **élevé** si le HTML bouge (snapshots) |
| `utils/documentsDomiciliation.js` | utilitaire | Domiciliation | `modules/domiciliation`, **`window.alert`** | `DomiciliationActions`, `DomiciliationForm`, `factureDomiciliation` | idem | faible |
| `utils/factureDomiciliation.js` | ré-export historique | Domiciliation | `documentsDomiciliation` | `ClientDetails`, `EntrepriseDetails` | à supprimer après migration des consommateurs | faible |
| `utils/domiciliation.js` | **mixte** | `aujourdhui` = **partagé** ; `calculerDateFin`, `classerNouveauRenouveler`, `chargerPrixServiceDomiciliation` = Domiciliation (+ **Services**) | `api/services` | **Facturation `DocumentForm`**, **`PaiementForm`**, `EntrepriseForm`, pages Domiciliation | scinder : `aujourdhui` → `shared`, le reste → module | **élevé** (créerait un cycle Facturation → Domiciliation) |
| `modules/domiciliation/print/factureDomiciliation.js` | impression | Domiciliation → **Facturation** (via `modules/facturation/index.js`) | Facturation, partagé | `documentsDomiciliation` | reste | faible |
| `utils/print/identite.js` | partagé | **Paramètres** (réglages `via_experts` = `domiciliation_settings`) | `api/settings` | Facturation, Paiements, Domiciliation | reste partagé | — |
| `api/settings.js` (fonctions Domiciliation) | API | **Paramètres** | — | `Parametres`, `ClientDetails`, `EntrepriseDetails` | reste (Paramètres) | — |

Classes de dépendances : **A** Domiciliation → Domiciliation (pages ↔ api ↔ documents) ; **B** → Facturation (uniquement `modules/domiciliation/print`) ; **C** → Parties
(`api/entreprises`, `api/clients`, ressource `entreprise`) ; **D** → Services (`chargerPrixServiceDomiciliation`) ; **E** → Paramètres (`utils/print/identite`, `api/settings`) ;
**F** → Identity / permissions (`useAuth`, `is_admin` dans `CentreDomiciliationDetails`, middlewares) ; **G** → Shared (UI, `exporters`, `print/*`) ; **H** : le paquet `qrcode`.

## 8. Couplage Domiciliation → Facturation (analyse détaillée)

1. **Pourquoi** : la « facture de domiciliation » doit avoir **exactement** le modèle PDF de la Facture ; `domiciliationEnFacture` convertit les champs d'une
   domiciliation en objet « document commercial » (une ligne « Domiciliation », HT / TVA 20 % déduits du TTC, période en note, `via_experts`,
   payée si une date de paiement existe) puis appelle le rendu de Facturation.
2. **Objets utilisés** : uniquement `construireHtmlDocumentCommercial('facture', facture, identite)` ; **jamais** `DocumentCommercial`, l'API Facturation, la
   numérotation (`numero: DOM-{id}/{aa}` est fabriqué localement) ni la base. Rien n'est enregistré.
3. **Appels directs / indirects** : un seul appel, **par le point d'entrée public** `modules/facturation/index.js` (aucun import de fichier interne).
   Données et cachet viennent de `utils/print/identite` (Paramètres), pas de Facturation.
4. **Backend** : aucun couplage Domiciliation → Facturation ; le seul lien est inverse (Facturation lit `DomiciliationSetting`, qui est un réglage).
5. **Acceptable dans un Modular Monolith ?** Oui : dépendance **à sens unique**, par l'API publique du module, sur une capacité (rendu d'une facture) et non sur
   ses données. Vérifié par test : Facturation n'importe ni Paiements ni Domiciliation, et hors module seul `index.js` est importé.
6. **Contrat / adaptateur préférable ?** Pas nécessaire : un contrat « rendu de facture » n'ajouterait qu'une couche. Une réserve : `index.js` de Facturation
   embarque aussi les pages (React) ; si le poids ou un cycle futur le justifiait, exposer un second point d'entrée `facturation/print` (public, sans pages).
7. **Décision** : **conserver tel quel** ; ne pas toucher au modèle ni au design.

## 9. Documents Domiciliation

| Document | Source | Données variables | Fixe | Sortie | Signature / cachet | Dépendances |
|---|---|---|---|---|---|---|
| Attestation | `utils/attestation.js` (`attestationParDefaut`, `construireHtmlAttestation`, `imprimerAttestationPdf`, `lireContenuAttestation`) | dénomination, dates début / fin, date du jour, centre, entreprise | texte juridique, mise en page A4 | HTML → PDF (`ouvrirPdfApresClic`) | cachet « Bureau de Comptabilité » **seulement si la case « Signature » est cochée** (`.att-cachet`) | `exporters`, `print/commun`, `ouvrirPdf` |
| Contrat | `utils/contrat.js` (+ `qrContratDataUrl`) | dénomination, ICE, CIN, dates, centre | texte du contrat en blocs positionnés, QR « Viaexperts-{CIN} » (sans CIN : pas de QR) | HTML → PDF | cachet sur la dernière page si coché | idem + paquet `qrcode` |
| Procuration | `utils/procuration.js` (`chargerClientProcuration`) | société, représentant, naissance, civilité, date | annexes 3, engagement | HTML → PDF | **jamais** de cachet | idem + `api/clients` (Parties) |
| Facture de domiciliation | `modules/domiciliation/print/factureDomiciliation.js` | prix total, mois payés / gratuits, dates, centre, n° d'archive | modèle Facture | PDF | cachet « Bureau » à défaut « Centre » si case cochée | **Facturation** (rendu), Paramètres |
| Éditeur | `components/DocumentDomiciliationEditable.jsx` | charge domiciliation + entreprise + identités, aperçu mis à l'échelle, édition du contenu | — | aperçu / édition / PDF | calcule le cachet : `signatureSurFacture` et réglages | Parties, Paramètres |
| Sélection | `utils/documentsDomiciliation.js` | cases `docFacture/docContrat/docAttestation/docProcuration` | — | — | — | — |

Les templates ne sont **pas modifiés** ; ils sont verrouillés par les instantanés (attestation, contrat, procuration, facture de domiciliation).

## 10. Tests existants

| Domaine | Tests |
|---|---|
| Backend CRUD / cycle / validation / permissions | `DomiciliationTest` (création, champs requis, mode de paiement, statut d'affichage, déclarer / résilier, cycle archive-corbeille-restore-supprimer, observations, documents hors corbeille, 403 / accès délégué) |
| Backend actions | `DomiciliationActionsTest` (renouveler : lien, entreprise et centre conservés, date de début, date de fin ; déclarer / résilier avec commentaire et fichier ; téléchargement ; opérations ; première période) |
| Backend centres / réglages | `CorrectionsAuditTest` (permissions des centres), `SettingsTest` (réglages Domiciliation, cachet), `EntrepriseTest` (champ centre), `ArchiveCountsTest` (clé `domiciliation`) |
| Filet global | `RoutesSnapshotTest`, `PermissionsSnapshotTest`, `ApiShapeSnapshotTest` (centre, domiciliation, listes) |
| Frontend documents | `documents.snapshot.test.js` : facture de domiciliation (conversion + HTML), attestation, contrat (+ QR), procuration ; `compatibilite-imports.test.js` ; `facturation-frontend.test.js` (frontières entre modules, absence de cycles) |
| **Ajoutés à cette étape** (`domiciliation-frontend.test.js`, 9) | 11 routes React dans l'ordre ; menu ; **copie de `MODES_PAIEMENT` identique à la source partagée** ; `calculerDateFin` (fins de mois, bissextile, entrées invalides) ; `classerNouveauRenouveler` ; les 4 documents et `documentsDisponibles` |

**Tests encore manquants (les plus critiques avant migration)** : cycle CRUD des **centres** (création, unicité du nom, suppression refusée si utilisé — seule la permission est testée) ;
visibilité d'une observation **privée** (`estVisiblePar`) et téléchargements ; filtre `statut` de `index` et statut d'affichage de la liste ; `activer` ; **backend : égalité des modes de
paiement** avec le frontend ; rendu des pages (volontairement exclu : pas de jsdom) ; test de frontière « le module Domiciliation n'est importé que par son `index.js` » (à ajouter **au moment** de la migration).

## 11. Risques

- **Cycle potentiel** : déplacer `utils/domiciliation.js` en bloc créerait **Facturation → Domiciliation** et **Paiements → Domiciliation** (via `aujourdhui`). À scinder **avant** toute migration frontend.
- **Domiciliation ↔ Parties** : le centre est une donnée de la fiche entreprise (FK `RESTRICT`), la ressource Domiciliation lit l'entreprise et son client : la modularisation backend demandera des contrats (centre, entreprise) et ne pourra pas supprimer ces FK.
- **`DomiciliationSetting`** est un réglage transversal (identité de l'émetteur) : l'embarquer dans le module casserait Facturation / PDF.
- **Archive** dépend du modèle `Domiciliation` ; **Parametres.jsx** embarque la page des centres.
- **Constante `MODES_PAIEMENT` ×3** (backend `StoreDomiciliationRequest`, `api/domiciliations.js`, `shared`) : risque de divergence silencieuse.
- Permissions du catalogue non appliquées (`facture`, `contrat`, `attestation`, `procuration`, `calendrier`, `export_list`) et menu sans permission : **comportement actuel à conserver** ; à ne pas « corriger » pendant la migration.
- `window.alert` dans `documentsDomiciliation.imprimerFactureDomiciliation` (couplage navigateur dans un utilitaire).
- Instantanés très volumineux (contrat) : un simple changement d'import qui altère le HTML les ferait tous échouer — c'est le filet voulu.

## 12. Architecture cible proposée

Backend (`app/Modules/Domiciliation/`, uniquement ce qui existe) : `Models/` (5 : `Domiciliation`, `CentreDomiciliation`, `DomiciliationDocument`, `DomiciliationObservation`, `DomiciliationOperation`),
`Http/Controllers` (`DomiciliationController`, `CentreDomiciliationController`), `Http/Requests` (4), `Http/Resources` (`DomiciliationResource`), `Contracts/` (voir plan), `routes.php`
(inclus par `routes/api.php` à la même position, comme Facturation), `DomiciliationServiceProvider`, `Tests/Feature`. **Reste hors module** : `DomiciliationSetting` + `DomiciliationSettingController` + `UpdateDomiciliationSettingRequest` (Paramètres),
migrations (non déplacées), seeders. Pas de dossiers Actions / Events / Listeners / Policies (rien à y mettre).

Frontend (`frontend/src/modules/domiciliation/`) : `api/` (`domiciliations.js`, `centres.js`), `pages/` (les 7 pages Domiciliation + `CentreDomiciliationDetails`), `components/` (`DomiciliationActions`, `StatutDomiciliation`), `documents/`
(`attestation`, `contrat`, `procuration`, `DocumentDomiciliationEditable` + 3 pages), `print/` (existant), `index.js`. **Restent partagés** : `utils/print/*`, `exporters`, `pdfDocument`, `api/settings.js`, `aujourdhui` (→ `shared/`).
**À ne surtout pas déplacer** : `DomiciliationSetting*`, `utils/print/identite.js`, les migrations, `shared/constants/documents.js`, les fichiers de snapshots.

## 13. Plan de migration proposé

| Étape | Contenu | Sécurité |
|---|---|---|
| **17** | **Préparation sans déplacement** : (a) frontend : extraire `aujourdhui` vers `shared/`, faire pointer Facturation et Paiements vers lui ; remplacer la copie `MODES_PAIEMENT` de `api/domiciliations.js` par l'import partagé ; (b) backend : contrat de comptage pour Archive (`CompteursDomiciliations`), puis lecture du centre / de l'entreprise par la ressource ; (c) tests manquants (cycle des centres, observation privée, égalité des modes de paiement backend ↔ partagé) | 1 sujet par commit, contrats + tests avant refactor, snapshots intacts |
| 18 | Backend : déplacer les Models / Requests / Resource / Controllers dans `app/Modules/Domiciliation/` avec `class_alias` temporaires (comme Facturation étape 4), `routes.php` inclus au même endroit | snapshots routes / permissions / API |
| 19 | Retirer les alias, déplacer les tests Domiciliation dans le module, contrat Parties → centre | idem |
| 20 | Frontend : déplacer `api/`, `pages/`, `components/` dans le module, point d'entrée `index.js`, ré-exports temporaires pour `Dashboard`, `Topbar`, `Archive`, Parties, `Parametres` | tests de frontières |
| 21 | Frontend : déplacer les documents (`attestation`, `contrat`, `procuration`, éditeur) | **32 instantanés inchangés** |
| 22 | Nettoyage : supprimer ré-exports, `factureDomiciliation.js` historique | recherche d'imports |

## 14. Modifications réellement effectuées

Une seule : ajout de `frontend/src/__tests__/domiciliation-frontend.test.js` (tests de caractérisation, aucun code applicatif modifié) et de ce document.

## 15. Résultats

| Vérification | Résultat |
|---|---|
| Vitest | **67 passés** (58 + 9) ; 4 fichiers |
| Instantanés | 32 entrées, fichier `.snap` non modifié |
| Lint | 0 erreur, 45 avertissements (inchangé) |
| Build | OK |
| Backend complet | 331 passés, 1 échec connu (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |

Limite : aucune page n'a été rendue après connexion dans le navigateur (aucun code applicatif modifié ; le seul compte administrateur du jeu de données est le compte réel de l'utilisatrice).
