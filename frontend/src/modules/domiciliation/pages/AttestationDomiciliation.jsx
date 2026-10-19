import { useParams } from 'react-router-dom'
import DocumentDomiciliationEditable from '../documents/DocumentDomiciliationEditable.jsx'
import {
  attestationParDefaut, construireHtmlAttestation, imprimerAttestationPdf, lireContenuAttestation,
} from '../documents/attestation.js'
import { chargerClientRepresentant } from '../documents/civilite.js'

const CONFIG = {
  titre: 'Attestation de domiciliation',
  nom: "l'attestation",
  pages: 1,
  charger: chargerClientRepresentant, // fiche client : civilité « Mr » / « Mme »
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
