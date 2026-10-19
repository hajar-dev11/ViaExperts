// Contrôle d'unicité d'une entreprise AVANT l'envoi (le serveur reste seul juge — mêmes règles, mêmes messages) :
// Dénomination, I.C.E et Identifiant Fiscal doivent être uniques. Le RC (unique par tribunal) et le TP ne sont pas contrôlés ici.

export const MESSAGES_DOUBLON = {
  denomination: 'Une entreprise avec cette dénomination existe déjà.',
  ice: 'Une entreprise avec cet I.C.E existe déjà.',
  if: 'Une entreprise avec cet Identifiant Fiscal existe déjà.',
}

/** Nom sans casse, accent ni espace superflu : « Société  X » = « societe x ». */
export const normaliserNom = (valeur) => String(valeur ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const normaliserCode = (valeur) => String(valeur ?? '').replace(/\s+/g, '').toLowerCase()

/**
 * @param {{denomination?: string, ice?: string, if?: string}} saisie  champs du formulaire
 * @param {Array<{id: number|string, denomination?: string, ice?: string, if?: string}>} existantes  entreprises déjà enregistrées
 * @param {{ idCourant?: number|string|null, denominationOrigine?: string }} [options]
 *        `idCourant` : entreprise en cours de modification (jamais un doublon d'elle-même) ;
 *        `denominationOrigine` : sa dénomination enregistrée — si elle n'a pas changé, elle n'est pas contrôlée (comme le serveur :
 *        une entreprise déjà en double reste modifiable).
 * @returns {Record<string, string[]>} erreurs par champ, au format des erreurs de l'API (`{ champ: [message] }`)
 */
export function trouverDoublons(saisie, existantes, { idCourant = null, denominationOrigine = null } = {}) {
  const autres = (existantes ?? []).filter((e) => idCourant === null || String(e.id) !== String(idCourant))
  const erreurs = {}

  const nom = normaliserNom(saisie?.denomination)
  const nomInchange = denominationOrigine !== null && normaliserNom(denominationOrigine) === nom
  if (nom !== '' && !nomInchange && autres.some((e) => normaliserNom(e.denomination) === nom)) {
    erreurs.denomination = [MESSAGES_DOUBLON.denomination]
  }

  for (const champ of ['ice', 'if']) {
    const code = normaliserCode(saisie?.[champ])
    if (code !== '' && autres.some((e) => normaliserCode(e[champ]) === code)) {
      erreurs[champ] = [MESSAGES_DOUBLON[champ]]
    }
  }

  return erreurs
}
