// Formulaire de domiciliation : réinitialisation après succès, conservation après échec, soumission unique, durée.
// (Le contrôle de chevauchement lui-même est côté serveur : voir DomiciliationSoumissionTest.php.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PRIX_PAR_MOIS_DEFAUT, construirePayload, deriverEntreprise, erreurDuree, executerUneFois, formulaireVide, soumettreFormulaire,
} from '../modules/domiciliation/utils/formulaireDomiciliation.js'
import { calculerDateFin } from '../modules/domiciliation/utils/domiciliation.js'

describe('deriverEntreprise : centre de l\'entreprise choisie (plus d\'anciennes dates ni d\'ancien prix)', () => {
  const periodes = [
    { id: 1, entrepriseId: 10, dateDepart: '2025-01-01', dateFin: '2025-12-31', centreId: 3 },
    { id: 2, entrepriseId: 10, dateDepart: '2026-01-01', dateFin: '2026-12-31', centreId: 4 },
    { id: 3, entrepriseId: 11, dateDepart: '2026-02-01', dateFin: '2027-01-31', centreId: null },
  ]
  const entreprises = [
    { id: 10, centreDomiciliationId: 9 }, { id: 11, centreDomiciliationId: 7 }, { id: 12, centreDomiciliationId: null },
  ]

  it('reprend le centre de la dernière période, et seulement lui', () => {
    expect(deriverEntreprise(periodes, entreprises, '10')).toEqual({ centreId: 4 })
  })

  it('à défaut de centre sur la période, reprend celui de la fiche entreprise', () => {
    expect(deriverEntreprise(periodes, entreprises, 11).centreId).toBe(7)
  })

  it('sans centre connu : centreId vide, donc le formulaire demande de le choisir (jamais deviné)', () => {
    expect(deriverEntreprise(periodes, entreprises, 12)).toEqual({ centreId: '' })
    expect(deriverEntreprise([], [], 99).centreId).toBe('')
    expect(deriverEntreprise(periodes, entreprises, '').centreId).toBe('')
  })
})

describe('construirePayload : ce qui part vers l\'API', () => {
  const formulaire = () => ({
    ...formulaireVide(), entreprise_id: '10', date_depart: '2026-03-31', date_fin: '2027-03-31',
    date_facture: '2026-04-01', date_paiement: '2026-04-02', date_legalisation: '2026-04-03', prix_total: '1250.04',
    doc_facture: true, doc_procuration: true,
  })

  it('les dates partent telles que saisies (AAAA-MM-JJ), sans conversion', () => {
    const p = construirePayload(formulaire(), 4)
    expect([p.date_depart, p.date_fin, p.date_facture, p.date_paiement, p.date_legalisation])
      .toEqual(['2026-03-31', '2027-03-31', '2026-04-01', '2026-04-02', '2026-04-03'])
    for (const v of [p.date_depart, p.date_fin, p.date_facture]) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('les cases cochées partent en booléens, les autres à false', () => {
    const p = construirePayload(formulaire(), 4)
    expect([p.doc_facture, p.doc_contrat, p.doc_attestation, p.doc_procuration]).toEqual([true, false, false, true])
  })

  it('identifiants numériques, dates vides envoyées en null, centre retenu', () => {
    const p = construirePayload({ ...formulaire(), date_legalisation: '', date_fin: '' }, '4')
    expect(p).toMatchObject({ entreprise_id: 10, centre_domiciliation_id: 4, date_legalisation: null, date_fin: null })
  })
})

describe('page Nouvelle Domiciliation', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../modules/domiciliation/pages/DomiciliationForm.jsx'), 'utf8')

  it('propose le choix du centre quand l\'entreprise n\'en a pas, au lieu de bloquer', () => {
    expect(source).toContain('choisirCentre &&')
    expect(source).toContain("Sélectionnez un centre")
    expect(source).not.toContain('renseignez-le d\'abord sur sa fiche Entreprise')
    expect(source).toContain('construirePayload(form, centreId)')
  })
})

describe('fiche Domiciliation', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../modules/domiciliation/pages/DomiciliationDetails.jsx'), 'utf8')

  it('affiche les documents cochés à la création et permet de les imprimer', () => {
    expect(source).toContain('Documents du dossier')
    expect(source).toContain('DOCUMENTS_DOMICILIATION.map')
    expect(source).toContain('d[doc.drapeau]')
    expect(source).toContain('<MenuImprimer domiciliation={d}')
  })
})

