// Exports réels de listes — aucun téléchargement factice.
//
// - CSV    : fichier .csv (BOM UTF-8, séparateur ",") généré via Blob.
// - Excel  : fichier .xls (tableau HTML + MIME Excel) — ouvert nativement par Excel/LibreOffice.
// - Imprimer / PDF : impression réelle via une iframe cachée (pas de window.open, donc
//   jamais bloqué par le navigateur). Pour le PDF, l'utilisateur choisit « Enregistrer au
//   format PDF » dans la boîte d'impression — aucune dépendance supplémentaire n'a été
//   ajoutée au projet pour ça.
//
// `columns` : [{ header: 'Nom', value: (row) => string }]

const cell = (col, row) => {
  const v = col.value ? col.value(row) : row[col.key]
  return v === null || v === undefined ? '' : String(v)
}

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportCsv(filename, columns, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [columns.map((c) => escape(c.header)).join(',')]
  rows.forEach((row) => lines.push(columns.map((c) => escape(cell(c, row))).join(',')))
  // BOM UTF-8 : sans lui, Excel casse les accents.
  triggerDownload(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`)
}

export const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function tableHtml(columns, rows) {
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(cell(c, row))}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

export function exportExcel(filename, columns, rows) {
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" />
<style>table{border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px 10px;font-family:Arial,sans-serif;font-size:12px;mso-number-format:"\\@"}th{background:#f1f5f9;font-weight:bold}</style>
</head><body>${tableHtml(columns, rows)}</body></html>`
  triggerDownload(new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${filename}.xls`)
}

// `document.readyState` passe à "complete" dès que le HTML écrit est analysé, SANS
// attendre les images : imprimer à ce moment-là donnait un aperçu sans logo ni
// signature. On attend donc que chaque image soit chargée (ou en erreur), avec un
// délai maximal pour ne jamais bloquer l'impression.
export function quandImagesChargees(doc, callback, delaiMax = 8000) {
  const enAttente = [...doc.images].filter((img) => !img.complete)
  if (enAttente.length === 0) { callback(); return }
  let restantes = enAttente.length
  let termine = false
  const fin = () => { if (!termine) { termine = true; callback() } }
  const unePrete = () => { restantes -= 1; if (restantes === 0) fin() }
  enAttente.forEach((img) => {
    img.addEventListener('load', unePrete)
    img.addEventListener('error', unePrete)
  })
  setTimeout(fin, delaiMax)
}

// Document HTML complet (gabarit de base + CSS propre au document) — partagé par
// l'impression par iframe et par la génération du PDF des documents commerciaux.
export function htmlDocumentComplet(title, bodyHtml, extraCss = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  ${extraCss}
</style></head><body>${bodyHtml}</body></html>`
}
// Impression réelle d'un contenu HTML libre (facture…), même mécanisme que printTable.
// Utilisé pour le reçu de paiement et les documents de domiciliation.
export function printHtml(title, bodyHtml, extraCss = '') {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  ${extraCss}
</style></head><body>${bodyHtml}</body></html>`)
  doc.close()

  const win = iframe.contentWindow
  quandImagesChargees(doc, () => {
    win.focus()
    win.print()
    setTimeout(() => iframe.remove(), 1000)
  })
}

// Impression réelle. Une iframe cachée évite le blocage des pop-ups et n'altère pas la page.
export function printTable(title, columns, rows, subtitle = '') {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const cleanup = () => {
    // Laisser le temps à la boîte d'impression de s'ouvrir avant de retirer l'iframe.
    setTimeout(() => iframe.remove(), 1000)
  }

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 14mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 11px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; color: #334155; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${escapeHtml(subtitle)}${subtitle ? ' · ' : ''}${rows.length} ligne(s) · ${new Date().toLocaleString('fr-FR')}</div>
${tableHtml(columns, rows)}
</body></html>`)
  doc.close()

  const win = iframe.contentWindow
  const run = () => {
    win.focus()
    win.print()
    cleanup()
  }
  if (doc.readyState === 'complete') run()
  else iframe.onload = run
}
