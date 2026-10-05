# Facturation — Étape 10 : validation de `document_id` (Paiements) découplée de `documents_commerciaux`

Tag de départ : `pre-facturation-etape10` (= `cbcec3f`). Tag d'arrivée : `post-facturation-etape10`.
Objectif unique : Paiements ne valide plus `document_id` par `exists:documents_commerciaux,id` mais par un contrat public de
Facturation, **avec exactement le même comportement visible**. Aucune migration, table, colonne, FK, route, permission, réponse
JSON, PDF, seeder ni frontend modifié.

## 1. Audit avant modification

| Question | Réponse (vérifiée par exécution) |
|---|---|
| Où ? | `PaiementController::regles()` (l. 32) — une seule occurrence de `exists:documents_commerciaux,id` dans tout le code de Paiements. `Paiement`, `PaiementResource`, `PaiementTest` : aucune règle |
| Qui l'utilise ? | `store` (`regles()`) et `update` (`regles(true)`) via `$request->validate(...)`, en tout début de méthode |
| Quand ? | **Avant** toute écriture et avant l'ouverture de la transaction : une requête refusée ne crée ni ne modifie rien |
| Règles de l'attribut | `nullable`, `integer`, `exists:documents_commerciaux,id` (présent aussi en modification, sans `sometimes`) |
| Message / JSON | HTTP 422, `{"message":"The selected document id is invalid.","errors":{"document_id":["The selected document id is invalid."]}}` |
| Non-entier (`abc`, `1abc`, `5.5`, `1e1`) | HTTP 422 avec **un seul** message, celui de `integer` (« The document id must be an integer. ») : Laravel n'évalue `Exists` que si l'attribut n'a pas déjà d'erreur (`Validator::hasNotFailedPreviousRuleIfPresenceRule`) |
| `null` | accepté (détache la facture) |
| Type / statut du document | **aucun effet** : facture, devis, bl, avoir, statut actif / archive / corbeille sont tous acceptés |
| **Suppression douce** | **un document en corbeille (`deleted_at` renseigné) est ACCEPTÉ** : `exists` interroge la table par le builder de requêtes, sans la portée `SoftDeletes`. Établi par un test écrit et exécuté sur l'ancien code avant toute modification |
| Besoin réel de Paiements | un booléen « ce document existe-t-il ? » |

## 2. Contrat et implémentation

- `Modules/Facturation/Contracts/FactureExiste` : `existe(int $documentId): bool` — un booléen, ni modèle ni requête.
- `Modules/Facturation/Services/FactureExisteEloquent` : `DocumentCommercial::withTrashed()->whereKey($id)->exists()`.
  **`withTrashed()` est indispensable** (sinon un document en corbeille deviendrait « inexistant » : changement de
  comportement). Cette différence avec `FactureReference::numeros()` (qui exclut les documents supprimés, comme l'ancienne
  relation) est volontaire et documentée dans les deux contrats.
- Binding : `FacturationServiceProvider::$bindings` (comme les autres contrats de Facturation). Aucun second binding.

## 3. Modification côté Paiements

`PaiementController` uniquement : injection de `FactureExiste` dans le constructeur, et
`'document_id' => ['bail', 'nullable', 'integer', function (…, Closure $fail) { if (! $this->factureExiste->existe((int) $value)) { $fail(__('validation.exists')); } }]`.

- Même message : `validation.exists` (« The selected :attribute is invalid. »), avec le même remplacement d'attribut.
- Même moment : dans `$request->validate()`, avant toute écriture et avant la transaction.
- `bail` : reproduit le comportement de l'ancienne règle (non évaluée après l'échec de `integer`) ; sans lui, un `abc`
  produisait un 2ᵉ message (détecté par les tests de caractérisation, voir §4).
- Ni `PaiementResource`, ni `Paiement`, ni les routes, ni la FK `paiements.document_id` ne changent.

## 4. Tests (12 ajoutés, aucun supprimé ni modifié)

Écrits **d'abord contre l'ancien code** (caractérisation), puis rejoués à l'identique après le changement :

