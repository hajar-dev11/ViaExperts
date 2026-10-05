// Reçus de paiement (HTML imprimable et PDF A4 / A5) — module Paiements.
// Extrait TEL QUEL de `utils/documentPrint.js` (migration Modular Monolith — Facturation, étape 15) : le HTML produit est
// strictement identique (voir les instantanés de `__tests__/documents.snapshot.test.js`). Aucune dépendance vers
// Facturation ni Domiciliation : seulement les utilitaires d'impression partagés.

import { printHtml, escapeHtml } from '../../../utils/exporters.js'
import { PAGES } from '../../../utils/pdfDocument.js'
import { montantEnLettres } from '../../../utils/montantEnLettres.js'
import { dh, formatDateFr } from '../../../utils/print/commun.js'
import { chargerIdentite, chargerIdentitePdf } from '../../../utils/print/identite.js'
import { ouvrirPdfApresClic } from '../../../utils/print/ouvrirPdf.js'

/** Construit le HTML imprimable du reçu (pur, sans effet de bord) — sert à `imprimerRecuPaiement` et à la prévisualisation. */
export function construireHtmlRecuPaiement(p, identite) {
  const identifiant = p.entrepriseIce ? `ICE : ${escapeHtml(p.entrepriseIce)}` : p.clientCin ? `CINE : ${escapeHtml(p.clientCin)}` : ''

  const exemplaire = () => `
    <div class="recu">
      <div class="recu-entete">
        <img class="recu-logo" src="${identite.logo}" alt="${escapeHtml(identite.nomSociete)}" />
        <div class="recu-titre">
          <h1>REÇU DE PAIEMENT</h1>
          <div>Référence d'Opération : ${escapeHtml(p.reference || `#${p.id}`)}</div>
          <div>Date d'Opération : ${escapeHtml(p.dateOperation || '')}</div>
        </div>
      </div>
      <div class="recu-corps">
        <div class="recu-gauche">
          <div class="recu-label">Payé par :</div>
          <div>Société : <strong>${escapeHtml(p.client || '')}</strong></div>
          ${identifiant ? `<div>${identifiant}</div>` : ''}
          ${p.clientTelephone ? `<div>Téléphone : ${escapeHtml(p.clientTelephone)}</div>` : ''}
        </div>
        <table class="recu-droite">
          <tr><th>Total Montant (HT) :</th><td>${dh(p.total)}</td></tr>
          <tr><th>Montant Payé :</th><td>${dh(p.prixPaye)}</td></tr>
          <tr><th>Prix Restant :</th><td>${dh(p.prixRestant)}</td></tr>
          <tr><th>Mode de paiement :</th><td>${escapeHtml((p.modePaiement || '—').toUpperCase())}</td></tr>
        </table>
      </div>
      <table class="recu-bas">
        <tr><th>Somme en toutes lettres :</th><td>${escapeHtml(montantEnLettres(p.total))}</td></tr>
        <tr><th>Motif de l'opération :</th><td>${escapeHtml((p.observation || '').toUpperCase())}</td></tr>
      </table>
      <div class="recu-signatures">
        <span>Signature</span>
        <span>Signature du Client</span>
      </div>
      ${identite.afficherPiedSurRecu && identite.piedDePage ? `<div class="recu-pied">${escapeHtml(identite.piedDePage)}</div>` : ''}
    </div>
  `

  const css = `
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a2e; margin: 0; font-size: 12px; }
    .recu { padding: 16px 0; }
    .recu-separateur { border-top: 2px dashed #94a3b8; margin: 10px 0; }
    .recu-entete { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1b2f52; padding-bottom: 10px; margin-bottom: 12px; }
    .recu-logo { height: 56px; object-fit: contain; }
    .recu-titre { text-align: right; }
    .recu-titre h1 { font-size: 20px; margin: 0 0 4px; }
    .recu-corps { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
    .recu-gauche { font-size: 12px; line-height: 1.6; }
    .recu-label { font-weight: 700; margin-bottom: 4px; }
    table.recu-droite { border-collapse: collapse; height: fit-content; }
    table.recu-droite th, table.recu-droite td { border: 1px solid #1b2f52; padding: 6px 10px; font-size: 11.5px; }
    table.recu-droite th { text-align: left; font-weight: 600; }
    table.recu-droite td { text-align: right; font-weight: 700; }
    table.recu-bas { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.recu-bas th, table.recu-bas td { border: 1px solid #1b2f52; padding: 7px 10px; font-size: 11.5px; text-align: left; }
    table.recu-bas th { width: 220px; font-weight: 600; }
    table.recu-bas td { font-weight: 700; }
    .recu-signatures { display: flex; justify-content: space-between; padding: 0 20px; font-size: 11px; color: #334155; }
    .recu-pied { text-align: center; font-size: 9px; color: #64748b; margin-top: 10px; }
  `

  return {
    titre: `Reçu de Paiement ${p.reference || ''}`,
    bodyHtml: `${exemplaire()}<div class="recu-separateur"></div>${exemplaire()}`,
    css,
  }
}

/** Imprime un Reçu de Paiement — deux exemplaires (société / client) sur une même page, séparés par un trait pointillé, comme le modèle de référence. */
export async function imprimerRecuPaiement(p) {
  const identite = await chargerIdentite(p.emetteur)
  const { titre, bodyHtml, css } = construireHtmlRecuPaiement(p, identite)
  printHtml(titre, bodyHtml, css)
}

// ---------------------------------------------------------------------------
// Reçu de paiement en PDF — « Reçu A4 » (deux exemplaires sur une page A4 portrait,
// séparés par un trait pointillé) ou « Reçu A5 » (un exemplaire sur une page A5
// paysage, 210 × 148 mm). Un exemplaire fait 794 × 561 px dans les deux cas : le A5
// n'est donc pas un agrandissement/réduction du A4, c'est le même exemplaire dessiné
// à la dimension exacte de sa feuille. Dimensions relevées sur le modèle de référence.
// ---------------------------------------------------------------------------

const FORMATS_RECU = {
  a4: { page: PAGES.a4, exemplaires: 2, hauteurExemplaire: 561, nom: 'A4' },
  a5: { page: PAGES.a5, exemplaires: 1, hauteurExemplaire: 559, nom: 'A5' },
}

const dhMajuscule = (v) => dh(v).replace(/ Dh$/, ' DH')

const CSS_RECU = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .recu-page { position: relative; width: 794px; overflow: hidden; background: #fff; color: #000; font-family: Verdana, 'DejaVu Sans', Geneva, sans-serif; font-size: 13px; }
  .recu-page.recu-a4 { height: 1123px; }
  .recu-page.recu-a5 { height: 559px; }
  .recu-ex { position: relative; width: 794px; }
  .recu-sep { position: absolute; left: 0; right: 0; top: 560px; border-top: 1px dashed #a9aca8; }

  /* Logo : cadre à l'emplacement du modèle. Les fichiers logo ont des marges blanches
     symétriques (le dessin n'occupe que ~55 % de l'image) : zoom au centre. */
  .recu-logo-cadre { position: absolute; left: 55px; top: 43px; width: 159px; height: 90px; overflow: hidden; }
  .recu-logo { display: block; width: 159px; height: 90px; object-fit: contain; transform: scale(1.75); transform-origin: center; }

  .recu-titre { position: absolute; right: 50px; top: 32px; width: 307px; }
  .recu-titre h1 { margin: 0; font: 700 24px/1 'Times New Roman', Times, serif; text-align: right; }
  .recu-titre .ligne { font-size: 13px; line-height: 25px; text-align: left; white-space: nowrap; }
  .recu-titre .ligne:first-of-type { margin-top: 3px; }

  .recu-trait { position: absolute; left: 55px; right: 54px; top: 148px; border-top: 1.5px solid #969696; }

  .recu-paye { position: absolute; left: 55px; top: 160px; width: 300px; font-size: 13px; line-height: 22.5px; }
  .recu-paye .titre { margin-bottom: 11px; font: 700 17px/22px 'Times New Roman', Times, serif; }

  .recu-page table { border-collapse: collapse; table-layout: fixed; }
  .recu-page th, .recu-page td { padding: 0 10px; background: transparent; border: 1px solid #4d4d4d; text-align: left; vertical-align: middle; }
  .recu-page th { font-weight: 400; font-size: 13px; }
  .recu-page td { font: 700 12px 'Times New Roman', Times, serif; }
  .recu-montants { position: absolute; left: 368px; top: 173px; width: 372px; }
  .recu-montants th { width: 185px; height: 33px; }
  .recu-montants td { padding-left: 12px; }

  .recu-bas { position: absolute; left: 55px; top: 335px; width: 685px; }
  .recu-bas table { width: 100%; }
  .recu-bas th { width: 228px; height: 39.5px; }
  .recu-bas td { overflow-wrap: anywhere; }
  .recu-sigs { position: relative; height: 12px; margin-top: 12px; font-size: 11px; line-height: 12px; }
  .recu-sigs span { position: absolute; top: 0; white-space: nowrap; }
  .recu-sigs span:nth-of-type(1) { left: 64px; }
  .recu-sigs span:nth-of-type(2) { left: 503px; }
  /* Cachet (option « Ajouter Signature ») : centré sous le libellé « Signature ». */
  .recu-cachet { position: absolute; left: 64px; top: 18px; width: 52px; display: flex; justify-content: center; }
  .recu-cachet img { display: block; max-width: 110px; max-height: 72px; width: auto; height: auto; object-fit: contain; }

  .recu-pied { position: absolute; left: 55px; right: 54px; bottom: 12px; text-align: center; font-size: 8.5px; line-height: 11px; color: #444; }
`

// Cachet : affiché seulement si l'option « Ajouter Signature » est cochée sur le paiement,
// lu dans les réglages de l'émetteur (jamais une image écrite dans le code).
/** HTML du reçu PDF au format demandé (`'a4'` ou `'a5'`) — pur, sans effet de bord. */
export function construireHtmlRecuPdf(p, identite, formatRecu = 'a4') {
  const { page, exemplaires, hauteurExemplaire } = FORMATS_RECU[formatRecu] || FORMATS_RECU.a4
  const identifiant = p.entrepriseIce ? `ICE : ${escapeHtml(p.entrepriseIce)}` : p.clientCin ? `CINE : ${escapeHtml(p.clientCin)}` : ''

  const exemplaire = () => `
    <div class="recu-ex" style="height:${hauteurExemplaire}px">
      <div class="recu-logo-cadre"><img class="recu-logo" src="${identite.logo}" alt="${escapeHtml(identite.nomSociete)}" /></div>
      <div class="recu-titre">
        <h1>REÇU DE PAIEMENT</h1>
        <div class="ligne">Référence d'Opération : ${escapeHtml(p.reference || `#${p.id}`)}</div>
        <div class="ligne">Date d'Opération : ${escapeHtml(formatDateFr(p.dateOperation))}</div>
      </div>
      <div class="recu-trait"></div>
      <div class="recu-paye">
        <div class="titre">Payé par :</div>
        <div>Société : ${escapeHtml(p.client || '')}</div>
        ${identifiant ? `<div>${identifiant}</div>` : ''}
        ${p.clientTelephone ? `<div>Téléphone : ${escapeHtml(p.clientTelephone)}</div>` : ''}
      </div>
      <table class="recu-montants">
        <tr><th>Total Montant (HT) :</th><td>${dhMajuscule(p.total)}</td></tr>
        <tr><th>Montant Payé :</th><td>${dhMajuscule(p.prixPaye)}</td></tr>
        <tr><th>Prix Restant :</th><td>${dhMajuscule(p.prixRestant)}</td></tr>
        <tr><th>Mode de paiement :</th><td>${escapeHtml((p.modePaiement || '—').toUpperCase())}</td></tr>
      </table>
      <div class="recu-bas">
        <table>
          <tr><th>Somme en toutes lettres :</th><td>${escapeHtml(montantEnLettres(p.total))}</td></tr>
          <tr><th>Motif de l'opération :</th><td>${escapeHtml((p.observation || '').toUpperCase())}</td></tr>
        </table>
        <div class="recu-sigs"><span>Signature</span><span>Signature du Client</span>${p.signature && identite.signature ? `<div class="recu-cachet"><img src="${identite.signature}" alt="Signature" /></div>` : ''}</div>
      </div>
      ${identite.afficherPiedSurRecu && identite.piedDePage ? `<div class="recu-pied">${escapeHtml(identite.piedDePage)}</div>` : ''}
    </div>`

  const corps = Array.from({ length: exemplaires }, exemplaire).join('')
  const separateur = exemplaires > 1 ? '<div class="recu-sep"></div>' : ''
  return {
    titre: `Reçu de Paiement ${p.reference || ''}`.trim(),
    bodyHtml: `<div class="doc-page recu-page recu-${formatRecu}">${corps}${separateur}</div>`,
    css: CSS_RECU,
    page,
  }
}

/**
 * Ouvre le reçu de paiement en vrai PDF dans le lecteur PDF du navigateur, au format
 * choisi (`'a4'` ou `'a5'`). Onglet ouvert par le clic, avant tout `await` ; aucune
 * impression automatique.
 */
export function imprimerRecuPaiementPdf(source, formatRecu = 'a4') {
  // `source` : un paiement, ou une fonction qui le charge (l'onglet du PDF est alors déjà
  // ouvert au moment du clic, avant le chargement — sinon le navigateur le bloquerait).
  return ouvrirPdfApresClic(async () => {
    const p = typeof source === 'function' ? await source() : source
    const identite = await chargerIdentitePdf(p.emetteur)
    return construireHtmlRecuPdf(p, identite, formatRecu)
  })
}
