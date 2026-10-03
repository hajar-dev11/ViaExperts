import { useParams } from 'react-router-dom'
import DocumentDomiciliationEditable from '../components/DocumentDomiciliationEditable.jsx'
import {
  attestationParDefaut, construireHtmlAttestation, imprimerAttestationPdf, lireContenuAttestation,
} from '../utils/attestation.js'

const CONFIG = {
  titre: 'Attestation de domiciliation',
  nom: "l'attestation",
  pages: 1,
  parDefaut: attestationParDefaut,
  construire: construireHtmlAttestation,
  lireContenu: lireContenuAttestation,
  imprimer: imprimerAttestationPdf,
}

/** « Attestation de domiciliation » : aperçu, « Modifier » (tout le texte), puis PDF. */
export default function AttestationDomiciliation() {
  const { id } = useParams()
  // key : changer de domiciliation repart d'un document neuf (aucune modification ne se transmet).
  return <DocumentDomiciliationEditable key={id} config={CONFIG} />
}
