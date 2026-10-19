/**
 * Périodes d'analyse des domiciliations, PARTAGÉES par le tableau de bord (graphique « Analyse de Domiciliation » et anneau
 * « Expense Ratio ») et par les tuiles de « Gestion Domiciliation » : une seule définition de la fenêtre de temps, donc
 * les mêmes nombres des deux côtés.
 *
 * `pas` détermine le découpage : un point par jour sur les courtes périodes, un point par mois au-delà.
 */
export const MOIS = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

export const PERIODES = [
  { cle: '7j', label: '7 derniers jours', court: '7 Jours', pas: 'jour', n: 7 },
  { cle: '15j', label: '15 derniers jours', court: '15 Jours', pas: 'jour', n: 15 },
  { cle: '30j', label: '30 derniers jours', court: '30 Jours', pas: 'jour', n: 30 },
  { cle: '3m', label: '3 derniers mois', court: '3 Mois', pas: 'mois', n: 3 },
  { cle: '6m', label: '6 derniers mois', court: '6 Mois', pas: 'mois', n: 6 },
  { cle: '12m', label: '12 derniers mois', court: '12 Mois', pas: 'mois', n: 12 },
]

/** Période par défaut des deux écrans : les 12 derniers mois. */
export const PERIODE_PAR_DEFAUT = PERIODES[PERIODES.length - 1]

/** Période demandée (adresse `?periode=…`) si elle existe, sinon les 12 derniers mois. */
export const periodeValide = (cle) => PERIODES.find((p) => p.cle === cle) ?? PERIODE_PAR_DEFAUT

const cleJour = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const cleMois = (d) => `${d.getFullYear()}-${d.getMonth()}`

/** Clé du jour ou du mois (selon le pas de la période) qui contient une date ; `null` si la date est vide ou invalide. */
export function cleDeDate(valeur, parJour) {
  if (!valeur) return null
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return null
  return parJour ? cleJour(d) : cleMois(d)
}

/**
 * Cases (jours ou mois) de la période, de la plus ancienne à la plus récente : `{ cle, libelle }`.
 * Le dernier jour (ou le mois courant) est « aujourd'hui » ; les dates futures n'en font jamais partie.
 */
export function casesDeLaPeriode(periode, maintenant = new Date()) {
  const parJour = periode.pas === 'jour'
  const cases = []
  for (let i = periode.n - 1; i >= 0; i -= 1) {
    if (parJour) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - i)
      cases.push({ cle: cleJour(d), libelle: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` })
    } else {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
      cases.push({ cle: cleMois(d), libelle: MOIS[d.getMonth()] })
    }
  }
  return cases
}

/** Une date tombe-t-elle dans la période ? (même règle que le comptage des graphiques.) */
export function dansLaPeriode(valeur, periode, maintenant = new Date()) {
  const cle = cleDeDate(valeur, periode.pas === 'jour')
  return cle !== null && casesDeLaPeriode(periode, maintenant).some((c) => c.cle === cle)
}
