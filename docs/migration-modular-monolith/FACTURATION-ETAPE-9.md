# Facturation — Étape 9 : Paiements découplé de Services en cours

Tag de départ : `pre-facturation-etape9` (= `71df6b6`). Tag d'arrivée : `post-facturation-etape9`.
Objectif unique : `PaiementController` n'appelle plus `ServiceEnCours::assurerServicesPourTiers` directement ; il passe par
le contrat existant `AssureServicesEnCours`. Aucun changement de comportement, d'API, de route, de permission, de base, de
PDF ni de frontend. La règle `exists:documents_commerciaux,id` n'est pas touchée.

## 1. Audit avant modification

| Question | Réponse |
|---|---|
| Où Paiements appelle-t-il `ServiceEnCours` ? | `PaiementController::store` (l. 156) et `::update` (l. 202), uniquement. Ni `Paiement`, ni `PaiementResource`, ni les autres méthodes du contrôleur |
| Données transmises | `$paiement->party_id` (?int), `$paiement->lignes->pluck('service_id')` (collection, `null` pour les lignes libres), `$request->user()->id` (int) |
| Valeur retournée | `void` — Paiements n'utilise que l'**effet de bord** (création des lignes « service en cours ») |
| Synchrone ? | Oui, et cela doit rester le cas |
| Dans une transaction ? | Oui : dans le `DB::transaction(...)` de `store` et de `update`, **après** `recalculerTotal()` et **avant** `Paiement::synchroniserFacture(...)` |
| Tests existants | `ServicesEnCoursAutomatiquesTest::test_paiement_alimente_services_en_cours` (création seulement), `ContratsFacturationTest` (contrat : résolution, absence de doublon, transaction) ; rien sur la **modification** d'un paiement, ni sur la transmission des paramètres |

Autres références à `ServiceEnCours` : voir §6.

## 2. Contrat utilisé (aucun nouveau contrat)

`App\Contracts\ServicesEnCours\AssureServicesEnCours::assurerPourTiers(?int $partyId, iterable $serviceIds, int $creePar): void`
couvre exactement le besoin (mêmes paramètres, même retour) : **il n'a pas été modifié**. Binding existant inchangé :
`AppServiceProvider::$bindings` → `App\Services\ServicesEnCours\AssureServicesEnCoursEloquent` (qui délègue à
`ServiceEnCours::assurerServicesPourTiers`). Aucun second binding.

Précision d'emplacement : le contrat et son implémentation ne sont **pas** dans `Modules/Facturation` mais dans
`App\Contracts\ServicesEnCours` / `App\Services\ServicesEnCours`, délibérément (étape 3) : ils appartiennent au domaine
« Services en cours » et sont consommés par Facturation **et** Paiements ; les placer dans Facturation ferait dépendre
Paiements de Facturation pour un besoin qui ne la concerne pas. Rien n'a été déplacé.

## 3. Modification

`PaiementController` uniquement :

- constructeur : `__construct(private FacturesDisponibles $factures, private AssureServicesEnCours $servicesEnCours)`
  (injection par le conteneur ; signatures publiques des actions inchangées) ;
- `store` et `update` : `ServiceEnCours::assurerServicesPourTiers(…)` → `$this->servicesEnCours->assurerPourTiers(…)`,
  **même ligne, mêmes arguments, même position** (après `recalculerTotal`, avant `synchroniserFacture`, dans la transaction) ;
- suppression du `use App\Models\ServiceEnCours;` devenu inutile.

Pas de Job, de queue ni d'événement : l'appel reste synchrone, dans la même transaction ; une exception du contrat remonte
telle quelle et annule la transaction (comportement inchangé).

## 4. Tests ajoutés (4, dans `PaiementTest` ; aucun test supprimé ni modifié)

Un faux contrat (espion) est injecté dans le conteneur et enregistre chaque appel, le niveau de transaction et l'état de la
facture à cet instant :

