import { apiFetch, apiUpload, API_URL } from './http.js'

export async function listRapports(status = 'actif') {
  return apiFetch(`/api/v1/rapports?status=${encodeURIComponent(status)}`)
}

export async function getRapport(id) {
  return apiFetch(`/api/v1/rapports/${id}`)
}

function toFormData(payload) {
  const form = new FormData()
  Object.entries(payload).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') return
    form.append(k, v)
  })
  return form
}

export async function createRapport(payload) {
  return apiUpload('/api/v1/rapports', toFormData(payload))
}

export async function updateRapport(id, payload) {
  return apiUpload(`/api/v1/rapports/${id}`, toFormData(payload))
}

const action = (id, verb) => apiFetch(`/api/v1/rapports/${id}/${verb}`, { method: 'POST' })

export const archiveRapport = (id) => action(id, 'archive')
export const corbeilleRapport = (id) => action(id, 'corbeille')
export const restoreRapport = (id) => action(id, 'restore')

export async function deleteRapportForever(id) {
  return apiFetch(`/api/v1/rapports/${id}`, { method: 'DELETE' })
}

// Téléchargement réel servi par Laravel depuis storage/app/public.
export function urlDocument(id) {
  return `${API_URL}/api/v1/rapports/${id}/document`
}
