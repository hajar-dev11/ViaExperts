# Domiciliation — Étape 18 : déplacement du backend dans `app/Modules/Domiciliation/`

Tag de départ : `pre-domiciliation-etape18` (= `11807c5`). Tag d'arrivée : `post-domiciliation-etape18`.
Déplacement physique du backend, **sans changement de comportement** : URLs, méthodes, permissions, middlewares, noms, réponses JSON, base
de données, migrations, seeders, frontend, PDF : inchangés. Les 3 snapshots backend (routes, permissions, formes d'API) et les 32 snapshots HTML
n'ont pas été modifiés. Aucun alias n'est supprimé (étape 19).

## 1. Structure avant

Dossiers Laravel classiques : `app/Models/` (5 modèles + `DomiciliationSetting`), `app/Http/Controllers/Api/V1/` (2 contrôleurs + celui des réglages), `app/Http/Requests/` (4 requests + celui des réglages),
`app/Http/Resources/DomiciliationResource.php`, `app/Contracts/Domiciliation/` et `app/Services/Domiciliation/` (étape 17), 24 + 8 routes dans `routes/api.php`, binding du contrat dans `AppServiceProvider`.

## 2. Structure après

```
app/Modules/Domiciliation/
├── Models/        Domiciliation, CentreDomiciliation, DomiciliationDocument, DomiciliationObservation, DomiciliationOperation
├── Http/
│   ├── Controllers/  DomiciliationController, CentreDomiciliationController
│   ├── Requests/     StoreDomiciliationRequest, UpdateDomiciliationRequest, StoreCentreDomiciliationRequest, UpdateCentreDomiciliationRequest
│   └── Resources/    DomiciliationResource
├── Contracts/     CompteursDomiciliations
├── Services/      CompteursDomiciliationsEloquent
├── DomiciliationServiceProvider.php
└── routes.php
```

Pas de dossier `Tests/` : les tests Domiciliation restent dans `tests/Feature/` (décision de l'étape 19). **Restent hors module** : `DomiciliationSetting`, `DomiciliationSettingController`,
`UpdateDomiciliationSettingRequest` (Paramètres), les 6 routes `settings/domiciliation`, les migrations, les seeders.

## 3. Fichiers déplacés (`git mv`)

5 modèles, 2 contrôleurs, 4 requests, 1 resource, le contrat et son implémentation (14 fichiers). **Vérification mécanique** : pour chacun, comparaison avec la version de
`11807c5` en ignorant les lignes `namespace` / `use` et les lignes vides → **identique** (aucune ligne de logique, relation, trait `SoftDeletes`, `fillable`, `casts`, `appends`, scope, accesseur,
constante ou règle de validation modifiée). Seuls les `namespace` et `use` changent ; les modèles reçoivent un `use App\Models\Entreprise` / `User` (classes restées dans `App\Models`).

## 4. Contrat de compteurs

`CompteursDomiciliations` et `CompteursDomiciliationsEloquent` (étape 17) passent dans le module (`Contracts/`, `Services/`) : le contrat devient un contrat **du module**. `ArchiveController` importe désormais
`App\Modules\Domiciliation\Contracts\CompteursDomiciliations` (aucun alias, comme pour les contrats de Facturation) et n'a toujours aucune dépendance vers le modèle. Le binding quitte `AppServiceProvider`
pour `DomiciliationServiceProvider::$bindings` (une seule liaison, testée).

## 5. Service provider et routes

`DomiciliationServiceProvider` (enregistré dans `config/app.php` après celui de Facturation) : liaison du contrat + méthode statique `routes(string $segment)`.

**Routes** : `routes.php` contient les **24 routes `domiciliations` et les 8 routes `centres-domiciliation`, extraites telles quelles de `routes/api.php`** par script (URI, méthode, middleware, contrôleur, ordre),
sous forme de **deux fonctions** retournées par le fichier. `routes/api.php` les appelle (`DomiciliationServiceProvider::routes('domiciliations')` et `…('centres')`) **aux deux positions exactes** des anciens blocs,
dans le groupe `v1` + `auth:sanctum`. Écart assumé avec « un seul `routes.php` chargé par le provider » : les deux blocs sont séparés dans `routes/api.php` par d'autres modules (Services, Facturation,
Déclarations TVA) et le snapshot de routes compare l'**ordre global** ; un chargement unique ou par le provider aurait déplacé les routes de centres et changé ce snapshot (vérifié : il passe inchangé).
Les 6 routes `settings/domiciliation` **restent** dans `routes/api.php`. Les imports des deux contrôleurs sont retirés de `routes/api.php`, celui du provider est ajouté.

## 6. Alias de compatibilité (temporaires)

| Ancien nom | Alias | Consommateurs réels |
|---|---|---|
| `App\Models\Domiciliation` | oui | tests (`DomiciliationTest`, `…ActionsTest`, `…CaracterisationTest`, `ArchiveCountsTest`) |
| `App\Models\CentreDomiciliation` | oui | **`Entreprise::centreDomiciliation()`** (référence non qualifiée, même namespace), `EntrepriseController`, 6 tests |
| `App\Models\DomiciliationDocument` / `…Observation` | oui | `DomiciliationTest` |
| `App\Models\DomiciliationOperation` | oui | aucun hors module (alias par cohérence avec les 5 modèles) |

Mécanisme identique à celui de Facturation : fichier à l'ancien emplacement, **sans logique**, avec `class_alias(...)` gardé par `class_exists`. **Pas d'alias** pour les contrôleurs, requests, resource, contrat et
service : aucun consommateur externe (les routes sont dans le module, Archive importe le nouveau contrat) — la consigne conditionnait l'alias à l'existence d'un consommateur. Un test vérifie que ces anciens noms n'existent plus.

## 7. Relations Eloquent, suppression douce, Parties, Facturation

Relations vérifiées par test, sur des données réelles : `Domiciliation → entreprise / centre / observations / documents / operations / renouvelleDe`, `CentreDomiciliation → domiciliations`, `Observation → domiciliation`,
et **`Entreprise::centreDomiciliation()`** (Entreprise reste hors module) qui résout par l'alias vers le centre du module. `SoftDeletes` : conservé sur 4 modèles, absent de `DomiciliationOperation` comme avant ;
tables inchangées. **Aucun contrat Parties** créé (étape 19). Couplage **Domiciliation → Facturation** (facture de domiciliation, frontend) intact.

## 8. Anciens namespaces encore présents (recherche globale)

| Classe | Occurrences | Catégorie |
|---|---|---|
| Alias eux-mêmes (5 fichiers `app/Models/*.php`) | 5 × 2 lignes | **A. alias autorisé** |
| `App\Http\Controllers\Api\V1\EntrepriseController` : `use App\Models\CentreDomiciliation` | 1 | **B. production à migrer à l'étape 19** |
| `App\Models\Entreprise::centreDomiciliation()` : `CentreDomiciliation::class` sans `use` (résolu par alias) | 1 | **B. production à migrer à l'étape 19** (couplage Parties ↔ Domiciliation) |
| Tests : `ArchiveCountsTest`, `CorrectionsAuditTest`, `DomiciliationActionsTest`, `DomiciliationCaracterisationTest`, `DomiciliationTest` (5 imports + 2 qualifiés), `SettingsTest`, `ApiShapeSnapshotTest` | 13 | **C. tests** |
| `ModuleDomiciliationTest` (chaînes qui vérifient l'absence des anciens noms) | 9 | C. test d'architecture |
| Documentation | 1 fichier historique | D. documentation |

Aucune autre référence de production aux anciens contrôleurs, requests, resource, contrat ou service.

## 9. Tests

Nouveau `ModuleDomiciliationTest` (13) : alias des 5 modèles ; `DomiciliationSetting` n'a pas bougé ; anciens noms des contrôleurs / requests / resource / contrat / service inexistants ; traits et tables ; relations (classes et
données réelles, dont suppression douce) ; 24 + 8 routes vers les contrôleurs du module avec `auth:sanctum`, 6 routes de réglages restées aux Paramètres, blocs non accolés (ordre global) ; contrat lié par le provider du module
et pas par `AppServiceProvider` ; Archive utilise le contrat du module. `ArchiveCountsTest` : chemins du contrat / service mis à jour.

| Vérification | Départ | Après |
|---|---|---|
| Backend complet | 355 passés, 1 échec connu | **368 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) (+13) |
| Domiciliation (Domiciliation*, Actions, Caractérisation, Module) | — | 52 passés |
| Archive / Entreprise / Settings / CorrectionsAudit | — | 16 / 8 / 26 / 17 passés |
| Facturation (module) / Paiement | — | 53 / 32 passés |
| Snapshots routes / permissions / formes d'API | 3 | 3 passés, **fichiers inchangés** |
| Vitest | 71 | 71 passés ; 32 instantanés, `.snap` inchangé |
| Lint / Build | 0 erreur, 45 avertissements / OK | idem |

## 10. Risques

- Les alias dépendent de l'autoload : toute classe qui référence encore `App\Models\Domiciliation*` sans `use` explicite dépend de l'alias (cas d'`Entreprise`).
- `routes.php` retourne deux fonctions : toute modification de l'ordre dans `routes/api.php` (ajout d'une route entre les deux appels) reste couverte par le snapshot, mais le module n'est plus « autonome » pour ses routes.
- `Entreprise` ↔ Domiciliation (centre) et `DomiciliationResource` ↔ Parties restent des couplages directs de modèles.
- `DomiciliationSetting` (Paramètres) reste lu par `NumerotationDocuments` de Facturation.
- Tests Domiciliation toujours dans `tests/Feature/` ; migrations et seeders inchangés.

## 11. Réservé à l'étape 19

Remplacer les imports restants (`EntrepriseController`, `Entreprise`, tests) ; contrats Parties ↔ Domiciliation (centre de l'entreprise, entreprise de la domiciliation) après caractérisation ;
supprimer les 5 alias et le test d'alias ; déplacer les tests Domiciliation dans le module (suite `phpunit.xml` déjà prête : `app/Modules/*/Tests/Feature`) ; verrouiller les frontières par test.
