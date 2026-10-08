import { apiFetch, apiUpload } from './http.js'

const unwrap = (res) => res?.data ?? res

export async function listServicesEnCours(status = 'actif') {
  return unwrap(await apiFetch(`/api/v1/services-en-cours?status=${encodeURIComponent(status)}`))
}

/** Fiche complète d'un service en cours, avec son fil d'opérations. */
export async function getServiceEnCours(id) {
  return unwrap(await apiFetch(`/api/v1/services-en-cours/${id}`))
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

const action = (id, verb) => apiFetch(`/api/v1/services-en-cours/${id}/${verb}`, { method: 'POST' })

export const archiveServiceEnCours = (id) => action(id, 'archive')
export const corbeilleServiceEnCours = (id) => action(id, 'corbeille')
export const restoreServiceEnCours = (id) => action(id, 'restore')

export async function deleteServiceEnCoursForever(id) {
  return apiFetch(`/api/v1/services-en-cours/${id}`, { method: 'DELETE' })
}
