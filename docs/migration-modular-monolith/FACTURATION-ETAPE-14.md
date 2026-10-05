# Facturation — Étape 14 : modularisation du frontend

Tag de départ : `pre-facturation-etape14` (= `dbe0704`). Tag d'arrivée : `post-facturation-etape14`.
Frontend uniquement. Aucun backend, URL, route React, libellé, permission, PDF, format de document ni comportement
d'impression modifié ; les 32 snapshots de documents sont inchangés.

## 1. Audit frontend initial

Le frontend n'avait **aucun dossier Facturation** : le module se résumait à 4 fichiers dispersés et à 12 routes d'`App.jsx`.

| Fichier | Rôle | Consommateurs (analyse du graphe d'imports) | Verdict |
|---|---|---|---|
| `components/DocumentList.jsx` | page « Liste des … » (4 types) | `App.jsx` ; `pages/Mouvement.jsx` (importe l'export `imprimerDocument`) | **Facturation** → module |
| `components/DocumentForm.jsx` | page « Ajouter … / Modifier … » | `App.jsx` seulement | **Facturation** → module |
| `api/facturation.js` | appels `/api/v1/facturation/{type}` + ré-export des constantes | `DocumentForm`, `DocumentList`, `Archive`, `Mouvement` (fonctions) ; `PaiementForm/Gestion/List`, `Rapports` (**constantes seulement**) ; test de compatibilité | **Facturation** → module (constantes : partagées) |
| `utils/print/documentCommercial.js` | rendu HTML/PDF des 4 types de documents | `utils/documentPrint.js` (façade) + test | **Facturation** → module |
| `shared/constants/documents.js` | `EMETTEURS`, `MODES_PAIEMENT` | `api/facturation.js` (ré-export), test | **partagé** : reste |
| `utils/documentPrint.js` | façade de 12 noms : documents commerciaux **+ reçu de paiement + conversion Domiciliation → facture** | `DocumentList`, `Mouvement`, `PaiementList`, `DocumentDomiciliationEditable`, `attestation`, `contrat`, `procuration`, `documentsDomiciliation` | **partagé / mixte** : reste, **non déplacé** |
| `utils/print/commun.js`, `identite.js`, `ouvrirPdf.js` | blocs communs (formats, identité cabinet, ouverture PDF) | `documentPrint`, rendu des documents | **partagé** : restent |
| `utils/pdfDocument.js`, `montantEnLettres.js`, `exporters.js`, `format.js` | PDF, montant en lettres, exports, formats | Domiciliation, Paiements, Entreprises, etc. | **partagés** : restent |
| `components/navConfig.js` | menu ; groupe « Facturation » (liens `/facturation/...`) | `Sidebar` | **partagé** : inchangé (n'importe rien de Facturation) |
| `utils/factureDomiciliation.js`, `documentsDomiciliation.js` | factures de Domiciliation (réutilisent le rendu Facture via `documentPrint`) | `ClientDetails`, `EntrepriseDetails` | **Domiciliation** : restent |

Constantes : `api/facturation.js` ne portait que `EMETTEURS` / `MODES_PAIEMENT` (déjà dans `shared/constants/documents.js`,
partagées avec Paiements et Rapports). Aucune constante propre à Facturation à extraire (les libellés `NUMERO_PLACEHOLDER`,
`TABS`… sont locaux aux pages) → **pas de dossier `constants/` créé** (consigne : ne pas forcer la structure).
Tests existants concernés : `documents.snapshot.test.js` (32 snapshots), `compatibilite-imports.test.js`. Imports circulaires
avant : aucun.

## 2. Structure avant / après

```
Avant                                         Après
src/api/facturation.js                        src/modules/facturation/
src/components/DocumentList.jsx                ├── index.js                    (point d'entrée PUBLIC)
src/components/DocumentForm.jsx                ├── api/facturation.js
src/utils/print/documentCommercial.js          ├── pages/DocumentList.jsx
                                               ├── pages/DocumentForm.jsx
                                               └── print/documentCommercial.js
                                              src/api/facturation.js                      (stub de compatibilité)
                                              src/utils/print/documentCommercial.js       (stub de compatibilité)
```

## 3. Fichiers déplacés (`git mv`, historique conservé)

`api/facturation.js` → `modules/facturation/api/` ; `components/DocumentList.jsx` et `DocumentForm.jsx` →
`modules/facturation/pages/` ; `utils/print/documentCommercial.js` → `modules/facturation/print/`. Contenu **inchangé** hormis
les chemins relatifs d'import, recalculés par script (aucune ligne de logique ni de JSX modifiée), plus un seul import
interne : `DocumentList` importe `imprimerDocumentCommercial` depuis `../print/documentCommercial.js` au lieu de la
façade `documentPrint.js` (c'est **la même fonction** : la façade la ré-exporte ; vérifié par un test d'identité).

## 4. Fichiers créés / modifiés

Créés : `modules/facturation/index.js`, les deux stubs de compatibilité, `src/__tests__/facturation-frontend.test.js`, ce document.
Modifiés (imports uniquement) : `App.jsx` (importe `DocumentList`, `DocumentForm` depuis le module), `pages/Mouvement.jsx` et
`pages/Archive.jsx` (importent l'API / `imprimerDocument` depuis le module), `pages/PaiementForm.jsx`, `PaiementGestion.jsx`,
`PaiementList.jsx`, `Rapports.jsx` (importent `EMETTEURS` / `MODES_PAIEMENT` depuis `shared/constants/documents.js`, leur vraie
source, au lieu de passer par l'API Facturation — mêmes objets).

## 5. Point d'entrée public et compatibilité

`modules/facturation/index.js` : API (`listDocuments`, `getDocument`, `getNumeroPropose`, `createDocument`, `updateDocument`,
`archiveDocument`, `corbeilleDocument`, `restoreDocument`, `deleteDocumentForever`, `EMETTEURS`, `MODES_PAIEMENT`), pages
(`DocumentList`, `imprimerDocument`, `DocumentForm`) et rendu (`construireHtmlDocumentCommercial`, `imprimerDocumentCommercial`).
Hors du module, **seul `index.js`** est importé (garde-fou testé).

Stubs (ré-exports sans logique, `export * from …`) : `api/facturation.js` et `utils/print/documentCommercial.js`. Ils servent à
`documentPrint.js` (qui reste inchangé), au test `compatibilite-imports.test.js` et à tout import hérité ; ils exportent
**exactement les mêmes objets** (test d'identité). À supprimer quand plus personne ne les importe.

## 6. Routes React et navigation

Inchangées : les 12 routes `/facturation/...` gardent leurs URLs, leur ordre, leurs `key` distinctes et leurs props (`type`,
`title`, `addTo`, `addLabel`, `editBase`, `dateLabel`, `secondDateLabel`, `listTo`) ; seul l'`import` d'`App.jsx` change.
`RequireAuth`, `Layout`, les permissions côté API et `navConfig.js` (libellés, liens, ordre) ne sont pas touchés.

## 7. Impression / documents

Le rendu des 4 types de documents rejoint le module ; `documentPrint.js` **reste** (il contient aussi le reçu de paiement et
`domiciliationEnFacture`, qui ne sont pas de Facturation) et ré-exporte les mêmes 12 noms. Les 32 snapshots HTML (facture, devis,
bon de livraison, avoir, facture de domiciliation, reçus…) passent **sans modification**.

## 8. Tests

`facturation-frontend.test.js` (17 tests). Écrit en deux temps : **9 tests de caractérisation exécutés avant tout
déplacement** (URL, méthode et corps de chaque appel d'API avec `apiFetch` simulé ; 12 routes, `key`, props ; menu
Facturation ; pages chargeables avec leurs exports), puis ajoutés après : point d'entrée, identité des ré-exports (ancien
`api/facturation.js`, ancien `print/documentCommercial.js`, façade `documentPrint`), constantes uniques, et **garde-fous
d'architecture** par analyse statique de `src/` : seul `index.js` importé hors du module, plus d'import des constantes via
l'API Facturation depuis Paiements / Rapports, le module n'importe aucune page d'un autre domaine, **aucun cycle d'imports**.

## 9. Résultats

| Vérification | Départ | Après |
|---|---|---|
| Vitest | 40 passés | **57 passés** (+17) ; 32 snapshots de documents inchangés (aucun fichier `.snap` modifié) |
| Lint | 0 erreur, 45 avertissements | 0 erreur, 45 avertissements |
| Build | OK | OK |
| Cycles d'imports | aucun | aucun |
| Imports cassés | aucun | aucun |
| Backend complet | 331 passés, 1 échec connu | **331 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) |
| Serveur de développement | — | tous les fichiers déplacés et leurs stubs servis en HTTP 200 ; l'application charge (page de connexion) et le point d'entrée du module s'importe dans le navigateur avec ses 16 exports ; aucune erreur JavaScript (seuls les 401 de `/auth/me` avant connexion) |

Limite : la vérification visuelle des pages après **connexion** n'a pas été faite dans le navigateur (le seul compte
administrateur du jeu de données est le compte réel de l'utilisatrice) ; elle est couverte par les tests, le build et le chargement
des modules.

## 10. Risques restants

- Deux stubs de compatibilité à supprimer plus tard (`api/facturation.js`, `utils/print/documentCommercial.js`).
- `utils/documentPrint.js` reste une façade **mixte** (Facturation + Paiements + Domiciliation) qui dépend du module Facturation :
  à scinder dans une étape dédiée.
- `DocumentList`/`DocumentForm` utilisent encore des composants / API partagés (`Field`, `ListToolbar`, `api/clients`,
  `api/entreprises`, `api/services`) : dépendances normales vers le noyau, non encapsulées.
- Pas de rendu de composants dans les tests (environnement Node, pas de jsdom) : les pages sont vérifiées par chargement,
  routes et analyse statique, pas par rendu.
- `Mouvement` appelle `getDocument` + `imprimerDocument` du module pour réimprimer une facture (couplage assumé via le point d'entrée).

## 11. Recommandation pour l'étape 15

Scinder `documentPrint.js` : déplacer le reçu de paiement (`imprimerRecuPaiement*`) vers un futur module Paiements et la conversion
`domiciliationEnFacture` vers Domiciliation, ne laissant dans `utils` que l'API commune ; puis supprimer les deux stubs. En
alternative plus légère : ajouter un petit test de rendu (jsdom) pour `DocumentList` / `DocumentForm` avant d'aller plus loin.
