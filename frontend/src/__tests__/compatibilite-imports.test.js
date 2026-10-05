// Garde-fous de compatibilité pendant la migration Modular Monolith (Facturation — étape 1) :
// les fichiers découpés ou déplacés doivent continuer d'exposer EXACTEMENT les mêmes noms qu'avant, afin que
// tous les imports existants de l'application restent valides.

import { describe, expect, it } from 'vitest'
import * as documentPrint from '../utils/documentPrint.js'
import * as apiFacturation from '../api/facturation.js'
import * as constantes from '../shared/constants/documents.js'
import * as commun from '../utils/print/commun.js'
import * as identite from '../utils/print/identite.js'
import * as ouvrirPdf from '../utils/print/ouvrirPdf.js'
import * as documentCommercial from '../utils/print/documentCommercial.js'

describe('documentPrint.js : API publique inchangée', () => {
  it('expose exactement les mêmes fonctions qu\'avant le découpage', () => {
    expect(Object.keys(documentPrint).sort()).toEqual([
      'chargerIdentite',
      'chargerIdentitePdf',
      'construireHtmlDocumentCommercial',
      'construireHtmlRecuPaiement',
      'construireHtmlRecuPdf',
      'domiciliationEnFacture',
      'formatDateFr',
      'imprimerDocumentCommercial',
      'imprimerFactureDomiciliationPdf',
      'imprimerRecuPaiement',
      'imprimerRecuPaiementPdf',
      'ouvrirPdfApresClic',
    ])
  })

  it('les fonctions ré-exportées sont les mêmes objets que dans print/', () => {
    expect(documentPrint.formatDateFr).toBe(commun.formatDateFr)
    expect(documentPrint.chargerIdentite).toBe(identite.chargerIdentite)
    expect(documentPrint.chargerIdentitePdf).toBe(identite.chargerIdentitePdf)
    expect(documentPrint.ouvrirPdfApresClic).toBe(ouvrirPdf.ouvrirPdfApresClic)
    expect(documentPrint.construireHtmlDocumentCommercial).toBe(documentCommercial.construireHtmlDocumentCommercial)
    expect(documentPrint.imprimerDocumentCommercial).toBe(documentCommercial.imprimerDocumentCommercial)
  })

  it('print/ expose les noms attendus', () => {
    expect(Object.keys(commun).sort()).toEqual(['dh', 'formatDateFr', 'pct'])
    expect(Object.keys(identite).sort()).toEqual(['chargerIdentite', 'chargerIdentitePdf'])
    expect(Object.keys(ouvrirPdf)).toEqual(['ouvrirPdfApresClic'])
    expect(Object.keys(documentCommercial).sort()).toEqual(['construireHtmlDocumentCommercial', 'imprimerDocumentCommercial'])
  })
})

describe('api/facturation.js : API publique inchangée', () => {
  it('expose les mêmes fonctions et constantes qu\'avant', () => {
    expect(Object.keys(apiFacturation).sort()).toEqual([
      'EMETTEURS', 'MODES_PAIEMENT', 'archiveDocument', 'corbeilleDocument', 'createDocument', 'deleteDocumentForever',
      'getDocument', 'getNumeroPropose', 'listDocuments', 'restoreDocument', 'updateDocument',
    ])
  })

  it('EMETTEURS et MODES_PAIEMENT : mêmes objets que l\'emplacement partagé, mêmes valeurs qu\'avant', () => {
    expect(apiFacturation.EMETTEURS).toBe(constantes.EMETTEURS)
    expect(apiFacturation.MODES_PAIEMENT).toBe(constantes.MODES_PAIEMENT)

    expect(constantes.EMETTEURS).toEqual([
      { value: 'via_experts', label: 'Via Experts', sousTitre: 'Centre Domiciliation' },
      { value: 'bureau_comptabilite', label: 'Maitre : Morad Bendeq', sousTitre: 'Bureau de Comptabilité' },
    ])
    expect(constantes.MODES_PAIEMENT).toEqual([
      'Virement', 'Chèque', 'Traite', 'Espèce', 'Versement',
      'Carte bancaire', 'Affacturage', 'Crédit', 'Autres à déterminer',
    ])
  })
})
