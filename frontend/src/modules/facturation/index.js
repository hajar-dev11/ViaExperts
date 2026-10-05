// Point d'entrée PUBLIC du module Facturation (frontend). Les autres modules (Paiements, Mouvement, Archive, App…)
// n'importent que d'ici, jamais les fichiers internes du module.
export * from './api/facturation.js'
export { default as DocumentList, imprimerDocument } from './pages/DocumentList.jsx'
export { default as DocumentForm } from './pages/DocumentForm.jsx'
export { construireHtmlDocumentCommercial, imprimerDocumentCommercial } from './print/documentCommercial.js'