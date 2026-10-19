// Période consultable dans le module Mouvement : du 1er janvier 2022 jusqu'à la date du jour.
// Rien n'est codé en dur pour « aujourd'hui » ni pour la dernière année : la borne haute et la liste des années suivent
// l'horloge, donc 2027, 2028… apparaissent d'eux-mêmes sans modifier le code.
import { aujourdhui } from '../shared/utils/date.js'

export const DATE_MIN_MOUVEMENT = '2022-01-01'
export const ANNEE_MIN_MOUVEMENT = 2022

/**
 * Filtres initiaux : AUCUNE date. L'utilisateur choisit lui-même ce qu'il filtre ; sans date, tout l'historique consultable
 * (à partir de 2022) est affiché. Une seule date suffit (« à partir de » ou « jusqu'à »).
 */
export function periodeParDefaut() {
  return { dateDebut: '', dateFin: '', annee: '', trimestre: '' }
}

/** Années proposées : de 2022 à l'année en cours, plus toute année présente en base (≥ 2022), de la plus récente à la plus ancienne. */
export function anneesMouvement(anneesEnBase = [], auj = aujourdhui()) {
  const courante = Number(auj.slice(0, 4))
  const annees = new Set()
  for (let a = ANNEE_MIN_MOUVEMENT; a <= courante; a += 1) annees.add(a)
  for (const a of anneesEnBase) {
    const n = Number(a)
    if (Number.isInteger(n) && n >= ANNEE_MIN_MOUVEMENT) annees.add(n)
  }
  return [...annees].sort((a, b) => b - a)
}

/** Message d'erreur si la période saisie n'est pas consultable, sinon chaîne vide. */
export function erreurPeriode({ dateDebut, dateFin }, auj = aujourdhui()) {
  if (dateDebut && dateDebut < DATE_MIN_MOUVEMENT) return 'La date de début ne peut pas être antérieure au 1er janvier 2022.'
  if (dateFin && dateFin > auj) return "La date de fin ne peut pas dépasser la date d'aujourd'hui."
  if (dateDebut && dateDebut > auj) return "La date de début ne peut pas dépasser la date d'aujourd'hui."
  if (dateDebut && dateFin && dateDebut > dateFin) return 'La date de début doit être antérieure ou égale à la date de fin.'
  return ''
}
