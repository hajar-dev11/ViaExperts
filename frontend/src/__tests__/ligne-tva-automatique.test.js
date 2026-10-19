// Tableau « Déclaration TVA » / « Chiffre d'Affaire » : la saisie se réduit au HT (TVA et TTC calculés) et l'identifiant de paiement
// est un sélecteur à liste fermée.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { tvaDepuisHt } from '../utils/calculTva.js'
import { IDENTIFIANTS_PAIEMENT, IDENTIFIANT_PAIEMENT_PAR_DEFAUT, optionsIdentifiantPaiement } from '../utils/identifiantsPaiement.js'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('TVA calculée à partir du HT et du taux', () => {
  it('HT × taux / 100, arrondi au centime, en texte à 2 décimales', () => {
    expect(tvaDepuisHt('1500', '20')).toBe('300.00')
    expect(tvaDepuisHt(1000, 14)).toBe('140.00')
    expect(tvaDepuisHt('99.99', '20')).toBe('20.00') // 19,998 → 20,00
    expect(tvaDepuisHt('0.05', '20')).toBe('0.01')
    expect(tvaDepuisHt('100', '0')).toBe('0.00')
  })

  it('HT ou taux vide, invalide ou négatif : 0,00 (jamais « NaN »)', () => {
    for (const [ht, taux] of [['', '20'], ['abc', '20'], ['100', ''], ['100', 'x'], ['-5', '20'], ['100', '-1'], [null, undefined]]) {
      expect(tvaDepuisHt(ht, taux), `${ht} / ${taux}`).toBe('0.00')
    }
  })

  it('le tableau recalcule la TVA et le TTC quand le HT ou le taux change ; modifier la TVA ne change que le TTC', () => {
    const page = lire('pages/DeclarationTVA.jsx')
    expect(page).toContain("if (k === 'ht' || k === 'taux') maj.tva = tvaDepuisHt(maj.ht, maj.taux)")
    expect(page).toContain("if (k === 'ht' || k === 'taux' || k === 'tva') maj.ttc = (n(maj.ht) + n(maj.tva)).toFixed(2)")
    // Les champs TVA et TTC restent éditables (corrections, données lues sur une facture).
    expect(page).not.toMatch(/readOnly[^\n]*TVA/)
  })
})

describe('Identifiant de Paiement : liste fermée', () => {
  it('les sept modes, dans l\'ordre de la référence, « 1-ESPECES » par défaut', () => {
    expect(IDENTIFIANTS_PAIEMENT).toEqual(['1-ESPECES', '2-CHEQUE', '3-PRELEVEMENT', '4-VIREMENT', '5-EFFET', '6-COMPENSATION', '7-AUTRES'])
    expect(IDENTIFIANT_PAIEMENT_PAR_DEFAUT).toBe('1-ESPECES')
  })

  it('une valeur déjà enregistrée hors liste reste visible au lieu d\'être perdue', () => {
    expect(optionsIdentifiantPaiement('4-VIREMENT')).toEqual(IDENTIFIANTS_PAIEMENT)
    expect(optionsIdentifiantPaiement('')).toEqual(IDENTIFIANTS_PAIEMENT)
    expect(optionsIdentifiantPaiement('ESPECES 2025')).toEqual(['ESPECES 2025', ...IDENTIFIANTS_PAIEMENT])
  })

  it('le sélecteur remplace la saisie libre dans les deux formulaires, et « ESPECE » reste reconnu pour le seuil', () => {
    for (const rel of ['pages/DeclarationTVA.jsx', 'pages/ImportateurTvaFichier.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain('optionsIdentifiantPaiement(')
      expect(source, rel).not.toContain('placeholder="1-ESPECES"')
    }
    expect(IDENTIFIANT_PAIEMENT_PAR_DEFAUT.toUpperCase()).toContain('ESPECE')
  })
})
