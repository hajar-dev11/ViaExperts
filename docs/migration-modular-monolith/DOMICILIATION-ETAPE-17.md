# Domiciliation — Étape 17 : découplage préparatoire et renforcement des tests

Tag de départ : `pre-domiciliation-etape17` (= `2a5b59b`). Tag d'arrivée : `post-domiciliation-etape17`.
Étape de **préparation** : aucun modèle, contrôleur, request ni resource Domiciliation n'est déplacé ; aucune migration, table, FK, route,
URL, permission, PDF ni template modifié ; les 32 instantanés HTML sont inchangés (fichier `.snap` non modifié).

## 1. Incident préalable : instantanés « date du jour » (corrigé, test uniquement)

En lançant les tests après le changement de date (06/10/2026), **11 instantanés** de `documents.snapshot.test.js` (attestation, contrat, procuration
« valeurs par défaut / aperçu / mode édition ») ont échoué. Analyse faite **avant** de continuer : les mêmes 11 échecs apparaissent sur le dépôt
**intact** (changements mis de côté), donc sans lien avec cette étape. Cause : la date était figée dans `beforeAll`, mais les `describe` calculent
`attestationParDefaut` / `contratParDefaut` / `procurationParDefaut` pendant la **collecte**, donc avec l'horloge réelle ; les instantanés avaient été
enregistrés le 05/10 et cassaient dès le lendemain. Correction : l'horloge est figée **au chargement du fichier** (`vi.useFakeTimers()` +
`vi.setSystemTime(2026-10-05T10:00:00)` en haut du module). Le fichier `.snap` n'est **pas** modifié et les 35 tests repassent à l'identique.
Commit séparé : `f156bfe`.

## 2. `aujourdhui` extrait vers `shared`

| | Avant | Après |
|---|---|---|
| Définition | `utils/domiciliation.js` | `shared/utils/date.js` (code **identique**, dépend de rien) |
| `modules/facturation/pages/DocumentForm.jsx` | importe `utils/domiciliation.js` (**Facturation → Domiciliation**) | importe `shared/utils/date.js` |
| `pages/PaiementForm.jsx` | importe `utils/domiciliation.js` (**Paiements → Domiciliation**) | importe `shared/utils/date.js` |
| `components/DomiciliationActions.jsx`, `pages/DomiciliationForm.jsx` | `utils/domiciliation.js` | `shared/utils/date.js` (+ `utils/domiciliation.js` pour `calculerDateFin` etc.) |

`utils/domiciliation.js` n'est **pas** déplacé : il garde `calculerDateFin`, `classerNouveauRenouveler`, `chargerPrixServiceDomiciliation`. Il n'est plus importé que
par du code Domiciliation / `EntrepriseForm`. Commit `f7c2e00`. Note : `pages/EntrepriseForm.jsx` a sa propre copie locale d'`aujourdhui` (non modifiée, hors périmètre).

## 3. Modes de paiement

- **Frontend** : la copie de `MODES_PAIEMENT` d'`api/domiciliations.js` est **supprimée** ; `DomiciliationActions`, `DomiciliationForm` et `EntrepriseForm` importent
  `shared/constants/documents.js` (mêmes valeurs, même ordre). Le test d'égalité des deux copies (étape 16) est remplacé par deux tests : `api/domiciliations.js`
  n'exporte plus la constante, et les 3 formulaires importent la constante partagée. Commit `a0ca92d`.
- **Backend** : `StoreDomiciliationRequest::MODES_PAIEMENT` est **laissé tel quel**. Analyse : c'est la **seule** liste côté backend (ni Paiements ni Facturation ne contraignent
  `mode_paiement` à une liste) ; elle est utilisée uniquement par `StoreDomiciliationRequest`, `UpdateDomiciliationRequest` et `DomiciliationController::renouveler`, donc c'est une
  **règle de validation propre à Domiciliation**, pas une règle métier partagée. Il n'existe aucune source commune backend/frontend ; en créer une imposerait une dépendance
  backend → frontend (interdite) ou un nouveau mécanisme (endpoint, fichier de configuration) qui est une **décision d'architecture** : aucun test de comparaison n'a été
  écrit. Point laissé pour plus tard (voir §8).

## 4. Contrat `CompteursDomiciliations` (Archive)

