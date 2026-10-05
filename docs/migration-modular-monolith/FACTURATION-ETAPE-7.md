# Facturation — Étape 7 : tests du module dans `app/Modules/Facturation/Tests/`

Tag de départ : `pre-facturation-etape7` (= `83593a1`). Tag d'arrivée : `post-facturation-etape7`.
Réorganisation des tests uniquement : aucune logique, assertion, scénario, route, permission, API, base, PDF ou frontend
modifié.

## 1. Tests identifiés (audit de `tests/Feature/` et `tests/Support/`)

| Fichier | Verdict | Raison |
|---|---|---|
| `FacturationTest` | **Déplacé** | CRUD, totaux, permissions, archive/corbeille/restauration des 4 types de documents |
| `ModuleFacturationTest` | **Déplacé** | structure du module : absence des anciens noms, relations, routes, liaisons du provider |
| `NumerotationDocumentsTest` | **Déplacé** | service `NumerotationDocuments` (numéro proposé, compteur, rollback, collision → 422) |
| `NumerotationConcurrenceTest` | **Déplacé** | concurrence multi-processus sur la numérotation |
| `ContratsFacturationTest` | **Déplacé** | contrats et adaptateurs publics de Facturation (deux cas passent par des routes Paiements / Archive, mais c'est le contrat de Facturation qui est vérifié) |
| `tests/Support/creer_document_en_parallele.php` | **Déplacé** | script enfant utilisé uniquement par le test de concurrence |
| `PaiementTest` | Reste | appartient à Paiements (crée des factures par l'API) |
| `MouvementTest` | Reste | appartient à Mouvement |
| `ServicesEnCoursAutomatiquesTest` | Reste | appartient à Services en cours |
| `CorrectionsAuditTest` | Reste | transversal / mixte (4 cas sur 17 concernent les compteurs) |
| `Snapshots/*`, `tests/Snapshots/*.json`, `tests/Support/Snapshot.php` | Restent | filet de sécurité transverse (routes, permissions, formes d'API de tous les modules) |

## 2. Fichiers déplacés (`git mv`, historique conservé)

```
tests/Feature/{FacturationTest,ModuleFacturationTest,NumerotationDocumentsTest,NumerotationConcurrenceTest,ContratsFacturationTest}.php
  → app/Modules/Facturation/Tests/Feature/
tests/Support/creer_document_en_parallele.php
  → app/Modules/Facturation/Tests/Support/
```

## 3. Changements d'espace de noms / chemins (seuls changements dans ces fichiers)

- Les 5 tests : `namespace Tests\Feature;` → `namespace App\Modules\Facturation\Tests\Feature;`. Ils continuent d'étendre
  `Tests\TestCase` (déjà importé) ; les classes se chargent par le PSR-4 `App\` existant — **`composer.json` inchangé**.
- `NumerotationConcurrenceTest` : chemin du script enfant `base_path('tests/Support/creer_document_en_parallele.php')` →
  `base_path('app/Modules/Facturation/Tests/Support/creer_document_en_parallele.php')`.
- `creer_document_en_parallele.php` : `__DIR__.'/../../vendor/autoload.php'` et `…/bootstrap/app.php` →
  `__DIR__.'/../../../../../…'`. Calcul : `Support → Tests → Facturation → Modules → app → backend` = 5 niveaux
  (vérifié : les deux fichiers existent à ce chemin).

## 4. `phpunit.xml` (modification autorisée explicitement)

`phpunit.xml` ne scannait que `./tests/Unit` et `./tests/Feature`. Vérifié avant modification : une fois les tests
déplacés, la suite complète passait de 283 à 235 tests (les 48 tests du module disparaissaient sans erreur). Une seule
ligne a été ajoutée à la suite existante `Feature` :

```xml
<directory suffix="Test.php">./app/Modules/*/Tests/Feature</directory>
```

Effets : les 48 tests sont de nouveau détectés (`--testsuite Feature --list-tests`), les commandes existantes
(`php artisan test`, `--filter`) fonctionnent sans changement, et les futurs modules seront pris en compte
automatiquement. Non modifié : `<coverage><include>./app</include>` (qui couvre aussi les fichiers de tests du module, sans
effet hors couverture).

## 5. Tests exécutés

| Vérification | Résultat |
|---|---|
| Départ | 283 passés, 1 échec connu |
| Suite Facturation du module (`App\Modules\Facturation\Tests`) | **48 passés** |
| Paiement / Mouvement / Archive / Services en cours | 14 / 7 / 15 / 19 passés |
| Numérotation (service) | 12 passés |
| Concurrence (vrais processus PHP) | 2 passés |
| Snapshots routes / permissions / API | 3 passés, fichiers inchangés |
| **Backend complet** | **283 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Vitest | 40 passés, 32 snapshots de documents inchangés |
| Lint / Build | 0 erreur / OK |

Aucune différence avec l'état précédent : mêmes 283 tests, mêmes résultats, les 48 tests du module sont seulement lus
depuis un autre dossier.

## 6. Risques restants

- La détection des tests du module dépend de la ligne ajoutée dans `phpunit.xml` : si elle disparaît, les 48 tests ne
  s'exécutent plus sans signaler d'erreur. Garde-fou simple : le nombre total attendu (283 + 1 échec connu).
- Le script enfant de concurrence dépend d'une profondeur de 5 niveaux ; un futur déplacement du module le casserait
  (le test de concurrence échouerait bruyamment).
- `ContratsFacturationTest` utilise des routes d'autres modules (Paiements, Archive) : il dépend de leur API publique.
- Les anciennes mentions de `tests/Support/creer_document_en_parallele.php` dans `docs/` sont historiques.
- Toujours hors module : migrations, factories, `tests/Support/Snapshot.php` et snapshots transverses.
- Couplages inchangés (cf. étapes 5 et 6) : `Paiement::document()` / `PaiementResource`, règle `exists`, clé étrangère,
  seeders, `routes/api.php` qui inclut `routes.php`.

## 7. À traiter à l'étape suivante

Au choix : remplacer la lecture directe du modèle de Facturation par Paiements par un contrat (numéro de facture) ;
frontend Facturation (constantes importées via `api/facturation.js`, `shared/constants/documents.js` déjà prêt) ; ou
migrations / seeders du module.
