// Montants des formulaires de facturation et de paiement : quantités entières et soldes.
import { enNombre } from './arrondi.js'

/** Quantité entière (≥ 0) : les décimales sont ignorées, une saisie invalide vaut 0. */
export function quantiteEntiere(valeur) {
  // « 3,7 » ou « 3.7 » vaut 3 : la partie décimale est ignorée, jamais collée aux unités (pas de « 37 »).
  const x = Number.parseInt(String(valeur ?? '').split(/[.,]/)[0].replace(/\D/g, '') || '0', 10)
  return Number.isFinite(x) && x > 0 ? x : 0
}

/** Texte d'un champ « quantité » en cours de saisie : chiffres uniquement, partie décimale d'un texte collé ignorée (« 2,7 » → « 2 »). */
export const saisieQuantite = (valeur) => String(valeur ?? '').split(/[.,]/)[0].replace(/\D/g, '')

/**
 * Montant à l'affichage SANS zéros décimaux inutiles : 104 → « 104 », 104,17 → « 104,17 », 1250,04 → « 1 250,04 », 104,10 → « 104,1 ».
 * La précision réelle du montant est respectée (jamais arrondi ici : au plus 2 décimales, comme la base). Vide ou invalide : « — ».
 * Réservé à l'affichage courant des écrans ; les documents comptables imprimés gardent leurs 2 décimales.
 */
export function formaterMontant(valeur) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === '') return '—'
  const x = Number.parseFloat(String(valeur).replace(',', '.'))
  if (!Number.isFinite(x)) return '—'
  return Number(x.toFixed(2)).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Solde restant : total moins déjà payé, jamais négatif, au centime (pas d'écart de flottant). */
export function soldeRestant(total, paye) {
  const centimes = Math.round(enNombre(total) * 100) - Math.round(enNombre(paye) * 100)
  return Math.max(0, centimes) / 100
}

/**
 * Montant à payer proposé pour un paiement.
 *   - facture rattachée : son SOLDE RESTANT (total TTC − paiements déjà enregistrés), jamais le total ;
 *   - sans facture : le total des lignes du paiement.
 * Renvoie une chaîne à 2 décimales, ou '' s'il n'y a rien à payer (facture soldée, aucune ligne).
 *
 * @param {{ totalTtc?: number|string, prixPaye?: number|string, prixRestant?: number|string } | null} facture
 * @param {number} totalLignes total des lignes saisies dans le formulaire de paiement
 */
export function montantAPayer(facture, totalLignes) {
  const base = facture
    ? (facture.prixRestant !== undefined && facture.prixRestant !== null && facture.prixRestant !== ''
      ? enNombre(facture.prixRestant)
      : soldeRestant(facture.totalTtc, facture.prixPaye))
    : enNombre(totalLignes)
  return base > 0 ? (Math.round(base * 100) / 100).toFixed(2) : ''
}

/**
 * Remise d'une ligne EN MONTANT (Dh) : positive, plafonnée au total HT de la ligne (comme le serveur, `DocumentLigne::remiseEnDh`).
 * Saisie vide ou invalide : 0.
 */
export function remiseEnDh(remise, brut) {
  return Math.min(Math.max(enNombre(remise), 0), Math.max(enNombre(brut), 0))
}
