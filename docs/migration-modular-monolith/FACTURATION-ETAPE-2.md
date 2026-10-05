# Facturation — étape 2 (service de numérotation + collision propre)

Tags Git : `post-facturation-etape1` (état avant) · `post-facturation-etape2` (état après).

## Logique extraite
`App\Services\NumerotationDocuments` (nouveau) reprend tel quel, depuis `DocumentCommercialController` :
- `reglages($emetteur)` : ligne de paramètres de l'émetteur (`cabinet_settings` / `domiciliation_settings`) ;
- `composer()` / `proposer($emetteur, $type)` : « préfixe + prochain numéro + suffixe » et responsable affiché ;
- `avancer($emetteur, $type, $numeroUtilise)` : `lockForUpdate()` sur la ligne de paramètres, incrément seulement si le
  numéro est celui proposé (un numéro saisi à la main ne déplace pas le compteur), compteur vide jamais incrémenté.
  La méthode ouvre elle-même une transaction (point de sauvegarde si l'appelant en a une) : le verrou n'est jamais inopérant ;
- `estCollisionNumero()` / `convertirCollision()` : traitement de l'erreur d'unicité.

`DocumentCommercialController` ne contient plus de logique de numérotation : il appelle le service.

## Collision sur l'index unique `documents_commerciaux_type_numero_unique`
Avant : deux créations simultanées avec le même numéro → la base refusait la seconde (jamais de doublon) mais l'API
répondait **HTTP 500**. Maintenant : `store()` et `update()` interceptent la `QueryException` (code 1062 + nom de l'index) et
renvoient une `ValidationException` sur le champ `numero` → **HTTP 422**, avec le même message que la vérification d'unicité
habituelle (« Ce numéro est déjà utilisé par un document du même type. »). La transaction est annulée : ni document, ni
doublon, ni avancement du compteur. Les autres erreurs SQL sont relancées inchangées.

## Tests
- `NumerotationDocumentsTest` (12) : numéro proposé par type / émetteur, responsable, avancement du compteur (numéro proposé,
  numéro manuel, compteur vide, indépendance des émetteurs), rollback compteur + document, collision en base → 422 sans doublon
  ni compteur perdu (création et modification), réponse identique à la validation d'unicité, reconnaissance des erreurs SQL.
- `NumerotationConcurrenceTest` (2, vrais processus PHP) : 6 processus simultanés — un seul gagnant, les autres 422 (jamais 500) ;
  puis charge avec réessais : 12 documents créés, numéros consécutifs, compteur sans perte.

## Non modifié
Routes, permissions, URLs, réponses des cas normaux, PDF, migrations, base de données, Paiements / Mouvements / Domiciliation.
