import { listServices } from '../api/services.js'

/**
 * Date de fin = date de départ + nombre de mois de domiciliation.
 *
 * Le nombre de mois est la somme des mois payés et des mois gratuits : c'est la
 * durée réellement couverte par le contrat, et c'est déjà la base du Prix Total.
 *
 * Le décalage se fait sur le quantième : le 31/01 + 1 mois donne le 28/02
 * (ou le 29/02) plutôt que de déborder sur mars.
 */
export function calculerDateFin(dateDepart, nombreDeMois) {
  const mois = Number(nombreDeMois)
  if (!dateDepart || !Number.isFinite(mois) || mois <= 0) return ''

  const [annee, m, jour] = dateDepart.split('-').map(Number)
  if (!annee || !m || !jour) return ''

  const cible = new Date(annee, m - 1 + mois, 1)
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate()
  cible.setDate(Math.min(jour, dernierJour))

  const mm = String(cible.getMonth() + 1).padStart(2, '0')
  const jj = String(cible.getDate()).padStart(2, '0')
  return `${cible.getFullYear()}-${mm}-${jj}`
}

/**
 * Prix mensuel de la domiciliation, repris du module Services.
 *
 * Le tarif n'est pas codé en dur : il vient de la fiche Service dont le nom
 * contient « domiciliation ». Modifier ce prix dans Services > Liste des
 * Services se répercute donc sur les formulaires de domiciliation.
 *
 * Renvoie `{ prix, service }`, ou `{ prix: null, service: null }` si aucune
 * fiche ne correspond — l'appelant affiche alors un message plutôt que
 * d'inventer un tarif.
 */
export async function chargerPrixServiceDomiciliation() {
  try {
    const reponse = await listServices('actif')
    const services = Array.isArray(reponse) ? reponse : (reponse?.data ?? [])
    const service = services.find((s) => /domicili/i.test(s.nom ?? ''))
    if (!service || service.prix === null || service.prix === undefined) {
      return { prix: null, service: null }
    }
    return { prix: String(service.prix), service }
  } catch {
    return { prix: null, service: null }
  }
}

/**
 * Distingue « Nouveau » de « Renouveler » pour un ensemble de domiciliations.
 *
 * Deux sources, dans cet ordre :
 *  1. le lien explicite `renouvelleDeId`, posé par l'action « Renouveler » ;
 *  2. à défaut — lignes créées avant ce lien — le rang par date de départ au
 *     sein d'une même entreprise : la plus ancienne est la première période.
 *
 * Renvoie une `Map` id → 'nouveau' | 'renouveler'.
 */
export function classerNouveauRenouveler(domiciliations) {
  const parEntreprise = new Map()
  domiciliations.forEach((d) => {
    const cle = d.entrepriseId ?? d.denomination
    if (!parEntreprise.has(cle)) parEntreprise.set(cle, [])
    parEntreprise.get(cle).push(d)
  })

  const classement = new Map()
  parEntreprise.forEach((lignes) => {
    const triees = [...lignes].sort((a, b) => String(a.dateDepart ?? '').localeCompare(String(b.dateDepart ?? '')))
    triees.forEach((d, rang) => {
      classement.set(d.id, (d.renouvelleDeId || rang > 0) ? 'renouveler' : 'nouveau')
    })
  })

  return classement
}
