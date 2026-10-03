// Conversion d'un montant en toutes lettres (français), pour les documents
// imprimés (Facture, Devis, Bon Livraison, Facture d'Avoir, Reçu) — reprend
// exactement le rendu des captures de référence : « SEPT CENT CINQUANTE
// DIRHAMS », « TROIS MILLE SIX CENTS DIRHAMS ». Seule la partie entière du
// montant est épelée (les centimes ne le sont pas dans les références).

const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']
const DIX_SEIZE = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

// La règle des dizaines composées (70-79, 90-99) est assez tordue en français
// pour mériter sa propre table dédiée plutôt qu'une formule générale.
const SEPTANTE = ['soixante-dix', 'soixante-et-onze', 'soixante-douze', 'soixante-treize', 'soixante-quatorze', 'soixante-quinze', 'soixante-seize', 'soixante-dix-sept', 'soixante-dix-huit', 'soixante-dix-neuf']
const NONANTE = ['quatre-vingt-dix', 'quatre-vingt-onze', 'quatre-vingt-douze', 'quatre-vingt-treize', 'quatre-vingt-quatorze', 'quatre-vingt-quinze', 'quatre-vingt-seize', 'quatre-vingt-dix-sept', 'quatre-vingt-dix-huit', 'quatre-vingt-dix-neuf']

function dizaineEnLettres(reste) {
  const d = Math.floor(reste / 10)
  const u = reste % 10
  if (d === 7) return SEPTANTE[u]
  if (d === 9) return NONANTE[u]
  let mot = DIZAINES[d]
  if (u === 1 && d !== 8) return `${mot}-et-un`
  if (u > 0) return `${mot}-${UNITES[u]}`
  return d === 8 ? `${mot}s` : mot
}

/** n : 0-999 */
function centaineEnLettres(n) {
  const c = Math.floor(n / 100)
  const reste = n % 100
  const mots = []
  if (c > 0) mots.push(c === 1 ? 'cent' : `${UNITES[c]} cent${reste === 0 ? 's' : ''}`)
  if (reste > 0) {
    if (reste < 10) mots.push(UNITES[reste])
    else if (reste < 17) mots.push(DIX_SEIZE[reste - 10])
    else if (reste < 20) mots.push(`dix-${UNITES[reste - 10]}`)
    else mots.push(dizaineEnLettres(reste))
  }
  return mots.join(' ')
}

function entierEnLettres(n) {
  if (n === 0) return 'zéro'

  const tranches = [
    { valeur: 1000000000, mot: 'milliard' },
    { valeur: 1000000, mot: 'million' },
    { valeur: 1000, mot: 'mille' },
  ]

  let reste = n
  const parts = []

  for (const { valeur, mot } of tranches) {
    const q = Math.floor(reste / valeur)
    if (q > 0) {
      if (valeur === 1000 && q === 1) parts.push('mille')
      else parts.push(`${centaineEnLettres(q)} ${mot}${q > 1 && mot !== 'mille' ? 's' : ''}`)
      reste -= q * valeur
    }
  }

  if (reste > 0) parts.push(centaineEnLettres(reste))

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** « 750.42 » → « SEPT CENT CINQUANTE DIRHAMS » (partie entière uniquement). */
export function montantEnLettres(montant) {
  const entier = Math.floor(Math.abs(Number(montant) || 0))
  return `${entierEnLettres(entier)} dirhams`.toUpperCase()
}
