# Via Experts — Gestion Cabinet Comptable (démo React)

Interface de gestion pour cabinet comptable / centre de domiciliation, reconstruite en **React** à partir de l'analyse fonctionnelle fournie : mêmes fonctionnalités et logo, design entièrement revu, et **aucune donnée réelle** — toutes les données (clients, entreprises, factures, etc.) sont fictives, générées pour la démonstration.

## Modules inclus

- Tableau de bord (KPIs, courbe de domiciliation, répartition, activité)
- Clients (liste + fiche d'ajout)
- Entreprises (liste + fiche d'ajout)
- Domiciliation (gestion/liste, nouvelle domiciliation, calendrier, centres)
- Chat interne
- Services (catalogue) et Services en cours
- Facturation : Factures, Devis, Bons de Livraison, Factures d'Avoir (liste + formulaire avec lignes de service)
- Paiement (liste + formulaire avec pièce jointe)
- Mouvement (entrées reçu / facturé)
- Déclaration TVA (nouvelle déclaration, liste, chiffre d'affaires)
- Rapports journaliers
- Les Cachets, Les Mails
- Data Center
- Archive / Corbeille
- Paramètres (compte, bureau, centre de domiciliation, services, cachet, mail, assistance)

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrez l'URL affichée (par défaut http://localhost:5173).

## Build de production

```bash
npm run build
npm run preview
```

Le dossier `dist/` généré est statique (routing en `HashRouter`) : il peut être déposé tel quel sur n'importe quel hébergement (y compris sans configuration serveur particulière).

## Stack technique

- React 19 + Vite
- React Router (HashRouter)
- Tailwind CSS v4
- Recharts (graphiques)
- lucide-react (icônes)

## Notes

- Toutes les données sont dans `src/data/mockData.js` : à remplacer par vos appels API / votre backend.
- Les formulaires sont fonctionnels côté interface (état local React) mais ne persistent pas encore — à brancher sur votre backend.
- Le logo « VIA EXPERTS » est recréé en SVG dans `src/components/Logo.jsx` (facilement modifiable : couleurs, texte, icône).
