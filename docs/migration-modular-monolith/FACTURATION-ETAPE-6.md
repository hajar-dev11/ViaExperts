# Facturation — Étape 6 : suppression des alias de compatibilité

Tag de départ : `pre-facturation-etape6` (= commit `4ac58d5`). Tag d'arrivée : `post-facturation-etape6`.
Étape strictement mécanique : aucun changement métier, API, route, permission, base, PDF ou frontend.

## 1. Les 7 alias supprimés

Les fichiers créés à l'étape 4 (un `class_alias` par ancien nom) sont supprimés :

| Ancien nom (supprimé) | Classe réelle |
|---|---|
| `App\Models\DocumentLigne` | `App\Modules\Facturation\Models\DocumentLigne` |
| `App\Http\Controllers\Api\V1\DocumentCommercialController` | `App\Modules\Facturation\Http\Controllers\DocumentCommercialController` |
| `App\Http\Requests\StoreDocumentCommercialRequest` | `…\Http\Requests\StoreDocumentCommercialRequest` |
| `App\Http\Requests\UpdateDocumentCommercialRequest` | `…\Http\Requests\UpdateDocumentCommercialRequest` |
| `App\Http\Resources\DocumentCommercialResource` | `…\Http\Resources\DocumentCommercialResource` |
| `App\Services\NumerotationDocuments` | `…\Services\NumerotationDocuments` |
| `App\Models\DocumentCommercial` (dernier, supprimé après migration de `Paiement.php`) | `App\Modules\Facturation\Models\DocumentCommercial` |

Ordre suivi : (1) 6 alias de catégorie B + leurs cas de test, suite complète verte ; (2) migration de `Paiement.php` ;
(3) recherche complète ; (4) suppression de l'alias `DocumentCommercial`.

## 2. Migration de `Paiement.php`

Une seule ligne ajoutée : `use App\Modules\Facturation\Models\DocumentCommercial;`. La relation
`document()` (`belongsTo(DocumentCommercial::class, 'document_id')`) est inchangée : même nom, même clé étrangère, même
comportement ; seule la résolution du nom de classe passe de l'alias (implicite, même namespace) au namespace du module.
`PaiementController`, `PaiementResource` et la base ne sont pas touchés.

## 3. Références restantes aux anciens namespaces

Recherche complète (`app/`, `config/`, `database/`, `routes/`, `tests/`, noms qualifiés et noms courts) :
**aucune référence applicative** aux 7 anciens noms, et aucun fichier d'alias. Les seules occurrences sont les 7 chaînes
du test `ModuleFacturationTest`, qui vérifie désormais l'inverse (l'ancien nom **n'existe plus**). Tous les usages des
noms courts (`DocumentCommercial`, `DocumentLigne`, `NumerotationDocuments`) hors module ont un `use` explicite vers
`App\Modules\Facturation\…`. L'autoloader Composer ne contient aucune entrée obsolète (classmap non optimisée). Les
mentions dans `docs/` et dans l'historique Git sont historiques.

## 4. Fichiers

Supprimés : `app/Models/{DocumentCommercial,DocumentLigne}.php`,
`app/Http/Controllers/Api/V1/DocumentCommercialController.php`,
`app/Http/Requests/{Store,Update}DocumentCommercialRequest.php`, `app/Http/Resources/DocumentCommercialResource.php`,
`app/Services/NumerotationDocuments.php`.

Modifiés : `app/Models/Paiement.php` (+1 `use`), `tests/Feature/ModuleFacturationTest.php` (le test « ancien nom = alias »
devient « ancien nom inexistant, classe du module existante » ; mêmes 7 cas ; commentaire de la relation mis à jour).

Créé : ce document. `phpunit.xml`, snapshots, migrations, routes, frontend : non modifiés.

## 5. Tests

| Vérification | Résultat |
|---|---|
| Après suppression des 6 alias B (avant `Paiement.php`) | 277 passés, 1 échec connu (−6 cas d'alias) |
| Backend complet (final) | **283 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Facturation (+ contrats, module) | 34 passés |
| Paiement / Mouvement / Archive / Services en cours | 14 / 7 / 15 / 19 passés |
| Numérotation + concurrence multi-processus (dont collision 422) | 14 passés |
| Snapshots routes / permissions / API | 3 passés, fichiers inchangés |
| Vitest | 40 passés, 32 snapshots de documents inchangés |
| Lint / Build | 0 erreur / OK |

Couverture fonctionnelle : `Paiement::document()` (`ModuleFacturationTest`, `PaiementTest` rattache un paiement à une
facture et resynchronise `prix_paye`), création / modification / consultation / archive / corbeille / restauration
(`FacturationTest`, `ApiShapeSnapshotTest`), numérotation et collision 422 (`NumerotationDocumentsTest`,
`NumerotationConcurrenceTest`), Archive (`counts`), Mouvement (`facture`), Services en cours (automatiques).

## 6. Risques restants

- Tout code **hors dépôt** (scripts, tinker, outils externes) qui référencerait encore les anciens noms échouerait
  maintenant ; aucun n'existe dans le dépôt.
- Couplages inchangés (hors périmètre de cette étape) : `Paiement::document()` et `PaiementResource` (`factureNumero`)
  lisent le modèle `DocumentCommercial` du module ; règle `exists:documents_commerciaux,id`, clé étrangère
  `paiements.document_id` et seeders de démonstration (accès par table) ; `NumerotationDocuments` lit
  `CabinetSetting` / `DomiciliationSetting` ; `PaiementController` appelle `ServiceEnCours` en direct.
- `routes/api.php` inclut encore le fichier de routes du module (pour conserver l'ordre global).
- Tests Facturation toujours dans `tests/Feature/` ; migrations toujours dans `database/migrations/`.

## 7. À traiter à l'étape suivante

Au choix (décision à prendre ensemble) : (a) déplacer les tests purement Facturation dans le module (suite dans
`phpunit.xml`, chemins du script de concurrence) ; (b) remplacer la lecture directe de `document` par Paiements par un
contrat (numéro de facture), puis revoir la règle `exists` ; (c) frontend Facturation (4 pages importent encore les
constantes via `api/facturation.js`, `shared/constants/documents.js` existe déjà).
