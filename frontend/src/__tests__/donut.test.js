// Donut « Expense Ratio » du tableau de bord : parts, angles et tracé SVG (dont le cas d'une seule part à 100 %).
import { describe, expect, it } from 'vitest'
import { calculerSegments, decrireAnneau, decrireArc, polarToCartesian } from '../utils/donut.js'

const NOUVEAU = { key: 'nouveau', label: 'Nouveau', color: '#28c76f', value: 1 }
const RENOUVELER = { key: 'renouveler', label: 'Renouveler', color: '#7367f0', value: 1 }
const DECLARY = { key: 'declary', label: 'Déclary', color: '#191919', value: 2 }

const nombres = (chemin) => chemin.match(/-?\d+(\.\d+)?(e-?\d+)?/g).map(Number)

describe('calculerSegments', () => {
  it('une seule domiciliation « Nouveau » : une part de 100 %, cercle complet', () => {
    const { total, segments } = calculerSegments([NOUVEAU])

    expect(total).toBe(1)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ key: 'nouveau', label: 'Nouveau', color: '#28c76f', percent: 1 })
    expect(segments[0].startAngle).toBe(-90)
    expect(segments[0].endAngle).toBe(270) // 360° de balayage
  })

  it("n'exige aucun autre statut : Nouveau seul suffit, sans « Déclary », « Résilier » ni « Renouveler »", () => {
    const { segments } = calculerSegments([{ ...NOUVEAU, value: 4 }])
    expect(segments.map((s) => s.key)).toEqual(['nouveau'])
    expect(segments[0].percent).toBe(1)
  })

  it('plusieurs statuts : parts proportionnelles, contiguës, somme de 360°', () => {
    const { total, segments } = calculerSegments([NOUVEAU, RENOUVELER, DECLARY])

    expect(total).toBe(4)
    expect(segments.map((s) => Math.round(s.percent * 100))).toEqual([25, 25, 50])
    expect(segments[0].startAngle).toBe(-90)
    expect(segments[1].startAngle).toBeCloseTo(segments[0].endAngle, 10)
    expect(segments[2].startAngle).toBeCloseTo(segments[1].endAngle, 10)
    expect(segments[2].endAngle - segments[0].startAngle).toBeCloseTo(360, 10)
    expect(segments[0].mid).toBeCloseTo(-90 + 45, 10)
  })

  it('ignore les statuts à zéro, négatifs ou non numériques', () => {
    const { total, segments } = calculerSegments([
      { ...NOUVEAU, value: 0 },
      { ...RENOUVELER, value: -3 },
      { ...DECLARY, value: Number.NaN },
      { key: 'resilier', label: 'Résilier', color: '#00cfe8', value: '5' },
      { key: 'inconnu', label: 'Inconnu', color: '#999999', value: Infinity },
      { key: 'ok', label: 'Ok', color: '#111111', value: 2 },
    ])
    expect(total).toBe(2)
    expect(segments.map((s) => s.key)).toEqual(['ok'])
  })

  it('liste vide, absente ou sans valeur exploitable : aucune part, aucune division par zéro', () => {
    for (const entree of [[], undefined, null, [{ ...NOUVEAU, value: 0 }], [null, undefined, {}]]) {
      expect(calculerSegments(entree)).toEqual({ total: 0, segments: [] })
    }
  })
})

describe('decrireArc', () => {
  const [CX, CY, R, RI] = [108, 108, 98, 62]

  it('une part de 360° est dessinée (anneau complet) au lieu de disparaître', () => {
    const { segments } = calculerSegments([NOUVEAU])
    const chemin = decrireArc(CX, CY, R, RI, segments[0].startAngle, segments[0].endAngle)

    expect(chemin).not.toBe('')
    expect(chemin).toBe(decrireAnneau(CX, CY, R, RI))
    // deux contours : le bord extérieur et le bord intérieur (le centre reste vide)
    expect(chemin.match(/M /g)).toHaveLength(2)
    expect(chemin.match(/Z/g)).toHaveLength(2)
    expect(nombres(chemin).every(Number.isFinite)).toBe(true)
  })

  it("l'ancien tracé d'un arc de 360° était dégénéré (départ = arrivée) : il n'est plus utilisé", () => {
    const [x1, y1] = polarToCartesian(CX, CY, R, -90)
    const [x2, y2] = polarToCartesian(CX, CY, R, 270)
    expect(x2).toBeCloseTo(x1, 6)
    expect(y2).toBeCloseTo(y1, 6)
  })

  it('un secteur partiel reste un seul contour avec le bon indicateur « grand arc »', () => {
    const petit = decrireArc(CX, CY, R, RI, -90, 0) // 90°
    const grand = decrireArc(CX, CY, R, RI, -90, 180) // 270°
    expect(petit.match(/M /g)).toHaveLength(1)
    expect(petit).toContain(`A ${R} ${R} 0 0 1`)
    expect(grand).toContain(`A ${R} ${R} 0 1 1`)
    expect(nombres(petit).every(Number.isFinite)).toBe(true)
  })

  it('un angle nul, négatif ou invalide ne produit aucun tracé', () => {
    expect(decrireArc(CX, CY, R, RI, 10, 10)).toBe('')
    expect(decrireArc(CX, CY, R, RI, 50, 10)).toBe('')
    expect(decrireArc(CX, CY, R, RI, Number.NaN, 10)).toBe('')
    expect(decrireArc(CX, CY, R, RI, 0, undefined)).toBe('')
  })

  it('les parts de plusieurs statuts forment ensemble un anneau sans trou ni chevauchement', () => {
    const { segments } = calculerSegments([NOUVEAU, RENOUVELER, DECLARY])
    const total = segments.reduce((somme, s) => somme + (s.endAngle - s.startAngle), 0)
    expect(total).toBeCloseTo(360, 8)
    for (const s of segments) expect(decrireArc(CX, CY, R, RI, s.startAngle, s.endAngle)).not.toBe('')
  })
})
