// Attestation de domiciliation — reproduction du modèle PDF de référence (A4 portrait) :
// cadre bleu à motif, logo en haut à gauche, titre souligné, textes en Times New Roman.
// Toutes les positions et tailles sont relevées sur le PDF modèle (points PDF → px × 4/3).
//
// Génération normale : seuls les éléments surlignés en jaune sur le modèle sont repris automatiquement
// (voir `attestationParDefaut`) : société, civilité + représentant, durée, dates de début / fin, date
// de l'attestation. Tout le reste est du contenu FIXE, identique au modèle (constantes `FIXE`).
// « Modifier » permet de corriger TOUT le texte (`contenu`) ; ces corrections ne servent QU'À cette
// attestation : rien n'est enregistré, les données d'origine restent intactes.

import { escapeHtml } from '../../../utils/exporters.js'
import { formatDateFr } from '../../../utils/print/commun.js'
import { ouvrirPdfApresClic } from '../../../utils/print/ouvrirPdf.js'
import { civiliteAbregee } from './civilite.js'

// ---------------------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------------------

/** Contenu fixe du modèle (non surligné) — ne vient ni du client ni de la domiciliation. */
const FIXE = {
  domiciliataire: 'VIA EXPERTS',
  activite: 'CENTRE DE DOMICILIATION',
  adresse: 'BD 30 JUILLET RES LES CHAMPS DU PRINTEMPS GH 1 IMM F 5EME ETAGE N 15 SIDI MOUMEN CASABLANCA',
  rcVille: 'Casablanca',
  rc: '619971',
  identifiantFiscal: '60288700',
  qualite: 'gérant',
  villeFait: 'Casablanca',
  signataire: 'Mr MORAD BENDEQ',
}

