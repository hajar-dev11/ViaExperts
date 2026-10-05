// Filet de sécurité de la migration Modular Monolith : instantanés EXACTS du HTML/CSS produit pour les documents
// (factures, devis, bons de livraison, avoirs, reçus, attestation, contrat, procuration, facture de domiciliation).
// Ces fonctions sont pures : le même jeu de données doit toujours donner exactement le même HTML, donc le même
// PDF. Déplacer ou découper les générateurs (ex-`documentPrint.js`, éclaté par domaine à l'étape 15) ne doit rien changer à ces instantanés.
//
// Mise à jour volontaire (après un changement de design assumé) :  npm test -- -u   puis relire le diff Git.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { construireHtmlDocumentCommercial } from '../modules/facturation/index.js'
import { construireHtmlRecuPdf } from '../modules/paiements/index.js'
import { domiciliationEnFacture } from '../modules/domiciliation/index.js'
import { formatDateFr } from '../utils/print/commun.js'
import { attestationParDefaut, construireHtmlAttestation } from '../utils/attestation.js'
import { construireHtmlContrat, contratParDefaut, qrContratDataUrl } from '../utils/contrat.js'
import { construireHtmlProcuration, procurationParDefaut } from '../utils/procuration.js'
import { montantEnLettres } from '../utils/montantEnLettres.js'

// ---- Jeux de données figés -----------------------------------------------------------------------------------

const IDENTITE = {
  nomSociete: 'Via Experts',
  logo: 'data:image/png;base64,LOGO',
  signature: 'data:image/png;base64,CACHET',
  piedDePage: 'Via Experts SARL — 30 Juillet, Casablanca — RC : 619971 — IF : 60288700',
  afficherPiedSurRecu: true,
  gerant: 'Maître : Morad Bendeq',
}
const SANS_CACHET = { ...IDENTITE, signature: null }

const DOCUMENT = {
  responsable: 'Maitre : Morad Bendeq',
  numero: 'F-001/26',
  dateDocument: '2026-09-17 11:00:00',
  datePaiement: '2026-09-18',
  tiers: 'CLIENT TEST SARL',
  tiersIce: '001234567000089',
  tiersCin: 'AB123456',
  modePaiement: 'Virement',
  prixPaye: 500,
  prixRestant: 1660,
  note: 'Dossier de test\nDeuxième ligne',
  signature: true,
  lignes: [
    { designation: 'Déclaration TVA', prixUnitaire: 1000, quantite: 2, totalHt: 2000, totalNetHt: 1800, totalTva: 360, tvaPourcent: 20, totalTtc: 2160 },
  ],
  totalHt: 2000,
  totalRemise: 200,
  totalNetHt: 1800,
  totalTva: 360,
  totalTtc: 2160,
}

const PAIEMENT = {
  id: 7,
  reference: '#7',
  dateOperation: '2026-09-17 12:00:00',
  client: 'CLIENT TEST SARL',
  entrepriseIce: '001234567000089',
  clientTelephone: '0611111111',
  total: 3000,
  prixPaye: 500,
  prixRestant: 2500,
  modePaiement: 'Espèce',
  observation: 'acompte',
  signature: true,
}

const DOMICILIATION = {
  id: 358,
  denomination: 'VIRKAD TECHNOLOGY',
  ice: '003790162000044',
  client: 'Abderrahim Lif',
  clientCin: 'bh108879',
  clientAdresse: 'hay salama rue 107 no 13 casablanca',
  email: 'client@example.test',
  centre: 'VIA EXPERTS',
  numeroArchive: 'ARC-12',
  moisPayee: 12,
  moisGratuits: 0,
  prixTotal: 1500,
  dateDepart: '2026-08-01',
  dateFin: '2027-08-01',
  dateFacture: '2026-08-01',
  datePaiement: '2026-08-02',
  dateLegalisation: '2026-08-19',
  modePaiement: 'Virement',
  signatureSurFacture: true,
}
const ENTREPRISE = { forme: 'SARL AU', clientId: 5 }
const CLIENT = { genre: 'Mr', naissance: '1966-12-30', tel: '+212 661-620104', email: 'liftel.service@gmail.com' }

// La « date du jour » des documents de domiciliation est figée pour que les instantanés soient stables.
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T10:00:00'))
})
afterAll(() => vi.useRealTimers())

// ---- Documents commerciaux -----------------------------------------------------------------------------------

