import { API_URL, apiFetch, apiUpload } from './http.js'

const unwrap = (res) => res?.data ?? res

// statut : active | alerte | declare | expire | resilie (filtre d'affichage, calculé côté serveur)
export async function listDomiciliations({ status = 'actif', statut = '', entrepriseId = '' } = {}) {
  const params = new URLSearchParams({ status })
  if (statut) params.set('statut', statut)
  if (entrepriseId) params.set('entreprise_id', entrepriseId)
  return unwrap(await apiFetch(`/api/v1/domiciliations?${params.toString()}`))
}

export async function getDomiciliation(id) {
  return unwrap(await apiFetch(`/api/v1/domiciliations/${id}`))
}

export async function createDomiciliation(payload) {
  return unwrap(await apiFetch('/api/v1/domiciliations', { method: 'POST', body: payload }))
}

export async function updateDomiciliation(id, payload) {
  return unwrap(await apiFetch(`/api/v1/domiciliations/${id}`, { method: 'PUT', body: payload }))
}

const action = (id, verb) => apiFetch(`/api/v1/domiciliations/${id}/${verb}`, { method: 'POST' })

export const archiveDomiciliation = (id) => action(id, 'archive')
export const corbeilleDomiciliation = (id) => action(id, 'corbeille')
export const restoreDomiciliation = (id) => action(id, 'restore')

/**
 * Construit le corps d'une action Déclarer / Résilier / Renouveler.
 * Sans fichier on reste en JSON ; dès qu'il y en a un, on passe en multipart,
 * seule forme qui transporte un fichier.
 */
function corpsAction(champs, fichier) {
  if (!fichier) return { json: champs }
  const form = new FormData()
  Object.entries(champs).forEach(([cle, valeur]) => {
    if (valeur === null || valeur === undefined || valeur === '') return
    form.append(cle, typeof valeur === 'boolean' ? (valeur ? '1' : '0') : valeur)
  })
  form.append('fichier', fichier)
  return { form }
}

async function envoyerAction(id, verbe, champs = {}, fichier = null) {
  const { json, form } = corpsAction(champs, fichier)
  if (form) return unwrap(await apiUpload(`/api/v1/domiciliations/${id}/${verbe}`, form))
  return unwrap(await apiFetch(`/api/v1/domiciliations/${id}/${verbe}`, { method: 'POST', body: json }))
}

/** « Déclaré » — commentaire et justificatif facultatifs. */
export const declarerDomiciliation = (id, { commentaire = '', fichier = null } = {}) =>
  envoyerAction(id, 'declarer', { commentaire }, fichier)

/** « Résilier » — commentaire et justificatif facultatifs. */
export const resilierDomiciliation = (id, { commentaire = '', fichier = null } = {}) =>
  envoyerAction(id, 'resilier', { commentaire }, fichier)

/** « Activer » — annule Déclarer/Résilier, remet la période à l'état actif. */
export const activerDomiciliation = (id) => envoyerAction(id, 'activer')

/**
 * « Renouveler » — crée une NOUVELLE période rattachée à celle d'origine.
 * `champs` reprend la même forme que le formulaire de domiciliation.
 */
export const renouvelerDomiciliation = (id, champs, fichier = null) =>
  envoyerAction(id, 'renouveler', champs, fichier)

/** Le téléchargement passe par le navigateur : le cookie de session suit. */
export const operationFichierUrl = (id, operationId) =>
  `${API_URL}/api/v1/domiciliations/${id}/operations/${operationId}/download`

export async function deleteDomiciliationForever(id) {
  return apiFetch(`/api/v1/domiciliations/${id}`, { method: 'DELETE' })
}

export async function addObservation(id, contenu, { privee = false, fichier = null } = {}) {
  if (!fichier) {
    return unwrap(await apiFetch(`/api/v1/domiciliations/${id}/observations`, {
      method: 'POST',
      body: { contenu, privee },
    }))
  }
  const form = new FormData()
  form.append('contenu', contenu)
  form.append('privee', privee ? '1' : '0')
  form.append('fichier', fichier)
  return unwrap(await apiUpload(`/api/v1/domiciliations/${id}/observations`, form))
}

/** Le téléchargement passe par le navigateur : le cookie de session suit. */
export const observationFichierUrl = (id, observationId) =>
  `${API_URL}/api/v1/domiciliations/${id}/observations/${observationId}/fichier/download`

export async function addDocument(id, file, nom = '') {
  const form = new FormData()
  form.append('fichier', file)
  if (nom) form.append('nom', nom)
  return unwrap(await apiUpload(`/api/v1/domiciliations/${id}/documents`, form))
}

export async function deleteDocument(id, documentId) {
  return unwrap(await apiFetch(`/api/v1/domiciliations/${id}/documents/${documentId}`, { method: 'DELETE' }))
}

export async function deleteObservation(id, observationId) {
  return unwrap(await apiFetch(`/api/v1/domiciliations/${id}/observations/${observationId}`, { method: 'DELETE' }))
}

const actionDocument = async (id, documentId, verb) =>
  unwrap(await apiFetch(`/api/v1/domiciliations/${id}/documents/${documentId}/${verb}`, { method: 'POST' }))

export const archiveDocument = (id, documentId) => actionDocument(id, documentId, 'archive')
export const corbeilleDocument = (id, documentId) => actionDocument(id, documentId, 'corbeille')
export const restoreDocument = (id, documentId) => actionDocument(id, documentId, 'restore')

const actionObservation = async (id, observationId, verb) =>
  unwrap(await apiFetch(`/api/v1/domiciliations/${id}/observations/${observationId}/${verb}`, { method: 'POST' }))

export const archiveObservation = (id, observationId) => actionObservation(id, observationId, 'archive')
export const corbeilleObservation = (id, observationId) => actionObservation(id, observationId, 'corbeille')
export const restoreObservation = (id, observationId) => actionObservation(id, observationId, 'restore')
