import { apiFetch } from './http.js'

export async function listClients(status = 'actif') {
  const data = await apiFetch(`/api/v1/clients?status=${encodeURIComponent(status)}`)
  return data.data
}

export async function getClient(id, { signal } = {}) {
  const data = await apiFetch(`/api/v1/clients/${id}`, { signal })
  return data.data
}

export async function createClient(payload) {
  const data = await apiFetch('/api/v1/clients', { method: 'POST', body: payload })
  return data.data
}

export async function updateClient(id, payload) {
  const data = await apiFetch(`/api/v1/clients/${id}`, { method: 'PUT', body: payload })
  return data.data
}

export async function archiveClient(id) {
  const data = await apiFetch(`/api/v1/clients/${id}/archive`, { method: 'POST' })
  return data.data
}

export async function corbeilleClient(id) {
  const data = await apiFetch(`/api/v1/clients/${id}/corbeille`, { method: 'POST' })
  return data.data
}

export async function restoreClient(id) {
  const data = await apiFetch(`/api/v1/clients/${id}/restore`, { method: 'POST' })
  return data.data
}

export async function deleteClientForever(id) {
  await apiFetch(`/api/v1/clients/${id}`, { method: 'DELETE' })
}
