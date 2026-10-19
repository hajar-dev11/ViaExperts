// Lecture réelle des documents d'exemple avec les VRAIS moteurs (pdf.js et tesseract.js, exécutés sous Node, en local) :
// c'est la preuve concrète que l'extraction fonctionne sur les exemples fournis — et ses limites (voir les commentaires).
// Les branches impossibles à exécuter sous Node (rendu d'un PDF scanné sur un canvas) sont testées avec des doublures.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { analyserDeclaration } from '../utils/ocr/analyseDeclaration.js'
import { ErreurLecture, LIMITES_LECTURE, cheminWorkerPdf, cheminsOcr, lignesDepuisElementsPdf, lireImage, lirePdf } from '../utils/ocr/lectureDocument.js'

const dossier = import.meta.dirname
const exemplePng = path.join(dossier, 'fixtures/declaration_TVA_CA3_exemple.png')
const exemplePdf = path.join(dossier, 'fixtures/declaration_TVA_CA3_exemple.pdf')
const resume = (r) => r.lignes.map((l) => [l.ligne_ref, l.ht, l.tva])

describe('lecture réelle du PDF d\'exemple (texte natif, sans OCR)', () => {
  it('extrait le texte du PDF et l\'analyse correctement', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

    const lecture = await lirePdf(new Uint8Array(fs.readFileSync(exemplePdf)), { pdfjs })
    const r = analyserDeclaration(lecture.lignes, { moteur: lecture.moteur })

    expect(lecture).toMatchObject({ moteur: 'pdf-texte', pages: 2, tronque: false })
    expect(r.entete).toMatchObject({ periode_type: 'mois', periode_valeur: 10, annee: 2026 })
    expect(resume(r)).toEqual([['08', 50000, 10000], ['19', 2000, 400], ['20', 18000, 3600], ['22', null, 0]])
    expect(r.totaux).toEqual({ collectee: 10000, deductible: 4000, tvaNette: 6000 })
  }, 30000)

  it('un PDF scanné (une image, aucun texte) est reconnu comme tel avec le vrai pdf.js ; sans canvas la lecture est refusée proprement', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const scan = new Uint8Array(fs.readFileSync(path.join(dossier, 'fixtures/declaration_TVA_CA3_scan.pdf')))

    // Sous Node il n'y a pas de canvas : le rendu de la page puis l'OCR sont vérifiés dans le NAVIGATEUR (voir le rapport).
    await expect(lirePdf(scan, { pdfjs })).rejects.toThrow(/ne contient pas de texte/)
  }, 30000)

  it('un fichier qui n\'est pas un PDF valide donne un message clair', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    await expect(lirePdf(new TextEncoder().encode('ceci n\'est pas un pdf'), { pdfjs })).rejects.toThrow(ErreurLecture)
    await expect(lirePdf(new TextEncoder().encode('ceci n\'est pas un pdf'), { pdfjs })).rejects.toThrow(/illisible|protégé|corrompu/)
  }, 30000)
})

describe('lecture réelle de la photo d\'exemple (OCR tesseract.js, français, en local)', () => {
  it('lit la photo : les lignes et les totaux sont retrouvés ; la lecture reste « à vérifier »', async () => {
    const { createWorker } = await import('tesseract.js')
    const creerWorker = () => createWorker('fra', 1, {
      langPath: path.resolve(dossier, '../../node_modules/@tesseract.js-data/fra/4.0.0_best_int'), gzip: true, cacheMethod: 'none',
    })

    const lecture = await lireImage(exemplePng, { creerWorker })
    const r = analyserDeclaration(lecture.lignes, { moteur: lecture.moteur })

    expect(lecture.moteur).toBe('ocr')
    expect(r.entete).toMatchObject({ periode_type: 'mois', periode_valeur: 10, annee: 2026, tauxDocument: 20 })
    expect(resume(r)).toEqual([['08', 50000, 10000], ['19', 2000, 400], ['20', 18000, 3600], ['22', null, 0]])
    expect(r.totaux).toEqual({ collectee: 10000, deductible: 4000, tvaNette: 6000 })
    expect(r.controles.every((c) => c.niveau === 'ok')).toBe(true)
    // L'OCR a lu « 3.600,00 » au lieu de « 3 600,00 » : signalé, et la ligne n'est pas validée d'office.
    expect(r.lignes.find((l) => l.ligne_ref === '20').incertains.tva).toMatch(/format inhabituel/)
    expect(r.statut).toBe('partielle')
  }, 90000)
})

describe('regroupement du texte d\'un PDF par ligne', () => {
  const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] })

  it('trie les lignes de haut en bas et les cellules de gauche à droite, en tolérant un léger décalage vertical', () => {
    const lignes = lignesDepuisElementsPdf([
      item('2 000,00 €', 400, 599), item('Biens', 100, 600), item('19', 50, 601), item('Titre', 50, 700), item(' ', 10, 600),
    ])
    expect(lignes).toEqual([{ texte: 'Titre' }, { texte: '19 Biens 2 000,00 €' }])
  })

  it('ignore les éléments vides et accepte une page sans texte', () => {
    expect(lignesDepuisElementsPdf([item('  ', 1, 1)])).toEqual([])
    expect(lignesDepuisElementsPdf(undefined)).toEqual([])
  })
})

