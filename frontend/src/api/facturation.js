import { apiFetch } from './http.js'

const unwrap = (res) => res?.data ?? res

// type : facture | devis | bl | avoir
const base = (type) => `/api/v1/facturation/${type}`

// Compatibilité : ces constantes sont maintenant définies dans un emplacement partagé, mais restent importables
// d'ici (PaiementForm, PaiementList, PaiementGestion, Rapports, DocumentForm… ne changent pas).
export { EMETTEURS, MODES_PAIEMENT } from '../shared/constants/documents.js'

export async function listDocuments(type, { status = 'actif', responsable = '' } = {}) {
  const params = new URLSearchParams({ status })
  if (responsable) params.set('responsable', responsable)
  return unwrap(await apiFetch(`${base(type)}?${params.toString()}`))
}

export async function getDocument(type, id) {
  return unwrap(await apiFetch(`${base(type)}/${id}`))
}

// Numéro proposé depuis cabinet_settings / domiciliation_settings selon l'émetteur.
export async function getNumeroPropose(type, emetteur) {
  return apiFetch(`${base(type)}/numero-propose?emetteur=${encodeURIComponent(emetteur)}`)
}

export async function createDocument(type, payload) {
  return unwrap(await apiFetch(base(type), { method: 'POST', body: payload }))
}

export async function updateDocument(type, id, payload) {
  return unwrap(await apiFetch(`${base(type)}/${id}`, { method: 'PUT', body: payload }))
}

const action = (type, id, verb) => apiFetch(`${base(type)}/${id}/${verb}`, { method: 'POST' })

export const archiveDocument = (type, id) => action(type, id, 'archive')
export const corbeilleDocument = (type, id) => action(type, id, 'corbeille')
export const restoreDocument = (type, id) => action(type, id, 'restore')

export async function deleteDocumentForever(type, id) {
  return apiFetch(`${base(type)}/${id}`, { method: 'DELETE' })
}
