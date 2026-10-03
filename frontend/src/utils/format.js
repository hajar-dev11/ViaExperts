export function formatFileSize(bytes) {
  if (!bytes) return '0 Ko'
  const units = ['o', 'Ko', 'Mo', 'Go']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(i === 0 || value >= 10 ? 0 : 1)} ${units[i]}`
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Date + heure au format du système de référence : « 08/09/2026 | 12:50 ».
 * Renvoie une chaîne vide si la valeur est absente ou illisible, pour ne
 * jamais afficher « Invalid Date » dans un tableau.
 */
export function formatDateHeure(valeur) {
  if (!valeur) return ''
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return String(valeur)
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} | ${heure}`
}

/** Heure seule, secondes comprises : « 19:09:06 » (format du fil d'activité). */
export function formatHeure(valeur) {
  if (!valeur) return ''
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Date seule : « 08/09/2026 ». */
export function formatDate(valeur) {
  if (!valeur) return ''
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return String(valeur)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
