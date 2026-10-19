// Point d'entrée PUBLIC du module Domiciliation (frontend). Les autres modules et pages (App, Parties, Dashboard, Topbar,
// Archive, Paramètres…) n'importent que d'ici, jamais les fichiers internes du module. N'est exposé que ce que l'extérieur
// consomme réellement.

// Pages (routes de App.jsx, et page des centres embarquée dans Paramètres)
export { default as DomiciliationList } from './pages/DomiciliationList.jsx'
export { default as DomiciliationForm } from './pages/DomiciliationForm.jsx'
export { default as DomiciliationDetails } from './pages/DomiciliationDetails.jsx'
export { default as DomiciliationCalendar } from './pages/DomiciliationCalendar.jsx'
export { default as DomiciliationCentres } from './pages/DomiciliationCentres.jsx'
export { default as CentreDomiciliationDetails } from './pages/CentreDomiciliationDetails.jsx'
export { default as AttestationDomiciliation } from './pages/AttestationDomiciliation.jsx'
export { default as ContratDomiciliation } from './pages/ContratDomiciliation.jsx'
export { default as ProcurationDomiciliation } from './pages/ProcurationDomiciliation.jsx'

// Composants réutilisés par la fiche entreprise (Parties)
export { default as StatutDomiciliation } from './components/StatutDomiciliation.jsx'
export { FormulaireRenouvellement, MenuImprimer } from './components/DomiciliationActions.jsx'

// API
export {
  listDomiciliations, createDomiciliation, archiveDomiciliation, corbeilleDomiciliation, restoreDomiciliation,
  renouvelerDomiciliation, deleteDomiciliationForever,
} from './api/domiciliations.js'
export { listCentres, listAllCentres, corbeilleCentre, restoreCentre, deleteCentre } from './api/centres.js'

// Fonctions utilitaires consommées à l'extérieur
export { chargerSignatureDomiciliation } from './documents/documentsDomiciliation.js'
export { calculerDateFin, calculerPrixTotal, classerNouveauRenouveler, domiciliationSaisie } from './utils/domiciliation.js'
// Périodes d'analyse partagées avec le tableau de bord (Expense Ratio) : une seule définition de la fenêtre de temps.
export { MOIS, PERIODES, casesDeLaPeriode, cleDeDate } from './utils/periodeAnalyse.js'
