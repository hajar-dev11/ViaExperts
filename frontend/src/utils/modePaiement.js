// Mode de paiement « Autres à déterminer » : l'utilisateur précise le mode (ex. « Mandat »). Le mode précisé est enregistré
// sous la forme « Autre : Mandat » dans la colonne existante `mode_paiement` — aucune colonne ni migration en plus — et
// le serveur n'accepte que cette forme (voir StoreDomiciliationRequest::reglesModePaiement).

/** Valeur de la liste qui déclenche la saisie du mode. */
export const MODE_A_DETERMINER = 'Autres à déterminer'

/** Préfixe d'un mode précisé à la main. */
export const PREFIXE_MODE_AUTRE = 'Autre : '

/** Longueur maximale de la précision (mêmes limites que le serveur : 32, pour 40 caractères au total). */
export const LONGUEUR_MAX_PRECISION = 32

/** Le mode enregistré est-il « Autres à déterminer », précisé ou non ? */
export const estModeAutre = (valeur) => valeur === MODE_A_DETERMINER || String(valeur ?? '').startsWith(PREFIXE_MODE_AUTRE)

/** Précision saisie d'un mode « Autre : … » (chaîne vide si aucune). */
export const precisionModeAutre = (valeur) => (String(valeur ?? '').startsWith(PREFIXE_MODE_AUTRE)
  ? String(valeur).slice(PREFIXE_MODE_AUTRE.length)
  : '')

/**
 * Valeur du champ pour une précision en cours de saisie : « Autre : Mandat », ou « Autres à déterminer » si elle est vide.
 * Les espaces ne sont pas retirés ici (on tape « Mandat bancaire » lettre après lettre) : voir `modePourEnvoi`.
 */
export function composerModeAutre(precision) {
  const texte = String(precision ?? '').slice(0, LONGUEUR_MAX_PRECISION)
  return texte.trim() === '' ? MODE_A_DETERMINER : `${PREFIXE_MODE_AUTRE}${texte}`
}

/** Valeur envoyée au serveur : la précision est nettoyée (espaces de bord) ; un mode de la liste est inchangé. */
export function modePourEnvoi(valeur) {
  if (!valeur) return valeur
  return estModeAutre(valeur) ? composerModeAutre(precisionModeAutre(valeur).trim()) : valeur
}
