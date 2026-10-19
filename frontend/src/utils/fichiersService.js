// Fichiers joints à un service en cours : mêmes règles que le serveur (App\Rules\FichierAutorise + `max:5120`).
// Le contrôle ici évite un envoi inutile ; il ne remplace pas celui du serveur, qui reste seul juge (contenu réel du fichier).

/** 5 Mo, comme `max:5120` côté Laravel. */
export const TAILLE_MAX_FICHIER_SERVICE = 5 * 1024 * 1024

/** Extensions de documents autorisées (liste blanche de `FichierAutorise::document()`). */
export const EXTENSIONS_FICHIER_SERVICE = [
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'doc', 'xls', 'ppt', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv', 'rtf',
]

/** Extensions exécutables refusées même au milieu du nom (« a.php.jpg »), comme `FichierAutorise::EXTENSIONS_INTERDITES`. */
export const EXTENSIONS_INTERDITES_SERVICE = [
  'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'pht', 'phtml', 'phtm', 'phar', 'phps',
  'cgi', 'pl', 'py', 'sh', 'bash', 'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'jar',
  'js', 'mjs', 'jsp', 'asp', 'aspx', 'htm', 'html', 'xhtml', 'svg', 'htaccess',
]

/** Valeur de l'attribut `accept` du sélecteur de fichier. */
export const ACCEPT_FICHIER_SERVICE = EXTENSIONS_FICHIER_SERVICE.map((e) => `.${e}`).join(',')

const formaterTaille = (octets) => `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`

/** Message d'erreur si le fichier ne peut pas être joint, sinon chaîne vide. */
export function erreurFichierService(fichier) {
  if (!fichier) return 'Choisissez un fichier.'

  const nom = String(fichier.name ?? '')
  // eslint-disable-next-line no-control-regex -- les caractères de contrôle sont précisément ce qu'on refuse dans un nom
  if (nom === '' || /[\u0000-\u001F\u007F/\\]/.test(nom)) return 'Le nom de ce fichier est invalide.'

  const segments = nom.toLowerCase().split('.')
  const extension = segments.length > 1 ? segments.pop() : ''
  if (segments.some((s) => EXTENSIONS_INTERDITES_SERVICE.includes(s.trim()))) {
    return 'Ce nom de fichier est refusé (extension exécutable).'
  }
  if (!EXTENSIONS_FICHIER_SERVICE.includes(extension)) {
    return `Ce type de fichier n'est pas autorisé. Formats acceptés : ${EXTENSIONS_FICHIER_SERVICE.join(', ')}.`
  }
  if (fichier.size > TAILLE_MAX_FICHIER_SERVICE) {
    return `Ce fichier est trop lourd (${formaterTaille(fichier.size)}) : ${formaterTaille(TAILLE_MAX_FICHIER_SERVICE)} maximum.`
  }
  return ''
}
