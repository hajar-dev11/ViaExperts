// Filtre « Responsable » de la liste des factures : « Via Experts » et « via Experts » ne forment qu'une entrée.

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMETTEURS } from '../shared/constants/documents.js'
import { cleResponsable, listerResponsables } from '../modules/facturation/utils/responsables.js'

const lignes = (...responsables) => responsables.map((responsable, id) => ({ id, responsable }))

describe('listerResponsables', () => {
  it('fusionne « Via Experts » et « via Experts » en une seule entrée libellée « Via Experts »', () => {
    // Valeurs réellement présentes en base : 4 factures « Via Experts », 5 « via Experts », 3 « Maitre : Morad Bendeq ».
    const docs = lignes('via Experts', 'Via Experts', 'Maitre : Morad Bendeq', 'via Experts', 'Via Experts')

    expect(listerResponsables(docs, EMETTEURS)).toEqual([
      { cle: 'via experts', libelle: 'Via Experts' },
      { cle: 'maitre : morad bendeq', libelle: 'Maitre : Morad Bendeq' },
    ])
  })

  it('le libellé est « Via Experts » même si seule la variante en minuscules existe, et quel que soit l\'ordre', () => {
    expect(listerResponsables(lignes('via Experts'), EMETTEURS)).toEqual([{ cle: 'via experts', libelle: 'Via Experts' }])
    expect(listerResponsables(lignes('via Experts', 'Via Experts'), EMETTEURS)[0].libelle).toBe('Via Experts')
    expect(listerResponsables(lignes('Via Experts', 'via Experts'), EMETTEURS)[0].libelle).toBe('Via Experts')
  })

  it('ignore les espaces superflus et les responsables vides, conserve les autres responsables tels quels', () => {
    const entrees = listerResponsables([...lignes('  Via   Experts ', null, '', 'Cabinet Atlas'), { id: 9 }], EMETTEURS)

    expect(entrees).toEqual([
      { cle: 'via experts', libelle: 'Via Experts' },
      { cle: 'cabinet atlas', libelle: 'Cabinet Atlas' },
    ])
  })

  it('chaque document est retrouvé par la clé de son responsable, quelle que soit la variante', () => {
    const docs = lignes('via Experts', 'Via Experts', 'Maitre : Morad Bendeq')
    const cle = listerResponsables(docs, EMETTEURS)[0].cle

    expect(docs.filter((d) => cleResponsable(d.responsable) === cle).map((d) => d.id)).toEqual([0, 1])
  })
})

describe('DocumentList', () => {
  it('utilise la liste dédupliquée et filtre sur la clé normalisée (les données des documents ne sont pas modifiées)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../modules/facturation/pages/DocumentList.jsx'), 'utf8')

    expect(source).toContain('listerResponsables(rows, EMETTEURS)')
    expect(source).toContain('cleResponsable(r.responsable) === responsable')
    expect(source).toContain('<option key={r.cle} value={r.cle}>{r.libelle}</option>')
  })
})
