// Calculs du donut « Expense Ratio » (tableau de bord) : angles des parts et tracé SVG des secteurs d'anneau.
// Fonctions pures, testables sans navigateur.

/**
 * Les 4 actions de domiciliation suivies par les deux graphiques du tableau de bord, dans l'ordre et avec les couleurs de la
 * référence. « Déclary » est le libellé historique (voir aussi la liste des domiciliations).
 */
export const SERIES_DOMICILIATION = [
  { key: 'nouveau', label: 'Nouveau', color: '#28c76f' },
  { key: 'renouveler', label: 'Renouveler', color: '#7367f0' },
  { key: 'declary', label: 'Déclary', color: '#191919' },
  { key: 'resilier', label: 'Résilier', color: '#00cfe8' },
]

/**
 * Valeur cumulée de CHAQUE série sur les points de la période (0 si aucune), sans rien écarter : sert à la légende fixe,
 * qui montre toujours les quatre actions. Le donut, lui, ne trace que les valeurs > 0 (`calculerSegments`) : ce calcul-là
 * n'est pas modifié.
 */
export function valeursParSerie(series, points) {
  return (series ?? []).map((s) => ({
    ...s,
    value: (points ?? []).reduce((acc, p) => acc + (Number.isFinite(p?.[s.key]) ? p[s.key] : 0), 0),
  }))
}

/** Point du cercle (angle en degrés, 0 = 3 h, sens horaire). */
export function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

/** À partir de cet angle, une part est tracée comme un anneau complet. */
const BALAYAGE_COMPLET = 359.99

/**
 * Anneau complet (part de 100 %). Un arc SVG dont le point d'arrivée est son point de départ n'est PAS dessiné : une seule
 * part à 100 % (un seul statut) donnait donc un anneau invisible. On trace ici deux demi-cercles par bord, le bord
 * intérieur dans le sens inverse pour que le centre reste vide.
 */
export function decrireAnneau(cx, cy, rOuter, rInner) {
  return [
    `M ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy} Z`,
    `M ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy} Z`,
  ].join(' ')
}

/**
 * Secteur d'anneau plein, de `startAngle` à `endAngle` (degrés, 0 = 3 h, sens horaire).
 * Renvoie une chaîne vide si l'angle est nul, négatif ou invalide (rien à dessiner).
 */
export function decrireArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const balayage = endAngle - startAngle
  if (!Number.isFinite(balayage) || balayage <= 0) return ''
  if (balayage >= BALAYAGE_COMPLET) return decrireAnneau(cx, cy, rOuter, rInner)

  const large = balayage > 180 ? 1 : 0
  const [x1, y1] = polarToCartesian(cx, cy, rOuter, startAngle)
  const [x2, y2] = polarToCartesian(cx, cy, rOuter, endAngle)
  const [x3, y3] = polarToCartesian(cx, cy, rInner, endAngle)
  const [x4, y4] = polarToCartesian(cx, cy, rInner, startAngle)
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
}

/**
 * Parts du donut à partir des séries comptées (`{ key, label, color, value }`).
 * Les valeurs absentes, négatives, non numériques ou nulles sont ignorées ; aucune division par zéro : sans donnée
 * exploitable, `segments` est vide et `total` vaut 0. Les parts commencent à midi (-90°), dans l'ordre reçu.
 */
export function calculerSegments(repartition) {
  const valides = (repartition ?? []).filter((s) => Number.isFinite(s?.value) && s.value > 0)
  const total = valides.reduce((somme, s) => somme + s.value, 0)
  if (total <= 0) return { total: 0, segments: [] }

  let cumul = 0
  const segments = valides.map((s) => {
    const startAngle = -90 + (cumul / total) * 360
    const balayage = (s.value / total) * 360
    cumul += s.value
    return { ...s, percent: s.value / total, startAngle, endAngle: startAngle + balayage, mid: startAngle + balayage / 2 }
  })
  return { total, segments }
}
