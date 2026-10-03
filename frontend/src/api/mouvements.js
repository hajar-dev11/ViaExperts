import { apiFetch } from './http.js'

const params = ({ dateDebut = '', dateFin = '', annee = '', trimestre = '' } = {}) => {
  const p = new URLSearchParams()
  if (dateDebut) p.set('date_debut', dateDebut)
  if (dateFin) p.set('date_fin', dateFin)
  if (annee) p.set('annee', annee)
  if (trimestre) p.set('trimestre', trimestre)
  return p.toString()
}

export async function mouvementRecu(filtres) {
  return apiFetch(`/api/v1/mouvements/recu?${params(filtres)}`)
}

export async function mouvementFacture(filtres) {
  return apiFetch(`/api/v1/mouvements/facture?${params(filtres)}`)
}
