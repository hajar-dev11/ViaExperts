# Facturation — étape 1 (préparation, sans changement de comportement)

Tags Git : `pre-facturation-etape1` (avant) · `post-facturation-etape1` (après).

## Changements

1. **Test de concurrence du compteur de numérotation** — `backend/tests/Feature/NumerotationConcurrenceTest.php`
   + processus enfant `backend/tests/Support/creer_document_en_parallele.php`.
   6 processus PHP réels créent une facture au même instant avec le numéro « proposé ». Vérifie : aucun numéro en double,
   compteur avancé d'exactement le nombre de documents créés. Données nettoyées à la fin (base `via_expert_app_test`).
   **Constat (comportement actuel, non modifié)** : sur 6 créations simultanées, 1 réussit (201) et 5 échouent en **HTTP 500**
   (violation de l'index unique `documents_commerciaux_type_numero_unique`), au lieu d'une erreur de validation 422.
   Aucun doublon n'est jamais écrit : l'intégrité est garantie par la base.
2. **Constantes `EMETTEURS` et `MODES_PAIEMENT`** déplacées vers `frontend/src/shared/constants/documents.js` ;
   `frontend/src/api/facturation.js` les ré-exporte (tous les imports existants fonctionnent sans changement).
3. **Découpage interne de `frontend/src/utils/documentPrint.js`** : blocs copiés tels quels dans `frontend/src/utils/print/`
   (`commun.js`, `identite.js`, `ouvrirPdf.js`, `documentCommercial.js`). `documentPrint.js` reste le point d'entrée et
   ré-exporte les mêmes noms. Le HTML produit est strictement identique (instantanés Vitest inchangés).
4. **Test de compatibilité des imports** — `frontend/src/__tests__/compatibilite-imports.test.js` : les API publiques de
   `documentPrint.js`, `api/facturation.js` et des nouveaux fichiers ne doivent pas changer.

## Non modifié
Routes, permissions, tables, migrations, contrôleurs, modèles, requêtes, ressources, modules Paiements / Mouvements /
Domiciliation.
