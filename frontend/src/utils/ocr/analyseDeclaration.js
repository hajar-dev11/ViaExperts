// Interprétation du texte lu dans une déclaration TVA (PDF avec texte, ou photo passée à l'OCR).
//
// Fonction pure : elle reçoit des LIGNES DE TEXTE et renvoie ce qui y est réellement écrit, rien d'autre.
//   - Une valeur absente, illisible ou ambiguë reste `null` : jamais inventée, jamais « corrigée » en silence.
//   - Aucun taux n'est appliqué d'office : le taux d'une ligne n'est repris que s'il est ÉCRIT dans le document
//     (« TVA (20 %) », « Taux unique 20 % »).
//   - Les contrôles (TVA = base × taux, somme des lignes = total du document…) SIGNALENT les écarts sans toucher aux montants.
//
// Nature du document : `detecterTypeDocument` refuse d'extraire quoi que ce soit d'une facture ou d'un relevé bancaire.
// Aucune ligne n'est jamais cochée d'office : c'est l'utilisateur qui choisit celles à reprendre.
//
// LIMITE : seul le modèle ci-dessous est interprété. Les colonnes d'un relevé de déductions marocain (N° de facture, IF et ICE
// du fournisseur, libellé du fournisseur, dates de facture et de paiement…) ne sont PAS lues : aucun exemple réel n'a été fourni
// pour les implémenter et les tester. Seuls l'IF/ICE écrits dans l'en-tête du document sont repérés.
//
// Modèle reconnu : tableaux de lignes numérotées « N° | Désignation | Base HT | TVA » répartis en sections (TVA collectée,
// TVA déductible…), avec lignes « Total … » — la forme d'une déclaration de TVA de type CA3. Une ligne qui n'entre pas dans ce
// modèle n'est pas interprétée : elle est comptée dans `nonReconnues` et signalée à l'utilisateur.

import { MOTIF_MONTANT, arrondir, lireMontant, normaliserEspaces, trouverMontants } from './nombres.js'

const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
}
const sansAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Confiance en dessous de laquelle une ligne lue par OCR est signalée comme peu fiable. */
export const SEUIL_CONFIANCE = 80
/** Écart toléré (en unités) entre deux montants qui doivent être égaux (arrondis d'impression). */
export const TOLERANCE = 0.02

const LIMITE_LIGNES = 300

export function sectionDepuisTitre(titre) {
  const t = sansAccents(titre)
  if (/collect|brute/.test(t)) return 'collectee'
  if (/deduct/.test(t)) return 'deductible'
  return 'autre'
}

function lirePeriode(lignes) {
  for (const ligne of lignes) {
    const t = sansAccents(ligne)
    let m = /periode\s*:?\s*([a-z]+)\s+(\d{4})/.exec(t)
    if (m && MOIS[m[1]]) return { periode_type: 'mois', periode_valeur: MOIS[m[1]], annee: Number(m[2]), periodeTexte: `${m[1]} ${m[2]}` }

    m = /(?:\b([1-4])\s*(?:er|e|eme)?\s*trimestre\s*(?:de\s*)?(\d{4}))|(?:trimestre\s*([1-4])\D{1,8}(\d{4}))/.exec(t)
    if (m) {
      const valeur = Number(m[1] ?? m[3])
      const annee = Number(m[2] ?? m[4])
      return { periode_type: 'trimestre', periode_valeur: valeur, annee, periodeTexte: `trimestre ${valeur} ${annee}` }
    }
  }
  return null
}

function lireTaux(texte) {
  const m = /\((\d{1,2}(?:[.,]\d+)?)\s*%\)/.exec(texte) // en-tête de colonne « TVA (20 %) »
  if (m && /tva/i.test(texte)) return Number(m[1].replace(',', '.'))
  const u = /taux\s+(?:unique\s+)?(?:de\s+)?(\d{1,2}(?:[.,]\d+)?)\s*%/i.exec(texte)
  return u ? Number(u[1].replace(',', '.')) : null
}

