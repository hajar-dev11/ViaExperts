import { apiFetch, apiUpload } from './http.js'

export async function listMails(status = 'actif') {
  return apiFetch(`/api/v1/mails?status=${encodeURIComponent(status)}`)
}

export async function listActivite(limit = 15) {
  return apiFetch(`/api/v1/mails/activite?limit=${limit}`)
}

export async function createMail(payload) {
  return apiFetch('/api/v1/mails', { method: 'POST', body: payload })
}

export async function updateMail(id, payload) {
  return apiFetch(`/api/v1/mails/${id}`, { method: 'PUT', body: payload })
}

// Opération = entrée du fil « Mail Activité » : statut, commentaire, fichier joint.
export async function addOperation(id, { mailStatusId, commentaire, fichier } = {}) {
  const form = new FormData()
  if (mailStatusId) form.append('mail_status_id', mailStatusId)
  if (commentaire) form.append('commentaire', commentaire)
  if (fichier) form.append('fichier', fichier)
  return apiUpload(`/api/v1/mails/${id}/operations`, form)
}

const action = (id, verb) => apiFetch(`/api/v1/mails/${id}/${verb}`, { method: 'POST' })

export const archiveMail = (id) => action(id, 'archive')
export const corbeilleMail = (id) => action(id, 'corbeille')
export const restoreMail = (id) => action(id, 'restore')

export async function deleteMailForever(id) {
  return apiFetch(`/api/v1/mails/${id}`, { method: 'DELETE' })
}
