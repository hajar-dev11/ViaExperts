// Lecture d'un document (photo ou PDF) DANS LE NAVIGATEUR de l'utilisateur : aucun fichier n'est envoyé à un service tiers.
//
//   - PDF avec texte (le cas d'un PDF généré par un logiciel) : le texte est lu tel quel avec pdf.js — c'est exact, sans OCR.
//   - PDF scanné (aucun texte) et photos : reconnaissance de caractères avec tesseract.js (WebAssembly). Le moteur et le
//     dictionnaire français sont servis par le site lui-même (`/ocr/…`, voir scripts/copier-ocr.mjs) et ne sont chargés qu'à
//     la première analyse (import dynamique) : le reste de l'application n'est pas alourdi.
//
// La lecture OCR n'est jamais parfaite (photo floue, tableau penché…) : le résultat est toujours à vérifier par une personne.
// Les dépendances sont injectables (`pdfjs`, `creerWorker`) pour être testées sous Node avec les vrais moteurs.

import { normaliserEspaces } from './nombres.js'

export const LIMITES_LECTURE = {
  pagesMax: 5, // pages lues par document
  textePdfMin: 40, // en dessous, le PDF est considéré comme un scan (pas de texte exploitable)
  pixelsMax: 24_000_000, // taille maximale d'une page rendue pour l'OCR (largeur × hauteur)
  echelleRendu: 2, // PDF scanné → image : 2× la taille d'origine (≈ 144 dpi), bon compromis lisibilité / mémoire
}

const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'

/** Chemins du moteur OCR hébergé par le site (copiés dans `public/ocr/` à chaque build). */
export function cheminsOcr(racine = base()) {
  const r = racine.endsWith('/') ? racine : `${racine}/`
  return { workerPath: `${r}ocr/worker.min.js`, corePath: `${r}ocr/core`, langPath: `${r}ocr/lang` }
}

/** Worker de pdf.js, hébergé par le site avec le reste du moteur (copié en `.js` : voir scripts/copier-ocr.mjs). */
export function cheminWorkerPdf(racine = base()) {
  return `${racine.endsWith('/') ? racine : `${racine}/`}ocr/pdf.worker.min.js`
}

export class ErreurLecture extends Error {}

/** Worker tesseract.js (français, moteur LSTM). `onEtat({ etape, progression })` reçoit l'avancement. */
async function creerWorkerParDefaut({ onEtat, chemins = cheminsOcr() } = {}) {
  const { createWorker } = await import('tesseract.js')
  return createWorker('fra', 1, {
    ...chemins,
    gzip: false, // dictionnaire servi non compressé (voir scripts/copier-ocr.mjs)
    logger: (m) => onEtat?.({ etape: 'reconnaissance', detail: m.status, progression: typeof m.progress === 'number' ? m.progress : null }),
  })
}

/**
 * Lignes de texte (avec confiance 0-100) d'une image ou d'un canvas lus par OCR.
 * mode : segmentation de page de tesseract — null (réglage du moteur, utilisé pour les déclarations), '3' (automatique) ou '6' (un seul bloc uniforme, qui lit souvent mieux un
 * tableau de totaux). Les doublures de test sans setParameters ne changent pas de mode.
 */
async function reconnaitre(worker, source, mode = null) {
  if (mode) await worker.setParameters?.({ tessedit_pageseg_mode: mode })
  const { data } = await worker.recognize(source, {}, { blocks: true })
  return (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({ texte: normaliserEspaces(l.text), confiance: Math.round(l.confidence) }))
    .filter((l) => l.texte)
}

/**
 * Photo → lignes de texte. Avec deuxPasses, la photo est lue une seconde fois en « bloc uniforme » : le résultat porte alors
 * lternatives (lignes de cette seconde lecture), que l'analyse des factures compare à la lecture principale.
 */
export async function lireImage(source, { creerWorker = creerWorkerParDefaut, onEtat, deuxPasses = false } = {}) {
  const worker = await creerWorker({ onEtat })
  try {
    onEtat?.({ etape: 'reconnaissance', progression: 0 })
    if (!deuxPasses) return { lignes: await reconnaitre(worker, source), moteur: 'ocr', pages: 1 }
    const lignes = await reconnaitre(worker, source, '3')
    return { lignes, alternatives: [await reconnaitre(worker, source, '6')], moteur: 'ocr', pages: 1 }
  } finally {
    await worker.terminate?.()
  }
}

/**
 * Regroupe les éléments de texte d'une page PDF par ligne visuelle (même ordonnée), de gauche à droite.
 * @param {Array<{ str: string, transform: number[] }>} items éléments renvoyés par `getTextContent()`
 */
