import { ApiError } from '../api/http.js'

/** Premier message d'erreur lisible d'une réponse de l'API (validation, droits…), sinon le texte par défaut. */
export function messageErreurApi(err, defaut) {
  if (err instanceof ApiError) {
    const premier = err.errors && Object.values(err.errors)[0]?.[0]
    return premier || err.message || defaut
  }
  return defaut
}