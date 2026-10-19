import { apiFetch, apiUpload } from './http.js'
import { preparerImage } from '../utils/images.js'

// Logos et signatures : l'image est réduite dans le navigateur si elle dépasse la taille visée (voir utils/images.js).
const envoyerImage = async (chemin, fichier) => apiUpload(chemin, await preparerImage(fichier))

export async function getCabinetSettings() {
  return apiFetch('/api/v1/settings/cabinet')
}

export async function updateCabinetSettings(payload) {
  return apiFetch('/api/v1/settings/cabinet', { method: 'PUT', body: payload })
}

export async function uploadCabinetLogo(file) {
  return envoyerImage('/api/v1/settings/cabinet/logo', file)
}

export async function resetCabinetLogo() {
  return apiFetch('/api/v1/settings/cabinet/logo', { method: 'DELETE' })
}

export async function uploadCabinetSignature(file) {
  return envoyerImage('/api/v1/settings/cabinet/signature', file)
}

export async function resetCabinetSignature() {
  return apiFetch('/api/v1/settings/cabinet/signature', { method: 'DELETE' })
}

/**
 * Identité d'IMPRESSION (logo, cachet, pied de page) de l'émetteur : `via_experts` (centre de domiciliation) ou `bureau`.
 * Accessible à tout utilisateur autorisé à imprimer, sans droit Paramètres — contrairement à getCabinetSettings /
 * getDomiciliationSettings, qui renvoient toute la configuration et restent réservées à Paramètres.
 */
export async function getIdentiteImpression(emetteur) {
  return apiFetch(`/api/v1/impression/identite/${emetteur === 'via_experts' ? 'via_experts' : 'bureau'}`)
}

export const getIdentiteDomiciliation = () => getIdentiteImpression('via_experts')

export async function getDomiciliationSettings() {
  return apiFetch('/api/v1/settings/domiciliation')
}

export async function updateDomiciliationSettings(payload) {
  return apiFetch('/api/v1/settings/domiciliation', { method: 'PUT', body: payload })
}

export async function uploadDomiciliationLogo(file) {
  return envoyerImage('/api/v1/settings/domiciliation/logo', file)
}

export async function resetDomiciliationLogo() {
  return apiFetch('/api/v1/settings/domiciliation/logo', { method: 'DELETE' })
}

export async function uploadDomiciliationSignature(file) {
  return envoyerImage('/api/v1/settings/domiciliation/signature', file)
}

export async function resetDomiciliationSignature() {
  return apiFetch('/api/v1/settings/domiciliation/signature', { method: 'DELETE' })
}
