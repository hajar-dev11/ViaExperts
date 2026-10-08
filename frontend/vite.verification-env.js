// Garde-fou du build de production : l'URL de l'API doit être EXPLICITE, publique et en HTTPS.
//
// Sans elle, le frontend publié appellerait `http://localhost:8000` — c'est-à-dire le propre poste de chaque visiteur —
// et l'application serait cassée sans aucune erreur visible au build. Le build s'arrête donc avec un message clair.
// De même une URL en clair (http://), une adresse IP, un nom réservé aux tests / au réseau interne (.test, .local, .lan…)
// ou un nom sans point (« backend ») ne sont pas joignables, ou pas sûrs, depuis Internet.
// En développement (`npm run dev`), `src/api/http.js` garde un repli local EXPLICITE ; il n'existe pas en production,
// et ce garde ne s'applique qu'à `vite build` en mode production.
//
// Les messages n'affichent jamais d'identifiants : seul « protocole://hôte » est repris, jamais « utilisateur:motdepasse@ ».

const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

// Suffixes de noms réservés (tests, réseau local / interne) : jamais résolus sur Internet.
const SUFFIXES_RESERVES = ['.test', '.local', '.localhost', '.localdomain', '.internal', '.lan', '.home.arpa', '.example']

/** Octets d'une adresse IPv4 en notation pointée (le constructeur URL normalise déjà 2130706433, 0x7f.1…), sinon null. */
function octetsIPv4(hote) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hote)
  if (!m) return null
  const octets = m.slice(1).map(Number)
  return octets.every((o) => o <= 255) ? octets : null
}

/** IPv4 locale, privée ou réservée (non routable sur Internet). */
function ipv4NonPublique([a, b, c]) {
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 (CGNAT)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c <= 2) // 192.0.0.0/24 et 192.0.2.0/24
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
    || a >= 224 // multicast et réservé
}

/** IPv6 locale, privée ou réservée : ::, ::1, IPv4 mappée, fc00::/7, fe80::/10. */
function ipv6NonPublique(hote) {
  const premier = hote.split(':')[0]
  if (premier === '') return true // « :: », « ::1 », « ::ffff:… »
  const valeur = parseInt(premier, 16)
  return (valeur & 0xfe00) === 0xfc00 || (valeur & 0xffc0) === 0xfe80
}

/**
 * @param {string | undefined} valeur contenu de VITE_API_URL au moment du build de production
 * @throws {Error} si l'URL est absente, invalide, locale, privée, en clair (http), une adresse IP, un nom réservé / interne,
 *   un nom sans point, ou si c'est l'exemple du dépôt
 * @returns {string} l'URL validée
 */
export function verifierApiUrlProduction(valeur) {
  const url = typeof valeur === 'string' ? valeur.trim() : ''

  if (!url) {
    throw new Error(
      "Build de production arrêté : VITE_API_URL n'est pas défini.\n"
      + "Indiquez l'URL publique de l'API (ex. VITE_API_URL=https://api.votre-domaine.tld), dans l'environnement du build "
      + "ou dans frontend/.env.production, puis relancez `npm run build`.\n"
      + "(Sans cela le site publié appellerait http://localhost:8000, donc l'ordinateur du visiteur.)"
    )
  }

  let analyse
  try {
    analyse = new URL(url)
  } catch {
    // La valeur n'est pas reprise : elle peut contenir des identifiants.
    throw new Error("Build de production arrêté : VITE_API_URL n'est pas une URL valide. Exemple : https://api.votre-domaine.tld")
  }

  // Jamais d'identifiants dans le message : seulement « protocole://hôte[:port] ».
  const affichee = `${analyse.protocol}//${analyse.host}`
  // Un « . » final (« api.exemple.com. ») désigne le même hôte.
  const hote = analyse.hostname.toLowerCase().replace(/\.$/, '')
  const octets = octetsIPv4(hote)
  const ipv6 = hote.startsWith('[') ? hote.slice(1, -1) : null

  if (analyse.protocol !== 'https:' && analyse.protocol !== 'http:') {
    throw new Error(`Build de production arrêté : VITE_API_URL doit commencer par https:// (valeur : « ${affichee} »).`)
  }

  if (analyse.username || analyse.password) {
    throw new Error(
      'Build de production arrêté : VITE_API_URL contient des identifiants (utilisateur:motdepasse@). '
      + "Le code du site est public : retirez-les de l'URL."
    )
  }

  if (
    HOTES_LOCAUX.has(hote)
    || hote.endsWith('.localhost')
    || (octets && ipv4NonPublique(octets))
    || (ipv6 !== null && ipv6NonPublique(ipv6))
  ) {
    throw new Error(
      `Build de production arrêté : VITE_API_URL pointe vers une adresse locale ou privée (« ${affichee} »).\n`
      + "Un site publié ne peut pas appeler le localhost ni le réseau privé de son visiteur : indiquez l'URL publique de l'API (nom de domaine en HTTPS)."
    )
  }

  if (octets || ipv6 !== null) {
    throw new Error(
      `Build de production arrêté : VITE_API_URL est une adresse IP (« ${affichee} »).\n`
      + 'Une API de production doit être jointe par un nom de domaine en HTTPS (ex. https://api.votre-domaine.tld).'
    )
  }

  if (/votre-domaine/i.test(hote)) {
    throw new Error(
      `Build de production arrêté : VITE_API_URL contient encore l'exemple du dépôt (« ${affichee} »). Remplacez-le par l'URL réelle de l'API.`
    )
  }

  if (SUFFIXES_RESERVES.some((suffixe) => hote.endsWith(suffixe))) {
    throw new Error(
      `Build de production arrêté : VITE_API_URL utilise un nom réservé aux tests ou au réseau interne (« ${affichee} »).\n`
      + "Ces noms (.test, .local, .localhost, .localdomain, .internal, .lan, .home.arpa, .example) ne sont pas joignables depuis Internet : indiquez le nom de domaine public de l'API."
    )
  }

  if (!hote.includes('.')) {
    throw new Error(
      `Build de production arrêté : VITE_API_URL n'est pas un nom de domaine complet (« ${affichee} »).\n`
      + "Un nom sans point (« backend », « api ») n'existe que sur un réseau interne : indiquez l'URL publique de l'API (ex. https://api.votre-domaine.tld)."
    )
  }

  if (analyse.protocol !== 'https:') {
    throw new Error(
      `Build de production arrêté : VITE_API_URL doit utiliser HTTPS (« ${affichee} »).\n`
      + 'Une API en http:// transmettrait les mots de passe et les données en clair, et serait bloquée par les navigateurs depuis un site en HTTPS. '
      + `Utilisez https://${analyse.host}.`
    )
  }

  return url
}
