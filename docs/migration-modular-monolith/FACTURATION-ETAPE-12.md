# Facturation — Étape 12 : Archive découplé de Services en cours

Tag de départ : `pre-facturation-etape12` (= `8b6784a`). Tag d'arrivée : `post-facturation-etape12`.
Objectif unique : `ArchiveController` ne connaît plus le modèle `App\Models\ServiceEnCours` ; il passe par un contrat du
domaine Services en cours. Aucune migration, route, permission, réponse JSON, PDF ni frontend modifié ; Services en cours
n'est pas déplacé.

## 1. Audit avant modification

| Question | Réponse |
|---|---|
| Dépendance | `use App\Models\ServiceEnCours;` + une seule utilisation, `ArchiveController::counts` : `'services_en_cours' => ServiceEnCours::where('status', $status)->count()` |
| Méthodes / relations | `where` + `count` ; aucune relation, aucun autre champ du modèle |
| Filtres / statuts | `status = $status` (`$status = $request->query('status', 'archive')`, valeurs usuelles `actif`, `archive`, `corbeille` ; une valeur inconnue donne `0`) |
| Suppression douce | `ServiceEnCours` utilise `SoftDeletes` : la requête est `select count(*) as aggregate from service_en_cours where status = ? and service_en_cours.deleted_at is null` → les lignes supprimées en douceur ne sont **jamais** comptées |
| Valeur / type | entier PHP (`int`), `0` sans donnée ; clé JSON `services_en_cours`, 5ᵉ de 16 clés |
| SQL | **1 requête** pour ce compteur ; la route fait au total 16 requêtes de comptage (1 par clé, dont 4 via le contrat de Facturation) — pas d'optimisation groupée existante à préserver |
| Route / sécurité | `GET /api/v1/archive/counts`, `auth:sanctum` seul (pas de permission dédiée) — inchangé |
| Tests Archive existants | aucun test dédié à `/archive/counts` ; seul `ContratsFacturationTest` en vérifie les compteurs de documents → caractérisation écrite d'abord (§3) |

## 2. Contrat, implémentation, binding

- `App\Contracts\ServicesEnCours\CompteursServicesEnCours` — **une seule méthode**, `compterParStatut(string $statut): int`
  (le seul besoin d'Archive ; rien d'anticipé). Il reste dans `App\Contracts\ServicesEnCours` (domaine partagé, pas dans le
  module Facturation).
- `App\Services\ServicesEnCours\CompteursServicesEnCoursEloquent` — `ServiceEnCours::where('status', $statut)->count()`
  (la requête déplacée telle quelle ; le modèle reste connu uniquement ici).
- Binding dans `AppServiceProvider::$bindings`, à côté de `AssureServicesEnCours` (pas de nouveau provider). Le contrat
  `AssureServicesEnCours` n'est pas modifié.

## 3. Modification d'`ArchiveController`

Suppression de `use App\Models\ServiceEnCours;`, injection de `CompteursServicesEnCours` dans le constructeur (avec
`StatistiquesDocuments`), et `'services_en_cours' => $this->servicesEnCours->compterParStatut($status)` **à la même
position** dans le tableau : mêmes clés, même ordre, même JSON, même statut par défaut. Les 15 autres compteurs sont intacts.

## 4. Tests (nouveau fichier `tests/Feature/ArchiveCountsTest.php`, 9 tests)

Caractérisation, **écrite et exécutée avant la modification** (5 tests, inchangés après) : 401 sans authentification ; 16 clés
dans l'ordre, entiers `0` sans donnée, chaîne JSON exacte ; comptage par statut (`actif`, `archive`, `corbeille`, inconnu,
défaut) avec lignes supprimées en douceur exclues ; les autres compteurs ne sont pas affectés ; **1 seule requête SQL** pour
`service_en_cours` (avec la portée `deleted_at is null`) et 16 comptages au total, quel que soit le nombre de lignes (pas de N+1).

Après le découplage (4 tests) : le contrat est résolu et lié à son implémentation ; il compte comme l'ancienne requête
directe pour tous les statuts ; `ArchiveController` obtient la valeur du contrat (faux contrat → `42` renvoyé, un seul appel,
avec le statut demandé puis le statut par défaut `archive`, clés inchangées) ; garde-fou statique (aucune référence au modèle,
à `ServiceEnCours::` ni à l'implémentation concrète).

**Mutation vérifiée** : en remettant la requête directe à `ServiceEnCours` dans le contrôleur, 2 tests échouent (contrat non
utilisé, garde-fou statique) ; restauré ensuite.

## 5. Résultats

| Vérification | Étape 11 | Après |
|---|---|---|
| Backend complet | 315 passés, 1 échec connu | **324 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) — +9 |
| Archive (`ArchiveCountsTest`) | — | 9 passés |
| Facturation (module) / Contrats | 53 / 18 | 53 / 18 passés |
| Paiement / TVA / Mouvement / Services en cours | 32 / 26 / 7 / 19 | 32 / 26 / 7 / 19 passés |
| Numérotation / Concurrence | 12 / 2 | 12 / 2 passés |
| Snapshots routes / permissions / API | 3 | 3 passés, fichiers inchangés |
| Vitest | 40 | 40 passés (32 snapshots de documents inchangés) |
| Lint | 0 erreur, 45 avertissements | 0 erreur, 45 avertissements |
| Build | OK | OK |

## 6. Références à `ServiceEnCours` en production

`ArchiveController` : **aucune** (seulement le contrat `CompteursServicesEnCours`). Hors Services en cours, plus aucun
contrôleur ni modèle ne référence le modèle `ServiceEnCours` : Facturation, Paiements et Déclaration TVA passent par
`AssureServicesEnCours`, Archive par `CompteursServicesEnCours`. Restent légitimes : `ServiceEnCoursController`,
`ServiceEnCoursOperation`, le modèle, `AssureServicesEnCoursEloquent` et `CompteursServicesEnCoursEloquent`
(implémentations) et les liaisons de `AppServiceProvider`. Aucun couplage inverse ajouté (Services en cours n'importe rien
d'Archive).

## 7. Risques restants

- Archive fait toujours 16 requêtes de comptage (une par catégorie), comme avant ; non optimisé volontairement.
- `ArchiveController` dépend encore directement des modèles `Party`, `Domiciliation`, `Service`, `Paiement`,
  `DeclarationTva`, `Rapport`, `Cachet`, `Mail`, `DataCenterFiche` (autres domaines, hors périmètre).
- Les adaptateurs de Services en cours délèguent encore aux modèles / méthodes statiques.
- FK `paiements.document_id`, seeders de démonstration et inclusion de `routes.php` depuis `routes/api.php` : inchangés.

## 8. Étapes possibles ensuite

Contrats de comptage pour les autres catégories d'Archive (Paiements, TVA, Services…) ; FK / seeders avec les migrations du
module Facturation ; frontend Facturation (imports de constantes via `api/facturation.js`).
