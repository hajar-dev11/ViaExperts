// Calculs du Calculateur de TVA (voir components/TvaCalculatorPanel.jsx) : fonctions pures, testables sans navigateur.

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * TVA d'une ligne de déclaration : HT × taux / 100, arrondie au centime, en texte à 2 décimales (« 300.00 »).
 * HT ou taux vide / invalide / négatif => « 0.00 ».
 */
export function tvaDepuisHt(ht, taux) {
  const h = parseFloat(ht)
  const t = parseFloat(taux)
  if (Number.isNaN(h) || Number.isNaN(t) || h < 0 || t < 0) return '0.00'
  return round2(h * t / 100).toFixed(2)
}

/**
 * Calcule les trois montants. `source` : champ saisi ('ht' | 'ttc' | 'tva'), `valeur` : texte saisi, `taux` : texte du taux (%).
 * Valeur vide, négative ou invalide => zéros (comme l'ancien panneau).
 */
export function calculerTva(source, valeur, taux) {
  const a = Number(valeur)
  const t = Number(taux === '' ? 0 : taux)
  if (valeur === '' || Number.isNaN(a) || a < 0 || Number.isNaN(t) || t < 0) {
    return { ht: 0, tva: 0, ttc: 0 }
  }
  if (source === 'ttc') {
    const ht = round2(a / (1 + t / 100))
    return { ht, tva: round2(a - ht), ttc: round2(a) }
  }
  if (source === 'tva') {
    // Sans taux, la TVA ne permet pas de remonter au HT.
    const ht = t > 0 ? round2(a / (t / 100)) : 0
    return { ht, tva: round2(a), ttc: round2(ht + a) }
  }
  const tva = round2(a * (t / 100))
  return { ht: round2(a), tva, ttc: round2(a + tva) }
}
