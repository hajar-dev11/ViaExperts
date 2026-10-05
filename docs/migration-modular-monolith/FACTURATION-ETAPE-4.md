# Facturation — Étape 4 : déplacement du backend dans `app/Modules/Facturation/`

Tag de départ : `pre-facturation-etape4` (= `post-facturation-etape3`, commit `6ea1473`). Tag d'arrivée : `post-facturation-etape4`.

Principe : **déplacer le code, pas refactorer le métier.** Le corps des classes n'a pas changé ; seuls les `namespace` et
les `use` ont été adaptés.

## 1. Structure avant / après

Avant (dispersée) :

```
app/Models/{DocumentCommercial,DocumentLigne}.php
app/Http/Controllers/Api/V1/DocumentCommercialController.php
app/Http/Requests/{Store,Update}DocumentCommercialRequest.php
app/Http/Resources/DocumentCommercialResource.php
app/Services/NumerotationDocuments.php
app/Services/Facturation/*Eloquent.php        (étape 3)
app/Contracts/Facturation/*.php               (étape 3)
routes/api.php                                (bloc facturation/{type})
```

Après :

```
app/Modules/Facturation/
├── Contracts/        FacturesDisponibles, SynchronisationPaiements, StatistiquesDocuments, FacturesPourMouvements
├── Http/
│   ├── Controllers/  DocumentCommercialController
│   ├── Requests/     StoreDocumentCommercialRequest, UpdateDocumentCommercialRequest
│   └── Resources/    DocumentCommercialResource
├── Models/           DocumentCommercial, DocumentLigne
├── Services/         NumerotationDocuments + 4 adaptateurs *Eloquent
├── FacturationServiceProvider.php
└── routes.php
```

Non déplacés volontairement : migrations (restent dans `database/migrations/`), tests (voir §9), frontend.

## 2. Fichiers déplacés (`git mv`, historique conservé)

| Ancien | Nouveau |
|---|---|
| `app/Models/DocumentCommercial.php` | `app/Modules/Facturation/Models/` |
| `app/Models/DocumentLigne.php` | `app/Modules/Facturation/Models/` |
| `app/Http/Controllers/Api/V1/DocumentCommercialController.php` | `app/Modules/Facturation/Http/Controllers/` |
| `app/Http/Requests/{Store,Update}DocumentCommercialRequest.php` | `app/Modules/Facturation/Http/Requests/` |
| `app/Http/Resources/DocumentCommercialResource.php` | `app/Modules/Facturation/Http/Resources/` |
| `app/Services/NumerotationDocuments.php` | `app/Modules/Facturation/Services/` |
| `app/Services/Facturation/{FacturesDisponibles,FacturesPourMouvements,StatistiquesDocuments,SynchronisationPaiements}Eloquent.php` | `app/Modules/Facturation/Services/` |
| `app/Contracts/Facturation/{FacturesDisponibles,FacturesPourMouvements,StatistiquesDocuments,SynchronisationPaiements}.php` | `app/Modules/Facturation/Contracts/` |

## 3. Stratégie de compatibilité des anciens namespaces

À l'ancien emplacement de chacune des **7 classes publiques** (2 modèles, contrôleur, 2 requests, resource,
`NumerotationDocuments`) reste un fichier **sans aucune logique** :

```php
if (! class_exists('App\Models\DocumentCommercial', false)) {
    class_alias('App\Modules\Facturation\Models\DocumentCommercial', 'App\Models\DocumentCommercial');
}
```

- Il n'y a qu'**une seule implémentation** : celle du module. L'ancien nom est un alias (`ReflectionClass` renvoie le
  nom du module).
