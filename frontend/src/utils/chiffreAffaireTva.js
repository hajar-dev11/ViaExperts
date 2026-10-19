// Chiffre d'affaire affiché dans la page « Nouvelle Declaration » : totaux des déclarations de chiffre d'affaire ENREGISTRÉES
// (actives) de la même entreprise, pour la même période et la même année. Lecture seule : rien n'est créé ni modifié.

const nombre = (v) => { const x = Number.parseFloat(v); return Number.isFinite(x) ? x : 0 }

/** Tous les éléments de la recherche sont-ils renseignés ? */
export const critereComplet = ({ entrepriseId, periodeType, periodeValeur, annee }) => Boolean(entrepriseId && periodeType && periodeValeur && annee)

/**
 * @param {Array} lignes déclarations de chiffre d'affaire telles que renvoyées par l'API (camelCase)
 * @param {{ entrepriseId, periodeType, periodeValeur, annee }} critere
 * @returns {{ ht: number, tva: number, ttc: number, nombre: number }}
 */
export function totauxChiffreAffaire(lignes, critere) {
  const retenues = (Array.isArray(lignes) ? lignes : []).filter((d) => String(d.entrepriseId) === String(critere.entrepriseId)
    && d.periodeType === critere.periodeType
    && String(d.periodeValeur) === String(critere.periodeValeur)
    && Number(d.annee) === Number(critere.annee))
  return {
    ht: retenues.reduce((a, d) => a + nombre(d.totalHt), 0),
    tva: retenues.reduce((a, d) => a + nombre(d.totalTva), 0),
    ttc: retenues.reduce((a, d) => a + nombre(d.totalTtc), 0),
    nombre: retenues.length,
  }
}