const compacter = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()
const normaliser = (s) => compacter(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Durée du contrat en texte, à insérer après « pour un durée d` » (« un an », « 6 mois »…). */
function dureeEnTexte(debut, fin) {
  const a = new Date(debut)
  const b = new Date(fin)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'un an'
  const mois = Math.max(1, Math.round(((b.getFullYear() - a.getFullYear()) * 12) + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30))
  if (mois % 12 === 0) return mois === 12 ? 'un an' : `${mois / 12} ans`
  return `${mois} mois`
}

/**
 * Valeurs initiales des champs jaunes du modèle.
 * @param d           domiciliation (API) : dénomination, client, dates
 * @param entreprise  fiche entreprise (API) : forme juridique
 * @param client      fiche du client rattaché (API) : genre → civilité « Mr » / « Mme » (vide si inconnue)
 */
export function attestationParDefaut(d, { entreprise, client } = {}) {
  const forme = compacter(entreprise?.forme)
  const denomination = compacter(d.denomination)
  const aujourdhui = new Date()
  const jj = `${String(aujourdhui.getDate()).padStart(2, '0')}/${String(aujourdhui.getMonth() + 1).padStart(2, '0')}/${aujourdhui.getFullYear()}`

  return {
    societe: forme && !normaliser(denomination).includes(normaliser(forme)) ? `${denomination} ${forme}` : denomination,
    civilite: civiliteAbregee(client?.genre),
    representant: compacter(d.client).toUpperCase(),
    duree: dureeEnTexte(d.dateDepart, d.dateFin),
    dateDebut: formatDateFr(d.dateDepart),
    dateFin: formatDateFr(d.dateFin),
    // Date du jour (au moment où le document est ouvert pour génération) : jamais une ancienne date du dossier.
    dateFait: jj,
  }
}

// ---------------------------------------------------------------------------------------
// Cadre — motif relevé sur le modèle (unités de 1/300 pouce sur une page de 2480 × 3508)
// ---------------------------------------------------------------------------------------

const rect = ([x, y, w, h], fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

function cadreSvg() {
  const BLANC = '#fff'
  const MARINE = '#000080'
  const NOIR = '#000'
  const blancs = [
    [100, 100, 74.56, 74.56], [2305.97, 100, 74.56, 74.56], [100, 3333, 74.56, 74.56], [2305.97, 3333, 74.56, 74.56],
    [174.56, 100, 2131.41, 74.56], [174.56, 3333, 2131.41, 74.56], [100, 174.56, 74.56, 3158.44], [2305.97, 174.56, 74.56, 3158.44],
  ]
  const marines = [
    // côtés
    [174.56, 113.03, 2131.41, 19.16], [174.56, 3375.41, 2131.41, 19.13], [113.03, 174.56, 19.16, 3158.44], [2348.38, 174.56, 19.13, 3158.44],
    // angles : haut-gauche, haut-droit, bas-gauche, bas-droit
    [113.03, 113.03, 61.53, 19.16], [113.03, 113.03, 19.16, 61.53],
    [2348.38, 113.03, 19.13, 61.53], [2305.97, 113.03, 61.53, 19.16],
    [113.03, 3333, 19.16, 61.53], [113.03, 3375.41, 61.53, 19.13],
    [2305.97, 3375.41, 61.53, 19.13], [2348.38, 3333, 19.13, 61.53],
  ]
  const noirs = [
    // côtés (filet extérieur)
    [174.56, 100, 2131.41, 2.81], [174.56, 3404.75, 2131.41, 2.81], [100, 174.56, 2.81, 3158.44], [2377.72, 174.56, 2.81, 3158.44],
    // angle haut-gauche
    [161.97, 100, 12.59, 2.81], [161.97, 100, 2.81, 45.22], [100, 145.66, 64.78, 2.81], [100, 100, 2.81, 45.22],
    [100, 100, 48.47, 2.81], [145.66, 100, 2.81, 61.53], [100, 158.69, 48.47, 2.84], [100, 158.69, 2.81, 15.88],
    // angle haut-droit
    [2377.72, 161.97, 2.81, 12.59], [2335.31, 161.97, 45.22, 2.81], [2332.06, 100, 2.81, 64.78], [2335.31, 100, 45.22, 2.81],
    [2377.72, 100, 2.81, 48.47], [2319, 145.66, 61.53, 2.81], [2319, 100, 2.84, 48.47], [2305.97, 100, 15.88, 2.81],
    // angle bas-gauche
    [100, 3333, 2.81, 12.41], [100, 3342.78, 45.22, 2.63], [145.66, 3342.78, 2.81, 64.78], [100, 3404.75, 45.22, 2.81],
    [100, 3359.09, 2.81, 48.47], [100, 3359.09, 61.53, 2.59], [158.69, 3359.09, 2.84, 48.47], [158.69, 3404.75, 15.88, 2.81],
    // angle bas-droit
    [2305.97, 3404.75, 12.59, 2.81], [2315.75, 3362.34, 2.81, 45.22], [2315.75, 3359.09, 64.78, 2.59], [2377.72, 3362.34, 2.81, 45.22],
    [2332.06, 3404.75, 48.47, 2.81], [2332.06, 3346.03, 2.81, 61.53], [2332.06, 3346.03, 48.47, 2.84], [2377.72, 3333, 2.81, 15.88],
  ]
  return `<svg class="att-cadre" viewBox="0 0 2480 3508" width="794" height="1123" xmlns="http://www.w3.org/2000/svg">`
    + blancs.map((r) => rect(r, BLANC)).join('')
    + marines.map((r) => rect(r, MARINE)).join('')
    + noirs.map((r) => rect(r, NOIR)).join('')
    + '</svg>'
}

// ---------------------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------------------

const CSS_ATTESTATION = `
  .att-page, .att-page * { box-sizing: border-box; }
  .att-page { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fff; color: #000;
    font-family: 'Times New Roman', Times, 'Liberation Serif', serif; font-size: 21.333px; line-height: 24.533px; }
  /* Le cadre est AU-DESSUS du texte : ses bandes blanches masquent ce qui déborde, comme sur le modèle. */
  .att-cadre { position: absolute; left: 0; top: 0; width: 794px; height: 1123px; z-index: 2; pointer-events: none; }
  .att-logo { position: absolute; left: 23.9px; top: 59.8px; width: 154.4px; height: 87.4px; object-fit: fill; z-index: 0; }
  .att-titre { position: absolute; left: 156px; top: 130px; margin: 0; letter-spacing: 0.28px; font-size: 26.667px; font-weight: 700; line-height: normal; white-space: nowrap; z-index: 1; }
  .att-titre u { text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .att-corps { position: absolute; left: 76px; top: 194.9px; width: 700px; z-index: 1; }
  .att-corps p { margin: 0; white-space: nowrap; }
  .att-corps u { text-decoration-thickness: 1px; text-underline-offset: 2px; }
  .att-nom14 { font-size: 18.667px; font-weight: 700; line-height: 0; }
  .att-corps .att-p2 { margin-top: 15.5px !important; white-space: normal; }
  .att-juridique { margin: 40.5px 0 0 -9.3px; width: 680px; }
  .att-juridique .att-legal { font-size: 16px; line-height: 18.4px; white-space: nowrap; }
  .att-juridique .att-l1 { margin-left: -5.3px; }
  .att-juridique .att-l2 { margin-left: -6.7px; }
  .att-final { margin-top: 24.9px !important; }
  .att-fait { margin: 20.8px 0 0 371.6px !important; text-align: left; white-space: nowrap; }
  .att-corps .att-nom { margin: 49.8px 0 0 233.7px; white-space: nowrap; }
  /* Signature / cachet (réglages « Bureau de Comptabilité ») : sous le nom du signataire, hors de la zone modifiable. */
  .att-cachet { position: absolute; left: 0; top: 866px; width: 794px; text-align: center; z-index: 1; pointer-events: none; }
  .att-cachet img { display: inline-block; max-height: 110px; max-width: 240px; width: auto; height: auto; object-fit: contain; }
  /* Mode édition (type document) : tout le texte est modifiable ; le jaune rappelle les données reprises
     automatiquement de la domiciliation (champs jaunes du modèle). Jamais présent dans l'aperçu ni le PDF. */
  .att-edit [data-champ] { background: #fff066; }
  .att-edit [contenteditable] { outline: none; cursor: text; }
  .att-edit .att-corps:hover, .att-edit .att-titre:hover { box-shadow: 0 0 0 1px rgba(184, 163, 0, 0.45); }
  .att-edit .att-corps:focus, .att-edit .att-titre:focus { box-shadow: 0 0 0 2px #b8a300; }
`

/**
 * Relit le contenu modifié dans la version éditable (document de l'iframe d'édition) : titre et corps,
 * débarrassés des attributs d'édition et des styles que le navigateur ajoute en tapant.
 */
export function lireContenuAttestation(doc) {
  const nettoyer = (el) => {
    const copie = el.cloneNode(true)
    ;[copie, ...copie.querySelectorAll('*')].forEach((n) => {
      n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); n.removeAttribute('style')
    })
    copie.querySelectorAll('font').forEach((f) => f.replaceWith(...f.childNodes))
    return copie.innerHTML
  }
  return { titre: nettoyer(doc.querySelector('.att-titre')), corps: nettoyer(doc.querySelector('.att-corps')) }
}

/** HTML + CSS de l'attestation (pur, sans effet de bord) — sert à l'aperçu ET au PDF. */
export function construireHtmlAttestation(a, identite, { edition = false, contenu = null, signature = null } = {}) {
  const e = (v) => escapeHtml(v ?? '')
  // Champ jaune : donnée reprise automatiquement ; repéré par data-champ (surligné en mode édition).
  const champ = (cle, classe = '') => `<span${classe ? ` class="${classe}"` : ''} data-champ="${cle}">${e(a[cle])}</span>`
  // Le modèle est posé ligne par ligne : les retours à la ligne du texte fixe sont ceux du modèle.
  const activite = FIXE.activite.replace(' DOMICILIATION', '<br>DOMICILIATION')
  const adresse1 = FIXE.adresse.replace(' PRINTEMPS', '<br>PRINTEMPS').replace(' CASABLANCA', '<br>CASABLANCA')
  const adresse2 = FIXE.adresse.replace(' 5EME', '<br>5EME')

  const corpsGenere = `
        <p>Nous soussignés, <u><b>${FIXE.domiciliataire}</b></u>, de l’activité: <u><b>${activite}</b></u> sise à ${adresse1}.<br>Inscrit au&nbsp; RC ${FIXE.rcVille} N° ${FIXE.rc},&nbsp; Identifiant Fiscal&nbsp; N° ${FIXE.identifiantFiscal}</p>
        <p class="att-p2">Déclare par la présente, donner domiciliation à la Société :<br>${champ('societe', 'att-nom14')}, Représenté par ${champ('civilite')} ${champ('representant', 'att-nom14')} en<br>qualité de ${FIXE.qualite} et représentant légale de la société dans notre appartement<br>sis à ${adresse2}. Cette domiciliation<br>est accordée pour un durée d\`${champ('duree')} allant du ${champ('dateDebut')} au ${champ('dateFin')}.</p>
        <div class="att-juridique">
          <div>Comme indiqué dans le cadre juridique:</div>
          <div class="att-legal">
            Dans le cadre des dispositions de La loi n° 89-17 modifiant et complétant la loi n° 15-95 formant code de<br>commerce promulguée par le dahir n° 1-18-110 du 2 joumada I 1440 (09 janvier 2019) régissant la&nbsp; «<br>Domiciliation&nbsp;», parue dans les bulletins officiels en langue arabe n°6745 du 14 joumada I 1440 (21<br>janvier 2019) et en langue française n° 6788 du 16 chaoual 1440 (20 juin 2019), Le Domiciliataire<br>accepte de domicilier, à son adresse, Le Domicilié pour son activité pour la durée et aux conditions fixées<br>par les présentes.
            <div class="att-l1">Le Domicilié exercera cette activité seule, sous la dénomination en tête du contrat.</div>
            <div class="att-l2">Et ce conformément aux dispositions de l’article 93 du code de recouvrement de créances publiques.</div>
          </div>
        </div>
        <p class="att-final">Cette attestation est délivrée pour servir et valoir ce que de droit.</p>
        <p class="att-fait">Fait à ${FIXE.villeFait}, le&nbsp; ${champ('dateFait')}</p>
        <p class="att-nom">${FIXE.signataire}</p>
`

  // `contenu` : texte modifié par l'utilisateur pour CETTE attestation (jamais enregistré en base).
  const modifiable = edition ? ' contenteditable="true" spellcheck="false"' : ''
  const bodyHtml = `
    <div class="doc-page att-page${edition ? ' att-edit' : ''}">
      <img class="att-logo" src="${identite.logo}" alt="${e(identite.nomSociete)}" />
      <h1 class="att-titre"${modifiable}>${contenu?.titre ?? '<u>ATTESTATION DE DOMICILIATION</u>'}</h1>
      <div class="att-corps"${modifiable}>${contenu?.corps ?? corpsGenere}</div>
      ${signature ? `<div class="att-cachet"><img src="${signature}" alt="Signature et cachet" /></div>` : ''}
      ${cadreSvg()}
    </div>`

  return { titre: `ATTESTATION DE DOMICILIATION ${a.societe}`.trim(), bodyHtml, css: CSS_ATTESTATION }
}

/** Ouvre l'attestation en vrai PDF (A4) dans le lecteur du navigateur — à appeler depuis un clic. */
export function imprimerAttestationPdf(a, identite, { contenu = null, signature = null } = {}) {
  return ouvrirPdfApresClic(async () => construireHtmlAttestation(a, identite, { contenu, signature }))
}
