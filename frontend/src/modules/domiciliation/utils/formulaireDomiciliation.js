import { aujourdhui } from '../../../shared/utils/date.js'
import { enNombre, prixConserveOuArrondi } from '../../../utils/arrondi.js'
import { modePourEnvoi } from '../../../utils/modePaiement.js'
import { calculerDateFin, calculerPrixTotal } from './domiciliation.js'

/**
 * Formulaire « Nouvelle Domiciliation » vierge.
 *
 * Fonction (et non constante de module) : les dates par défaut sont celles du JOUR où le formulaire est (ré)initialisé,
 * pas celles du chargement de l'application, et chaque appel renvoie un objet neuf (aucun état partagé entre deux saisies).
 * Le prix par mois saisi est conservé d'une saisie à l'autre (comportement existant du module).
 */

/** Prix de domiciliation par défaut (Dh HT par mois) : 104,17. Une valeur déjà saisie par l'utilisateur n'est jamais écrasée. */
export const PRIX_PAR_MOIS_DEFAUT = '104.17'

export function formulaireVide(prixParMois = PRIX_PAR_MOIS_DEFAUT) {
  const depart = aujourdhui()
  const jour = aujourdhui()

  return {
    entreprise_id: '', centre_domiciliation_id: '',
    // « Mois payés » démarre à 0 : la durée (donc la date de fin) et le total se calculent dès que l'utilisateur les renseigne.
    mois_payee: 0, mois_gratuits: 0,
    date_depart: depart, date_fin: calculerDateFin(depart, 0),
    // Prix total HT proposé : mois payés × prix par mois, arrondi à l'entier. Il reste modifiable à la main (prix_total_manuel).
    mode_paiement: '', prix_par_mois: prixParMois, prix_total: calculerPrixTotal(prixParMois, 0) ?? '0', prix_total_manuel: false,
    signature_sur_facture: true,
    date_facture: jour, date_paiement: jour, date_legalisation: '',
    doc_facture: false, doc_contrat: false, doc_attestation: false, doc_procuration: false,
  }
}

/**
 * Ce que l'on sait d'une entreprise choisie : son centre de domiciliation — celui de sa dernière période, sinon celui de sa
 * fiche Entreprise. `centreId` vaut '' quand aucun centre n'est connu : le formulaire demande alors de le choisir (il n'est
 * jamais deviné). Les anciennes dates et l'ancien prix ne sont plus affichés dans « Nouvelle Domiciliation ».
 *
 * @param {Array} periodes     périodes actives (`listDomiciliations`)
 * @param {Array} entreprises  entreprises (`listEntreprises`)
 */
export function deriverEntreprise(periodes, entreprises, entrepriseId) {
  if (!entrepriseId) return { centreId: '' }

  const derniere = periodes
    .filter((r) => String(r.entrepriseId) === String(entrepriseId))
    .sort((a, b) => String(b.dateDepart ?? '').localeCompare(String(a.dateDepart ?? '')))[0]
  const entreprise = entreprises.find((e) => String(e.id) === String(entrepriseId))

  return {
    centreId: derniere?.centreId ?? entreprise?.centreDomiciliationId ?? '',
  }
}

/**
 * Données envoyées à l'API. Les dates partent telles que saisies (« AAAA-MM-JJ », jamais converties en UTC : aucun décalage
 * d'un jour) et les cases « Documents du dossier » partent en booléens, enregistrés sur CETTE domiciliation.
 *
 * @param {object} formulaire  état du formulaire
 * @param {string|number} centreId  centre retenu (choisi, ou déduit de l'entreprise)
 */
