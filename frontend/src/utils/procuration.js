// Procuration — reproduction du modèle PDF de référence (A4 portrait, une page) :
// titre souligné, « Annexe 1 » (formulaire de renseignements) et « Annexe 2 » (procuration spéciale) à
// gauche, « Annexe 3 » (engagement) à droite, bloc de signature en bas à droite. Times New Roman 12 pt.
// Toutes les positions et tailles sont relevées sur le PDF modèle (pixels du rendu ÷ 1,5 → px CSS).
//
// Génération normale : seuls les éléments surlignés en jaune sur le modèle sont repris automatiquement
// (voir `procurationParDefaut`) : civilité, nom, date de naissance, CIN, adresse, téléphone, e-mail,
// société et date. Tout le reste est du contenu FIXE, identique au modèle.
// « Modifier » permet de corriger TOUT le texte (`contenu`) ; ces corrections ne servent QU'À cette
// procuration : rien n'est enregistré, les données d'origine restent intactes.

import { escapeHtml } from './exporters.js'
import { formatDateFr, ouvrirPdfApresClic } from './documentPrint.js'
import { getClient } from '../api/clients.js'

// ---------------------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------------------

const compacter = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()

/**
 * Civilité déterminée à partir du genre de la fiche client (« Mr » / « Mme ») : une femme → « Madame »,
 * un homme → « Monsieur » (libellé du modèle). Sans information, « Monsieur », comme sur le modèle.
 */
function civiliteDepuisGenre(genre) {
  const g = compacter(genre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\./g, '')
  return ['mme', 'mlle', 'madame', 'mademoiselle', 'f', 'femme', 'feminin'].includes(g) ? 'Madame' : 'Monsieur'
}

/** Informations complémentaires du client (date de naissance, téléphone, genre) : lecture seule. */
export async function chargerClientProcuration(d, entreprise) {
  if (!entreprise?.clientId) return { client: null }
  return { client: await getClient(entreprise.clientId).catch(() => null) }
}

/**
 * Valeurs initiales des champs jaunes du modèle.
 * @param d           domiciliation (API) : dénomination, client, CIN, adresse, e-mail, dates
 * @param client      fiche client (API) : genre (civilité), date de naissance, téléphone
 */
export function procurationParDefaut(d, { client } = {}) {
  const aujourdhui = new Date()
  const jj = `${String(aujourdhui.getDate()).padStart(2, '0')}/${String(aujourdhui.getMonth() + 1).padStart(2, '0')}/${aujourdhui.getFullYear()}`
  return {
    civilite: civiliteDepuisGenre(client?.genre),
    nom: compacter(d.client).toUpperCase(),
    naissance: formatDateFr(client?.naissance),
    cni: compacter(d.clientCin).toUpperCase(),
    adresse: compacter(d.clientAdresse).toUpperCase(),
    tel: compacter(client?.tel),
    email: compacter(client?.email || d.email),
    societe: compacter(d.denomination),
    // Date du jour (au moment où la procuration est ouverte pour génération) — jamais une ancienne date
    // de la domiciliation ; modifiable via « Modifier ».
    dateFait: jj,
  }
}

// ---------------------------------------------------------------------------------------
// Gabarit — chaque bloc est positionné comme sur le modèle (left / top en px CSS)
// ---------------------------------------------------------------------------------------

const nb = '&nbsp;'

/** Contenu fixe + champs jaunes (`{{champ}}`) de chaque bloc, dans l'ordre du modèle. */
const LISTE = [
    "Copie d. documents d'identité du représentant légal de la société domiciliée ;",
    "Copie d'une pièce prouvant l’adresse du représentant légal de la société ;",
    'Extrait du compte bancaire ou spécimen de chèque ;',
    'Numéro de téléphone du représentant légal de la société domiciliée',
    'Adresse E-mail du représentant légal de la société domiciliée ;',
    'Adresse de réexpédition du courrier ;',
    'Copie d. statuts de la société domiciliée ;',
    'Copie du registre du commerce « model J »',
  ].map((t) => `<div class="pr-it"><span class="pr-v">✓</span>${t}</div>`).join('')

