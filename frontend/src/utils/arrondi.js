// Règle d'arrondi du PRIX TOTAL — la même que le serveur (App\Support\ArrondiPrix) :
//   partie décimale < 0,50 → entier inférieur (1 250,49 → 1 250)
//   partie décimale ≥ 0,50 → entier supérieur (1 250,50 → 1 251 ; 1 250,75 → 1 251)
//   un total déjà entier ne change pas (1 250,00 → 1 250)
//
// Elle s'applique UNIQUEMENT à : le prix total de domiciliation et le total HT d'un document (TVA et TTC calculés ensuite sur
// ce total). Les prix unitaires (service, ligne de document ou de paiement, prix par mois de domiciliation), les quantités,
// les montants de ligne et le total d'un PAIEMENT (somme exacte de ses lignes) gardent leurs centimes.

/** Nombre depuis une saisie (virgule ou point) ; 0 si ce n'est pas un nombre. */
export function enNombre(valeur) {
  const x = Number.parseFloat(String(valeur ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

/**
 * Prix entier, « demi vers le haut ». Calcul sur les CENTIMES entiers (aucune erreur de flottant) :
 * 100,50 → 10050 centimes → (10050 + 50) / 100 → 101.
 */
export function arrondirPrix(valeur) {
  const centimes = Math.round(enNombre(valeur) * 100)
  return Math.floor((centimes + 50) / 100)
}

/** Texte d'un champ de prix après arrondi (chaîne vide conservée : un champ vide reste vide). */
export function prixArrondiEnTexte(valeur) {
  return String(valeur ?? '').trim() === '' ? '' : String(arrondirPrix(valeur))
}

/**
 * Prix à enregistrer : arrondi à l'entier, SAUF un montant déjà enregistré et resté identique (modification) — un montant
 * historique avec centimes n'est jamais réécrit par un simple réenregistrement. Renvoie un nombre.
 */
export function prixConserveOuArrondi(valeur, origine) {
  const inchange = origine !== undefined && origine !== null && origine !== '' && Math.abs(enNombre(valeur) - enNombre(origine)) < 0.005
  return inchange ? enNombre(origine) : arrondirPrix(valeur)
}

// ── Totaux d'un document (facture, devis, bon de livraison, avoir) ─────────────────────────────────────────────────────────────
// Les prix unitaires et les lignes gardent leurs centimes ; seul le TOTAL HT est arrondi (règle ci-dessus). La TVA est calculée
// sur ce total arrondi (proportionnellement aux taux des lignes) et TTC = HT + TVA. Même calcul que le serveur
// (App\Support\ArrondiPrix::totauxDocument), en centimes entiers : aucune différence d'arrondi entre l'écran et l'enregistrement.

/** Montant en centimes entiers, demi vers le haut (625,02 → 62502). */
const enCentimes = (valeur) => Math.floor(Number(valeur) * 100 + 0.5)

/** Centimes → entier de Dh en centimes, règle du demi (62502 → 62500 ; 62550 → 62600). */
const centimesEnEntier = (centimes) => Math.floor((centimes + 50) / 100) * 100

/**
 * @param {Array<{ brut: number, remise: number, tva: number }>} lignes montants en Dh de chaque ligne (tva = taux en %)
 * @returns {{ ht: number, remise: number, netHt: number, tva: number, ttc: number }} montants en Dh
 */
export function totauxDocument(lignes) {
  let remiseC = 0
  let netC = 0
  let tvaBruteC = 0
  for (const l of lignes) {
    const brutC = enCentimes(l.brut)
    const remC = Math.min(Math.max(enCentimes(l.remise), 0), brutC)
    const ligneNetC = brutC - remC
    remiseC += remC
    netC += ligneNetC
    tvaBruteC += ligneNetC * (Number(l.tva) / 100)
  }
  const netArrondiC = centimesEnEntier(netC)
  const tvaC = netC > 0 ? Math.floor((tvaBruteC * netArrondiC) / netC + 0.5) : 0
  return {
    ht: (netArrondiC + remiseC) / 100,
    remise: remiseC / 100,
    netHt: netArrondiC / 100,
    tva: tvaC / 100,
    ttc: (netArrondiC + tvaC) / 100,
  }
}