export const LIBELLES_TYPE = {
  declaration_tva: 'Déclaration de TVA',
  facture: 'Facture (achat ou vente) ou document commercial',
  releve_bancaire: 'Relevé bancaire',
  inconnu: 'Type non identifié',
}

/**
 * Nature du document d'après son texte : déclaration de TVA, facture (achat ou vente), relevé bancaire, ou non identifié.
 * Seule une déclaration de TVA (ou un document dont le type est « non identifié », avec un avertissement) donne lieu à
 * l'extraction de lignes : une facture ou un relevé bancaire ne sont JAMAIS pris pour une déclaration fiscale.
 * Le type se décide sur le TITRE (premières lignes), confirmé par quelques mots caractéristiques du corps du document.
 *
 * @returns {{ code: 'declaration_tva'|'facture'|'releve_bancaire'|'inconnu', libelle: string, scores: object }}
 */
export function detecterTypeDocument(textes) {
  const tete = (textes ?? []).slice(0, 10).join('\n')
  const corps = (textes ?? []).join('\n')
  const points = (regles) => regles.reduce((somme, [motif, valeur, zone]) => somme + (motif.test(zone === 'tete' ? tete : corps) ? valeur : 0), 0)

  const scores = {
    declaration_tva: points([
      [/d[ée]claration\s+(?:de\s+|du\s+|d['’]\s*)?(?:la\s+)?t\.?v\.?a\b/i, 3, 'tete'],
      [/\bCA\s?3\b/i, 3, 'tete'],
      [/relev[ée]\s+(?:des?\s+)?d[ée]ductions?/i, 3, 'tete'],
      [/^\s*\d{1,2}\s*[.)]\s+tva\s+(?:collect|d[ée]duct)/im, 1, 'corps'],
    ]),
    facture: points([
      [/^\s*(?:facture|avoir|devis|bon\s+de\s+livraison|note\s+d['’]honoraires)\b/im, 3, 'tete'],
      [/\bfacture\s*(?:n°|no\b|num[ée]ro|#)/i, 2, 'corps'],
      [/\bdate\s+de\s+(?:la\s+)?facture\b/i, 1, 'corps'],
      [/\btotal\s+ttc\b|\bnet\s+[àa]\s+payer\b|\bmontant\s+ttc\b/i, 1, 'corps'],
    ]),
    releve_bancaire: points([
      [/relev[ée]\s+(?:de\s+compte|bancaire|d['’]op[ée]rations)/i, 3, 'tete'],
      [/\bIBAN\b|\bRIB\b|\bBIC\b|\bSWIFT\b/i, 1, 'corps'],
      [/\bsolde\s+(?:initial|final|pr[ée]c[ée]dent|cr[ée]diteur|d[ée]biteur|de\s+cl[ôo]ture)/i, 1, 'corps'],
      [/\bd[ée]bit\b[\s\S]*\bcr[ée]dit\b/i, 1, 'corps'],
    ]),
  }

  const classement = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [code, meilleur] = classement[0]
  const second = classement[1][1]
  const retenu = meilleur >= 3 && meilleur > second ? code : 'inconnu'
  return { code: retenu, libelle: LIBELLES_TYPE[retenu], scores }
}

/**
 * @param {Array<{ texte: string, confiance?: number }>} lignesTexte lignes de texte, dans l'ordre de lecture ; `confiance`
 *        (0 à 100) n'existe que pour l'OCR (absent = texte natif d'un PDF, fiable)
 * @param {{ moteur?: string }} [options]
 */
function moyenneConfiance(sources) {
  const confiances = sources.map((l) => l.confiance).filter((c) => typeof c === 'number')
  return confiances.length ? Math.round(confiances.reduce((a, c) => a + c, 0) / confiances.length) : null
}

export function analyserDeclaration(lignesTexte, options = {}) {
  const sources = (lignesTexte ?? []).slice(0, 2000)
    .map((l) => ({ texte: normaliserEspaces(typeof l === 'string' ? l : l?.texte), confiance: typeof l === 'object' ? l?.confiance : undefined }))
    .filter((l) => l.texte)
  const textes = sources.map((l) => l.texte)

  const typeDocument = detecterTypeDocument(textes)
  if (typeDocument.code === 'facture' || typeDocument.code === 'releve_bancaire') {
    // Ni période, ni montants, ni lignes : ce document n'est pas une déclaration de TVA.
    return {
      entete: { periode_type: null, periode_valeur: null, annee: null, periodeTexte: null, client_if: null, ice: null, tauxDocument: null, regimeTexte: null },
      lignes: [],
      totaux: { collectee: null, deductible: null, tvaNette: null },
      controles: [],
      avertissements: [`Ce document semble être ${typeDocument.code === 'facture' ? 'une facture (achat ou vente) ou un document commercial' : 'un relevé bancaire'}, pas une déclaration de TVA : aucune donnée n'en a été extraite.`],
      nonReconnues: [],
      statut: 'hors_perimetre',
      confianceMoyenne: moyenneConfiance(sources),
      moteur: options.moteur ?? null,
      nombreLignesTexte: textes.length,
      typeDocument,
    }
  }

  const entete = {
    ...(lirePeriode(textes) ?? { periode_type: null, periode_valeur: null, annee: null, periodeTexte: null }),
    client_if: null,
    ice: null,
    tauxDocument: null,
    regimeTexte: null,
  }
  for (const t of textes) {
    entete.client_if ??= /\b(?:IF|identifiant\s+fiscal)\s*(?:n°|no)?\s*:?\s*(\d{6,10})\b/i.exec(t)?.[1] ?? null
    entete.ice ??= /\bICE\s*(?:n°|no)?\s*:?\s*(\d{15})\b/i.exec(t)?.[1] ?? null
    entete.regimeTexte ??= /r[ée]gime\s+([^–—|-]{3,40}?)(?:\s*[–—|-]|$)/i.exec(t)?.[1]?.trim() ?? null
    if (!/tva\s*\(/i.test(t)) entete.tauxDocument ??= lireTaux(t)
  }

  const lignes = []
  const totaux = { collectee: null, deductible: null, tvaNette: null }
  const nonReconnues = []
  let section = 'autre'
  let tauxColonne = null

  for (const { texte, confiance } of sources) {
    const colonne = /tva\s*\(/i.test(texte) ? lireTaux(texte) : null
    if (colonne !== null) tauxColonne = colonne

    const montants = trouverMontants(texte)

    // Titre de section : « 3. TVA déductible » (aucun montant).
    const titre = /^\d{1,2}\s*[.)]\s+(\D.*)$/.exec(texte)
    if (titre && montants.length === 0) {
      section = sectionDepuisTitre(titre[1])
      continue
    }

    // TVA nette à payer (ligne de résultat : « TVA nette à payer (ligne 28) 6 000,00 € »). Une ligne de formules
    // (« TVA nette = TVA brute – TVA déductible | HT = TTC ÷ 1,20 ») n'est pas un résultat.
    if (/^[–—-]?\s*tva\s+nette/i.test(texte) && !/[=÷×]/.test(texte) && montants.length > 0) {
      totaux.tvaNette ??= lireMontant(montants[montants.length - 1].brut).valeur
      continue
    }

    // Ligne de tableau : « N° Désignation montant [montant] ».
    const ligne = /^(\d{1,3})\s+(\D.*)$/.exec(texte)
    if (!ligne || montants.length === 0 || section === 'autre') {
      if (montants.length > 0 && section !== 'autre' && /^(?!tva\b)/i.test(texte)) nonReconnues.push(texte)
      // Ligne numérotée dont les nombres ont un séparateur mais aucun format de montant géré (ex. « 2,000.00 » à l'anglaise) :
      // elle est signalée plutôt que de disparaître en silence.
      else if (ligne && montants.length === 0 && section !== 'autre' && /\d[.,]\d/.test(texte.slice(ligne[1].length))) nonReconnues.push(texte)
      continue
    }

    // Après le premier montant il ne doit rester que des montants et des symboles monétaires.
    const premier = montants[0]
    const apres = texte.slice(premier.index).replace(new RegExp(MOTIF_MONTANT, 'g'), '').replace(/€|EUR|Dh|DH|dh|MAD|\s/g, '')
    const designation = texte.slice(ligne[1].length, premier.index).trim()
    if (designation.length < 2 || apres !== '') {
      nonReconnues.push(texte)
      continue
    }

    const lus = montants.map((m) => ({ ...lireMontant(m.brut), brut: m.brut }))
    const ref = ligne[1]

    if (/^total\b/i.test(designation)) {
      if (section === 'collectee' || section === 'deductible') totaux[section] = lus[lus.length - 1].valeur
      continue
    }
    if (lignes.length >= LIMITE_LIGNES) {
      nonReconnues.push(texte)
      continue
    }

    const incertains = {}
    const remarques = []
    const marquer = (champ, motif) => { incertains[champ] ??= motif }

    let ht = null
    let tva = null
    if (lus.length >= 2) {
      ht = lus[0].valeur
      tva = lus[1].valeur
      if (lus.length > 2) remarques.push(`${lus.length - 2} montant(s) supplémentaire(s) sur la ligne non repris`)
    } else {
      // Un seul montant : la colonne d'origine ne peut pas être déterminée à partir du texte seul. On le range sous « TVA »
      // (cas du report de crédit) mais la ligne n'est pas sélectionnée d'office et le HT reste vide.
      tva = lus[0].valeur
      marquer('ht', 'colonne Base HT vide ou non reconnue')
      remarques.push('un seul montant lu : classé dans TVA, à confirmer')
    }

    lus.forEach((l, i) => {
      const champ = lus.length >= 2 ? (i === 0 ? 'ht' : i === 1 ? 'tva' : null) : 'tva'
      if (champ && l.valeur === null) marquer(champ, 'montant illisible')
      if (champ && l.point) marquer(champ, 'format inhabituel (point comme séparateur de milliers) : vérifier')
    })
    if (typeof confiance === 'number' && confiance < SEUIL_CONFIANCE) {
      for (const champ of ['ht', 'tva']) if ((champ === 'ht' ? ht : tva) !== null) marquer(champ, `lecture peu fiable (confiance ${Math.round(confiance)} %)`)
    }

    const taux = tauxColonne ?? entete.tauxDocument ?? null
    if (taux === null) marquer('taux', 'taux non indiqué dans le document')

    if (ht !== null && tva !== null && taux !== null && ht !== 0) {
      const attendu = arrondir((ht * taux) / 100)
      if (Math.abs(attendu - tva) > TOLERANCE) {
        marquer('tva', `écart : base × ${taux} % = ${attendu.toFixed(2)}`)
        remarques.push(`TVA lue ${tva.toFixed(2)} ≠ base × ${taux} % (${attendu.toFixed(2)})`)
      }
    } else if (ht !== null && tva !== null && taux === null && ht !== 0) {
      remarques.push(`taux implicite : ${arrondir((tva / ht) * 100)} % (non repris, à saisir si exact)`)
    }


    lignes.push({
      id: `l${lignes.length + 1}`,
      ligne_ref: ref,
      section,
      designation,
      ht,
      tva,
      ttc: ht !== null && tva !== null ? arrondir(ht + tva) : null,
      taux,
      incertains,
      remarques,
      texte,
      inclure: false, // jamais cochée d'office : l'utilisateur choisit explicitement les lignes à reprendre
    })
  }

  // ---- Contrôles de cohérence (aucun montant n'est modifié) ----
  const controles = []
  for (const s of ['collectee', 'deductible']) {
    const lignesSection = lignes.filter((l) => l.section === s)
    if (totaux[s] === null || lignesSection.length === 0) continue
    const somme = arrondir(lignesSection.reduce((a, l) => a + (l.tva ?? 0), 0))
    const libelle = s === 'collectee' ? 'TVA collectée' : 'TVA déductible'
    controles.push(Math.abs(somme - totaux[s]) <= TOLERANCE
      ? { niveau: 'ok', message: `${libelle} : la somme des lignes (${somme.toFixed(2)}) correspond au total du document.` }
      : { niveau: 'alerte', message: `${libelle} : la somme des lignes lues (${somme.toFixed(2)}) diffère du total du document (${totaux[s].toFixed(2)}).` })
  }
  if (totaux.collectee !== null && totaux.deductible !== null && totaux.tvaNette !== null) {
    const attendue = arrondir(totaux.collectee - totaux.deductible)
    controles.push(Math.abs(attendue - totaux.tvaNette) <= TOLERANCE
      ? { niveau: 'ok', message: `TVA nette : collectée − déductible (${attendue.toFixed(2)}) correspond au montant du document.` }
      : { niveau: 'alerte', message: `TVA nette : collectée − déductible = ${attendue.toFixed(2)}, le document indique ${totaux.tvaNette.toFixed(2)}.` })
  }

  // ---- Avertissements et statut ----
  const avertissements = []
  if (entete.periode_type === null) avertissements.push('Période non reconnue : choisissez-la dans le formulaire.')
  if (entete.annee !== null && (entete.annee < 2000 || entete.annee > 2100)) avertissements.push(`Année lue (${entete.annee}) hors limites : à corriger.`)
  if (nonReconnues.length > 0) avertissements.push(`${nonReconnues.length} ligne(s) contenant des montants n'ont pas pu être interprétées.`)
  if (lignes.some((l) => l.taux === null)) avertissements.push("Taux non indiqué dans le document pour certaines lignes : il n'est pas rempli.")
  if (lignes.some((l) => Object.values(l.incertains).some((m) => /peu fiable|illisible|format inhabituel/.test(m)))) {
    avertissements.push('Certaines valeurs sont peu fiables ou lues dans un format inhabituel : vérifiez-les avec le document.')
  }

  if (typeDocument.code === 'inconnu' && lignes.length > 0) {
    avertissements.push("Le type de ce document n'a pas pu être identifié (ni titre de déclaration de TVA reconnu) : ne le considérez pas comme une déclaration sans l'avoir vérifié.")
  }

  const confianceMoyenne = moyenneConfiance(sources)

  let statut = 'reussie'
  if (lignes.length === 0) statut = textes.length < 3 || (confianceMoyenne !== null && confianceMoyenne < 50) ? 'illisible' : 'partielle'
  else if (avertissements.length > 0 || controles.some((c) => c.niveau === 'alerte') || lignes.some((l) => Object.keys(l.incertains).some((c) => c !== 'taux'))) statut = 'partielle'

  return { entete, lignes, totaux, controles, avertissements, nonReconnues, statut, confianceMoyenne, moteur: options.moteur ?? null, nombreLignesTexte: textes.length, typeDocument }
}

/**
 * Lignes sélectionnées → lignes du formulaire de déclaration existant (mêmes champs que `emptyLigne`).
 * Seuls les champs réellement lus sont renseignés ; le taux reste vide s'il n'est pas écrit dans le document.
 */
export function versLignesFormulaire(lignes) {
  return lignes.filter((l) => l.inclure).map((l) => ({
    ordre_ref: l.ligne_ref ?? '',
    fact_num: '',
    designation: l.designation ?? '',
    ht: l.ht ?? '',
    tva: l.tva ?? '',
    ttc: l.ttc ?? '',
    identifiant_fiscal: '',
    libelle_fournisseur: '',
    ice: '',
    taux: l.taux ?? '',
    id_paie: '',
    date_paie: '',
    date_fac: '',
  }))
}

/** Champs à signaler dans le formulaire : `{ "0.ht": "motif", … }` (indices dans l'ordre des lignes sélectionnées). */
export function signalementsFormulaire(lignes) {
  const signales = {}
  lignes.filter((l) => l.inclure).forEach((l, i) => {
    for (const [champ, motif] of Object.entries(l.incertains)) signales[`${i}.${champ}`] = motif
  })
  return signales
}
