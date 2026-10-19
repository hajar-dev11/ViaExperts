import { apiFetch, apiUpload } from './http.js'

// « Importateur de TVA » : lignes lues dans un fichier Excel / CSV, ajoutées à une Déclaration TVA.
//   cible : { type: 'existante', declaration_id } | { type: 'nouvelle', entreprise_id, client_if, identifiant_paiement,
//             periode_type, periode_valeur, annee, regime }
//   lignes : [{ ligne, ordre_ref, fact_num, designation, ht, tva, ttc, identifiant_fiscal, libelle_fournisseur, ice, taux,
//             id_paie, date_paie, date_fac }]  (valeurs brutes du fichier ; le serveur normalise et revérifie TOUT)
const base = '/api/v1/importateur-tva'

/**
 * Photo ou PDF d'une déclaration TVA : le serveur CONTRÔLE le contenu réel du fichier (format, taille, dimensions, structure du
 * PDF). Il n'extrait rien et ne crée rien : l'analyse du texte (OCR) se fait dans le navigateur, et la déclaration n'est
 * enregistrée qu'après vérification par l'utilisateur, par la route habituelle de la Déclaration TVA.
 */
export async function envoyerImageDeclaration(fichier) {
  const form = new FormData()
  form.append('fichier', fichier)
  return apiUpload(`${base}/image`, form)
}

/** Analyse seulement : aucune écriture en base. */
export async function apercuImport(cible, lignes) {
  return apiFetch(`${base}/apercu`, { method: 'POST', body: { cible, lignes } })
}

/** Enregistre (après confirmation) : une seule transaction, tout ou rien. */
export async function importerLignes(cible, lignes, { ignorerRejetees = false } = {}) {
  return apiFetch(`${base}/importer`, { method: 'POST', body: { cible, lignes, ignorer_rejetees: ignorerRejetees } })
}
