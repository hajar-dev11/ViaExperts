// Contrôles visuels des tableaux « Déclaration TVA » et « Chiffre d'Affaire » : doublons de numéro de facture (rouge) et espèces
// supérieures à 5 000 Dh (orange). Avertissements seulement : aucun ne doit bloquer l'enregistrement.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SEUIL_ESPECES, analyserDoublons, analyserEspeces, cleFournisseur, fondDeCellule, normaliserNumero,
} from '../utils/controlesFactures.js'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

const ligne = (fact_num, fournisseur, extra = {}) => ({ fact_num, identifiant_fiscal: fournisseur, libelle_fournisseur: '', ice: '', ttc: 100, id_paie: '', ...extra })

describe('doublons de numéro de facture (fond rouge)', () => {
  it('un numéro unique n\'est pas signalé', () => {
    expect(analyserDoublons([ligne('F1', '111'), ligne('F2', '111'), ligne('F3', '222')]).size).toBe(0)
  })

  it('le même numéro pour le même fournisseur : toutes les lignes concernées sont signalées', () => {
    const doublons = analyserDoublons([ligne('F1', '111'), ligne('F2', '111'), ligne('F1', '111'), ligne('F1', '111')])
    expect([...doublons.keys()]).toEqual([0, 2, 3])
    expect(doublons.get(0).dansTableau).toBe(true)
  })

  it('le même numéro chez deux fournisseurs différents n\'est PAS un faux doublon', () => {
    expect(analyserDoublons([ligne('F1', '111'), ligne('F1', '222')]).size).toBe(0)
  })

  it('espaces et casse ignorés dans le numéro ; une ligne sans numéro n\'est jamais un doublon', () => {
    expect(normaliserNumero(' fa 12 ')).toBe('FA12')
    expect(analyserDoublons([ligne('fa 12', '111'), ligne('FA12', '111')]).size).toBe(2)
    expect(analyserDoublons([ligne('', '111'), ligne('', '111')]).size).toBe(0)
    expect(analyserDoublons([ligne('', ''), ligne('', '')]).size).toBe(0)
  })

  it('deux factures de même numéro SANS fournisseur renseigné sont signalées (cas de la saisie « 222 » / « 222 »), pas rapprochées d\'un fournisseur connu', () => {
    expect([...analyserDoublons([ligne('222', ''), ligne('222', '')]).keys()]).toEqual([0, 1])
    expect(analyserDoublons([ligne('222', ''), ligne('222', '111')]).size).toBe(0)
    expect(analyserDoublons([ligne('222', ''), ligne('333', '')]).size).toBe(0)
    // Contre une facture déjà enregistrée sans fournisseur non plus.
    const existantes = [{ declarationId: 4, factNum: '222', identifiantFiscal: '', ice: '', libelleFournisseur: '' }]
    expect(analyserDoublons([ligne('222', '')], existantes).get(0)).toEqual({ dansTableau: false, enregistrees: [4] })
  })

  it('le fournisseur se reconnaît par l\'IF, à défaut l\'ICE, à défaut le libellé (sans accents ni casse)', () => {
    expect(cleFournisseur({ identifiant_fiscal: ' 12 34 ', ice: '9' })).toBe('IF:1234')
    expect(cleFournisseur({ ice: '001' })).toBe('ICE:001')
    expect(cleFournisseur({ libelle_fournisseur: 'Société  Élan' })).toBe('LIB:SOCIETE ELAN')
    expect(cleFournisseur({})).toBeNull()
    const parIce = [ligne('F1', '', { ice: '001' }), ligne('F1', '', { ice: '001' }), ligne('F1', '', { ice: '002' })]
    expect([...analyserDoublons(parIce).keys()]).toEqual([0, 1])
  })

  it('un doublon avec une facture déjà ENREGISTRÉE (même numéro, même fournisseur) est signalé, avec la déclaration d\'origine', () => {
    const existantes = [
      { declarationId: 7, factNum: 'F1', identifiantFiscal: '111', ice: null, libelleFournisseur: null },
      { declarationId: 8, factNum: 'F9', identifiantFiscal: '222', ice: null, libelleFournisseur: null }, // autre numéro
      { declarationId: 9, factNum: 'F2', identifiantFiscal: '999', ice: null, libelleFournisseur: null }, // autre fournisseur
    ]
    const doublons = analyserDoublons([ligne('F1', '111'), ligne('F2', '111'), ligne('F9', '111')], existantes)
    expect([...doublons.keys()]).toEqual([0])
    expect(doublons.get(0)).toEqual({ dansTableau: false, enregistrees: [7] })
  })
})