describe('documents commerciaux (documentPrint.js)', () => {
  for (const type of ['facture', 'devis', 'bl', 'avoir']) {
    it(`${type} — avec cachet`, () => {
      expect(construireHtmlDocumentCommercial(type, DOCUMENT, IDENTITE)).toMatchSnapshot()
    })
    it(`${type} — sans cachet (option « Signature » décochée)`, () => {
      expect(construireHtmlDocumentCommercial(type, { ...DOCUMENT, signature: false }, IDENTITE).bodyHtml).toMatchSnapshot()
    })
    it(`${type} — cachet non configuré`, () => {
      expect(construireHtmlDocumentCommercial(type, DOCUMENT, SANS_CACHET).bodyHtml).toMatchSnapshot()
    })
  }

  it('facture de domiciliation : conversion des données', () => {
    expect(domiciliationEnFacture(DOMICILIATION)).toMatchSnapshot()
  })

  it('facture de domiciliation : HTML (modèle Facture)', () => {
    expect(construireHtmlDocumentCommercial('facture', domiciliationEnFacture(DOMICILIATION), IDENTITE)).toMatchSnapshot()
  })
})

describe('reçus de paiement', () => {
  for (const format of ['a4', 'a5']) {
    it(`reçu ${format} — avec cachet`, () => {
      expect(construireHtmlRecuPdf(PAIEMENT, IDENTITE, format)).toMatchSnapshot()
    })
    it(`reçu ${format} — sans cachet`, () => {
      expect(construireHtmlRecuPdf({ ...PAIEMENT, signature: false }, IDENTITE, format).bodyHtml).toMatchSnapshot()
    })
  }
})

// ---- Documents de domiciliation ------------------------------------------------------------------------------

describe('attestation de domiciliation', () => {
  const valeurs = attestationParDefaut(DOMICILIATION, { entreprise: ENTREPRISE })

  it('valeurs par défaut (date du jour)', () => expect(valeurs).toMatchSnapshot())
  it('aperçu avec cachet', () => expect(construireHtmlAttestation(valeurs, IDENTITE, { signature: IDENTITE.signature })).toMatchSnapshot())
  it('aperçu sans cachet', () => expect(construireHtmlAttestation(valeurs, IDENTITE).bodyHtml).toMatchSnapshot())
  it('mode édition', () => expect(construireHtmlAttestation(valeurs, IDENTITE, { edition: true }).bodyHtml).toMatchSnapshot())
  it('contenu modifié', () => {
    const contenu = { titre: '<u>TITRE MODIFIÉ</u>', corps: '<p>Corps modifié</p>' }
    expect(construireHtmlAttestation(valeurs, IDENTITE, { contenu }).bodyHtml).toMatchSnapshot()
  })
})

describe('contrat de domiciliation', () => {
  const valeurs = contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE })

  it('valeurs par défaut (date du jour)', () => expect(valeurs).toMatchSnapshot())
  it('aperçu avec cachet', () => expect(construireHtmlContrat(valeurs, IDENTITE, { signature: IDENTITE.signature })).toMatchSnapshot())
  it('aperçu sans cachet', () => expect(construireHtmlContrat(valeurs, IDENTITE).bodyHtml).toMatchSnapshot())
  it('mode édition', () => expect(construireHtmlContrat(valeurs, IDENTITE, { edition: true }).bodyHtml).toMatchSnapshot())
  it('QR code dynamique « Viaexperts-{CIN} »', () => {
    expect(qrContratDataUrl('BH108879')).toMatchSnapshot()
    expect(qrContratDataUrl('BH108879')).not.toBe(qrContratDataUrl('EE290878'))
  })
  it('QR code : CIN absente → pas de QR, le contrat reste valide', () => {
    expect(qrContratDataUrl('')).toBe('')
    expect(construireHtmlContrat({ ...valeurs, cni: '' }, IDENTITE).bodyHtml).not.toContain('class="c-qr"')
  })
})

describe('procuration', () => {
  const valeurs = procurationParDefaut(DOMICILIATION, { client: CLIENT })

  it('valeurs par défaut (date du jour, civilité)', () => expect(valeurs).toMatchSnapshot())
  it('civilité : Madame pour « Mme »', () => {
    expect(procurationParDefaut(DOMICILIATION, { client: { ...CLIENT, genre: 'Mme' } }).civilite).toBe('Madame')
    expect(procurationParDefaut(DOMICILIATION, { client: CLIENT }).civilite).toBe('Monsieur')
  })
  it('aperçu (jamais de cachet)', () => expect(construireHtmlProcuration(valeurs, IDENTITE, { signature: IDENTITE.signature })).toMatchSnapshot())
  it('mode édition', () => expect(construireHtmlProcuration(valeurs, IDENTITE, { edition: true }).bodyHtml).toMatchSnapshot())
})

// ---- Utilitaires purs ----------------------------------------------------------------------------------------

describe('utilitaires', () => {
  it('formatDateFr', () => {
    expect(formatDateFr('2026-09-17')).toBe('17/09/2026')
    expect(formatDateFr('2026-09-17 11:30:00')).toBe('17/09/2026 | 11:30')
    expect(formatDateFr('')).toBe('')
  })
  it('montantEnLettres', () => {
    expect([0, 1, 125.5, 2160, 1500000].map((n) => montantEnLettres(n))).toMatchSnapshot()
  })
})
