import { imprimerFactureDomiciliationPdf } from '../print/factureDomiciliation.js'

/**
 * Les quatre documents d'une domiciliation.
 *
 * Les cases cochées dans le formulaire (`doc_facture`, `doc_contrat`,
 * `doc_attestation`, `doc_procuration`) sont enregistrées sur la
 * domiciliation : ce sont elles qui décident des documents proposés par
 * « Imprimer ». Cocher une case ne génère donc pas un fichier stocké, elle
 * déclare que ce document fait partie du dossier et doit pouvoir être édité.
 */

/**
 * Facture de domiciliation : même modèle PDF et même design que la Facture du module
 * Facturation (logo, couleurs, tableau, signature/cachet selon « Ajouter Signature »),
 * ouverte en vrai PDF dans le lecteur du navigateur. Seul le contenu — celui de la
 * domiciliation — diffère. Le cachet vient des réglages de l'émetteur, comme sur la Facture.
 */
export function imprimerFactureDomiciliation(d) {
  return imprimerFactureDomiciliationPdf(d).catch(() => {
    window.alert("L'impression de la facture de domiciliation a échoué.")
  })
}

/**
 * Documents réellement disponibles pour une domiciliation : ceux dont la case
 * a été cochée à l'enregistrement. C'est cette liste que « Imprimer » propose.
 */
export const DOCUMENTS_DOMICILIATION = [
  { cle: 'facture', drapeau: 'docFacture', label: 'Facture de domiciliation', imprimer: imprimerFactureDomiciliation },
  // `editeur` : page de prévisualisation du document (aperçu → Modifier → PDF), sous /domiciliation/:id/<editeur>
  // — voir DocumentDomiciliationEditable.
  { cle: 'contrat', drapeau: 'docContrat', label: 'Contrat de domiciliation', editeur: 'contrat' },
  { cle: 'attestation', drapeau: 'docAttestation', label: 'Attestation de domiciliation', editeur: 'attestation' },
  { cle: 'procuration', drapeau: 'docProcuration', label: 'Procuration', editeur: 'procuration' },
]

export const documentsDisponibles = (d) => DOCUMENTS_DOMICILIATION.filter((doc) => d?.[doc.drapeau])

/**
 * Récupère le cachet configuré dans Paramètre > Centre Domiciliation.
 *
 * ⚠️ `GET /settings/domiciliation` est réservé à l'administrateur. Pour un
 * utilisateur non-admin l'appel répond 403 : on renvoie alors `null` et les
 * documents retombent sur la mention « Signature », sans casser l'impression.
 */
export async function chargerSignatureDomiciliation(getDomiciliationSettings) {
  try {
    const settings = await getDomiciliationSettings()
    return settings?.signature_path ?? null
  } catch {
    return null
  }
}
