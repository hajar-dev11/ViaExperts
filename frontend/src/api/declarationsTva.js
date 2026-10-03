import { apiFetch, API_URL } from './http.js'

const unwrap = (res) => res?.data ?? res

// type : 'tva' (Déclaration TVA) | 'chiffre_affaire' (Chiffre d'Affaire)
const base = (type) => `/api/v1/declarations/${type}`

export async function listDeclarations(type, { status = 'actif', situation = '' } = {}) {
  const p = new URLSearchParams({ status })
  if (situation) p.set('situation', situation)
  return unwrap(await apiFetch(`${base(type)}?${p.toString()}`))
}

export async function getDeclaration(type, id) {
  return unwrap(await apiFetch(`${base(type)}/${id}`))
}

export async function createDeclaration(type, payload) {
  return unwrap(await apiFetch(base(type), { method: 'POST', body: payload }))
}

export async function updateDeclaration(type, id, payload) {
  return unwrap(await apiFetch(`${base(type)}/${id}`, { method: 'PUT', body: payload }))
}

const action = (type, id, verb) => apiFetch(`${base(type)}/${id}/${verb}`, { method: 'POST' })

export const archiveDeclaration = (type, id) => action(type, id, 'archive')
export const corbeilleDeclaration = (type, id) => action(type, id, 'corbeille')
export const restoreDeclaration = (type, id) => action(type, id, 'restore')

export async function deleteDeclarationForever(type, id) {
  return apiFetch(`${base(type)}/${id}`, { method: 'DELETE' })
}

// format : zip | xml | xls — téléchargement réel du fichier généré par Laravel.
export function urlExport(type, id, format) {
  return `${API_URL}${base(type)}/${id}/export/${format}`
}
