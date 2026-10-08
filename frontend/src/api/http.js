// URL de l'API. En PRODUCTION, VITE_API_URL est obligatoire : le build s'arrête sinon (vite.verification-env.js), et le repli
// local ci-dessous n'existe pas dans le code publié (`import.meta.env.DEV` vaut false et la branche est supprimée au build).
// En développement (`npm run dev`), le repli local est explicite.
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message)
    this.status = status
    this.errors = errors ?? {}
  }
}

// Permet à `AuthContext` de réagir à une session expirée sans que ce module
// n'ait besoin de connaître React/le routeur. `AuthContext` décide seul s'il y
// a réellement lieu d'agir (ex. ignorer un 401 quand personne n'était
// authentifié) — ce module se contente de signaler chaque 401 reçu.
let unauthorizedHandler = null
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export async function ensureCsrfCookie() {
  await fetch(`${API_URL}/sanctum/csrf-cookie`, { credentials: 'include' })
}

// --- Cache court et déduplication des GET ------------------------------------
// Le throttle Laravel est à 60 req/min et par utilisateur (RouteServiceProvider).
// Trois sources de doublons le saturaient (mesuré : 22 requêtes pour UN seul
// chargement du Dashboard, donc 429 dès le 3e chargement) :
//   1. React StrictMode rejoue chaque useEffect en dev → chaque GET partait 2 fois ;
//   2. Topbar et Dashboard demandent simultanément les mêmes listes
//      (`/clients?status=actif` et `/entreprises?status=actif`) ;
//   3. une navigation aller-retour rapide refait immédiatement les mêmes GET.
// Deux GET identiques rapprochés partagent donc désormais UNE seule requête réseau.
// Toute écriture (POST/PUT/DELETE/upload) vide le cache : les données affichées
// restent exactement aussi fraîches qu'avant. Même principe que le cache déjà
// en place sur Archive/Corbeille.
const GET_CACHE_TTL = 10000
const getCache = new Map()

// GET qui ne doivent JAMAIS être mis en cache :
// - `/chat/{id}/messages` : ce GET a un EFFET DE BORD côté serveur — il marque les
//   messages reçus comme lus (ChatController::messages). Le mettre en cache
//   casserait le marquage automatique et le bouton « Actualiser » du Chat ;
// - `/numero-propose` : le numéro de document proposé doit toujours refléter
//   l'état réel du compteur de numérotation.
const NO_CACHE = [/\/chat\/[^/]+\/messages(\?|$)/, /\/numero-propose(\?|$)/]

function invalidateGetCache() {
  getCache.clear()
}

// Chaque appelant reçoit sa propre copie : deux composants qui partagent une
// réponse mise en cache ne doivent jamais se voir muter leurs données.
function cloneJson(value) {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

async function sendRequest(path, method, body, signal) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const xsrf = readCookie('XSRF-TOKEN')
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (response.status === 204) return null

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.()
    throw new ApiError(data?.message ?? 'Erreur serveur', response.status, data?.errors)
  }

  return data
}

export async function apiFetch(path, { method = 'GET', body, withCsrf = true, cache = true, signal } = {}) {
  if (method !== 'GET') {
    if (withCsrf) {
      await ensureCsrfCookie()
    }
    try {
      return await sendRequest(path, method, body, signal)
    } finally {
      // Une écriture rend le cache caduc — y compris login/logout, ce qui évite
      // qu'une session hérite des données lues par la précédente.
      invalidateGetCache()
    }
  }

  // Un GET annulable (`signal`) n'est jamais mutualisé : le cache partage une
  // même promesse entre appelants, et `abort()` d'un seul ferait échouer les
  // autres composants qui attendaient la même réponse.
  if (!cache || signal || NO_CACHE.some((re) => re.test(path))) {
    return sendRequest(path, method, body, signal)
  }

  const hit = getCache.get(path)
  if (hit && Date.now() - hit.at < GET_CACHE_TTL) {
    return cloneJson(await hit.promise)
  }

  const promise = sendRequest(path, method, body)
  getCache.set(path, { at: Date.now(), promise })

  try {
    return cloneJson(await promise)
  } catch (err) {
    // Une réponse en erreur (403, 429, réseau) ne doit jamais être mémorisée :
    // le prochain appel doit repartir vers le serveur.
    if (getCache.get(path)?.promise === promise) getCache.delete(path)
    throw err
  }
}

// `payload` : soit un File (envoyé sous le champ `file` — comportement historique,
// utilisé par les logos/signatures et la photo de profil), soit un FormData déjà
// construit, passé tel quel quand l'endpoint attend d'autres noms de champs.
export async function apiUpload(path, payload) {
  await ensureCsrfCookie()

  const headers = { Accept: 'application/json' }
  const xsrf = readCookie('XSRF-TOKEN')
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf

  let formData
  if (payload instanceof FormData) {
    formData = payload
  } else {
    formData = new FormData()
    formData.append('file', payload)
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      if (response.status === 401) unauthorizedHandler?.()
      throw new ApiError(data?.message ?? 'Erreur serveur', response.status, data?.errors)
    }

    return data
  } finally {
    // Un upload est une écriture : mêmes conséquences sur le cache.
    invalidateGetCache()
  }
}
