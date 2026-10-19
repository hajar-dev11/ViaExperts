// Civilité du représentant dans le contrat et l'attestation de domiciliation.
//
// Source fiable : le champ « Genre » (Mr / Mme) de la FICHE du client rattaché à l'entreprise — le même que celui déjà
// utilisé par la procuration. Aucune civilité n'est jamais déduite du prénom : si la fiche est introuvable ou si son
// genre n'est pas reconnu, la civilité reste VIDE et la page l'indique (elle se saisit alors dans « Modifier »).

import { getClient } from '../../../api/clients.js'

const normaliser = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, '')

/** « Mr » / « Mme » d'après le genre de la fiche client ; chaîne vide si l'information est absente ou inconnue. */
export function civiliteAbregee(genre) {
  const g = normaliser(genre)
  if (['mme', 'mlle', 'madame', 'mademoiselle', 'f', 'femme', 'feminin'].includes(g)) return 'Mme'
  if (['mr', 'm', 'monsieur', 'homme', 'masculin'].includes(g)) return 'Mr'
  return ''
}

/** Fiche du client rattaché à l'entreprise (lecture seule) : transmise à `parDefaut` sous le nom `client`. */
export async function chargerClientRepresentant(d, entreprise) {
  if (!entreprise?.clientId) return { client: null }
  return { client: await getClient(entreprise.clientId).catch(() => null) }
}
