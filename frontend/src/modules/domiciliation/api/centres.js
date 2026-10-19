import { apiFetch } from '../../../api/http.js'

export async function listCentres({ page = 1, perPage = 10, search = '', status = 'actif' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage, status })
  if (search) params.set('search', search)
  return apiFetch(`/api/v1/centres-domiciliation?${params.toString()}`)
}

/**
 * TOUS les centres d'un statut (toutes les pages, 100 par requête) — pour les listes qui ne paginent pas côté serveur
 * (page Archive / Corbeille). Aucun centre n'est oublié au-delà de la première page.
 */
export async function listAllCentres(status = 'actif') {
  const toutes = []
  let page = 1
  let derniere = 1
  do {
    const res = await listCentres({ page, perPage: 100, status })
    toutes.push(...(res.data ?? []))
    derniere = res.last_page ?? res.meta?.last_page ?? 1
    page += 1
  } while (page <= derniere)
  return toutes
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