describe('espèces supérieures à 5 000 Dh (fond orange)', () => {
  const especes = (ttc, fournisseur = '111', extra = {}) => ligne(`F${ttc}`, fournisseur, { ttc, id_paie: '1-ESPECES', ...extra })

  it('seuil strict : 5 000 Dh n\'est pas signalé, 5 001 Dh l\'est', () => {
    expect(SEUIL_ESPECES).toBe(5000)
    expect(analyserEspeces([especes(5000)], '').lignesSignalees.size).toBe(0)
    expect([...analyserEspeces([especes(5001)], '').lignesSignalees]).toEqual([0])
  })

  it('un autre moyen de paiement n\'est jamais signalé, même au-dessus du seuil', () => {
    expect(analyserEspeces([ligne('F1', '111', { ttc: 9000, id_paie: '2-VIREMENT' })], '').lignesSignalees.size).toBe(0)
    expect(analyserEspeces([ligne('F1', '111', { ttc: 9000, id_paie: '3-CHEQUE' })], '1-ESPECES').lignesSignalees.size).toBe(0) // l'ID PAIE de la ligne prime
  })

  it('l\'identifiant de paiement de l\'en-tête s\'applique aux lignes sans ID PAIE ; le cumul se fait par fournisseur', () => {
    expect([...analyserEspeces([ligne('F1', '111', { ttc: 6000 })], '1-ESPECES').lignesSignalees]).toEqual([0])
    const cumul = analyserEspeces([especes(3000), especes(3000, '111', { fact_num: 'AUTRE' }), especes(3000, '222')], '')
    expect([...cumul.lignesSignalees]).toEqual([0, 1]) // 6 000 chez le 111, 3 000 seulement chez le 222
    expect(cumul.depassements).toHaveLength(1)
  })
})

