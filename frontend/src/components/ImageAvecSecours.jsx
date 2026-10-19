import { useState } from 'react'

/**
 * Image téléversée (photo de profil, logo…) avec contenu de secours.
 *
 * Si le fichier n'est pas servi (dossier public non alimenté, fichier supprimé, réseau coupé), le navigateur affiche
 * sinon une icône d'image cassée : ici on retombe sur `fallback` (icône ou initiales). On mémorise l'ADRESSE qui a
 * échoué : un nouvel envoi (autre adresse) est donc réessayé sans rien réinitialiser.
 */
export default function ImageAvecSecours({ src, alt = '', className, fallback = null }) {
  const [srcEnEchec, setSrcEnEchec] = useState(null)

  if (!src || srcEnEchec === src) return fallback
  return <img src={src} alt={alt} className={className} onError={() => setSrcEnEchec(src)} />
}
