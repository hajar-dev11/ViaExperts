// Caractérisation ciblée du frontend Domiciliation (étape 16 : audit avant modularisation).
// Décrit l'EXISTANT sans rien changer : routes, menu, constantes dupliquées, fonctions pures et liste des documents.
// Environnement Node (pas de jsdom) : fonctions pures + texte des routes uniquement.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { nav } from '../components/navConfig.js'
import { MODES_PAIEMENT as MODES_PARTAGES } from '../shared/constants/documents.js'
import { MODES_PAIEMENT as MODES_DOMICILIATION } from '../api/domiciliations.js'
import { aujourdhui, calculerDateFin, classerNouveauRenouveler } from '../utils/domiciliation.js'
import { DOCUMENTS_DOMICILIATION, documentsDisponibles } from '../utils/documentsDomiciliation.js'

const SRC = path.resolve(__dirname, '..')

describe('Routes React Domiciliation : URLs, composants et ordre inchangés', () => {
  const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8')
  const routes = [...app.matchAll(/<Route path="(\/domiciliation[^"]*)" element=\{<(\w+)/g)].map((m) => `${m[1]} -> ${m[2]}`)

  it('11 routes, dans cet ordre (les routes statiques précèdent /domiciliation/:id)', () => {
    expect(routes).toEqual([
      '/domiciliation -> DomiciliationList',
      '/domiciliation/nouvelle -> DomiciliationForm',
      '/domiciliation/:id/modifier -> DomiciliationForm',
      '/domiciliation/liste -> DomiciliationStatuts',
      '/domiciliation/calendrier -> DomiciliationCalendar',
      '/domiciliation/centres -> DomiciliationCentres',
      '/domiciliation/centres/:id -> CentreDomiciliationDetails',
      '/domiciliation/:id/attestation -> AttestationDomiciliation',
      '/domiciliation/:id/contrat -> ContratDomiciliation',
      '/domiciliation/:id/procuration -> ProcurationDomiciliation',
      '/domiciliation/:id -> DomiciliationDetails',
    ])
  })
})

describe('Menu Domiciliation', () => {
  it('libellés, liens et ordre inchangés ; aucune permission déclarée sur ces entrées', () => {
    const groupe = nav.find((g) => g.label === 'Domiciliation')
    expect(groupe.base).toBe('/domiciliation')
    expect(groupe.children.map((c) => [c.label, c.to])).toEqual([
      ['Nouvelle Domiciliation', '/domiciliation/nouvelle'],
      ['Gestion Domiciliation', '/domiciliation'],
      ['List Domiciliation', '/domiciliation/liste'],
      ['Domiciliation Calendrier', '/domiciliation/calendrier'],
      ['Centres des Domiciliation', '/domiciliation/centres'],
    ])
    expect(groupe.children.some((c) => c.permission)).toBe(false)
  })
})

describe('Constantes dupliquées : modes de paiement', () => {
  // `api/domiciliations.js` garde sa propre copie de MODES_PAIEMENT (et le backend une 3ᵉ : StoreDomiciliationRequest).
  // Ce test fige l'égalité avec la source partagée : à supprimer quand la copie sera remplacée par un import.
  it('la copie de Domiciliation est identique à la source partagée (mais ce n\'est pas le même objet)', () => {
    expect(MODES_DOMICILIATION).toEqual(MODES_PARTAGES)
    expect(MODES_DOMICILIATION).not.toBe(MODES_PARTAGES)
  })
})

describe('utils/domiciliation.js : fonctions pures', () => {
  it('aujourdhui() : format AAAA-MM-JJ', () => {
    expect(aujourdhui()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('calculerDateFin : décalage au quantième, plafonné au dernier jour du mois', () => {
    expect(calculerDateFin('2026-01-15', 12)).toBe('2027-01-15')
    expect(calculerDateFin('2026-01-31', 1)).toBe('2026-02-28')
    expect(calculerDateFin('2024-01-31', 1)).toBe('2024-02-29')
    expect(calculerDateFin('2026-11-30', 3)).toBe('2027-02-28')
  })

  it('calculerDateFin : entrées invalides -> chaîne vide', () => {
    expect(calculerDateFin('', 3)).toBe('')
    expect(calculerDateFin('2026-01-15', 0)).toBe('')
    expect(calculerDateFin('2026-01-15', 'x')).toBe('')
    expect(calculerDateFin('pas-une-date', 2)).toBe('')
  })

  it('classerNouveauRenouveler : la plus ancienne période d\'une entreprise est « nouveau », les autres « renouveler »', () => {
    const classement = classerNouveauRenouveler([
      { id: 1, entrepriseId: 10, dateDepart: '2025-01-01' },
      { id: 2, entrepriseId: 10, dateDepart: '2026-01-01' },
      { id: 3, entrepriseId: 11, dateDepart: '2026-03-01' },
      { id: 4, entrepriseId: 12, dateDepart: '2026-05-01', renouvelleDeId: 99 },
    ])
    expect([...classement.entries()]).toEqual([[1, 'nouveau'], [2, 'renouveler'], [3, 'nouveau'], [4, 'renouveler']])
  })
})

describe('utils/documentsDomiciliation.js : documents du dossier', () => {
  it('les 4 documents, dans l\'ordre, avec leur drapeau', () => {
    expect(DOCUMENTS_DOMICILIATION.map((d) => [d.cle, d.drapeau])).toEqual([
      ['facture', 'docFacture'], ['contrat', 'docContrat'], ['attestation', 'docAttestation'], ['procuration', 'docProcuration'],
    ])
    expect(typeof DOCUMENTS_DOMICILIATION[0].imprimer).toBe('function')
    expect(DOCUMENTS_DOMICILIATION.slice(1).map((d) => d.editeur)).toEqual(['contrat', 'attestation', 'procuration'])
  })

  it('documentsDisponibles ne garde que les documents dont la case est cochée', () => {
    expect(documentsDisponibles({ docFacture: true, docAttestation: true }).map((d) => d.cle)).toEqual(['facture', 'attestation'])
    expect(documentsDisponibles({})).toEqual([])
    expect(documentsDisponibles(null)).toEqual([])
  })
})
