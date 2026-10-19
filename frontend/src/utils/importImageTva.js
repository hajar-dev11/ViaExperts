// « Importateur de Déclaration » : contrôle du DOCUMENT (photo ou PDF) d'une déclaration TVA avant son envoi et son analyse.
//
// Fonctions pures, testables sans navigateur. Le serveur refait tous ces contrôles sur le contenu réel du fichier (format,
// taille, dimensions, structure du PDF) : ceux d'ici servent à répondre tout de suite, avec un message clair, sans envoyer un
// fichier inutilisable.
//
// L'analyse du contenu (OCR) se fait dans le navigateur (voir utils/ocr/) : elle est TOUJOURS à vérifier par l'utilisateur.

/** Formats acceptés : photos / images et PDF (ni Excel, ni CSV, ni GIF, ni HEIC). */
export const TYPES_IMAGE_DECLARATION = ['image/jpeg', 'image/png', 'image/webp']
export const TYPE_PDF = 'application/pdf'
export const TYPES_DOCUMENT_DECLARATION = [...TYPES_IMAGE_DECLARATION, TYPE_PDF]
export const EXTENSIONS_DOCUMENT_DECLARATION = ['jpg', 'jpeg', 'png', 'webp', 'pdf']
export const ACCEPT_DOCUMENT_DECLARATION = [...TYPES_DOCUMENT_DECLARATION, ...EXTENSIONS_DOCUMENT_DECLARATION.map((e) => `.${e}`)].join(',')

/** Limite du serveur pour un PDF (les photos sont réduites avant l'envoi : voir utils/images.js). */
export const TAILLE_MAX_PDF = 2 * 1024 * 1024

/** Rappel affiché avec tout résultat d'analyse : l'OCR n'est jamais garanti exact. */
export const MESSAGE_VERIFICATION = "Ces données sont lues automatiquement (OCR) : elles peuvent être incomplètes ou inexactes. "
  + "Vérifiez-les avec le document et corrigez-les dans le formulaire avant toute validation ; rien n'est enregistré automatiquement."

const FORMATS_NOMMES = {
  xls: 'Excel', xlsx: 'Excel', xlsm: 'Excel', ods: 'tableur',
  csv: 'CSV', txt: 'texte', xml: 'XML', json: 'JSON',
  doc: 'Word', docx: 'Word',
  gif: 'GIF', bmp: 'BMP', tif: 'TIFF', tiff: 'TIFF', svg: 'SVG', heic: 'HEIC', heif: 'HEIF',
  zip: 'ZIP', rar: 'archive', exe: 'programme', php: 'script', js: 'script', html: 'page web',
}

const extensionDe = (nom) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(nom ?? '').trim())
  return m ? m[1].toLowerCase() : ''
}

export const estPdf = (fichier) => String(fichier?.type ?? '').toLowerCase() === TYPE_PDF
  || (!fichier?.type && extensionDe(fichier?.name) === 'pdf')

/**
 * Contrôle un fichier choisi. Renvoie '' s'il peut être envoyé, sinon un message clair en français.
 * Le type annoncé par le navigateur et l'extension sont examinés ; le contenu réel est vérifié par le serveur.
 */
export function erreurDocumentDeclaration(fichier) {
  if (!fichier) return 'Aucun fichier sélectionné.'
  if (!(fichier.size > 0)) return 'Ce fichier est vide. Choisissez la photo ou le PDF de la déclaration.'

  const type = String(fichier.type ?? '').toLowerCase()
  const extension = extensionDe(fichier.name)

  if (TYPES_DOCUMENT_DECLARATION.includes(type)) {
    if (type === TYPE_PDF && fichier.size > TAILLE_MAX_PDF) {
      return `Ce PDF est trop lourd (${(fichier.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo) : ${TAILLE_MAX_PDF / 1024 / 1024} Mo maximum.`
    }
    return ''
  }
  // Certains navigateurs ne renseignent pas le type : on se fie alors à l'extension (le serveur contrôle le contenu).
  if ((type === '' || type === 'application/octet-stream') && EXTENSIONS_DOCUMENT_DECLARATION.includes(extension)) {
    return extension === 'pdf' && fichier.size > TAILLE_MAX_PDF ? `Ce PDF est trop lourd : ${TAILLE_MAX_PDF / 1024 / 1024} Mo maximum.` : ''
  }

  const format = FORMATS_NOMMES[extension]
    ?? (type.startsWith('image/') ? type.slice(6).toUpperCase() : '')
  const nomme = format ? `Les fichiers ${format} ne sont pas pris en charge` : "Ce type de fichier n'est pas pris en charge"

  return `${nomme} : l'Importateur de Déclaration n'accepte que la photo ou le PDF de la déclaration, au format JPG, PNG, WebP ou PDF.`
}

/**
 * Renvoie le fichier avec un type renseigné d'après son extension quand le navigateur n'en a pas donné
 * (nécessaire à la préparation de l'image et à la lecture du PDF). Inchangé s'il a déjà un type accepté.
 */
export function normaliserTypeDocument(fichier) {
  const type = String(fichier?.type ?? '').toLowerCase()
  if (TYPES_DOCUMENT_DECLARATION.includes(type)) return fichier
  const parExtension = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: TYPE_PDF }[extensionDe(fichier?.name)]
  return parExtension ? new File([fichier], fichier.name, { type: parExtension, lastModified: fichier.lastModified }) : fichier
}

/** Message de l'erreur renvoyée par le serveur (première erreur de validation, sinon message général). */
export function messageErreurServeur(erreur, defaut = "Le fichier n'a pas pu être envoyé. Réessayez.") {
  const premiere = erreur?.errors && Object.values(erreur.errors)[0]?.[0]
  return premiere || erreur?.message || defaut
}

/** Caractéristiques du document telles que le serveur les a contrôlées (aucune donnée de déclaration n'y figure). */
export function resumerControleServeur(reponse) {
  return {
    nom: reponse?.nom ?? '',
    categorie: reponse?.categorie ?? '',
    type: reponse?.type ?? '',
    taille: reponse?.taille ?? null,
    largeur: reponse?.largeur ?? null,
    hauteur: reponse?.hauteur ?? null,
    pages: reponse?.pages ?? null,
    lignesCreees: Number(reponse?.lignes_creees ?? 0),
  }
}

/** Libellé de l'avancement de l'analyse pour l'écran. */
export function libelleEtape(etat) {
  if (!etat) return ''
  const pct = typeof etat.progression === 'number' ? ` ${Math.round(etat.progression * 100)} %` : ''
  switch (etat.etape) {
    case 'controle': return 'Contrôle du fichier par le serveur…'
    case 'lecture': return `Lecture du texte du PDF${etat.detail ? ` (${etat.detail})` : ''}…`
    case 'reconnaissance': return `Reconnaissance du texte (OCR)${etat.detail && /^page/.test(etat.detail) ? ` – ${etat.detail}` : ''}${pct}…`
    default: return 'Analyse en cours…'
  }
}

/** Libellé du moteur utilisé pour lire le document. */
export const LIBELLES_MOTEUR = {
  'pdf-texte': 'texte du PDF (lecture directe, sans OCR)',
  'pdf-ocr': 'PDF scanné (reconnaissance de caractères)',
  ocr: 'photo (reconnaissance de caractères, OCR)',
}
