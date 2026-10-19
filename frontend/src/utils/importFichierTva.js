// « Importateur de TVA » : lecture d'un fichier Excel (.xlsx), CSV ou export Excel du projet (.xls = tableau HTML) dans le
// navigateur. Le fichier n'est PAS envoyé au serveur : seules les lignes lues le sont (JSON), et le serveur les revérifie
// toutes (types, formats, tailles, doublons) avant d'écrire quoi que ce soit.
//
// Colonnes reconnues = les 13 colonnes des lignes d'une Déclaration TVA (tableau de saisie et export Excel du projet) :
//   OR · FACT NUM · DESIGNATION · HT · TVA · TTC · IF · LIB FRSS · ICE · TAUX · ID PAIE · DATE PAIE · DATE FAC
// HT et TVA sont obligatoires ; TTC est déduit (HT + TVA) quand il est absent ; un taux vide prend la valeur par défaut (20).
//
// Sécurité : taille, extension et signature du fichier contrôlées ; .xlsx lu avec des limites (nombre d'entrées, taille
// décompressée → protection contre les « bombes zip ») ; XML contenant une DTD / des entités refusé ; aucune formule n'est
// évaluée (valeur mise en cache seulement) ; le contenu n'est jamais interprété comme HTML ni exécuté.

import { unzipSync } from 'fflate'

export const LIMITES = {
  tailleMax: 2 * 1024 * 1024, // octets
  lignesMax: 1000, // lignes de données (même limite que le serveur)
  colonnesMax: 60,
  lignesLuesMax: 5000, // garde-fou de lecture d'une feuille démesurée
  entreesZipMax: 300,
  tailleEntreeMax: 12 * 1024 * 1024, // octets décompressés par fichier interne
}

export const EN_TETES_MODELE = ['OR', 'FACT NUM', 'DESIGNATION', 'HT', 'TVA', 'TTC', 'IF', 'LIB FRSS', 'ICE', 'TAUX', 'ID PAIE', 'DATE PAIE', 'DATE FAC']

export const CHAMPS_OBLIGATOIRES = ['ht', 'tva']

/** Libellé affiché de chaque champ. */
export const LIBELLES = {
  ordre_ref: 'OR', fact_num: 'FACT NUM', designation: 'DESIGNATION', ht: 'HT', tva: 'TVA', ttc: 'TTC', identifiant_fiscal: 'IF',
  libelle_fournisseur: 'LIB FRSS', ice: 'ICE', taux: 'TAUX', id_paie: 'ID PAIE', date_paie: 'DATE PAIE', date_fac: 'DATE FAC',
}

// En-tête (réduit à ses lettres et chiffres, sans accents, en majuscules) → champ. Uniquement les libellés du projet :
// ceux de l'export Excel, les noms de champs de la base, et ceux de l'export XML.
const ALIAS = {
  OR: 'ordre_ref', ORDREREF: 'ordre_ref',
  FACTNUM: 'fact_num', NUMEROFACTURE: 'fact_num',
  DESIGNATION: 'designation',
  HT: 'ht', TVA: 'tva', TTC: 'ttc',
  IF: 'identifiant_fiscal', IDENTIFIANTFISCAL: 'identifiant_fiscal',
  LIBFRSS: 'libelle_fournisseur', LIBELLEFOURNISSEUR: 'libelle_fournisseur',
  ICE: 'ice',
  TAUX: 'taux',
  IDPAIE: 'id_paie',
  DATEPAIE: 'date_paie', DATEPAIEMENT: 'date_paie',
  DATEFAC: 'date_fac', DATEFACTURE: 'date_fac',
}

/** Erreur d'un fichier inutilisable : message en français, affiché tel quel. */
export class ErreurFichier extends Error {
  constructor(message) {
    super(message)
    this.name = 'ErreurFichier'
  }
}

