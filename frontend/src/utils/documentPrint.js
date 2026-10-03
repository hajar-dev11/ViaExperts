// Impression des documents commerciaux (Facture / Devis / Bon Livraison /
// Facture d'Avoir) et du Reçu de Paiement — gabarit repris fidèlement des
// modèles de référence fournis par l'utilisateur (logo, bandeau coloré par
// type de document, tableau de lignes, bloc récapitulatif, montant en toutes
// lettres, cachet/signature, pied de page légal).
//
// Facture / Devis / Bon Livraison / Facture d'Avoir : ouverts comme un vrai PDF dans
// le lecteur PDF du navigateur (`pdfDocument.js`), sans impression automatique.
// Reçu de paiement : impression directe par iframe cachée (`printHtml`).

import { printHtml, escapeHtml } from './exporters.js'
import { genererPdf, ouvrirPdf, PAGES } from './pdfDocument.js'
import { getCabinetSettings, getDomiciliationSettings } from '../api/settings.js'
import { API_URL } from '../api/http.js'
import { montantEnLettres } from './montantEnLettres.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`
// Pourcentage sans décimales inutiles (« 20% », pas « 20.00% »).
const pct = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}%`
// La date vient de l'API au format technique "AAAA-MM-JJ HH:mm:ss" — on n'affiche
// jamais ça telle quelle. Format normal : "JJ/MM/AAAA", et "JJ/MM/AAAA | HH:mm"
// quand l'heure est réellement renseignée (minuit = simple date, pas d'heure réelle).
export const formatDateFr = (v) => {
  if (!v) return ''
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/)
  if (!m) return String(v)
  const [, annee, mois, jour, heure, minute] = m
  const date = `${jour}/${mois}/${annee}`
  return heure && !(heure === '00' && minute === '00') ? `${date} | ${heure}:${minute}` : date
}

const fichierUrl = (path) => (path ? `${API_URL}/storage/${path}` : null)

/**
 * Identité (logo/signature/pied de page) de l'émetteur — Via Experts ou le
 * Bureau de Comptabilité ont chacun leurs propres réglages (Paramètres →
 * Bureau / Centre), déjà en place avant cette fonctionnalité.
 */
export async function chargerIdentite(emetteur) {
  const s = emetteur === 'via_experts' ? await getDomiciliationSettings() : await getCabinetSettings()
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
// Styles communs aux 5 documents — un bandeau de couleur par type, une
// disposition à deux colonnes (informations à gauche, récapitulatif chiffré
// à droite), reprise du tableau de lignes et du pied de page légal.
const CSS_COMMUN = `
  /* Marge de page à 0 : (1) les décors débordent jusqu'au bord de la feuille comme
     le modèle ; (2) Chrome/Edge n'ajoutent plus leur en-tête/pied d'impression
     (date, titre, « about:blank », « 1/1 »). Les marges sont reproduites par le
     padding de .doc-page. */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a2e; font-size: 12px; background: #fff; }
  /* isolation : crée un contexte d'empilement, sinon les décors (z-index négatif)
     passeraient derrière le fond blanc de la page et disparaîtraient. */
  .doc-page { position: relative; z-index: 0; isolation: isolate; width: 210mm; min-height: 296mm; padding: 16mm 16mm calc(16mm + 70px); overflow: hidden; background: #fff; }
  /* À l'écran (onglet de la facture) : feuille A4 centrée sur fond neutre. */
  @media screen {
    html { background: #d1d5db; }
    body { background: transparent; padding: 24px 0; }
    .doc-page { margin: 0 auto; box-shadow: 0 2px 14px rgba(0,0,0,.25); }
  }
  @media print { html, body { background: #fff; } }
  .doc-entete { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
  .doc-logo { height: 62px; object-fit: contain; }
  .doc-titre { font-size: 40px; font-weight: 700; letter-spacing: .02em; margin: 0; color: var(--accent, #2b4c8c); }
  /* Facture et Facture d'Avoir : le titre occupe sa propre ligne, au-dessus du
     logo — gabarit des modèles de référence fournis pour ces deux types.
     Devis et Bon de Livraison gardent le gabarit logo/titre côte à côte. */
  .doc-entete-vertical { margin-bottom: 14px; position: relative; z-index: 1; }
  .doc-entete-vertical .doc-titre { display: block; margin: 0 0 14px; }
  .doc-entete-vertical .doc-logo { display: block; }
  .doc-meta-ligne { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 16px; position: relative; z-index: 1; }
  /* min-width:0 : sans ça, un nom de client long ne passe jamais à la ligne et
     déborde du bord droit de la page au lieu de se replier dans sa colonne. */
  .doc-emetteur, .doc-client { min-width: 0; }
  .doc-client { max-width: 56%; overflow-wrap: break-word; }
  /* Facture : « Mode paiement » et « Prix Restant » en deux cases côte à côte,
     comme le modèle de référence, au lieu d'une seule ligne de texte. */
  .doc-paiement-split { display: flex; padding: 0; background: #f4f5f7; border-bottom: 1px solid #d9dde5; }
  .doc-paiement-split span { flex: 1; padding: 7px 10px; font-size: 11.5px; }
  .doc-paiement-split span:first-child { border-right: 1px solid #d9dde5; }
  .doc-emetteur { font-size: 13px; }
  .doc-emetteur strong { color: var(--accent, #2b4c8c); font-size: 13.5px; }
  /* Le numéro suit le libellé en texte normal (non coloré, non gras) — modèles
     de référence : seul le libellé « Facture N° : » est en bleu gras. */
  .doc-client { text-align: right; font-size: 13px; }
  .doc-client .label { font-weight: 700; }
  .doc-client .nom { font-weight: 700; color: var(--accent, #2b4c8c); font-size: 13.5px; }
  table.doc-lignes { border-collapse: collapse; width: 100%; margin-bottom: 0; position: relative; z-index: 1; }
  table.doc-lignes th { background: var(--accent, #2b4c8c); color: #fff; font-weight: 700; padding: 7px 8px; font-size: 11.5px; text-align: left; }
  table.doc-lignes th.num, table.doc-lignes td.num { text-align: right; }
  /* Fond opaque : un élément décoratif positionné derrière (z-index négatif) ne
     doit jamais transparaître à travers une cellule du tableau. */
  table.doc-lignes td { border: 1px solid #d9dde5; padding: 6px 8px; font-size: 11.5px; background: #fff; }
  .doc-corps { display: grid; grid-template-columns: 1fr 220px; position: relative; z-index: 1; }
  .doc-gauche { border: 1px solid #d9dde5; border-top: none; border-right: none; background: #fff; }
  .doc-lettres { padding: 7px 10px; font-size: 11px; font-weight: 700; text-align: center; border-bottom: 1px solid #d9dde5; }
  .doc-paiement { padding: 7px 10px; font-size: 11.5px; border-bottom: 1px solid #d9dde5; }
  /* Fond gris clair des lignes « montant en lettres » / « mode paiement » —
     Facture et Facture d'Avoir uniquement (modèles de référence fournis) ;
     Devis et Bon de Livraison gardent leur fond blanc d'origine. */
  .doc-ombre { background: #f4f5f7; }
  .doc-info { padding: 10px; font-size: 11px; line-height: 1.5; }
  .doc-info .prix { font-size: 13px; font-weight: 700; }
  .doc-droite table { width: 100%; border-collapse: collapse; }
  .doc-droite th { background: var(--accent, #2b4c8c); color: #fff; text-align: left; font-weight: 700; padding: 7px 10px; font-size: 11px; border: 1px solid #d9dde5; }
  .doc-droite td { text-align: right; padding: 7px 10px; font-size: 11.5px; border: 1px solid #d9dde5; background: #fff; }
  .doc-droite tr.total-ttc th, .doc-droite tr.total-ttc td { font-size: 13px; }
  .doc-signature { text-align: right; margin-top: 34px; padding-right: 6px; }
  .doc-signature img { height: 74px; }
  .doc-signature .label { font-size: 11px; color: #475569; }
  .doc-pied { position: absolute; left: 16mm; right: 16mm; bottom: 16mm; text-align: center; font-size: 9.5px; color: #475569; border-top: 2px solid var(--accent, #2b4c8c); padding-top: 8px; }
  .doc-vague { position: absolute; pointer-events: none; z-index: -1; }
`

const fmt = (n) => n.toFixed(1)

// Courbe lisse (Catmull-Rom → Bézier) passant par tous les points.
const courbe = (pts) => {
  let d = `M${fmt(pts[0][0])},${fmt(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${fmt(c1[0])},${fmt(c1[1])} ${fmt(c2[0])},${fmt(c2[1])} ${fmt(p2[0])},${fmt(p2[1])}`
  }
  return d
}

/**
 * Décor du modèle « Facture » : grand bloc bleu en haut à droite et masse bleue en
 * bas à gauche, chacun bordé d'une bande orange puis d'une fine bande grise,
 * plus des cercles. Les contours ont été relevés point par point sur le modèle de
 * référence (page A4 de 794 × 1123 px) puis lissés en courbes.
 */
function decorFacture() {
  const BLEU = '#4a6194'
  const ORANGE = '#fabb5a'
  const GRIS = '#e4e4e4'
  // Zone au-dessus de la courbe (coin haut-droit) / au-dessous (coin bas-gauche).
  const dessus = (pts) => {
    const [x0] = pts[0]
    const [, yN] = pts[pts.length - 1]
    return `${courbe(pts)} L900,${fmt(yN)} L900,-20 L${fmt(x0)},-20 Z`
  }
  const dessous = (pts, bas) => {
    const [, y0] = pts[0]
    const [xN] = pts[pts.length - 1]
    return `${courbe(pts)} L${fmt(xN)},${bas} L-20,${bas} L-20,${fmt(y0)} Z`
  }
  const haut = (pts) => pts.map(([x, y]) => [x * 0.5357 + 255.5, y * 0.5357])
  const bas = (pts) => pts.map(([x, y]) => [x * 0.5357 - 9.6, y * 0.5357 + 821])

  const bleuHaut = haut([[225, 0], [245, 70], [280, 115], [330, 128], [440, 125], [500, 95], [545, 66], [580, 68], [615, 120], [650, 215], [690, 275], [740, 290], [800, 282], [860, 262], [915, 280], [965, 335], [1010, 400]])
  const orangeHaut = haut([[185, 0], [205, 75], [240, 135], [290, 170], [350, 182], [420, 178], [480, 140], [525, 112], [560, 112], [585, 150], [610, 215], [625, 250], [648, 285], [700, 332], [760, 345], [820, 335], [870, 322], [920, 350], [970, 405], [1010, 458]])
  const grisHaut = haut([[150, 0], [185, 95], [228, 160], [285, 195], [350, 206], [420, 202], [480, 165], [523, 135], [560, 135], [592, 175], [618, 240], [640, 285], [665, 320], [705, 353], [765, 367], [825, 357], [875, 344], [925, 372], [975, 425], [1010, 478]])

  const bleuBas = bas([[18, 232], [60, 290], [110, 340], [170, 352], [250, 325], [300, 322], [340, 350], [370, 420], [400, 470], [440, 490], [520, 480], [580, 465], [630, 462], [670, 500], [685, 570]])
  const orangeBas = bas([[18, 163], [60, 230], [110, 290], [170, 305], [250, 290], [300, 278], [340, 290], [370, 350], [400, 420], [430, 455], [480, 468], [540, 452], [600, 420], [650, 418], [690, 450], [715, 570]])
  const grisBas = bas([[18, 142], [70, 210], [130, 275], [190, 298], [250, 270], [310, 258], [350, 275], [385, 340], [420, 420], [450, 455], [490, 465], [550, 440], [610, 415], [660, 405], [710, 420], [740, 500], [752, 570]])

  return `
      <svg class="doc-vague" style="left:0;top:0" width="794" height="300" viewBox="0 0 794 300">
        <path d="${dessus(grisHaut)}" fill="${GRIS}"/>
        <path d="${dessus(orangeHaut)}" fill="${ORANGE}"/>
        <path d="${dessus(bleuHaut)}" fill="${BLEU}"/>
        <circle cx="498" cy="127" r="25" fill="${ORANGE}"/>
        <circle cx="543" cy="202" r="12" fill="${ORANGE}"/>
        <circle cx="686" cy="221" r="40" fill="${BLEU}"/>
        <circle cx="600" cy="252" r="15" fill="${BLEU}"/>
      </svg>
      <svg class="doc-vague" style="left:0;bottom:0" width="420" height="240" viewBox="0 883 420 240">
        <path d="${dessous(grisBas, 1140)}" fill="${GRIS}"/>
        <path d="${dessous(orangeBas, 1140)}" fill="${ORANGE}"/>
        <path d="${dessous(bleuBas, 1140)}" fill="${BLEU}"/>
        <circle cx="92" cy="938" r="34" fill="${BLEU}"/>
        <circle cx="164" cy="912" r="12" fill="${BLEU}"/>
        <circle cx="214" cy="955" r="10" fill="${ORANGE}"/>
        <circle cx="251" cy="1020" r="21" fill="${ORANGE}"/>
      </svg>`
}

/**
 * Décor du modèle « Devis » : forme marine à angle arrondi en haut à gauche et
 * colline marine en bas à droite, chacune bordée d'un filet doré (relevé sur le
 * modèle de référence, page A4 de 794 × 1123 px).
 */
function decorDevis() {
  const MARINE = '#14435f'
  const bas = (pts) => pts.map(([x, y]) => [x * 0.2478 + 578.4, y * 0.2478 + 1012.6])
  const colline = bas([[-20, 455], [30, 440], [120, 395], [250, 310], [380, 235], [470, 180], [520, 152], [600, 145], [660, 160], [720, 205], [790, 290], [850, 370], [900, 420]])
  const cheminColline = `${courbe(colline)} L${fmt(colline[colline.length - 1][0])},1140 L${fmt(colline[0][0])},1140 Z`
  const coinHaut = 'M-12,-12 L236,-12 L105,63.8 C77,89 37,84 24,52 L-12,-14 Z'
  const filets = (d, fin) => `
        <path d="${d}" fill="none" stroke="#e7c46e" stroke-width="${fin ? 12 : 22}" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="#e0a521" stroke-width="${fin ? 9 : 17}" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="#d98f1f" stroke-width="${fin ? 4 : 7}" stroke-linejoin="round"/>
        <path d="${d}" fill="${MARINE}"/>`
  return `
      <svg class="doc-vague" style="left:0;top:0" width="260" height="130" viewBox="0 0 260 130">${filets(coinHaut, true)}
      </svg>
      <svg class="doc-vague" style="right:0;bottom:0" width="260" height="130" viewBox="534 993 260 130">${filets(cheminColline, false)}
      </svg>`
}

/**
 * Décor du modèle « Facture d'Avoir » : ruban torsadé or / bleu / gris le long du bord
 * droit (en haut) et du bord gauche (en bas), relevé sur le modèle de référence (page
 * A4 de 794 × 1123 px).
 */
function decorAvoir() {
  const OR = '#e5ab21'
  const BLEU = '#1074ad'
  const GRIS = '#b1b1b3'
  const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`
  return `
      <svg class="doc-vague" style="right:0;top:0" width="100" height="520" viewBox="694 0 100 520">
        ${poly([[794, 10], [706, 114], [706, 228], [794, 117]], OR)}
        ${poly([[749, 172], [794, 224], [794, 331], [706, 228]], BLEU)}
        ${poly([[735, 261], [794, 331], [794, 365], [735, 296]], GRIS)}
        ${poly([[794, 384], [758.5, 411], [758.5, 510], [794, 474]], OR)}
      </svg>
      <svg class="doc-vague" style="left:0;bottom:0" width="100" height="540" viewBox="0 583 100 540">
        ${poly([[0, 733], [54, 797], [54, 856.5], [0, 790.6]], GRIS)}
        ${poly([[0, 652.5], [33.7, 604.4], [33.7, 710.3], [0, 747.3]], OR)}
        ${poly([[0, 793], [84.2, 894.1], [40.9, 948], [0, 896.5]], BLEU)}
        ${poly([[84.2, 895], [84.2, 1004.7], [0, 1110], [0, 996], [40.9, 948]], OR)}
      </svg>`
}

// Mise en page commune aux modèles « Facture » et « Devis » (dimensions relevées sur
// les modèles de référence, page A4 = 794 × 1123 px) : marges 33px, titre 63px, logo
// 129 × 73px, tableau en colonnes proportionnelles, totaux alignés sur les colonnes
// TVA + Total TTC. Ce qui change d'un modèle à l'autre passe par des variables CSS.
const CSS_MODELE = `
  .doc-facture {
    --titre-haut: 9px; --titre-gauche: 0px; --logo-haut: 20px; --col-client: 331px;
    --meta-haut: 26px; --meta-bas: 4px; --client-haut: 30px; --client-max: 240px; --bordure: #8e8e8e;
    --ligne-basse: #fabb5a; --w-totaux: 31.5%; --h-ligne: 32px;
  }
  .doc-devis {
    --titre-haut: 13px; --titre-gauche: 354px; --logo-haut: 35px; --col-client: 472px;
    --meta-haut: 33px; --meta-bas: 1px; --client-haut: 5px; --client-max: 256px; --bordure: #f0c878;
    --ligne-basse: #f0c878; --w-totaux: 26.8%; --h-ligne: 31px; --info-haut: 22px;
  }
  .doc-avoir {
    --titre-haut: 29px; --titre-gauche: -2px; --titre-taille: 61px; --logo-haut: 53px;
    --col-client: 432px; --meta-haut: 1px; --meta-bas: 1px; --client-haut: 5px;
    --client-max: 296px; --bordure: #e8b94a; --ligne-basse: #1074ad; --w-totaux: 26.9%;
    --h-ligne: 31.5px; --info-haut: 23px;
  }
  .doc-bl {
    --titre-haut: 59px; --titre-gauche: -4px; --titre-taille: 62px; --logo-haut: 14px;
    --col-client: 533px; --meta-haut: 10px; --meta-bas: 1px; --client-haut: 4px;
    --client-max: 195px; --bordure: #8e8e8e; --ligne-basse: #2c679c; --w-totaux: 30.3%;
    --h-ligne: 31.5px; --info-haut: 32px;
  }
  .doc-page.doc-modele { padding: 0 33px 90px; }
  .doc-page.doc-devis { background: linear-gradient(#fdfdfd, #e1e1e1); }
  .doc-modele .doc-entete-vertical { margin: 0; padding-top: var(--titre-haut); }
  .doc-modele .doc-titre { font-size: var(--titre-taille, 63px); line-height: 1; margin: 0 0 0 var(--titre-gauche); letter-spacing: .01em; }
  /* Cadre 129 × 73 px à l'emplacement du modèle. Les fichiers logo enregistrés ont
     des marges blanches symétriques (le dessin n'occupe que ~55 % de l'image) : on
     zoome au centre pour que le logo visible fasse la taille du modèle. */
  .doc-modele .doc-logo-cadre { width: 129px; height: 73px; margin: var(--logo-haut) 0 0 -4px; overflow: hidden; }
  .doc-modele .doc-logo { display: block; width: 129px; height: 73px; object-fit: contain; transform: scale(1.75); transform-origin: center; }
  .doc-modele .doc-meta-ligne { display: grid; grid-template-columns: var(--col-client) 1fr; gap: 0; margin: var(--meta-haut) 0 var(--meta-bas); align-items: start; }
  .doc-modele .doc-emetteur { font-size: 15px; line-height: 25px; }
  .doc-modele .doc-emetteur strong { font-size: 15px; }
  .doc-modele .doc-numero { color: var(--accent); }
  .doc-modele .doc-client { text-align: left; max-width: var(--client-max); margin-top: var(--client-haut); font-size: 14px; line-height: 24px; }
  .doc-modele .doc-client .label { font-size: 13.5px; }
  .doc-modele .doc-client .nom { font-size: 16px; letter-spacing: .04em; }
  .doc-modele table.doc-lignes { table-layout: fixed; }
  .doc-modele table.doc-lignes th { height: 31px; padding: 0 4px; font-size: 12px; text-align: center; border: 1px solid var(--bordure); }
  .doc-modele table.doc-lignes td { height: 27px; padding: 0 5px; font-size: 11.5px; text-align: center; border: 1px solid var(--bordure); }
  .doc-modele table.doc-lignes td:first-child { text-align: left; }
  .doc-modele table.doc-lignes tbody tr:last-child td { border-bottom: 2px solid var(--ligne-basse); }
  .doc-modele .doc-corps { grid-template-columns: 1fr var(--w-totaux); }
  .doc-modele .doc-gauche { border: 0; background: transparent; }
  .doc-modele .doc-lettres { display: flex; align-items: center; justify-content: center; height: var(--h-ligne); padding: 0 8px; font-size: 11px; font-weight: 400; background: #e6e6e6; border: 1px solid var(--bordure); border-top: 0; }
  .doc-modele .doc-droite table { table-layout: fixed; }
  .doc-modele .doc-droite th { width: 56%; height: var(--h-ligne); padding: 0 4px; font-size: 12px; text-align: center; border: 1px solid var(--bordure); }
  .doc-modele .doc-droite td { padding: 0 4px; font-size: 11.5px; text-align: center; border: 1px solid var(--bordure); }
  .doc-modele .doc-droite tr:nth-child(odd) td { background: #e6e6e6; }
  .doc-modele .doc-droite tr.total-ttc th, .doc-modele .doc-droite tr.total-ttc td { font-size: 12px; }
  /* Signature : identique sur tous les modèles — sous le tableau des totaux, centrée,
     cachet de 72 px de haut au plus (il prend la place du texte « Signature »), proportions conservées. */
  .doc-modele .doc-signature { margin: 12px 0 0; padding: 0; text-align: center; }
  .doc-modele .doc-sig-label { font-size: 10px; font-weight: 400; line-height: 12px; color: #1a1a2e; }
  .doc-modele .doc-signature img { display: block; margin: 0 auto; width: auto; height: auto; max-width: 100%; max-height: 72px; object-fit: contain; }
  /* Facture / Devis avec cachet : le libellé « Signature » reste, le cachet s'affiche juste dessous. */
  .doc-modele .doc-signature-avec-libelle img { margin-top: 4px; max-height: 64px; }
  .doc-modele .doc-pied { padding-top: 0; border-top: 0; font-weight: 700; color: var(--accent); }

  /* Facture : « Mode paiement » et « Prix Restant » en deux cases, pied en bas à droite. */
  .doc-facture .doc-paiement-split { height: 32px; background: #fff; border: 1px solid var(--bordure); border-top: 0; }
  .doc-facture .doc-paiement-split span { display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 8px; font-size: 11px; border-right: 0; }
  .doc-facture .doc-paiement-split span:first-child { border-right: 1px solid var(--bordure); }
  .doc-facture .doc-pied { left: auto; right: 27px; bottom: 14px; width: 354px; font-size: 8.5px; line-height: 11px; }

  /* Devis : « Mode paiement » sur toute la largeur, bloc « Information », pied large. */
  .doc-devis .doc-paiement, .doc-bl .doc-paiement, .doc-avoir .doc-paiement { display: flex; align-items: center; justify-content: center; height: 30px; padding: 0 8px; font-size: 11px; background: #fff; border: 1px solid var(--bordure); border-top: 0; }
  .doc-devis .doc-info, .doc-bl .doc-info, .doc-avoir .doc-info { padding: var(--info-haut) 0 0 1px; font-size: 11.5px; line-height: 15.2px; }
  .doc-devis .doc-info strong, .doc-bl .doc-info strong, .doc-avoir .doc-info strong { font-size: 12px; }
  .doc-devis .doc-pied { left: 19px; right: auto; bottom: 23px; width: 574px; font-size: 9px; line-height: 12.5px; }

  /* Bon de Livraison : montant en lettres en gras, pied de page en bande bleue pleine. */
  .doc-bl .doc-lettres { font-weight: 700; }
  /* Facture d'Avoir : cachet sous le libellé « Signature », pied de page encadré de deux filets. */
  .doc-avoir .doc-pied { left: 139px; right: auto; bottom: 27px; width: 480px; padding: 3px 8px 5px; border-left: 1px solid #c8c8c8; border-right: 1px solid #c8c8c8; font-size: 8.5px; line-height: 12.4px; }
  .doc-bl .doc-pied { left: auto; right: 0; bottom: 0; width: 509px; height: 45px; padding: 0 22px; display: flex; align-items: center; justify-content: center; background: var(--accent); color: #fff; font-size: 8.7px; line-height: 12px; }
`

// Largeurs des 8 colonnes du tableau (relevées sur les modèles) ; TVA + Total TTC
// = largeur exacte du bloc des totaux (31,5 % Facture, 26,8 % Devis).
const colonnes = (largeurs) => `<colgroup>${largeurs.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
const COLGROUP_FACTURE = colonnes([15, 10.6, 7.4, 12.6, 10.3, 12.6, 17.7, 13.8])
const COLGROUP_DEVIS = colonnes([26.9, 10.5, 5.7, 10.7, 8.8, 10.6, 15.2, 11.6])
const COLGROUP_AVOIR = colonnes([26.7, 9.9, 6.4, 10.8, 8.4, 10.8, 15.2, 11.7])
const COLGROUP_BL = colonnes([19.0, 11.3, 6.2, 11.1, 10.9, 11.2, 17.0, 13.3])

// Accent + décor propres à chaque type, dans l'esprit des modèles fournis :
// Facture (bleu + cercles orange), Devis (marine + diagonale dorée), Bon de
// Livraison (bandeau marine sobre), Facture d'Avoir (bleu + ruban de chevrons
// bleu/or dans le coin supérieur droit — modèle de référence fourni par l'utilisateur).
const DECORS = {
  facture: {
    accent: '#4a6194',
    vagues: decorFacture(),
  },
  devis: {
    accent: '#14435f',
    vagues: decorDevis(),
  },
  bl: {
    accent: '#004a8b',
    // Bande bleue pleine en haut à gauche (509 × 48 px sur la page A4 de 794 px).
    vagues: '<svg class="doc-vague" style="left:0;top:0" width="509" height="48" viewBox="0 0 509 48"><rect width="509" height="48" fill="#004a8b"/></svg>',
  },
  avoir: {
    accent: '#1074ad',
    vagues: decorAvoir(),
  },
}

const TITRES = { facture: 'FACTURE', devis: 'DEVIS', bl: 'BON LIVRAISON', avoir: "FACTURE D'AVOIR" }
const NUM_LABELS = { facture: 'Facture', devis: 'DEVIS', bl: 'Bon Livraison', avoir: "Facture d'avoir" }

/** Bloc « Information : » (Devis/BL/Avoir) — reprend le champ `note` tel quel, une ligne par ligne saisie. */
function blocInformation(note) {
  if (!note) return ''
  const lignes = note.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lignes.length === 0) return ''
  return `<div class="doc-info"><strong>Information :</strong><br>${lignes.map((l) => escapeHtml(l)).join('<br>')}</div>`
}

function ligneHtml(l) {
  return `
    <tr>
      <td>${escapeHtml(l.designation)}</td>
      <td class="num">${dh(l.prixUnitaire)}</td>
      <td class="num">${l.quantite}</td>
      <td class="num">${dh(l.totalHt)}</td>
      <td class="num">${dh(l.totalHt - l.totalNetHt)}</td>
      <td class="num">${dh(l.totalNetHt)}</td>
      <td class="num">${dh(l.totalTva)} (${pct(l.tvaPourcent)})</td>
      <td class="num">${dh(l.totalTtc)}</td>
    </tr>`
}

/**
 * Bloc signature — UNE SEULE implémentation pour Facture, Devis, Bon de Livraison et
 * Facture d'Avoir (mêmes emplacement, mêmes taille, même comportement).
 * - Option « Ajouter Signature » cochée : le cachet des réglages de l'émetteur (Bureau de
 *   comptabilité / Centre) REMPLACE le texte « Signature ». Il est lu à chaque génération,
 *   donc toujours le cachet actuel, jamais une image écrite dans le code.
 * - Option décochée (ou cachet non configuré) : le texte « Signature » reste affiché.
 * - Facture et Devis : le texte « Signature » reste TOUJOURS affiché, le cachet s'y ajoute en dessous.
 * Le bloc est placé dans la colonne des totaux, donc toujours juste sous le tableau des
 * totaux, quelle que soit la hauteur du bloc « Information » à gauche.
 */
function signatureHtml(afficherSignature, identite, garderLibelle = false) {
  if (afficherSignature && identite.signature) {
    // Facture et Devis : la mention « Signature » reste TOUJOURS affichée sous le tableau, le cachet vient dessous.
    if (garderLibelle) {
      return `<div class="doc-signature doc-signature-avec-libelle"><div class="doc-sig-label">Signature</div><img src="${identite.signature}" alt="Signature" /></div>`
    }
    return `<div class="doc-signature"><img src="${identite.signature}" alt="Signature" /></div>`
  }
  return '<div class="doc-signature"><div class="doc-sig-label">Signature</div></div>'
}

/** Construit le HTML imprimable (pur, sans effet de bord) — sert à `imprimerDocumentCommercial` et à la prévisualisation. */
export function construireHtmlDocumentCommercial(type, d, identite) {
  const decor = DECORS[type] || DECORS.facture
  const titre = TITRES[type] || 'DOCUMENT'
  const numLabel = NUM_LABELS[type] || 'N°'
  const lignes = (d.lignes || []).map(ligneHtml).join('')
  const clientIdentifiant = d.tiersIce ? `ICE : ${escapeHtml(d.tiersIce)}` : d.tiersCin ? `CIN : ${escapeHtml(d.tiersCin)}` : ''

  // Facture et Facture d'Avoir : titre au-dessus du logo, fond gris clair sur
  // « montant en lettres »/« mode paiement » (modèles de référence fournis par
  // l'utilisateur) ; Devis/BL gardent leur gabarit d'origine, inchangé.
  const factureOuAvoir = type === 'avoir' || type === 'facture'
  const classeOmbre = factureOuAvoir ? ' doc-ombre' : ''
  const classeModele = type === 'facture' ? ' doc-modele doc-facture' : type === 'devis' ? ' doc-modele doc-devis' : type === 'bl' ? ' doc-modele doc-bl' : type === 'avoir' ? ' doc-modele doc-avoir' : ''
  const enteteHtml = factureOuAvoir || type === 'devis' || type === 'bl'
    ? `
      <div class="doc-entete-vertical">
        <h1 class="doc-titre">${titre}</h1>
        <div class="doc-logo-cadre"><img class="doc-logo" src="${identite.logo}" alt="${escapeHtml(identite.nomSociete)}" /></div>
      </div>`
    : `
      <div class="doc-entete">
        <img class="doc-logo" src="${identite.logo}" alt="${escapeHtml(identite.nomSociete)}" />
        <h1 class="doc-titre">${titre}</h1>
      </div>`

  const bodyHtml = `
    <div class="doc-page${classeModele}" style="--accent:${decor.accent}">
      ${decor.vagues}
      ${enteteHtml}
      <div class="doc-meta-ligne">
        <div class="doc-emetteur">
          <div><strong>${escapeHtml(d.responsable || identite.nomSociete)}</strong></div>
          <div><strong>${numLabel} N° :</strong> <span class="doc-numero">${escapeHtml(d.numero)}</span></div>
          <div>Date de Facturation : ${escapeHtml(formatDateFr(d.dateDocument))}</div>
          ${type === 'facture' && d.datePaiement ? `<div>Date de Paiement : ${escapeHtml(formatDateFr(d.datePaiement))}</div>` : ''}
        </div>
        <div class="doc-client">
          <div class="label">Information de Client :</div>
          <div class="nom">${escapeHtml(d.tiers || '')}</div>
          ${clientIdentifiant ? `<div>${clientIdentifiant}</div>` : ''}
        </div>
      </div>

      <table class="doc-lignes">
        ${type === 'facture' ? COLGROUP_FACTURE : type === 'devis' ? COLGROUP_DEVIS : type === 'bl' ? COLGROUP_BL : type === 'avoir' ? COLGROUP_AVOIR : ''}
        <thead><tr>
          <th>Désignation</th><th class="num">PU HT</th><th class="num">Qte</th><th class="num">Total HT</th>
          <th class="num">Remise</th><th class="num">Net HT</th><th class="num">TVA</th><th class="num">Total TTC</th>
        </tr></thead>
        <tbody>${lignes}</tbody>
      </table>

      <div class="doc-corps">
        <div class="doc-gauche">
          <div class="doc-lettres${classeOmbre}">${escapeHtml(montantEnLettres(d.totalTtc))}</div>
          ${type === 'facture'
            ? `<div class="doc-paiement-split"><span>Mode paiement : ${escapeHtml(d.modePaiement || '—')}</span><span>Prix Restant : ${dh(d.prixRestant)}</span></div>`
            : `<div class="doc-paiement${classeOmbre}">Mode paiement : ${escapeHtml(d.modePaiement || '—')}</div>`}
          ${blocInformation(d.note)}
        </div>
        <div class="doc-droite">
          <table>
            <tr><th>Total HT</th><td>${dh(d.totalHt)}</td></tr>
            <tr><th>Remise</th><td>${dh(d.totalRemise)}</td></tr>
            <tr><th>Total Net HT</th><td>${dh(d.totalNetHt)}</td></tr>
            <tr><th>Montant TVA</th><td>${dh(d.totalTva)}</td></tr>
            <tr class="total-ttc"><th>Total TTC</th><td>${dh(d.totalTtc)}</td></tr>
            ${type === 'facture' ? `<tr><th>Total Payé</th><td>${dh(d.prixPaye)}</td></tr>` : ''}
          </table>
          ${signatureHtml(d.signature, identite, type === 'facture' || type === 'devis')}
        </div>
      </div>

      ${identite.piedDePage ? `<div class="doc-pied">${escapeHtml(identite.piedDePage)}</div>` : ''}
    </div>
  `

  return { titre: `${titre} ${d.numero}`, bodyHtml, css: classeModele ? CSS_COMMUN + CSS_MODELE : CSS_COMMUN }
}

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

const arrondi2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const TVA_DOMICILIATION = 20

/**
 * Convertit une domiciliation en « facture » au format des documents commerciaux, pour
 * réutiliser EXACTEMENT le modèle de la Facture. Rien n'est enregistré : c'est uniquement
 * la présentation des champs de la domiciliation.
 * - une ligne « Domiciliation » : quantité = mois payés, total TTC = prix total ;
 * - HT / TVA (20 %) déduits du TTC, comme sur la facture de domiciliation de référence ;
 * - « Information » : période, mois payés/gratuits, centre — le contenu propre à la domiciliation ;
 * - payée si une date de paiement est renseignée.
 */
export function domiciliationEnFacture(d) {
  const totalTtc = arrondi2(d.prixTotal)
  const totalHt = arrondi2(totalTtc / (1 + TVA_DOMICILIATION / 100))
  const totalTva = arrondi2(totalTtc - totalHt)
  const mois = Number(d.moisPayee) > 0 ? Number(d.moisPayee) : 1
  const annee = String(d.dateFacture || '').slice(2, 4) || String(new Date().getFullYear()).slice(2)
  const periode = d.dateDepart || d.dateFin ? `Période : ${formatDateFr(d.dateDepart) || '—'} au ${formatDateFr(d.dateFin) || '—'}` : ''
  const note = [
    periode,
    d.centre ? `Centre de domiciliation : ${d.centre}` : '',
    d.moisPayee != null && d.moisPayee !== '' ? `Mois payés : ${d.moisPayee}` : '',
    Number(d.moisGratuits) > 0 ? `Mois gratuits : ${d.moisGratuits}` : '',
    d.numeroArchive ? `N° Archive : ${d.numeroArchive}` : '',
  ].filter(Boolean).join('\n')
  const paye = d.datePaiement ? totalTtc : 0
  return {
    emetteur: 'via_experts',
    numero: `DOM-${d.id}/${annee}`,
    dateDocument: d.dateFacture,
    datePaiement: d.datePaiement,
    tiers: d.denomination,
    tiersIce: d.ice,
    tiersCin: d.clientCin,
    modePaiement: d.modePaiement,
    lignes: [{
      designation: 'Domiciliation',
      prixUnitaire: arrondi2(totalHt / mois),
      quantite: mois,
      totalHt,
      totalNetHt: totalHt,
      totalTva,
      tvaPourcent: TVA_DOMICILIATION,
      totalTtc,
    }],
    totalHt,
    totalRemise: 0,
    totalNetHt: totalHt,
    totalTva,
    totalTtc,
    prixPaye: paye,
    prixRestant: arrondi2(totalTtc - paye),
    note,
    signature: !!d.signatureSurFacture,
  }
}

/** Facture de domiciliation : même modèle PDF que la Facture, avec le contenu de la domiciliation. */
export function imprimerFactureDomiciliationPdf(d) {
  return ouvrirPdfApresClic(async () => {
    const facture = domiciliationEnFacture(d)
    const identite = await chargerIdentitePdf(facture.emetteur)
    // Signature/cachet : celui de « Paramètres → Bureau de Comptabilité » (à défaut, celui du Centre
    // Domiciliation). Affiché sous le tableau des totaux si « Signature » est cochée, sinon le texte
    // « Signature » reste affiché (voir `signatureHtml`).
    if (facture.signature) {
      const bureau = await chargerIdentitePdf('bureau').catch(() => null)
      identite.signature = bureau?.signature || identite.signature
    }
    return construireHtmlDocumentCommercial('facture', facture, identite)
  })
}

/**
 * Imprime un document commercial (Facture / Devis / Bon Livraison / Facture
 * d'Avoir) — appelé avec le `type` de `DocumentList`, les données API du
 * document (`DocumentCommercialResource`) chargées avec ses lignes.
 */
export function imprimerDocumentCommercial(type, d) {
  return ouvrirPdfApresClic(async () => {
    const identite = await chargerIdentitePdf(d.emetteur, type === 'devis')
    return construireHtmlDocumentCommercial(type, d, identite)
  })
}

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
