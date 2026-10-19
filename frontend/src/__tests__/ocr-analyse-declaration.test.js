// Interprétation du texte d'une déclaration TVA (PDF ou photo) : montants, période, lignes, contrôles, valeurs manquantes.
// Les fixtures `sortie-moteurs.json` sont la sortie RÉELLE des moteurs (tesseract.js pour l'image, pdf.js pour le PDF) sur les
// exemples fournis : l'OCR s'y trompe parfois (point au lieu d'espace, lignes parasites), et l'analyse doit s'en accommoder.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyserDeclaration, detecterTypeDocument, signalementsFormulaire, versLignesFormulaire } from '../utils/ocr/analyseDeclaration.js'
import { arrondir, lireMontant, trouverMontants } from '../utils/ocr/nombres.js'

const moteurs = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures/sortie-moteurs.json'), 'utf8'))

describe('lireMontant', () => {
  it.each([
    ['50 000,00 €', 50000, false],
    ['50 000,00 €', 50000, false],
    ['2000,00€', 2000, false],
    ['0,00', 0, false],
    ['-1 234,50', -1234.5, false],
    ['12,5', 12.5, false],
    ['1 234', 1234, false],
    ['1,234.56', 1234.56, false],
  ])('lit « %s »', (brut, valeur, point) => {
    expect(lireMontant(brut)).toEqual({ valeur, point })
  })

  it("lit « 2.000,00 » (espace lue comme un point par l'OCR) mais le signale", () => {
    expect(lireMontant('3.600,00 €')).toEqual({ valeur: 3600, point: true })
  })

  it("ne devine rien : texte, vide ou format invalide donnent null", () => {
    for (const brut of ['abc', '', '  ', '12,345,6', '1.2.3']) expect(lireMontant(brut).valeur).toBeNull()
  })
})

describe('trouverMontants', () => {
  it("trouve les montants avec décimales, pas les numéros de ligne, années, pourcentages ni références", () => {
    expect(trouverMontants('08 Ventes à taux normal 50 000,00 € 10 000,00 €').map((m) => m.brut)).toEqual(['50 000,00', '10 000,00'])
    expect(trouverMontants('Période : octobre 2026 – Taux unique 20 %')).toEqual([])
    expect(trouverMontants('TVA brute (ligne 16)')).toEqual([])
    expect(trouverMontants('22 Report du crédit de TVA 0,00€').map((m) => m.brut)).toEqual(['0,00'])
  })

  it('arrondit sans erreur de virgule flottante', () => {
    expect(arrondir(1.005)).toBe(1.01)
    expect(arrondir(0.1 + 0.2)).toBe(0.3)
  })
})

describe('analyse du PDF (texte natif)', () => {
  const r = analyserDeclaration(moteurs.natif, { moteur: 'pdf-texte' })

  it('lit la période, le taux écrit dans le document et ne reprend pas le régime comme valeur du formulaire', () => {
    expect(r.entete).toMatchObject({ periode_type: 'mois', periode_valeur: 10, annee: 2026, tauxDocument: 20 })
    expect(r.entete.regimeTexte).toBe('réel normal')
    expect(r.entete.client_if).toBeNull()
  })

  it('extrait les lignes des sections « TVA collectée » et « TVA déductible », pas les hypothèses ni le résultat', () => {
    expect(r.lignes.map((l) => [l.section, l.ligne_ref, l.designation, l.ht, l.tva])).toEqual([
      ['collectee', '08', 'Ventes à taux normal', 50000, 10000],
      ['deductible', '19', 'Biens constituant des immobilisations', 2000, 400],
      ['deductible', '20', 'Autres biens et services', 18000, 3600],
      ['deductible', '22', 'Report du crédit de TVA', null, 0],
    ])
  })

  it('reprend le taux écrit (TVA (20 %)), calcule le TTC = HT + TVA, et ne coche AUCUNE ligne (collectée ou déductible)', () => {
    const [vente, immo, autres, report] = r.lignes
    expect(immo).toMatchObject({ taux: 20, ttc: 2400, inclure: false, incertains: {} })
    expect(autres).toMatchObject({ taux: 20, ttc: 21600, inclure: false })
    expect(r.lignes.map((l) => l.inclure)).toEqual([false, false, false, false]) // c'est l'utilisateur qui choisit
    expect(vente.section).toBe('collectee')
    expect(report).toMatchObject({ ht: null, ttc: null, inclure: false })
    expect(report.incertains.ht).toMatch(/Base HT/)
  })

  it('relève les totaux du document et vérifie la cohérence sans modifier aucun montant', () => {
    expect(r.totaux).toEqual({ collectee: 10000, deductible: 4000, tvaNette: 6000 })
    expect(r.controles.map((c) => c.niveau)).toEqual(['ok', 'ok', 'ok'])
    expect(r.controles[1].message).toMatch(/TVA déductible/)
  })

  it('est « partielle » : une ligne n\'a qu\'un montant (colonne indéterminée) et doit être confirmée', () => {
    expect(r.statut).toBe('partielle')
    expect(r.nonReconnues).toEqual([])
  })
})

