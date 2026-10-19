// Module Mouvement : période consultable du 1er janvier 2022 à aujourd'hui, années qui suivent l'horloge.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { params } from '../api/mouvements.js'
import { ANNEE_MIN_MOUVEMENT, DATE_MIN_MOUVEMENT, anneesMouvement, erreurPeriode, periodeParDefaut } from '../utils/periodeMouvement.js'

describe('période par défaut : aucune date', () => {
  it('les champs Date de début et Date de fin sont VIDES ; l\'utilisateur choisit lui-même la période', () => {
    expect(periodeParDefaut()).toEqual({ dateDebut: '', dateFin: '', annee: '', trimestre: '' })
    // Plus aucune dépendance à la date du jour : le résultat est identique quel que soit le jour.
    expect(periodeParDefaut('2031-03-20')).toEqual(periodeParDefaut('2026-10-12'))
  })

  it('recherche sans date, avec une seule date ou avec deux dates : seuls les champs renseignés sont envoyés', () => {
    expect(params(periodeParDefaut())).toBe('')
    expect(params({ ...periodeParDefaut(), dateDebut: '2024-05-01' })).toBe('date_debut=2024-05-01')
    expect(params({ ...periodeParDefaut(), dateFin: '2024-05-31' })).toBe('date_fin=2024-05-31')
    expect(params({ dateDebut: '2024-05-01', dateFin: '2024-05-31', annee: '', trimestre: '' })).toBe('date_debut=2024-05-01&date_fin=2024-05-31')
  })

  it('aucune de ces trois recherches n\'est refusée par la validation', () => {
    const auj = '2026-10-12'
    expect(erreurPeriode(periodeParDefaut(), auj)).toBe('')
    expect(erreurPeriode({ dateDebut: '2024-05-01', dateFin: '' }, auj)).toBe('')
    expect(erreurPeriode({ dateDebut: '', dateFin: '2024-05-31' }, auj)).toBe('')
    expect(erreurPeriode({ dateDebut: '2024-05-01', dateFin: '2024-05-31' }, auj)).toBe('')
  })
})
describe('années proposées', () => {
  it('couvrent 2022 jusqu\'à l\'année en cours, de la plus récente à la plus ancienne', () => {
    expect(anneesMouvement([], '2026-10-12')).toEqual([2026, 2025, 2024, 2023, 2022])
  })

  it('s\'allongent toutes seules avec le temps, sans modifier le code', () => {
    expect(anneesMouvement([], '2030-01-01')[0]).toBe(2030)
    expect(anneesMouvement([], '2030-01-01')).toHaveLength(9)
  })

  it('fusionnent les années présentes en base sans doublon et ignorent celles d\'avant 2022', () => {
    expect(anneesMouvement([2026, 2024, 2019, '2022'], '2025-05-05')).toEqual([2026, 2025, 2024, 2023, 2022])
  })

  it('acceptent une réponse absente', () => {
    expect(anneesMouvement(undefined, '2022-02-02')).toEqual([ANNEE_MIN_MOUVEMENT])
  })
})

describe('validation de la période', () => {
  const auj = '2026-10-12'

  it('accepte 2022-01-01 → aujourd\'hui et les champs vides', () => {
    expect(erreurPeriode({ dateDebut: DATE_MIN_MOUVEMENT, dateFin: auj }, auj)).toBe('')
    expect(erreurPeriode({ dateDebut: '', dateFin: '' }, auj)).toBe('')
    expect(erreurPeriode({ dateDebut: '2024-05-01', dateFin: '' }, auj)).toBe('')
  })

  it('refuse un début avant 2022, une fin après aujourd\'hui et un début après la fin', () => {
    expect(erreurPeriode({ dateDebut: '2021-12-31', dateFin: auj }, auj)).toMatch(/1er janvier 2022/)
    expect(erreurPeriode({ dateDebut: '', dateFin: '2026-10-13' }, auj)).toMatch(/dépasser la date d'aujourd'hui/)
    expect(erreurPeriode({ dateDebut: '2026-10-13', dateFin: '' }, auj)).toMatch(/dépasser la date d'aujourd'hui/)
    expect(erreurPeriode({ dateDebut: '2024-05-02', dateFin: '2024-05-01' }, auj)).toMatch(/antérieure ou égale/)
  })
})

describe('page Mouvement', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../pages/Mouvement.jsx'), 'utf8')

  it('borne les deux champs date et valide avant d\'appliquer le filtre', () => {
    expect(source).toContain('min={DATE_MIN_MOUVEMENT}')
    expect(source).toMatch(/max=\{auj\}/)
    expect(source).toContain('erreurPeriode(filtres, auj)')
    expect(source).toContain('useState(() => periodeParDefaut())')
    // Plus aucune initialisation par une date ou une période prédéfinie.
    expect(source).not.toMatch(/useState\(\{[^}]*(dateDebut|dateFin)/)
    expect(source).not.toContain('DATE_MIN_MOUVEMENT, dateFin')
  })

  it('alimente la liste des années par la fonction dynamique, pas par une liste figée', () => {
    expect(source).toContain('anneesMouvement(data?.annees, auj)')
    expect(source).not.toMatch(/\b2022\b.*\b2023\b/)
  })
})
