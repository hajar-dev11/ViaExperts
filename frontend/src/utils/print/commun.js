// Formats d'affichage partagés par tous les documents imprimés (montants, pourcentages, dates).
// Extrait tel quel de documentPrint.js — voir ce fichier pour les ré-exports de compatibilité.

export const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`
// Pourcentage sans décimales inutiles (« 20% », pas « 20.00% »).
export const pct = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}%`
// La date vient de l'API au format technique "AAAA-MM-JJ HH:mm:ss" — on n'affiche
// jamais ça telle quelle. Format normal : "JJ/MM/AAAA", et "JJ/MM/AAAA | HH:mm"
// quand l'heure est réellement renseignée (minuit = simple date, pas d'heure réelle).
export const formatDateFr = (v) => {
  if (!v) return ''
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/)
  if (!m) return String(v)
  const [, annee, mois, jour, heure, minute] = m
  const date = `${jour}/${mois}/${annee}`
  return heure && !(heure === '00' && minute === '00') ? `${date} | ${heure}:${minute}` : date
}
