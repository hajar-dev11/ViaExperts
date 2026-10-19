// Prix d'une domiciliation : prix par mois × mois PAYÉS. Les mois gratuits allongent la durée (date de fin), jamais la facture.
// Mêmes valeurs que les tests serveur (DomiciliationPrixEtPeriodesTest) : une seule règle des deux côtés.
// Prix HT : le prix par mois est arrondi à l'entier (0,50 → supérieur), le total est entier.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { calculerDateFin, calculerPrixTotal, domiciliationSaisie } from '../modules/domiciliation/utils/domiciliation.js'
import { domiciliationEnFacture } from '../modules/domiciliation/print/factureDomiciliation.js'

const lire = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8')

describe('calculerPrixTotal', () => {
  it('multiplie le prix par mois par les mois PAYÉS seulement', () => {
    expect(calculerPrixTotal('100', 10)).toBe('1000') // 10 payés + 2 gratuits : 10 mois facturés
    expect(calculerPrixTotal(100, '10')).toBe('1000')
  })

  it('sans mois gratuit, le résultat est celui d\'avant', () => {
    expect(calculerPrixTotal('104.17', 12)).toBe('1250') // 104,17 exact × 12 = 1 250,04 → arrondi du total à 1250
    expect(calculerPrixTotal('350', 12)).toBe('4200')
  })

  it('part du prix par mois EXACT puis arrondit le TOTAL à l\'entier (règle du demi), comme le serveur', () => {
    expect(calculerPrixTotal('33.33', 3)).toBe('100') // 99,99 → 100
    expect(calculerPrixTotal('0.1', 3)).toBe('0') // 0,30 → 0
    expect(calculerPrixTotal('100.50', 2)).toBe('201') // 201,00
    expect(calculerPrixTotal('100.49', 2)).toBe('201') // 200,98 → 201
    expect(calculerPrixTotal('100.80', 1)).toBe('101') // 100,80 → 101
    expect(calculerPrixTotal('100.40', 1)).toBe('100') // 100,40 → 100
    expect(calculerPrixTotal('104,17', 12)).toBe('1250') // virgule décimale acceptée
  })

  it('aucun mois payé (que des mois gratuits) : total nul', () => {
    expect(calculerPrixTotal('100', 0)).toBe('0')
    expect(calculerPrixTotal('100', '')).toBe('0')
    expect(calculerPrixTotal('100', -3)).toBe('0')
  })

  it('prix par mois absent ou invalide : null (le formulaire affiche alors un total vide)', () => {
    expect(calculerPrixTotal('', 12)).toBeNull()
    expect(calculerPrixTotal('abc', 12)).toBeNull()
  })
})

describe('durée : les mois gratuits comptent pour la date de fin, pas pour le prix', () => {
  it('10 payés + 2 gratuits : fin à 12 mois, prix sur 10 mois', () => {
    const payes = 10
    const gratuits = 2
    expect(calculerDateFin('2026-01-01', payes + gratuits)).toBe('2027-01-01')
    expect(calculerPrixTotal('100', payes)).toBe('1000')
  })

  it('renouvellement 6 payés + 3 gratuits : fin à 9 mois, prix sur 6 mois', () => {
    expect(calculerDateFin('2026-01-01', 6 + 3)).toBe('2026-10-01')
    expect(calculerPrixTotal('100', 6)).toBe('600')
  })
})

describe('domiciliationSaisie : la section de la page Entreprise est-elle réellement remplie ?', () => {
  it('une date de départ pré-remplie seule (sans durée) ne crée aucune domiciliation', () => {
    expect(domiciliationSaisie({ date_depart: '2026-10-12', mois_payee: '', mois_gratuits: '' })).toBe(false)
    expect(domiciliationSaisie({ date_depart: '2026-10-12', mois_payee: 0, mois_gratuits: 0 })).toBe(false)
    expect(domiciliationSaisie({ date_depart: '', mois_payee: 12 })).toBe(false)
    expect(domiciliationSaisie(null)).toBe(false)
  })

  it('une durée (payée ou gratuite) avec une date de départ : la domiciliation est créée', () => {
    expect(domiciliationSaisie({ date_depart: '2026-10-12', mois_payee: 12, mois_gratuits: '' })).toBe(true)
    expect(domiciliationSaisie({ date_depart: '2026-10-12', mois_payee: '', mois_gratuits: 2 })).toBe(true)
  })
})

describe('facture de domiciliation', () => {
  it('facture les mois payés : quantité = mois payés, prix total = HT, TVA ajoutée, mois gratuits seulement mentionnés', () => {
    const f = domiciliationEnFacture({
      id: 9, prixTotal: '1200.00', moisPayee: 10, moisGratuits: 2, dateDepart: '2026-01-01', dateFin: '2027-01-01',
      dateFacture: '2026-01-01', denomination: 'SOCIETE TEST',
    })

    expect(f.lignes[0].quantite).toBe(10)
    expect(f.totalHt).toBe(1200) // le prix total de l'application est un HT
    expect(f.totalTva).toBe(240) // 20 %
    expect(f.totalTtc).toBe(1440)
    expect(f.lignes[0].prixUnitaire).toBe(120) // 1200 HT / 10 mois facturés
    expect(f.note).toContain('Mois gratuits : 2')
  })

  it('6 mois à 104,17 Dh HT : total HT 625, TVA 125, TTC 750 (et non 625 TTC)', () => {
    const f = domiciliationEnFacture({ id: 1, prixTotal: '625.00', moisPayee: 6, moisGratuits: 6, dateFacture: '2026-10-17', denomination: 'X' })

    expect(f.totalHt).toBe(625)
    expect(f.totalTva).toBe(125)
    expect(f.totalTtc).toBe(750)
    expect(f.lignes[0].prixUnitaire).toBe(104.17)
    expect(f.prixRestant).toBe(750) // aucune date de paiement : rien n'est payé
  })

  it('payée (date de paiement renseignée) : le payé est le TTC, le restant est nul', () => {
    const f = domiciliationEnFacture({ id: 1, prixTotal: '625.00', moisPayee: 6, datePaiement: '2026-10-17', dateFacture: '2026-10-17', denomination: 'X' })

    expect(f.prixPaye).toBe(750)
    expect(f.prixRestant).toBe(0)
  })
})

describe('les trois formulaires appliquent la même règle', () => {
  it.each([
    'modules/domiciliation/pages/DomiciliationForm.jsx',
    'modules/domiciliation/components/DomiciliationActions.jsx',
    'pages/EntrepriseForm.jsx',
  ])('%s calcule le total avec calculerPrixTotal (mois payés), plus avec payés + gratuits', (fichier) => {
    const source = lire(fichier)
    expect(source).toContain('calculerPrixTotal(')
    expect(source).not.toMatch(/\(pm \* /)
    expect(source).not.toMatch(/pm \* dureeMois/)
    expect(source).not.toContain('Prix par mois × (Payée + Gratuits)')
    expect(source).not.toContain('Prix par mois × (Mois Payée + Mois Gratuits)')
  })

  it('la page Entreprise ne pré-remplit plus la date de fin avec « aujourd\'hui » (période d\'un jour) et filtre sur la durée', () => {
    const source = lire('pages/EntrepriseForm.jsx')
    expect(source).toMatch(/date_depart: aujourdhui\(\),\s+date_fin: '',/)
    expect(source).toContain('domiciliationSaisie(domi)')
    expect(source).not.toMatch(/const domiRenseignee = !!domi\.date_depart/)
  })
})
