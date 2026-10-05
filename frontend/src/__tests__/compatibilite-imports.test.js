// Garde-fous de compatibilité pendant la migration Modular Monolith (Facturation — étapes 1 à 15) :
// les fichiers découpés ou déplacés doivent continuer d'exposer EXACTEMENT les mêmes noms qu'avant.
//
// Étape 15 : la façade mixte `utils/documentPrint.js` et les stubs de l'étape 14 (`api/facturation.js`,
// `utils/print/documentCommercial.js`) ont été supprimés, plus aucun fichier ne les importait. Ces tests vérifient que les
// 12 noms de l'ancienne façade et les 11 noms de l'ancienne API Facturation existent toujours, chacun dans UN seul
// emplacement, et que les anciens fichiers n'existent plus.

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as apiFacturation from '../modules/facturation/api/facturation.js'
import * as facturation from '../modules/facturation/index.js'
import * as paiements from '../modules/paiements/index.js'
import * as domiciliation from '../modules/domiciliation/index.js'
import * as constantes from '../shared/constants/documents.js'
import * as commun from '../utils/print/commun.js'
import * as identite from '../utils/print/identite.js'
import * as ouvrirPdf from '../utils/print/ouvrirPdf.js'
import * as documentCommercial from '../modules/facturation/print/documentCommercial.js'
import * as recuPaiement from '../modules/paiements/print/recuPaiement.js'
import * as factureDomiciliation from '../modules/domiciliation/print/factureDomiciliation.js'

const SRC = path.resolve(__dirname, '..')

describe('ex-documentPrint.js : les 12 noms existent toujours, chacun à sa place', () => {
  const ANCIENS_NOMS = [
    'chargerIdentite', 'chargerIdentitePdf', 'construireHtmlDocumentCommercial', 'construireHtmlRecuPaiement',
    'construireHtmlRecuPdf', 'domiciliationEnFacture', 'formatDateFr', 'imprimerDocumentCommercial',
    'imprimerFactureDomiciliationPdf', 'imprimerRecuPaiement', 'imprimerRecuPaiementPdf', 'ouvrirPdfApresClic',
  ]

  it('chaque ancien nom est exporté par exactement un domaine', () => {
    const domaines = {
      partage: { ...commun, ...identite, ...ouvrirPdf },
      facturation: documentCommercial,
      paiements: recuPaiement,
      domiciliation: factureDomiciliation,
    }
    for (const nom of ANCIENS_NOMS) {
      const proprietaires = Object.entries(domaines).filter(([, exports]) => nom in exports).map(([d]) => d)
      expect(proprietaires, nom).toHaveLength(1)
    }
  })

  it('répartition par domaine', () => {
    expect(Object.keys(documentCommercial).sort()).toEqual(['construireHtmlDocumentCommercial', 'imprimerDocumentCommercial'])
    expect(Object.keys(recuPaiement).sort()).toEqual([
      'construireHtmlRecuPaiement', 'construireHtmlRecuPdf', 'imprimerRecuPaiement', 'imprimerRecuPaiementPdf',
    ])
    expect(Object.keys(factureDomiciliation).sort()).toEqual(['domiciliationEnFacture', 'imprimerFactureDomiciliationPdf'])
    expect(Object.keys(commun).sort()).toEqual(['dh', 'formatDateFr', 'pct'])
    expect(Object.keys(identite).sort()).toEqual(['chargerIdentite', 'chargerIdentitePdf'])
    expect(Object.keys(ouvrirPdf)).toEqual(['ouvrirPdfApresClic'])
  })

  it('les points d\'entrée des modules ré-exportent les mêmes fonctions', () => {
    expect(facturation.construireHtmlDocumentCommercial).toBe(documentCommercial.construireHtmlDocumentCommercial)
    expect(facturation.imprimerDocumentCommercial).toBe(documentCommercial.imprimerDocumentCommercial)
    for (const nom of Object.keys(recuPaiement)) expect(paiements[nom]).toBe(recuPaiement[nom])
    for (const nom of Object.keys(factureDomiciliation)) expect(domiciliation[nom]).toBe(factureDomiciliation[nom])
    expect(Object.keys(paiements).sort()).toEqual(Object.keys(recuPaiement).sort())
    expect(Object.keys(domiciliation).sort()).toEqual(Object.keys(factureDomiciliation).sort())
  })

  it('les anciens fichiers (façade et stubs) n\'existent plus', () => {
    for (const rel of ['utils/documentPrint.js', 'utils/print/documentCommercial.js', 'api/facturation.js']) {
      expect(fs.existsSync(path.join(SRC, rel)), rel).toBe(false)
    }
  })
})

describe('API Facturation : API publique inchangée', () => {
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
