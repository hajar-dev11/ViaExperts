// Bandeau d'alerte d'échéance (Topbar) : règles de calcul, dont l'exclusion d'une période déjà renouvelée.
// Environnement Node (pas de jsdom) : fonction pure uniquement.
import { describe, expect, it } from 'vitest'
import { calculerAlertesEcheance, destinationAlerte, JOURS_ALERTE } from '../utils/alertesDomiciliation.js'

const MAINTENANT = new Date('2026-10-07T10:00:00')

// Une période : id, entreprise, dates de fin ; le reste prend des valeurs neutres.
const periode = (id, entrepriseId, dateFin, extra = {}) => ({
  id, entrepriseId, denomination: `ENT ${entrepriseId}`, dateFin, dateDepart: '2025-01-01', etat: 'active', renouvelleDeId: null, ...extra,
})

describe('calculerAlertesEcheance', () => {
  it('le seuil est de 30 jours (aligné sur le backend)', () => {
    expect(JOURS_ALERTE).toBe(30)
  })

  it('une domiciliation arrivant à échéance sous 30 jours déclenche une alerte', () => {
    const alertes = calculerAlertesEcheance([periode(1, 10, '2026-10-17')], MAINTENANT)
    expect(alertes).toEqual([{ id: 1, entrepriseId: 10, nom: 'ENT 10', dateFin: '2026-10-17', expiree: false }])
  })

  it('une échéance lointaine ne déclenche rien ; une échéance dépassée non renouvelée reste en alerte (expirée)', () => {
    expect(calculerAlertesEcheance([periode(1, 10, '2027-06-01')], MAINTENANT)).toEqual([])
    const expiree = calculerAlertesEcheance([periode(1, 10, '2026-08-01')], MAINTENANT)
    expect(expiree).toHaveLength(1)
    expect(expiree[0].expiree).toBe(true)
  })

  it('après renouvellement, l\'ancienne échéance ne génère plus d\'alerte (la nouvelle fin la remplace)', () => {
    const avant = [periode(1, 10, '2026-10-17')]
    const apres = [...avant, periode(2, 10, '2027-10-17', { renouvelleDeId: 1 })]
    expect(calculerAlertesEcheance(avant, MAINTENANT)).toHaveLength(1)
    expect(calculerAlertesEcheance(apres, MAINTENANT)).toEqual([])
  })

  it('un renouvellement sans date de fin ou à date de fin antérieure ne laisse pas l\'ancienne alerte', () => {
    const sansFin = [periode(1, 10, '2026-10-17'), periode(2, 10, null, { renouvelleDeId: 1 })]
    const finAnterieure = [periode(1, 10, '2026-10-17'), periode(2, 10, '2026-10-01', { renouvelleDeId: 1, dateDepart: '2026-09-01' })]
    expect(calculerAlertesEcheance(sansFin, MAINTENANT)).toEqual([])
    // Ici la NOUVELLE période (échue le 01/10) est elle-même la plus récente : l'alerte vient d'elle, pas de l'ancienne.
    expect(calculerAlertesEcheance(finAnterieure, MAINTENANT)).toEqual([
      { id: 2, entrepriseId: 10, nom: 'ENT 10', dateFin: '2026-10-01', expiree: true },
    ])
  })

  it('l\'alerte est recalculée à partir de la NOUVELLE date de fin', () => {
    const lignes = [periode(1, 10, '2026-10-17'), periode(2, 10, '2026-10-30', { renouvelleDeId: 1 })]
    expect(calculerAlertesEcheance(lignes, MAINTENANT)).toEqual([
      { id: 2, entrepriseId: 10, nom: 'ENT 10', dateFin: '2026-10-30', expiree: false },
    ])
  })

  it('un clic sur l\'alerte ouvre la fiche du contrat concerné (ou l\'onglet « En alerte » si l\'alerte mémorisée n\'a pas d\'id)', () => {
    const [alerte] = calculerAlertesEcheance([periode(7, 10, '2026-10-17')], MAINTENANT)
    expect(destinationAlerte(alerte)).toBe('/domiciliation/7')
    expect(destinationAlerte({ entrepriseId: 10, nom: 'ENT 10' })).toBe('/domiciliation?statut=alerte')
    expect(destinationAlerte(undefined)).toBe('/domiciliation?statut=alerte')
  })

  it('une autre entreprise réellement à échéance garde son alerte', () => {
    const lignes = [
      periode(1, 10, '2026-10-17'), periode(2, 10, '2027-10-17', { renouvelleDeId: 1 }),
      periode(3, 20, '2026-10-20'),
    ]
    expect(calculerAlertesEcheance(lignes, MAINTENANT).map((a) => a.entrepriseId)).toEqual([20])
  })

  it('une période résiliée n\'est pas une échéance à renouveler (règle inchangée)', () => {
    expect(calculerAlertesEcheance([periode(1, 10, '2026-10-17', { etat: 'resilie' })], MAINTENANT)).toEqual([])
  })

  it('plusieurs alertes sont triées par date de fin (règle inchangée)', () => {
    const lignes = [periode(1, 10, '2026-10-25'), periode(2, 20, '2026-10-12'), periode(3, 30, '2026-09-01')]
    expect(calculerAlertesEcheance(lignes, MAINTENANT).map((a) => a.entrepriseId)).toEqual([30, 20, 10])
  })
})
