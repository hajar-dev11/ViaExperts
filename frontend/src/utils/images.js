// Préparation des images avant envoi (photo de profil, logos, signatures).
//
// Une photo de téléphone pèse 2 à 5 Mo ; le serveur n'accepte que 2 Mo (limite habituelle de PHP) et rejetait tout
// au-delà de 800 Ko. L'image est donc réduite dans le navigateur (dimensions et qualité) avant d'être envoyée, ce qui
// évite aussi des envois lents sur une connexion mobile. Rien n'est modifié si l'image est déjà légère.

import { ApiError } from '../api/http.js'

/** Limite du serveur (voir App\Support\ImageTeleversee::TAILLE_MAX_KO). */
export const TAILLE_MAX_SERVEUR = 2 * 1024 * 1024
/** Taille visée : très en dessous de la limite du serveur. */
export const TAILLE_CIBLE = 700 * 1024
/** Plus grand côté conservé (suffisant pour un logo, une signature ou une photo de profil). */
export const COTE_MAX = 1600
/** Au-delà, on refuse tout de suite plutôt que de saturer la mémoire du navigateur. */
export const TAILLE_MAX_SOURCE = 30 * 1024 * 1024

export const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ACCEPT_IMAGES = TYPES_ACCEPTES.join(',')

const erreur = (message) => new ApiError(message, 0)

export function formaterTaille(octets) {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
  return `${Math.max(1, Math.round(octets / 1024))} Ko`
}

/** Charge l'image (orientation EXIF respectée par le navigateur). */
export async function chargerImage(fichier) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(fichier)
    return { source: bitmap, largeur: bitmap.width, hauteur: bitmap.height, liberer: () => bitmap.close?.() }
  }
  const url = URL.createObjectURL(fichier)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    return { source: img, largeur: img.naturalWidth, hauteur: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export function encoderCanvas(canvas, type, qualite) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, qualite))
}

function nouveauNom(nom, type) {
  const base = String(nom || 'image').replace(/\.[^./\\]+$/, '') || 'image'
  return `${base}.${type === 'image/png' ? 'png' : 'jpg'}`
}

function enFichier(blob, nom) {
  return new File([blob], nouveauNom(nom, blob.type), { type: blob.type, lastModified: Date.now() })
}

/**
 * Renvoie le fichier à envoyer : l'original s'il est déjà léger, sinon une version réduite (PNG si l'image d'origine
 * peut être transparente et que cela tient dans la taille visée, JPEG sinon). Lève une `ApiError` au message en
 * français si l'image est inutilisable.
 *
 * `deps` permet de remplacer le chargement, le canvas et l'encodage (tests, environnements sans canvas).
 */
export async function preparerImage(fichier, deps = {}) {
  const {
    charger = chargerImage,
    creerCanvas = () => document.createElement('canvas'),
    encoder = encoderCanvas,
  } = deps

  if (!fichier) throw erreur('Aucune image sélectionnée.')
  if (!TYPES_ACCEPTES.includes(fichier.type)) {
    throw erreur('Format non pris en charge : utilisez une image JPG, PNG ou GIF.')
  }
  if (fichier.size > TAILLE_MAX_SOURCE) {
    throw erreur(`Cette image est trop lourde (${formaterTaille(fichier.size)}). Choisissez une image de moins de ${formaterTaille(TAILLE_MAX_SOURCE)}.`)
  }
  // Déjà légère (et dans un format que le serveur accepte tel quel) : on garde les octets d'origine.
  if (fichier.size <= TAILLE_CIBLE && fichier.type !== 'image/webp') return fichier

  let image
  try {
    image = await charger(fichier)
  } catch {
    throw erreur('Cette image est illisible ou corrompue. Essayez une autre image.')
  }

  try {
    const { source, largeur, hauteur } = image
    if (!largeur || !hauteur) throw erreur('Cette image est illisible ou corrompue. Essayez une autre image.')

    const garderTransparence = fichier.type === 'image/png' || fichier.type === 'image/webp'
    let echelle = Math.min(1, COTE_MAX / Math.max(largeur, hauteur))
    let toursPng = 0

    for (let tour = 0; tour < 10; tour += 1) {
      const canvas = creerCanvas()
      canvas.width = Math.max(1, Math.round(largeur * echelle))
      canvas.height = Math.max(1, Math.round(hauteur * echelle))
      const contexte = canvas.getContext('2d')
      if (!contexte) throw erreur("Impossible de préparer l'image dans ce navigateur. Choisissez une image plus légère.")

      if (garderTransparence && toursPng < 4) {
        contexte.drawImage(source, 0, 0, canvas.width, canvas.height)
        const png = await encoder(canvas, 'image/png')
        toursPng += 1
        if (png && png.size <= TAILLE_CIBLE) return enFichier(png, fichier.name)
        echelle *= 0.75
        continue
      }

      // JPEG : fond blanc (le JPEG n'a pas de transparence), puis qualité décroissante.
      contexte.fillStyle = '#ffffff'
      contexte.fillRect(0, 0, canvas.width, canvas.height)
      contexte.drawImage(source, 0, 0, canvas.width, canvas.height)
      for (const qualite of [0.85, 0.7, 0.55]) {
        const jpeg = await encoder(canvas, 'image/jpeg', qualite)
        if (jpeg && jpeg.size <= TAILLE_CIBLE) return enFichier(jpeg, fichier.name)
      }
      echelle *= 0.75
    }

    throw erreur(`Impossible de réduire cette image sous ${formaterTaille(TAILLE_MAX_SERVEUR)}. Choisissez une image plus légère.`)
  } finally {
    image.liberer?.()
  }
}