- `PaiementTest` (+11) : document existant accepté pour tout type / statut / chaîne numérique / `null` ; inexistant → 422
  `assertExactJson` (message + structure) et **aucun paiement ni ligne créé** ; 4 valeurs non entières → un seul message ;
  **document en corbeille accepté** (création) ; **modification** : document invalide → 422 sans aucun changement
  (paiement et facture intacts), détachement `null` OK, document en corbeille accepté ; la validation passe **par le contrat**
  (faux contrat qui répond « inexistant » → 422 même si la facture existe), est appelée **avant** tout paiement créé et hors
  transaction d'écriture ; une modification sans `document_id` n'appelle pas le contrat ; garde-fou statique (aucun
  `exists:documents_commerciaux` ni `'documents_commerciaux'` hors commentaires, aucune référence à l'implémentation concrète).
- `ContratsFacturationTest` (+1, et liaison de `FactureExiste`) : `existe()` vrai pour facture / devis / archive / corbeille
  de statut / supprimé en douceur, faux pour un identifiant inconnu ou 0.

**Mutations vérifiées** (chacune restaurée ensuite) : (1) réintroduction de `exists:documents_commerciaux,id` → 5 tests
échouent ; (2) contrat sans `withTrashed()` → 3 tests échouent (corbeille) ; (3) retrait de `bail` → 4 tests échouent.

## 5. Résultats

| Vérification | Étape 9 | Après |
|---|---|---|
| Backend complet | 292 passés, 1 échec connu | **304 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Facturation (module) / Contrats | 50 / 15 | 51 / 16 passés |
| Paiement | 21 | 32 passés |
| Mouvement / Archive / Services en cours | 7 / 15 / 19 | 7 / 15 / 19 passés |
| Numérotation / Concurrence | 12 / 2 | 12 / 2 passés |
| Snapshots routes / permissions / API | 3 | 3 passés, fichiers inchangés |
| Vitest | 40 | 40 passés (32 snapshots de documents inchangés) |
| Lint / Build | 0 erreur / OK | 0 erreur / OK |

## 6. Références à `documents_commerciaux` restantes côté Paiements

| Fichier | Nature | Verdict |
|---|---|---|
| Code de production de Paiements | **aucune** (hors commentaires) | couplage supprimé |
| `Models/Paiement.php:108` | commentaire (« `documents_commerciaux.prix_paye` est une colonne stockée ») | documentation |
| `tests/Feature/PaiementTest.php` | requêtes de contrôle (`DB::table('documents_commerciaux')` dans l'espion de l'étape 9, filtre du journal de requêtes de l'étape 8) et tests de l'étape 10 | tests ; acceptable |
| `database/migrations/…create_paiements_table.php` | FK `paiements.document_id → documents_commerciaux.id` | **base de données : volontairement inchangée** |
| `DemoDataSeeder` / `DemoDataPurgeSeeder` | `DB::table('documents_commerciaux')` | seeders ; hors périmètre |

## 7. Risques restants

- **Cas limites exotiques de saisie** (par ex. `document_id` envoyé sous forme de tableau) : la règle `integer` échoue de
  toute façon (422) ; seule la liste des messages pourrait différer du comportement de l'ancienne règle sur ces entrées non
  valides. Aucun cas réaliste.
- Le test de garde statique repose sur des sous-chaînes de code source : il détecte un retour de la règle, pas une requête
  équivalente écrite autrement.
- FK `paiements.document_id` et seeders de démonstration toujours liés à la table (hors périmètre voulu).
- `PaiementTest` importe encore `DocumentCommercial` (helper de test d'intégration).
- Déclaration TVA et Archive dépendent encore du modèle `ServiceEnCours` ; `routes/api.php` inclut encore `routes.php`.

## 8. Étapes possibles ensuite

Contrat pour le compteur Archive ↔ Services en cours ; Déclaration TVA → Services en cours via contrat ; revue de la FK /
seeders avec les migrations du module ; frontend Facturation (imports de constantes via `api/facturation.js`).
