// « Identifiant de Paiement » d'une Déclaration TVA / d'un Chiffre d'Affaire : liste fermée, comme sur la référence.
// La valeur enregistrée est le libellé complet (« 1-ESPECES ») dans la colonne existante `identifiant_paiement` : aucune migration.
// Le contrôle « espèces > 5 000 Dh » reconnaît « ESPECE » dans cette valeur (voir controlesFactures.js).

export const IDENTIFIANTS_PAIEMENT = [
  '1-ESPECES', '2-CHEQUE', '3-PRELEVEMENT', '4-VIREMENT', '5-EFFET', '6-COMPENSATION', '7-AUTRES',
]

export const IDENTIFIANT_PAIEMENT_PAR_DEFAUT = IDENTIFIANTS_PAIEMENT[0]

/**
 * Options du sélecteur : la liste, plus la valeur déjà enregistrée si elle n'en fait pas partie (déclaration saisie avant ce
 * sélecteur, ou valeur libre) — elle reste visible et sélectionnée au lieu d'être perdue en silence.
 */
export function optionsIdentifiantPaiement(valeurActuelle) {
  const valeur = String(valeurActuelle ?? '').trim()
  return valeur && !IDENTIFIANTS_PAIEMENT.includes(valeur) ? [valeur, ...IDENTIFIANTS_PAIEMENT] : IDENTIFIANTS_PAIEMENT
}
