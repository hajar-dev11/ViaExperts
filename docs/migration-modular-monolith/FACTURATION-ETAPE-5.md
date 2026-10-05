# Facturation — Étape 5 : audit et nettoyage architectural

Tag de départ : `pre-facturation-etape5` (= `post-facturation-etape4`, commit `0e3244f`). Aucun alias supprimé, aucun
déplacement, aucune modification de code applicatif : **seules 5 lignes d'`use` de tests ont été migrées** (voir §F).
Aucun changement métier, API, route, permission, base, PDF ou frontend.

Méthode : recherche textuelle de tous les anciens noms (qualifiés et non qualifiés) dans `app/`, `config/`, `database/`,
`routes/`, `tests/` ; **preuve dynamique** de l'usage réel des alias (hook `auto_prepend_file` qui relève, à la fin de la
suite complète hors `ModuleFacturationTest`, quels fichiers d'alias ont été chargés).

## A. Anciens namespaces encore utilisés

Après migration des imports de tests, il ne reste que les fichiers d'alias, le test d'alias et 1 référence implicite :

| Ancien namespace | Fichier | Ligne | Consommateur | Peut être supprimé ? |
|---|---|---|---|---|
| `App\Models\DocumentCommercial` (implicite : `DocumentCommercial::class` dans `namespace App\Models`, sans `use`) | `app/Models/Paiement.php` | 53 | `Paiement::document()` (relation `belongsTo`) | **Non** tant que Paiement n'importe pas le nouveau nom (modification d'un autre module, hors étape) |
| `App\Models\DocumentCommercial` | `app/Models/DocumentCommercial.php` | 13–14 | le fichier d'alias lui-même | avec l'alias |
| `App\Models\DocumentLigne` | `app/Models/DocumentLigne.php` | 13–14 | alias lui-même | avec l'alias |
| `App\Http\Controllers\Api\V1\DocumentCommercialController` | `app/Http/Controllers/Api/V1/DocumentCommercialController.php` | 13–14 | alias lui-même | avec l'alias |
| `App\Http\Requests\StoreDocumentCommercialRequest` | `app/Http/Requests/StoreDocumentCommercialRequest.php` | 13–14 | alias lui-même | avec l'alias |
| `App\Http\Requests\UpdateDocumentCommercialRequest` | `app/Http/Requests/UpdateDocumentCommercialRequest.php` | 13–14 | alias lui-même | avec l'alias |
| `App\Http\Resources\DocumentCommercialResource` | `app/Http/Resources/DocumentCommercialResource.php` | 13–14 | alias lui-même | avec l'alias |
| `App\Services\NumerotationDocuments` | `app/Services/NumerotationDocuments.php` | 13–14 | alias lui-même | avec l'alias |
| les 7 noms ci-dessus | `tests/Feature/ModuleFacturationTest.php` | 35–41 | test qui **prouve** l'existence des alias | à supprimer en même temps que les alias |

Anciens namespaces des Contracts (`App\Contracts\Facturation`) et des adaptateurs (`App\Services\Facturation`) :
**0 référence** (aucun alias, aucun consommateur).

Total : **21 lignes** qualifiées (14 dans les 7 fichiers d'alias, 7 dans le test d'alias) + **1 référence implicite**
(`Paiement.php:53`). Seule cette dernière est une vraie dépendance de production. Références migrées pendant l'étape :
6 lignes dans 5 tests (§F).

## B. État des 7 aliases

Preuve dynamique : sur la suite complète (274 tests hors `ModuleFacturationTest`), **un seul** fichier d'alias est chargé.