Même modèle que `CompteursServicesEnCours` (étape 12) :

- `App\Contracts\Domiciliation\CompteursDomiciliations::compterParStatut(string $statut): int` (une seule méthode) ;
- `App\Services\Domiciliation\CompteursDomiciliationsEloquent` : `Domiciliation::where('status', $statut)->count()` (requête déplacée telle quelle) ;
- binding dans `AppServiceProvider::$bindings` ; `ArchiveController` n'importe plus `App\Models\Domiciliation` et appelle le contrat à la **même position** du JSON.

Caractérisation **écrite et exécutée avant** le contrat (3 tests) : comptage par statut avec lignes supprimées en douceur exclues, statut inconnu et défaut `archive`,
zéro sans donnée, autres compteurs indépendants, **1 seule requête SQL** `select count(*) … from domiciliations where status = ? and deleted_at is null` (et 16 comptages
au total, sans N+1). Après : résolution du conteneur, équivalence avec l'ancienne requête directe, utilisation du contrat par le contrôleur (faux contrat), garde-fou
statique. **Mutation vérifiée** (requête directe remise → 2 tests échouent). Commit `6a1afb6`. Les autres compteurs et la structure de réponse ne sont pas touchés.

## 5. Nouveaux tests Domiciliation (17, `DomiciliationCaracterisationTest`)

