import { apiFetch, apiUpload } from './http.js'

export async function listCachets(status = 'actif') {
  return apiFetch(`/api/v1/cachets?status=${encodeURIComponent(status)}`)
}

export async function listActivite(limit = 15) {
  return apiFetch(`/api/v1/cachets/activite?limit=${limit}`)
}

export async function createCachet(payload) {
  return apiFetch('/api/v1/cachets', { method: 'POST', body: payload })
}

export async function updateCachet(id, payload) {
  return apiFetch(`/api/v1/cachets/${id}`, { method: 'PUT', body: payload })
}

// Opération = entrée du fil « Cashet Activité » : statut, commentaire, fichier joint.
export async function addOperation(id, { cachetStatusId, commentaire, fichier } = {}) {
  const form = new FormData()
  if (cachetStatusId) form.append('cachet_status_id', cachetStatusId)
  if (commentaire) form.append('commentaire', commentaire)
  if (fichier) form.append('fichier', fichier)
  return apiUpload(`/api/v1/cachets/${id}/operations`, form)
}

const action = (id, verb) => apiFetch(`/api/v1/cachets/${id}/${verb}`, { method: 'POST' })

export const archiveCachet = (id) => action(id, 'archive')
export const corbeilleCachet = (id) => action(id, 'corbeille')
export const restoreCachet = (id) => action(id, 'restore')

export async function deleteCachetForever(id) {
  return apiFetch(`/api/v1/cachets/${id}`, { method: 'DELETE' })
}
