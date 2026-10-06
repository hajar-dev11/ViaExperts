import { useParams } from 'react-router-dom'
import DocumentDomiciliationEditable from '../documents/DocumentDomiciliationEditable.jsx'
import {
  chargerClientProcuration, procurationParDefaut, construireHtmlProcuration, imprimerProcurationPdf, lireContenuProcuration,
} from '../documents/procuration.js'

const CONFIG = {
  titre: 'Procuration',
  nom: 'la procuration',
  pages: 1,
  sansSignature: true, // la procuration n'a ni signature ni cachet
  charger: chargerClientProcuration,
  parDefaut: procurationParDefaut,
  construire: construireHtmlProcuration,
  lireContenu: lireContenuProcuration,
  imprimer: imprimerProcurationPdf,
}

/** « Procuration » : aperçu, « Modifier » (tout le texte), puis PDF. */
export default function ProcurationDomiciliation() {
  const { id } = useParams()
  // key : changer de domiciliation repart d'un document neuf (aucune modification ne se transmet).
  return <DocumentDomiciliationEditable key={id} config={CONFIG} />
}
