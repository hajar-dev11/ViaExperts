// Exports de la Déclaratio\u0300-\u036f// Exports de la Déclaration TVA et du Chiffre d'Affaire : XML, Excel (.xlsx) et ZIP (XML + Excel), générés dans le navigateur
// à partir des lignes AFFICHÉES. Aucun appel serveur : l'export ne dépend pas de l'enregistrement et ne modifie rien.
//
// ⚠️ Le XML a la structure propre à Via Experts (celle déjà produite par le serveur, complétée des colonnes manquantes). Elle n'a
// PAS été confrontée à un schéma officiel de la DGI : à valider avant tout dépôt sur un portail fiscal.
import { creerZip, enOctets } from './zipStockage.js'

export const COLONNES_EXPORT = [
  { cle: 'ordreRef', entete: 'OR' },
  { cle: 'factNum', entete: 'FACT NUM' },
  { cle: 'designation', entete: 'DESIGNATION' },
  { cle: 'ht', entete: 'HT', montant: true },
  { cle: 'tva', entete: 'TVA', montant: true },
  { cle: 'ttc', entete: 'TTC', montant: true },
  { cle: 'identifiantFiscal', entete: 'IF' },
  { cle: 'libelleFournisseur', entete: 'LIB FRSS' },
  { cle: 'ice', entete: 'ICE' },
  { cle: 'taux', entete: 'TAUX', nombre: true },
  { cle: 'idPaie', entete: 'ID PAIE' },
  { cle: 'datePaie', entete: 'DATE PAIE' },
  { cle: 'dateFac', entete: 'DATE FAC' },
]