describe('cumul des paiements en espèces par tiers (client ou fournisseur)', () => {
  const esp = (fact_num, ttc, tiers, mode = '1-ESPECES') => ({ fact_num, ttc, id_paie: mode, ...tiers })
  const IF_A = { identifiant_fiscal: '111' }
  const IF_B = { identifiant_fiscal: '222' }
  const signalees = (lignes, enregistrees = [], defaut = '') => [...analyserEspeces(lignes, defaut, enregistrees).lignesSignalees]

  it('1. même tiers : 4 000 + 1 500 en espèces = 5 500 → les deux lignes sont signalées, avec le cumul', () => {
    const analyse = analyserEspeces([esp('F1', 4000, IF_A), esp('F2', 1500, IF_A)], '')
    expect([...analyse.lignesSignalees]).toEqual([0, 1])
    expect(analyse.depassements[0].total).toBe(5500)
  })

  it('2. même tiers : 3 000 + 2 000 = 5 000 exactement → aucune alerte (seuil strict)', () => {
    expect(signalees([esp('F1', 3000, IF_A), esp('F2', 2000, IF_A)])).toEqual([])
  })

  it('3. 4 000 en espèces + 1 500 par virement → le virement n\'entre pas dans le cumul : aucune alerte', () => {
    expect(signalees([esp('F1', 4000, IF_A), esp('F2', 1500, IF_A, '4-VIREMENT')])).toEqual([])
    expect(signalees([esp('F1', 4000, IF_A), esp('F2', 1500, IF_A, '3-CHEQUE')])).toEqual([])
  })

  it('4. deux tiers différents : leurs montants ne se cumulent jamais', () => {
    expect(signalees([esp('F1', 4000, IF_A), esp('F2', 4000, IF_B)])).toEqual([])
    expect(signalees([esp('F1', 4000, IF_A), esp('F2', 4000, IF_B), esp('F3', 1500, IF_A)])).toEqual([0, 2]) // seul le tiers A dépasse
  })

  it('5. le même tiers est reconnu par son IF, même si son nom ou son ICE diffèrent d\'une facture à l\'autre', () => {
    expect(signalees([
      esp('F1', 4000, { identifiant_fiscal: '111', libelle_fournisseur: 'SOCIETE ATLAS', ice: '001' }),
      esp('F2', 1500, { identifiant_fiscal: ' 111 ', libelle_fournisseur: 'Atlas SARL', ice: '' }),
    ])).toEqual([0, 1])
  })

  it('6. à défaut d\'IF, le tiers est reconnu par son ICE (et un IF n\'est jamais confondu avec un ICE)', () => {
    expect(signalees([esp('F1', 4000, { ice: '001234' }), esp('F2', 1500, { ice: '001 234' })])).toEqual([0, 1])
    expect(signalees([esp('F1', 4000, { identifiant_fiscal: '001234' }), esp('F2', 1500, { ice: '001234' })])).toEqual([])
  })

  it('7. tiers NON enregistré dans Via Experts : reconnu à partir de ses factures (nom normalisé) ; nom trop vague : jamais regroupé', () => {
    expect(cleFournisseur({ libelle_fournisseur: 'Société  Élan du Sud' })).toBe('LIB:SOCIETE ELAN DU SUD')
    expect(signalees([esp('F1', 4000, { libelle_fournisseur: 'Société Élan' }), esp('F2', 1500, { libelle_fournisseur: 'SOCIETE   ELAN' })])).toEqual([0, 1])
    // Génériques ou trop courts : aucune identité fiable → chaque facture est jugée seule.
    for (const nom of ['Divers', 'Client', 'AB', '']) {
      expect(signalees([esp('F1', 4000, { libelle_fournisseur: nom }), esp('F2', 1500, { libelle_fournisseur: nom })]), nom).toEqual([])
    }
    expect(signalees([esp('F1', 6000, { libelle_fournisseur: 'Divers' })])).toEqual([0]) // seule, elle dépasse quand même
  })

  it('8-9. factures ÉMISES (clients) comme factures REÇUES (fournisseurs) : même règle sur les deux pages', () => {
    // La règle est la même pour les deux pages ; les clients et les fournisseurs ne se mélangent pas car chaque déclaration porte un seul type
    // (le serveur ne renvoie que les règlements du même type : voir FacturesExistantesTest).
    const clients = [esp('V1', 4000, { identifiant_fiscal: '900' }), esp('V2', 1500, { identifiant_fiscal: '900' })]
    const fournisseurs = [esp('A1', 4000, { identifiant_fiscal: '111' }), esp('A2', 1500, { identifiant_fiscal: '111' })]
    expect(signalees(clients)).toEqual([0, 1])
    expect(signalees(fournisseurs)).toEqual([0, 1])
    const page = lire('pages/DeclarationTVA.jsx')
    for (const f of ['export function DeclarationForm', 'export function ChiffreAffairesForm']) expect(page).toContain(f)
  })

  it('10. une facture de plus de 5 000 réglée par virement ne déclenche aucune alerte orange', () => {
    expect(signalees([esp('F1', 6000, IF_A, '4-VIREMENT')])).toEqual([])
    expect(signalees([{ fact_num: 'F1', ttc: 6000, id_paie: '', ...IF_A }], [], '4-VIREMENT')).toEqual([]) // mode porté par l'en-tête
    expect(signalees([{ fact_num: 'F1', ttc: 6000, id_paie: '', ...IF_A }], [], '1-ESPECES')).toEqual([0])
  })

  it('cumul avec les factures déjà ENREGISTRÉES du même tiers (autres déclarations), sans double comptage', () => {
    const enregistrees = [
      { declarationId: 3, factNum: 'OLD-1', identifiantFiscal: '111', ice: '', libelleFournisseur: '', ttc: '4000.00' },
      { declarationId: 5, factNum: 'OLD-2', identifiantFiscal: '222', ice: '', libelleFournisseur: '', ttc: '9000.00' }, // autre tiers
    ]
    const analyse = analyserEspeces([esp('F1', 1500, IF_A)], '', enregistrees)
    expect([...analyse.lignesSignalees]).toEqual([0])
    expect(analyse.depassements[0]).toMatchObject({ total: 5500, totalEnregistre: 4000, declarations: [3] })
    // La même facture déjà enregistrée ET saisie dans le tableau n'est comptée qu'une fois.
    expect(signalees([esp('OLD-1', 4000, IF_A), esp('F9', 900, IF_A)], enregistrees)).toEqual([]) // 4 900, pas 8 900
    // Une facture saisie deux fois dans le tableau (doublon) n'est comptée qu'une fois.
    expect(signalees([esp('F1', 3000, IF_A), esp('F1', 3000, IF_A)])).toEqual([])
    // Un tiers absent du tableau ne déclenche rien (aucune ligne à colorer).
    expect(signalees([esp('Z', 100, { identifiant_fiscal: '333' })], enregistrees)).toEqual([])
  })

  it('11. doublon de facture : l\'alerte rouge (cellule du numéro) reste indépendante et prioritaire sur le numéro', () => {
    const lignes = [esp('F1', 3000, IF_A), esp('F1', 3000, IF_A), esp('F2', 3000, IF_A)]
    expect([...analyserDoublons(lignes).keys()]).toEqual([0, 1])
    expect(fondDeCellule('fact_num', { doublon: true, especes: true }).cellule).toBe('bg-danger-700') // le numéro reste rouge foncé
    expect(fondDeCellule('ttc', { doublon: true, especes: true }).cellule).toBe('bg-warning-200')
  })

  it('aucun texte, badge, bannière ni notification pour le dépassement : seulement la couleur des cellules TTC', () => {
    const page = lire('pages/DeclarationTVA.jsx')
    for (const interdit of ['Le cumul des paiements en espèces', 'cumul en espèces', 'déjà enregistrés : déclaration', 'Simple avertissement', 'Seuil espèces', 'cases TTC en orange']) {
      expect(page, interdit).not.toContain(interdit)
    }
    // La seule bannière restante du formulaire concerne l'OCR, pas ces alertes.
    expect(page).not.toMatch(/analyseEspeces\.depassements/)
  })
})

