// Modèles imprimables des documents commerciaux (Facture / Devis / Bon Livraison / Facture d'Avoir) : styles,
// décors, tableau de lignes, bloc récapitulatif, signature/cachet, pied de page. Module FACTURATION.
// Extrait tel quel de documentPrint.js (le HTML produit est strictement identique).

import { escapeHtml } from '../../../utils/exporters.js'
import { montantEnLettres } from '../../../utils/montantEnLettres.js'
import { dh, pct, formatDateFr } from '../../../utils/print/commun.js'
import { chargerIdentitePdf } from '../../../utils/print/identite.js'
import { ouvrirPdfApresClic } from '../../../utils/print/ouvrirPdf.js'

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
