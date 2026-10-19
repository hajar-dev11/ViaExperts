// Contrôles VISUELS des lignes de « Déclaration TVA » et de « Chiffre d'Affaire » (même tableau, mêmes règles) :
//   • ROUGE  — numéro de facture en doublon pour le même fournisseur ;
//   • ORANGE — règlements en espèces cumulés pour un même fournisseur > 5 000 Dh (strictement supérieur).
// Ce sont des AVERTISSEMENTS : rien ne bloque l'enregistrement ou l'export, rien n'est modifié ni fusionné automatiquement.

/** Seuil des règlements en espèces par fournisseur : un montant égal à 5 000 Dh ne déclenche rien. */
export const SEUIL_ESPECES = 5000

const nombre = (v) => { const x = parseFloat(v); return Number.isNaN(x) ? 0 : x }

/** Numéro de facture comparable : sans espaces, insensible à la casse (« fa 12 » = « FA12 »). Vide si non renseigné. */
export const normaliserNumero = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase()

const normaliserTexte = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase()

// Libellés trop génériques pour identifier un tiers : jamais utilisés comme identité (ce serait regrouper des tiers différents).
const LIBELLES_GENERIQUES = new Set(['DIVERS', 'CLIENT', 'CLIENTS', 'FOURNISSEUR', 'FOURNISSEURS', 'CASH', 'COMPTANT', 'AUTRE', 'AUTRES', 'NC', 'N/A', 'INCONNU'])
const LONGUEUR_MIN_LIBELLE = 4

/**
 * Clé « même tiers » (client ou fournisseur), par ordre de fiabilité : l'IF s'il est renseigné, sinon l'ICE, sinon le NOM
 * normalisé (sans accents ni casse, espaces réduits) — seulement s'il est assez précis (4 caractères au moins, pas un libellé
 * générique comme « DIVERS »). Sans identité fiable : `null`. Pour le cumul des espèces, une telle ligne est alors jugée seule
 * (jamais regroupée arbitrairement) ; pour les doublons, elles forment un « fournisseur non renseigné » (`analyserDoublons`).
 * Un IF et un ICE ne sont jamais comparés entre eux.
 */
export function cleFournisseur(ligne) {
  const identifiantFiscal = String(ligne.identifiant_fiscal ?? ligne.identifiantFiscal ?? '').replace(/\s+/g, '').toUpperCase()
  if (identifiantFiscal) return `IF:${identifiantFiscal}`
  const ice = String(ligne.ice ?? '').replace(/\s+/g, '').toUpperCase()
  if (ice) return `ICE:${ice}`
  const libelle = normaliserTexte(ligne.libelle_fournisseur ?? ligne.libelleFournisseur)
  return libelle.length >= LONGUEUR_MIN_LIBELLE && !LIBELLES_GENERIQUES.has(libelle) ? `LIB:${libelle}` : null
}

/** Texte lisible du tiers pour un message : « IF 123 », « ICE 001… » ou son nom. */
export function libelleTiers(cle, ligne) {
  const nom = String(ligne.libelle_fournisseur ?? ligne.libelleFournisseur ?? '').trim()
  const [type, valeur] = String(cle).split(/:(.*)/s)
  const identite = type === 'IF' ? `IF ${valeur}` : type === 'ICE' ? `ICE ${valeur}` : ''
  return [nom, identite].filter(Boolean).join(' — ') || valeur || 'tiers non identifié'
}

/** Règlement en espèces : l'ID PAIE de la ligne, ou à défaut l'identifiant de paiement de l'en-tête, contient « ESPECE ». */
export const estReglementEspeces = (ligne, identifiantPaiementDefaut) =>
  String(ligne.id_paie || identifiantPaiementDefaut || '').toUpperCase().includes('ESPECE')

/**
 * CUMUL des règlements en espèces par tiers (client ou fournisseur, identifié par IF > ICE > nom fiable) : on additionne le TTC
 * de ses factures réglées en espèces — celles du tableau affiché ET celles déjà ENREGISTRÉES (`enregistrees`, voir l'API
 * `especesExistantes` : même type, même entreprise, même année). Dès que le cumul dépasse STRICTEMENT 5 000 Dh, toutes les
 * lignes en espèces du tiers dans le tableau sont signalées. Les autres modes de paiement n'entrent jamais dans le cumul, ni les
 * factures d'un autre tiers.
 *
 * Pas de double comptage : une même facture (même numéro, même tiers) n'est ajoutée qu'une fois, qu'elle soit saisie deux fois
 * dans le tableau (doublon) ou déjà enregistrée. Les lignes dont le tiers n'est pas identifiable de façon fiable ne sont jamais
 * regroupées : chacune est jugée seule.
 *
 * @returns {{ depassements: Array<{cle, tiers, total, totalEnregistre, indices: number[], declarations: number[]}>, lignesSignalees: Set<number> }}
 */
