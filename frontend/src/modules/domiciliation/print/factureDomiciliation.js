// Facture de domiciliation — module Domiciliation (impression).
// Extrait TEL QUEL de `utils/documentPrint.js` (migration Modular Monolith — Facturation, étape 15). Elle réutilise
// EXACTEMENT le modèle de la Facture du module Facturation (dépendance Domiciliation → Facturation, jamais l'inverse), via
// le point d'entrée public du module.

import { formatDateFr } from '../../../utils/print/commun.js'
import { chargerIdentitePdf } from '../../../utils/print/identite.js'
import { ouvrirPdfApresClic } from '../../../utils/print/ouvrirPdf.js'
import { construireHtmlDocumentCommercial } from '../../facturation/index.js'

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