describe('PDF scanné (doublures : pas de canvas sous Node)', () => {
  const faussePage = (items) => ({
    getTextContent: async () => ({ items }),
    getViewport: ({ scale }) => ({ width: 100 * scale, height: 140 * scale }),
    render: () => ({ promise: Promise.resolve() }),
  })
  const fauxPdfjs = (pages) => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: pages.length, getPage: async (n) => pages[n - 1] }) }) })
  const faussesLignes = [{ texte: '19 Biens 2 000,00 € 400,00 €', confiance: 91 }]
  const faussesDeps = () => {
    const worker = { recognize: vi.fn(async () => ({ data: { blocks: [{ paragraphs: [{ lines: [{ text: '19 Biens 2 000,00 € 400,00 €', confidence: 91 }] }] }] } })), terminate: vi.fn() }
    return { worker, creerWorker: async () => worker, creerCanvas: () => ({ getContext: () => ({}) }) }
  }

  it('un PDF sans texte est rendu page par page puis lu par OCR', async () => {
    const { worker, creerWorker, creerCanvas } = faussesDeps()
    const lecture = await lirePdf(new Uint8Array(), { pdfjs: fauxPdfjs([faussePage([]), faussePage([])]), creerWorker, creerCanvas })

    expect(lecture).toMatchObject({ moteur: 'pdf-ocr', pages: 2 })
    expect(lecture.lignes).toEqual([...faussesLignes, ...faussesLignes])
    expect(worker.recognize).toHaveBeenCalledTimes(2)
    expect(worker.terminate).toHaveBeenCalledTimes(1) // le moteur est toujours libéré
  })

  it("le rendu d'une page scannée n'utilise pas requestAnimationFrame (intent « print »), pour ne pas se bloquer dans un onglet masqué", async () => {
    const { creerWorker, creerCanvas } = faussesDeps()
    const page = faussePage([])
    page.render = vi.fn(() => ({ promise: Promise.resolve() }))

    await lirePdf(new Uint8Array(), { pdfjs: fauxPdfjs([page]), creerWorker, creerCanvas })

    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({ intent: 'print' }))
  })

  it('refuse proprement un PDF sans texte quand il ne peut pas être rendu en image', async () => {
    await expect(lirePdf(new Uint8Array(), { pdfjs: fauxPdfjs([faussePage([])]) })).rejects.toThrow(/ne contient pas de texte/)
  })

  it('limite le nombre de pages lues et le signale', async () => {
    const texte = [{ str: 'Déclaration de TVA – période de test avec assez de texte pour ne pas être un scan', transform: [1, 0, 0, 1, 0, 0] }]
    const pages = Array.from({ length: LIMITES_LECTURE.pagesMax + 3 }, () => faussePage(texte))

    const lecture = await lirePdf(new Uint8Array(), { pdfjs: fauxPdfjs(pages) })

    expect(lecture).toMatchObject({ moteur: 'pdf-texte', pages: LIMITES_LECTURE.pagesMax, tronque: true, totalPages: LIMITES_LECTURE.pagesMax + 3 })
  })

  it('refuse une page trop grande pour la mémoire et libère le moteur', async () => {
    const { worker, creerWorker, creerCanvas } = faussesDeps()
    const geante = { ...faussePage([]), getViewport: () => ({ width: 20000, height: 20000 }) }

    await expect(lirePdf(new Uint8Array(), { pdfjs: fauxPdfjs([geante]), creerWorker, creerCanvas })).rejects.toThrow(/trop grande/)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})

describe('moteur hébergé par le site', () => {
  it('les chemins du moteur pointent vers le site lui-même (aucun CDN)', () => {
    const chemins = cheminsOcr('/')
    expect(chemins).toEqual({ workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang' })
    expect(Object.values(cheminsOcr('/app')).every((c) => c.startsWith('/app/ocr/'))).toBe(true)
    expect(JSON.stringify(chemins)).not.toMatch(/https?:|cdn/i)
  })

  it('le worker de pdf.js est un fichier .js du site (jamais .mjs, dont le type MIME dépend du serveur)', () => {
    expect(cheminWorkerPdf('/')).toBe('/ocr/pdf.worker.min.js')
    expect(cheminWorkerPdf('/app')).toBe('/app/ocr/pdf.worker.min.js')
    const source = fs.readFileSync(path.join(dossier, '../utils/ocr/lectureDocument.js'), 'utf8')
    expect(source).not.toMatch(/\.mjs\?url/)
  })

  it('la source du lecteur ne contient aucune adresse externe', () => {
    const source = fs.readFileSync(path.join(dossier, '../utils/ocr/lectureDocument.js'), 'utf8')
    expect(source).not.toMatch(/https?:\/\/(?!www\.w3)/)
  })
})
