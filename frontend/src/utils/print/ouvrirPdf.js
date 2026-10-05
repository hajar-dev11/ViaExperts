// Ouverture d'un vrai PDF dans le lecteur du navigateur — noyau PARTAGÉ. Extrait tel quel de documentPrint.js.

import { genererPdf, ouvrirPdf } from '../pdfDocument.js'

/**
 * Ouvre un document en vrai PDF dans le lecteur du navigateur. À appeler directement depuis
 * un clic : l'onglet est ouvert AVANT tout `await` (sinon le navigateur le bloque comme un
 * popup). `preparer` charge les données et renvoie `{ titre, bodyHtml, css, page? }`.
 * Aucune impression automatique.
 */
export async function ouvrirPdfApresClic(preparer) {
  const fenetre = window.open('', '_blank')
  if (fenetre) {
    fenetre.document.write('<!doctype html><meta charset="utf-8"><title>Génération du PDF…</title>'
      + '<p style="font:15px system-ui,sans-serif;color:#475569;margin:32px">Génération du PDF…</p>')
    fenetre.document.close()
  }
  try {
    const { titre, bodyHtml, css, page } = await preparer()
    const pdf = await genererPdf(titre, bodyHtml, css, page)
    ouvrirPdf(fenetre, pdf, titre)
  } catch (erreur) {
    fenetre?.close()
    throw erreur
  }
}
