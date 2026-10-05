# Facturation — Étape 15 : éclatement de la façade mixte `documentPrint.js`

Tag de départ : `pre-facturation-etape15` (= `9f9e7dd`). Tag d'arrivée : `post-facturation-etape15`.
Frontend uniquement. Le HTML / CSS généré, les signatures, les paramètres, les valeurs de retour, les options d'impression, les
URLs, le backend, la base et les routes sont inchangés : les 32 snapshots HTML sont identiques, le fichier `.snap` n'a pas été
modifié.

> Emplacement : ce document est dans `docs/migration-modular-monolith/` comme les étapes précédentes (la consigne indiquait `docs/`).

## 1. État initial de `utils/documentPrint.js`

Une façade de 12 noms qui mélangeait quatre responsabilités : ré-exports de blocs partagés, rendu des documents commerciaux
(déjà dans le module Facturation depuis l'étape 14), conversion et impression de la facture de domiciliation, reçus de
paiement (HTML imprimable et PDF A4 / A5, avec ses constantes `FORMATS_RECU`, `CSS_RECU`, `dhMajuscule`).

## 2. Classification (audit avant modification)

| Fonction | Domaine | Consommateurs avant | Destination | Risque |
|---|---|---|---|---|
| `formatDateFr` | **D. Partagé** (`utils/print/commun.js`) | `attestation`, `contrat`, `procuration` (+ reçus, domiciliation, tests) | reste partagé ; consommateurs pointent la vraie source | faible |
| `chargerIdentite`, `chargerIdentitePdf` | **D. Partagé** (`utils/print/identite.js`) | `DocumentDomiciliationEditable` (+ reçus, domiciliation) | reste partagé | faible |
| `ouvrirPdfApresClic` | **D. Partagé** (`utils/print/ouvrirPdf.js`) | `attestation`, `contrat`, `procuration` (+ reçus, domiciliation) | reste partagé | faible |
| `construireHtmlDocumentCommercial`, `imprimerDocumentCommercial` | **A. Facturation** (déjà `modules/facturation/print/` depuis l'étape 14) | `DocumentList` (module), tests, façade | reste au module ; ex-ré-export de la façade supprimé | nul |
| `domiciliationEnFacture`, `imprimerFactureDomiciliationPdf` | **C. Domiciliation** (réutilise le modèle Facture) | `utils/documentsDomiciliation.js` | `modules/domiciliation/print/factureDomiciliation.js` | faible : dépend de Facturation (sens unique) |
| `construireHtmlRecuPaiement`, `imprimerRecuPaiement`, `construireHtmlRecuPdf`, `imprimerRecuPaiementPdf` | **B. Paiements** | `PaiementList` (2), `Mouvement` (1), snapshots | `modules/paiements/print/recuPaiement.js` | faible |
| (aucune) | **E. Legacy / façade seule** | — | façade supprimée | — |

Utilitaires non déplacés (partagés, sans preuve de propriétaire unique) : `utils/print/commun.js`, `identite.js`,
`ouvrirPdf.js`, `utils/pdfDocument.js`, `exporters.js`, `montantEnLettres.js`, `format.js`.

## 3. Ce qui a été fait

- **Paiements** : `modules/paiements/print/recuPaiement.js` (les 4 fonctions + constantes internes, copiées **telles quelles**) et
  `modules/paiements/index.js` (point d'entrée). Choix : le module Paiements n'existe pas encore (pages dans `src/pages/`) ; on
  crée seulement le dossier `print/` et l'`index.js`, sans déplacer les pages, pour séparer la responsabilité sans architecture
  artificielle.
- **Domiciliation** : `modules/domiciliation/print/factureDomiciliation.js` (les 2 fonctions, copiées telles quelles) et
  `modules/domiciliation/index.js`. Même logique minimale ; pages, contrat, attestation et procuration **restent** dans
  `pages/` et `utils/` (non déplacés, hors périmètre).
- **Facturation** : rien à déplacer (le rendu était déjà dans le module). La facture de domiciliation l'appelle par le point
  d'entrée public du module Facturation.
- **Consommateurs mis à jour** (imports uniquement) : `PaiementList`, `Mouvement` → `modules/paiements/index.js` ;
  `utils/documentsDomiciliation.js` → `modules/domiciliation/index.js` ; `attestation`, `contrat`, `procuration` →
  `utils/print/commun.js` + `utils/print/ouvrirPdf.js` ; `DocumentDomiciliationEditable` → `utils/print/identite.js`.

## 4. Compatibilité : fichiers supprimés

Plus aucun fichier de production n'importait ces trois fichiers (graphe d'imports de `src/` vérifié) ; seuls des tests les
référençaient :

| Supprimé | Raison |
|---|---|
| `utils/documentPrint.js` | façade mixte, 0 consommateur de production après le découpage |
| `utils/print/documentCommercial.js` | stub de l'étape 14, 0 consommateur |
| `api/facturation.js` | stub de l'étape 14, 0 consommateur (Archive, Mouvement, Paiements, Rapports passent par le module ou `shared`) |

Aucun stub restant. Les tests de compatibilité ont été **réécrits** (pas supprimés) pour vérifier les mêmes garanties à la
nouvelle place : les 12 noms de l'ancienne façade et les 11 noms de l'ancienne API existent, chacun dans **un seul** domaine ;
les points d'entrée ré-exportent les mêmes fonctions ; les anciens fichiers n'existent plus.

## 5. Dépendances et cycles

- Sens des dépendances : Domiciliation → Facturation (par `modules/facturation/index.js`) ; Paiements → partagé ;
  Facturation → partagé. Facturation n'importe ni Paiements ni Domiciliation.
- `shared/` et les utilitaires d'impression communs n'importent aucun module (testé).
- Hors d'un module, seul son `index.js` est importé (Facturation, Paiements, Domiciliation ; testé).
- Graphe d'imports de `src/` : **aucun cycle**, aucun import cassé (script d'analyse + test de cycles du dépôt).

## 6. Tests ajoutés / réécrits

`compatibilite-imports.test.js` (réécrit : 6 tests), `facturation-frontend.test.js` (garde-fous généralisés aux 3 modules :
seul `index.js` importé, `shared/` et utils d'impression communs sans dépendance vers un module, Facturation sans lien vers
Paiements / Domiciliation, absence de cycle), `documents.snapshot.test.js` (imports uniquement : les titres des `describe` / `it`
sont conservés, car ils forment les clés des instantanés).

## 7. Résultats

| Vérification | Départ | Après |
|---|---|---|
| Vitest | 57 passés | **58 passés** |
| Instantanés documents | 32 | **32, fichier `.snap` non modifié** |
| Lint | 0 erreur, 45 avertissements | 0 erreur, 45 avertissements |
| Build | OK | OK |
| Backend complet | 331 passés, 1 échec connu | 331 passés, 1 échec connu (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Serveur de développement | — | tous les nouveaux fichiers servis (200) ; anciens chemins absents ; points d'entrée importables dans le navigateur avec leurs exports ; aucune erreur JavaScript (seuls les 401 avant connexion) |

Limite : les pages n'ont pas été rendues après connexion dans le navigateur (le seul compte administrateur du jeu de données
est le compte réel de l'utilisatrice) ; la couverture repose sur les 32 instantanés HTML, les tests, le build et le chargement
des modules.

## 8. Risques restants

- Les modules `paiements` et `domiciliation` ne contiennent que l'impression ; leurs pages / autres documents sont encore dans
  `pages/` et `utils/` (`attestation.js`, `contrat.js`, `procuration.js`, `documentsDomiciliation.js`, `factureDomiciliation.js`,
  `domiciliation.js`), qui dépendent du module Domiciliation sans en faire partie.
- Domiciliation → Facturation est un couplage assumé (même modèle de facture).
- Les titres de `describe` des instantanés mentionnent encore « documentPrint.js » (volontaire : ils forment les clés).
- Pas de test de rendu des composants (environnement Node, sans jsdom, conformément à la consigne).

## 9. Prochaine étape possible

Constituer le vrai module Domiciliation en y regroupant `attestation`, `contrat`, `procuration`, `documentsDomiciliation` et les
pages ; puis le module Paiements (pages `Paiement*`) ; ou ajouter des tests de rendu de `DocumentList` / `DocumentForm` si le
projet accepte jsdom.
