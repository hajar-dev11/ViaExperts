# Facturation — Étape 13 : audit du couplage de persistance (Paiements ↔ Facturation)

Tag de départ : `pre-facturation-etape13` (= `3cfc30a`). Étape d'**audit** : aucun code applicatif, migration, seeder, route,
permission, API, PDF ni frontend modifié ; la clé étrangère n'est pas touchée. Seul ajout : un fichier de **tests de
caractérisation** (7 tests) qui décrivent le comportement existant.

## 1. Objectif et état avant l'étape

Mesurer ce qui relie encore Paiements et la base de Facturation (`paiements.document_id` → `documents_commerciaux.id`,
migrations, seeders, SQL direct) pour décider de ce qui reste, de ce qui pourra rejoindre le module et de ce qui est
transversal. Départ : 324 tests passés + 1 échec connu (`ServiceChatTest::test_empty_message_is_rejected`), Vitest 40,
lint 0 erreur / 45 avertissements, build OK. Facturation vit dans `app/Modules/Facturation/` ; Paiements, Mouvement, Archive,
TVA ne référencent plus ses modèles (contrats uniquement).

## 2. Audit de `paiements.document_id`

**Définition (migration `2026_09_17_160000_create_paiements_table`)** : `unsignedBigInteger('document_id')->nullable()` ;
`foreign('document_id')->references('id')->on('documents_commerciaux')->onDelete('set null')->onUpdate('cascade')`. Pas d'index
explicite (MySQL en crée un pour la FK). Les deux FK entrantes sur `documents_commerciaux` sont `paiements.document_id` et
`document_lignes.document_id` (cascade, interne à Facturation) ; sorties : `party_id → parties` (restrict) et
`created_by → users` (set null). Vérifié sur la base de développement : 2 FK entrantes, 0 orphelin, 0 paiement relié à un
document supprimé ou non actif, 0 incohérence `prix_paye`.

**Carte**

```
Paiement ──document_id (nullable, FK SET NULL)──▶ documents_commerciaux.id
   │  écriture : PaiementController::store/update (validé par le contrat FactureExiste), seeder démo (raw)
   │  lecture  : PaiementResource (documentId), filtre ?document_id=, Paiement::synchroniserFacture, numeroFacture()
   └─ aucun accès au modèle DocumentCommercial : uniquement 4 contrats Facturation
        FactureExiste (validation) · FactureReference (numéro) · SynchronisationPaiements (prix_paye) · FacturesDisponibles (liste)
```