| Alias | Utilisé ? | Par qui ? | Catégorie | Action recommandée |
|---|---|---|---|---|
| `App\Models\DocumentCommercial` | **Oui** | `Paiement::document()` (relation) | **C** — dépendance inter-module | Garder ; supprimer après avoir fait importer le nouveau nom par `Paiement` (étape dédiée) |
| `App\Models\DocumentLigne` | Non | personne (hors test d'alias) | **B** | Supprimable |
| `App\Http\Controllers\Api\V1\DocumentCommercialController` | Non | personne (routes → nouveau nom) | **B** | Supprimable |
| `App\Http\Requests\StoreDocumentCommercialRequest` | Non | personne | **B** | Supprimable |
| `App\Http\Requests\UpdateDocumentCommercialRequest` | Non | personne | **B** | Supprimable |
| `App\Http\Resources\DocumentCommercialResource` | Non | personne | **B** | Supprimable |
| `App\Services\NumerotationDocuments` | Non (depuis la migration des tests) | personne | **B** | Supprimable |

Aucune catégorie A (aucun alias indispensable au fonctionnement actuel en dehors de `DocumentCommercial`) ni D.
Vérifications complémentaires : aucun `morphMap` ni colonne `*_type` portant ces noms (seul `tokenable_type` = `User`),
aucun Job / Listener / Observer / Policy / Factory / Mailable les référençant, aucun seeder (les seeders écrivent par
`DB::table`). Les processus enfants du test de concurrence passent par HTTP. **Rien n'a été supprimé** dans cette étape :
la suppression des 6 alias B est mécanique et recommandée pour l'étape 6 (§G).

## C. Dépendances directes restantes

| Module | Dépendance | Type | Action future |
|---|---|---|---|
| Paiements (`Paiement::document()`, `PaiementResource.php:28`, `PaiementController` `RELATIONS`) | relation Eloquent vers `DocumentCommercial` via l'alias ; eager-load `document` ; `factureNumero` lu sur le modèle | **Couplage direct à éliminer** (temporaire mais acceptable) | Importer le nouveau nom, puis remplacer par une lecture via contrat (ex. numéro de facture) quand Paiements sera migré |
| Paiements | `PaiementController.php:30` : règle `exists:documents_commerciaux,id` ; FK `paiements.document_id → documents_commerciaux` (migration) | Couplage de **schéma** | Documenter ; à traiter avec les migrations (hors étape) |
| Paiements | `Paiement::synchroniserFacture` → contrat `SynchronisationPaiements` | Contractuelle et correcte | — |
| Paiements | `PaiementController::facturesDisponibles` → `FacturesDisponibles` | Contractuelle et correcte | — |
| Paiements → Services en cours | `ServiceEnCours::assurerServicesPourTiers` en direct (lignes 153, 199) | Hors périmètre Facturation | Faire passer par `AssureServicesEnCours` lors de la migration de Paiements |
| Mouvement | `FacturesPourMouvements` | Contractuelle et correcte | — |
| Archive | `StatistiquesDocuments` | Contractuelle et correcte | — |
| Services en cours | aucune dépendance vers Facturation ; reçoit `AssureServicesEnCours` | Contractuelle et correcte | — |
| Déclaration TVA | **aucune** référence à Facturation (n'appelle que `ServiceEnCours::assurerPourClient`) | Hors périmètre | Non modifié |
| Domiciliation | **aucune** référence backend à `DocumentCommercial` (ses « documents » sont `DomiciliationDocument`). Dépendance inverse : Facturation lit `DomiciliationSetting` pour la numérotation de l'émetteur `via_experts` | Facturation → Paramètres/Domiciliation (lecture) | Non modifié ; à encapsuler quand Paramètres sera un module |
| Facturation → noyau | `Party`, `Client`, `Entreprise`, `Service`, `CabinetSetting`, `DomiciliationSetting`, `User::hasPermission`, `Controller` | Dépendances vers le noyau, `use` explicites | Normales (noyau/Parties) |
| Seeders | `DemoDataSeeder` (lignes 664, 688, 751) et `DemoDataPurgeSeeder` (44) : `DB::table('documents_commerciaux' / 'document_lignes')` | Couplage de **schéma**, aucune classe | Documenter ; à revoir si les tables sont renommées |
| Jobs / Listeners / Observers / Policies / Factories | aucun | — | — |
| Tests | voir §F | — | — |

## D. Contracts

| Contract | Emplacement | Consommateur | Implémentation | État |
|---|---|---|---|---|
| `FacturesDisponibles` (`lister`) | `Modules/Facturation/Contracts` | `PaiementController` (constructeur) | `Modules/Facturation/Services/FacturesDisponiblesEloquent` | Correct, utilisé, 1 méthode |
| `SynchronisationPaiements` (`appliquerTotalPaye`) | `Modules/Facturation/Contracts` | `Paiement::synchroniserFacture` (via `app()`) | `SynchronisationPaiementsEloquent` | Correct, utilisé, 1 méthode |
| `StatistiquesDocuments` (`compterParType`) | `Modules/Facturation/Contracts` | `ArchiveController` | `StatistiquesDocumentsEloquent` | Correct, utilisé, 1 méthode |
| `FacturesPourMouvements` (`entrees`, `anneesDisponibles`) | `Modules/Facturation/Contracts` | `MouvementController` | `FacturesPourMouvementsEloquent` | Correct, les 2 méthodes sont utilisées |
| `AssureServicesEnCours` (`assurerPourTiers`) | `App\Contracts\ServicesEnCours` | `DocumentCommercialController` (Facturation) | `App\Services\ServicesEnCours\AssureServicesEnCoursEloquent` → `ServiceEnCours::assurerServicesPourTiers` | Emplacement correct (appartient à Services en cours, évite le cycle) |

Aucune dépendance circulaire (Services en cours n'importe rien de Facturation ; les contrats Facturation n'importent que
`Illuminate`). Aucune méthode publique inutile. Rien à refaire.

## E. Service Providers et routes

**Providers** — `FacturationServiceProvider` (enregistré dans `config/app.php`, après `RouteServiceProvider`) lie les
4 contrats de Facturation ; `AppServiceProvider::$bindings` ne lie que `AssureServicesEnCours`. Aucun doublon (test
`ModuleFacturationTest`), aucun binding inutilisé (5 contrats = 5 consommateurs). L'ordre de chargement est sans
importance : les liaisons sont enregistrées à `register()` et ne sont résolues qu'à l'exécution d'une requête. Rien modifié.

**Routes** — `Modules/Facturation/routes.php` contient 9 routes (`GET numero-propose`, `GET /`, `POST /`, `GET|PUT|DELETE
/{document}`, `POST /{document}/archive|corbeille|restore`), incluses par `routes/api.php:151` à l'emplacement exact de
l'ancien bloc, donc sous `api/v1` + `auth:sanctum` avec `whereIn(type)`. `numero-propose` précède `/{document}`. Aucun
doublon (9 routes `facturation/` dans `route:list`). Le snapshot de routes (URI, méthode, nom, middleware, ordre,
contrôleur@méthode) est identique et vert. Les permissions restent dans le contrôleur (inchangé).

## F. Tests

Emplacement actuel :

| Fichier | Rôle | Pourrait aller dans le module ? |
|---|---|---|
| `FacturationTest`, `NumerotationDocumentsTest`, `ContratsFacturationTest`, `ModuleFacturationTest` | purement Facturation | Oui |
| `NumerotationConcurrenceTest` + `tests/Support/creer_document_en_parallele.php` | Facturation ; le script enfant charge `__DIR__/../../vendor/autoload.php` et `bootstrap/app.php` | Oui, mais **chemins relatifs à réécrire** |
| `PaiementTest`, `MouvementTest`, `ServicesEnCoursAutomatiquesTest`, `CorrectionsAuditTest` | testent d'autres modules en créant des factures par l'API | **Non** : doivent rester avec leur module |
| `Snapshots/*` + `tests/Snapshots/*.json` + `tests/Support/Snapshot.php` | filet transverse | **Non** (transverses) |

`phpunit.xml` ne scanne que `tests/Unit` et `tests/Feature`. Pour héberger des tests dans les modules il faudrait ajouter
une suite `<directory suffix="Test.php">./app/Modules/*/Tests</directory>` (le PSR-4 `App\` couvre déjà
`app/Modules/*/Tests`) ; **`phpunit.xml` n'a pas été modifié**. Risques : chemin du script enfant et des snapshots, filtre
`--filter` des commandes existantes, `coverage include ./app` qui inclurait les tests, double exécution si une suite est
oubliée. Recommandation : ne déplacer que les 5–6 tests purement Facturation, en une étape dédiée.

Modification réellement faite (mécanique) : migration des `use` de 5 tests vers les nouveaux namespaces —
`FacturationTest`, `PaiementTest`, `NumerotationDocumentsTest` (2 lignes), `NumerotationConcurrenceTest`,
`ContratsFacturationTest` : `App\Models\DocumentCommercial` → `App\Modules\Facturation\Models\DocumentCommercial`,
`App\Services\NumerotationDocuments` → `App\Modules\Facturation\Services\NumerotationDocuments`. Aucune assertion modifiée.

Résultats :

| Vérification | Avant | Après |
|---|---|---|
| Backend complet | 283 passés, 1 échec connu | **283 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Facturation (+ contrats, module) | 34 | 34 passés |
| Paiement / Mouvement / Archive / Services en cours | 14 / 7 / 15 / 19 | 14 / 7 / 15 / 19 passés |
| Numérotation + concurrence | 14 | 14 passés |
| Snapshots routes / permissions / API | 3 | 3 passés, fichiers non modifiés |
| Vitest | 40 | 40 passés (32 snapshots de documents inchangés) |
| Lint / Build | 0 erreur / OK | 0 erreur / OK |

## Frontend (documentation seulement, rien modifié)

- `api/facturation.js` importé par : `DocumentForm.jsx:15`, `DocumentList.jsx:16`, `Archive.jsx:20`, `Mouvement.jsx:15`,
  et — uniquement pour les **constantes** `EMETTEURS` / `MODES_PAIEMENT` — `PaiementForm.jsx:12`, `PaiementGestion.jsx:15`,
  `PaiementList.jsx:14`, `Rapports.jsx:11` (ces 4 pages pourraient importer `shared/constants/documents.js`).
- `utils/documentPrint.js` (façade, 12 noms ré-exportés) importé par : `DocumentList.jsx:13`, `Mouvement.jsx:17`,
  `PaiementList.jsx:17`, `DocumentDomiciliationEditable.jsx:9`, `attestation.js:12`, `contrat.js:13`, `procuration.js:13`,
  `documentsDomiciliation.js:1` — dont 5 appartiennent à Domiciliation / Entreprises (noyau d'impression partagé :
  `formatDateFr`, `ouvrirPdfApresClic`, `chargerIdentitePdf`).
- Tests frontend : `compatibilite-imports.test.js`, `documents.snapshot.test.js` verrouillent ces façades.

## G. Plan recommandé pour l'étape 6

1. **Supprimer les 6 alias de catégorie B** (`DocumentLigne`, contrôleur, 2 requests, resource, `NumerotationDocuments`) et
   retirer les 6 cas correspondants de `ModuleFacturationTest`. Preuve fournie ici (aucun chargement pendant la suite
   complète, aucune référence). Annulable via `git revert`. Vérifier : suite complète + snapshots + concurrence.
2. **Traiter l'alias `DocumentCommercial` (catégorie C)** : ajouter dans `Paiement.php` l'`use` du nouveau namespace (1
   ligne, sans effet de comportement — nécessite l'accord explicite car c'est un autre module), puis supprimer le dernier
   alias et le dernier cas du test d'alias.
3. **Ensuite seulement**, étape distincte : déplacer les tests purement Facturation dans le module (ajout d'une suite
   `phpunit.xml`, réécriture des chemins du script de concurrence) ou le laisser tel quel.
4. Reporter à une étape ultérieure : relation `Paiement::document()` + `factureNumero`, validation
   `exists:documents_commerciaux`, FK et seeders (couplages de schéma), `DomiciliationSetting` lu par la numérotation,
   chargement des routes par le provider, frontend Facturation.
