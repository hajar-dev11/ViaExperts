// Point d'entrée PUBLIC du module Domiciliation (frontend) — pour l'instant limité à la facture de domiciliation ; les
// pages et autres documents (contrat, attestation, procuration) restent dans `src/pages/` et `src/utils/`.
export { domiciliationEnFacture, imprimerFactureDomiciliationPdf } from './print/factureDomiciliation.js'