export function lignesDepuisElementsPdf(items) {
  const elements = (items ?? [])
    .filter((it) => String(it.str ?? '').trim())
    .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }))
    .sort((a, b) => b.y - a.y) // de haut en bas

  // Un élément appartient à la ligne en cours s'il est à moins de 2 points de son premier élément : une cellule un peu
  // décalée reste sur la même ligne, sans que deux lignes voisines soient confondues.
  const lignes = []
  for (const el of elements) {
    const derniere = lignes[lignes.length - 1]
    if (derniere && Math.abs(derniere.y - el.y) <= 2) derniere.elements.push(el)
    else lignes.push({ y: el.y, elements: [el] })
  }

  return lignes
    .map((l) => normaliserEspaces(l.elements.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')))
    .filter(Boolean)
    .map((texte) => ({ texte }))
}

/**
 * PDF → lignes de texte : texte natif si le PDF en contient, sinon chaque page est rendue en image puis passée à l'OCR.
 * @param {Uint8Array} donnees
 * @param {{ pdfjs: any, creerWorker?: Function, creerCanvas?: Function, onEtat?: Function }} options
 */
export async function lirePdf(donnees, { pdfjs, creerWorker = creerWorkerParDefaut, creerCanvas, onEtat, deuxPasses = false } = {}) {
  let doc
  try {
    doc = await pdfjs.getDocument({ data: donnees, useSystemFonts: true, verbosity: 0 }).promise
  } catch {
    throw new ErreurLecture('Ce PDF est illisible, protégé par un mot de passe ou corrompu.')
  }

  const pages = Math.min(doc.numPages, LIMITES_LECTURE.pagesMax)
  const tronque = doc.numPages > pages
  const natif = []
  for (let n = 1; n <= pages; n += 1) {
    onEtat?.({ etape: 'lecture', detail: `page ${n}/${pages}`, progression: (n - 1) / pages })
    natif.push(...lignesDepuisElementsPdf((await (await doc.getPage(n)).getTextContent()).items))
  }

  const caracteres = natif.reduce((a, l) => a + l.texte.length, 0)
  if (caracteres >= LIMITES_LECTURE.textePdfMin) return { lignes: natif, moteur: 'pdf-texte', pages, tronque, totalPages: doc.numPages }

  // PDF scanné : pas de texte. Chaque page devient une image lue par OCR.
  if (!creerCanvas) throw new ErreurLecture("Ce PDF ne contient pas de texte et ne peut pas être converti en image ici : envoyez-en une photo.")
  const worker = await creerWorker({ onEtat })
  try {
    const lignes = []
    const alternatives = []
    for (let n = 1; n <= pages; n += 1) {
      onEtat?.({ etape: 'reconnaissance', detail: `page ${n}/${pages}`, progression: (n - 1) / pages })
      const page = await doc.getPage(n)
      const vue = page.getViewport({ scale: LIMITES_LECTURE.echelleRendu })
      if (vue.width * vue.height > LIMITES_LECTURE.pixelsMax) throw new ErreurLecture('Une page du PDF est trop grande pour être analysée.')
      const canvas = creerCanvas(Math.ceil(vue.width), Math.ceil(vue.height))
      // intent « print » : pdf.js ne passe alors pas par requestAnimationFrame. Sans cela le rendu s'arrête tant que l'onglet n'est
      // pas affiché (changement d'onglet pendant l'analyse) et l'analyse semble bloquée.
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue, intent: 'print' }).promise
      lignes.push(...await reconnaitre(worker, canvas, deuxPasses ? '3' : null))
      if (deuxPasses) alternatives.push(...await reconnaitre(worker, canvas, '6'))
    }
    return { lignes, ...(deuxPasses ? { alternatives: [alternatives] } : {}), moteur: 'pdf-ocr', pages, tronque, totalPages: doc.numPages }
  } finally {
    await worker.terminate?.()
  }
}

/** Point d'entrée du navigateur : photo ou PDF → `{ lignes, moteur, pages }`. */
export async function lireDocument(fichier, { onEtat } = {}) {
  if (fichier.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = cheminWorkerPdf()
    const donnees = new Uint8Array(await fichier.arrayBuffer())
    return lirePdf(donnees, {
      pdfjs,
      onEtat,
      creerCanvas: (largeur, hauteur) => Object.assign(document.createElement('canvas'), { width: largeur, height: hauteur }),
    })
  }
  return lireImage(fichier, { onEtat })
}

/**
 * Plusieurs documents d'affilée avec UN SEUL moteur OCR (son chargement prend plusieurs secondes : le recharger pour chaque facture
 * serait inutilement long). Un document illisible n'interrompt pas les autres : il est rendu avec son `erreur`.
 * @param {File[]} fichiers
 * @param {{ onEtat?: Function, onFichier?: (index: number) => void, creerWorker?: Function, pdfjs?: any, creerCanvas?: Function }} [options]
 * @returns {Promise<Array<{ fichier: File, lecture?: object, erreur?: string }>>}
 */
export async function lireDocuments(fichiers, { onEtat, onFichier, creerWorker = creerWorkerParDefaut, pdfjs, creerCanvas, deuxPasses = false } = {}) {
  let worker = null
  const partage = async () => {
    worker ??= await creerWorker({ onEtat })
    // Chaque lecture « termine » son worker : ici c'est sans effet, le moteur n'est arrêté qu'à la fin de la dernière lecture.
    return { recognize: (...a) => worker.recognize(...a), setParameters: (...a) => worker.setParameters?.(...a), terminate: async () => {} }
  }
  const resultats = []
  try {
    for (let i = 0; i < fichiers.length; i += 1) {
      const fichier = fichiers[i]
      onFichier?.(i)
      try {
        let lecture
        if (fichier.type === 'application/pdf') {
          const moteurPdf = pdfjs ?? await import('pdfjs-dist/build/pdf.min.mjs')
          if (!pdfjs) moteurPdf.GlobalWorkerOptions.workerSrc = cheminWorkerPdf()
          lecture = await lirePdf(new Uint8Array(await fichier.arrayBuffer()), {
            pdfjs: moteurPdf,
            onEtat,
            deuxPasses,
            creerWorker: partage,
            creerCanvas: creerCanvas ?? ((largeur, hauteur) => Object.assign(document.createElement('canvas'), { width: largeur, height: hauteur })),
          })
        } else {
          lecture = await lireImage(fichier, { creerWorker: partage, onEtat, deuxPasses })
        }
        resultats.push({ fichier, lecture })
      } catch (e) {
        resultats.push({ fichier, erreur: e instanceof ErreurLecture ? e.message : 'Ce document n’a pas pu être lu.' })
      }
    }
  } finally {
    await worker?.terminate?.()
  }
  return resultats
}