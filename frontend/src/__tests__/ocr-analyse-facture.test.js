// Extraction des données d'une FACTURE (Importateur TVA) : tests sur la lecture réelle (OCR tesseract.js) de trois factures
// d'exemple — une photo de facture manuscrite/tamponnée, un bon de livraison photographié et un PDF scanné — dont les noms, ICE, IF et
// numéros ont été remplacés par des valeurs fictives (le « bruit » de l'OCR est conservé tel quel : c'est lui qui est testé).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyserFacture, analyserFacturePasses, montantsDe, versDeclaration } from '../utils/ocr/analyseFacture.js'
import { montantEnLettres } from '../utils/ocr/montantEnLettres.js'
import { construireOcr } from '../utils/ocr/importFactures.js'
import { lireDocuments } from '../utils/ocr/lectureDocument.js'

const dossier = import.meta.dirname
const brut = JSON.parse(fs.readFileSync(path.join(dossier, 'fixtures/factures-ocr.json'), 'utf8'))
// Chaque exemple porte DEUX lectures OCR de la même page : segmentation automatique (lignes) et bloc uniforme (lternatives[0]).
const lectures = (e) => [e.lignes, ...e.alternatives]
const echantillons = Object.fromEntries(Object.entries(brut).map(([cle, e]) => [cle, lectures(e)]))
const analyser = (cle, options) => analyserFacturePasses(echantillons[cle], options)

describe('montants : formats français et anglais, y compris abîmés par l\'OCR', () => {
  it('lit 930,02 · 500.00 · « 500. 00 » · 1 234,56 · 1.234,50 · 0.25', () => {
    expect(montantsDe('Total 930,02 Dh').map((m) => m.valeur)).toEqual([930.02])
    expect(montantsDe('TOTAL HT: 500.00').map((m) => m.valeur)).toEqual([500])
    expect(montantsDe('DONT TVA (20%) : 100. 00').map((m) => m.valeur)).toEqual([100])
    expect(montantsDe('Net 1 234,56').map((m) => m.valeur)).toEqual([1234.56])
    expect(montantsDe('Net 1.234,50').map((m) => m.valeur)).toEqual([1234.5])
    expect(montantsDe('timbre 0.25').map((m) => m.valeur)).toEqual([0.25])
  })

  it('un entier seul (quantité, numéro, année) n\'est jamais pris pour un montant', () => {
    expect(montantsDe('Facture 17022026 du 14-09-2026, quantité 5')).toEqual([])
  })

  it('une seule décimale lue (« 500. 0 ») est signalée comme incomplète', () => {
    expect(montantsDe('TOTAL 500. 0')[0]).toMatchObject({ valeur: 500, incomplet: true })
  })
})

describe('montant en toutes lettres', () => {
  it.each([
    ['CENT VINGT DIRHAMS', 120],
    ['Neuf cent trente DIRHAMS, deux CENTIMES', 930.02],
    ['Mille deux cent cinquante dirhams', 1250],
    ['Quatre-vingt-dix dirhams et cinquante centimes', 90.5],
    ['Deux mille quatre cent quatre-vingts dirhams', 2480],
    ['Soixante-dix-sept DHS', 77],
  ])('« %s » = %s', (texte, attendu) => {
    expect(montantEnLettres(texte)).toBe(attendu)
  })

  it('un mot illisible ou une phrase sans montant donne null (rien n\'est deviné)', () => {
    expect(montantEnLettres('SLE_CENT DIS ET 0.0 CIS')).toBeNull()
    expect(montantEnLettres('Merci de votre confiance')).toBeNull()
    expect(montantEnLettres('DIRHAMS')).toBeNull()
  })
})

describe('facture photographiée (montants sur le bas de page, étiquette HT illisible)', () => {
  const r = analyser('photo', { moteur: 'ocr' })

  it('retrouve le numéro, la date, le fournisseur et ses identifiants', () => {
    expect(r.numero).toBe('17022026')
    expect(r.dateFacture).toBe('2026-09-14')
    expect(r.fournisseur).toMatchObject({ nom: 'ATLAS PIECES SARL', ice: '001234567000011', if: '12345678' })
    expect(r.client.ice).toBe('009876543000022') // le destinataire n'est jamais pris pour le fournisseur
  })

  it('HT 500 + TVA 100 = TTC 600 ; taux 20 % déduit des montants (le « 20 % » est abîmé par l\'OCR)', () => {
    expect([r.ht, r.tva, r.ttc, r.taux]).toEqual([500, 100, 600, 20])
    expect(r.incertains.taux).toMatch(/déduit/)
    expect(r.incertains.ht).toMatch(/confirmé par TTC − TVA/)
    expect(r.controles[0]).toMatchObject({ niveau: 'ok' })
  })
})