1. `paiements_passe_par_le_contrat…` : le contrôleur appelle le **contrat** une fois à la création et une fois à la
   modification ; mêmes données (`party_id`, `service_id` des lignes dans l'ordre, y compris `null`, utilisateur) ; appelé
   **dans** la transaction ; appelé **avant** la resynchronisation de la facture (`prix_paye` encore `0.00` à l'appel, `500.00`
   ensuite) — couvre aussi la modification, jusque-là non testée.
2. `paiements_ne_cree_pas_les_services_en_cours_lui_meme` : avec le faux contrat, aucune ligne `service_en_cours` n'est créée
   par Paiements.
3. `une_erreur_de_services_en_cours_est_propagee…` : si le contrat lève une exception, elle remonte à l'appelant, aucun
   paiement n'est conservé (rollback) et la facture n'est pas modifiée.
4. `le_code_de_production_de_paiements_n_appelle_plus_service_en_cours_directement` : garde-fou statique sur
   `PaiementController`, `Paiement`, `PaiementResource` (aucun `ServiceEnCours::`, aucun import du modèle, aucune référence à
   l'implémentation concrète ; le contrat est bien référencé).

Mutation vérifiée : en remettant l'ancien appel direct, ces 4 tests échouent. La résolution du contrat par le conteneur est
déjà couverte de façon fiable par `ContratsFacturationTest::test_chaque_contrat_est_lie_a_son_implementation`.

## 5. Résultats

| Vérification | Avant (étape 8) | Après |
|---|---|---|
| Backend complet | 288 passés, 1 échec connu | **292 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Facturation (module) / Contrats | 50 / — | 50 / 15 passés |
| Paiement | 17 | 21 passés |
| Mouvement / Archive / Services en cours | 7 / 15 / 19 | 7 / 15 / 19 passés |
| Numérotation / Concurrence | 12 / 2 | 12 / 2 passés |
| Snapshots routes / permissions / API | 3 | 3 passés, fichiers inchangés |
| Vitest | 40 | 40 passés (32 snapshots de documents inchangés) |
| Lint / Build | 0 erreur / OK | 0 erreur / OK |

## 6. Références restantes à `ServiceEnCours` (code de production, hors Services en cours)

| Fichier | Référence | Justification |
|---|---|---|
| `AssureServicesEnCoursEloquent` + `AppServiceProvider` | modèle + binding | **Implémentation du contrat**, côté Services en cours : c'est le seul endroit voulu |
| `DeclarationTvaController:116` | `ServiceEnCours::assurerPourClient('Déclaration TVA', …)` | Déclaration TVA → Services en cours : **hors périmètre** (TVA non modifiée) ; à traiter dans une étape dédiée |
| `ArchiveController:43` | `ServiceEnCours::where('status', …)->count()` | compteur Archive : **hors périmètre** (Archive non modifiée) |
| `ServiceEnCoursController`, `ServiceEnCoursOperation` | modèle | code interne du module Services en cours |
| Tests | `ContratsFacturationTest`, `ServicesEnCours*Test`, `DeclarationTvaTest`, `ApiShapeSnapshotTest` | vérifient l'état de la table / créent des données |

Paiements : **aucune** référence directe restante ; Facturation : passe par le contrat (étape 3).

## 7. Risques restants

- Le contrat reste dans `App\Contracts` / `App\Services` (pas dans un dossier de module « Services en cours » tant que ce module
  n'existe pas).
- `Déclaration TVA` et `Archive` dépendent encore directement du modèle `ServiceEnCours`.
- `AssureServicesEnCoursEloquent` délègue encore à la méthode statique du modèle (conservée pour compatibilité).
- Couplages de schéma Paiements ↔ Facturation inchangés : règle `exists:documents_commerciaux,id`, clé étrangère
  `paiements.document_id`, seeders de démonstration.
- `PaiementTest` importe encore `DocumentCommercial` (helper de test).

## 8. À traiter ensuite (décision à prendre)

Remplacer la règle `exists:documents_commerciaux,id` (même message 422) ; faire passer Déclaration TVA vers Services en cours
par un contrat (`assurerPourClient`) ; compteur Archive de Services en cours par un contrat de statistiques ; frontend
Facturation ; migrations / seeders du module.
