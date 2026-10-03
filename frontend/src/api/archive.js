import { apiFetch } from './http.js'

// Compteurs Archive / Corbeille, toutes catégories confondues, en un seul
// aller-retour — évite de charger chaque catégorie séparément (throttle).
export async function getArchiveCounts(status) {
  return apiFetch(`/api/v1/archive/counts?status=${encodeURIComponent(status)}`)
}
