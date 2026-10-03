// Génération d'un VRAI fichier PDF (A4 ou A5) à partir du HTML d'un document commercial,
// puis ouverture dans le lecteur PDF natif du navigateur (sans boîte d'impression).
//
// Le document HTML (identique à celui de l'impression) est rendu dans une iframe
// hors écran, capturé par modern-screenshot (le navigateur rend lui-même le DOM : fidélité exacte), puis placé pleine page dans un PDF jsPDF.
// Les deux bibliothèques sont chargées à la demande (import dynamique) : elles ne
// pèsent pas sur le chargement initial de l'application.

import { htmlDocumentComplet, quandImagesChargees } from './exporters.js'

// Formats de page (pixels à 96 dpi, millimètres pour le PDF). L'A5 est utilisé en paysage :
// 210 × 148 mm, soit exactement la moitié d'une feuille A4.
export const PAGES = {
  a4: { format: 'a4', orientation: 'portrait', largeurPx: 794, hauteurPx: 1123, largeurMm: 210, hauteurMm: 297 },
  a5: { format: 'a5', orientation: 'landscape', largeurPx: 794, hauteurPx: 559, largeurMm: 210, hauteurMm: 148 },
}
const ECHELLE = 2 // ~190 dpi : net à l'écran comme à l'impression

// Neutralise le décor « à l'écran » de la feuille (fond gris, ombre, marges) : on
// capture la feuille A4 seule, à l'identique du rendu imprimé.
const CSS_CAPTURE = `
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  .doc-page { margin: 0 !important; box-shadow: none !important; }
`

// Chrome ne résout pas `img.decode()` tant que la page est en arrière-plan — or l'onglet de
// l'application passe en arrière-plan dès que le PDF s'ouvre dans le nouvel onglet. La
// bibliothèque de capture attendait ce `decode()` pour chaque image (logo, cachet) : la
// génération restait bloquée jusqu'au délai maximal, puis les images pouvaient être
// perdues. Une image déjà chargée est prête à être dessinée : on répond tout de suite.
function ignorerDecodeImagesChargees(...fenetres) {
  const restaurations = fenetres.map((fenetre) => {
    const proto = fenetre.HTMLImageElement.prototype
    const original = proto.decode
    proto.decode = function decode() {
      return this.complete ? Promise.resolve() : original.call(this)
    }
    return () => { proto.decode = original }
  })
  return () => restaurations.forEach((restaurer) => restaurer())
}

/** Rend `bodyHtml` + `css` en PDF (une page par hauteur de page) et renvoie un Blob `application/pdf`. */
export async function genererPdf(titre, bodyHtml, css, page = PAGES.a4) {
  const [{ domToCanvas }, { jsPDF }] = await Promise.all([import('modern-screenshot'), import('jspdf')])

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${page.largeurPx}px;height:${page.hauteurPx}px;border:0;`
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(htmlDocumentComplet(titre, bodyHtml, css + CSS_CAPTURE))
    doc.close()

    await new Promise((resolve) => quandImagesChargees(doc, resolve))
    if (doc.fonts?.ready) await doc.fonts.ready

    const feuille = doc.querySelector('.doc-page') || doc.body
    const restaurerDecode = ignorerDecodeImagesChargees(window, iframe.contentWindow)
    let canvas
    try {
      canvas = await domToCanvas(feuille, { scale: ECHELLE, backgroundColor: '#ffffff' })
    } finally {
      restaurerDecode()
    }

    const pdf = new jsPDF({ unit: 'mm', format: page.format, orientation: page.orientation, compress: true })
    pdf.setProperties({ title: titre })

    const { largeurMm, hauteurMm: hauteurPageMm } = page
    const pxParPage = Math.floor((canvas.width * hauteurPageMm) / largeurMm)
    // Tolérance de 4 px : un arrondi de 1 px ne doit pas créer une page blanche de plus.
    for (let y = 0, numero = 0; y < canvas.height - 4; y += pxParPage, numero += 1) {
      const hauteur = Math.min(pxParPage, canvas.height - y)
      const tranche = document.createElement('canvas')
      tranche.width = canvas.width
      tranche.height = hauteur
      const ctx = tranche.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tranche.width, tranche.height)
      ctx.drawImage(canvas, 0, y, canvas.width, hauteur, 0, 0, canvas.width, hauteur)
      if (numero > 0) pdf.addPage()
      pdf.addImage(tranche.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, largeurMm, (hauteur * largeurMm) / canvas.width, undefined, 'FAST')
    }

    return pdf.output('blob')
  } finally {
    iframe.remove()
  }
}

/**
 * Ouvre le PDF dans l'onglet `fenetre` (ouvert par le clic, avant tout `await`) : le
 * navigateur y affiche son lecteur PDF avec ses boutons Télécharger / Imprimer — aucune
 * impression n'est déclenchée. Sans onglet disponible (bloqué par le navigateur), le PDF
 * est téléchargé à la place.
 */
export function ouvrirPdf(fenetre, blob, titre) {
  const url = URL.createObjectURL(blob)
  if (fenetre && !fenetre.closed) {
    fenetre.location.replace(url)
  } else {
    const lien = document.createElement('a')
    lien.href = url
    lien.download = `${titre}.pdf`
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
  }
  // Le lecteur garde le blob tant que l'onglet est ouvert (rechargement, zoom…) : libéré plus tard.
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
}