const BLOCS = {
  titre: '<u>Procuration</u>',
  a1: 'ANNEXE 1 :<br>FORMULAIRE DE RENSEIGNEMENTS',
  tableau: `<table class="pr-tab"><tbody>
    <tr class="r1"><td>{{~civilite}}</td><td>{{nom}}</td></tr>
    <tr class="r2"><td>Né(e) en da.<br>du</td><td>{{naissance}}</td></tr>
    <tr class="r3"><td>Nationalité</td><td>MAROCAINE</td></tr>
    <tr class="r4"><td>CINN°</td><td>{{cni}}</td></tr>
    <tr class="r5"><td>Demeurant au</td><td>{{adresse}}</td></tr>
    <tr class="r6"><td>Qualité</td><td>Gérant</td></tr>
    <tr class="r7"><td>Numéro de<br>téléphone</td><td>{{tel}}</td></tr>
    <tr class="r8"><td>E-mail</td><td>{{email}}</td></tr>
    <tr class="r9"><td>Adresse lieu<br>d'activité</td><td>DOM CHEZ BD 30 JUILLET RES<br>LES CHAMPS DU PRINTEMPS GH 1<br>IMM F 5EME ETAGE N 15 SIDI<br>MOUMEN CASABLANCA</td></tr>
  </tbody></table>`,
  para1: `Je Soussigné <b>{{civilite}} {{nom}}</b> que<br>toutes les informations fournies sont exactes et à jour.<br>Je déclare que l'adresse e-mail fournie est<br>fonctionnelle et valable pour la réception de toute la<br>correspondance destinée${nb} à la société.`,
  a2: 'ANNEXE 2 :<br>PROCURATION SPECIALE',
  para2: `<b>{{civilite}} {{nom}}</b>, titulaire de la CIN<br><b>{{cni}}</b>${nb} et demeurant à {{adresse}} En qualité gérant de la société «<b>{{societe}}</b>», donne par la présente procuration au <b>CENTRE D'AFFAIRE VIA EXPERTS</b>, pour la réception de toutes sortes de notifications en notre nom.`,
  a3: 'ANNEXE 3 :<br>ENGAGEMENT',
  para3: `<b>{{civilite}} {{nom}}</b> titulaire de la CIN N° <b>{{cni}}</b> et demeurant {{adresse}} En qualité gérant de la société «<b>{{societe}}</b>» engage à fournir au domiciliataire .documents suivants${LISTE}`,
  // Bloc de signature : la date seule en haut, puis « SIGNATURE DOMICILIÉ » et les trois lignes du
  // représentant, toutes centrées sur le même axe avec le même interligne.
  pied: `<div class="pr-date">Fait en quatre exemplaires, à Casablanca le {{dateFait}}</div><div class="pr-sig-titre">SIGNATURE DOMICILIÉ</div><div class="pr-sig-lignes"><div>La société «&nbsp;<b>{{societe}}</b>&nbsp;»</div><div>Représentée par</div><div>{{~civilite}} <b>{{nom}}</b></div></div>`,
}
const ORDRE = ['titre', 'a1', 'tableau', 'para1', 'a2', 'para2', 'a3', 'para3', 'pied']

