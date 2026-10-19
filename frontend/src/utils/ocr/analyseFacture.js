// Interprétation du texte lu dans une FACTURE (PDF avec texte, PDF scanné ou photo passée à l'OCR) pour pré-remplir une ligne de
// « Nouvelle déclaration TVA » : n° de facture, dates, fournisseur (nom, ICE, IF), désignation, montants HT / TVA / TTC, taux.
//
// Fonction pure : elle reçoit des LIGNES DE TEXTE et renvoie ce qui y est réellement écrit.
//   - Une valeur absente ou illisible reste vide : jamais inventée. Un montant n'est jamais « corrigé » en silence.
//   - Quand l'OCR a abîmé un montant, il peut être RECONSTITUÉ à partir d'autres données de la MÊME facture (HT + TVA = TTC, TVA =
//     HT × taux, montant écrit en toutes lettres) ; il est alors signalé « à vérifier » avec la raison, jamais présenté comme lu.
//   - Les calculs de TVA sont toujours contrôlés (HT + TVA = TTC ; TVA = HT × taux avec un taux marocain 20, 14, 10, 7 ou 0 %).
//   - Les formats ne sont pas supposés identiques d'une facture à l'autre : étiquettes (Total HT, Montant H.T, Net HT, Dont TVA,
//     Total TTC, Net à payer…), montants à la française (1 234,56) ou à l'anglaise (500.00), tableaux de totaux sur deux lignes.
//
// L'OCR reste imparfait (photo floue, penchée…) : le résultat est toujours à vérifier dans le formulaire, où tout est modifiable.

import { arrondir, normaliserEspaces } from './nombres.js'
import { montantEnLettres } from './montantEnLettres.js'

export const TAUX_MAROCAINS = [20, 14, 10, 7, 0]
/** Écart toléré (en unités) entre deux montants qui doivent être égaux. */
export const TOLERANCE = 0.02
/** Écart toléré pour reconnaître un taux à partir de HT et TVA (arrondis ligne par ligne d'une facture). */
const TOLERANCE_TAUX = 0.05
/** Confiance OCR (0 à 100) en dessous de laquelle une valeur non confirmée est signalée comme peu fiable. */
export const SEUIL_CONFIANCE = 80

const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// ---------------------------------------------------------------------------------------------------------------- montants

// « 1 234,56 », « 930,02 », « 500.00 », « 500. 00 » (espace lue par l'OCR), « 1.234,50 », « 1,234.50 » ; 1 ou 2 décimales.
const MOTIF_MONTANT = /(?<![\d.,])(?:(\d{1,3}(?:[ .,]\d{3})+)|(\d+))\s?[.,]\s?(\d{1,2})(?!\d)/g

/** Tous les montants d'un texte : `[{ valeur, brut, index, fin, incomplet }]` (`incomplet` : une seule décimale lue). */
export function montantsDe(texte) {
  const t = normaliserEspaces(texte)
  return [...t.matchAll(MOTIF_MONTANT)].map((m) => {
    const entier = (m[1] ?? m[2]).replace(/[ .,]/g, '')
    return { valeur: Number(`${entier}.${m[3]}`), brut: m[0], index: m.index, fin: m.index + m[0].length, incomplet: m[3].length === 1 }
  })
}

const montant = (valeur, conf, origine = 'lu', motif = null) => ({ valeur, conf, origine, motif })

// ---------------------------------------------------------------------------------------------------------------- dates