describe("analyse de la photo (sortie réelle de l'OCR, avec ses erreurs)", () => {
  const r = analyserDeclaration(moteurs.ocr, { moteur: 'ocr' })

  it('retrouve la période, le taux et les mêmes lignes malgré les lignes parasites ("cor", "coro")', () => {
    expect(r.entete).toMatchObject({ periode_type: 'mois', periode_valeur: 10, annee: 2026, tauxDocument: 20 })
    expect(r.lignes.map((l) => [l.ligne_ref, l.ht, l.tva])).toEqual([['08', 50000, 10000], ['19', 2000, 400], ['20', 18000, 3600], ['22', null, 0]])
    expect(r.totaux).toEqual({ collectee: 10000, deductible: 4000, tvaNette: 6000 })
  })

  it('signale le montant lu avec un point (« 3.600,00 ») sans le modifier', () => {
    const autres = r.lignes.find((l) => l.ligne_ref === '20')
    expect(autres.tva).toBe(3600)
    expect(autres.incertains.tva).toMatch(/format inhabituel/)
    expect(autres.inclure).toBe(false)
  })

  it('les contrôles arithmétiques confirment les montants lus', () => {
    expect(r.controles.every((c) => c.niveau === 'ok')).toBe(true)
    expect(r.statut).toBe('partielle')
    expect(r.confianceMoyenne).toBeGreaterThan(70)
  })
})