| Aspect | Verdict |
|---|---|
| Écrit | `PaiementController` (`store`, `update` via `$request->validate` + `Paiement::create/update`), `DemoDataSeeder` (insert brut) |
| Lu | `PaiementResource:27` (`documentId`), `PaiementController::index` (filtre `?document_id=`), `Paiement::synchroniserFacture` (`where('document_id')`), `numeroFacture()` / `chargerNumerosFactures()` |
| Relation Eloquent | **aucune** (supprimée à l'étape 8) |
| Validation | contrat `FactureExiste` (étape 10) : `nullable`, `integer`, existence **sans** portée suppression douce |
| Nature | **API** (champ `document_id` en entrée, `documentId` en sortie) + **persistance** (FK) + **métier** (option C : `prix_paye` resynchronisé) ; le code PHP n'a plus de couplage de modèle |
| Tests | `PaiementTest` (+ 11 de l'étape 10), `MouvementTest`, `ContratsFacturationTest`, `ApiShapeSnapshotTest` ; nouveau `PaiementFacturePersistenceTest` |

## 3. Analyse de la clé étrangère (recommandation : **la conserver**)

1. **Nécessaire à l'intégrité ?** Oui. La validation applicative (`FactureExiste`) ne couvre que l'API ; la FK protège aussi les
   écritures hors API (seeders, SQL, futurs modules) et la fenêtre entre validation et insertion. Test : la base refuse un
   paiement vers un document inexistant.
2. **Peut-elle rester après modularisation ?** Oui. Il n'y a qu'une base ; la FK est la seule dépendance physique restante et
   elle va dans un seul sens (Paiements → Facturation).
3. **Compatible Modular Monolith ?** Oui, à ces conditions : dépendance unidirectionnelle ; la FK ne référence que
   l'identifiant (`id`) de la table publiée du module ; aucune requête / jointure croisée dans le code (tout passe par les
   contrats — c'est déjà le cas) ; l'ordre des migrations (Facturation avant Paiements) est préservé.
4. **La supprimer découplerait-elle utilement ?** Peu : le découplage de code est déjà fait. Elle ne deviendrait utile que
   pour séparer physiquement les bases (hors périmètre).
5. **Risques si supprimée** : lignes orphelines après suppression physique (purge de démonstration, SQL), perte de la
   remise à `NULL` automatique (`SET NULL`), plus de filet pour les écritures hors API ; il faudrait recoder cette logique en
   PHP (listener / contrat) et la tester.
6. **Documents supprimés en douceur** : la FK ne s'en occupe pas (voir §6) ; la supprimer ne changerait rien à ce cas.
7. **Un module peut-il avoir une FK vers la table d'un autre ?** Oui dans un monolithe à base unique : c'est un compromis
   courant (intégrité contre autonomie). Règle proposée : autorisé uniquement vers l'identifiant d'une table « publiée » et dans
   le sens de la dépendance de module ; à documenter dans le module Paiements.

## 4. Audit des migrations (rien déplacé, rien renommé)

Chaque migration est identifiée par son nom de fichier dans la table `migrations`, que Laravel enregistre sans le chemin.

| Classe | Migration | Remarque |
|---|---|---|
| **A. Facturation (naturelles)** | `2026_09_17_150000_create_documents_commerciaux_table`, `2026_09_17_150001_create_document_lignes_table` | seules à créer / modifier les tables du module ; aucune migration ultérieure ne les altère |
| **B. Autre domaine, FK vers Facturation** | `2026_09_17_160000_create_paiements_table` (`paiements.document_id`) | reste à Paiements ; doit s'exécuter **après** A |
| **C. Transverses utilisées par Facturation** | `…090000_create_cabinet_settings_table`, `…090001_create_domiciliation_settings_table` (colonnes de numérotation `facture_/devis_/bl_/avoir_*` lues par `NumerotationDocuments`), `…100000/100001_add_branding_*` (identité PDF), `…142119_create_parties`, `…142120_create_clients`, `…150954_create_entreprises`, `…130003_create_services` (cibles de FK : `party_id`, `service_id`), `…create_users`, permissions (catalogue `facturation`) | appartiennent au noyau / Paramètres / Parties |
| **D. À ne surtout pas déplacer** | toutes celles de C (cibles de FK : l'ordre d'exécution est contraignant), et `2026_09_17_160000_create_paiements_table` tant que A n'est pas stabilisée | déplacer une migration déjà appliquée sans conserver nom et horodatage risquerait de la rejouer ou de casser l'ordre |

Constat : aucune migration n'altère `documents_commerciaux` / `document_lignes` après leur création ; aucune migration d'un autre
domaine ne les référence hormis `paiements`.

## 5. Audit des seeders / factories

Aucune factory ne concerne Facturation (seule `UserFactory`). `DatabaseSeeder` n'appelle que `PermissionSeeder` ; les seeders
de démonstration sont lancés à la main et **aucun test ne les exécute**.

| Fichier / méthode | Opération | Détail |
|---|---|---|
| `DemoDataSeeder::creerDocumentsCommerciaux` (l. 633–700) | création | `DB::table('documents_commerciaux')->insertGetId` (14 documents `D-…`, tous types / statuts), `DB::table('document_lignes')->insert` |
| `DemoDataSeeder::creerPaiements` (l. 711–780) | création, mise à jour | `DB::table('paiements')->insert` avec `document_id` (paiements `#D…`), puis `update prix_paye` du document ; 3 paiements sans facture (`document_id` null) dont 1 archivé |
| `DemoDataPurgeSeeder` (l. 38–44) | suppression | supprime d'abord `paiements` (`#D%`) puis `documents_commerciaux` (`D-%`) ; `document_lignes` part en cascade |
| `PermissionSeeder` | création | permissions du groupe `facturation` / `paiements` (catalogue ; pas de table de documents) |

Dépendances inter-modules : le seeder démo écrit directement dans les tables de Facturation **et** de Paiements, en contournant
modèles et contrats (couplage de schéma, volontaire pour des données de démonstration). Il ne sera à adapter que si les tables
sont renommées. Ordre de purge compatible avec la FK (et avec `SET NULL`).

## 6. Références backend trouvées (hors Facturation)

Recherche de `documents_commerciaux`, `document_lignes`, `document_id`, `DocumentCommercial`, `DocumentLigne` :

| Catégorie | Références | Décision |
|---|---|---|
| Paiement (prod) | `document_id` dans `PaiementController` (validation via contrat, filtre `?document_id=`, `synchroniserFacture`), `PaiementResource:27`, `Paiement` ($fillable, `numeroFacture`, `chargerNumerosFactures`, `where('document_id')`) ; commentaires citant `documents_commerciaux.prix_paye` | colonne de **Paiements** : normal ; reste tel quel |
| Mouvement | aucune référence à la table ni au modèle (contrat `FacturesPourMouvements`) ; `MouvementTest:137` envoie `document_id` | rien à faire |
| Archive | aucune (contrat `StatistiquesDocuments`) | rien à faire |
| TVA / Services en cours / Domiciliation | aucune | rien à faire |
| Seeder | `DemoDataSeeder`, `DemoDataPurgeSeeder` (§5) | accepté ; niveau base uniquement |
| Migration | `create_paiements_table` (FK), `create_document_lignes_table` | historique : ne pas toucher |
| Tests hors module | `PaiementTest` (+ import de `DocumentCommercial` pour un helper, requêtes de contrôle sur `documents_commerciaux`), `PaiementFacturePersistenceTest` (nouveau), `ApiShapeSnapshotTest`, `MouvementTest` | acceptables (tests d'intégration) ; seul import du modèle hors module : `PaiementTest` et le nouveau test |
| Autres | `routes/api.php:246` : commentaire | sans effet |

**Anciens namespaces / alias** : les fichiers `app/Models/DocumentCommercial.php`, `DocumentLigne.php` et les 5 autres anciens
emplacements **n'existent plus** ; aucun `class_alias` dans le code ; les 7 anciens noms ne subsistent que comme chaînes dans
`ModuleFacturationTest` (qui vérifie leur absence).

**Imports du modèle `Modules\Facturation\Models\*` hors du module** : seulement 2 fichiers de **tests**
(`PaiementTest`, `PaiementFacturePersistenceTest`), pour créer / relire des données ; aucun fichier de production. Autres imports
`Modules\Facturation\…` hors module : uniquement des **contrats** (`PaiementController`, `Paiement`, `ArchiveController`,
`MouvementController`) et `config/app.php` (provider).

**Un nouveau contrat est-il nécessaire ?** Non : il ne reste aucun accès de production à ces tables depuis un autre module.

## 7. Suppression douce, statuts et comportement de `document_id` (vérifiés par test, base MySQL réelle)

Dans l'application, « Supprimer définitivement » d'un document (`DocumentCommercialController::destroy`, autorisé seulement
si `status = corbeille`) fait un **`SoftDeletes::delete()`** : la ligne reste en base avec `deleted_at`. Aucune route ne fait de
suppression physique.

| Situation | Comportement actuel (testé) |
|---|---|
| Document **supprimé en douceur** | la ligne existe → la **FK ne se déclenche pas** ; `paiements.document_id` est conservé ; `PaiementResource` renvoie `documentId` conservé et `factureNumero: null` (le contrat de lecture exclut les supprimés) ; la validation `FactureExiste` l'**accepte** toujours ; la resynchronisation ne trouve plus le document → **`prix_paye` du document figé**, sans erreur |
| Document **restauré** (`deleted_at` remis à null) | aucune route API ne le permet (`/restore` → 404, le modèle ne voit plus la ligne) ; si la ligne est restaurée en base / par le modèle, le numéro réapparaît et la synchronisation reprend |
| Statut `archive` / `corbeille` (sans `deleted_at`) | lien conservé, numéro visible, synchronisation active ; la restauration par statut (`/restore` → `actif`) ne change pas le lien ; seules les factures `actif` sont proposées par `factures-disponibles` |
| **Suppression physique** (SQL, `forceDelete`, purge démo) | `ON DELETE SET NULL` : `document_id` devient `NULL`, le paiement et son `prix_paye` sont conservés, les `document_lignes` partent en cascade |
| Paiement vers document inexistant (SQL direct) | refusé par la base (violation de clé étrangère) |

La FK est donc **compatible** avec ce comportement, mais elle ne couvre que la suppression physique ; le cas « paiement relié à
un document supprimé en douceur » est un **choix métier implicite** (aucun blocage, `prix_paye` figé). Ce n'est pas modifié ici.

## 8. Classement des couplages restants

| Couplage | Type | Verdict |
|---|---|---|
| FK `paiements.document_id` → `documents_commerciaux.id` | persistance | **garder** (§3) |
| FK `document_lignes.document_id` → `documents_commerciaux.id` | interne à Facturation | garder |
| Contrats `FactureExiste` / `FactureReference` / `SynchronisationPaiements` / `FacturesDisponibles` | code | corrects, en place |
| Seeders démo (insert / delete bruts) | seeding | acceptable, niveau base |
| `PaiementTest` + nouveau test (import du modèle) | test | acceptable |
| Colonnes de numérotation dans `cabinet_settings` / `domiciliation_settings` lues par `NumerotationDocuments` | Facturation → Paramètres | transversal, hors périmètre |
| `prix_paye` stocké sur le document, écrit par Paiements via contrat | métier (option C) | assumé |

## 9. Tests de caractérisation ajoutés (7) — `tests/Feature/PaiementFacturePersistenceTest.php`

Décrivent l'existant, sans modifier le code : FK `SET NULL` / `CASCADE`, colonne nullable ; refus d'un paiement vers un
document inexistant par la base ; suppression douce (ligne et lien conservés, `factureNumero` null, restauration par API en 404) ;
paiement modifié après suppression douce (document intact, `prix_paye` figé, `document_id` encore accepté) ; restauration de la
ligne (numéro et synchronisation rétablis) ; statuts archive / corbeille (lien conservé, synchronisation active, `factures-
disponibles` n'expose que les `actif`) ; suppression physique (`document_id` → null, paiement conservé, lignes en cascade).
Pas de test sur les seeders : ils ne sont pas exécutés par la suite et les lancer écrirait des données de démonstration.

## 10. Résultats des tests

| Vérification | Départ | Après |
|---|---|---|
| Backend complet | 324 passés, 1 échec connu | **331 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Persistance (nouveau) | — | 7 passés |
| Facturation (module) / Contrats | 53 / 18 | 53 / 18 passés |
| Paiement / TVA / Mouvement / Archive / Services en cours | 32 / 26 / 7 / 9 / 19 | 32 / 26 / 7 / 9 / 19 passés |
| Numérotation / Concurrence | 12 / 2 | 12 / 2 passés |
| Snapshots routes / permissions / API | 3 | 3 passés, fichiers inchangés |
| Vitest | 40 | 40 passés (32 snapshots de documents inchangés) |
| Lint / Build | 0 erreur, 45 avertissements / OK | 0 erreur, 45 avertissements / OK |

## 11. Risques

- **Métier à trancher (non modifié)** : un document « supprimé définitivement » (suppression douce) peut avoir des paiements ;
  il reste relié, sa facture est invisible, son `prix_paye` est figé et la validation l'accepte encore. Est-ce voulu ? Bloquer la
  suppression, détacher les paiements ou garder tel quel est une décision métier.
- Tout déplacement de migrations doit conserver nom et horodatage et respecter l'ordre Facturation → Paiements.
- Les seeders de démonstration contournent contrats et modèles.
- Le test d'information de schéma (`information_schema`) suppose MySQL (la base de test l'est).
- `PaiementTest` importe encore le modèle `DocumentCommercial`.

## 12. Recommandation pour l'étape 14

1. **Ne pas supprimer la FK ni déplacer les migrations historiques.**
2. Si l'on veut préparer le module côté base sans risque : ajouter dans `FacturationServiceProvider` un `loadMigrationsFrom`
   pour de **futures** migrations du module uniquement (aucune migration existante déplacée), avec un test de non-régression de
   `migrate:status`.
3. En parallèle, **décision métier** sur le document supprimé en douceur ayant des paiements (§11) ; selon la réponse, une étape
   dédiée avec tests de caractérisation (déjà en place).
4. Sinon, étape frontend Facturation (4 pages importent les constantes via `api/facturation.js`).
