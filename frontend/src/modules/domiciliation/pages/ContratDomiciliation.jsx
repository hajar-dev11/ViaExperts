import { useParams } from 'react-router-dom'
import DocumentDomiciliationEditable from '../documents/DocumentDomiciliationEditable.jsx'
import {
  contratParDefaut, construireHtmlContrat, imprimerContratPdf, lireContenuContrat,
} from '../documents/contrat.js'

const CONFIG = {
  titre: 'Contrat de domiciliation',
  nom: 'le contrat',
  pages: 3,
  parDefaut: contratParDefaut,
  construire: construireHtmlContrat,
  lireContenu: lireContenuContrat,
  imprimer: imprimerContratPdf,
}

/** « Contrat de domiciliation » : aperçu, « Modifier » (tout le texte), puis PDF (3 pages). */
export default function ContratDomiciliation() {
  const { id } = useParams()
  // key : changer de domiciliation repart d'un document neuf (aucune modification ne se transmet).
  return <DocumentDomiciliationEditable key={id} config={CONFIG} />
}