const dateIso = (j, m, a) => {
  let annee = Number(a)
  if (String(a).length === 2) annee += 2000
  const jour = Number(j)
  const mois = Number(m)
  if (!(mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31 && annee >= 2000 && annee <= 2100)) return null
  const d = new Date(annee, mois - 1, jour)
  if (d.getMonth() !== mois - 1 || d.getDate() !== jour) return null
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

/** Premières dates « jj/mm/aaaa » (ou « jj-mm-aa », « jj.mm.aaaa ») d'un texte, avec leur position. */
export function datesDe(texte) {
  return [...String(texte).matchAll(/(?<!\d)(\d{1,2})\s?[/\-.]\s?(\d{1,2})\s?[/\-.]\s?(\d{4}|\d{2})(?!\d)/g)]
    .map((m) => ({ iso: dateIso(m[1], m[2], m[3]), index: m.index, fin: m.index + m[0].length }))
    .filter((d) => d.iso)
}

// ---------------------------------------------------------------------------------------------------------------- identifiants

const CHIFFRES_OCR = (s) => s.replace(/[OoQD]/g, '0').replace(/[IilL|]/g, '1')
const MOTIF_ICE = /(?:ICE|[\\|!1lI]CE)\s*(?:n[°o]\s*)?[:.]?\s*([0-9OoIl|]{15})(?![0-9])/i
const MOTIF_IF = /(?:\b[I1]F\b|identifiant\s+f[a-z]{3,6}\b)\s*(?:n[°o]\s*)?[:.]?\s*(\d{6,10})(?!\d)/i
// Une ligne qui porte ces mots décrit l'ÉMETTEUR de la facture (en-tête ou pied de page) ; la sienne propre (ICE du client…) non.
const MARQUEURS_EMETTEUR = /\b(?:rc|r\.c\.?|i\.?f|identifiant\s+fiscal|e-?\s?mail|t[ée]l|fax|adresse|site\s*web|cnss|patente|siege|magasin)\b/i

// ---------------------------------------------------------------------------------------------------------------- paiement

function modePaiementDe(textes) {
  const corps = sansAccents(textes.join('\n'))
  if (/\besp[eè]ces?\b|\bcomptant\s+esp|\bcash\b/.test(corps)) return 'espèces'
  if (/\bcheque\b/.test(corps)) return 'chèque'
  if (/\bvirement\b/.test(corps)) return 'virement'
  if (/\beffet\b/.test(corps)) return 'effet'
  return null
}

// ---------------------------------------------------------------------------------------------------------------- étiquettes de totaux

const ET_HT = /(?:^|[^a-z])h\.?\s?t(?![a-z])/i
const ET_NET_HT = /net\s*h\.?\s?t(?![a-z])/i
const ET_TVA = /t\.?\s?v\.?\s?a(?![a-z])/i
const ET_TTC = /(?:^|[^a-z])t\.?\s?t\.?\s?c(?![a-z])/i
const ET_NET_A_PAYER = /net\s*[àa]\s*payer/i
const ET_TOTAL_COUPE = /(?:^|[^a-z])total\s+t\s*$/i // colonne « TOTAL TTC » tronquée par la photo
const ENTETE_TABLEAU = /d[ée]signation|qu?t[ée]s?\b|\bp\.?\s?u\b/i

/**
 * Libellés en toutes lettres : la phrase qui précède « DIRHAMS » (« Neuf cent trente DIRHAMS, deux CENTIMES »).
 * Renvoie `{ valeur, conf, texte }` ou `null` si rien de lisible.
 */
function chercherMontantEnLettres(sources) {
  for (const { texte, confiance } of sources) {
    const valeur = montantEnLettres(texte)
    if (valeur !== null) return { valeur, conf: confiance, texte }
  }
  return null
}

/**
 * Cherche un tableau de totaux « en-têtes sur une ligne, valeurs sur la suivante » (MONTANT H.T | MONTANT T.V.A | TOTAL TTC).
 * Les valeurs sont rattachées aux colonnes par leur ORDRE, seulement si leur nombre est celui des en-têtes ; une cellule illisible
 * reste vide (null).
 */
function lireTableauTotaux(sources) {
  for (let i = 0; i < sources.length - 1; i += 1) {
    const { texte } = sources[i]
    if (montantsDe(texte).length > 0) continue
    const colonnes = []
    const repere = (re, cle) => { const m = re.exec(texte); if (m) colonnes.push({ cle, pos: m.index }) }
    repere(ET_HT, 'ht')
    repere(ET_TVA, 'tva')
    repere(ET_TTC, 'ttc')
    if (!colonnes.some((c) => c.cle === 'ttc') && ET_TOTAL_COUPE.test(texte)) colonnes.push({ cle: 'ttc', pos: texte.search(ET_TOTAL_COUPE) })
    if (colonnes.length < 2) continue
    colonnes.sort((a, b) => a.pos - b.pos)

    const valeurs = sources[i + 1]
    // Cellules : ce qui suit le dernier mot (« CENTIMES », « DIRHAMS »…) de la ligne des valeurs, découpé sur espaces et « | ».
    const jetons = normaliserEspaces(valeurs.texte).split(/[\s|]+/).filter(Boolean)
    let debut = 0
    jetons.forEach((j, k) => { if (/[A-Za-zÀ-ÿ]{4,}/.test(j)) debut = k + 1 })
    const cellules = jetons.slice(debut)
    if (cellules.length !== colonnes.length) continue

    const resultat = {}
    colonnes.forEach((c, k) => {
      const m = montantsDe(cellules[k])
      resultat[c.cle] = m.length === 1 && m[0].index === 0 ? montant(m[0].valeur, valeurs.confiance, 'lu', m[0].incomplet ? 'décimale incomplète' : null) : null
    })
    return { resultat, index: i }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------- analyse

const NOMS_INTERDITS = /^(?:facture|avoir|devis|bon|livraison|adresse|tel|tél|fax|email|e-mail|date|client|casablanca|casa|rue|avenue|siege|magasin|ice|rc|patente|mail|site|web|total|montant|designation|accessoires|pieces|paiement|information|signature|comptant|espece|especes|expedition|representant)$/i

/** Nettoie un nom d'entreprise lu par OCR : retire les jetons parasites (1-2 caractères, symboles, minuscules isolées). */
function nettoyerNom(texte) {
  const jetons = normaliserEspaces(texte).split(' ').filter((j) => /^[A-ZÀ-Ý][A-ZÀ-Ý0-9&.'’-]{1,}$/.test(j) || /^[A-ZÀ-Ý][a-zà-ÿ]{3,}$/.test(j))
  return jetons.join(' ').trim()
}

const FORME_JURIDIQUE = /\b(?:sarl(?:\s*au)?|s\.a\.r\.l|snc|scs|s\.a\.|sa|ste|soci[ée]t[ée])\b/i

function chercherNomEmetteur(sources) {
  // 1. Une ligne qui porte une forme juridique (« BABIN CARE SARL »), hors lignes d'adresse / identifiants.
  const avecForme = sources.filter(({ texte, confiance }) => FORME_JURIDIQUE.test(texte)
    && !/adresse|\bice\b|\brc\b|t[ée]l|e-?mail|\d{5,}/i.test(texte) && (confiance ?? 100) >= 60)
  if (avecForme.length > 0) {
    const nom = nettoyerNom(avecForme[0].texte)
    if (nom.length >= 5) return { nom, conf: avecForme[0].confiance, motif: null }
  }
  // 2. Le titre : l'une des trois premières lignes, faite de mots seulement et lue avec une bonne confiance.
  for (const { texte, confiance } of sources.slice(0, 3)) {
    const propre = nettoyerNom(texte)
    const mots = propre.split(' ').filter(Boolean)
    if (mots.length >= 2 && mots.length <= 5 && (confiance ?? 100) >= 85 && propre.length === normaliserEspaces(texte).length
      && !mots.some((m) => NOMS_INTERDITS.test(m))) {
      return { nom: propre, conf: confiance, motif: null }
    }
  }
  // 3. Un nom écrit en majuscules qui revient plusieurs fois dans l'en-tête (logo + adresse) : proposé, à vérifier.
  const compte = new Map()
  for (const { texte } of sources.slice(0, 12)) {
    for (const j of new Set(normaliserEspaces(texte).split(/[^A-Za-zÀ-ÿ]+/).filter((x) => /^[A-ZÀ-Ý]{4,20}$/.test(x) && !NOMS_INTERDITS.test(x)))) {
      compte.set(j, (compte.get(j) ?? 0) + 1)
    }
  }
  const frequent = [...compte.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0]
  if (frequent) return { nom: frequent[0], conf: null, motif: 'nom déduit de l’en-tête : à vérifier' }
  return null
}

function chercherNumero(textes) {
  for (const t of textes) {
    const m = /\bfacture(?:\s+d[ée]tail)?\s*(?:n[°o]|num[ée]ro|n\s*°)?\s*[:.]?\s*(\S+)(?:\s+(\d{1,10})(?!\S))?/i.exec(t)
    if (!m) continue
    let premier = m[1].replace(/^[:.]+/, '')
    // « Facture N° C26024363 ICE003… » : le numéro s'arrête avant un autre identifiant.
    if (!premier || /^(?:ice|date|information|du|le|de)\b/i.test(premier) || /^[A-Za-zÀ-ÿ]{4,}$/.test(premier)) continue
    if (/^[A-Za-z]{1,5}$/.test(premier) && m[2]) premier = `${premier} ${m[2]}` // « fac 666 »
    if (/\d/.test(premier)) return { numero: premier.replace(/[|,;]+$/, ''), texte: t }
  }
  return null
}

/**
 * @param {Array<{ texte: string, confiance?: number }|string>} lignesTexte lignes de texte dans l'ordre de lecture ; `confiance`
 *        (0 à 100) n'existe que pour l'OCR (absent = texte natif d'un PDF, fiable)
 * @param {{ moteur?: string }} [options]
 */
export function analyserFacture(lignesTexte, options = {}) {
  const sources = (lignesTexte ?? []).slice(0, 2000)
    .map((l) => ({ texte: normaliserEspaces(typeof l === 'string' ? l : l?.texte), confiance: typeof l === 'object' ? l?.confiance : undefined }))
    .filter((l) => l.texte)

  // « ICE : » en fin de ligne, chiffres au début de la suivante : les deux lignes sont lues ensemble.
  const fusionnees = []
  for (let i = 0; i < sources.length; i += 1) {
    const s = sources[i]
    if (/(?:ICE|[\\|!1lI]CE)\s*[:.]?\s*$/i.test(s.texte) && sources[i + 1]) {
      fusionnees.push({ texte: `${s.texte} ${sources[i + 1].texte}`, confiance: Math.min(s.confiance ?? 100, sources[i + 1].confiance ?? 100) })
      i += 1
    } else fusionnees.push(s)
  }
  const textes = fusionnees.map((s) => s.texte)
  const incertains = {}
  const marquer = (champ, motif) => { incertains[champ] ??= motif }
  const faible = (conf) => typeof conf === 'number' && conf < SEUIL_CONFIANCE

  // ------ type de document
  const tete = textes.slice(0, 14).join('\n')
  const bonLivraison = /\bbon\s+de\s+livraison\b/i.test(tete) && !/^\s*facture\b/im.test(tete)
  const estFacture = /\bfacture\b|\bbon\s+de\s+livraison\b|\btotal\s+t\.?t\.?c\b|\bnet\s+[àa]\s+payer\b|\bmontant\s+t\.?v\.?a\b/i.test(textes.join('\n'))

  // ------ identifiants : ICE / IF de l'émetteur (lignes d'en-tête et de pied de page) et du destinataire
  let fournisseur = { nom: '', ice: '', if: '' }
  const conf = {}
  let client = { nom: '', ice: '' }
  for (const { texte, confiance } of fusionnees) {
    const ice = MOTIF_ICE.exec(texte)?.[1]
    if (ice) {
      const chiffres = CHIFFRES_OCR(ice)
      if (/^\d{15}$/.test(chiffres)) {
        if (MARQUEURS_EMETTEUR.test(texte)) {
          if (!fournisseur.ice) { fournisseur.ice = chiffres; conf.ice = confiance }
        } else if (!client.ice) client.ice = chiffres
      }
    }
    if (!fournisseur.if && !/\bclient\b/i.test(texte)) {
      const identifiant = MOTIF_IF.exec(texte)?.[1]
      if (identifiant) { fournisseur.if = identifiant; conf.if = confiance }
    }
  }
  const nom = chercherNomEmetteur(fusionnees)
  if (nom) {
    fournisseur.nom = nom.nom
    conf.nom = nom.conf
    if (nom.motif) marquer('libelle_fournisseur', nom.motif)
  }
  // Nom du destinataire (utile si la facture est en réalité une facture de VENTE de l'entreprise : voir le formulaire).
  for (let i = 0; i < textes.length; i += 1) {
    const m = /information\s+de\s+client\s*:?\s*(.*)$/i.exec(textes[i])
    if (m) { client.nom = nettoyerNom(m[1] || textes[i + 1] || ''); if (client.nom) break }
    const d = /date\s+de\s+facturation\s*:?\s*\d{1,2}\s?[/\-.]\s?\d{1,2}\s?[/\-.]\s?\d{2,4}\s+(.+)$/i.exec(textes[i])
    if (d) { client.nom = nettoyerNom(d[1]); if (client.nom) break }
  }

  // ------ numéro, dates, paiement
  const numero = chercherNumero(textes)
  let dateFacture = null
  let datePaiement = null
  for (const { texte, confiance } of fusionnees) {
    const dates = datesDe(texte)
    if (dates.length === 0) continue
    const t = sansAccents(texte)
    if (/paiement|reglement/.test(t)) datePaiement ??= { iso: dates[0].iso, conf: confiance }
    else if (/\bdate\b|\ble\s+\d|casablanca\s+le|\ble\s*:?\s*\d/.test(t) || /\bdate\b/.test(t)) dateFacture ??= { iso: dates[0].iso, conf: confiance }
  }
  const modePaiement = modePaiementDe(textes)

  // ------ montants
  const lus = { ht: null, netHt: null, tva: null, ttc: null, netAPayer: null }
  let tauxEcrit = null
  let totalSansEtiquette = null
  let ligneTotaux = Infinity
  fusionnees.forEach(({ texte, confiance }, index) => {
    const montants = montantsDe(texte)
    // Taux écrit : « DONT TVA (20%) », « TVA 20 % », « 20,00 Dh (20%) » — jamais la remise (« 35% » sans parenthèse ni mot TVA).
    const t = /t\.?\s?v\.?\s?a[^0-9]{0,6}\(?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i.exec(texte) ?? (montants.length > 0 ? /\(\s*(\d{1,2})\s*%\s*\)/.exec(texte) : null)
    if (t) {
      const v = Number(t[1].replace(',', '.'))
      if (TAUX_MAROCAINS.includes(v)) tauxEcrit ??= { valeur: v, conf: confiance }
    }
    if (montants.length === 0) return

    const dernier = montants[montants.length - 1]
    const ajouter = (cle) => {
      lus[cle] ??= montant(dernier.valeur, confiance, 'lu', dernier.incomplet ? 'décimale incomplète' : null)
      ligneTotaux = Math.min(ligneTotaux, index)
    }
    if (ET_NET_HT.test(texte)) ajouter('netHt')
    else if (ET_TTC.test(texte) && !ET_TVA.test(texte.replace(ET_TTC, ''))) ajouter('ttc')
    else if (ET_TVA.test(texte) && !ET_HT.test(texte.replace(/t\.?\s?v\.?\s?a/gi, ''))) ajouter('tva')
    else if (ET_HT.test(texte)) ajouter('ht')
    else if (ET_NET_A_PAYER.test(texte)) ajouter('netAPayer')
    else if (/^\s*total\b/i.test(texte) && montants.length === 1) totalSansEtiquette ??= montant(dernier.valeur, confiance, 'lu', dernier.incomplet ? 'décimale incomplète' : null)
  })

  const tableau = lireTableauTotaux(fusionnees)
  if (tableau) {
    for (const cle of ['ht', 'tva', 'ttc']) if (tableau.resultat[cle] && !lus[cle]) lus[cle] = tableau.resultat[cle]
    ligneTotaux = Math.min(ligneTotaux, tableau.index)
  }

  const lettres = chercherMontantEnLettres(fusionnees)

  // ------ rapprochement des montants
  let ht = lus.netHt ?? lus.ht
  let tva = lus.tva
  let ttc = lus.ttc
  const controles = []
  const avertissements = []
  const egaux = (a, b, tol = TOLERANCE) => Math.abs(a - b) <= tol
  const tauxPour = (h, v) => TAUX_MAROCAINS.find((t) => egaux(arrondir((h * t) / 100), v, TOLERANCE_TAUX)) ?? null
  const reconstitue = (valeur, motif) => montant(arrondir(valeur), null, 'calcule', motif)

  // HT dont l'étiquette est illisible (« TOTAL 500. 0 ») : retenu seulement si TVA et TTC lus le CONFIRMENT.
  if (!ht && totalSansEtiquette && tva && ttc && egaux(arrondir(ttc.valeur - tva.valeur), totalSansEtiquette.valeur, 0.1)) {
    ht = { ...totalSansEtiquette, motif: 'étiquette illisible : confirmé par TTC − TVA' }
  }

  // Un TTC absent mais un « net à payer » présent (sans timbre) : seulement s'il n'y a pas de TTC lu.
  if (!ttc && lus.netAPayer && ht && tva && egaux(ht.valeur + tva.valeur, lus.netAPayer.valeur)) ttc = lus.netAPayer

  // Montant en toutes lettres : confirme le TTC ou, s'il le contredit, permet de reconstituer un TTC abîmé par l'OCR.
  if (lettres && ttc && !egaux(ttc.valeur, lettres.valeur) && ht) {
    const reglable = tva
      ? egaux(ht.valeur + tva.valeur, lettres.valeur)
      : tauxPour(ht.valeur, lettres.valeur - ht.valeur) !== null
    const lectureCoherente = tva ? egaux(ht.valeur + tva.valeur, ttc.valeur) : tauxPour(ht.valeur, ttc.valeur - ht.valeur) !== null
    if (reglable && !lectureCoherente) {
      const lu = ttc.valeur
      ttc = montant(lettres.valeur, lettres.conf, 'lettres', `TTC lu ${lu.toFixed(2)} ≠ montant écrit en lettres ${lettres.valeur.toFixed(2)} (cohérent avec HT + TVA) : valeur des lettres reprise`)
    }
  } else if (!ttc && lettres && ht && (tva ? egaux(ht.valeur + tva.valeur, lettres.valeur) : tauxPour(ht.valeur, lettres.valeur - ht.valeur) !== null)) {
    ttc = montant(lettres.valeur, lettres.conf, 'lettres', 'TTC repris du montant écrit en lettres (non lu en chiffres)')
  }

  // Valeur manquante : calculée à partir des deux autres de la MÊME facture, jamais inventée.
  if (ht && ttc && !tva) tva = reconstitue(ttc.valeur - ht.valeur, 'TVA non lue : calculée (TTC − HT)')
  else if (ttc && tva && !ht) ht = reconstitue(ttc.valeur - tva.valeur, 'HT non lu : calculé (TTC − TVA)')
  else if (ht && tva && !ttc) ttc = reconstitue(ht.valeur + tva.valeur, 'TTC non lu : calculé (HT + TVA)')

  const somme = ht && tva && ttc ? egaux(ht.valeur + tva.valeur, ttc.valeur) : null
  if (ht && tva && ttc) {
    controles.push(somme
      ? { niveau: 'ok', message: `HT + TVA = TTC (${ttc.valeur.toFixed(2)})` }
      : { niveau: 'alerte', message: `HT (${ht.valeur.toFixed(2)}) + TVA (${tva.valeur.toFixed(2)}) ≠ TTC (${ttc.valeur.toFixed(2)})` })
    if (!somme) {
      marquer('ht', 'HT + TVA ≠ TTC : une des trois valeurs est mal lue')
      marquer('tva', `HT + TVA = ${arrondir(ht.valeur + tva.valeur).toFixed(2)} ≠ TTC ${ttc.valeur.toFixed(2)}`)
      marquer('ttc', `HT + TVA = ${arrondir(ht.valeur + tva.valeur).toFixed(2)} ≠ TTC ${ttc.valeur.toFixed(2)}`)
    }
  }
  if (lettres && ttc && !egaux(ttc.valeur, lettres.valeur)) {
    marquer('ttc', `le montant écrit en lettres (${lettres.valeur.toFixed(2)}) diffère du TTC`)
  }

  // Motifs propres à chaque montant (reconstitué, peu fiable) — sauf si l'ensemble HT + TVA = TTC est cohérent et lu.
  for (const [cle, v] of [['ht', ht], ['tva', tva], ['ttc', ttc]]) {
    if (!v) continue
    if (v.motif) marquer(cle, v.motif)
    else if (!somme && faible(v.conf)) marquer(cle, `lecture peu fiable (confiance ${Math.round(v.conf)} %)`)
    else if (somme === null && faible(v.conf)) marquer(cle, `lecture peu fiable (confiance ${Math.round(v.conf)} %)`)
  }

  // ------ taux
  let taux = null
  if (ht && tva && ht.valeur !== 0) {
    const deduit = tauxPour(ht.valeur, tva.valeur)
    if (tauxEcrit && deduit !== null && tauxEcrit.valeur === deduit) taux = tauxEcrit.valeur
    else if (tauxEcrit && deduit === null) { taux = tauxEcrit.valeur; marquer('taux', 'TVA ≠ HT × taux écrit : plusieurs taux ou montant mal lu') }
    else if (deduit !== null) {
      taux = deduit
      if (!tauxEcrit) marquer('taux', 'taux déduit des montants (non lu sur la facture)')
      else marquer('taux', `taux écrit ${tauxEcrit.valeur} % ≠ taux des montants (${deduit} %)`)
    } else {
      marquer('taux', `taux non déterminé (TVA/HT = ${arrondir((tva.valeur / ht.valeur) * 100)} %) : plusieurs taux ? À saisir`)
    }
  } else if (ht && tva && ht.valeur === 0 && tva.valeur === 0 && tauxEcrit) taux = tauxEcrit.valeur
  else if (tauxEcrit && !ht && !tva) { taux = tauxEcrit.valeur; marquer('taux', 'taux lu sans montants : à vérifier') }

  if (!ht) marquer('ht', 'HT non lu : à saisir')
  if (!tva) marquer('tva', 'TVA non lue : à saisir')
  if (!ttc) marquer('ttc', 'TTC non lu : à saisir')

  // ------ désignation : première ligne d'article (ligne portant des montants avant les totaux), mots lus à gauche des chiffres
  // Les lignes d'article viennent APRÈS le numéro / la date de la facture (l'en-tête d'adresse, avec ses téléphones, est écarté).
  const apresEntete = Math.max(0, fusionnees.findIndex((s) => s.texte === numero?.texte), fusionnees.findIndex((s) => dateFacture && datesDe(s.texte).some((d) => d.iso === dateFacture.iso)))
  const designation = chercherDesignation(fusionnees, apresEntete + 1, ligneTotaux)

  // ------ signalements sur les autres champs
  if (!numero) marquer('fact_num', 'numéro de facture non lu : à saisir')
  else if (faible(fusionnees.find((s) => s.texte === numero.texte)?.confiance)) marquer('fact_num', 'lecture peu fiable : à vérifier')
  if (!dateFacture) marquer('date_fac', 'date de facture non lue : à saisir')
  else if (faible(dateFacture.conf)) marquer('date_fac', `lecture peu fiable (confiance ${Math.round(dateFacture.conf)} %)`)
  if (!fournisseur.ice) marquer('ice', 'ICE du fournisseur non lu : à saisir')
  else if (faible(conf.ice)) marquer('ice', `lecture peu fiable (confiance ${Math.round(conf.ice)} %) : à vérifier`)
  if (!fournisseur.if) marquer('identifiant_fiscal', 'IF du fournisseur non lu : à saisir')
  else if (faible(conf.if)) marquer('identifiant_fiscal', `lecture peu fiable (confiance ${Math.round(conf.if)} %) : à vérifier`)
  if (!fournisseur.nom) marquer('libelle_fournisseur', 'nom du fournisseur non lu : à saisir')
  else if (faible(conf.nom) && !incertains.libelle_fournisseur) marquer('libelle_fournisseur', `lecture peu fiable (confiance ${Math.round(conf.nom)} %) : à vérifier`)

  const montantsLus = [ht, tva, ttc].filter(Boolean).length
  const confiances = fusionnees.map((l) => l.confiance).filter((c) => typeof c === 'number')
  const confianceMoyenne = confiances.length ? Math.round(confiances.reduce((a, c) => a + c, 0) / confiances.length) : null

  let statut = 'reussie'
  if (!estFacture && montantsLus === 0) statut = 'illisible'
  else if (montantsLus === 0) statut = 'illisible'
  else if (Object.keys(incertains).length > 0) statut = 'partielle'

  return {
    typeDocument: bonLivraison ? 'bon_livraison' : 'facture',
    numero: numero?.numero ?? '',
    dateFacture: dateFacture?.iso ?? '',
    datePaiement: datePaiement?.iso ?? '',
    modePaiement,
    fournisseur,
    client,
    designation,
    ht: ht?.valeur ?? null,
    tva: tva?.valeur ?? null,
    ttc: ttc?.valeur ?? null,
    taux,
    origines: { ht: ht?.origine ?? null, tva: tva?.origine ?? null, ttc: ttc?.origine ?? null },
    incertains,
    controles,
    avertissements,
    statut,
    confianceMoyenne,
    moteur: options.moteur ?? null,
  }
}

function chercherDesignation(sources, debut, ligneTotaux) {
  const metadonnees = /\b(?:ice|adresse|t[ée]l|fax|e-?\s?mail|facture|date|rc|patente|client|casablanca le|total|montant|net|paiement|expedition|representant|arret[ée]e?)\b/i
  const limite = Math.min(ligneTotaux, sources.length)
  for (let i = debut; i < limite; i += 1) {
    const { texte } = sources[i]
    const montants = montantsDe(texte)
    if (montants.length === 0 || metadonnees.test(sansAccents(texte).replace(/designation/g, ''))) continue
    // Texte à gauche du premier montant ; si la dernière « colonne » avant lui est une quantité (« … DLLA160P3 4 »), elle est retirée.
    let gauche = texte.slice(0, montants[0].index)
    gauche = gauche.split('|').map((s) => s.trim()).filter(Boolean).slice(-1)[0] ?? ''
    gauche = gauche.replace(/(?:\s+\d{1,4}(?:[.,]\d+)?){1,2}\s*$/, '').replace(/[|—_=]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(gauche)) continue
    // Désignation sur plusieurs lignes : mots de la ligne précédente et de la suivante (sans montant ni mot de métadonnée).
    const autour = (k) => {
      const s = sources[k]?.texte
      return s && montantsDe(s).length === 0 && /[A-Za-zÀ-ÿ]{3,}/.test(s) && !metadonnees.test(sansAccents(s)) && !ENTETE_TABLEAU.test(s) && s.length < 40 ? s : null
    }
    const avant = autour(i - 1)
    const apres = autour(i + 1)
    return [avant, gauche, apres].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  }
  return ''
}

/**
 * Factures analysées → données de « Nouvelle déclaration TVA » : une ligne par facture, dans l'ordre des fichiers.
 * @param {Array<{ fichier: string, analyse: object|null, erreur?: string }>} resultats
 */
export function versDeclaration(resultats) {
  const lignes = []
  const signalements = {}
  const clients = {}
  const avertissements = []
  resultats.forEach(({ fichier, analyse, erreur }) => {
    if (!analyse || analyse.statut === 'illisible') {
      avertissements.push(`« ${fichier} » : ${erreur ?? 'aucune donnée de facture lue (photo plus nette ou PDF d’origine recommandé).'}`)
      return
    }
    const i = lignes.length
    lignes.push({
      ordre_ref: String(i + 1),
      fact_num: analyse.numero,
      designation: analyse.designation,
      ht: analyse.ht ?? '',
      tva: analyse.tva ?? '',
      ttc: analyse.ttc ?? '',
      identifiant_fiscal: analyse.fournisseur.if,
      libelle_fournisseur: analyse.fournisseur.nom,
      ice: analyse.fournisseur.ice,
      taux: analyse.taux ?? '',
      id_paie: analyse.modePaiement === 'espèces' ? '1-ESPECES' : '',
      date_paie: analyse.datePaiement,
      date_fac: analyse.dateFacture,
    })
    for (const [champ, motif] of Object.entries(analyse.incertains)) signalements[`${i}.${champ}`] = motif
    if (analyse.client.ice || analyse.client.nom) clients[i] = analyse.client
  })
  return { lignes, signalements, clients, avertissements }
}

// ------------------------------------------------------------------------------------------------ plusieurs lectures d'une page

/** Note de qualité d'une analyse : montants lus directement et cohérents d'abord, puis peu de signalements. */
function note(a) {
  const lus = ['ht', 'tva', 'ttc'].filter((c) => a.origines[c] === 'lu').length
  const presents = ['ht', 'tva', 'ttc'].filter((c) => a[c] !== null).length
  const coherent = a.controles.some((c) => c.niveau === 'ok')
  const signaux = ['ht', 'tva', 'ttc', 'taux'].filter((c) => a.incertains[c]).length
  return lus * 12 + presents * 6 + (coherent ? 30 : 0) + (a.taux !== null ? 4 : 0) - signaux * 5
}

const CHAMPS_TEXTE = [
  ['numero', 'fact_num'], ['dateFacture', 'date_fac'], ['datePaiement', null], ['designation', null], ['modePaiement', null],
]

/**
 * La reconnaissance de caractères lit une même page de plusieurs façons (segmentation automatique, bloc uniforme) : chacune lit
 * mieux certaines zones (un tableau de totaux, un bas de page). Chaque lecture est analysée SÉPARÉMENT ; on garde celle dont les
 * montants sont lus directement et cohérents (HT + TVA = TTC), puis les champs qu'elle n'a pas lus (n° de facture, dates, fournisseur,
 * ICE, IF, désignation) sont complétés par les autres lectures. Si deux lectures cohérentes donnent des montants DIFFÉRENTS, la
 * meilleure est gardée et ses montants sont signalés.
 *
 * @param {Array<Array<{ texte: string, confiance?: number }|string>>} lectures lignes de texte de chaque lecture, la principale d'abord
 */
export function analyserFacturePasses(lectures, options = {}) {
  const analyses = lectures.filter((l) => l?.length).map((l) => analyserFacture(l, options))
  if (analyses.length === 0) return analyserFacture([], options)
  const classees = [...analyses].sort((a, b) => note(b) - note(a))
  const meilleure = { ...classees[0], incertains: { ...classees[0].incertains }, fournisseur: { ...classees[0].fournisseur }, client: { ...classees[0].client } }

  for (const autre of classees.slice(1)) {
    for (const [champ, cleFormulaire] of CHAMPS_TEXTE) {
      if (!meilleure[champ] && autre[champ]) {
        meilleure[champ] = autre[champ]
        if (cleFormulaire) { if (autre.incertains[cleFormulaire]) meilleure.incertains[cleFormulaire] = autre.incertains[cleFormulaire]; else delete meilleure.incertains[cleFormulaire] }
      }
    }
    for (const [champ, cleFormulaire] of [['nom', 'libelle_fournisseur'], ['ice', 'ice'], ['if', 'identifiant_fiscal']]) {
      if (!meilleure.fournisseur[champ] && autre.fournisseur[champ]) {
        meilleure.fournisseur[champ] = autre.fournisseur[champ]
        if (autre.incertains[cleFormulaire]) meilleure.incertains[cleFormulaire] = autre.incertains[cleFormulaire]; else delete meilleure.incertains[cleFormulaire]
      }
    }
    if (!meilleure.client.ice && autre.client.ice) meilleure.client.ice = autre.client.ice
    if (!meilleure.client.nom && autre.client.nom) meilleure.client.nom = autre.client.nom

    // Deux lectures cohérentes qui se contredisent : rien n'est tranché en silence.
    const coherentes = (a) => a.controles.some((c) => c.niveau === 'ok')
    if (coherentes(meilleure) && coherentes(autre) && ['ht', 'tva', 'ttc'].some((c) => Math.abs((meilleure[c] ?? 0) - (autre[c] ?? 0)) > TOLERANCE)) {
      for (const c of ['ht', 'tva', 'ttc']) meilleure.incertains[c] ??= `deux lectures du document donnent des montants différents (${autre.ht}, ${autre.tva}, ${autre.ttc})`
    }
  }

  const confiances = analyses.map((a) => a.confianceMoyenne).filter((c) => c !== null)
  meilleure.confianceMoyenne = confiances.length ? Math.round(confiances.reduce((a, c) => a + c, 0) / confiances.length) : null
  const nombreSignaux = Object.keys(meilleure.incertains).length
  meilleure.statut = [meilleure.ht, meilleure.tva, meilleure.ttc].every((v) => v === null) ? 'illisible' : nombreSignaux > 0 ? 'partielle' : 'reussie'
  return meilleure
}