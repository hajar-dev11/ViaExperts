import { apiFetch, apiUpload, API_URL } from './http.js'

const unwrap = (res) => res?.data ?? res

export async function listPaiements({ status = 'actif', responsable = '', documentId = '', id = '' } = {}) {
  const params = new URLSearchParams({ status })
  if (responsable) params.set('responsable', responsable)
  if (documentId) params.set('document_id', documentId)
  if (id) params.set('id', id)
  return unwrap(await apiFetch(`/api/v1/paiements?${params.toString()}`))
}

// Vue « Gestion des Paiements » : une ligne par service. regle = '' | 'true' | 'false'
export async function listGestion({ status = 'actif', regle = '' } = {}) {
  const params = new URLSearchParams({ status })
  if (regle !== '') params.set('regle', regle)
  return apiFetch(`/api/v1/paiements/gestion?${params.toString()}`)
}

export async function getPaiement(id) {
  return unwrap(await apiFetch(`/api/v1/paiements/${id}`))
}

// Historique complet d'un service : tous les paiements du dossier (paiement d'origine + compléments), du plus ancien au plus récent.
export async function getHistorique(id) {
  return unwrap(await apiFetch(`/api/v1/paiements/${id}/historique`))
}

// Pièce jointe d'UN paiement, servie par l'API (accès contrôlé, jamais un lien public) : lien de téléchargement.
export function urlFichierPaiement(id) {
  return `${API_URL}/api/v1/paiements/${id}/fichier`
}

export async function listFacturesDisponibles() {
  return apiFetch('/api/v1/paiements/factures-disponibles')
}

// Multipart : le formulaire porte une pièce jointe (capture « pièce à jointe »).
function toFormData(payload) {
  const form = new FormData()
  Object.entries(payload).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') return
    if (k === 'lignes') {
      v.forEach((l, i) => {
        Object.entries(l).forEach(([lk, lv]) => {
          if (lv !== null && lv !== undefined && lv !== '') form.append(`lignes[${i}][${lk}]`, lv)
        })
      })
    } else if (k === 'signature') {
      form.append(k, v ? '1' : '0')
    } else {
      form.append(k, v)
    }
  })
  return form
}

export async function createPaiement(payload) {
  return unwrap(await apiUpload('/api/v1/paiements', toFormData(payload)))
}

// Paiement complémentaire d'un service déjà payé en partie : seul le NOUVEAU montant est envoyé, jamais le déjà payé.
export async function ajouterComplement(id, payload) {
  return unwrap(await apiUpload(`/api/v1/paiements/${id}/complements`, toFormData(payload)))
}

export async function updatePaiement(id, payload) {
  return unwrap(await apiUpload(`/api/v1/paiements/${id}`, toFormData(payload)))
}

export async function updateDateCredit(id, dateCredit) {
  return unwrap(await apiFetch(`/api/v1/paiements/${id}`, {
    method: 'POST',
    body: { date_credit: dateCredit },
  }))
}

const action = (id, verb) => apiFetch(`/api/v1/paiements/${id}/${verb}`, { method: 'POST' })

export const archivePaiement = (id) => action(id, 'archive')
export const corbeillePaiement = (id) => action(id, 'corbeille')
export const restorePaiement = (id) => action(id, 'restore')

export async function deletePaiementForever(id) {
  return apiFetch(`/api/v1/paiements/${id}`, { method: 'DELETE' })
}