describe('contrôles et valeurs manquantes', () => {
  const entete = ['Déclaration de TVA – CA3 mensuelle', 'Période : octobre 2026 – Taux unique 20 %', '3. TVA déductible', 'Ligne Désignation Base HT TVA (20 %)']

  it('signale une TVA différente de base × taux SANS la corriger', () => {
    const r = analyserDeclaration([...entete, '19 Biens 2 000,00 € 500,00 €', '23 Total TVA déductible 500,00 €'])
    const [l] = r.lignes
    expect(l.tva).toBe(500) // valeur lue conservée
    expect(l.incertains.tva).toMatch(/400\.00/)
    expect(l.remarques.join(' ')).toMatch(/≠ base × 20 %/)
    expect(l.inclure).toBe(false)
  })

  it('signale une somme de lignes différente du total du document', () => {
    const r = analyserDeclaration([...entete, '19 Biens 2 000,00 € 400,00 €', '20 Services 1 000,00 € 200,00 €', '23 Total TVA déductible 700,00 €'])
    expect(r.controles).toEqual([expect.objectContaining({ niveau: 'alerte', message: expect.stringContaining('600.00') })])
    expect(r.statut).toBe('partielle')
  })

  it("n'applique aucun taux quand le document n'en écrit pas : champ vide, signalé, taux implicite seulement indiqué", () => {
    const r = analyserDeclaration(['Déclaration de TVA', 'Période : mars 2026', '3. TVA déductible', 'Ligne Désignation Base HT TVA', '19 Biens 1 000,00 € 100,00 €'])
    const [l] = r.lignes
    expect(l.taux).toBeNull()
    expect(l.incertains.taux).toMatch(/non indiqué/)
    expect(l.remarques.join(' ')).toMatch(/taux implicite : 10 %/)
    expect(versLignesFormulaire(r.lignes.map((x) => ({ ...x, inclure: true })))[0].taux).toBe('')
    expect(r.avertissements.join(' ')).toMatch(/Taux non indiqué/)
  })

  it('période absente ou non reconnue : signalée, jamais inventée', () => {
    const r = analyserDeclaration(['3. TVA déductible', '19 Biens 2 000,00 € 400,00 €'])
    expect(r.entete.periode_type).toBeNull()
    expect(r.entete.annee).toBeNull()
    expect(r.avertissements.join(' ')).toMatch(/Période non reconnue/)
  })

  it('reconnaît un trimestre et un IF écrits dans le document', () => {
    const r = analyserDeclaration(['Déclaration TVA – 2ème trimestre 2026', 'IF : 12345678 – ICE : 001234567000012'])
    expect(r.entete).toMatchObject({ periode_type: 'trimestre', periode_valeur: 2, annee: 2026, client_if: '12345678', ice: '001234567000012' })
  })

  it('une ligne contenant des montants mais hors modèle est comptée, pas interprétée', () => {
    const r = analyserDeclaration(['3. TVA déductible', 'Remarque 400,00 € divers 30,00 €', '19 Biens 2 000,00 € 400,00 €'])
    expect(r.nonReconnues).toEqual(['Remarque 400,00 € divers 30,00 €'])
    expect(r.avertissements.join(' ')).toMatch(/n'ont pas pu être interprétées/)
  })

  it('un document sans texte exploitable est « illisible », sans aucune ligne inventée', () => {
    for (const entree of [[], null, undefined, ['xx'], [{ texte: 'zzz', confiance: 12 }, { texte: 'q', confiance: 5 }, { texte: 'rr', confiance: 8 }]]) {
      const r = analyserDeclaration(entree)
      expect(r.statut).toBe('illisible')
      expect(r.lignes).toEqual([])
    }
  })

  it('du texte lisible sans tableau reconnaissable est « partielle » (rien à reprendre)', () => {
    const r = analyserDeclaration(['Ceci est une lettre', 'adressée au client', 'pour le rendez-vous de lundi', 'cordialement'])
    expect(r.statut).toBe('partielle')
    expect(r.lignes).toEqual([])
  })

  it('une lecture peu fiable est signalée sur les montants de la ligne', () => {
    const r = analyserDeclaration([...entete, { texte: '19 Biens 2 000,00 € 400,00 €', confiance: 55 }])
    expect(r.lignes[0].incertains.ht).toMatch(/peu fiable \(confiance 55 %\)/)
    expect(r.lignes[0].inclure).toBe(false)
  })
})

describe('passage au formulaire de déclaration', () => {
  const r = analyserDeclaration(moteurs.natif)

  const choisir = (refs) => r.lignes.map((l) => ({ ...l, inclure: refs.includes(l.ligne_ref) }))

  it("sans sélection de l'utilisateur, aucune ligne n'est reprise", () => {
    expect(versLignesFormulaire(r.lignes)).toEqual([])
    expect(signalementsFormulaire(r.lignes)).toEqual({})
  })

  it('ne reprend que les lignes sélectionnées, avec les champs du formulaire existant et sans valeur inventée', () => {
    expect(versLignesFormulaire(choisir(['19', '20']))).toEqual([
      expect.objectContaining({ ordre_ref: '19', designation: 'Biens constituant des immobilisations', ht: 2000, tva: 400, ttc: 2400, taux: 20, fact_num: '', identifiant_fiscal: '', date_fac: '' }),
      expect.objectContaining({ ordre_ref: '20', ht: 18000, tva: 3600, ttc: 21600, taux: 20 }),
    ])
  })

  it('la sélection manuelle est respectée : une ligne cochée avec un montant manquant garde un champ vide', () => {
    const lignes = r.lignes.map((l) => ({ ...l, inclure: l.ligne_ref === '22' }))
    expect(versLignesFormulaire(lignes)).toEqual([expect.objectContaining({ ordre_ref: '22', ht: '', tva: 0, ttc: '', taux: 20 })])
    expect(signalementsFormulaire(lignes)).toEqual({ '0.ht': expect.stringMatching(/Base HT/) })
  })
})

describe('nature du document : jamais une facture ou un relevé pris pour une déclaration', () => {
  const facture = [
    'FACTURE N° FAC-2026-001', 'Date de la facture : 12/10/2026', 'Client : SOCIETE EXEMPLE',
    '1 Domiciliation 12 mois 1 250,00 € 250,00 €', '2 Frais de dossier 400,00 € 80,00 €', 'Total HT 1 650,00 €', 'Total TTC 1 980,00 €', 'Net à payer 1 980,00 €',
  ]
  const releve = [
    'RELEVÉ DE COMPTE – octobre 2026', 'IBAN : FR76 3000 6000 0112 3456 7890 189', 'Solde initial 12 000,00 €',
    '03/10 Virement client 1 500,00 € 500,00 €', 'Débit Crédit', 'Solde final 12 000,00 €',
  ]

  it('reconnaît une déclaration de TVA (titre « Déclaration de TVA », CA3, relevé de déductions)', () => {
    expect(analyserDeclaration(moteurs.natif).typeDocument).toMatchObject({ code: 'declaration_tva' })
    expect(analyserDeclaration(moteurs.ocr).typeDocument.code).toBe('declaration_tva')
    expect(detecterTypeDocument(['Relevé de déductions – 2e trimestre 2026']).code).toBe('declaration_tva')
    expect(detecterTypeDocument(['Déclaration TVA mensuelle', 'Période : mars 2026']).code).toBe('declaration_tva')
  })

  it('une facture est refusée : aucune ligne, aucune période, aucun montant extraits', () => {
    const r = analyserDeclaration(facture)

    expect(r.typeDocument.code).toBe('facture')
    expect(r.statut).toBe('hors_perimetre')
    expect(r.lignes).toEqual([])
    expect(r.entete).toMatchObject({ periode_type: null, annee: null, client_if: null })
    expect(r.totaux).toEqual({ collectee: null, deductible: null, tvaNette: null })
    expect(r.avertissements.join(' ')).toMatch(/facture.*pas une déclaration de TVA/)
  })

  it('un relevé bancaire est refusé de la même façon', () => {
    const r = analyserDeclaration(releve)

    expect(r.typeDocument.code).toBe('releve_bancaire')
    expect(r.statut).toBe('hors_perimetre')
    expect(r.lignes).toEqual([])
    expect(r.avertissements.join(' ')).toMatch(/relevé bancaire/)
  })

  it('le mot « facture » dans le corps d\'une déclaration ne la transforme pas en facture', () => {
    const r = analyserDeclaration(['Déclaration de TVA – CA3 mensuelle', 'Période : octobre 2026', '3. TVA déductible', 'Ligne Désignation Base HT TVA (20 %)',
      '19 Achats (voir facture fournisseur) 1 000,00 € 200,00 €'])

    expect(r.typeDocument.code).toBe('declaration_tva')
    expect(r.lignes).toHaveLength(1)
  })

  it('un document dont le type est inconnu garde ses lignes mais avec un avertissement explicite (jamais « réussi »)', () => {
    const r = analyserDeclaration(['Tableau récapitulatif', '3. TVA déductible', '19 Biens 2 000,00 € 400,00 €'])

    expect(r.typeDocument.code).toBe('inconnu')
    expect(r.lignes).toHaveLength(1)
    expect(r.avertissements.join(' ')).toMatch(/type de ce document n'a pas pu être identifié/)
    expect(r.statut).toBe('partielle')
  })

  it('des textes sans rapport ne sont reconnus comme rien', () => {
    expect(detecterTypeDocument(['Bonjour', 'rendez-vous lundi']).code).toBe('inconnu')
    expect(detecterTypeDocument([]).code).toBe('inconnu')
    expect(detecterTypeDocument(undefined).code).toBe('inconnu')
  })
})

describe('montants ambigus ou dans un format non géré', () => {
  const base = ['Déclaration de TVA – CA3 mensuelle', 'Période : octobre 2026 – Taux unique 20 %', '3. TVA déductible', 'Ligne Désignation Base HT TVA (20 %)']

  it('un montant au format anglais (« 2,000.00 ») n\'est PAS lu : la ligne est signalée, rien n\'est deviné', () => {
    const r = analyserDeclaration([...base, '19 Biens 2,000.00 € 400.00 €'])

    expect(r.lignes).toEqual([])
    expect(r.nonReconnues).toEqual(['19 Biens 2,000.00 € 400.00 €'])
    expect(r.avertissements.join(' ')).toMatch(/n'ont pas pu être interprétées/)
  })

  it('un nombre sans décimales (« 2000 ») n\'est pas pris pour un montant', () => {
    expect(analyserDeclaration([...base, '19 Biens 2000 400']).lignes).toEqual([])
  })

  it('un point comme séparateur de milliers (« 3.600,00 ») est lu mais signalé et jamais coché', () => {
    const r = analyserDeclaration([...base, '19 Biens 18 000,00 € 3.600,00 €'])

    expect(r.lignes[0]).toMatchObject({ tva: 3600, inclure: false })
    expect(r.lignes[0].incertains.tva).toMatch(/format inhabituel/)
  })

  it('un montant négatif est lu avec son signe', () => {
    const r = analyserDeclaration([...base, '22 Régularisation -1 000,00 € -200,00 €'])
    expect(r.lignes[0]).toMatchObject({ ht: -1000, tva: -200 })
  })
})