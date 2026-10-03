import { apiFetch } from './http.js'

export async function listServices(status = 'actif') {
  return apiFetch(`/api/v1/services?status=${encodeURIComponent(status)}`)
}

export async function getService(id) {
  return apiFetch(`/api/v1/services/${id}`)
}

export async function createService(payload) {
  return apiFetch('/api/v1/services', { method: 'POST', body: payload })
}

export async function updateService(id, payload) {
  return apiFetch(`/api/v1/services/${id}`, { method: 'PUT', body: payload })
}

const action = (id, verb) => apiFetch(`/api/v1/services/${id}/${verb}`, { method: 'POST' })

export const archiveService = (id) => action(id, 'archive')
export const corbeilleService = (id) => action(id, 'corbeille')
export const restoreService = (id) => action(id, 'restore')

export async function deleteServiceForever(id) {
  return apiFetch(`/api/v1/services/${id}`, { method: 'DELETE' })
}