describe('bon de livraison / facture photographiée avec un tableau de totaux sur deux lignes', () => {
  const r = analyser('blPhoto', { moteur: 'ocr' })

  it('retrouve le numéro, la date (année sur 2 chiffres), le paiement en espèces et les identifiants du fournisseur', () => {
    expect(r.numero).toBe('C26024363')
    expect(r.dateFacture).toBe('2026-08-11')
    expect(r.modePaiement).toBe('espèces')
    expect(r.fournisseur.ice).toBe('002468135000033') // pas celui du client (ICE sans marqueur d'émetteur)
    expect(r.fournisseur.if).toBe('03600938') // « Identifiant Fiscal » lu « Fincal » par l'OCR
    expect(r.client.ice).toBe('009876543000022')
    expect(r.designation).toBe('INJECTEUR MITS.CANTER-4D32 / DLLA160P3')
  })

  it('les deux lectures de la page sont comparées : celle qui lit le tableau de totaux sans erreur est retenue — HT 775,02 + TVA 155,00 = TTC 930,02', () => {
    expect([r.ht, r.tva, r.ttc, r.taux]).toEqual([775.02, 155, 930.02, 20])
    expect(r.origines).toEqual({ ht: 'lu', tva: 'lu', ttc: 'lu' })
    expect(r.incertains.ht ?? r.incertains.tva ?? r.incertains.ttc).toBeUndefined()
    expect(r.incertains.taux).toMatch(/déduit/) // aucun taux écrit sur cette facture
  })

  it('même avec la seule lecture « bloc uniforme » (TTC lu 230,02, TVA illisible) : le TTC est corrigé par le montant en lettres et la TVA calculée — tout est signalé', () => {
    const seule = analyserFacture(echantillons.blPhoto[1], { moteur: 'ocr' })
    expect([seule.ht, seule.tva, seule.ttc, seule.taux]).toEqual([775.02, 155, 930.02, 20])
    expect(seule.incertains.ttc).toMatch(/230[.,]02/)
    expect(seule.incertains.ttc).toMatch(/lettres/)
    expect(seule.incertains.tva).toMatch(/calculée/)
    expect(seule.statut).toBe('partielle')
  })
})
describe('PDF scanné d\'une facture Via Experts (lecture nette)', () => {
  const r = analyser('pdf', { moteur: 'pdf-ocr' })

  it('numéro « fac 666 », dates de facture et de paiement, espèces, fournisseur', () => {
    expect(r.numero).toBe('fac 666')
    expect(r.dateFacture).toBe('2026-10-06')
    expect(r.datePaiement).toBe('2026-10-06')
    expect(r.modePaiement).toBe('espèces')
    expect(r.fournisseur).toMatchObject({ nom: 'CABINET EXEMPLE', ice: '001357924000044', if: '41424344' })
  })

  it('HT 100 + TVA 20 = TTC 120 (confirmé par le montant en lettres), taux 20 % écrit sur la facture, aucun signalement de montant', () => {
    expect([r.ht, r.tva, r.ttc, r.taux]).toEqual([100, 20, 120, 20])
    expect(r.incertains.ht ?? r.incertains.tva ?? r.incertains.ttc ?? r.incertains.taux).toBeUndefined()
    expect(r.designation).toBe('extration du modèle 7 du registre du commerce')
  })
})

describe('jamais de donnée inventée', () => {
  it('un texte sans facture ne produit aucune valeur', () => {
    const r = analyserFacture(['Bonjour', 'Ceci est un courrier', 'Cordialement'])
    expect([r.ht, r.tva, r.ttc, r.taux]).toEqual([null, null, null, null])
    expect(r.numero).toBe('')
    expect(r.fournisseur).toEqual({ nom: '', ice: '', if: '' })
    expect(r.statut).toBe('illisible')
  })

  it('HT + TVA ≠ TTC : les valeurs lues sont conservées et signalées, rien n\'est « corrigé »', () => {
    const r = analyserFacture([
      { texte: 'FACTURE N° A12', confiance: 95 },
      { texte: 'Total HT 100,00', confiance: 95 },
      { texte: 'Montant TVA 20,00', confiance: 95 },
      { texte: 'Total TTC 150,00', confiance: 95 },
    ])
    expect([r.ht, r.tva, r.ttc]).toEqual([100, 20, 150])
    expect(r.incertains.ttc).toMatch(/≠/)
    expect(r.statut).toBe('partielle')
  })

  it('taux non standard (plusieurs taux) : le taux reste vide et signalé', () => {
    const r = analyserFacture([
      { texte: 'FACTURE N° B7', confiance: 95 },
      { texte: 'Total HT 200,00', confiance: 95 },
      { texte: 'Montant TVA 30,00', confiance: 95 },
      { texte: 'Total TTC 230,00', confiance: 95 },
    ])
    expect([r.ht, r.tva, r.ttc, r.taux]).toEqual([200, 30, 230, null])
    expect(r.incertains.taux).toMatch(/non déterminé/)
  })

  it('taux écrit sur la facture (« TVA 14 % ») confirmé par les montants', () => {
    const r = analyserFacture([
      'FACTURE N° C5',
      'Total HT 100,00 Dh',
      'TVA 14 % 14,00 Dh',
      'Total TTC 114,00 Dh',
    ])
    expect([r.ht, r.tva, r.ttc, r.taux]).toEqual([100, 14, 114, 14])
    expect(r.incertains.taux).toBeUndefined()
  })
})

