import { API_URL, apiFetch, apiUpload } from './http.js'

export async function listEntreprises(status = 'actif') {
  const data = await apiFetch(`/api/v1/entreprises?status=${encodeURIComponent(status)}`)
  return data.data
}

export async function getEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}`)
  return data.data
}

export async function createEntreprise(payload) {
  const data = await apiFetch('/api/v1/entreprises', { method: 'POST', body: payload })
  return data.data
}

export async function updateEntreprise(id, payload) {
  const data = await apiFetch(`/api/v1/entreprises/${id}`, { method: 'PUT', body: payload })
  return data.data
}

export async function archiveEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/archive`, { method: 'POST' })
  return data.data
}

export async function corbeilleEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/corbeille`, { method: 'POST' })
  return data.data
}

export async function restoreEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/restore`, { method: 'POST' })
  return data.data
}

export async function deleteEntrepriseForever(id) {
  await apiFetch(`/api/v1/entreprises/${id}`, { method: 'DELETE' })
}

// --- Liste Noire / Bloquer ----------------------------------------------
// `situation` (« Normale » par défaut) est la même colonne que celle déjà
// affichée dans la liste ; les deux états sont mutuellement exclusifs.

export async function listeNoireEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/liste-noire`, { method: 'POST' })
  return data.data
}

export async function retirerListeNoireEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/liste-noire/retirer`, { method: 'POST' })
  return data.data
}

export async function bloquerEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/bloquer`, { method: 'POST' })
  return data.data
}

export async function debloquerEntreprise(id) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/debloquer`, { method: 'POST' })
  return data.data
}

// --- Bloc « Documents » de la fiche entreprise -------------------------------
// Chaque action renvoie la fiche entreprise rechargée : l'appelant n'a jamais à
// relancer un GET pour rafraîchir le tableau.

export async function addEntrepriseDocument(id, fichier, nom) {
  const form = new FormData()
  form.append('fichier', fichier)
  if (nom) form.append('nom', nom)
  const data = await apiUpload(`/api/v1/entreprises/${id}/documents`, form)
  return data.data
}

/** Le téléchargement passe par le navigateur : le cookie de session suit. */
export function entrepriseDocumentUrl(id, documentId) {
  return `${API_URL}/api/v1/entreprises/${id}/documents/${documentId}/download`
}

export async function archiveEntrepriseDocument(id, documentId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/documents/${documentId}/archive`, { method: 'POST' })
  return data.data
}

export async function corbeilleEntrepriseDocument(id, documentId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/documents/${documentId}/corbeille`, { method: 'POST' })
  return data.data
}

export async function restoreEntrepriseDocument(id, documentId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/documents/${documentId}/restore`, { method: 'POST' })
  return data.data
}

export async function deleteEntrepriseDocumentForever(id, documentId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/documents/${documentId}`, { method: 'DELETE' })
  return data.data
}

// --- Bloc « Observations » de la fiche entreprise ----------------------------

/**
 * Ajoute une observation.
 * `fichiers` : tableau de `File` (plusieurs pièces jointes possibles).
 * `privee` : l'observation n'est alors lisible que par son auteur et les
 * administrateurs — le filtrage est appliqué par le serveur, pas à l'affichage.
 *
 * Sans pièce jointe on reste en JSON ; dès qu'il y a un fichier, l'envoi
 * bascule en multipart, seule forme qui transporte des fichiers.
 */
export async function addEntrepriseObservation(id, contenu, { privee = false, fichiers = [] } = {}) {
  if (fichiers.length === 0) {
    const data = await apiFetch(`/api/v1/entreprises/${id}/observations`, {
      method: 'POST',
      body: { contenu, privee },
    })
    return data.data
  }

  const form = new FormData()
  form.append('contenu', contenu)
  form.append('privee', privee ? '1' : '0')
  fichiers.forEach((f) => form.append('fichiers[]', f))
  const data = await apiUpload(`/api/v1/entreprises/${id}/observations`, form)
  return data.data
}

/** Le téléchargement passe par le navigateur : le cookie de session suit. */
export function entrepriseObservationFichierUrl(id, observationId, fichierId) {
  return `${API_URL}/api/v1/entreprises/${id}/observations/${observationId}/fichiers/${fichierId}/download`
}

export async function archiveEntrepriseObservation(id, observationId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/observations/${observationId}/archive`, { method: 'POST' })
  return data.data
}

export async function corbeilleEntrepriseObservation(id, observationId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/observations/${observationId}/corbeille`, { method: 'POST' })
  return data.data
}

export async function restoreEntrepriseObservation(id, observationId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/observations/${observationId}/restore`, { method: 'POST' })
  return data.data
}

export async function deleteEntrepriseObservationForever(id, observationId) {
  const data = await apiFetch(`/api/v1/entreprises/${id}/observations/${observationId}`, { method: 'DELETE' })
  return data.data
}
