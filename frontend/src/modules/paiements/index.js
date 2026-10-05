// Point d'entrée PUBLIC du module Paiements (frontend) — pour l'instant limité à l'impression des reçus ; les pages
// Paiements restent dans `src/pages/` (module non encore structuré).
export {
  construireHtmlRecuPaiement, imprimerRecuPaiement, construireHtmlRecuPdf, imprimerRecuPaiementPdf,
} from './print/recuPaiement.js'