export function construirePayload(formulaire, centreId) {
  const f = formulaire
  return {
    entreprise_id: Number(f.entreprise_id),
    centre_domiciliation_id: Number(centreId),
    mois_payee: Number(f.mois_payee) || 0,
    mois_gratuits: Number(f.mois_gratuits) || 0,
    date_depart: f.date_depart,
    date_fin: f.date_fin || null,
    mode_paiement: modePourEnvoi(f.mode_paiement) || null,
    // Prix par mois EXACT (au centime) ; le total, calculé (arrondi à l'entier) ou saisi à la main, est envoyé tel quel : le serveur le conserve.
    prix_par_mois: f.prix_par_mois === '' ? 0 : Math.round(enNombre(f.prix_par_mois) * 100) / 100,
    prix_total: f.prix_total === '' ? null : prixConserveOuArrondi(f.prix_total, f._origine?.prix_total),
    signature_sur_facture: !!f.signature_sur_facture,
    date_facture: f.date_facture || null,
    date_paiement: f.date_paiement || null,
    date_legalisation: f.date_legalisation || null,
    doc_facture: !!f.doc_facture,
    doc_contrat: !!f.doc_contrat,
    doc_attestation: !!f.doc_attestation,
    doc_procuration: !!f.doc_procuration,
  }
}

/**
 * Exécute `tache` une seule fois à la fois : tant qu'une exécution est en cours, tout nouvel appel est ignoré
 * (double clic, Entrée répétée, deux soumissions avant que le bouton n'ait été désactivé). `verrou` est un `useRef(false)`.
 * Le verrou est toujours relâché à la fin (succès ou échec) : une nouvelle tentative reste possible après une erreur.
 *
 * @returns {Promise<{ ignoree: boolean, valeur?: any }>}
 */
export async function executerUneFois(verrou, tache) {
  if (verrou.current) return { ignoree: true }
  verrou.current = true
  try {
    return { ignoree: false, valeur: await tache() }
  } finally {
    verrou.current = false
  }
}

/**
 * Soumission du formulaire de domiciliation, sans rien afficher : renvoie ce que l'écran doit faire.
 *
 *   - 'ignoree' : un envoi est déjà en cours, rien n'a été envoyé ; le formulaire est inchangé.
 *   - 'succes'  : le serveur a répondu positivement. En CRÉATION le formulaire repart à neuf (`formulaireVide`, prix par mois
 *                 conservé) ; en modification il reste tel quel.
 *   - 'echec'   : le serveur a refusé (ou le réseau a échoué) : le formulaire est renvoyé INCHANGÉ, avec l'erreur, pour que
 *                 l'utilisateur corrige sans tout ressaisir. Rien n'est jamais présenté comme réussi avant la réponse du serveur.
 *
 * @param {{ current: boolean }} verrou  `useRef(false)` du composant
 * @param {() => Promise<any>} envoyer   appel API (rejette en cas d'échec)
 * @param {object} formulaire            état courant du formulaire
 * @param {boolean} creation             true pour « Nouvelle Domiciliation », false pour une modification
 */
export async function soumettreFormulaire({ verrou, envoyer, formulaire, creation }) {
  const execution = await executerUneFois(verrou, async () => {
    try {
      await envoyer()
      return { ok: true }
    } catch (erreur) {
      return { ok: false, erreur }
    }
  })

  if (execution.ignoree) return { statut: 'ignoree', formulaire }
  if (!execution.valeur.ok) return { statut: 'echec', formulaire, erreur: execution.valeur.erreur }

  return { statut: 'succes', formulaire: creation ? formulaireVide(formulaire.prix_par_mois) : formulaire }
}

/**
 * Durée du contrat = mois payés + mois gratuits. Sans aucun mois, la date de fin ne peut pas être calculée :
 * enregistrer enverrait une période sans fin (qui bloquerait toutes les périodes suivantes de l'entreprise).
 * Renvoie un message d'erreur, ou '' si la durée est valide.
 */
export function erreurDuree(moisPayes, moisGratuits, dateFin) {
  const duree = (Number(moisPayes) || 0) + (Number(moisGratuits) || 0)
  if (duree <= 0 || !dateFin) {
    return 'Indiquez au moins un mois (payé ou gratuit) : la date de fin est calculée à partir de la durée.'
  }
  return ''
}