export function analyserEspeces(lignes, identifiantPaiementDefaut, enregistrees = []) {
  const groupes = new Map()
  const dejaCompte = (groupe, numero) => numero !== '' && groupe.numeros.has(numero)

  lignes.forEach((ligne, index) => {
    if (!estReglementEspeces(ligne, identifiantPaiementDefaut)) return
    const cle = cleFournisseur(ligne) ?? `__seule_${index}`
    const groupe = groupes.get(cle) ?? { cle, tiers: libelleTiers(cle, ligne), total: 0, totalEnregistre: 0, indices: [], declarations: new Set(), numeros: new Set() }
    const numero = normaliserNumero(ligne.fact_num)
    if (!dejaCompte(groupe, numero)) {
      groupe.total += nombre(ligne.ttc)
      if (numero) groupe.numeros.add(numero)
    }
    groupe.indices.push(index)
    groupes.set(cle, groupe)
  })

  enregistrees.forEach((e) => {
    const cle = cleFournisseur(e)
    const groupe = cle ? groupes.get(cle) : null // seuls comptent les tiers présents dans le tableau
    if (!groupe) return
    const numero = normaliserNumero(e.factNum)
    if (dejaCompte(groupe, numero)) return // cette facture est déjà comptée (saisie dans le tableau)
    if (numero) groupe.numeros.add(numero)
    groupe.total += nombre(e.ttc)
    groupe.totalEnregistre += nombre(e.ttc)
    groupe.declarations.add(e.declarationId)
  })

  const depassements = [...groupes.values()]
    .filter((g) => g.total > SEUIL_ESPECES)
    .map((g) => ({ ...g, declarations: [...g.declarations], numeros: undefined }))
  return { depassements, lignesSignalees: new Set(depassements.flatMap((g) => g.indices)) }
}

/**
 * Doublons de numéro de facture pour un même fournisseur.
 *  - dans le tableau affiché : deux lignes ou plus avec le même numéro et le même fournisseur → toutes sont signalées ;
 *  - parmi les factures déjà ENREGISTRÉES (`existantes`, voir l'API `facturesExistantes`) : même numéro et même fournisseur.
 * Une ligne sans numéro n'est jamais un doublon ; un même numéro chez deux fournisseurs différents non plus. Deux lignes de même
 * numéro dont le fournisseur n'est pas renseigné sont signalées (même « fournisseur non renseigné »).
 *
 * @returns {Map<number, {dansTableau: boolean, enregistrees: number[]}>} indice de ligne → origine du doublon
 */
export function analyserDoublons(lignes, existantes = []) {
  // Fournisseur non renseigné (ni IF, ni ICE, ni libellé) : toutes ces lignes forment UN « fournisseur non renseigné » ; deux
  // factures de même numéro sans fournisseur sont donc signalées (jamais rapprochées d'une ligne dont le fournisseur est connu).
  const fournisseurDe = (ligne) => cleFournisseur(ligne) ?? 'SANS-FOURNISSEUR'

  const parCle = new Map()
  lignes.forEach((ligne, index) => {
    const numero = normaliserNumero(ligne.fact_num)
    if (!numero) return
    const cle = `${fournisseurDe(ligne)}|${numero}`
    parCle.set(cle, [...(parCle.get(cle) ?? []), index])
  })

  const enregistrees = new Map()
  existantes.forEach((e) => {
    const numero = normaliserNumero(e.factNum)
    if (!numero) return
    const cle = `${fournisseurDe(e)}|${numero}`
    enregistrees.set(cle, [...new Set([...(enregistrees.get(cle) ?? []), e.declarationId])])
  })

  const doublons = new Map()
  parCle.forEach((indices, cle) => {
    const declarations = enregistrees.get(cle) ?? []
    if (indices.length < 2 && declarations.length === 0) return
    indices.forEach((i) => doublons.set(i, { dansTableau: indices.length > 1, enregistrees: declarations }))
  })
  return doublons
}

/**
 * Fond d'UNE CELLULE (jamais de la ligne entière, sans message) : la cellule « FACT NUM » en rouge foncé quand le numéro est en doublon,
 * la cellule « TTC » en orange quand les espèces du fournisseur dépassent 5 000 Dh. Les classes sont des constantes littérales
 * (détectées par Tailwind). `champ` : classes du champ de saisie (son fond blanc est remplacé) ; `cellule` : celles de la case.
 */
export function fondDeCellule(cle, { doublon, especes }) {
  // Rouge FONCÉ (danger-700) réservé aux doublons de numéro de facture ; texte blanc pour rester parfaitement lisible.
  if (cle === 'fact_num' && doublon) return { cellule: 'bg-danger-700', champ: 'bg-danger-700! border-danger-700! text-white! font-semibold' }
  if (cle === 'ttc' && especes) return { cellule: 'bg-warning-200', champ: 'bg-warning-200! border-warning-600!' }
  return { cellule: '', champ: '' }
}