const ApiErreur = class extends Error {}
const attente = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Un envoi qu'on termine à la main, pour simuler deux soumissions pendant qu'une réponse est attendue. */
function envoiManuel() {
  let terminer
  let echouer
  const promesse = new Promise((resolve, reject) => { terminer = resolve; echouer = reject })
  const envoyer = vi.fn(() => promesse)
  return { envoyer, terminer, echouer }
}

describe('formulaireVide', () => {
  afterEach(() => vi.useRealTimers())

  it('repart des valeurs par défaut : aucune entreprise, 0 mois payé, prix par mois 104,17, plus d\'ancienne période', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0)) // 10/10/2026

    const f = formulaireVide()

    expect(f.entreprise_id).toBe('')
    expect(f.centre_domiciliation_id).toBe('')
    // « Ancienne date de début / fin » et « Ancien prix HT » ne font plus partie du formulaire.
    expect(f).not.toHaveProperty('ancienne_date_depart')
    expect(f).not.toHaveProperty('ancienne_date_fin')
    expect(f).not.toHaveProperty('ancien_prix')
    expect(f.mois_payee).toBe(0)
    expect(f.mois_gratuits).toBe(0)
    expect(f.date_depart).toBe('2026-10-10')
    expect(f.date_fin).toBe('') // durée nulle : la date de fin se calcule dès qu'un mois est renseigné
    expect(f.date_facture).toBe('2026-10-10')
    expect(f.date_paiement).toBe('2026-10-10')
    expect(f.date_legalisation).toBe('')
    expect(f.prix_par_mois).toBe('104.17')
    expect(f.prix_par_mois).toBe(PRIX_PAR_MOIS_DEFAUT)
    expect(f.prix_total).toBe('0') // 0 mois payé × 104,17
    expect(f.signature_sur_facture).toBe(true)
    expect([f.doc_facture, f.doc_contrat, f.doc_attestation, f.doc_procuration]).toEqual([false, false, false, false])
  })

  it('prend la date du jour À CHAQUE appel (pas celle du chargement de l\'application)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 23, 0, 0))
    expect(formulaireVide().date_depart).toBe('2026-10-10')

    vi.setSystemTime(new Date(2026, 9, 11, 8, 0, 0)) // le lendemain, même page ouverte
    const f = formulaireVide()
    expect(f.date_depart).toBe('2026-10-11')
    // La date de fin suit la durée : avec 12 mois payés, départ + 12 mois.
    expect(calculerDateFin(f.date_depart, 12)).toBe('2027-10-11')
  })

  it('conserve le prix par mois saisi et renvoie à chaque fois un objet neuf', () => {
    const a = formulaireVide('120')
    a.entreprise_id = 7
    const b = formulaireVide('120')

    expect(b.prix_par_mois).toBe('120')
    expect(b.prix_total).toBe('0') // 0 mois payé par défaut : le total reste nul tant qu'aucun mois n'est saisi
    expect(b.entreprise_id).toBe('')
    expect(b).not.toBe(a)
    expect(formulaireVide().prix_par_mois).toBe('104.17') // prix par défaut, avec sa précision
    expect(construirePayload({ ...formulaireVide(), entreprise_id: 1 }, 1).prix_par_mois).toBe(104.17) // envoyé exact, jamais arrondi à 104
  })
})

describe('executerUneFois (soumission répétée)', () => {
  it('deux soumissions pendant un envoi : une seule requête part', async () => {
    const verrou = { current: false }
    const { envoyer, terminer } = envoiManuel()

    const premiere = executerUneFois(verrou, envoyer)
    const seconde = executerUneFois(verrou, envoyer)
    const troisieme = executerUneFois(verrou, envoyer)

    expect(await seconde).toEqual({ ignoree: true })
    expect(await troisieme).toEqual({ ignoree: true })
    terminer('ok')
    expect(await premiere).toEqual({ ignoree: false, valeur: 'ok' })
    expect(envoyer).toHaveBeenCalledTimes(1)
  })

  it('le verrou est relâché après un succès comme après un échec', async () => {
    const verrou = { current: false }

    await executerUneFois(verrou, async () => 'ok')
    expect(verrou.current).toBe(false)

    await expect(executerUneFois(verrou, async () => { throw new Error('refus') })).rejects.toThrow('refus')
    expect(verrou.current).toBe(false)

    expect(await executerUneFois(verrou, async () => 'encore')).toEqual({ ignoree: false, valeur: 'encore' })
  })
})