export const compacterEntete = (valeur) => String(valeur ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Associe chaque colonne du fichier à un champ de ligne de déclaration.
 * @param {string[]} entetes  première ligne du fichier
 * @returns {{ colonnes: { entete: string, champ: string|null }[], ignorees: string[], manquants: string[], doublons: string[] }}
 */
export function mapperEntetes(entetes) {
  const colonnes = []
  const vus = new Map()
  const doublons = []

  entetes.forEach((brut, index) => {
    const entete = String(brut ?? '').trim()
    const champ = entete ? (ALIAS[compacterEntete(entete)] ?? null) : null
    if (champ) {
      if (vus.has(champ)) doublons.push(LIBELLES[champ])
      else vus.set(champ, index)
    }
    colonnes.push({ entete: entete || `(colonne ${index + 1})`, champ: champ && vus.get(champ) === index ? champ : null })
  })

  return {
    colonnes,
    ignorees: colonnes.filter((c) => !c.champ && c.entete && !c.entete.startsWith('(colonne')).map((c) => c.entete),
    manquants: CHAMPS_OBLIGATOIRES.filter((c) => !vus.has(c)).map((c) => LIBELLES[c]),
    doublons: [...new Set(doublons)],
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Contrôle du fichier
// ---------------------------------------------------------------------------------------------------------------------

const extensionDe = (nom) => (String(nom).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '')

const commencePar = (octets, signature) => signature.every((o, i) => octets[i] === o)

/** Format réel d'après l'extension ET la signature du contenu. Lève `ErreurFichier` sinon. */
export function detecterFormat(nom, octets) {
  const extension = extensionDe(nom)
  if (!['csv', 'xlsx', 'xls'].includes(extension)) {
    throw new ErreurFichier('Format non pris en charge : choisissez un fichier Excel (.xlsx) ou CSV (.csv).')
  }
  if (octets.length === 0) throw new ErreurFichier('Le fichier est vide.')

  const zip = commencePar(octets, [0x50, 0x4b, 0x03, 0x04])
  const ancienExcel = commencePar(octets, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

  if (ancienExcel) {
    throw new ErreurFichier("Ce fichier utilise l'ancien format Excel binaire (.xls) : ouvrez-le dans Excel puis enregistrez-le au format .xlsx ou .csv.")
  }
  if (zip) {
    if (extension !== 'xlsx') throw new ErreurFichier("Le contenu du fichier est un classeur Excel (.xlsx) mais son extension ne correspond pas : renommez-le en .xlsx.")
    return 'xlsx'
  }
  if (extension === 'xlsx') throw new ErreurFichier("Ce fichier n'est pas un classeur Excel (.xlsx) valide : il est peut-être corrompu ou d'un autre format.")

  // Texte : refus de tout contenu binaire (octet nul dans les premiers Ko).
  if (octets.subarray(0, Math.min(octets.length, 8192)).includes(0)) {
    throw new ErreurFichier("Ce fichier n'est pas un fichier texte CSV : il semble binaire.")
  }

  if (extension === 'xls') {
    const debut = decoderTexte(octets.subarray(0, Math.min(octets.length, 4096))).toLowerCase()
    if (!debut.includes('<table')) {
      throw new ErreurFichier("Ce fichier .xls n'est pas un export du projet : ouvrez-le dans Excel puis enregistrez-le au format .xlsx ou .csv.")
    }
    return 'html'
  }

  return 'csv'
}

/** UTF-8 strict ; sinon Windows-1252 (CSV enregistrés par Excel en français). */
export function decoderTexte(octets) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return new TextDecoder('windows-1252').decode(octets)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------------------

/** Lit un CSV (séparateur « ; », « , » ou tabulation détecté ; guillemets, retours à la ligne dans les champs). */
export function lireCsv(texte) {
  let contenu = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte
  contenu = contenu.replace(/\r\n?/g, '\n')

  // Séparateur : le plus fréquent hors guillemets sur la première ligne non vide.
  const premiere = contenu.split('\n').find((l) => l.trim() !== '') ?? ''
  const compte = { ';': 0, ',': 0, '\t': 0 }
  let entreGuillemets = false
  for (const c of premiere) {
    if (c === '"') entreGuillemets = !entreGuillemets
    else if (!entreGuillemets && c in compte) compte[c] += 1
  }
  const separateur = Object.entries(compte).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(compte).sort((a, b) => b[1] - a[1])[0][0] : ';'

  const lignes = []
  let ligne = []
  let champ = ''
  let guillemets = false

  const finChamp = () => { ligne.push(champ); champ = '' }
  const finLigne = () => {
    finChamp()
    lignes.push(ligne)
    ligne = []
    if (lignes.length > LIMITES.lignesLuesMax) throw new ErreurFichier('Le fichier contient beaucoup trop de lignes.')
    if (ligne.length > LIMITES.colonnesMax) throw new ErreurFichier('Le fichier contient trop de colonnes.')
  }

  for (let i = 0; i < contenu.length; i += 1) {
    const c = contenu[i]
    if (guillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') { champ += '"'; i += 1 } else guillemets = false
      } else champ += c
    } else if (c === '"' && champ === '') guillemets = true
    else if (c === separateur) finChamp()
    else if (c === '\n') finLigne()
    else champ += c
  }
  if (champ !== '' || ligne.length > 0) finLigne()
  if (guillemets) throw new ErreurFichier('Fichier CSV mal formé : un guillemet n\'est pas refermé.')

  if (lignes.some((l) => l.length > LIMITES.colonnesMax)) throw new ErreurFichier('Le fichier contient trop de colonnes.')
  return lignes
}

// ---------------------------------------------------------------------------------------------------------------------
// Export Excel du projet (.xls = tableau HTML) — lecture TEXTUELLE, jamais interprété comme du HTML
// ---------------------------------------------------------------------------------------------------------------------

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decoderEntites(texte) {
  return String(texte)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => caractereValide(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => caractereValide(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m)
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => caractereValide(parseInt(h, 16)))
}

const caractereValide = (code) => (Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '')

export function lireTableHtml(texte) {
  const premierTableau = texte.match(/<table\b[\s\S]*?<\/table>/i)?.[0]
  if (!premierTableau) throw new ErreurFichier('Aucun tableau trouvé dans ce fichier.')

  const lignes = []
  for (const tr of premierTableau.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cellules = [...tr[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((m) => decoderEntites(m[1].replace(/<[^>]*>/g, '')).trim())
    lignes.push(cellules)
    if (lignes.length > LIMITES.lignesLuesMax) throw new ErreurFichier('Le fichier contient beaucoup trop de lignes.')
  }
  if (lignes.some((l) => l.length > LIMITES.colonnesMax)) throw new ErreurFichier('Le fichier contient trop de colonnes.')
  return lignes
}

// ---------------------------------------------------------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------------------------------------------------------

const attribut = (balise, nom) => balise.match(new RegExp(`\\b${nom}="([^"]*)"`))?.[1]

/** Identifiants de formats de date/heure intégrés d'Excel. */
const FORMATS_DATE_INTEGRES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

function formatPersonnaliseEstDate(code) {
  const nu = String(code).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[dmyhs]/i.test(nu) && !/^general$/i.test(nu.trim())
}

/** Numéro de série Excel → AAAA-MM-JJ (système 1900 avec son faux 29/02/1900, ou 1904). */
export function serieExcelEnDate(serie, date1904 = false) {
  const jours = Math.floor(Number(serie))
  if (!Number.isFinite(jours) || jours < 1 || jours > 2958465) return null
  const origine = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const date = new Date(origine + jours * 86400000)
  return date.toISOString().slice(0, 10)
}

function refuserXmlDangereux(xml, nom) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ErreurFichier(`Classeur refusé : le fichier interne « ${nom} » contient une déclaration XML non autorisée.`)
}

const lettresEnIndex = (lettres) => [...lettres].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

function lireNombre(brut) {
  if (/^-?\d+$/.test(brut)) return brut
  const n = Number(brut)
  if (!Number.isFinite(n)) return brut
  if (/e/i.test(brut) && Number.isInteger(n) && Math.abs(n) < 1e21) return BigInt(n).toString()
  return String(n)
}

/** Première feuille d'un classeur .xlsx → lignes de cellules (texte). */
export function lireXlsx(octets) {
  const compteur = { entrees: 0 }
  let fichiers
  try {
    fichiers = unzipSync(octets, {
      filter: (f) => {
        compteur.entrees += 1
        if (compteur.entrees > LIMITES.entreesZipMax) throw new ErreurFichier('Classeur refusé : trop de fichiers internes.')
        if (f.name.endsWith('/') || !/\.(xml|rels)$/i.test(f.name)) return false
        if (f.originalSize > LIMITES.tailleEntreeMax) throw new ErreurFichier(`Classeur refusé : « ${f.name} » est trop volumineux une fois décompressé.`)
        return /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/styles\.xml|xl\/worksheets\/[^/]+\.xml)$/i.test(f.name)
      },
    })
  } catch (e) {
    if (e instanceof ErreurFichier) throw e
    throw new ErreurFichier("Ce classeur Excel est illisible ou corrompu. Essayez de l'enregistrer à nouveau, ou exportez-le en CSV.")
  }

  const texteDe = (nom) => {
    const cle = Object.keys(fichiers).find((k) => k.toLowerCase() === nom.toLowerCase())
    if (!cle) return null
    const xml = new TextDecoder('utf-8').decode(fichiers[cle])
    refuserXmlDangereux(xml, cle)
    return xml
  }

  const classeur = texteDe('xl/workbook.xml')
  if (!classeur) throw new ErreurFichier("Ce fichier n'est pas un classeur Excel valide (workbook.xml introuvable).")
  const feuilles = [...classeur.matchAll(/<sheet\b[^>]*>/gi)].map((m) => ({ nom: decoderEntites(attribut(m[0], 'name') ?? ''), rid: attribut(m[0], 'r:id') }))
  if (feuilles.length === 0) throw new ErreurFichier('Ce classeur ne contient aucune feuille.')
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/i.test(classeur)

  const relations = texteDe('xl/_rels/workbook.xml.rels') ?? ''
  const cible = [...relations.matchAll(/<Relationship\b[^>]*>/gi)]
    .map((m) => ({ id: attribut(m[0], 'Id'), cible: attribut(m[0], 'Target') }))
    .find((r) => r.id === feuilles[0].rid)?.cible
  const cheminFeuille = cible ? (cible.startsWith('/') ? cible.slice(1) : `xl/${cible.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml'
  const xmlFeuille = texteDe(cheminFeuille)
  if (!xmlFeuille) throw new ErreurFichier('La première feuille du classeur est introuvable.')

  // Chaînes partagées (sans le texte phonétique)
  const chaines = []
  const xmlChaines = texteDe('xl/sharedStrings.xml')
  if (xmlChaines) {
    for (const si of xmlChaines.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
      const sansPhonetique = si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/gi, '')
      chaines.push(decoderEntites([...sansPhonetique.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((t) => t[1]).join('')))
    }
  }

  // Styles → quelles cellules numériques sont des dates
  const stylesDate = []
  const xmlStyles = texteDe('xl/styles.xml')
  if (xmlStyles) {
    const personnalises = new Map([...xmlStyles.matchAll(/<numFmt\b[^>]*>/gi)].map((m) => [Number(attribut(m[0], 'numFmtId')), decoderEntites(attribut(m[0], 'formatCode') ?? '')]))
    const blocXf = xmlStyles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] ?? ''
    for (const xf of blocXf.matchAll(/<xf\b[^>]*>/gi)) {
      const id = Number(attribut(xf[0], 'numFmtId') ?? 0)
      stylesDate.push(FORMATS_DATE_INTEGRES.has(id) || (personnalises.has(id) && formatPersonnaliseEstDate(personnalises.get(id))))
    }
  }

  const lignes = []
  let nbLignes = 0
  for (const rang of xmlFeuille.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gi)) {
    nbLignes += 1
    if (nbLignes > LIMITES.lignesLuesMax) throw new ErreurFichier('Le classeur contient beaucoup trop de lignes.')
    const numero = Number(attribut(rang[1], 'r')) || nbLignes
    // Garde-fou : un numéro de ligne démesuré ne doit pas faire allouer des millions de lignes vides.
    if (numero > LIMITES.lignesLuesMax) throw new ErreurFichier('Le classeur contient beaucoup trop de lignes.')
    const cellules = []

    for (const c of (rang[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const ref = attribut(c[1], 'r')
      const colonne = ref ? lettresEnIndex(ref.replace(/\d+/g, '')) : cellules.length
      if (colonne < 0 || colonne >= LIMITES.colonnesMax) {
        if (colonne >= LIMITES.colonnesMax && (c[2] ?? '').trim() !== '') throw new ErreurFichier('Le classeur contient trop de colonnes.')
        continue
      }
      const type = attribut(c[1], 't')
      const style = Number(attribut(c[1], 's') ?? 0)
      const brut = c[2]?.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1]
      let valeur = ''

      if (type === 's') valeur = chaines[Number(brut)] ?? ''
      else if (type === 'inlineStr') valeur = decoderEntites([...(c[2] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((t) => t[1]).join(''))
      else if (type === 'str' || type === 'e') valeur = decoderEntites(brut ?? '')
      else if (type === 'b') valeur = brut === '1' ? 'TRUE' : 'FALSE'
      else if (type === 'd') valeur = decoderEntites(brut ?? '')
      else if (brut !== undefined && brut !== '') valeur = stylesDate[style] ? (serieExcelEnDate(brut, date1904) ?? decoderEntites(brut)) : lireNombre(decoderEntites(brut))

      while (cellules.length < colonne) cellules.push('')
      cellules[colonne] = valeur
    }

    while (lignes.length < numero - 1) lignes.push([]) // lignes vides conservées : la numérotation reste celle d'Excel
    lignes[numero - 1] = cellules
  }

  return { lignes, feuille: feuilles[0].nom, nbFeuilles: feuilles.length }
}

// ---------------------------------------------------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lit un fichier choisi par l'utilisateur.
 * @returns {Promise<{ format: string, feuille?: string, colonnes: object[], ignorees: string[], lignes: object[], videsIgnorees: number, avertissements: string[] }>}
 */
export async function lireFichierTva(fichier) {
  if (!fichier) throw new ErreurFichier('Aucun fichier sélectionné.')
  if (fichier.size > LIMITES.tailleMax) {
    throw new ErreurFichier(`Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo) : ${LIMITES.tailleMax / 1024 / 1024} Mo maximum.`)
  }

  const octets = new Uint8Array(await fichier.arrayBuffer())
  const format = detecterFormat(fichier.name, octets)
  const avertissements = []
  let feuille
  let brut

  if (format === 'xlsx') {
    const lu = lireXlsx(octets)
    brut = lu.lignes
    feuille = lu.feuille
    if (lu.nbFeuilles > 1) avertissements.push(`Le classeur contient ${lu.nbFeuilles} feuilles : seule la première (« ${lu.feuille} ») est lue.`)
  } else if (format === 'html') {
    brut = lireTableHtml(decoderTexte(octets))
  } else {
    brut = lireCsv(decoderTexte(octets))
  }

  // En-tête = première ligne non vide
  const indexEntete = brut.findIndex((l) => l.some((c) => String(c ?? '').trim() !== ''))
  if (indexEntete === -1) throw new ErreurFichier('Le fichier ne contient aucune donnée.')

  const entetes = brut[indexEntete]
  const mappage = mapperEntetes(entetes)
  if (mappage.doublons.length > 0) throw new ErreurFichier(`Colonne(s) en double dans le fichier : ${mappage.doublons.join(', ')}. Chaque colonne ne doit apparaître qu'une fois.`)
  if (mappage.manquants.length > 0) {
    throw new ErreurFichier(`Colonne(s) obligatoire(s) introuvable(s) : ${mappage.manquants.join(', ')}. Colonnes trouvées : ${mappage.colonnes.map((c) => c.entete).join(', ') || 'aucune'}.`)
  }
  if (mappage.ignorees.length > 0) avertissements.push(`Colonne(s) non reconnue(s), ignorée(s) : ${mappage.ignorees.join(', ')}.`)

  const lignes = []
  let videsIgnorees = 0
  for (let i = indexEntete + 1; i < brut.length; i += 1) {
    const cellules = brut[i] ?? []
    const ligne = { ligne: i + 1 } // numéro de ligne du fichier (l'en-tête compte)
    let rempli = false
    mappage.colonnes.forEach((col, index) => {
      if (!col.champ) return
      const valeur = String(cellules[index] ?? '')
      if (valeur.trim() !== '') rempli = true
      ligne[col.champ] = valeur
    })
    if (!rempli) { videsIgnorees += 1; continue }
    lignes.push(ligne)
    if (lignes.length > LIMITES.lignesMax) {
      throw new ErreurFichier(`Le fichier contient plus de ${LIMITES.lignesMax} lignes : importez-le en plusieurs fichiers de ${LIMITES.lignesMax} lignes au maximum.`)
    }
  }
  if (lignes.length === 0) throw new ErreurFichier('Le fichier ne contient aucune ligne de données sous l\'en-tête.')

  return { format, feuille, colonnes: mappage.colonnes, ignorees: mappage.ignorees, lignes, videsIgnorees, avertissements }
}

/** Modèle CSV (en-têtes seulement, séparateur « ; », UTF-8 avec BOM pour Excel) : aucune donnée fictive. */
export function modeleCsv() {
  return `﻿${EN_TETES_MODELE.join(';')}\r\n`
}