const CSS_PROCURATION = `
  .pr-doc, .pr-doc * { box-sizing: border-box; }
  .pr-doc { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fff; color: #000;
    font-family: 'Times New Roman', Times, 'Liberation Serif', serif; font-size: 16px; line-height: 21.3px;
    text-rendering: geometricPrecision; font-kerning: none; }
  .pr-b { position: absolute; margin: 0; }
  .pr-titre { left: 305.7px; top: 63.8px; font-size: 26.16px; font-weight: 700; line-height: 30px; white-space: nowrap; }
  .pr-titre u { text-decoration-thickness: 2.6px; text-underline-offset: 3px; }
  .pr-a1 { left: 46.6px; top: 110.4px; font-weight: 700; white-space: nowrap; }
  .pr-tableau { left: 37.4px; top: 174.5px; width: 385.4px; }
  .pr-tab { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .pr-tab td { border: 1.3px solid #000; padding: 0 3px 0 7.5px; vertical-align: top; line-height: 17.6px; }
  .pr-tab td:first-child { width: 112px; }
  .pr-tab .r1 td { height: 19.3px; } .pr-tab .r2 td { height: 37.3px; } .pr-tab .r3 td { height: 20px; }
  .pr-tab .r4 td { height: 18px; } .pr-tab .r5 td { height: 37.3px; } .pr-tab .r6 td { height: 19.3px; }
  .pr-tab .r7 td { height: 37.9px; } .pr-tab .r8 td { height: 18.7px; } .pr-tab .r9 td { height: 73.9px; }
  .pr-para1 { left: 44.4px; top: 495px; width: 380px; }
  .pr-a2 { left: 44px; top: 614px; font-weight: 700; white-space: nowrap; }
  .pr-para2 { left: 44px; top: 664.3px; width: 348px; }
  .pr-a3 { left: 434.3px; top: 131.1px; font-weight: 700; white-space: nowrap; }
  .pr-para3 { left: 435.2px; top: 181px; width: 338px; }
  .pr-it { position: relative; top: -1px; margin-left: -2.9px; width: 335px; padding-left: 21px; }
  .pr-v { position: absolute; left: 0; top: 0; font-family: 'Segoe UI Symbol', 'Wingdings', sans-serif; font-size: 14px; }
  /* Bloc de signature : tout est centré sur l'axe du bloc, interligne régulier de 21,3 px. */
  .pr-pied { left: 433.4px; top: 678px; width: 340px; text-align: center; white-space: nowrap; }
  .pr-date { font-size: 14.67px; }
  .pr-sig-titre { margin: 10px 0; font-weight: 700; letter-spacing: 0.4px; }
  /* Un nom de société très long passe à la ligne en restant centré (au lieu de déborder du bloc). */
  .pr-sig-lignes > div { white-space: normal; text-wrap: balance; }
  /* Mode édition (type document) : tout le texte est modifiable ; le jaune rappelle les données reprises
     automatiquement (champs jaunes du modèle). Jamais présent dans l'aperçu ni le PDF. */
  .pr-edit [data-champ] { background: #fff066; }
  .pr-edit [contenteditable] { outline: none; cursor: text; }
  .pr-edit .pr-b:hover { box-shadow: 0 0 0 1px rgba(184, 163, 0, 0.45); }
  .pr-edit .pr-b:focus { box-shadow: 0 0 0 2px #b8a300; }
`

/**
 * Relit le contenu modifié dans la version éditable (document de l'iframe d'édition) : un fragment HTML
 * par bloc, débarrassé des attributs d'édition et des styles que le navigateur ajoute en tapant.
 */
export function lireContenuProcuration(doc) {
  const blocs = {}
  doc.querySelectorAll('.pr-b').forEach((el) => {
    const copie = el.cloneNode(true)
    ;[copie, ...copie.querySelectorAll('*')].forEach((n) => {
      n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); n.removeAttribute('style')
    })
    copie.querySelectorAll('font').forEach((f) => f.replaceWith(...f.childNodes))
    blocs[el.dataset.bloc] = copie.innerHTML
  })
  return { blocs }
}

/** HTML + CSS de la procuration (pur, sans effet de bord) — sert à l'aperçu ET au PDF. */
export function construireHtmlProcuration(v, identite, { edition = false, contenu = null } = {}) {
  const e = (x) => escapeHtml(x ?? '')
  // `{{champ}}` : champ jaune du modèle ; `{{~champ}}` : même valeur dans un libellé fixe du modèle (civilité).
  const remplir = (h) => h.replace(/\{\{(~?)(\w+)\}\}/g, (_, fixe, cle) => (fixe ? e(v[cle]) : `<span data-champ="${cle}">${e(v[cle])}</span>`))
  const modifiable = edition ? ' contenteditable="true" spellcheck="false"' : ''

  const blocs = ORDRE.map((id) => {
    const html = contenu?.blocs?.[id] ?? remplir(BLOCS[id])
    return `<div class="pr-b pr-${id}" data-bloc="${id}"${modifiable}>${html}</div>`
  }).join('')

  const bodyHtml = `<div class="doc-page pr-doc${edition ? ' pr-edit' : ''}">${blocs}</div>`
  return { titre: `PROCURATION ${v.societe}`.trim(), bodyHtml, css: CSS_PROCURATION }
}

/** Ouvre la procuration en vrai PDF (A4) dans le lecteur du navigateur — à appeler depuis un clic. */
export function imprimerProcurationPdf(v, identite, { contenu = null } = {}) {
  return ouvrirPdfApresClic(async () => construireHtmlProcuration(v, identite, { contenu }))
}