- L'alias est déclenché par l'autoload PSR-4 la première fois que l'ancien nom est référencé, dans n'importe quel ordre
  (vérifié en référençant l'ancien nom en premier).
- Les événements de modèle, le route-model-binding, `with()`, `Paiement::document()` (qui référence toujours
  `DocumentCommercial::class` dans `App\Models`) fonctionnent à l'identique.
- Les contrats et adaptateurs de l'étape 3 (créés au commit précédent, sans autre consommateur) n'ont **pas** d'alias :
  leurs 4 consommateurs (`Archive/Paiement/MouvementController`, `Paiement`) ont simplement mis à jour leur `use`.
- Les tests existants (`PaiementTest`, `FacturationTest`, `NumerotationDocumentsTest`, `NumerotationConcurrenceTest`)
  utilisent toujours les **anciens** noms et passent sans modification : ils servent de preuve de compatibilité.
- Suppression future : quand plus aucune référence à l'ancien nom n'existe, supprimer les 7 fichiers d'alias.

## 4. FacturationServiceProvider

Enregistré dans `config/app.php` (après `RouteServiceProvider`). Il porte `$bindings` pour les **4 contrats publics de
Facturation**. Ces 4 liaisons ont été **retirées** de `AppServiceProvider` (pas de double liaison — vérifié par test).
Reste dans `AppServiceProvider` : `AssureServicesEnCours`, contrat appartenant à Services en cours.

## 5. Routes

Le bloc `facturation/{type}` est dans `app/Modules/Facturation/routes.php` (9 routes, mêmes URL, méthodes, ordre,
`whereIn`, middleware). `routes/api.php` ne contient plus que :

```php
require app_path('Modules/Facturation/routes.php');
```

à la **position exacte** de l'ancien bloc (donc sous `api/v1` + `auth:sanctum`, entre Services et Déclarations).

Pourquoi pas un chargement par le provider ? Les routes d'un provider sont enregistrées avant celles de `routes/api.php`
(RouteServiceProvider charge après le boot) : l'ordre global changerait, or le snapshot de routes compare l'ordre.
`/numero-propose` reste avant `/{document}`. Seul changement dans `api.php` : suppression du `use` du contrôleur.

## 6. Contrats

Placés dans `Modules/Facturation/Contracts/` : ce sont les contrats **publics de Facturation** consommés par d'autres
modules. `AssureServicesEnCours` (et son adaptateur) **restent** dans `App\Contracts\ServicesEnCours` /
`App\Services\ServicesEnCours` : il appartient à Services en cours, et le déplacer dans Facturation recréerait la
dépendance circulaire que ce contrat sert à éviter.

## 7. NumerotationDocuments

Déplacé sans modification de logique (préfixes, suffixes, compteurs, `lockForUpdate`, transactions, SQL 1062 → 422).
Alias à l'ancien nom. Tests unitaires et de concurrence multi-processus inchangés et verts.

## 8. Dépendances conservées

- `DocumentCommercial` → `App\Models\{Party,Client,Entreprise}` ; `DocumentLigne` → `App\Models\Service` (modèles du
  noyau, encore hors module, `use` explicites).
- `NumerotationDocuments` → `CabinetSetting`, `DomiciliationSetting` (Paramètres).
- `Paiement::document()` → `DocumentCommercial` via l'alias.
- `PaiementController` → `ServiceEnCours::assurerServicesPourTiers` en direct.
- `DocumentCommercialController` → `User::hasPermission` (noyau) et `AssureServicesEnCours`.

## 9. Tests

Les tests Facturation restent dans `backend/tests/Feature/` : `phpunit.xml` ne scanne que `tests/Feature` et
`tests/Unit`, et les déplacer dans `app/Modules/Facturation/Tests/` demanderait de modifier la configuration pour un
bénéfice nul à ce stade (risque inutile). Ajout : `tests/Feature/ModuleFacturationTest.php` (10 tests : 7 alias, relations
Eloquent, routes → contrôleur du module dans l'ordre, liaisons du provider sans doublon). `ContratsFacturationTest` :
seuls les `use` ont changé.

| Vérification | Résultat |
|---|---|
| Référence avant | 273 passés, 1 échec connu |
| Backend complet | **283 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Facturation (+ contrats, module) | 34 passés |
| Paiement / Mouvement / Archive / Services en cours | 14 / 7 / 15 / 19 passés |
| Numérotation + concurrence | 14 passés |
| Snapshots routes / permissions / API | 3 passés, aucun fichier modifié |
| Vitest | 40 passés (32 snapshots de documents inchangés) |
| Lint / Build | 0 erreur / OK |

## 10. Aucun changement de comportement

Routes (URL, méthodes, ordre, middleware), réponses JSON, codes HTTP, permissions, base de données (aucune migration, table,
colonne, index), PDF, frontend : inchangés.

## 11. Risques restants

- 7 fichiers d'alias à supprimer plus tard ; tant qu'ils existent, deux noms désignent la même classe.
- `routes/api.php` inclut encore le fichier du module (ordre global des routes) ; à revoir quand toutes les routes seront
  dans des modules.
- Les modèles du noyau (`Party`, `Client`, `Entreprise`, `Service`, `Paiement`) restent hors module.
- Migrations et tests Facturation toujours hors du module.
- `Paiement::document()` et les appels directs à `ServiceEnCours` restent des couplages directs.

## 12. Pour l'étape 5

Remplacer les références à l'ancien namespace par le nouveau (tests, `Paiement`), supprimer les alias, et décider du
déplacement des tests et du chargement des routes par le provider ; puis frontend Facturation.