describe('couleurs : seulement la cellule concernée, jamais la ligne entière', () => {
  it('rouge sur la cellule FACT NUM d\'un doublon, orange sur la cellule TTC des espèces, rien ailleurs', () => {
    const aucun = { cellule: '', champ: '' }
    expect(fondDeCellule('fact_num', { doublon: false, especes: false })).toEqual(aucun)
    expect(fondDeCellule('fact_num', { doublon: true, especes: false }).cellule).toBe('bg-danger-700') // rouge foncé
    expect(fondDeCellule('fact_num', { doublon: true, especes: false }).champ).toContain('bg-danger-700!')
    expect(fondDeCellule('fact_num', { doublon: true, especes: false }).champ).toContain('text-white!') // numéro lisible sur le fond foncé
    expect(fondDeCellule('ttc', { doublon: false, especes: true }).cellule).toBe('bg-warning-200')
    // Une ligne en doublon : seule la cellule du numéro devient rouge (ni TTC, ni désignation, ni fournisseur…).
    for (const cle of ['ordre_ref', 'designation', 'ht', 'tva', 'ttc', 'identifiant_fiscal', 'libelle_fournisseur', 'ice', 'taux', 'id_paie', 'date_paie', 'date_fac']) {
      expect(fondDeCellule(cle, { doublon: true, especes: false }), cle).toEqual(aucun)
    }
    // Une ligne en espèces > 5 000 Dh : seule la cellule TTC devient orange.
    expect(fondDeCellule('fact_num', { doublon: false, especes: true })).toEqual(aucun)
    // Les deux avertissements se cumulent, chacun sur sa cellule.
    expect(fondDeCellule('fact_num', { doublon: true, especes: true }).cellule).toBe('bg-danger-700')
    expect(fondDeCellule('ttc', { doublon: true, especes: true }).cellule).toBe('bg-warning-200')
    // Le rouge foncé n'est utilisé que pour le doublon, l'orange que pour la cellule TTC : aucune autre combinaison.
    expect(fondDeCellule('ttc', { doublon: true, especes: false }).cellule).toBe('')
    expect(fondDeCellule('fact_num', { doublon: false, especes: true }).cellule).toBe('')
  })
})

