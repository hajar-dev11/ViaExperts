// Politique des mots de passe — miroir de `App\Rules\MotDePasseFort` côté serveur (le serveur reste la référence ;
// ici on évite seulement un aller-retour inutile). Ne s'applique qu'à la DÉFINITION d'un mot de passe, jamais à la connexion.

export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 12

export const AIDE_MOT_DE_PASSE = `${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères minimum, avec au moins une lettre et un chiffre.`

/** Renvoie le message d'erreur du mot de passe proposé, ou '' s'il respecte la politique. */
export function erreurMotDePasse(mot) {
  const valeur = String(mot ?? '')
  if (valeur.length < LONGUEUR_MINIMALE_MOT_DE_PASSE) {
    return `Le mot de passe doit comporter au moins ${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères.`
  }
  if (!/\p{L}/u.test(valeur) || !/\p{N}/u.test(valeur)) {
    return 'Le mot de passe doit contenir au moins une lettre et au moins un chiffre.'
  }
  if (new Set(valeur).size < 4) {
    return 'Ce mot de passe est trop prévisible : utilisez des caractères plus variés.'
  }
  return ''
}