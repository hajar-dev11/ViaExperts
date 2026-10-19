// Copie les fichiers du moteur OCR local dans `public/ocr/` pour qu'ils soient servis PAR VOTRE PROPRE SITE (dist/ocr/…).
//
// Pourquoi : l'OCR de l'« Importateur de Déclaration » s'exécute dans le navigateur de l'utilisateur (tesseract.js, WebAssembly).
// Par défaut, la bibliothèque télécharge son moteur et son dictionnaire depuis un CDN public ; ici tout est hébergé sur le site
// (aucune requête vers un tiers, aucun document envoyé hors du navigateur, et fonctionnement identique sur LWS, simple hébergement
// de fichiers statiques). Les fichiers sont copiés depuis node_modules (rien n'est téléchargé ici) ; `public/ocr/` n'est pas versionné.
//
// Exécuté automatiquement avant `npm run dev` et `npm run build`.

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nm = (...p) => path.join(racine, 'node_modules', ...p)
const cible = (...p) => path.join(racine, 'public', 'ocr', ...p)

const fichiers = [
  // worker de tesseract.js
  [nm('tesseract.js', 'dist', 'worker.min.js'), cible('worker.min.js')],
  // worker de pdf.js (lecture des PDF). Copié sous l'extension .js : un hébergement Apache dont la table des types ne connaît
  // pas .mjs le servirait en application/octet-stream, et le navigateur refuserait de le charger comme module.
  [nm('pdfjs-dist', 'build', 'pdf.worker.min.mjs'), cible('pdf.worker.min.js')],
  // moteur (avec et sans instructions SIMD) : le worker choisit celui que le navigateur gère
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), cible('core', 'tesseract-core-simd-lstm.wasm.js')],
  [nm('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), cible('core', 'tesseract-core-lstm.wasm.js')],
]

// Dictionnaire français (modèle « best »). Il est servi DÉCOMPRESSÉ (fra.traineddata, ~2 Mo) : certains hébergements Apache ajoutent
// Content-Encoding: gzip aux fichiers .gz, ce qui ferait décompresser le fichier par le navigateur avant que la bibliothèque ne le
// fasse elle-même (lecture impossible). Un fichier non compressé n'a pas ce risque.
const dictionnaireSource = nm('@tesseract.js-data', 'fra', '4.0.0_best_int', 'fra.traineddata.gz')
const dictionnaireCible = cible('lang', 'fra.traineddata')

let copies = 0
for (const [source, destination] of fichiers) {
  if (!existsSync(source)) {
    console.error(`[ocr] fichier introuvable : ${path.relative(racine, source)} — lancez « npm ci » puis réessayez.`)
    process.exit(1)
  }
  if (existsSync(destination) && statSync(destination).size === statSync(source).size) continue
  mkdirSync(path.dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  copies += 1
}
if (!existsSync(dictionnaireSource)) {
  console.error('[ocr] dictionnaire introuvable : lancez « npm ci » puis réessayez.')
  process.exit(1)
}
const dictionnaire = gunzipSync(readFileSync(dictionnaireSource))
if (!existsSync(dictionnaireCible) || statSync(dictionnaireCible).size !== dictionnaire.length) {
  mkdirSync(path.dirname(dictionnaireCible), { recursive: true })
  writeFileSync(dictionnaireCible, dictionnaire)
  copies += 1
}

console.log(copies > 0 ? `[ocr] ${copies} fichier(s) copié(s) dans public/ocr` : '[ocr] public/ocr déjà à jour')
