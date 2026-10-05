# Facturation — Étape 11 : Déclaration TVA découplée de Services en cours

Tag de départ : `pre-facturation-etape11` (= `8605fe3`). Tag d'arrivée : `post-facturation-etape11`.
Objectif : `DeclarationTvaController` n'appelle plus `ServiceEnCours::…` directement ; il utilise le contrat existant
`App\Contracts\ServicesEnCours\AssureServicesEnCours`. Aucune logique TVA, API, route, permission, base, PDF ni frontend
modifié.

## 1. Audit avant modification

| Question | Réponse |
|---|---|
| Où ? | `DeclarationTvaController::store`, une seule occurrence (l. 116 avant) ; ni `update`, ni autre méthode, ni Request/Resource/Service TVA |
| Méthode appelée | `ServiceEnCours::assurerPourClient('Déclaration TVA', $clientId, $request->user()->id)` |
| Paramètres | nom du service au catalogue (`'Déclaration TVA'`), `$clientId` = `Entreprise::where('party_id', …)->value('client_id')` (peut être `null`), id utilisateur |
| Retour | `void` — seul l'effet de bord (création de la ligne « service en cours ») est utilisé |
| Quand ? | dans le `DB::transaction` de `store`, **après** création des lignes et `recalculerTotaux()`, en **dernière** opération avant `return $declaration` ; uniquement si `$type === 'tva'` |
| Transaction | **oui**, celle de la déclaration. Aucune opération TVA après l'appel ; la réponse est construite après le commit |
| Cas particuliers | appelée même si `$clientId` est `null` (c'est `assurerPourClient` qui ignore un client vide) ; ignore silencieusement un service absent du catalogue ; pas de doublon pour (service, client) |
| Tests existants | `DeclarationTvaTest` : création du service pour le client, pas de doublon, pas de client, `chiffre_affaire` exclu. Rien sur le moment de l'appel, la transaction ni la propagation d'erreur → caractérisés d'abord (§4) |

## 2. Contrat : le contrat existant ne couvrait pas exactement l'appel

`assurerPourTiers(?int $partyId, iterable $serviceIds, int $creePar)` travaille avec des **identifiants de services** issus des
lignes d'un document et un **tiers** ; l'appel TVA désigne le service par son **nom** pour un **client** déjà résolu. Ce n'est
donc pas la même méthode. Options étudiées :

1. Un second contrat → écarté (consigne).
2. Faire résoudre le service par son nom dans `DeclarationTvaController` puis appeler `assurerPourTiers` → déplacerait de la
   logique de Services en cours dans TVA et ajouterait une dépendance TVA → modèle `Service` : écarté.
3. **Ajouter au contrat existant une méthode `assurerPourClient(string $nomService, ?int $clientId, int $creePar): void`**,
   dont l'implémentation délègue à la méthode actuelle `ServiceEnCours::assurerPourClient` (retenu). C'est une extension
   **additive** et minimale : aucune logique nouvelle, aucun changement de comportement, même domaine (« faire apparaître un
   service dans Services en cours »), un seul contrat, une seule implémentation, un seul binding.

Le contrat **n'a pas été déplacé** : il reste dans `App\Contracts\ServicesEnCours` (implémentation dans
`App\Services\ServicesEnCours`, binding dans `AppServiceProvider`), car Services en cours est un domaine partagé par
Facturation, Paiements et Déclaration TVA — le placer dans Facturation ferait dépendre TVA de Facturation.

## 3. Modifications

- `Contracts/ServicesEnCours/AssureServicesEnCours` : + `assurerPourClient(...)` (docblock explicite).
- `Services/ServicesEnCours/AssureServicesEnCoursEloquent` : + `assurerPourClient(...)` → `ServiceEnCours::assurerPourClient(...)`.
- `DeclarationTvaController` : `__construct(private AssureServicesEnCours $servicesEnCours)`, appel
  `$this->servicesEnCours->assurerPourClient('Déclaration TVA', $clientId, $request->user()->id)` **à la même ligne, même
  condition (`type === 'tva'`), mêmes arguments, dans la même transaction, dernier dans la transaction** ; suppression de
  `use App\Models\ServiceEnCours;`.
