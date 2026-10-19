import { apiFetch, apiUpload } from './http.js'

const unwrap = (res) => res?.data ?? res

export async function listServicesEnCours(status = 'actif') {
  return unwrap(await apiFetch(`/api/v1/services-en-cours?status=${encodeURIComponent(status)}`))
}

/** Fiche complète d'un service en cours, avec son fil d'opérations. */
export async function getServiceEnCours(id) {
  return unwrap(await apiFetch(`/api/v1/services-en-cours/${id}`))
}

/**
 * Statuts proposés pour un service (ceux de Paramètres → Services), servis avec le droit de lecture de « Services en cours » :
 * un utilisateur qui peut changer un statut n'a pas besoin du droit Paramètres pour voir la liste.
 */
export async function listStatutsService() {
  return unwrap(await apiFetch('/api/v1/services-en-cours/statuts'))
}

export async function listActivite(limit = 15) {
  return apiFetch(`/api/v1/services-en-cours/activite?limit=${limit}`)
}


export async function updateServiceEnCours(id, payload) {
  return unwrap(await apiFetch(`/api/v1/services-en-cours/${id}`, { method: 'PUT', body: payload }))
}

// Opération = entrée du fil « Activité Services » : statut, commentaire, fichier joint.
export async function addOperation(id, { serviceStatusId, commentaire, fichier } = {}) {
  const form = new FormData()
  if (serviceStatusId) form.append('service_status_id', serviceStatusId)
  if (commentaire) form.append('commentaire', commentaire)
  if (fichier) form.append('fichier', fichier)
  return unwrap(await apiUpload(`/api/v1/services-en-cours/${id}/operations`, form))
}

/** Remplace (ou ajoute) le fichier AJOUTÉ À LA MAIN sur une opération ; la pièce jointe du document d'origine n'est jamais touchée. */
export async function remplacerFichierOperation(id, operationId, fichier) {
  const form = new FormData()
  form.append('fichier', fichier)
  return unwrap(await apiUpload(`/api/v1/services-en-cours/${id}/operations/${operationId}/fichier`, form))
}

export async function supprimerFichierOperation(id, operationId) {
  return unwrap(await apiFetch(`/api/v1/services-en-cours/${id}/operations/${operationId}/fichier`, { method: 'DELETE' }))
}

const action = (id, verb) => apiFetch(`/api/v1/services-en-cours/${id}/${verb}`, { method: 'POST' })

export const archiveServiceEnCours = (id) => action(id, 'archive')
export const corbeilleServiceEnCours = (id) => action(id, 'corbeille')
export const restoreServiceEnCours = (id) => action(id, 'restore')

export async function deleteServiceEnCoursForever(id) {
  return apiFetch(`/api/v1/services-en-cours/${id}`, { method: 'DELETE' })
}
