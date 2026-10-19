// Séries du tableau de bord (graphique « Analyse de Domiciliation » et anneau « Expense Ratio »), calculées sur les DATES
// RÉELLES des domiciliations. Aucune donnée n'est inventée : sans domiciliation, toutes les valeurs sont à zéro.
// Les périodes et la fenêtre de temps sont définies une seule fois (modules/domiciliation/utils/periodeAnalyse.js) : les tuiles
// de « Gestion Domiciliation » utilisent les mêmes, pour afficher exactement les mêmes nombres.
import { MOIS, PERIODES, casesDeLaPeriode, classerNouveauRenouveler, cleDeDate } from '../modules/domiciliation/index.js'

export { MOIS, PERIODES }

/**
 * Construit les séries à partir des domiciliations réelles.
 *
 * « Nouveau » et « Renouveler » respectent le statut réel de chaque période (`classerNouveauRenouveler`) : une période est
 * un renouvellement quand elle prolonge explicitement une autre (`renouvelleDeId`) ou, pour les lignes créées avant ce lien,
 * quand une période plus ancienne existe pour la même entreprise. Les autres sont des mises en place. Une domiciliation
 * n'est donc jamais comptée « nouvelle » par défaut.
 */
export function construireSeries(domiciliations, periode, maintenant = new Date()) {
  const parJour = periode.pas === 'jour'
  const cases = []
  const index = new Map()

  casesDeLaPeriode(periode, maintenant).forEach(({ cle, libelle }) => {
    const point = { mois: libelle, nouveau: 0, renouveler: 0, declary: 0, resilier: 0 }
    index.set(cle, point)
    cases.push(point)
  })

  const compter = (valeur, champ) => {
    const cle = cleDeDate(valeur, parJour)
    const point = cle === null ? undefined : index.get(cle)
    if (point) point[champ] += 1
  }

  const classement = classerNouveauRenouveler(domiciliations)

  domiciliations.forEach((dom) => {
    compter(dom.dateDepart, classement.get(dom.id) === 'renouveler' ? 'renouveler' : 'nouveau')
    compter(dom.dateDeclaration, 'declary')
    compter(dom.dateResiliation, 'resilier')
  })

  return cases
}
