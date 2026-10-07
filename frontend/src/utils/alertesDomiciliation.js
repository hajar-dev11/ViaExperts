// Seuil d'alerte, aligné sur `Domiciliation::JOURS_ALERTE` côté backend.
export const JOURS_ALERTE = 30

/**
 * Alertes d'échéance de domiciliation du bandeau (Topbar).
 *
 * RÈGLE : une entreprise reste en alerte tant qu'elle n'est pas renouvelée. On ne regarde donc pas chaque contrat
 * isolément, mais le contrat le PLUS RÉCENT de chaque entreprise :
 *   • si sa date de fin est déjà passée ou tombe sous 30 jours → alerte, et elle le reste après l'échéance
 *     (aucune borne basse) ;
 *   • dès qu'un contrat plus récent repousse l'échéance au-delà du seuil, l'entreprise disparaît d'elle-même de l'alerte ;
 *   • un contrat résilié n'est pas une échéance à renouveler ;
 *   • une période déjà renouvelée (une autre période la prolonge, `renouvelleDeId`) n'est plus une échéance : c'est la
 *     période qui la prolonge qui porte l'échéance. Sans cela, un renouvellement dont la date de fin est vide ou antérieure
 *     laissait l'ancienne alerte affichée.
 *
 * @param {Array} lignes domiciliations actives, telles que renvoyées par l'API
 * @param {Date} [maintenant]
 * @returns {Array<{ entrepriseId: (number|string|null), nom: string, dateFin: string, expiree: boolean }>}
 */
export function calculerAlertesEcheance(lignes, maintenant = new Date()) {
  const aujourdhui = new Date(maintenant)
  aujourdhui.setHours(0, 0, 0, 0)
  const limite = new Date(aujourdhui)
  limite.setDate(limite.getDate() + JOURS_ALERTE)

  const renouvelees = new Set(lignes.map((d) => d.renouvelleDeId).filter((id) => id !== null && id !== undefined))

  const dernierParEntreprise = new Map()
  lignes.forEach((d) => {
    if (!d.denomination || !d.dateFin) return
    if (renouvelees.has(d.id)) return
    const cle = d.entrepriseId ?? d.denomination
    const actuel = dernierParEntreprise.get(cle)
    if (!actuel || String(d.dateFin) > String(actuel.dateFin)) {
      dernierParEntreprise.set(cle, d)
    }
  })

  return [...dernierParEntreprise.values()]
    .filter((d) => {
      if (d.etat === 'resilie' || d.statutAffichage === 'resilie') return false
      const fin = new Date(d.dateFin)
      if (Number.isNaN(fin.getTime())) return false
      return fin <= limite
    })
    .sort((a, b) => String(a.dateFin).localeCompare(String(b.dateFin)))
    .map((d) => ({
      entrepriseId: d.entrepriseId ?? null,
      nom: d.denomination,
      dateFin: d.dateFin,
      expiree: new Date(d.dateFin) < aujourdhui,
    }))
}
