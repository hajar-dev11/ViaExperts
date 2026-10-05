// Contrat de domiciliation — reproduction du modèle PDF de référence (A4 portrait, 3 pages) :
// cadre à motif, logo et QR code (dynamique, voir `qrContratDataUrl`) en haut de la première page, Times New Roman 9,96 pt, texte justifié.
// Toutes les positions et tailles sont relevées sur le PDF modèle (points PDF → px × 4/3).
//
// Génération normale : seuls les éléments surlignés en jaune sur le modèle sont repris automatiquement
// (voir `contratParDefaut`) : société, ICE, civilité + représentant, CNI, adresse, durée, dates de début /
// fin, date du contrat. Tout le reste est du contenu FIXE, identique au modèle (`MODELE`).
// « Modifier » permet de corriger TOUT le texte (`contenu`) ; ces corrections ne servent QU'À ce contrat :
// rien n'est enregistré, les données d'origine restent intactes.

import { create as creerQr } from 'qrcode'
import { escapeHtml } from './exporters.js'
import { formatDateFr } from './print/commun.js'
import { ouvrirPdfApresClic } from './print/ouvrirPdf.js'

// ---------------------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------------------

const compacter = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()
const normaliser = (s) => compacter(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

/** Nombre entier (0 à 99) en lettres, en français : 12 → « douze », 24 → « vingt-quatre »… */
function enLettres(n) {
  if (n < 20) return UNITES[n]
  if (n >= 80) return n === 80 ? 'quatre-vingts' : `quatre-vingt-${enLettres(n - 80)}`
  const dizaine = Math.floor(n / 10)
  const unite = n % 10
  if (n >= 70) return `soixante-${n === 71 ? 'et-' : ''}${enLettres(n - 60)}`
  if (unite === 0) return DIZAINES[dizaine]
  return `${DIZAINES[dizaine]}${unite === 1 ? '-et-un' : `-${UNITES[unite]}`}`
}

/** Durée entre deux dates en mois, écrite comme sur le modèle : « (12) douze mois ». */
function dureeEnTexte(debut, fin) {
  const a = new Date(debut)
  const b = new Date(fin)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '(12) douze mois'
  const mois = Math.max(1, Math.round(((b.getFullYear() - a.getFullYear()) * 12) + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30))
  return `(${mois}) ${mois <= 99 ? enLettres(mois) : mois} mois`
}

/**
 * Valeurs initiales des champs jaunes du modèle.
 * @param d           domiciliation (API) : dénomination, ICE, client, CIN, adresse, dates
 * @param entreprise  fiche entreprise (API) : forme juridique
 */
export function contratParDefaut(d, { entreprise } = {}) {
  const forme = compacter(entreprise?.forme)
  const denomination = compacter(d.denomination)
  const aujourdhui = new Date()
  const jj = `${String(aujourdhui.getDate()).padStart(2, '0')}/${String(aujourdhui.getMonth() + 1).padStart(2, '0')}/${aujourdhui.getFullYear()}`

  return {
    societe: forme && !normaliser(denomination).includes(normaliser(forme)) ? `${denomination} ${forme}` : denomination,
    ice: compacter(d.ice),
    civilite: 'Mr',
    representant: compacter(d.client).toUpperCase(),
    cni: compacter(d.clientCin).toUpperCase(),
    adresse: compacter(d.clientAdresse).toUpperCase(),
    duree: dureeEnTexte(d.dateDepart, d.dateFin),
    dateDebut: formatDateFr(d.dateDepart),
    dateFin: formatDateFr(d.dateFin),
    // Date du jour (au moment où le document est ouvert pour génération) : jamais une ancienne date du dossier.
    dateFait: jj,
  }
}

// ---------------------------------------------------------------------------------------
// QR code — propre à chaque contrat : « Viaexperts-{CIN du client} » (aucun lien, aucun serveur)
// ---------------------------------------------------------------------------------------

/**
 * QR code du contrat, en image SVG (data URL), généré avec les paramètres du QR du modèle PDF :
 * mode octets, correction d'erreur L, masque 4, zone de silence de 1 module. Étiré dans le même
 * cadre que sur le modèle (voir `.c-qr`). Sans CIN : pas de QR (chaîne vide), le contrat reste valide.
 */
export function qrContratDataUrl(cin) {
  const code = compacter(cin)
  if (!code) return ''
  try {
    const { modules } = creerQr([{ data: `Viaexperts-${code}`, mode: 'byte' }], { errorCorrectionLevel: 'L', maskPattern: 4 })
    const n = modules.size
    let chemin = ''
    for (let r = 0; r < n; r += 1) {
      for (let k = 0; k < n; k += 1) if (modules.data[r * n + k]) chemin += `M${k + 1} ${r + 1}h1v1h-1z`
    }
    const taille = n + 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${taille} ${taille}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${taille}" height="${taille}" fill="#fff"/><path d="${chemin}" fill="#000"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    return '' // contenu trop long pour un QR : rien n'est affiché plutôt que de casser le PDF
  }
}

// ---------------------------------------------------------------------------------------
// Modèle — contenu fixe, paragraphe par paragraphe (m : espace au-dessus, en px, calé sur le PDF)
// ---------------------------------------------------------------------------------------

// <DATA>
const MODELE = {
  cadre: [[24,24,1.44,4.32,0],[24,24,4.32,1.44,0],[25.44,25.44,1.44,2.88,1],[25.44,25.44,2.88,1.44,1],[26.88,26.88,1.44,1.44,0],[26.88,26.88,1.44,1.44,0],[28.32,24,538.68,1.44,0],[28.32,25.44,538.68,1.44,1],[28.32,26.88,538.68,1.44,0],[569.88,24,1.44,4.32,0],[567,24,4.32,1.44,0],[568.44,25.44,1.44,2.88,1],[567,25.44,2.88,1.44,1],[567,26.88,1.44,1.44,0],[567,26.88,1.44,1.44,0],[24,28.32,1.44,785.28,0],[25.44,28.32,1.44,785.28,1],[26.88,28.32,1.44,785.28,0],[569.88,28.32,1.44,785.28,0],[568.44,28.32,1.44,785.28,1],[567,28.32,1.44,785.28,0],[24,813.6,1.44,4.32,0],[24,816.48,4.32,1.44,0],[25.44,813.6,1.44,2.88,1],[25.44,815.04,2.88,1.44,1],[26.88,813.6,1.44,1.44,0],[26.88,813.6,1.44,1.44,0],[28.32,816.48,538.68,1.44,0],[28.32,815.04,538.68,1.44,1],[28.32,813.6,538.68,1.44,0],[569.88,813.6,1.44,4.32,0],[567,816.48,4.32,1.44,0],[568.44,813.6,1.44,2.88,1],[567,815.04,2.88,1.44,1],[567,813.6,1.44,1.44,0],[567,813.6,1.44,1.44,0]],
  pages: [
    {
      paras: [
        {"m":168.32,"c":"","h":"<span class=\"c-l c-f\"><b><u>ENTRE LES CONTRACTANTES</u></b> :</span>"},
        {"m":0,"c":"c-c","h":"<span class=\"c-l c-f\">« <b><u>DOMICILIATAIRE</u></b> »</span>"},
        {"m":15.36,"c":"","h":"<span class=\"c-l c-j c-f\">Nom de la société : <b>VIA EXPERTS Sarl AU</b>, numéro de l’identifiant commun de l’entreprise 003478047000080, inscrite sur</span><span class=\"c-l c-j\">le registre de commerce sous n° 619971 au Tribunal de Commerce de Casablanca, dont le siège social est sis à Bd 30 Juillet,</span><span class=\"c-l\">Résidence les champs du Printemps GH 1 Immeuble F 5eme etage n°15 Sidi Moumen Casablanca,</span>"},
        {"m":-0.17,"c":"","h":"<span class=\"c-l c-f\">Représentée par Mr <b>MORAD BENDEQ</b>, en sa qualité de gérant et représentant légale de la société.</span>"},
        {"m":15.36,"c":"c-c","h":"<span class=\"c-l c-f\">« <b><u>DOMICILIE</u></b> »</span>"},
        {"m":15.36,"c":"","h":"<span class=\"c-l c-f\">La société domiciliée :</span>"},
        {"m":1.6,"c":"c-nat","h":"Nom de la société {{societe}}, numéro de l’identifiant commun de l’entreprise {{ice}}"},
        {"m":2.56,"c":"c-nat","h":"Représentée par {{civilite}} {{representant}}<b class=\"c-v\">,</b> titulaire de la CNI n° {{cni}} demeurant {{adresse}}"},
        {"m":1.75,"c":"","h":"<span class=\"c-l c-f\">En sa qualité de gérant et représentant légale de la société</span>"},
        {"m":15.68,"c":"","h":"<span class=\"c-l c-f\"><b><u>IL A ETE CONVENU SUR CE QUI SUIT :</u></b></span>"},
        {"m":15.2,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 1 : OBJET</u></b></span>"},
        {"m":1.28,"c":"c-nat","h":"Le présent contrat a pour objet la domiciliation du siège de la personne domiciliée {{societe}} en application des dispositions de l’article 544-2 de la loi n° 15.95 portant code du commerce."},
        {"m":15.51,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 2 : SERVICES</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-j c-f\">Le domiciliataire s’engage à permettre à la personne domiciliée, citée à l’article premier ci-dessus, de bénéficier des services</span><span class=\"c-l\">suivants :</span>"},
        {"m":-0.01,"c":"","h":"<span class=\"c-l c-f\">1- Utiliser l’adresse du domiciliataire comme adresse du siège social de la personne domiciliée.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">2- Mettre à sa disposition un local ou des locaux équipés des moyens de communication destinés aux bureaux.</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-j c-f\">3- Des locaux destinés à tenir les registres et les documents prévus par les textes législatives en vigueur et à les conserver et les</span><span class=\"c-l\">examiner et l’engagement de les mettre à jour.</span>"},
        {"m":-0.01,"c":"","h":"<span class=\"c-l c-f\">4- Se faire remettre, conserver et réexpédier le courrier journalier.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">Et autres services convenus, en les définissants avec précision.</span>"},
        {"m":15.68,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 3 : ENGAGEMENT</u></b></span>"},
        {"m":-0.48,"c":"","h":"<span class=\"c-l c-f\">1. <b><u>Engagements de la personne morale domiciliataire</u></b> :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">Durant toute la durée du contrat, le domiciliataire est tenu de se conformer aux engagements suivants :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">1/Constituer un dossier pour chaque personne domiciliée, contenant les pièces<span class=\"c-ws\"> justificatives concernant les personnes</span></span><span class=\"c-l c-j\">physiques, leurs adresses personnelles, les numéros de leurs téléphones, les numéros de leurs pièces d’identité, ainsi que leurs</span><span class=\"c-l c-j\">adresses email et en ce qui concerne les personnes morales : les pièces établissant les adresses de leurs gérants, les numéros de</span><span class=\"c-l c-j\">leurs téléphones et leurs cartes d’identités, ainsi que leurs adresses email, comprenant également des documents concernant</span><span class=\"c-l c-j\">tous les locaux de l’activité des entreprises domiciliées, le lieu de conservation des documents comptables à défaut de</span><span class=\"c-l\">conservation chez le domiciliataire.</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-j c-f\">2/S’assurer que le domicilié est inscrit sur le registre de commerce dans un délai de trois mois de la date de signature du contrat</span><span class=\"c-l\">de domiciliation, lorsque cette inscription est obligatoire en vertu des textes législatives en vigueur.</span>"},
        {"m":-0.02,"c":"","h":"<span class=\"c-l c-j c-f\">3/Communiquer aux services des impôts, la trésorerie générale du royaume et, le cas échéant, l’administration des douanes, la</span><span class=\"c-l\">liste des personnes domiciliées durant l’année précédente et ce, avant le 31 janvier de chaque année.</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-j c-f\">4/Informer le greffier près le Tribunal compétent, les services des impôts, la trésorerie générale du royaume et, le cas échéant,</span><span class=\"c-l c-j\">l’administration des douanes, de l’expiration de la durée du contrat de domiciliation ou sa résiliation anticipée et ce, dans un</span><span class=\"c-l\">délai d’un mois de la date de suspension du contrat.</span>"},
        {"m":-0.01,"c":"","h":"<span class=\"c-l c-j c-f\">5/Transmettre aux huissiers de justice et services de recouvrement des créances publiques, titulaires d’un titre exécutoire, les</span><span class=\"c-l\">informations leur permettant d’entrer en contacte avec la personne domiciliée.</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-f\">6/Veiller au respect de la confidentialité des renseignements et données concernant le domicilié.</span>"},
      ],
    },
    {
      paras: [
        {"m":47.2,"c":"","h":"<span class=\"c-l c-j c-f\">7/Aviser les services des impôts, la trésorerie générale du royaume et, le cas échéant, l’administration des douanes, dans un</span><span class=\"c-l c-j\">délai maximum de quinze (15) jours de la date de sa réception des lettres recommandées envoyées par les services des impôts</span><span class=\"c-l\">aux personnes domiciliées, faute de possibilité de les remettre à elles.</span>"},
        {"m":-0.01,"c":"","h":"<span class=\"c-l c-j c-f\">8/Assumer la responsabilité solidaire dans le paiement des impôts et des taxes relatives à l’activité exercée par le domicilié,</span><span class=\"c-l\">conformément aux dispositions du dernier alinéa de l’article 544-4 de la loi n° 15.95 formant code de commerce.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">9/Pour exercer l’activité de domiciliation, le domiciliataire devra remplir les conditions suivantes :</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-j c-f\">Justifier la propriété des locaux mis à la disposition de la personne domiciliée ou disposer de contrats de bail de ces locaux</span><span class=\"c-l c-j\">commerciaux qui ne font pas objet de saisie. Si les locaux précités font l’objet d’hypothèque, indiquer cela dans le contrat de</span><span class=\"c-l\">domiciliation.</span>"},
        {"m":15.35,"c":"","h":"<span class=\"c-l c-f\">2. <b><u>Engagements de la personne physique ou morale domiciliée</u></b> :</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-f\">La personne domiciliée est tenue, durant la durée du contrat, de se conformer aux engagements suivants :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">1/Utilisation effective et exclusive des locaux comme siège des entreprises ou sociétés ou, si le siège se trouve à l’étranger,</span><span class=\"c-l\">comme agence, succursale, représentation ou établissement filial, quelle que soit sa nature.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">2/Déclarer au domiciliataire, s’il s’agit d’une personne physique, tout changement dans son adresse personnelle et son activité,</span><span class=\"c-l c-j\">et s’il s’agit de personne morale, déclarer tout changement dans sa forme juridique, sa dénomination et son objet, ainsi que les</span><span class=\"c-l c-j\">noms et les adresses des gérants et des personnes disposants de pouvoirs de la part du domicilié pour conclure en son nom avec</span><span class=\"c-l\">le domiciliataire et lui remettre les documents y afférents.</span>"},
        {"m":-0.17,"c":"","h":"<span class=\"c-l c-j c-f\">3/ Informer le greffier près le Tribunal compétent, les services des impôts, la trésorerie générale du royaume et, le cas échéant,</span><span class=\"c-l c-j\">l’administration des douanes, de la suspension de la domiciliation dans un délai d’un mois de la date d’expiration de la durée</span><span class=\"c-l\">du contrat ou sa résiliation anticipée.</span>"},
        {"m":-0.01,"c":"","h":"<span class=\"c-l c-j c-f\">4/Indiquer sa qualité de domicilié chez le domiciliataire dans toutes ses factures, correspondances, bons de commande,</span><span class=\"c-l\">circulaires, publications et tous les documents commerciaux destinés à des tiers.</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-f\">5/Donner procuration consentie par le domiciliataire pour se faire remettre toutes les notifications en son nom.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">6/Remettre au domiciliataire tous les registres et documents prévus par les textes législatives et réglementaires en vigueur et</span><span class=\"c-l\">nécessaires en vue d’exécuter ses engagements.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">7/informer le domiciliataire, dans un délai de dix (10) jours de la date de changement du lieu ou des lieux de stockage des</span><span class=\"c-l\">marchandises importées ou destinées à l’exportation.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">8/Informer le domiciliataire de tout litige éventuel ou affaire à la quelle l’entreprise est partie au sujet de son activité</span><span class=\"c-l\">commerciale.</span>"},
        {"m":-0.17,"c":"","h":"<span class=\"c-l c-j c-f\">9/Informer le domiciliataire, via un huissier de justice, en ce concerne la personne physique, de la vente du registre de</span><span class=\"c-l c-j\">commerce, et en ce qui concerne la personne morale, de la cession, de la vente ou de la donation des actions de la société</span><span class=\"c-l c-j\">domiciliée, 15 jours auparavant avant de procéder à cette opération et d’obtenir le consentement écrit et cacheté du</span><span class=\"c-l c-j\">domiciliataire pour effectuer cette opération. Après l’obtention de l’accord du domiciliataire, l’ex domicilié devra résilier le</span><span class=\"c-l\">contrat de domiciliation.</span>"},
        {"m":15.19,"c":"","h":"<span class=\"c-l c-f\">3. <b><u>Dossier de domiciliation</u></b> :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">La personne domiciliée déposera chez le domiciliataire un dossier de domiciliation constitué des pièces suivantes :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">1- Une copie d’une pièce d’identité du représentant légal de l’entreprise domiciliée,</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">2- Une copie d’un document établissant la domiciliation du représentant légal de l’entreprise domiciliée,</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-f\">3- Relevé de compte bancaire ou chèque,</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">4- Numéro de téléphone du représentant légal de l’entreprise domiciliée,</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">5- Adresse de réexpédition du courrier,</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">6- Copie des statuts,</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">La personne domiciliée s’engage à aviser les services fiscaux, la trésorerie générale du royaume et, le cas échéant,</span><span class=\"c-l c-j\">l’administration des douanes, de tout changement affectant une des pièces du dossier et ce, dans un délai de 15 jours de la date</span><span class=\"c-l\">où il eu connaissance de ce changement, ainsi que du lieu de stockage de la marchandise importée ou destinée à l’exportation.</span>"},
        {"m":15.51,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 4 : DUREE DU CONTRAT</u></b></span>"},
        {"m":-0.32,"c":"c-nat","h":"Le contrat de domiciliation est conclu pour une durée de {{duree}}, qui commence à courir le {{dateDebut}} Et prendra fin le {{dateFin}}"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">A l’expiration de la durée de domiciliation ou sa résiliation anticipée, le domiciliataire et le domicilié, conformément aux</span><span class=\"c-l c-j\">paragraphes 1 et 2 de l’article 3 ci-dessus, s’engagent à informer le greffier près le Tribunal compétent, les services des impôts,</span><span class=\"c-l c-j\">la trésorerie générale du royaume et, le cas échéant, l’administration des douanes, de l’arrêt de la domiciliation dans un délai</span><span class=\"c-l\">d’un mois de la date d’interruption du contrat.</span>"},
        {"m":-0.17,"c":"","h":"<span class=\"c-l c-j c-f\">Dans ce cas, le contrat de domiciliation ne sera pas renouvelé et le domicilié devra transférer le siège social de l’entreprise</span><span class=\"c-l\">domiciliée.</span>"},
        {"m":-0.17,"c":"","h":"<span class=\"c-l c-f\">Le contrat de domiciliation est annulé sans indemnité et le domicilié avisé par e-mail dans les cas suivants :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">- Défaut de présentation des documents complets du dossier de domiciliation dans un délai de 3 mois de la date de signature du</span><span class=\"c-l\">contrat,</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">- Changement de la dénomination ou l’identifiant commun de l’entreprise, ou les deux avant la constitution définitive de</span><span class=\"c-l\">l’entreprise,</span>"},
      ],
    },
    {
      paras: [
        {"m":47.2,"c":"","h":"<span class=\"c-l c-j c-f\"><span class=\"c-dash\">-</span>Si l’entreprise n’est pas inscrite sur le registre de commerce dans un délai maximum de 3 mois après la conclusion du</span><span class=\"c-l\">contrat.</span>"},
        {"m":15.67,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 5 : LOYER</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-j c-f\">Le contrat de domiciliation est conclu moyennant un loyer mensuel de 125 (cent vingt-cinq) dirhams toutes taxes comprises,</span><span class=\"c-l c-j\">dont le total, soit la somme de 1500 (mille cinq cents) dirhams, est payable annuellement en contrepartie de la domiciliation</span><span class=\"c-l\">avec les services cités à l’article 2 ci-dessus concernant :</span>"},
        {"m":-0.17,"c":"","h":"<span class=\"c-l c-f\">- L’utilisation de l’adresse du domiciliataire comme adresse du siège social de la personne domiciliée</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">- La réception du courrier journalier, notification du domicilié à travers son email chaque semaine et l’archivage du courrier</span><span class=\"c-l\">reçu pendant 30 jours uniquement.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">Au cas où le domicilié désirerait recevoir son courrier, il devra nous informer deux jours auparavant.</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-f\">Qu’en ce concerne les services mentionnés dans l’article 2 ci-dessus, relatifs à :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">- La mise à sa disposition d’un local ou des locaux équipés de moyens de communication destinés aux bureaux.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">- Des locaux destinés à tenir les registres et les documents prévus par les textes législatives en vigueur et à les conserver et les</span><span class=\"c-l\">examiner et l’engagement de les mettre à jour.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">Qu’en ce concerne les services mentionnés dans l’article 2 ci-dessus, relatifs à :</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">- La réexpédition du courrier journalier</span>"},
        {"m":-0.16,"c":"","h":"<span class=\"c-l c-f\">- l’archivage du courrier pendant plus de 30 jours</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-j c-f\">Ils sont fournis moyennant un loyer mensuel ou annuel dont le montant est convenu avec le domicilié et ce, dans le cas où ces</span><span class=\"c-l\">services sont requis par le domicilié.</span>"},
        {"m":0.32,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 6 : RESILIATION</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-f\">Le présent contrat pourra être résilié dans les cas suivants :</span>"},
        {"m":0,"c":"c-puce1","h":"<span class=\"c-l c-j c-f\"><span class=\"c-puce\">✓</span>Suite à la demande écrite et légalisée par le domicilié, adressée au domiciliataire avec accusé de réception un mois</span><span class=\"c-l c-j\">avant la date effective de la résiliation ; dans ce cas, le domicilié paiera au domiciliataire la somme de mille cinq</span><span class=\"c-l\">cents dirhams.</span>"},
        {"m":-0.17,"c":"c-puce1","h":"<span class=\"c-l c-j c-f\"><span class=\"c-puce\">✓</span>Par lettre envoyée par le domiciliataire au domicilié, avec accusé de réception, un mois avant la date effective de la</span><span class=\"c-l\">résiliation en démontrant la cause.</span>"},
        {"m":-0.01,"c":"","h":"<span class=\"c-l c-f\">Lors de la résiliation anticipée aucun dédommagement ne sera accordé.</span>"},
        {"m":0,"c":"","h":"<span class=\"c-l c-f\">Le contrat de résiliation est résilié automatiquement dans les cas suivants :</span>"},
        {"m":-0.16,"c":"c-puce2","h":"<span class=\"c-l c-f\"><span class=\"c-puce\">✓</span>Non-paiement du prix de renouvellement du contrat,</span>"},
        {"m":0,"c":"c-puce2","h":"<span class=\"c-l c-f\"><span class=\"c-puce\">✓</span>Défaut d’informer le domiciliataire de cession, vente ou donation des actions de la société domiciliée,</span>"},
        {"m":0,"c":"c-puce2","h":"<span class=\"c-l c-f\"><span class=\"c-puce\">✓</span>Non-respect du paragraphe 2 de l’article 3.</span>"},
        {"m":0.32,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 7 : ADOPTION DE L'E-MAIL COMME MOYEN DE NOTIFICATION OFFICIEL</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-j c-f\">Les parties conviennent d'adopter le courrier électronique (E-mail) comme moyen officiel et légal pour l'échange de toutes les</span><span class=\"c-l c-j\">correspondances, notifications, et transactions administratives et financières. Les messages envoyés par e-mail sont considérés</span><span class=\"c-l c-j\">comme une preuve légale contraignante pour les deux parties et produisent tous les effets juridiques qui en découlent. Chaque</span><span class=\"c-l\">partie s'engage à informer l'autre en cas de changement de son adresse électronique.</span>"},
        {"m":0.15,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 8 : PÉNALITÉ DE RETARD DE PAIEMENT</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-j c-f\">En cas de retard de la part de la personne domiciliée dans le paiement de la redevance annuelle de domiciliation convenue à</span><span class=\"c-l c-j\">l'article 5 (1500 dirhams) à l'échéance fixée, cela entraînera automatiquement l'application d'une pénalité de retard. Le montant</span><span class=\"c-l c-j\">de cette pénalité est égal au prix de la domiciliation annuelle multiplié par trois, soit un montant total de pénalité de 4500</span><span class=\"c-l c-j\">dirhams. Ce montant reste dû à titre de dédommagement conventionnel et n'exonère pas le débiteur du paiement du principal</span><span class=\"c-l\">de la dette, ni des conséquences de la résiliation du contrat prévues à l'article 6</span>"},
        {"m":0.15,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 9 : COMPETENSE DES JURIDICTIONS</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-j c-f\">Tout litige pouvant survenir entre les parties lors de l’exécution du contrat est soumis au tribunal compétent du siège du</span><span class=\"c-l\">domiciliataire.</span>"},
        {"m":0.16,"c":"","h":"<span class=\"c-l c-f\"><b><u>ARTICLE 10 : ELECTION DE DOMICILE</u></b></span>"},
        {"m":-0.32,"c":"","h":"<span class=\"c-l c-f\">Les parties élient domicile au siège de la société domiciliataire.</span>"},
        {"m":15.36,"c":"","h":"<span class=\"c-l c-f\">Fait à Casablanca, le {{dateFait}}</span>"},
        {"m":15.36,"c":"c-sig","h":"<span class=\"c-col a1\">Signature du domiciliataire</span><span class=\"c-col b1\">Signature de la personne domiciliée</span>"},
        {"m":1.45,"c":"c-sig","h":"<span class=\"c-col a1\"><b>VIA EXPERTS Sarl AU</b></span><span class=\"c-col b2\">{{societe}}</span>"},
        {"m":1.29,"c":"c-sig","h":"<span class=\"c-col a3\">Mr MORAD BENDEQ</span><span class=\"c-col b3\">{{civilite}} {{representant}}</span>"},
      ],
    },
  ],
}
// </DATA>

// Style de chaque champ jaune : 11,04 pt gras (données de la société), 11,04 pt normal (civilité), 9,96 pt (le reste).
const STYLE_CHAMP = { societe: 'c-v', ice: 'c-v', representant: 'c-v', cni: 'c-v', adresse: 'c-v', civilite: 'c-v0' }

// ---------------------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------------------

function cadreSvg() {
  const rects = MODELE.cadre
    .map(([x, y, w, h, blanc]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${blanc ? '#fff' : '#000'}"/>`)
    .join('')
  return `<svg class="c-cadre" viewBox="0 0 595.276 841.89" width="794" height="1123" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
}

const CSS_CONTRAT = `
  .c-doc, .c-doc * { box-sizing: border-box; }
  .c-doc { position: relative; width: 794px; background: #fff; color: #000;
    font-family: 'Times New Roman', Times, 'Liberation Serif', serif; font-size: 13.28px; line-height: 15.36px; text-rendering: geometricPrecision; font-kerning: none; }
  .c-page { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fff; }
  .c-cadre { position: absolute; left: 0; top: 0; width: 794px; height: 1123px; z-index: 2; pointer-events: none; }
  .c-logo { position: absolute; left: 14.6px; top: 32.9px; width: 177.4px; height: 100.4px; object-fit: fill; z-index: 0; }
  .c-qr { position: absolute; left: 626.24px; top: 47.36px; width: 110.72px; height: 72.96px; object-fit: fill; z-index: 0; }
  .c-titre, .c-sous { position: absolute; margin: 0; font-size: 24px; font-weight: 700; line-height: 24px; white-space: nowrap; z-index: 1; }
  .c-titre { left: 226.733px; top: 71.53px; }
  .c-sous { left: 326.093px; top: 116.65px; }
  .c-corps { position: absolute; left: 56.8px; top: 0; width: 680.27px; z-index: 1; }
  .c-corps p { margin: 0; }
  .c-l { display: block; white-space: nowrap; text-align: left; }
  .c-j { text-align-last: justify; }
  .c-ws { word-spacing: 13.87px; }
  .c-c .c-l { text-align: center; }
  .c-corps p.c-nat { text-align: justify; }
  .c-doc u { text-decoration-thickness: 1.28px; text-underline-offset: 1.5px; }
  .c-v { font-size: 14.72px; font-weight: 700; line-height: 0; }
  .c-v0 { font-size: 14.72px; line-height: 0; }
  .c-puce { display: inline-block; line-height: 0; font-family: 'Segoe UI Symbol', 'Wingdings', sans-serif; }
  .c-dash { display: inline-block; width: 14.88px; }
  .c-corps p.c-puce1 { margin-left: 51.52px; }
  .c-puce1 .c-f { margin-left: -24px; }
  .c-puce1 .c-puce { width: 19.68px; }
  .c-corps p.c-puce2 { margin-left: 37.76px; }
  .c-puce2 .c-puce { width: 24px; }
  .c-sig { position: relative; height: 15.36px; text-align: left !important; white-space: nowrap; }
  .c-col { position: absolute; top: 0; }
  .c-col.a1 { left: 83.52px; } .c-col.a3 { left: 73.44px; }
  /* Bloc « Signature de la personne domiciliée » : les 3 lignes sont centrées sur le même axe (celui du libellé du modèle). */
  .c-col.b1, .c-col.b2, .c-col.b3 { left: 339.5px; width: 340px; text-align: center; }
  .c-num { position: absolute; left: 393.28px; top: 1007.85px; width: 12px; font-family: Calibri, Carlito, sans-serif; font-size: 14.72px; line-height: 18px; z-index: 1; }
  .c-cachet { position: absolute; left: 99px; top: 884px; width: 220px; text-align: center; z-index: 1; pointer-events: none; }
  .c-cachet img { display: inline-block; max-height: 90px; max-width: 200px; width: auto; height: auto; object-fit: contain; }
  /* Mode édition (type document) : tout le texte est modifiable ; le jaune rappelle les données reprises
     automatiquement de la domiciliation (champs jaunes du modèle). Jamais présent dans l'aperçu ni le PDF. */
  .c-edit [data-champ] { background: #fff066; }
  .c-edit [contenteditable] { outline: none; cursor: text; }
  .c-edit .c-corps:hover, .c-edit .c-titre:hover, .c-edit .c-sous:hover { box-shadow: 0 0 0 1px rgba(184, 163, 0, 0.45); }
  .c-edit .c-corps:focus, .c-edit .c-titre:focus, .c-edit .c-sous:focus { box-shadow: 0 0 0 2px #b8a300; }
`

/**
 * Relit le contenu modifié dans la version éditable (document de l'iframe d'édition) : titres et corps des 3
 * pages, débarrassés des attributs d'édition et des styles que le navigateur ajoute en tapant (seul l'espace
 * entre paragraphes du modèle est conservé).
 */
export function lireContenuContrat(doc) {
  const nettoyer = (el) => {
    const copie = el.cloneNode(true)
    ;[copie, ...copie.querySelectorAll('*')].forEach((n) => {
      n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck')
      const marge = n.tagName === 'P' ? n.style.marginTop : ''
      n.removeAttribute('style')
      if (marge) n.style.marginTop = marge
    })
    copie.querySelectorAll('font').forEach((f) => f.replaceWith(...f.childNodes))
    return copie.innerHTML
  }
  return {
    titre: nettoyer(doc.querySelector('.c-titre')),
    sous: nettoyer(doc.querySelector('.c-sous')),
    corps: [...doc.querySelectorAll('.c-corps')].map(nettoyer),
  }
}

/** HTML + CSS du contrat (pur, sans effet de bord) — sert à l'aperçu ET au PDF. */
export function construireHtmlContrat(v, identite, { edition = false, contenu = null, signature = null } = {}) {
  const e = (x) => escapeHtml(x ?? '')
  const champ = (cle) => `<span class="${STYLE_CHAMP[cle] || ''}" data-champ="${cle}">${e(v[cle])}</span>`
  const remplir = (h) => h.replace(/\{\{(\w+)\}\}/g, (_, cle) => champ(cle))
  const modifiable = edition ? ' contenteditable="true" spellcheck="false"' : ''
  const qr = qrContratDataUrl(v.cni)

  const corpsGenere = MODELE.pages.map((page) => page.paras
    .map((p) => `<p${p.c ? ` class="${p.c}"` : ''}${p.m ? ` style="margin-top:${p.m}px"` : ''}>${remplir(p.h)}</p>`)
    .join(''))

  const feuille = (n, premiere, derniere) => `
    <section class="c-page">
      ${premiere ? `<img class="c-logo" src="${identite.logo}" alt="${e(identite.nomSociete)}" />
      ${qr ? `<img class="c-qr" src="${qr}" alt="QR code" />` : ''}
      <h1 class="c-titre"${modifiable}>${contenu?.titre ?? '<u>CONTRAT DE DOMICILIATION</u>'}</h1>
      <h2 class="c-sous"${modifiable}>${contenu?.sous ?? '<u>Renouvellement</u>'}</h2>` : ''}
      <div class="c-corps"${modifiable}>${contenu?.corps?.[n] ?? corpsGenere[n]}</div>
      ${derniere && signature ? `<div class="c-cachet"><img src="${signature}" alt="Signature et cachet" /></div>` : ''}
      <div class="c-num">${n + 1}</div>
      ${cadreSvg()}
    </section>`

  const bodyHtml = `<div class="doc-page c-doc${edition ? ' c-edit' : ''}">${[0, 1, 2].map((n) => feuille(n, n === 0, n === 2)).join('')}</div>`
  return { titre: `CONTRAT DE DOMICILIATION ${v.societe}`.trim(), bodyHtml, css: CSS_CONTRAT }
}

/** Ouvre le contrat en vrai PDF (A4, 3 pages) dans le lecteur du navigateur — à appeler depuis un clic. */
export function imprimerContratPdf(v, identite, { contenu = null, signature = null } = {}) {
  return ouvrirPdfApresClic(async () => construireHtmlContrat(v, identite, { contenu, signature }))
}