- `tests/Feature/PaiementTest.php` : le faux contrat de l'étape 9 doit implémenter la nouvelle méthode de l'interface (ajout
  d'une méthode qui lève une exception — Paiements ne l'utilise pas) ; aucune assertion modifiée.

Synchrone, sans Job / queue / événement ; aucune transaction ajoutée ni retirée.

## 4. Tests

**Caractérisation écrite AVANT la modification** (état en base + événements du modèle ; passaient sur l'ancien code et
passent à l'identique après) : service créé de façon synchrone, dans la transaction, après lignes et totaux, une seule fois,
avec le bon utilisateur et le bon client ; une exception levée pendant la création est propagée et **annule toute la
déclaration** (déclaration, lignes, service) ; sans service « Déclaration TVA » au catalogue : 201 sans service en cours ; la
modification d'une déclaration ne touche pas aux services en cours.

**Après modification** (`DeclarationTvaTest`, faux contrat) : contrat appelé une fois avec `('Déclaration TVA', client_id de
l'entreprise, user)` ; aucun appel `assurerPourTiers` ; état à l'appel (transaction ouverte, 1 déclaration, 2 lignes, total
`1800.00`) ; appel aussi quand le client est `null` ; aucun appel pour `chiffre_affaire` ni à la modification ; une erreur du
contrat remonte et annule la déclaration ; garde-fou statique (aucun `ServiceEnCours::`, aucun import du modèle, aucune
référence à l'implémentation concrète). `ContratsFacturationTest` : `assurerPourClient` (création par nom, pas de doublon,
client vide / service inconnu ignorés, suit la transaction de l'appelant). La liaison du contrat était déjà testée.

**Mutations vérifiées** (restaurées ensuite) : (1) ancien appel direct remis → 5 tests échouent ; (2) implémentation du
contrat neutralisée → 7 tests échouent.

## 5. Résultats

| Vérification | Étape 10 | Après |
|---|---|---|
| Backend complet | 304 passés, 1 échec connu | **315 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Facturation (module) / Contrats | 51 / 16 | 53 / 18 passés |
| Déclaration TVA | 17 | 26 passés |
| Paiement / Mouvement / Archive / Services en cours | 32 / 7 / 15 / 19 | 32 / 7 / 15 / 19 passés |
| Numérotation / Concurrence | 12 / 2 | 12 / 2 passés |
| Snapshots routes / permissions / API | 3 | 3 passés, fichiers inchangés |
| Vitest | 40 | 40 passés (32 snapshots de documents inchangés) |
| Lint / Build | 0 erreur / OK | 0 erreur / OK |

## 6. Références restantes à `ServiceEnCours` (production)

| Fichier | Verdict |
|---|---|
| `DeclarationTvaController` | **aucune référence au modèle ni appel statique** ; utilise le contrat |
| `PaiementController`, `DocumentCommercialController` | via le contrat (étapes 3 et 9) |
| `AssureServicesEnCoursEloquent`, `AppServiceProvider` | implémentation et binding : légitimes |
| `ServiceEnCoursController`, `ServiceEnCoursOperation`, modèle | code interne de Services en cours |
| `ArchiveController:16,43` | compteur Archive : **hors périmètre**, étape ultérieure |

## 7. Risques restants

- Le contrat compte maintenant deux méthodes ; tout futur double de test ou implémentation devra aussi définir
  `assurerPourClient` (déjà fait pour l'espion de `PaiementTest`).
- `ArchiveController` dépend encore du modèle `ServiceEnCours`.
- L'adaptateur délègue encore aux méthodes statiques du modèle (conservées).
- `TVA` lit encore `Entreprise` directement (propre logique TVA, hors périmètre).
- Couplages de schéma Paiements ↔ Facturation (FK `paiements.document_id`, seeders) et `routes/api.php` incluant
  `routes.php`, inchangés.

## 8. Étapes possibles ensuite

Contrat de statistiques pour le compteur Archive ↔ Services en cours ; FK / seeders avec les migrations du module ;
frontend Facturation ; revue d'ensemble du contrat `AssureServicesEnCours` (le scinder en deux si une 3ᵉ méthode apparaît).