describe('les avertissements ne bloquent rien', () => {
  const page = lire('pages/DeclarationTVA.jsx')

  it('les deux pages partagent le même tableau, les mêmes règles et la même vérification', () => {
    expect(page).toContain("from '../utils/controlesFactures.js'")
    expect(page).toContain('analyserDoublons(lignes, existantes)')
    expect(page).toContain('analyserEspeces(lignes, form.identifiant_paiement, especesEnregistrees)')
    expect(page).toContain('especesExistantes(type,')
    expect(page).toContain('facturesExistantes(type,')
    expect(page).toContain('fondDeCellule(c.cle, { doublon: Boolean(doublon), especes })')
    for (const f of ['export function DeclarationForm', 'export function ChiffreAffairesForm']) expect(page).toContain(f)
  })

  it('l\'enregistrement et l\'export ne dépendent ni des doublons ni des espèces', () => {
    const enregistrer = page.slice(page.indexOf('const enregistrer = async'), page.indexOf('const err = (k)'))
    const exporter = page.slice(page.indexOf('const exporter = (format)'), page.indexOf('const boutonExport'))
    for (const bloc of [enregistrer, exporter]) {
      expect(bloc).not.toMatch(/\bdoublons\b|setExistantes|analyserDoublons|analyseEspeces|lignesSignalees|especesEnregistrees/)
    }
    // Aucun bouton de sauvegarde n'est désactivé par un avertissement.
    expect(page).not.toMatch(/disabled=\{[^}]*(doublons|analyseEspeces)/)
  })

  it('aucun message ni badge pour un doublon : seulement la couleur de la cellule, et la ligne n\'est pas colorée', () => {
    expect(page).not.toMatch(/>\s*Doublon\s*</)
    expect(page).not.toContain('bg-danger-600 px-1.5')
    expect(page).not.toContain('AlertTriangle')
    expect(page).not.toContain('messageDoublon')
    expect(page).not.toContain('en doublon pour le même fournisseur')
    expect(page).not.toContain('fondDeLigne')
    // Espèces : la case TTC est orange, sans mention sous la case ni liseré ; l'explication du cumul est donnée une seule fois,
    // dans un encadré informatif au-dessus du tableau (voir « message du cumul » plus bas).
    expect(page).not.toContain('cumulés pour ce fournisseur')
    expect(page).not.toContain('signalee')
    // Le fond est posé sur la cellule (td) et son champ, jamais sur la ligne (tr).
    expect(page).toContain('className={`border border-line p-1 ${fond.cellule}`}')
    expect(page).toContain('<tr key={i} className="align-top transition-colors hover:bg-brand-50/40">')
  })

  it('le contrôle des factures enregistrées est en lecture seule et tolère une erreur réseau', () => {
    expect(page).toContain('.catch(() => { if (actif) setExistantes([]) })')
    const api = lire('api/declarationsTva.js')
    expect(api).toContain('/factures-existantes')
  })
})
