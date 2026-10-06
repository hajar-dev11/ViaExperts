# Domiciliation — Étape 21 : audit final et verrouillage du module

Tag de départ : `pre-domiciliation-etape21` (= `62d4e49`). Tag d'arrivée : `post-domiciliation-etape21`.
Étape d'audit et de verrouillage : **aucun changement fonctionnel**. Aucune route, permission, réponse JSON, document / PDF, migration, table ni donnée modifiée ;
aucun fichier de test ni de snapshot modifié (les 3 snapshots backend et le `.snap` des 32 documents HTML sont inchangés). Seule modification de l'arbre : suppression de deux dossiers
vides non suivis (§15) et ajout de ce document.

## 1. État avant l'étape 16

- Domiciliation éparpillée dans `app/Models`, `app/Http/{Controllers,Requests,Resources}`, `routes/api.php` ; frontend dans `api/`, `pages/`, `components/`, `utils/`.
- Couplages directs : `Entreprise` ↔ `CentreDomiciliation` (relation Eloquent), `ArchiveController` → modèle `Domiciliation`, `EntrepriseController` → `CentreDomiciliation::where(...)`.
- Doublons : `aujourdhui` (date) et `MODES_PAIEMENT` dans le code Domiciliation ; ré-export historique `utils/factureDomiciliation.js`.
- Tests au même niveau que le reste (`tests/Feature`), snapshots HTML / routes / permissions / formes d'API déjà posés en Phase 0 et Facturation.

## 2. Transformations des étapes 16 → 20

| Étape | Contenu | Tag d'arrivée |
|---|---|---|
| 16 | Audit complet (backend, frontend, DB, documents, permissions, tests) ; aucun changement de code | `post-domiciliation-etape16` |
| 17 | Extraction de `aujourdhui` vers `shared/utils/date.js` ; suppression du doublon `MODES_PAIEMENT` (→ `shared/constants/documents.js`) ; contrat `CompteursDomiciliations` pour Archive ; tests de caractérisation (centres, observation privée, filtre de statut, activation) ; gel de l'horloge des tests de snapshots | `post-domiciliation-etape17` |
| 18 | Déplacement backend vers `app/Modules/Domiciliation/` (modèles, contrôleurs, requests, resource), provider, `routes.php` (24 + 8 routes, ordre global préservé), alias temporaires | `post-domiciliation-etape18` |
| 19 | Découplage Parties ↔ Domiciliation par le contrat `CentresDomiciliationReference` ; relation `Entreprise::centreDomiciliation()` supprimée ; 5 alias supprimés ; tests du module déplacés dans le module ; tests d'architecture | `post-domiciliation-etape19` |
| 20 | Modularisation du frontend : `frontend/src/modules/domiciliation/` avec index public explicite ; 9 consommateurs migrés ; anciens fichiers supprimés ; tests d'architecture frontend | `post-domiciliation-etape20` |

## 3. Architecture finale — backend (`backend/app/Modules/Domiciliation/`)

```
DomiciliationServiceProvider.php   bindings des 2 contrats + routes($segment)
routes.php                         retourne ['domiciliations' => fn, 'centres' => fn]
Contracts/    CentresDomiciliationReference, CompteursDomiciliations
Http/Controllers/  DomiciliationController, CentreDomiciliationController
Http/Requests/     Store/UpdateDomiciliationRequest, Store/UpdateCentreDomiciliationRequest
Http/Resources/    DomiciliationResource
Models/       Domiciliation, CentreDomiciliation, DomiciliationDocument, DomiciliationObservation, DomiciliationOperation
Services/     CentresDomiciliationReferenceEloquent, CompteursDomiciliationsEloquent
Tests/Feature/     DomiciliationTest, DomiciliationActionsTest, DomiciliationCaracterisationTest, ModuleDomiciliationTest
```