export const FORMATS = {
  xml: { extension: 'xml', mime: 'application/xml' },
  xls: { extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  zip: { extension: 'zip', mime: 'application/zip' },
}

const nombre = (v) => { const x = Number.parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0 }
const texte = (v) => (v === null || v === undefined ? '' : String(v))
const montant = (v) => nombre(v).toFixed(2)

/** Date AAAA-MM-JJ réelle (le 31/02 est refusé). */
export function dateValide(valeur) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false
  const d = new Date(`${valeur}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur
}

// ------------------------------------------------------------------ Données

const LIGNE_VIDE = ['ordreRef', 'factNum', 'designation', 'identifiantFiscal', 'libelleFournisseur', 'ice', 'idPaie', 'datePaie', 'dateFac']

/** Ligne non renseignée : rien de saisi (le taux par défaut et les montants à 0 ne comptent pas). */
export const ligneVide = (l) => LIGNE_VIDE.every((cle) => texte(l[cle]).trim() === '')
  && nombre(l.ht) === 0 && nombre(l.tva) === 0 && nombre(l.ttc) === 0

/** Données d'export depuis l'état du formulaire (champs en snake_case, comme l'API). */
export function donneesDepuisFormulaire(form, lignes, nomEntreprise = '') {
  return {
    entete: {
      entrepriseId: form.entreprise_id, entreprise: nomEntreprise, clientIf: texte(form.client_if).trim(),
      identifiantPaiement: texte(form.identifiant_paiement).trim(), periodeType: form.periode_type,
      periodeValeur: texte(form.periode_valeur), annee: texte(form.annee), regime: texte(form.regime).trim(),
    },
    lignes: lignes.map((l) => ({
      ordreRef: l.ordre_ref, factNum: l.fact_num, designation: l.designation, ht: l.ht, tva: l.tva, ttc: l.ttc,
      identifiantFiscal: l.identifiant_fiscal, libelleFournisseur: l.libelle_fournisseur, ice: l.ice, taux: l.taux,
      idPaie: l.id_paie, datePaie: l.date_paie, dateFac: l.date_fac,
    })),
  }
}

/** Données d'export depuis une déclaration lue sur l'API (camelCase). */
export function donneesDepuisApi(d) {
  return {
    entete: {
      entrepriseId: d.entrepriseId, entreprise: d.nomComplet ?? '', clientIf: texte(d.clientIf).trim(),
      identifiantPaiement: texte(d.identifiantPaiement).trim(), periodeType: d.periodeType,
      periodeValeur: texte(d.periodeValeur), annee: texte(d.annee), regime: texte(d.regime).trim(),
    },
    lignes: (d.lignes ?? []).map((l) => ({
      ordreRef: l.ordreRef, factNum: l.factNum, designation: l.designation, ht: l.ht, tva: l.tva, ttc: l.ttc,
      identifiantFiscal: l.identifiantFiscal, libelleFournisseur: l.libelleFournisseur, ice: l.ice, taux: l.taux,
      idPaie: l.idPaie, datePaie: texte(l.datePaie).slice(0, 10), dateFac: texte(l.dateFac).slice(0, 10),
    })),
  }
}

const lignesRenseignees = (donnees) => donnees.lignes.filter((l) => !ligneVide(l))

export function totauxExport(donnees) {
  const lignes = lignesRenseignees(donnees)
  return {
    ht: lignes.reduce((a, l) => a + nombre(l.ht), 0),
    tva: lignes.reduce((a, l) => a + nombre(l.tva), 0),
    ttc: lignes.reduce((a, l) => a + nombre(l.ttc), 0),
  }
}

// --------------------------------------------------------------- Validation

/**
 * Contrôle AVANT export — mêmes champs obligatoires que l'enregistrement (entreprise, client IF, période, année, régime) et
 * lignes cohérentes (taux 0–100, montants numériques, dates réelles). Rien d'autre n'est exigé : l'export n'est pas bloqué par
 * des règles qui n'existent pas à l'enregistrement.
 *
 * @returns {{ messages: string[], champs: Record<string, string[]> }} `champs` : erreurs au format du formulaire (clé = champ)
 */
export function validerExport(donnees) {
  const messages = []
  const champs = {}
  const signaler = (cle, message) => { messages.push(message); champs[cle] = [message] }
  const e = donnees.entete

  if (!e.entrepriseId) signaler('entreprise_id', 'Sélectionnez l’entreprise.')
  if (!e.clientIf) signaler('client_if', 'Renseignez le Client IF.')
  if (!e.periodeValeur) signaler('periode_valeur', 'Sélectionnez la période.')
  const annee = Number(e.annee)
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) signaler('annee', 'L’année doit être comprise entre 2000 et 2100.')
  if (!e.regime) signaler('regime', 'Renseignez le régime.')

  const lignes = donnees.lignes.map((l, i) => ({ l, i })).filter(({ l }) => !ligneVide(l))
  if (lignes.length === 0) {
    signaler('lignes', 'Aucune ligne renseignée : ajoutez au moins une ligne avant d’exporter.')
  }
  lignes.forEach(({ l, i }) => {
    const ligne = `Ligne ${i + 1}`
    const taux = texte(l.taux).trim()
    if (taux !== '' && (!Number.isFinite(Number(taux)) || Number(taux) < 0 || Number(taux) > 100)) {
      signaler(`lignes.${i}.taux`, `${ligne} : le taux doit être compris entre 0 et 100.`)
    }
    for (const cle of ['ht', 'tva', 'ttc']) {
      const v = texte(l[cle]).trim()
      if (v !== '' && !Number.isFinite(Number(v.replace(',', '.')))) signaler(`lignes.${i}.${cle}`, `${ligne} : ${cle.toUpperCase()} n’est pas un nombre.`)
    }
    for (const [cle, nom] of [['datePaie', 'DATE PAIE'], ['dateFac', 'DATE FAC']]) {
      const v = texte(l[cle]).trim()
      if (v !== '' && !dateValide(v)) signaler(`lignes.${i}.${cle === 'datePaie' ? 'date_paie' : 'date_fac'}`, `${ligne} : ${nom} n’est pas une date valide.`)
    }
  })
  return { messages, champs }
}

// ------------------------------------------------------------------- XML

/** Échappe le texte XML et retire les caractères interdits par XML 1.0. */
export function echapperXml(valeur) {
  // eslint-disable-next-line no-control-regex
  return texte(valeur).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function construireXml(donnees, racine = 'DeclarationTVA') {
  const e = donnees.entete
  const t = totauxExport(donnees)
  const el = (nom, v, indent) => `${indent}<${nom}>${echapperXml(v)}</${nom}>`
  const lignes = lignesRenseignees(donnees).map((l) => [
    '    <Ligne>',
    el('OrdreRef', l.ordreRef, '      '), el('NumeroFacture', l.factNum, '      '), el('Designation', l.designation, '      '),
    el('HT', montant(l.ht), '      '), el('TVA', montant(l.tva), '      '), el('TTC', montant(l.ttc), '      '),
    el('IF', l.identifiantFiscal, '      '), el('LibelleFournisseur', l.libelleFournisseur, '      '), el('ICE', l.ice, '      '),
    el('Taux', nombre(l.taux), '      '), el('IdPaiement', l.idPaie, '      '),
    el('DateFacture', l.dateFac, '      '), el('DatePaiement', l.datePaie, '      '),
    '    </Ligne>',
  ].join('\n'))

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${racine}>`,
    el('Identifiant', e.clientIf, '  '), el('Entreprise', e.entreprise, '  '),
    el('Annee', e.annee, '  '), el('PeriodeType', e.periodeType, '  '), el('Periode', e.periodeValeur, '  '),
    el('Regime', e.regime, '  '), el('IdentifiantPaiement', e.identifiantPaiement, '  '),
    el('TotalHT', montant(t.ht), '  '), el('TotalTVA', montant(t.tva), '  '), el('TotalTTC', montant(t.ttc), '  '),
    '  <Lignes>', ...lignes, '  </Lignes>',
    `</${racine}>`, '',
  ].join('\n')
}

