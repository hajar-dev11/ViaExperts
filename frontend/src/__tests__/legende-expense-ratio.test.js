// Légende fixe du donut « Expense Ratio » : les quatre actions restent visibles même sans donnée ou à zéro.
// Les calculs du donut (parts, angles) ne changent pas.
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LegendeRepartition from '../components/LegendeRepartition.jsx'
import { SERIES_DOMICILIATION, calculerSegments, valeursParSerie } from '../utils/donut.js'

const ACTIONS = ['Nouveau', 'Renouveler', 'Déclary', 'Résilier']
const rendre = (series, props = {}) => renderToStaticMarkup(createElement(LegendeRepartition, { series, ...props }))

describe('les 4 actions de domiciliation', () => {
  it('sont définies une seule fois, dans cet ordre, avec leurs couleurs', () => {
    expect(SERIES_DOMICILIATION.map((s) => s.label)).toEqual(ACTIONS)
    expect(SERIES_DOMICILIATION.map((s) => s.key)).toEqual(['nouveau', 'renouveler', 'declary', 'resilier'])
    SERIES_DOMICILIATION.forEach((s) => expect(s.color).toMatch(/^#[0-9a-f]{6}$/i))
  })
})

describe('valeursParSerie', () => {
  it('sans aucune donnée : les 4 actions avec la valeur 0 (rien n\'est inventé)', () => {
    for (const points of [[], null, undefined]) {
      const valeurs = valeursParSerie(SERIES_DOMICILIATION, points)
      expect(valeurs.map((v) => v.label)).toEqual(ACTIONS)
      expect(valeurs.map((v) => v.value)).toEqual([0, 0, 0, 0])
    }
  })

  it('cumule chaque action sur la période et garde celles qui valent 0', () => {
    const points = [
      { mois: 'Janv', nouveau: 2, renouveler: 0, declary: 0, resilier: 0 },
      { mois: 'Fév', nouveau: 1, renouveler: 0, declary: 3, resilier: 0 },
    ]

    const valeurs = valeursParSerie(SERIES_DOMICILIATION, points)

    expect(valeurs.map((v) => [v.key, v.value])).toEqual([['nouveau', 3], ['renouveler', 0], ['declary', 3], ['resilier', 0]])
  })

  it('ignore une valeur invalide sans fausser le total', () => {
    const valeurs = valeursParSerie(SERIES_DOMICILIATION, [{ nouveau: 2, renouveler: 'x', declary: undefined, resilier: NaN }, { nouveau: 1 }])
    expect(valeurs.map((v) => v.value)).toEqual([3, 0, 0, 0])
  })

  it('ne modifie pas le calcul du donut : seules les valeurs > 0 sont tracées', () => {
    const valeurs = valeursParSerie(SERIES_DOMICILIATION, [{ nouveau: 3, renouveler: 0, declary: 1, resilier: 0 }])
    const { total, segments } = calculerSegments(valeurs.filter((s) => s.value > 0))

    expect(total).toBe(4)
    expect(segments.map((s) => s.key)).toEqual(['nouveau', 'declary'])
    expect(calculerSegments(valeurs).segments.map((s) => s.key)).toEqual(['nouveau', 'declary']) // même résultat sans pré-filtre
  })
})

describe('LegendeRepartition', () => {
  it("affiche les 4 actions quand il n'y a aucune donnée", () => {
    const html = rendre(valeursParSerie(SERIES_DOMICILIATION, []))

    ACTIONS.forEach((a) => expect(html).toContain(a))
    expect((html.match(/data-legende=/g) ?? []).length).toBe(4)
  })

  it('affiche aussi les actions à zéro, atténuées et non cliquables, avec leur pastille de couleur', () => {
    const valeurs = valeursParSerie(SERIES_DOMICILIATION, [{ nouveau: 5, renouveler: 0, declary: 0, resilier: 0 }])
    const html = rendre(valeurs)

    ACTIONS.forEach((a) => expect(html).toContain(a))
    // Une seule action cliquable (« Nouveau ») ; les trois autres sont des pastilles atténuées.
    expect((html.match(/<button/g) ?? []).length).toBe(1)
    expect((html.match(/data-vide="true"/g) ?? []).length).toBe(3)
    SERIES_DOMICILIATION.forEach((s) => expect(html).toContain(`background:${s.color}`))
  })

  it('quand toutes les actions ont une valeur, toutes sont cliquables et la sélection ressort', () => {
    const valeurs = valeursParSerie(SERIES_DOMICILIATION, [{ nouveau: 1, renouveler: 2, declary: 3, resilier: 4 }])
    const html = rendre(valeurs, { selectionneeKey: 'renouveler' })

    expect((html.match(/<button/g) ?? []).length).toBe(4)
    expect((html.match(/data-vide/g) ?? []).length).toBe(0)
    expect(html).toContain('font-semibold')
  })

  it('une seule action présente ne fait pas disparaître les trois autres', () => {
    const html = rendre(valeursParSerie(SERIES_DOMICILIATION, [{ nouveau: 1 }]))
    ACTIONS.forEach((a) => expect(html).toContain(a))
  })
})

describe('tableau de bord', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../pages/Dashboard.jsx'), 'utf8')

  it('affiche la légende fixe avec les 4 actions, hors de la branche « Aucune donnée »', () => {
    expect(source).toContain('<LegendeRepartition')
    expect(source).toContain('series={valeursPeriode}')

    const legende = source.indexOf('<LegendeRepartition')
    const vide = source.indexOf('repartition.length === 0 ?')
    const finVide = source.indexOf(')}', vide) // fin de la branche conditionnelle (vide / donut)
    expect(vide).toBeGreaterThan(-1)
    expect(legende).toBeGreaterThan(finVide)
  })

  it('utilise les séries partagées et ne trace le donut que sur les valeurs > 0', () => {
    expect(source).toContain('const SERIES = SERIES_DOMICILIATION')
    expect(source).toMatch(/const repartition = useMemo\(\(\) => valeursPeriode\.filter\(\(s\) => s\.value > 0\)/)
  })
})
