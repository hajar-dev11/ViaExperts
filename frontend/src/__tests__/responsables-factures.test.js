// Filtre « Tous les responsables » (factures et paiements) : « Via Experts » et « Maitre : Morad Bendeq » y figurent toujours,
// « Via Experts » et « via Experts » ne forment qu'une entrée.

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMETTEURS } from '../shared/constants/documents.js'
import { cleResponsable, correspondAuResponsable, listerResponsables } from '../shared/utils/responsables.js'
import * as depuisFacturation from '../modules/facturation/utils/responsables.js'

const lignes = (...responsables) => responsables.map((responsable, id) => ({ id, responsable }))
const VIA = { cle: 'via experts', libelle: 'Via Experts' }
const MAITRE = { cle: 'maitre : morad bendeq', libelle: 'Maitre : Morad Bendeq' }

describe('listerResponsables', () => {
  it('fusionne « Via Experts » et « via Experts » en une seule entrée libellée « Via Experts »', () => {
    // Valeurs réellement présentes en base : 4 factures « Via Experts », 5 « via Experts », 3 « Maitre : Morad Bendeq ».
    const docs = lignes('via Experts', 'Via Experts', 'Maitre : Morad Bendeq', 'via Experts', 'Via Experts')

    expect(listerResponsables(docs, EMETTEURS)).toEqual([VIA, MAITRE])
  })

  it('les deux responsables figurent TOUJOURS dans la liste, même sans aucun document (ni facture, ni paiement)', () => {
    expect(listerResponsables([], EMETTEURS)).toEqual([VIA, MAITRE])
    expect(listerResponsables(lignes('via Experts'), EMETTEURS)).toEqual([VIA, MAITRE])
    expect(listerResponsables(lignes('Maitre : Morad Bendeq'), EMETTEURS)).toEqual([VIA, MAITRE])
  })

  it('le libellé est « Via Experts » quel que soit l\'ordre des variantes, sans doublon', () => {
    expect(listerResponsables(lignes('via Experts', 'Via Experts'), EMETTEURS)[0]).toEqual(VIA)
    expect(listerResponsables(lignes('Via Experts', 'via Experts'), EMETTEURS)[0]).toEqual(VIA)
    expect(listerResponsables(lignes('Via Experts', 'via Experts'), EMETTEURS)).toHaveLength(2)
  })

  it('« Maître » (avec accent) et « Maitre » ne forment qu\'une entrée, sans modifier les données', () => {
    const docs = lignes('Maître : Morad Bendeq', 'Maitre : Morad Bendeq')

    expect(listerResponsables(docs, EMETTEURS)).toEqual([VIA, MAITRE])
    expect(docs.map((d) => d.responsable)).toEqual(['Maître : Morad Bendeq', 'Maitre : Morad Bendeq'])
    expect(docs.every((d) => correspondAuResponsable(d, MAITRE.cle))).toBe(true)
  })

  it('ignore les espaces superflus et les responsables vides, ajoute les autres responsables après les deux émetteurs', () => {
    const entrees = listerResponsables([...lignes('  Via   Experts ', null, '', 'Cabinet Atlas'), { id: 9 }], EMETTEURS)

    expect(entrees).toEqual([VIA, MAITRE, { cle: 'cabinet atlas', libelle: 'Cabinet Atlas' }])
  })

  it('sans liste d\'émetteurs, seuls les responsables présents sont proposés (comportement générique)', () => {
    expect(listerResponsables(lignes('Cabinet Atlas'))).toEqual([{ cle: 'cabinet atlas', libelle: 'Cabinet Atlas' }])
  })

  it('chaque document est retrouvé par la clé de son responsable, quelle que soit la variante', () => {
    const docs = lignes('via Experts', 'Via Experts', 'Maitre : Morad Bendeq')
    const cle = listerResponsables(docs, EMETTEURS)[0].cle

    expect(docs.filter((d) => cleResponsable(d.responsable) === cle).map((d) => d.id)).toEqual([0, 1])
    expect(docs.filter((d) => correspondAuResponsable(d, MAITRE.cle)).map((d) => d.id)).toEqual([2])
  })

  it('« Tous les responsables » (clé vide) laisse tout passer ; une ligne sans responsable n\'appartient à aucun responsable', () => {
    expect(correspondAuResponsable({ responsable: 'X' }, '')).toBe(true)
    expect(correspondAuResponsable({ responsable: null }, VIA.cle)).toBe(false)
  })

  it('le module Facturation réexporte le même regroupement (une seule implémentation)', () => {
    expect(depuisFacturation.listerResponsables).toBe(listerResponsables)
    expect(depuisFacturation.cleResponsable).toBe(cleResponsable)
  })
})

describe('listes', () => {
  const lire = (rel) => fs.readFileSync(path.resolve(import.meta.dirname, rel), 'utf8')

  it('DocumentList utilise la liste dédupliquée et filtre sur la clé normalisée (les données des documents ne sont pas modifiées)', () => {
    const source = lire('../modules/facturation/pages/DocumentList.jsx')

    expect(source).toContain('listerResponsables(rows, EMETTEURS)')
    expect(source).toContain('cleResponsable(r.responsable) === responsable')
    expect(source).toContain('<option key={r.cle} value={r.cle}>{r.libelle}</option>')
  })

  it.each(['../pages/PaiementList.jsx', '../pages/PaiementGestion.jsx'])('%s : même filtre « Tous les responsables » que les factures', (fichier) => {
    const source = lire(fichier)

    expect(source).toContain('listerResponsables(rows, EMETTEURS)')
    expect(source).toContain('correspondAuResponsable(r, responsable)')
    expect(source).toContain('<option key={r.cle} value={r.cle}>{r.libelle}</option>')
    expect(source).not.toMatch(/r\.responsable === responsable/)
  })
})
