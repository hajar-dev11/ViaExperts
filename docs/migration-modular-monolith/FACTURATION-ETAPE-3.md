# Facturation — Étape 3 : contrats avec les autres modules

Tag de départ : `pre-facturation-etape3` (commit `927640e`). Tag d'arrivée : `post-facturation-etape3`.

Objectif : préparer les **contrats** entre Facturation et Paiements, Mouvement, Archive et Services en cours, sans rien
déplacer. Aucun Model, Controller, Request, Resource ni route de Facturation n'a bougé ; aucun comportement n'a changé.

## 1. Dépendances identifiées

| Module | Accès direct avant l'étape 3 | Où |
|---|---|---|
| Paiements → Facturation | requête `DocumentCommercial` pour la liste des factures rattachables | `PaiementController::facturesDisponibles` |
| Paiements → Facturation | écriture de `documents_commerciaux.prix_paye` (`DocumentCommercial::find()->forceFill()->save()`) | `Paiement::synchroniserFacture` (appelée 5 fois par `PaiementController`) |
| Paiements → Facturation | relation Eloquent `Paiement::document()` (`belongsTo DocumentCommercial`) | `Paiement.php` |
| Mouvement → Facturation | requête `DocumentCommercial` + filtres de période + années distinctes | `MouvementController::facture` |
| Archive → Facturation | 4 `DocumentCommercial::...->count()` (facture, devis, bl, avoir) | `ArchiveController::counts` |
| Facturation → Services en cours | appel statique `ServiceEnCours::assurerServicesPourTiers` (store + update) | `DocumentCommercialController` |

## 2. Contrats créés (petits, orientés métier)

Pas de « grosse » interface `FacturationService` : un contrat par besoin.

| Contrat | Rôle | Implémentation (`app/Services/...`) |
|---|---|---|
| `Contracts\Facturation\FacturesDisponibles` | factures actives rattachables à un paiement | `Facturation\FacturesDisponiblesEloquent` |
| `Contracts\Facturation\SynchronisationPaiements` | enregistrer le total payé d'une facture (`appliquerTotalPaye`) | `Facturation\SynchronisationPaiementsEloquent` |
| `Contracts\Facturation\StatistiquesDocuments` | compteurs par type pour un statut (Archive/Corbeille) | `Facturation\StatistiquesDocumentsEloquent` |
| `Contracts\Facturation\FacturesPourMouvements` | factures de la période + années disponibles (Mouvement) | `Facturation\FacturesPourMouvementsEloquent` |
| `Contracts\ServicesEnCours\AssureServicesEnCours` | faire apparaître les services saisis dans Services en cours | `ServicesEnCours\AssureServicesEnCoursEloquent` |

Les liaisons contrat → implémentation sont déclarées dans `AppServiceProvider::$bindings`.

Choix de conception :

- **Synchronisation** : la somme des paiements actifs est calculée côté Paiements (ce sont ses données) ; seule
  l'**écriture** dans la facture passe par le contrat. Calcul (`round(...,2)`), appel dans la transaction du paiement et
  base de données : inchangés.
- **Mouvement** : le contrat est justifié car la requête est une pure lecture isolable. Il renvoie des tableaux (pas de
  modèle) avec les mêmes clés que le JSON précédent ; les totaux restent calculés dans `MouvementController`. Les filtres
  de période (`date_debut`, `date_fin`, `annee`, `trimestre`) sont répliqués dans l'adaptateur (le contrôleur garde les
  siens pour la vue « Reçu » sur les paiements).
- **Services en cours** : le contrat appartient à Services en cours ; il n'importe rien de Facturation, donc pas de
  dépendance circulaire. Appel synchrone, dans la même transaction que le document.

## 3. Accès directs remplacés / compatibilité

- `PaiementController::facturesDisponibles` → `FacturesDisponibles::lister()`.
- `Paiement::synchroniserFacture` **conservée** (façade de compatibilité, mêmes appels, même signature) : calcule la
  somme puis délègue à `SynchronisationPaiements`.
- `ArchiveController::counts` → `StatistiquesDocuments::compterParType()` (ordre des clés JSON inchangé).
- `MouvementController::facture` → `FacturesPourMouvements` (`entrees`, `anneesDisponibles`).
- `DocumentCommercialController` (store, update) → `AssureServicesEnCours::assurerPourTiers`. La méthode
  `ServiceEnCours::assurerServicesPourTiers` est **conservée** : l'adaptateur la délègue, et `PaiementController` l'appelle
  toujours directement.

## 4. Fichiers

Créés :

- `backend/app/Contracts/Facturation/{FacturesDisponibles,SynchronisationPaiements,StatistiquesDocuments,FacturesPourMouvements}.php`
- `backend/app/Contracts/ServicesEnCours/AssureServicesEnCours.php`
- `backend/app/Services/Facturation/{FacturesDisponiblesEloquent,SynchronisationPaiementsEloquent,StatistiquesDocumentsEloquent,FacturesPourMouvementsEloquent}.php`
- `backend/app/Services/ServicesEnCours/AssureServicesEnCoursEloquent.php`
- `backend/tests/Feature/ContratsFacturationTest.php` (13 tests)
- `docs/migration-modular-monolith/FACTURATION-ETAPE-3.md`

Modifiés :

- `backend/app/Providers/AppServiceProvider.php` (liaisons)
- `backend/app/Http/Controllers/Api/V1/{PaiementController,MouvementController,ArchiveController,DocumentCommercialController}.php`
- `backend/app/Models/Paiement.php` (`synchroniserFacture` délègue)

## 5. Tests

| Vérification | Résultat |
|---|---|
| Baseline avant | 260 passés, 1 échec connu |
| Backend complet après | **273 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Nouveaux tests contrats | 13 passés (résolution du conteneur, liste/ordre/champs, arrondi, ignorés null/absent, rollback de transaction, filtres de période, années, comptages, Services en cours sans doublon) |
| Facturation, Paiement, Mouvement, Archive, Services en cours (+ automatiques) | passent |
| Numérotation + concurrence multi-processus | 14 passés |
| Snapshots routes / permissions / formes d'API | passent, **non régénérés** |
| Vitest | 40 passés, les 32 snapshots de documents inchangés (aucun fichier modifié) |
| Lint | 0 erreur (avertissements existants) |
| Build | OK |

## 6. Aucun changement de route, API, permission, base, PDF

Routes, URL, permissions, migrations, tables, colonnes, PDF, `documentPrint.js`, numérotation (étape 2) et frontend : non
touchés (`git status` ne montre que du backend + doc).

## 7. Risques restants

- `Paiement::document()` reste une relation Eloquent vers `DocumentCommercial` (utilisée par `PaiementResource` /
  eager-loading) : couplage de modèle, hors contrat à ce stade.
- `PaiementController` appelle encore `ServiceEnCours::assurerServicesPourTiers` en direct (Paiements → Services en
  cours, hors périmètre Facturation) ; `DeclarationTvaController` appelle `assurerPourClient`.
- Les filtres de période de Mouvement existent en double (contrôleur pour « Reçu », adaptateur pour « Facturé »).
- `documents_commerciaux.prix_paye` reste une colonne stockée : le contrat ne rend pas la synchronisation automatique,
  l'appelant doit toujours le faire dans sa transaction.
- Les adaptateurs sont toujours dans `app/Services` (pas encore dans un dossier de module).

## 8. Pour l'étape 4

Déplacement physique de Facturation (Models, Controllers, Requests, Resources, routes) avec `class_alias` de
compatibilité et snapshots de routes/permissions/API comme filet ; décider du sort de `Paiement::document()` et des
appels directs à Services en cours restants.