Le provider est déclaré dans `config/app.php`. `routes/api.php` appelle `DomiciliationServiceProvider::routes('domiciliations'|'centres')` aux deux positions d'origine
(les deux blocs sont séparés par d'autres modules : l'ordre global est verrouillé par le snapshot de routes). Restent dans `routes/api.php` et dans Paramètres : les 6 routes
`settings/domiciliation` (`permission:parametre,centre_domiciliation`) et le modèle `DomiciliationSetting`.

## 4. Architecture finale — frontend (`frontend/src/modules/domiciliation/`)

```
index.js          entrée PUBLIQUE (23 exports explicites, pas de `export *`)
api/              domiciliations.js, centres.js
pages/            10 pages (liste, formulaire, détails, statuts, calendrier, centres, détails d'un centre, attestation, contrat, procuration)
components/       DomiciliationActions.jsx, StatutDomiciliation.jsx
documents/        attestation.js, contrat.js, procuration.js, documentsDomiciliation.js, DocumentDomiciliationEditable.jsx
print/            factureDomiciliation.js
utils/            domiciliation.js
```

Le cycle potentiel `documentsDomiciliation.js → index.js → … → documentsDomiciliation.js` est évité : `documentsDomiciliation.js` importe `../print/factureDomiciliation.js`, jamais l'index
(vérifié : aucun cycle dans le graphe d'imports de `src/`).

## 5. Dépendances entrantes (vers Domiciliation)

- **Backend** : Archive → `CompteursDomiciliations` (contrat) ; Parties (`Entreprise`, `EntrepriseController`, `ClientController`, resources) → `CentresDomiciliationReference` (contrat) uniquement ;
  aucun fichier hors module n'importe `App\Modules\Domiciliation\Models`.
- **Frontend** : 9 consommateurs exactement, tous par `modules/domiciliation/index.js` : `App.jsx`, `BlocsEntreprise.jsx`, `Topbar.jsx`, `Dashboard.jsx`, `Archive.jsx`, `ClientDetails.jsx`,
  `EntrepriseDetails.jsx`, `EntrepriseForm.jsx`, `Parametres.jsx`. Aucun autre module (Facturation, Paiements, Mouvement) n'importe Domiciliation.

## 6. Dépendances sortantes (depuis Domiciliation)

- **Backend** : `Domiciliation::entreprise()` et `DomiciliationResource` (entreprise, client) → Parties (`Entreprise`, `User` : seuls modèles `App\Models` importés, testé) ;
  `CentreDomiciliationController::show` → Parties ; `DomiciliationSetting` (Paramètres) lu par la numérotation.
- **Frontend** : Facturation par `modules/facturation/index.js` (facture de domiciliation) ; Parties (`api/entreprises`, `api/clients`), Services (`api/services`), Paramètres (`api/settings`,
  `utils/print/identite`), `shared/*`, `utils/format`, composants UI génériques. Sens autorisés, à sens unique.

## 7. Contrats

| Contrat | Consommateur | Méthodes | Implémentation |
|---|---|---|---|
| `CompteursDomiciliations` | `ArchiveController` | `compterParStatut` | `CompteursDomiciliationsEloquent` |
| `CentresDomiciliationReference` | Parties | `idParNom(string): ?int`, `nomsParIds(array): array` | `CentresDomiciliationReferenceEloquent` (centres supprimés en douceur invisibles, statut non filtré) |

Les deux sont liés uniquement par `DomiciliationServiceProvider` (`public array $bindings`) ; `AppServiceProvider` ne contient aucune liaison Domiciliation (testé).

## 8. Routes

24 routes `domiciliations`, 8 routes `centres-domiciliation`, 6 routes `settings/domiciliation` : méthode, URI, middleware, permission, contrôleur et **ordre global** identiques à l'état d'avant l'étape 16 ;
le snapshot de routes (`RoutesSnapshotTest`) passe, fichier non modifié. `ModuleDomiciliationTest` vérifie que les 24 + 8 routes pointent vers les contrôleurs du module sous `auth:sanctum`
et que les 6 routes de réglages restent chez Paramètres.

## 9. Permissions

Comparaison catalogue ↔ routes ↔ contrôleurs ↔ frontend : aucune permission ajoutée, retirée ni corrigée ; `PermissionsSnapshotTest` passe, fichier inchangé.
Les routes de réglages Domiciliation utilisent `permission:parametre,centre_domiciliation` (inchangé).

## 10. API / JSON

`ApiShapeSnapshotTest` passe, fichier inchangé : les formes JSON de `DomiciliationResource`, `EntrepriseResource`, `ClientResource` (dont `centreDomiciliation` et `centreDomiciliationId`) sont identiques.
`PartiesCentreDomiciliationTest` (10) caractérise les cas limites (nom inconnu, centre archivé, supprimé en douceur, absence de N+1).

## 11. Documents / PDF

`attestation`, `contrat`, `procuration` et facture de domiciliation : les **32 snapshots HTML sont inchangés** (35 tests de snapshots passent ; le `.snap` n'a pas été modifié depuis la Phase 0).
Comparaison complémentaire par rapport à l'état d'avant la modularisation (`2a5b59b`, lignes d'import ignorées) : `attestation.js`, `contrat.js`, `procuration.js`, `documentsDomiciliation.js`,
`DocumentDomiciliationEditable.jsx`, `DomiciliationActions.jsx`, `api/centres.js` **identiques**. Seules différences, toutes documentées : `utils/domiciliation.js` sans `aujourdhui`
(extrait vers `shared/utils/date.js`, étape 17) et `api/domiciliations.js` sans `MODES_PAIEMENT` (doublon retiré, `shared/constants/documents.js`, étape 17).

## 12. Base de données

Aucune migration, table, colonne ni FK modifiée depuis l'étape 16. Tables du module : `domiciliations`, `centres_domiciliation`, `domiciliation_documents`, `domiciliation_observations`,
`domiciliation_operations` ; FK `entreprises.centre_domiciliation_id → centres_domiciliation.id` (RESTRICT) conservée : couplage en base accepté, couplage de code passé par contrat.

## 13. Tests

- Module : `app/Modules/Domiciliation/Tests/Feature/` (4 fichiers, 52 tests au total).
- Transverses restés dans `tests/Feature/` : `ArchiveCountsTest` (16), `CorrectionsAuditTest`, `SettingsTest`, `EntrepriseTest`, `PartiesCentreDomiciliationTest` (10), `Snapshots/*` (3).
- Frontend : `domiciliation-frontend.test.js` (23), `facturation-frontend.test.js` (17), `compatibilite-imports.test.js`, `documents.snapshot.test.js`.
- Garde-fous d'architecture existants jugés suffisants (aucun ajout, pour ne pas rigidifier) : backend — anciens namespaces absents, aucun alias, Parties sans modèle Domiciliation, contrats liés par le provider du module,
  routes / contrôleurs dans le module ; frontend — anciens chemins absents, index seul point d'entrée externe (liste des 9 consommateurs verrouillée), aucun cycle, tout import relatif résout, documents / print / API dans le module.

| Vérification | Résultat |
|---|---|
| Backend complet | **378 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Vitest | **81 passés** (4 fichiers) |
| Instantanés HTML | 32, `.snap` inchangé |
| Snapshots backend (routes, permissions, API) | 3 passés, fichiers inchangés |
| Lint | 0 erreur, 45 avertissements |
| Build | OK (avertissement habituel de taille de chunk) |
| Cycles / imports cassés | aucun (faux positif connu du script : commentaire JSDoc de `components/ui/index.js`) |

## 14. Recherche globale des anciens noms

Classement des occurrences de `App\Models\Domiciliation`, `CentreDomiciliation`, `DomiciliationDocument`, `DomiciliationObservation`, `DomiciliationOperation` (hors namespace `App\Modules\Domiciliation\…`) :

- **Production** : aucune référence à un ancien namespace ; aucun alias. Les noms de classes apparaissent uniquement dans leur namespace de module.
- **Tests autorisés** : chaînes d'assertions négatives (`ModuleDomiciliationTest`, `ArchiveCountsTest` : `'App\Models\Domiciliation;'`) et tests frontend vérifiant l'absence des anciens fichiers.
- **Documentation historique** : `docs/migration-modular-monolith/*` (étapes 16 à 20, Phase 0) décrivent les anciens emplacements.

Anciens chemins frontend (`api/domiciliations`, `pages/Domiciliation*`, `utils/attestation`, `utils/factureDomiciliation`, etc.) : même classement ; aucun import de production ne les cible (test « tout import relatif résout »).
Aucune occurrence ambiguë n'a été supprimée.

## 15. Fichiers parasites

Audit : dossiers vides, anciens ré-exports, doublons, scripts temporaires, `.bak`, fichiers de debug, fichiers générés.

- **Trouvés et supprimés (preuve : 0 fichier, 0 fichier suivi)** : `backend/app/Contracts/Domiciliation/` et `backend/app/Services/Domiciliation/` (dossiers vides non suivis par Git, vestiges de l'étape 17) — aucun effet sur git.
- Ré-export historique `pages/DomiciliationList.jsx` → `StatutDomiciliation` : voir dette technique §16 (non modifié).
- Rien d'autre trouvé.

## 16. Dette technique restante

- `Entreprise` reste un point de couplage fort : `Domiciliation::entreprise()` et `DomiciliationResource` (entreprise + client) dépendent directement de modèles de Parties (autorisé, limité à `Entreprise` / `User`, mais pas derrière un contrat).
- `Entreprise::nomCentreDomiciliation()` / `chargerCentresDomiciliation()` : cache par instance (comme `Paiement::numeroFacture`) ; la résolution par nom reste silencieuse (centre inconnu → `null`), comportement historique conservé.
- `DomiciliationSetting` et ses 6 routes restent dans Paramètres (décision d'étape 18) ; Facturation lit ce réglage pour la numérotation.
- Frontend : la facture de domiciliation (`print/`) dépend de l'index Facturation ; les pages importent directement `api/entreprises`, `api/clients`, `api/services`, `api/settings` (autres domaines, pas de contrats frontend).
- `pages/DomiciliationList.jsx` : ré-export historique de `StatutDomiciliation`, non utilisé hors module, conservé (hors périmètre).
- Dossier `utils/` du module à un seul fichier (choix assumé, étape 20).
- Test connu `ServiceChatTest::test_empty_message_is_rejected` en échec (hors Domiciliation, volontairement non corrigé).
- Limite de vérification : pages non rendues après connexion dans le navigateur (compte administrateur réel) ; couverture par snapshots, tests de routes / frontières, build et chargement des modules.

## 17. Risques

- Le snapshot de routes verrouille l'ordre global : toute insertion de module ou de route entre les deux blocs Domiciliation doit être comparée avant acceptation.
- Si un centre est supprimé en douceur, les entreprises gardent leur `centre_domiciliation_id` mais affichent `null` (comportement existant, testé).
- Les tests de frontières lisent les sources : un nouvel import interne depuis l'extérieur ou depuis `shared/` fera échouer la suite (volontaire).

## 18. Recommandations pour le prochain module

- Appliquer la même séquence : tag `pre-`, audit, caractérisation **avant** refactor, déplacement par `git mv`, contrats pour les couplages sortants, suppression des alias, tests d'architecture, doc, tag `post-`.
- Choisir un module à périmètre étroit et peu consommé (ex. Services ou Paiements côté frontend déjà modularisé) avant le cœur Parties ; Parties (`Entreprise`, `Client`) sera le plus invasif car tous les modules en dépendent — prévoir des contrats sortants dès l'audit.
- Traiter Paramètres (`DomiciliationSetting`, `api/settings`) comme dépendance partagée à contractualiser avant de modulariser un module qui la lit.
- Garder les snapshots (routes, permissions, API, HTML) comme critère d'acceptation ; ne jamais les régénérer pour « faire passer » une étape.
- Ne pas entreprendre les refactors listés en §16 sans étape dédiée et validation.
