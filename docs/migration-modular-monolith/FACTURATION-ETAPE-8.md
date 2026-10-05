# Facturation — Étape 8 : Paiements découplé du modèle `DocumentCommercial`

Tag de départ : `pre-facturation-etape8` (= `418a58d`). Tag d'arrivée : `post-facturation-etape8`.
Objectif unique : Paiements ne dépend plus de `App\Modules\Facturation\Models\DocumentCommercial` ; il passe par un contrat
public de Facturation. Aucun changement de comportement, d'API, de route, de permission, de base, de PDF ni de frontend.

## 1. Audit préalable : usages du modèle côté Paiements

| Fichier | Ligne (avant) | Usage | Décision |
|---|---|---|---|
| `Models/Paiement.php` | 6, 54 | `use` + relation `document()` (`belongsTo(DocumentCommercial::class, 'document_id')`) | **Remplacé** par le contrat |
| `Http/Controllers/Api/V1/PaiementController.php` | 16 | `'document'` dans `RELATIONS` (eager-loading de la relation) | **Retiré** ; préchargement par lot dans `index()` |
| `Http/Resources/PaiementResource.php` | 28 | `whenLoaded('document')->numero ?? null` → `factureNumero` | **Remplacé** par `numeroFacture()` |
| `tests/Feature/PaiementTest.php` | 6, 43, 54 | helper de test qui relit l'état de la facture créée | **Conservé** (test d'intégration Paiements ↔ Facturation, aucune production) |
| `PaiementController::facturesDisponibles`, `Paiement::synchroniserFacture` | — | déjà derrière les contrats `FacturesDisponibles` / `SynchronisationPaiements` | inchangés |

Seul besoin réel : **le numéro de la facture à partir de son identifiant** (`factureNumero`). Aucun autre champ du
document n'est lu par Paiements via la relation (vérifié : pas d'autre `->document`, ni `with('document')`, ni test).

## 2. Contrat créé : `FactureReference`

`app/Modules/Facturation/Contracts/FactureReference.php` — une seule méthode :

```php
public function numeros(array $documentIds): array; // [id => numero]
```

Choix : une méthode **par lot** (pas `numero(int $id)`), pour conserver l'efficacité de l'ancien eager-loading (la liste des
paiements n'est pas paginée) ; aucune méthode inutile.

Implémentation : `app/Modules/Facturation/Services/FactureReferenceEloquent.php` (`DocumentCommercial::whereIn('id', …)->pluck('numero', 'id')`).
Elle reste à l'intérieur du module Facturation. Équivalence avec l'ancienne relation : même portée par défaut (les documents
en suppression douce sont exclus → `null`), aucun filtre sur le type ni sur `status` (actif / archive / corbeille de statut
restent résolus), identifiants vides ou inconnus ignorés.

Liaison : `FacturationServiceProvider::$bindings` (comme les 4 autres contrats de Facturation).

Dépendance : `Paiement` → contrat → implémentation Facturation → `DocumentCommercial`. Plus aucun lien direct
`Paiement` → `DocumentCommercial` dans le code de production (seul reste un mot dans un commentaire).

## 3. Modifications côté Paiements (strictement nécessaires)

- `Paiement.php` : suppression de `use …\DocumentCommercial` et de la relation `document()` ; ajout de
  `numeroFacture(): ?string` (lit le contrat, mémorise par instance) et de `Paiement::chargerNumerosFactures($paiements)`
  (résout tout un lot en une requête). Le cache est une propriété non persistée : rien n'est écrit en base.
- `PaiementController.php` : `'document'` retiré de `RELATIONS` ; `index()` appelle `Paiement::chargerNumerosFactures()`
  avant de construire la collection. `show`, `store`, `update` et changements de statut résolvent le numéro à la demande
  (une requête, comme l'ancien eager-loading d'un seul enregistrement).
- `PaiementResource.php` : `'factureNumero' => $this->numeroFacture()`. Même clé JSON, mêmes valeurs (`null` sans facture
  ou si la facture est supprimée).

⚠ `Paiement::document()` n'existe plus (c'était l'objet de l'étape). Aucun appelant restant dans le dépôt ; aucune route ni
réponse JSON ne l'exposait. `ModuleFacturationTest` vérifie désormais son absence.

## 4. Tests ajoutés (5, aucun existant supprimé)

- `ContratsFacturationTest` (module) : liaison de `FactureReference` ; `numeros()` en 1 requête, ordre/clés, inconnus
  ignorés, statut archive non filtré ; document supprimé / liste vide / valeurs nulles → `[]`.
- `PaiementTest` : `factureNumero` exposé en création, consultation et liste (null sans facture) ; la liste fait **une seule**
  requête sur `documents_commerciaux` (mutation vérifiée : sans le préchargement le test échoue, 3 requêtes au lieu de 1) ;
  facture en corbeille → `factureNumero: null`.
- `ModuleFacturationTest` : l'assertion « Paiement::document() résout vers le module » devient « la relation n'existe plus,
  `numeroFacture()` existe » (changement voulu par l'objectif de l'étape).

## 5. Résultats

| Vérification | Résultat |
|---|---|
| Départ | 283 passés, 1 échec connu |
| **Backend complet** | **288 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) — +5 nouveaux tests |
| Facturation (module) | 50 passés |
| Paiement / Mouvement / Archive / Services en cours | 17 / 7 / 15 / 19 passés |
| Numérotation / Concurrence | 12 / 2 passés |
| Snapshots routes / permissions / formes d'API | 3 passés, fichiers inchangés (`factureNumero` identique) |
| Vitest | 40 passés, 32 snapshots de documents inchangés |
| Lint / Build | 0 erreur / OK |

## 6. Risques restants

- `PaiementTest` importe encore `DocumentCommercial` (helper de test) ; un test d'intégration peut le garder, mais il
  couple ce fichier au modèle.
- Couplages de **schéma** inchangés : règle `exists:documents_commerciaux,id` dans `PaiementController`, clé étrangère
  `paiements.document_id`, seeders de démonstration (`DB::table`).
- Le cache `numerosFactures` vit sur l'instance : un paiement dont `document_id` change dans la même instance garde la clé
  de l'ancien document (sans effet : les réponses sont construites sur `fresh()`).
- Paiements appelle toujours `ServiceEnCours::assurerServicesPourTiers` en direct (hors périmètre Facturation).
- `routes/api.php` inclut encore `routes.php` du module ; le frontend Facturation n'est pas traité.

## 7. À traiter à l'étape suivante

Au choix : remplacer la règle `exists:documents_commerciaux,id` par une validation via contrat (ex. `FactureReference`
étendu — décision métier : même message d'erreur 422) ; faire passer Paiements → Services en cours par
`AssureServicesEnCours` ; frontend Facturation (constantes `api/facturation.js`) ; migrations / seeders du module.
