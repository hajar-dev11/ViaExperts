# Domiciliation — Étape 20 : modularisation du frontend

Tag de départ : `pre-domiciliation-etape20` (= `8985d1a`). Tag d'arrivée : `post-domiciliation-etape20`.
Frontend uniquement : aucun fichier backend modifié ; URLs, routes React, permissions, appels d'API (URL, méthode, payload), HTML / PDF des documents et les 32 snapshots HTML inchangés
(le fichier `.snap` n'est pas modifié ; les 35 tests de snapshots passent à l'identique).

## 1. Audit initial

20 fichiers Domiciliation dispersés dans `api/`, `pages/`, `components/`, `utils/` + `modules/domiciliation/` (impression de la facture, étape 15).

Imports **entrants** depuis l'extérieur (graphe d'imports de `src/`, avant déplacement) :

| Consommateur | Importait |
|---|---|
| `App.jsx` | les 10 pages Domiciliation |
| `components/BlocsEntreprise.jsx` (fiche entreprise, Parties) | `StatutDomiciliation`, `FormulaireRenouvellement`, `MenuImprimer`, 4 fonctions de `api/domiciliations` |
| `components/Topbar.jsx`, `pages/Dashboard.jsx` | `listDomiciliations` |
| `pages/Archive.jsx` | 4 fonctions de `api/domiciliations` |
| `pages/ClientDetails.jsx`, `pages/EntrepriseDetails.jsx` | `listDomiciliations`, `chargerSignatureDomiciliation` (via le fichier historique `utils/factureDomiciliation.js`) |
| `pages/EntrepriseForm.jsx` | `listCentres`, `createDomiciliation`, `calculerDateFin` |
| `pages/Parametres.jsx` | page `DomiciliationCentres` (onglet Centres) |
| `modules/facturation`, `Paiements`, `Mouvement` | **aucun** (`aujourdhui` extrait à l'étape 17) |
| tests | `documents.snapshot`, `domiciliation-frontend`, `compatibilite-imports` |

Imports **sortants** du code Domiciliation : composants UI et `api/http`, `api/entreprises` et `api/clients` (Parties), `api/services` (prix du service), `api/settings` et `utils/print/identite` (Paramètres / identité),
`utils/format`, `shared/*`, et `modules/facturation/index.js` (facture de domiciliation) : tous **partagés ou à sens unique**. Aucun cycle.

## 2. Structure avant → après

```
src/modules/domiciliation/
├── index.js                       (entrée PUBLIQUE : 23 exports)
├── api/            domiciliations.js, centres.js
├── pages/          DomiciliationList, DomiciliationForm, DomiciliationDetails, DomiciliationStatuts, DomiciliationCalendar,
│                   DomiciliationCentres, CentreDomiciliationDetails, AttestationDomiciliation, ContratDomiciliation, ProcurationDomiciliation
├── components/     DomiciliationActions.jsx, StatutDomiciliation.jsx
├── documents/      DocumentDomiciliationEditable.jsx, attestation.js, contrat.js, procuration.js, documentsDomiciliation.js
├── print/          factureDomiciliation.js     (étape 15, inchangé)
└── utils/          domiciliation.js            (calculerDateFin, classerNouveauRenouveler, chargerPrixServiceDomiciliation)
```

Décision : le dossier `utils/` du module ne contient qu'un fichier, mais il porte des fonctions propres au calcul des périodes (non partagées) ; le fusionner dans `documents/` ou à la racine aurait mélangé deux responsabilités.

## 3. Fichiers déplacés (`git mv`, historique conservé : 20)

`api/{domiciliations,centres}.js`, 10 pages, `components/{DomiciliationActions,StatutDomiciliation,DocumentDomiciliationEditable}.jsx`, `utils/{attestation,contrat,procuration,documentsDomiciliation,domiciliation}.js`.
Contenu inchangé : seuls les chemins relatifs d'import ont été recalculés par script. **Un seul** import modifié « de fond » : `documentsDomiciliation.js` importait la facture de domiciliation par `modules/domiciliation/index.js`
(devenu cyclique) ; il importe maintenant `../print/factureDomiciliation.js`.

**Supprimé** : `utils/factureDomiciliation.js` (ré-export historique : ses deux consommateurs passent par l'index). **Aucun stub conservé** (test dédié).

## 4. Restés hors du module (partagés ou d'un autre domaine)

`shared/utils/date.js`, `shared/constants/documents.js`, `utils/print/{commun,identite,ouvrirPdf}.js`, `utils/pdfDocument.js`, `exporters.js`, `montantEnLettres.js`, `format.js`, `api/settings.js` (réglages du Centre, Paramètres),
`api/{entreprises,clients,services}.js` (Parties / Services), composants UI génériques, `navConfig.js`, `BlocsEntreprise.jsx` (Parties).

## 5. Point d'entrée public (`index.js`) et consommateurs migrés

Exposé (uniquement ce que l'extérieur consomme) : les 10 pages, `StatutDomiciliation`, `FormulaireRenouvellement`, `MenuImprimer`, 7 fonctions d'API Domiciliation (`listDomiciliations`, `createDomiciliation`, `archive…`, `corbeille…`, `restore…`,
`renouveler…`, `deleteDomiciliationForever`), `listCentres`, `chargerSignatureDomiciliation`, `calculerDateFin`. Non exposé : le reste de `api/domiciliations`, `classerNouveauRenouveler`, les générateurs de documents, la facture de domiciliation
(plus consommée hors module ; les tests importent le fichier directement).

Consommateurs migrés vers `modules/domiciliation/index.js` : `App`, `BlocsEntreprise`, `Topbar`, `Dashboard`, `Archive`, `ClientDetails`, `EntrepriseDetails`, `EntrepriseForm`, `Parametres` (9 fichiers, **liste verrouillée par test**).
Aucun autre module (Facturation, Paiements, Mouvement) n'importe Domiciliation. `api/settings.js` (Paramètres) reste importé par ClientDetails / EntrepriseDetails / DomiciliationForm.

## 6. Routes React et documents

`App.jsx` : les 10 imports de pages deviennent un import du module ; les 11 routes `/domiciliation…` (chemins, `key`, ordre, éléments) sont **inchangées** (test de caractérisation existant, passe sans modification). `navConfig` et les permissions
ne sont pas touchés. Documents : `attestation`, `contrat`, `procuration`, facture de domiciliation produisent le même HTML (32 snapshots inchangés ; horloge figée depuis l'étape 17).

## 7. Tests

Réécrits (imports uniquement) : `documents.snapshot`, `domiciliation-frontend`, `compatibilite-imports`. Ajoutés (`domiciliation-frontend.test.js`, +10) : pages, API, composants, documents et print dans le module ; **anciens fichiers disparus** (11 chemins) ; éléments partagés toujours
dans `shared` / utils communs ; **tout import relatif de `src/` résout** (aucun import vers un ancien chemin) ; consommateurs externes exacts et **seulement via `index.js`** ; contenu exact de l'index ; le module n'importe aucune page d'un autre domaine ni son propre index ;
la facture de domiciliation n'importe Facturation que par `modules/facturation/index.js` et est rendue par son modèle Facture. Les tests existants de frontières (aucun cycle ; `shared/` sans dépendance vers un module ; seul `index.js` importé hors module, pour Facturation / Paiements / Domiciliation) couvrent le reste.

**Mutations vérifiées** (restaurées) : import d'un fichier interne du module depuis `App.jsx` → 2 échecs ; recréation de `utils/factureDomiciliation.js` → 1 échec ; `shared/utils/date.js` important Domiciliation → 3 échecs (dont la détection d'un **cycle**).

## 8. Résultats

| Vérification | Départ (`8985d1a`) | Après |
|---|---|---|
| Vitest | 71 passés | **81 passés** (+10) |
| Instantanés HTML | 32 | **32, `.snap` inchangé** (35 tests de snapshots passent) |
| Lint | 0 erreur, 45 avertissements | 0 erreur, 45 avertissements |
| Build | OK | OK |
| Cycles d'imports / imports cassés | aucun | aucun (faux positif connu du script : `components/ui/index.js`) |
| Backend complet | 378 passés, 1 échec connu | **378 passés, 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) ; aucun fichier backend modifié |
| Serveur de développement | — | après rechargement complet : l'application se charge (page de connexion), tous les fichiers du module répondent en 200, les anciens chemins ne sont plus servis comme modules, l'index s'importe avec ses 23 exports ; seules erreurs : 401 avant connexion |

Limite : les pages n'ont pas été rendues après connexion dans le navigateur (le seul compte administrateur du jeu de données est le compte réel de l'utilisatrice) ; couverture : snapshots HTML, tests de routes et de frontières, build, chargement des modules.

## 9. Dépendances restantes

- Domiciliation → Facturation (facture de domiciliation) par l'index public ; Domiciliation → Parties (`api/entreprises`, `api/clients`), Services (`api/services`), Paramètres (`api/settings`, `utils/print/identite`) : sens autorisés.
- Parties (`BlocsEntreprise`, `EntrepriseForm`, `ClientDetails`, `EntrepriseDetails`), `Dashboard`, `Topbar`, `Archive`, `Parametres` → Domiciliation par l'index.
- `pages/DomiciliationList.jsx` contient un ré-export historique de `StatutDomiciliation` (non utilisé hors module) : non modifié.
- Backend : inchangé (`modules` Domiciliation backend en place depuis l'étape 18).

## 10. Décisions d'architecture

Index explicite (liste de noms, pas de `export *`) ; documents regroupés ; aucun stub ; l'index n'est jamais importé depuis l'intérieur du module (test) pour éviter les cycles.
