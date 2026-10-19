import { listServices } from '../../../api/services.js'
import { arrondirPrix } from '../../../utils/arrondi.js'

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
 * RÈGLE DE CALCUL (identique côté serveur : `PrixDomiciliation`) :
 *   - durée du contrat  = mois payés + mois gratuits  → sert UNIQUEMENT à la date de fin ;
 *   - mois facturables  = mois payés                  → les mois gratuits ne sont JAMAIS facturés ;
 *   - prix par mois     = EXACT, au centime (104,17 reste 104,17 : prix par défaut d'une domiciliation) ;
 *   - prix total (HT)   = prix par mois × mois payés, arrondi à l'entier par la règle du demi (104,17 × 12 = 1 250,04 → 1250 ;
 *                         voir utils/arrondi.js) — c'est une PROPOSITION : le champ reste modifiable à la main.
 * Renvoie le total sous forme « 1250 », ou `null` si le prix par mois n'est pas un nombre.
 */
export function calculerPrixTotal(prixParMois, moisPayes) {
  const prix = parseFloat(String(prixParMois ?? '').replace(',', '.'))
  if (Number.isNaN(prix)) return null
  const mois = Math.max(0, Math.trunc(Number(moisPayes) || 0))
  // Centimes entiers × mois (aucun bruit de flottant), puis arrondi du total à l'entier.
  return String(arrondirPrix((Math.round(prix * 100) * mois) / 100))
}

/**
 * La section « Ajouter Domiciliation » de la page Entreprise est-elle réellement remplie ?
 * Oui s'il y a une date de départ ET une durée (au moins un mois payé ou gratuit). La date de départ est pré-remplie :
 * à elle seule elle ne prouve pas que l'utilisateur veut créer une domiciliation.
 */
export function domiciliationSaisie(domi) {
  const duree = (Number(domi?.mois_payee) || 0) + (Number(domi?.mois_gratuits) || 0)
  return !!domi?.date_depart && duree > 0
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
  const classement = new Map()
  periodesParEntreprise(domiciliations).forEach((triees) => {
    triees.forEach((d, rang) => {
      classement.set(d.id, (d.renouvelleDeId || rang > 0) ? 'renouveler' : 'nouveau')
    })
  })

  return classement
}

/**
 * Périodes d'une même entreprise, de la plus ancienne à la plus récente.
 * Sans entreprise ni dénomination, la ligne forme son propre groupe (jamais fusionnée avec une autre).
 */
function periodesParEntreprise(domiciliations) {
  const parEntreprise = new Map()
  domiciliations.forEach((d) => {
    const cle = d.entrepriseId ?? d.denomination ?? `ligne-${d.id}`
    if (!parEntreprise.has(cle)) parEntreprise.set(cle, [])
    parEntreprise.get(cle).push(d)
  })
  parEntreprise.forEach((lignes, cle) => {
    parEntreprise.set(cle, [...lignes].sort((a, b) => String(a.dateDepart ?? '').localeCompare(String(b.dateDepart ?? ''))))
  })
  return parEntreprise
}

/**
 * Identifiants des périodes déjà RENOUVELÉES : une période plus récente de la même entreprise (ou une période qui la
 * désigne par `renouvelleDeId`) a pris le relais. Seule la période en cours d'une entreprise est « à suivre » : ces
 * périodes-là appartiennent à l'historique et ne doivent plus figurer dans « Nouveau » (l'entreprise est déjà en
 * renouvellement) ni être comptées une seconde fois dans les listes et compteurs.
 *
 * Le calcul porte sur les périodes ACTIVES transmises : une période de renouvellement archivée ou à la corbeille ne
 * prolonge plus rien — comme côté serveur (`Domiciliation::estRenouvelee`).
 */
export function periodesRenouvelees(domiciliations) {
  const renouvelees = new Set()
  domiciliations.forEach((d) => { if (d.renouvelleDeId) renouvelees.add(d.renouvelleDeId) })
  periodesParEntreprise(domiciliations).forEach((triees) => {
    triees.slice(0, -1).forEach((d) => renouvelees.add(d.id))
  })
  // Seules les périodes réellement présentes sont concernées (le lien peut désigner une période absente de la liste).
  const presentes = new Set(domiciliations.map((d) => d.id))
  return new Set([...renouvelees].filter((id) => presentes.has(id)))
}
