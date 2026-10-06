# Domiciliation — Étape 19 : découplage Parties ↔ Domiciliation et suppression des alias

Tag de départ : `pre-domiciliation-etape19` (= `84618c2`). Tag d'arrivée : `post-domiciliation-etape19`.
Aucune URL, méthode, permission, middleware, réponse JSON, règle métier, migration, table ni donnée modifiée ; les 3 snapshots backend
(routes, permissions, formes d'API) et les 32 snapshots HTML n'ont pas été touchés.

## 1. Audit initial (qui consomme quoi)

| Consommateur (hors module) | Usage réel de Domiciliation |
|---|---|
| `Entreprise::centreDomiciliation()` | `belongsTo(CentreDomiciliation::class, 'centre_domiciliation_id')` — résolu **par l'alias** (référence non qualifiée) |
| `EntrepriseController` | (1) `RELATIONS` : eager-load `centreDomiciliation` (liste et 15 fiches) ; (2) `mapAttributes` : `CentreDomiciliation::where('nom', …)->value('id')` — la fiche désigne son centre **par son nom** |
| `EntrepriseResource` | `centreDomiciliation` = `->centreDomiciliation?->nom` ; `centreDomiciliationId` = colonne |
| `ClientResource` / `ClientController::show` | `entreprises[].centreDomiciliation` = nom ; `load('entreprises.centreDomiciliation')` |
| `Store/UpdateEntrepriseRequest` | champ texte `centreDomiciliation` (aucune règle d'existence) |
| `ArchiveController` | déjà par contrat (étape 17) |
| Tests | 7 fichiers important les anciens noms |

Seules **deux données** sont réellement utilisées : le **nom** d'un centre à partir de son identifiant (affichage) et l'**identifiant** à partir de son nom (écriture). Rien d'autre du modèle.

## 2. Caractérisation (écrite avant le contrat, commit `bbfe03b`)

`PartiesCentreDomiciliationTest` (10 tests, accès par la base : aucune classe du module importée) : création / modification avec un nom de centre (nom + identifiant exposés) ; **nom inconnu → centre vidé sans erreur** ;
clé absente → inchangé ; `null` / `''` → vidé ; centre **archivé** résolu et affiché ; centre **supprimé en douceur** : non résolu par nom, identifiant conservé mais nom `null` à l'affichage ; liste des entreprises et fiche
en **une seule requête** sur les centres (pas de N+1) ; fiche client : forme `entreprises[]` inchangée, nom du centre, une requête ; liste des clients sans entreprises.

## 3. Contrat et implémentation

`App\Modules\Domiciliation\Contracts\CentresDomiciliationReference` (contrat **public du module**, comme `FactureReference` pour Facturation ; emplacement cohérent avec `CompteursDomiciliations`) :

- `idParNom(string $nom): ?int` ; `nomsParIds(array $ids): array` (nom par identifiant, en une requête).

`App\Modules\Domiciliation\Services\CentresDomiciliationReferenceEloquent` : `CentreDomiciliation::where('nom', …)->value('id')` et `whereIn('id', …)->pluck('nom', 'id')` — **même portée par défaut** que l'ancienne
relation (supprimés en douceur invisibles, statut non filtré). Liaison dans `DomiciliationServiceProvider` (aucune dans `AppServiceProvider`). Aucun contrat pour les autres relations (Domiciliation → Entreprise reste une
dépendance du module vers Parties, voir §7).

## 4. Modifications côté Parties (sens : Parties → contrat → implémentation → modèle)

- `Entreprise` : relation `centreDomiciliation()` **supprimée** ; `nomCentreDomiciliation()` (mémorisé par instance, non persisté) et `Entreprise::chargerCentresDomiciliation($entreprises)` (lot en une requête), même schéma que
  `Paiement::numeroFacture` (étape 8).
- `EntrepriseController` : constructeur avec le contrat ; `mapAttributes` appelle `idParNom` ; `'centreDomiciliation'` retiré de `RELATIONS` ; `index()` précharge les noms du lot ; import du modèle supprimé.
- `EntrepriseResource` / `ClientResource` : `->nomCentreDomiciliation()` ; `ClientController::show` charge `entreprises` puis précharge les noms (une requête).
- Même résultat JSON (clés, valeurs, `null`), mêmes requêtes SQL de lecture (une pour tout le lot). `Entreprise::centreDomiciliation()` n'existait que pour ces usages.

## 5. Alias supprimés (5)

`app/Models/{Domiciliation, CentreDomiciliation, DomiciliationDocument, DomiciliationObservation, DomiciliationOperation}.php`. Recherche globale **avant** suppression : plus aucune référence de production (les imports des tests
ont été migrés vers `App\Modules\Domiciliation\Models\…`). Après : la seule occurrence restante d'un ancien nom est la chaîne `'App\Models\Domiciliation;'` d'une assertion négative d'`ArchiveCountsTest` (garde-fou). `DomiciliationSetting`
(Paramètres) reste dans `app/Models/`.

## 6. Tests déplacés (`git mv`) et tests d'architecture

Déplacés dans `app/Modules/Domiciliation/Tests/Feature/` (namespace seul modifié ; même suite `Feature` de `phpunit.xml`, **non modifié**) : `DomiciliationTest`, `DomiciliationActionsTest`, `DomiciliationCaracterisationTest`, `ModuleDomiciliationTest`.
**Non déplacés** (transverses) : `ArchiveCountsTest` (Archive), `CorrectionsAuditTest` (audit mixte), `SettingsTest` (Paramètres), `EntrepriseTest` et `PartiesCentreDomiciliationTest` (Parties), snapshots.

`ModuleDomiciliationTest` (12, réécrit) verrouille : anciens namespaces (modèles, contrôleurs, requests, resource, contrat, service) **inexistants** et aucun fichier de production qui les cite (le motif exclut `DomiciliationSetting`) ;
`DomiciliationSetting` inchangé ; traits `SoftDeletes` et tables ; relations internes ; `Entreprise` sans relation vers le centre et passant par le contrat ; 24 + 8 routes vers les contrôleurs du module (ordre global, `auth:sanctum`),
6 routes de réglages restées aux Paramètres ; liaison des deux contrats par le provider du module uniquement ; comportement du contrat de référence (actif, archivé, supprimé, inconnu, lots) ; **Parties n'importe plus aucun modèle Domiciliation** ;
**aucun fichier hors module** n'importe `Modules\Domiciliation\Models` ; le module n'importe de `App\Models` que `Entreprise` et `User` ; Archive utilise le contrat. Mutations vérifiées : réimporter le modèle dans `EntrepriseController` → 2 échecs ; recréer un alias → 3 échecs.

## 7. Dépendances restantes (autorisées)

- **Domiciliation → Parties** : `Domiciliation::entreprise()` (`Entreprise`) et `DomiciliationResource` (entreprise et son client), `CentreDomiciliationController::show` ; Parties est le noyau (hub) : sens autorisé, limité à `Entreprise` et `User` (testé).
- **Domiciliation → Facturation** (facture de domiciliation, frontend) par le point d'entrée public.
- **Facturation → `DomiciliationSetting`** (numérotation) : réglage resté aux Paramètres.
- **Parties → Domiciliation** : uniquement `CentresDomiciliationReference` (contrat) ; la colonne `entreprises.centre_domiciliation_id` et sa FK `RESTRICT` restent (base inchangée).
- Frontend Domiciliation non déplacé (étape 20).

## 8. Résultats

| Vérification | Départ (`84618c2`) | Après |
|---|---|---|
| Backend complet | 368 passés, 1 échec connu | **378 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) : +10 caractérisation Parties |
| Module Domiciliation | — | 52 passés |
| Parties (`PartiesCentreDomiciliationTest`, `EntrepriseTest`) | — | 10 + 8 passés |
| Archive / Settings / CorrectionsAudit | 16 / 26 / 17 | idem, passés |
| Snapshots routes / permissions / formes d'API | 3 | 3 passés, fichiers inchangés |
| Routes | 24 + 8 + 6 | identiques (URI, méthode, middleware, ordre global : snapshot) |
| Vitest | 71 | 71 passés ; 32 snapshots HTML inchangés |
| Lint / Build | 0 erreur, 45 avertissements / OK | idem |

## 9. Risques et suite

- `Entreprise` garde un cache `nomsCentres` par instance (comme `Paiement`) : une instance dont le centre change garde les anciennes clés (sans effet, la clé est l'identifiant).
- La résolution par nom reste silencieuse (centre inconnu → `null`) : comportement existant conservé et testé.
- Étape suivante possible : frontend Domiciliation (`frontend/src/modules/domiciliation/`), puis documents (`attestation`, `contrat`, `procuration`).
