import { apiFetch } from './http.js'

// Data Center — recherche et pagination gérées par le serveur (Laravel paginate()),
// comme la capture de référence (« Show N entries » + « Recherche: »).
export async function listFiches({ status = 'actif', page = 1, perPage = 10, search = '' } = {}) {
  const params = new URLSearchParams({
    status,
    page: String(page),
    per_page: String(perPage),
  })
  if (search) params.set('search', search)

  return apiFetch(`/api/v1/data-center?${params.toString()}`)
}

export async function getFiche(id) {
  return apiFetch(`/api/v1/data-center/${id}`)
}

export async function createFiche(payload) {
  return apiFetch('/api/v1/data-center', { method: 'POST', body: payload })
}

export async function updateFiche(id, payload) {
  return apiFetch(`/api/v1/data-center/${id}`, { method: 'PUT', body: payload })
}

const action = (id, verb) => apiFetch(`/api/v1/data-center/${id}/${verb}`, { method: 'POST' })

export const archiveFiche = (id) => action(id, 'archive')
export const corbeilleFiche = (id) => action(id, 'corbeille')
export const restoreFiche = (id) => action(id, 'restore')

export async function deleteFicheForever(id) {
  return apiFetch(`/api/v1/data-center/${id}`, { method: 'DELETE' })
}
