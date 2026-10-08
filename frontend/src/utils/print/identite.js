// Identité de l'émetteur (logo, signature, pied de page) pour l'impression — noyau PARTAGÉ par la Facturation,
// les Paiements et la Domiciliation. Extrait tel quel de documentPrint.js.

import { getIdentiteImpression } from '../../api/settings.js'
import { API_URL } from '../../api/http.js'

const fichierUrl = (path) => (path ? `${API_URL}/storage/${path}` : null)

/**
 * Identité (logo/signature/pied de page) de l'émetteur — Via Experts ou le
 * Bureau de Comptabilité ont chacun leurs propres réglages (Paramètres →
 * Bureau / Centre), déjà en place avant cette fonctionnalité.
 */
export async function chargerIdentite(emetteur) {
  const s = await getIdentiteImpression(emetteur)
  return {
    nomSociete: s.nom_societe || 'Via Experts',
    logo: fichierUrl(s.logo_path) || '/logo-via-experts.jpg',
    signature: fichierUrl(s.signature_path),
    logoPath: s.logo_path || null,
    signaturePath: s.signature_path || null,
    gerant: s.gerant || '',
    piedDePage: s.entreprise_info || '',
    afficherPiedSurRecu: !!s.afficher_entreprise_info_recu,
  }
}

// Octets d'une image en data URL. Les fichiers de /storage n'ont pas d'en-têtes CORS
// (illisibles depuis le frontend) : le logo/la signature des réglages passent par
// l'API ; le logo par défaut est un fichier du frontend (même origine). Si la lecture
// échoue, on garde l'URL d'origine : l'image sera simplement omise du PDF.
async function imageEnDataUrl(chemin, urlSecours) {
  const url = chemin ? `${API_URL}/api/v1/settings/fichier?path=${encodeURIComponent(chemin)}` : urlSecours
  if (!url) return null
  try {
    const reponse = await fetch(url, { credentials: 'include' })
    if (!reponse.ok) throw new Error(String(reponse.status))
    const blob = await reponse.blob()
    return await new Promise((resolve, reject) => {
      const lecteur = new FileReader()
      lecteur.onload = () => resolve(lecteur.result)
      lecteur.onerror = reject
      lecteur.readAsDataURL(blob)
    })
  } catch {
    return urlSecours ?? null
  }
}

// Rend transparent le fond blanc d'une image (conversion « couleur vers alpha » du blanc) :
// le logo et le cachet sont des JPG à fond blanc, qui apparaîtraient en rectangles blancs
// sur le dégradé gris de la page du Devis.
async function retirerFondBlanc(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = pixels.data
    for (let i = 0; i < d.length; i += 4) {
      const alpha = 255 - Math.min(d[i], d[i + 1], d[i + 2])
      if (alpha === 0) { d[i + 3] = 0; continue }
      for (let k = 0; k < 3; k += 1) d[i + k] = 255 - ((255 - d[i + k]) * 255) / alpha
      d[i + 3] = (alpha * d[i + 3]) / 255
    }
    ctx.putImageData(pixels, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

/** Identité de l'émetteur avec logo et signature intégrés (data URL) — pour générer le PDF. */
export async function chargerIdentitePdf(emetteur, fondTransparent = false) {
  const identite = await chargerIdentite(emetteur)
  const [logo, signature] = await Promise.all([
    imageEnDataUrl(identite.logoPath, identite.logo),
    imageEnDataUrl(identite.signaturePath, identite.signature),
  ])
  const finale = (url) => (fondTransparent ? retirerFondBlanc(url) : url)
  return { ...identite, logo: await finale(logo || identite.logo), signature: await finale(signature) }
}
