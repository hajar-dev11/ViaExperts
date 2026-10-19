// Renouvellements : une entreprise qui renouvelle n'est plus « nouvelle », ni dans les listes, ni dans les compteurs du tableau de bord.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { classerNouveauRenouveler, periodesRenouvelees } from '../modules/domiciliation/utils/domiciliation.js'
import { PERIODES, construireSeries } from '../utils/seriesDomiciliation.js'

const MAINTENANT = new Date(2026, 9, 12) // 12 octobre 2026
const DOUZE_MOIS = PERIODES.find((p) => p.cle === '12m')
const total = (series, champ) => series.reduce((a, p) => a + p[champ], 0)

describe('périodes déjà renouvelées', () => {
  it('une période suivie d\'un renouvellement (lien explicite) est renouvelée, pas le renouvellement', () => {
    const renouvelees = periodesRenouvelees([
      { id: 1, entrepriseId: 10, dateDepart: '2025-01-01' },
      { id: 2, entrepriseId: 10, dateDepart: '2026-01-01', renouvelleDeId: 1 },
      { id: 3, entrepriseId: 11, dateDepart: '2026-03-01' },
    ])
    expect([...renouvelees]).toEqual([1])
  })

  it('sans lien (anciennes lignes), toute période suivie d\'une plus récente de la même entreprise est renouvelée', () => {
    const renouvelees = periodesRenouvelees([
      { id: 1, entrepriseId: 10, dateDepart: '2024-01-01' },
      { id: 2, entrepriseId: 10, dateDepart: '2025-01-01' },
      { id: 3, entrepriseId: 10, dateDepart: '2026-01-01' },
      { id: 4, entrepriseId: 12, dateDepart: '2026-02-01' },
    ])
    expect([...renouvelees].sort()).toEqual([1, 2])
  })

  it('un lien vers une période absente de la liste (archivée) ne désigne rien, et deux entreprises sans identifiant ne sont pas fusionnées', () => {
    expect([...periodesRenouvelees([{ id: 5, entrepriseId: 20, dateDepart: '2026-05-01', renouvelleDeId: 99 }])]).toEqual([])
    expect([...periodesRenouvelees([{ id: 6, dateDepart: '2025-01-01' }, { id: 7, dateDepart: '2026-01-01' }])]).toEqual([])
  })

  it('liste vide', () => {
    expect(periodesRenouvelees([]).size).toBe(0)
  })
})

describe('classement nouveau / renouveler', () => {
  it('un renouvellement dont la période d\'origine n\'est plus active reste un renouvellement', () => {
    const c = classerNouveauRenouveler([{ id: 4, entrepriseId: 12, dateDepart: '2026-05-01', renouvelleDeId: 99 }])
    expect(c.get(4)).toBe('renouveler')
  })
})

describe('tableau de bord : compteurs Nouveau / Renouveler', () => {
  const domiciliations = [
    // Entreprise A : mise en place en mars 2026, renouvelée en septembre 2026 (lien explicite).
    { id: 1, entrepriseId: 10, dateDepart: '2026-03-10' },
    { id: 2, entrepriseId: 10, dateDepart: '2026-09-10', renouvelleDeId: 1 },
    // Entreprise B : renouvellement dont la période d'origine est archivée (absente de la liste active).
    { id: 3, entrepriseId: 11, dateDepart: '2026-08-05', renouvelleDeId: 77 },
    // Entreprise C : une seule période, nouvelle.
    { id: 4, entrepriseId: 12, dateDepart: '2026-10-01' },
    // Entreprises sans identifiant ni dénomination : jamais fusionnées entre elles.
    { id: 5, dateDepart: '2026-06-01' },
    { id: 6, dateDepart: '2026-07-01' },
  ]

  it('chaque période est comptée selon son statut réel, pas « nouvelle » par défaut', () => {
    const series = construireSeries(domiciliations, DOUZE_MOIS, MAINTENANT)
    expect(total(series, 'nouveau')).toBe(4) // 1, 4, 5, 6
    expect(total(series, 'renouveler')).toBe(2) // 2, 3
  })

  it('les mois sont rangés à leur date : septembre porte le renouvellement de l\'entreprise A', () => {
    const series = construireSeries(domiciliations, DOUZE_MOIS, MAINTENANT)
    const septembre = series.find((p) => p.mois === 'Sept')
    expect(septembre).toMatchObject({ nouveau: 0, renouveler: 1 })
    const mars = series.find((p) => p.mois === 'Mars')
    expect(mars).toMatchObject({ nouveau: 1, renouveler: 0 })
  })

  it('une période n\'est jamais comptée deux fois (nouveau + renouveler = nombre de périodes dans la fenêtre)', () => {
    const series = construireSeries(domiciliations, DOUZE_MOIS, MAINTENANT)
    expect(total(series, 'nouveau') + total(series, 'renouveler')).toBe(domiciliations.length)
  })

  it('sans domiciliation, toutes les valeurs sont à zéro', () => {
    const series = construireSeries([], DOUZE_MOIS, MAINTENANT)
    expect(series).toHaveLength(12)
    expect(total(series, 'nouveau') + total(series, 'renouveler')).toBe(0)
  })
})

describe('pages', () => {
  const lire = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8')

  it('les tuiles de la gestion de domiciliation reprennent la règle d\'Expense Ratio (même classement, même période)', () => {
    const source = lire('modules/domiciliation/utils/ongletsStatut.js')
    expect(source).toContain('classerNouveauRenouveler(actives)')
    expect(source).toContain('dansLaPeriode(r.dateDepart, periode, maintenant)')
    expect(source).toContain('dansLaPeriode(r.dateDeclaration, periode, maintenant)')
    expect(source).toContain('dansLaPeriode(r.dateResiliation, periode, maintenant)')
    expect(lire('modules/domiciliation/pages/DomiciliationList.jsx')).toContain('repartirParTuile(rows, archivees, periode)')
  })

  it('le tableau de bord utilise le classement réel (plus de rang calculé localement)', () => {
    const source = lire('pages/Dashboard.jsx')
    expect(source).toContain("from '../utils/seriesDomiciliation.js'")
    expect(source).not.toContain('rangs.get')
    expect(lire('utils/seriesDomiciliation.js')).toContain('classerNouveauRenouveler(domiciliations)')
  })
})
