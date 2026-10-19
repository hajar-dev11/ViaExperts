import { classerNouveauRenouveler } from './domiciliation.js'
import { PERIODE_PAR_DEFAUT, dansLaPeriode } from './periodeAnalyse.js'

/**
 * Tuiles de « Gestion Domiciliation » (compteurs cliquables, comme la capture de référence). Elles remplacent l'ancienne page
 * « List Domiciliation » (six tableaux) et les onglets. Deux familles :
 *
 * A. Les 4 ACTIONS — exactement la règle et la période de l'anneau « Expense Ratio » du tableau de bord (mêmes nombres) :
 *   • Nouveaux   : périodes de première mise en place (`classerNouveauRenouveler` = « nouveau ») dont la date de départ tombe
 *                  dans la période choisie, quel que soit leur statut actuel ;
 *   • Renouvelés : périodes qui en prolongent une autre (= « renouveler »), date de départ dans la période ;
 *   • Déclarées  : périodes dont la DATE DE DÉCLARATION tombe dans la période ;
 *   • Résiliées  : périodes dont la DATE DE RÉSILIATION tombe dans la période.
 *   La période (12 derniers mois par défaut) est la même que celle de la flèche d'Expense Ratio.
 *
 * B. Les STATUTS actuels (sans période) :
 *   • Total en cours : périodes réellement en cours à la date du jour — commencées, pas terminées, ni déclarées ni résiliées (voir
 *                      `estEnCours`). Chaque période compte : une entreprise ayant deux périodes en cours est comptée deux fois ;
 *   • Expire bientôt : statut « alerte » (échéance sous 30 jours) ;
 *   • Expirées       : statut « expire » ;
 *   • Archivées      : domiciliations archivées (liste « archive » du serveur).
 *
 * Une tuile ne supprime ni ne déplace aucune donnée. Compteur et liste d'une tuile utilisent le MÊME prédicat.
 */
export const TUILES_STATUT = [
  { cle: 'total', label: 'Total en cours', couleur: '#4b4b4b' },
  { cle: 'nouveau', label: 'Nouveaux', couleur: '#28c76f' },
  { cle: 'renouvele', label: 'Renouvelés', couleur: '#7367f0' },
  { cle: 'alerte', label: 'Expire bientôt', couleur: '#c98a1b' },
  { cle: 'expire', label: 'Expirées', couleur: '#a8322d' },
  { cle: 'declare', label: 'Déclarées', couleur: '#6e6b7d' },
  { cle: 'resilie', label: 'Résiliées', couleur: '#00a8c5' },
  { cle: 'archive', label: 'Archivées', couleur: '#b9b7c3' },
]

/** Tuiles qui comptent des ACTIONS sur la période choisie (règle d'Expense Ratio). */
export const TUILES_PERIODE = ['nouveau', 'renouvele', 'declare', 'resilie']

export const TUILE_PAR_DEFAUT = 'total'

/** Tuile demandée (adresse `?statut=…`) si elle existe, sinon « Total en cours ». */
export const tuileValide = (demandee) => (TUILES_STATUT.some((t) => t.cle === demandee) ? demandee : TUILE_PAR_DEFAUT)

// Statuts d'une période encore couverte : « active » (échéance lointaine, ou période déjà prolongée) et « alerte » (échéance sous 30 jours).
// « expire » n'en fait pas partie : une période terminée sans renouvellement actif n'est plus en cours.
const EN_COURS = ['active', 'alerte']

/** Jour local de `maintenant` au format `AAAA-MM-JJ` (celui des dates de l'API, comparables comme du texte). */
const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Période RÉELLEMENT en cours à la date du jour (tuile « Total en cours ») : ni résiliée ni déclarée, déjà commencée
 * (`dateDepart` ≤ aujourd'hui) et pas encore terminée (`dateFin` ≥ aujourd'hui, ou sans date de fin). Une période terminée
 * n'est jamais en cours — qu'elle ait été renouvelée (c'est alors la période qui la prolonge qui compte) ou non (« Expirées »).
 * Les périodes archivées ou à la corbeille ne sont pas dans la liste des actives.
 */
const estEnCours = (r, aujourdhui) => EN_COURS.includes(r.statutAffichage)
  && (!r.dateDepart || r.dateDepart.slice(0, 10) <= aujourdhui)
  && (!r.dateFin || r.dateFin.slice(0, 10) >= aujourdhui)

/**
 * Domiciliations de chaque tuile : `{ total: [...], nouveau: [...], … }`.
 * `actives` : liste « actif » du serveur ; `archivees` : liste « archive » (la tuile « Archivées » n'en a pas d'autre) ;
 * `periode` : période des 4 tuiles d'actions (voir `periodeAnalyse.js`) ; `maintenant` : date de référence (tests).
 */
export function repartirParTuile(actives, archivees = [], periode = PERIODE_PAR_DEFAUT, maintenant = new Date()) {
  const classement = classerNouveauRenouveler(actives)
  const aujourdhui = jourLocal(maintenant)
  const parTuile = {}

  TUILES_STATUT.forEach(({ cle }) => {
    if (cle === 'archive') {
      parTuile[cle] = archivees
      return
    }
    parTuile[cle] = actives.filter((r) => {
      if (cle === 'total') return estEnCours(r, aujourdhui)
      // Même règle que « Expense Ratio » (utils/seriesDomiciliation.js) : une action compte quand sa date tombe dans la période.
      if (cle === 'nouveau') return classement.get(r.id) !== 'renouveler' && dansLaPeriode(r.dateDepart, periode, maintenant)
      if (cle === 'renouvele') return classement.get(r.id) === 'renouveler' && dansLaPeriode(r.dateDepart, periode, maintenant)
      if (cle === 'declare') return dansLaPeriode(r.dateDeclaration, periode, maintenant)
      if (cle === 'resilie') return dansLaPeriode(r.dateResiliation, periode, maintenant)
      return r.statutAffichage === cle
    })
  })

  return parTuile
}
