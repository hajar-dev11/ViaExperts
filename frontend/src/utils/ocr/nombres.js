// Lecture des montants d'un document (PDF ou photo) : formats français et lectures approximatives de l'OCR.
// Fonctions pures. Rien n'est jamais deviné : une valeur qui ne se lit pas renvoie `null`.

/** Espaces insécables et fines, fréquents dans les montants français (« 50 000,00 »), ramenés à une espace ordinaire. */
export function normaliserEspaces(texte) {
  return String(texte ?? '').replace(/[      ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Montant dans une ligne : « 50 000,00 € », « 2.000,00 » (espace lue comme un point par l'OCR), « 2000,00€ », « -1 234,50 », « 0,00 ».
 * Une partie décimale (virgule + 1 ou 2 chiffres) est exigée : un entier seul (« 20 », « 2026 », un numéro de ligne) n'est jamais pris
 * pour un montant.
 */
export const MOTIF_MONTANT = String.raw`-?(?:\d{1,3}(?:[ .]\d{3})+|\d+),\d{1,2}`
const DEVISE = String.raw`(?:\s?(?:€|EUR|Dh|DH|dh|MAD))?`

/** Tous les montants d'un texte, avec leur position : `[{ brut, index, fin }]`. */
export function trouverMontants(texte) {
  const motif = new RegExp(`(?<![\\d.,])(${MOTIF_MONTANT})${DEVISE}(?![\\d])`, 'g')
  return [...normaliserEspaces(texte).matchAll(motif)].map((m) => ({ brut: m[1], index: m.index, fin: m.index + m[0].length }))
}

/**
 * Valeur numérique d'un montant brut.
 * @returns {{ valeur: number|null, point: boolean }} `point` : un point sépare les milliers (« 2.000,00 »). En français c'est
 *          inhabituel (l'espace est la norme) : c'est souvent une espace mal lue, la valeur est donc à vérifier.
 */
export function lireMontant(brut) {
  const texte = normaliserEspaces(brut).replace(/(?:€|EUR|Dh|DH|dh|MAD)/g, '').replace(/\s+/g, '')
  if (!texte) return { valeur: null, point: false }

  // Français : milliers séparés par des espaces (déjà retirées) ou des points, décimales après une virgule.
  let m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(texte)
  if (m) {
    return { valeur: Number(`${m[1]}${m[2].replace(/\./g, '')}.${m[3]}`), point: m[2].includes('.') }
  }

  // Anglais : milliers séparés par des virgules, décimales après un point.
  m = /^(-?)(\d{1,3}(?:,\d{3})+|\d+)\.(\d{1,2})$/.exec(texte)
  if (m) return { valeur: Number(`${m[1]}${m[2].replace(/,/g, '')}.${m[3]}`), point: false }

  m = /^(-?\d+)$/.exec(texte)
  if (m) return { valeur: Number(m[1]), point: false }

  return { valeur: null, point: false }
}

/** Arrondi à 2 décimales, sans les erreurs de virgule flottante (1.005 → 1.01). */
export const arrondir = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100