describe('soumettreFormulaire', () => {
  const saisie = () => ({ ...formulaireVide('99.5'), entreprise_id: 12, centre_domiciliation_id: 3, mode_paiement: 'Virement', mois_gratuits: 2 })

  it('succès en création : le formulaire est réinitialisé (entreprise, centre, champs), le prix par mois est gardé', async () => {
    const verrou = { current: false }
    const envoyer = vi.fn(async () => ({ id: 1 }))

    const issue = await soumettreFormulaire({ verrou, envoyer, formulaire: saisie(), creation: true })

    expect(issue.statut).toBe('succes')
    expect(envoyer).toHaveBeenCalledTimes(1)
    expect(issue.formulaire.entreprise_id).toBe('')
    expect(issue.formulaire.centre_domiciliation_id).toBe('')
    expect(issue.formulaire.mode_paiement).toBe('')
    expect(issue.formulaire.mois_gratuits).toBe(0)
    expect(issue.formulaire.prix_par_mois).toBe('99.5')
  })

  it('succès en modification : le formulaire reste tel quel', async () => {
    const formulaire = saisie()
    const issue = await soumettreFormulaire({ verrou: { current: false }, envoyer: async () => ({}), formulaire, creation: false })

    expect(issue.statut).toBe('succes')
    expect(issue.formulaire).toBe(formulaire)
  })

  it('échec : les données saisies sont conservées et l\'erreur est renvoyée', async () => {
    const formulaire = saisie()
    const refus = new ApiErreur('Cette période chevauche une période…')

    const issue = await soumettreFormulaire({ verrou: { current: false }, envoyer: async () => { throw refus }, formulaire, creation: true })

    expect(issue.statut).toBe('echec')
    expect(issue.erreur).toBe(refus)
    expect(issue.formulaire).toBe(formulaire)
    expect(issue.formulaire.entreprise_id).toBe(12)
    expect(issue.formulaire.mois_gratuits).toBe(2)
  })

  it('après un échec une nouvelle tentative est possible (verrou relâché)', async () => {
    const verrou = { current: false }
    let appels = 0
    const envoyer = async () => { appels += 1; if (appels === 1) throw new ApiErreur('réseau') }

    expect((await soumettreFormulaire({ verrou, envoyer, formulaire: saisie(), creation: true })).statut).toBe('echec')
    expect((await soumettreFormulaire({ verrou, envoyer, formulaire: saisie(), creation: true })).statut).toBe('succes')
    expect(appels).toBe(2)
  })

  it('soumission répétée : la seconde est ignorée, une seule domiciliation est envoyée, le formulaire n\'est pas touché', async () => {
    const verrou = { current: false }
    const { envoyer, terminer } = envoiManuel()
    const formulaire = saisie()

    const premiere = soumettreFormulaire({ verrou, envoyer, formulaire, creation: true })
    const seconde = await soumettreFormulaire({ verrou, envoyer, formulaire, creation: true })
    await attente()

    expect(seconde.statut).toBe('ignoree')
    expect(seconde.formulaire).toBe(formulaire)
    expect(envoyer).toHaveBeenCalledTimes(1)

    terminer({ id: 1 })
    expect((await premiere).statut).toBe('succes')
    expect(envoyer).toHaveBeenCalledTimes(1)
  })

  it('rien n\'est présenté comme réussi tant que le serveur n\'a pas répondu', async () => {
    const verrou = { current: false }
    const { envoyer, terminer } = envoiManuel()
    let statut = null

    const attendu = soumettreFormulaire({ verrou, envoyer, formulaire: saisie(), creation: true }).then((issue) => { statut = issue.statut })
    await attente()
    expect(statut).toBeNull() // envoi en cours : ni succès ni échec

    terminer({})
    await attendu
    expect(statut).toBe('succes')
  })
})

describe('erreurDuree', () => {
  it('refuse une durée nulle ou une date de fin vide (la période serait sans fin)', () => {
    expect(erreurDuree(0, 0, '')).toMatch(/au moins un mois/)
    expect(erreurDuree('', '', '2027-10-10')).toMatch(/au moins un mois/)
    expect(erreurDuree(12, 0, '')).toMatch(/au moins un mois/)
  })

  it('accepte des mois payés ou gratuits avec une date de fin', () => {
    expect(erreurDuree(12, 0, '2027-10-10')).toBe('')
    expect(erreurDuree(0, 3, '2027-01-10')).toBe('')
  })
})

beforeEach(() => vi.useRealTimers())