Tous décrivent le comportement **existant** (y compris ses particularités), sans proposer de correction. Mutations vérifiées (visibilité d'une observation, `activer`).

| Sujet | Ce qui est caractérisé |
|---|---|
| Centres | création / lecture / modification ; nom obligatoire et unique (et garder son propre nom permis) ; fiche avec ses domiciliations (plus récentes d'abord) ; liste : statut `actif` par défaut, statut inconnu → `actif`, recherche nom / ville / ICE / IF (insensible à la casse), `per_page` limité à 10-25-50-100, tri par nom ; cycle archive / corbeille / restore ; suppression définitive refusée hors corbeille puis **suppression douce** ; **matrice de permissions** : chacune des 6 permissions `*_centres` n'ouvre que ses routes |
| Observations privées | visible par son auteur et les administrateurs seulement ; la pièce jointe suit la même visibilité (403 sinon) ; une observation publique est visible et téléchargeable par tous |
| Filtre `statut` | `active`, `alerte`, `expire`, `declare`, `resilie`, statut inconnu → liste vide ; combinaison avec `status=archive` et `entreprise_id` |
| `activer` | repasse une domiciliation déclarée ou résiliée à `active` et vide `date_declaration` / `date_resiliation` ; journalise une opération `activation` ; ne touche pas à `status` (archive / corbeille) ; reste possible sur une domiciliation déjà active ; exige la permission `gestion` ; 404 si inconnue |

**Particularité existante documentée par test** : le message « Ce centre est utilisé par au moins une entreprise » est **inatteignable** : `delete()` est une suppression douce
(UPDATE), la FK `RESTRICT` ne se déclenche pas ; un centre utilisé, placé en corbeille, est supprimé en douceur et ses domiciliations le gardent. Non modifié.
Remarque : la migration des centres insère des centres de référence ; les tests de liste isolent leurs données par un jeton de recherche. Commit `badeb63`.

## 6. Frontières (avant → après)

| Dépendance | Avant | Après |
|---|---|---|
| Facturation → Domiciliation (`aujourdhui`) | oui (`DocumentForm`) | **non** (testé) |
| Paiements → Domiciliation (`aujourdhui`) | oui (`PaiementForm`) | **non** (testé) |
| Domiciliation → copie de `MODES_PAIEMENT` | `api/domiciliations.js` | source `shared` |
| Archive → modèle `Domiciliation` | direct | contrat `CompteursDomiciliations` |
| Domiciliation → Facturation | via `modules/facturation/index.js` (facture de domiciliation) | inchangé (autorisé) |
| `shared/` → module | aucun | aucun (testé) |
| Cycles d'imports (`frontend/src`) | aucun | aucun |

Nouveaux tests de frontières (`domiciliation-frontend.test.js`) : aucun fichier de `modules/facturation`, `modules/paiements` ni `pages/Paiement*` n'importe du code Domiciliation ;
liste exacte des consommateurs de `shared/utils/date.js`.

## 7. Dépendances restantes (backend, hors modèle propre)

`Entreprise::centreDomiciliation()` + `EntrepriseController` (résolution du centre par nom) + `EntrepriseResource` / `ClientResource` ; `DomiciliationResource` lit `Entreprise` et son client ;
`CentreDomiciliationController::show` charge les entreprises ; `NumerotationDocuments` lit `DomiciliationSetting` (réglage, reste en Paramètres). Frontend : `Dashboard`, `Topbar`, `Archive`,
Parties (`BlocsEntreprise`, `EntrepriseForm`, `ClientDetails`, `EntrepriseDetails`) et `Parametres` consomment l'API / les composants Domiciliation.

## 8. Laissé volontairement pour plus tard

- Centralisation backend/frontend des modes de paiement (décision d'architecture, §3).
- Copie locale d'`aujourdhui` dans `EntrepriseForm.jsx`.
- Contrats Parties ↔ Domiciliation (centre de l'entreprise, entreprise de la domiciliation) : à introduire **avec** le déplacement backend.
- Permissions du catalogue non appliquées (`facture`, `contrat`, `attestation`, `procuration`, `calendrier`, `export_list`) et menu sans permission : comportement conservé.
- Message « centre utilisé » inatteignable (§5) ; `window.alert` dans `documentsDomiciliation.js`.

## 9. Résultats

| Vérification | Départ | Après |
|---|---|---|
| Backend complet | 331 passés, 1 échec connu | **355 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) : +7 (Archive) +17 (Domiciliation) |
| Vitest | 67 | **71 passés** |
| Instantanés | 32 | **32, fichier `.snap` non modifié** |
| Lint | 0 erreur, 45 avertissements | 0 erreur, 45 avertissements |
| Build | OK | OK |
| Cycles d'imports / imports cassés | aucun | aucun (le script signale seulement un faux positif connu, `components/ui/index.js`, antérieur à l'étape) |

## 10. Commits

`f156bfe` test(frontend): freeze the clock at load time for date snapshots · `f7c2e00` refactor(shared): extract common current date helper · `a0ca92d` refactor(domiciliation):
centralize payment modes import · `6a1afb6` refactor(archive): decouple domiciliation counters · `badeb63` test(domiciliation): strengthen characterization coverage · commit de documentation.

## 11. Plan recommandé pour l'étape 18 (déplacement du backend)

1. Tag `pre-domiciliation-etape18`. Vérifier l'état de référence (355 + 1 échec connu).
2. Créer `app/Modules/Domiciliation/` : `Models/` (`Domiciliation`, `CentreDomiciliation`, `DomiciliationDocument`, `DomiciliationObservation`, `DomiciliationOperation`), `Http/Controllers`
   (`DomiciliationController`, `CentreDomiciliationController`), `Http/Requests` (4), `Http/Resources` (`DomiciliationResource`), `routes.php`, `DomiciliationServiceProvider`
   (enregistré dans `config/app.php`).
3. `git mv` + `class_alias` temporaires à tous les anciens emplacements (méthode de Facturation, étape 4) ; les relations Eloquent d'`Entreprise` et `EntrepriseController` continuent de
   fonctionner par alias.
4. `routes.php` : les 24 + 8 routes **dans leur ordre**, incluses par `routes/api.php` à la **même position** ; les 6 routes `settings/domiciliation` **restent** dans `routes/api.php`
   (Paramètres). `DomiciliationSetting*` ne bouge pas.
5. Déplacer le contrat et l'implémentation de `CompteursDomiciliations` dans le module (Archive garde l'import via `Modules\Domiciliation\Contracts`), lier dans le provider du module.
6. Ne **pas** déplacer migrations, seeders, tests existants, ni les tests de `tests/Feature` (étape 19 : tests + suppression des alias).
7. Garde-fous : snapshots routes / permissions / formes d'API inchangés, tests `Domiciliation*`, `ArchiveCountsTest`, `EntrepriseTest`, `SettingsTest` ; test de non-chargement d'un ancien nom
   (comme `ModuleFacturationTest`).
8. Contrats Parties (centre / entreprise) : à traiter à l'étape 19, après le déplacement, avec tests de caractérisation d'abord.
