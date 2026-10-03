import { apiFetch } from './http.js'

export async function listCentres({ page = 1, perPage = 10, search = '', status = 'actif' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage, status })
  if (search) params.set('search', search)
  return apiFetch(`/api/v1/centres-domiciliation?${params.toString()}`)
}

/** Fiche « Informations Centre de domiciliation » : le centre + ses entreprises domiciliées. */
export async function getCentre(id) {
  return apiFetch(`/api/v1/centres-domiciliation/${id}`)
}

export async function createCentre(payload) {
  return apiFetch('/api/v1/centres-domiciliation', { method: 'POST', body: payload })
}

export async function updateCentre(id, payload) {
  return apiFetch(`/api/v1/centres-domiciliation/${id}`, { method: 'PUT', body: payload })
}

export async function deleteCentre(id) {
  return apiFetch(`/api/v1/centres-domiciliation/${id}`, { method: 'DELETE' })
}

export const archiveCentre = (id) => apiFetch(`/api/v1/centres-domiciliation/${id}/archive`, { method: 'POST' })
export const corbeilleCentre = (id) => apiFetch(`/api/v1/centres-domiciliation/${id}/corbeille`, { method: 'POST' })
export const restoreCentre = (id) => apiFetch(`/api/v1/centres-domiciliation/${id}/restore`, { method: 'POST' })
