// Règle d'arrondi du PRIX TOTAL (domiciliation) : décimale < 0,50 → on la supprime ; ≥ 0,50 → +1 sur la partie entière.
// Mêmes valeurs que le test serveur (tests/Unit/PrixTotalArrondiTest.php) : une seule règle des deux côtés.
// Le prix par mois (104,17…) et les autres montants ne sont PAS concernés par ce fichier : seul le total est arrondi.
import { describe, expect, it } from 'vitest'
import { arrondirPrix, totauxDocument } from '../utils/arrondi.js'
import { calculerPrixTotal } from '../modules/domiciliation/utils/domiciliation.js'

const EXEMPLES = [
  ['1250.30', 1250], // décimale < 0,50
  ['1250.49', 1250], // juste sous le demi
  ['1250.50', 1251], // exactement 0,50
  ['1250.75', 1251], // décimale > 0,50
  ['1250.00', 1250], // déjà entier : inchangé
]

describe('prix total : règle du demi (< 0,50 inférieur, ≥ 0,50 supérieur)', () => {
  it.each(EXEMPLES)('arrondirPrix(%s) = %i', (saisie, attendu) => {
    expect(arrondirPrix(saisie)).toBe(attendu)
  })

  it('accepte la virgule décimale de la saisie française', () => {
    expect(arrondirPrix('1250,49')).toBe(1250)
    expect(arrondirPrix('1250,50')).toBe(1251)
  })

  it.each(EXEMPLES)('le total calculé (1 mois payé × %s) = %i', (prixParMois, attendu) => {
    expect(calculerPrixTotal(prixParMois, 1)).toBe(String(attendu))
  })

  it('le total est arrondi, pas le prix par mois : 6 mois × 104,17 = 625,02 → 625', () => {
    expect(calculerPrixTotal('104.17', 6)).toBe('625')
    expect(calculerPrixTotal('104.17', 12)).toBe('1250') // 1 250,04
    expect(calculerPrixTotal('104.50', 5)).toBe('523') // 522,50 → 523
  })
})

describe('totaux d\'un document : prix unitaires avec centimes, TOTAL HT arrondi', () => {
  it('6 mois à 104,17 Dh : total HT 625, TVA 125, TTC 750', () => {
    expect(totauxDocument([{ brut: 6 * 104.17, remise: 0, tva: 20 }])).toEqual({ ht: 625, remise: 0, netHt: 625, tva: 125, ttc: 750 })
  })

  it.each([
    [1250.3, 1250], // < 0,50
    [1250.49, 1250],
    [1250.5, 1251], // = 0,50
    [1250.75, 1251], // > 0,50
    [1250.0, 1250],
  ])('total HT %s → %i', (brut, attendu) => {
    expect(totauxDocument([{ brut, remise: 0, tva: 0 }]).netHt).toBe(attendu)
  })

  it('plusieurs lignes : somme exacte des lignes (614,02) arrondie à 614 ; TVA sur le total arrondi', () => {
    const t = totauxDocument([
      { brut: 3 * 104.17, remise: 0, tva: 20 },
      { brut: 2 * 100.51, remise: 0, tva: 20 },
      { brut: 100.49, remise: 0, tva: 20 },
    ])
    expect(t).toEqual({ ht: 614, remise: 0, netHt: 614, tva: 122.8, ttc: 736.8 })
  })

  it('avec remise : le net est arrondi, HT − remise = net', () => {
    const t = totauxDocument([{ brut: 1000.3, remise: 100.1, tva: 20 }])
    expect(t).toEqual({ ht: 1000.1, remise: 100.1, netHt: 900, tva: 180, ttc: 1080 })
  })

  it('remise plafonnée au total de la ligne, document vide = zéros', () => {
    expect(totauxDocument([{ brut: 100, remise: 500, tva: 20 }]).netHt).toBe(0)
    expect(totauxDocument([])).toEqual({ ht: 0, remise: 0, netHt: 0, tva: 0, ttc: 0 })
  })
})
