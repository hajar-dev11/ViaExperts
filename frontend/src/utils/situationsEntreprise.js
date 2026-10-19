// Situations d'une entreprise (`entreprises.situation`) proposées comme FILTRES de la liste des entreprises — elles remplacent les
// anciennes pages « Liste Noire » et « Entreprises Bloquées » de la sidebar. Les valeurs sont celles que porte réellement la base
// (voir StatusBadge et les actions « Liste Noire » / « Bloquer ») ; aucune situation n'est inventée.

export const SITUATIONS = [
  { valeur: '', label: 'Toutes les situations' },
  { valeur: 'Normale', label: 'Normales' },
  { valeur: 'Bloqué', label: 'Bloquées' },
  { valeur: 'Liste Noire', label: 'Liste noire' },
]

/** Situation demandée (adresse `?situation=…`) si elle existe, sinon « toutes ». */
export const situationValide = (demandee) => (SITUATIONS.some((s) => s.valeur === demandee) ? demandee : '')

/** Entreprises de la situation choisie (toutes si le filtre est vide). */
export const filtrerParSituation = (entreprises, situation) => (situation
  ? entreprises.filter((e) => e.situation === situation)
  : entreprises)

/** Nombre d'entreprises par situation (clé '' = toutes), pour les compteurs du filtre. */
export function compterParSituation(entreprises) {
  const compteurs = { '': entreprises.length }
  SITUATIONS.filter((s) => s.valeur).forEach((s) => { compteurs[s.valeur] = entreprises.filter((e) => e.situation === s.valeur).length })
  return compteurs
}