describe('plusieurs factures → une seule déclaration préremplie', () => {
  it('une ligne par facture, dans l\'ordre ; les valeurs douteuses sont signalées par ligne ; une facture illisible est écartée avec un message', () => {
    const resultats = [
      { fichier: 'a.jpg', analyse: analyser('photo') },
      { fichier: 'b.jpg', analyse: analyser('blPhoto') },
      { fichier: 'c.pdf', analyse: analyser('pdf') },
      { fichier: 'd.png', analyse: analyserFacture(['rien de lisible']) },
    ]
    const d = versDeclaration(resultats)
    expect(d.lignes).toHaveLength(3)
    expect(d.lignes.map((l) => l.ordre_ref)).toEqual(['1', '2', '3'])
    expect(d.lignes.map((l) => l.fact_num)).toEqual(['17022026', 'C26024363', 'fac 666'])
    expect(d.lignes.map((l) => [l.ht, l.tva, l.ttc, l.taux])).toEqual([[500, 100, 600, 20], [775.02, 155, 930.02, 20], [100, 20, 120, 20]])
    expect(d.lignes[1].id_paie).toBe('1-ESPECES')
    expect(d.lignes[0].id_paie).toBe('')
    expect(d.lignes[2]).toMatchObject({ date_fac: '2026-10-06', date_paie: '2026-10-06' })
    expect(d.signalements['1.ttc']).toBeUndefined()
    expect(d.signalements['1.taux']).toMatch(/déduit/)
    expect(d.signalements['2.ht']).toBeUndefined()
    expect(d.avertissements).toHaveLength(1)
    expect(d.avertissements[0]).toMatch(/d\.png/)
  })
})

describe('lecture de plusieurs documents avec un seul moteur OCR', () => {
  it('un seul moteur pour tous les fichiers, deux lectures par photo (segmentation 3 puis 6), arrêt à la fin ; un fichier illisible n\'arrête pas les autres', async () => {
    const appels = []
    let arrets = 0
    let creations = 0
    const creerWorker = async () => {
      creations += 1
      return {
        setParameters: async (p) => { appels.push(p.tessedit_pageseg_mode) },
        recognize: async () => ({ data: { blocks: [{ paragraphs: [{ lines: [{ text: 'Total TTC 120,00 Dh', confidence: 95 }] }] }] } }),
        terminate: async () => { arrets += 1 },
      }
    }
    const fichiers = [new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }), new File([new Uint8Array(10)], 'b.png', { type: 'image/png' })]
    const r = await lireDocuments(fichiers, { creerWorker, deuxPasses: true })

    expect(creations).toBe(1)
    expect(arrets).toBe(1)
    expect(appels).toEqual(['3', '6', '3', '6'])
    expect(r).toHaveLength(2)
    expect(r[0].lecture.lignes[0].texte).toBe('Total TTC 120,00 Dh')
    expect(r[0].lecture.alternatives[0][0].texte).toBe('Total TTC 120,00 Dh')
  })

  it('construireOcr : factures lues, relevé bancaire et document vide écartés avec une courte phrase, en-tête repris seulement d\'une déclaration', () => {
    const documents = [
      { nom: 'f1.png', lecture: { lignes: echantillons.pdf[0], alternatives: echantillons.pdf.slice(1), moteur: 'ocr' } },
      { nom: 'releve.pdf', lecture: { lignes: ['Relevé de compte bancaire', 'IBAN FR76 3000', 'Solde initial 1 000,00'], moteur: 'pdf-texte' } },
      { nom: 'vide.png', erreur: 'document illisible.' },
    ]
    const ocr = construireOcr(documents)
    expect(ocr.fichier).toBe('3 documents')
    expect(ocr.lignes).toHaveLength(1)
    expect(ocr.lignes[0]).toMatchObject({ fact_num: 'fac 666', ht: 100, tva: 20, ttc: 120, taux: 20 })
    expect(ocr.avertissements).toHaveLength(2)
    expect(ocr.avertissements[0]).toMatch(/releve\.pdf.*relevé bancaire/)
    expect(ocr.avertissements[1]).toMatch(/vide\.png/)
    expect(ocr.entete).toEqual({}) // aucune déclaration : ni période, ni IF client inventés
  })
})