// ------------------------------------------------------------------ Excel

const lettreColonne = (i) => String.fromCharCode(65 + i) // 13 colonnes : A à M

/** Classeur Excel (.xlsx, OOXML) d'une feuille : en-têtes en gras, montants au format 0,00, tout le reste en texte. */
export function construireXlsx(donnees, nomFeuille = 'Declaration TVA') {
  const cellule = (ref, v, col) => {
    if (col.montant) return `<c r="${ref}" s="2"><v>${montant(v)}</v></c>`
    if (col.nombre) return `<c r="${ref}"><v>${nombre(v)}</v></c>`
    const t = echapperXml(v)
    return t === '' ? `<c r="${ref}"/>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`
  }
  const entetes = COLONNES_EXPORT.map((c, i) => `<c r="${lettreColonne(i)}1" s="1" t="inlineStr"><is><t>${echapperXml(c.entete)}</t></is></c>`).join('')
  const rangees = lignesRenseignees(donnees).map((l, r) => {
    const n = r + 2
    return `<row r="${n}">${COLONNES_EXPORT.map((c, i) => cellule(`${lettreColonne(i)}${n}`, l[c.cle], c)).join('')}</row>`
  })
  const largeurs = [8, 16, 34, 14, 14, 14, 14, 28, 20, 8, 12, 14, 14]
  const feuille = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<cols>${largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData><row r="1">${entetes}</row>${rangees.join('')}</sheetData></worksheet>`

  const entete = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const typeOoxml = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
  const fichiers = [
    { nom: '[Content_Types].xml', donnees: `${entete}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${typeOoxml}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${typeOoxml}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${typeOoxml}.styles+xml"/></Types>` },
    { nom: '_rels/.rels', donnees: `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nom: 'xl/workbook.xml', donnees: `${entete}<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="${echapperXml(nomFeuille)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nom: 'xl/_rels/workbook.xml.rels', donnees: `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>` },
    { nom: 'xl/styles.xml', donnees: `${entete}<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { nom: 'xl/worksheets/sheet1.xml', donnees: feuille },
  ]
  return creerZip(fichiers)
}

// --------------------------------------------------------- Génération + envoi

const slug = (s) => texte(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()

/** Nom de fichier sans extension : declaration-tva-2026-t3-societe-x (ou chiffre-affaire-…). */
export function nomDeBase(donnees, type = 'tva') {
  const e = donnees.entete
  const periode = `${e.periodeType === 'mois' ? 'm' : 't'}${e.periodeValeur}`
  return [type === 'tva' ? 'declaration-tva' : 'chiffre-affaire', e.annee, periode, slug(e.entreprise)].filter(Boolean).join('-')
}

/**
 * Génère le fichier demandé. Lève une erreur si le contenu est vide : on n'annonce jamais un fichier qui n'existe pas.
 * @returns {{ nom: string, mime: string, octets: Uint8Array }}
 */
export function genererExport(format, donnees, type = 'tva') {
  const def = FORMATS[format]
  if (!def) throw new Error(`Format d'export inconnu : ${format}`)
  const base = nomDeBase(donnees, type)
  const racine = type === 'tva' ? 'DeclarationTVA' : 'ChiffreAffaire'
  const feuille = type === 'tva' ? 'Declaration TVA' : 'Chiffre d affaire'

  let octets
  if (format === 'xml') octets = enOctets(construireXml(donnees, racine))
  else if (format === 'xls') octets = construireXlsx(donnees, feuille)
  else octets = creerZip([
    { nom: `${base}.xml`, donnees: construireXml(donnees, racine) },
    { nom: `${base}.xlsx`, donnees: construireXlsx(donnees, feuille) },
  ])

  if (!octets || octets.length === 0) throw new Error('Le fichier généré est vide.')
  return { nom: `${base}.${def.extension}`, mime: def.mime, octets }
}

/** Déclenche le téléchargement navigateur d'un fichier généré. */
export function telecharger({ nom, mime, octets }) {
  const lien = document.createElement('a')
  const url = URL.createObjectURL(new Blob([octets], { type: mime }))
  lien.href = url
  lien.download = nom
  lien.style.display = 'none'
  document.body.appendChild(lien)
  lien.click()
  document.body.removeChild(lien)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
