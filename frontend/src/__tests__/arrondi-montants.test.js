// Prix HT arrondis, quantités entières, soldes, mode de paiement « Autre », unicité d'entreprise, filtres et onglets.
// Environnement Node : fonctions pures + analyse du texte des pages (convention des autres tests du projet).
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { arrondirPrix, enNombre, prixArrondiEnTexte, prixConserveOuArrondi } from '../utils/arrondi.js'
import { montantAPayer, quantiteEntiere, saisieQuantite, soldeRestant } from '../utils/montants.js'
import {
  MODE_A_DETERMINER, composerModeAutre, estModeAutre, modePourEnvoi, precisionModeAutre,
} from '../utils/modePaiement.js'
import { MESSAGES_DOUBLON, normaliserNom, trouverDoublons } from '../utils/doublonsEntreprise.js'
import { SITUATIONS, compterParSituation, filtrerParSituation, situationValide } from '../utils/situationsEntreprise.js'
import { TUILES_STATUT, repartirParTuile, tuileValide } from '../modules/domiciliation/utils/ongletsStatut.js'
import { PERIODES, PERIODE_PAR_DEFAUT } from '../modules/domiciliation/utils/periodeAnalyse.js'
import { construireSeries } from '../utils/seriesDomiciliation.js'
import TuilesStatut from '../modules/domiciliation/components/TuilesStatut.jsx'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('arrondi des prix HT (décimale < 0,50 → inférieur, ≥ 0,50 → supérieur)', () => {
  it.each([
    [104.17, 104], [100.8, 101], [100.5, 101], [100.49, 100], [104, 104], [0, 0], [0.5, 1], [0.49, 0], [99.99, 100], [1000.5, 1001],
  ])('%s → %s', (entree, attendu) => {
    expect(arrondirPrix(entree)).toBe(attendu)
  })

  it('accepte une saisie texte avec virgule, et ne plante pas sur une saisie invalide', () => {
    expect(arrondirPrix('100,50')).toBe(101)
    expect(arrondirPrix('104.17')).toBe(104)
    expect(arrondirPrix('')).toBe(0)
    expect(arrondirPrix('abc')).toBe(0)
    expect(enNombre(null)).toBe(0)
  })

  it('pas d\'erreur de flottant sur les demi-valeurs', () => {
    expect(arrondirPrix('2.50')).toBe(3)
    expect(arrondirPrix('1.005')).toBe(1)
  })

  it('un champ vide reste vide', () => {
    expect(prixArrondiEnTexte('')).toBe('')
    expect(prixArrondiEnTexte('  ')).toBe('')
    expect(prixArrondiEnTexte('104.17')).toBe('104')
  })

  it('un prix historique inchangé n\'est pas réécrit ; un prix modifié est arrondi', () => {
    expect(prixConserveOuArrondi('104.17', '104.17')).toBe(104.17)
    expect(prixConserveOuArrondi('104.17', '99.00')).toBe(104)
    expect(prixConserveOuArrondi('100.50', undefined)).toBe(101)
    expect(prixConserveOuArrondi('100.50', '')).toBe(101)
  })
})

describe('quantités entières', () => {
  it.each([['3', 3], [3, 3], ['3.7', 3], ['3,7', 3], ['', 0], [null, 0], ['abc', 0], ['-2', 2], ['007', 7], [0, 0]])('%j → %j', (entree, attendu) => {
    expect(quantiteEntiere(entree)).toBe(attendu)
  })

  it('saisie : chiffres seuls, partie décimale d\'un texte collé ignorée (« 2,7 » → « 2 »)', () => {
    expect(saisieQuantite('2,7')).toBe('2')
    expect(saisieQuantite('2.7')).toBe('2')
    expect(saisieQuantite('12a')).toBe('12')
    expect(saisieQuantite('')).toBe('')
    expect(saisieQuantite(null)).toBe('')
  })

  it('le résultat est toujours un entier, quelle que soit la saisie', () => {
    expect(Number.isInteger(quantiteEntiere('2.5'))).toBe(true)
    expect(Number.isInteger(quantiteEntiere('1e3'))).toBe(true)
  })

  it.each([
    'modules/facturation/pages/DocumentForm.jsx',
    'pages/PaiementForm.jsx',
  ])('%s : champ quantité numérique entier, envoi par quantiteEntiere()', (rel) => {
    const source = lire(rel)
    expect(source).toContain('inputMode="numeric"')
    expect(source).toContain('pattern="[0-9]*"')
    expect(source).toMatch(/quantite: quantiteEntiere\(l\.quantite\)/)
    expect(source).toContain('saisieQuantite(e.target.value)')
  })
})

describe('solde et « Prix à payer »', () => {
  it('solde = total − déjà payé, au centime, jamais négatif', () => {
    expect(soldeRestant(1200, 0)).toBe(1200)
    expect(soldeRestant(1200, 500)).toBe(700)
    expect(soldeRestant('1200.10', '0.10')).toBe(1200)
    expect(soldeRestant(100, 100)).toBe(0)
    expect(soldeRestant(100, 150)).toBe(0)
    expect(soldeRestant(0.3, 0.1)).toBe(0.2) // pas de 0.19999999999999998
  })

  it('facture rattachée : le montant proposé est le SOLDE, pas le total', () => {
    expect(montantAPayer({ totalTtc: 1200, prixPaye: 500 }, 9999)).toBe('700.00')
    expect(montantAPayer({ totalTtc: 1200, prixPaye: 0 }, 9999)).toBe('1200.00')
  })

  it('facture déjà soldée : rien à payer (champ vide, pas de double paiement)', () => {
    expect(montantAPayer({ totalTtc: 1200, prixPaye: 1200 }, 0)).toBe('')
    expect(montantAPayer({ totalTtc: 1200, prixPaye: 1300 }, 0)).toBe('')
    expect(montantAPayer({ prixRestant: 0 }, 50)).toBe('')
  })

  it('le solde calculé par le serveur (prixRestant) prime sur le recalcul local', () => {
    expect(montantAPayer({ totalTtc: 1200, prixPaye: 0, prixRestant: 300 }, 0)).toBe('300.00')
  })

  it('sans facture : total des lignes du paiement ; sans ligne : vide', () => {
    expect(montantAPayer(null, 250)).toBe('250.00')
    expect(montantAPayer(null, 0)).toBe('')
  })

  it('« Prix à payer » est exact (TTC au centime), jamais arrondi à l\'entier', () => {
    expect(montantAPayer({ totalTtc: 1200.6, prixPaye: 0 }, 0)).toBe('1200.60')
  })
})

describe('mode de paiement « Autres à déterminer »', () => {
  it('précision saisie → « Autre : … », vide → retour à « Autres à déterminer »', () => {
    expect(composerModeAutre('Mandat')).toBe('Autre : Mandat')
    expect(composerModeAutre('')).toBe(MODE_A_DETERMINER)
    expect(composerModeAutre('   ')).toBe(MODE_A_DETERMINER)
  })

  it('la précision est relue telle qu\'enregistrée (ré-affichage)', () => {
    expect(estModeAutre('Autre : Mandat')).toBe(true)
    expect(estModeAutre(MODE_A_DETERMINER)).toBe(true)
    expect(estModeAutre('Virement')).toBe(false)
    expect(precisionModeAutre('Autre : Mandat bancaire')).toBe('Mandat bancaire')
    expect(precisionModeAutre('Virement')).toBe('')
  })

  it('envoi : espaces de bord retirés, longueur limitée à celle du serveur, modes de la liste inchangés', () => {
    expect(modePourEnvoi('Autre : Mandat  ')).toBe('Autre : Mandat')
    expect(modePourEnvoi('Virement')).toBe('Virement')
    expect(modePourEnvoi('')).toBe('')
    expect(composerModeAutre('x'.repeat(50)).length).toBeLessThanOrEqual(40)
  })

  it('les formulaires de domiciliation, facture et paiement affichent le champ « Précisez »', () => {
    expect(lire('components/ModePaiementChamp.jsx')).toContain('Précisez le mode de paiement')
    for (const rel of ['modules/facturation/pages/DocumentForm.jsx', 'pages/PaiementForm.jsx', 'pages/EntrepriseForm.jsx',
      'modules/domiciliation/pages/DomiciliationForm.jsx', 'modules/domiciliation/components/DomiciliationActions.jsx']) {
      expect(lire(rel), rel).toContain('<ModePaiementChamp')
    }
  })
})

describe('unicité d\'une entreprise : dénomination, ICE, IF', () => {
  const existantes = [
    { id: 1, denomination: 'Société Atlas', ice: '001234567890123', if: '1234567' },
    { id: 2, denomination: 'Beta Conseil', ice: '', if: '' },
  ]

  it('dénomination en double, sans tenir compte de la casse, des accents ni des espaces multiples', () => {
    expect(trouverDoublons({ denomination: '  SOCIETE   atlas ' }, existantes).denomination).toEqual([MESSAGES_DOUBLON.denomination])
    expect(normaliserNom('Société  X')).toBe('societe x')
  })

  it('ICE et IF en double sont signalés séparément, avec leur propre message', () => {
    const erreurs = trouverDoublons({ denomination: 'Nouvelle', ice: '001234567890123', if: '1234567' }, existantes)
    expect(erreurs.ice).toEqual([MESSAGES_DOUBLON.ice])
    expect(erreurs.if).toEqual([MESSAGES_DOUBLON.if])
    expect(erreurs.denomination).toBeUndefined()
  })

  it('valeurs vides : jamais un doublon', () => {
    expect(trouverDoublons({ denomination: '', ice: '', if: '' }, existantes)).toEqual({})
  })

  it('modification : l\'entreprise n\'est pas son propre doublon ; une dénomination inchangée n\'est pas recontrôlée', () => {
    expect(trouverDoublons({ denomination: 'Société Atlas', ice: '001234567890123', if: '1234567' }, existantes, { idCourant: 1 })).toEqual({})
    expect(trouverDoublons({ denomination: 'Société Atlas' }, existantes, { idCourant: 9, denominationOrigine: 'Société Atlas' })).toEqual({})
    // …mais en prendre une autre est bien refusé.
    expect(trouverDoublons({ denomination: 'Beta Conseil' }, existantes, { idCourant: 1 }).denomination).toBeDefined()
  })

  it('RC et TP ne sont pas contrôlés ici (règles existantes inchangées)', () => {
    expect(trouverDoublons({ denomination: 'Unique', rc: '123', tp: '456' }, [{ id: 3, denomination: 'Autre', rc: '123', tp: '456' }])).toEqual({})
    expect(lire('pages/EntrepriseForm.jsx')).toContain('trouverDoublons(')
  })
})

describe('liste des entreprises : situations en filtres', () => {
  const lignes = [
    { id: 1, situation: 'Normale' }, { id: 2, situation: 'Bloqué' }, { id: 3, situation: 'Liste Noire' }, { id: 4, situation: 'Normale' },
  ]

  it('les valeurs sont celles de la base ; la demande inconnue retombe sur « toutes »', () => {
    expect(SITUATIONS.map((s) => s.valeur)).toEqual(['', 'Normale', 'Bloqué', 'Liste Noire'])
    expect(situationValide('Bloqué')).toBe('Bloqué')
    expect(situationValide('nimportequoi')).toBe('')
    expect(situationValide(null)).toBe('')
  })

  it('filtre et compteurs', () => {
    expect(filtrerParSituation(lignes, '').map((r) => r.id)).toEqual([1, 2, 3, 4])
    expect(filtrerParSituation(lignes, 'Bloqué').map((r) => r.id)).toEqual([2])
    expect(filtrerParSituation(lignes, 'Liste Noire').map((r) => r.id)).toEqual([3])
    expect(compterParSituation(lignes)).toEqual({ '': 4, Normale: 2, Bloqué: 1, 'Liste Noire': 1 })
  })

  it('les anciennes entrées de la sidebar ont disparu et leurs adresses redirigent vers le filtre', async () => {
    const { nav } = await import('../components/navConfig.js')
    const entreprise = nav.find((g) => g.label === 'Entreprise')
    expect(entreprise.children.map((c) => c.to)).toEqual(['/entreprises/nouvelle', '/entreprises'])
    const app = lire('App.jsx')
    expect(app).toContain('/entreprises?situation=Liste%20Noire')
    expect(app).toContain('/entreprises?situation=Bloqu%C3%A9')
  })
})

describe('gestion de domiciliation : tuiles de statut avec compteurs', () => {
  const ligne = (id, statutAffichage, extra = {}) => ({
    id, statutAffichage, entrepriseId: id, denomination: `E${id}`, dateDepart: '2026-01-01', renouvelleDeId: null, ...extra,
  })

  it('les huit tuiles de la capture, « Total en cours » par défaut', () => {
    expect(TUILES_STATUT.map((t) => t.label)).toEqual([
      'Total en cours', 'Nouveaux', 'Renouvelés', 'Expire bientôt', 'Expirées', 'Déclarées', 'Résiliées', 'Archivées',
    ])
    expect(tuileValide('')).toBe('total')
    expect(tuileValide(null)).toBe('total')
    expect(tuileValide('inconnu')).toBe('total')
    expect(tuileValide('alerte')).toBe('alerte')
  })

  const MAINTENANT = new Date(2026, 9, 14) // 14/10/2026

  it('chaque domiciliation reste accessible dans la tuile de son statut ; les actions comptent sur la période (règle d\'Expense Ratio)', () => {
    const lignes = [
      ligne(1, 'active', { dateDepart: '2026-09-20' }),
      ligne(2, 'alerte', { dateDepart: '2025-11-15' }),
      ligne(3, 'expire', { dateDepart: '2024-01-10' }),
      ligne(4, 'declare', { dateDepart: '2026-03-01', dateDeclaration: '2026-03-20' }),
      ligne(5, 'resilie', { dateDepart: '2026-02-01', dateResiliation: '2026-08-01' }),
    ]
    const parTuile = repartirParTuile(lignes, [ligne(9, 'active')], PERIODE_PAR_DEFAUT, MAINTENANT)
    expect(parTuile.total.map((r) => r.id)).toEqual([1, 2]) // en cours : ni expirée (3), ni déclarée (4), ni résiliée (5)
    expect(parTuile.alerte.map((r) => r.id)).toEqual([2])
    expect(parTuile.expire.map((r) => r.id)).toEqual([3])
    // 12 derniers mois : « Nouveaux » = premières périodes dont le départ tombe dans la fenêtre, TOUS STATUTS (la 3 date de 2024 : hors fenêtre).
    expect(parTuile.nouveau.map((r) => r.id)).toEqual([1, 2, 4, 5])
    expect(parTuile.declare.map((r) => r.id)).toEqual([4])
    expect(parTuile.resilie.map((r) => r.id)).toEqual([5])
    expect(parTuile.renouvele).toEqual([])
    expect(parTuile.archive.map((r) => r.id)).toEqual([9]) // la liste « archive » du serveur
    // Une date en dehors de la période (ici 7 jours) n'est pas comptée.
    const court = repartirParTuile(lignes, [], PERIODES[0], MAINTENANT)
    expect(court.nouveau).toEqual([])
    expect(court.declare).toEqual([])
    expect(court.resilie).toEqual([])
  })

  it('« Total en cours » : périodes réellement en cours à la date du jour, une ligne par période (pas par entreprise)', () => {
    const lignes = [
      // Même entreprise, deux périodes en cours : comptée deux fois.
      ligne(1, 'active', { entrepriseId: 7, dateDepart: '2026-03-01', dateFin: '2027-03-01' }),
      ligne(2, 'active', { entrepriseId: 7, dateDepart: '2026-08-19', dateFin: '2027-02-19' }),
      // Commence dans le futur : exclue.
      ligne(3, 'active', { entrepriseId: 8, dateDepart: '2026-10-15', dateFin: '2027-10-15', renouvelleDeId: 4 }),
      // Terminée et remplacée par un renouvellement actif (le serveur la dit « active ») : exclue.
      ligne(4, 'active', { entrepriseId: 8, dateDepart: '2025-09-28', dateFin: '2026-09-27' }),
      // Terminée sans renouvellement : « expire », exclue.
      ligne(5, 'expire', { entrepriseId: 9, dateDepart: '2025-01-10', dateFin: '2026-01-10' }),
      // Dernier jour (fin = aujourd'hui) et premier jour (départ = aujourd'hui) : encore en cours.
      ligne(6, 'alerte', { entrepriseId: 10, dateDepart: '2025-10-14', dateFin: '2026-10-14' }),
      ligne(7, 'active', { entrepriseId: 11, dateDepart: '2026-10-14', dateFin: '2027-10-14' }),
      // Résiliée / déclarée : exclues.
      ligne(8, 'resilie', { entrepriseId: 12, dateDepart: '2026-01-01', dateFin: '2027-01-01' }),
      ligne(9, 'declare', { entrepriseId: 13, dateDepart: '2026-01-01', dateFin: '2027-01-01' }),
      // Échéance sous 30 jours, non renouvelée : toujours en cours.
      ligne(10, 'alerte', { entrepriseId: 14, dateDepart: '2025-11-01', dateFin: '2026-10-25' }),
    ]
    const parTuile = repartirParTuile(lignes, [ligne(20, 'active')], PERIODE_PAR_DEFAUT, MAINTENANT)
    expect(parTuile.total.map((r) => r.id)).toEqual([1, 2, 6, 7, 10])
    // Les autres tuiles ne changent pas.
    expect(parTuile.expire.map((r) => r.id)).toEqual([5])
    expect(parTuile.alerte.map((r) => r.id)).toEqual([6, 10])
    expect(parTuile.resilie).toEqual([]) // tuile d'action : pas de date de résiliation dans ces lignes
    expect(parTuile.archive.map((r) => r.id)).toEqual([20])
  })

  it('« Renouvelés » : périodes qui en prolongent une autre, tous statuts, dont le départ est dans la période', () => {
    const lignes = [
      ligne(1, 'expire', { entrepriseId: 10, dateDepart: '2025-12-01' }),
      ligne(2, 'active', { entrepriseId: 10, dateDepart: '2026-06-01', renouvelleDeId: 1 }),
      ligne(3, 'declare', { entrepriseId: 10, dateDepart: '2026-08-01', renouvelleDeId: 2 }),
    ]
    const parTuile = repartirParTuile(lignes, [], PERIODE_PAR_DEFAUT, MAINTENANT)
    expect(parTuile.renouvele.map((r) => r.id)).toEqual([2, 3])
    expect(parTuile.nouveau.map((r) => r.id)).toEqual([1])
  })

  it('les 4 tuiles d\'actions affichent EXACTEMENT les nombres d\'Expense Ratio, pour chaque période', () => {
    const lignes = [
      ligne(1, 'active', { entrepriseId: 1, dateDepart: '2026-10-10' }),
      ligne(2, 'active', { entrepriseId: 1, dateDepart: '2026-10-13', renouvelleDeId: 1 }),
      ligne(3, 'expire', { entrepriseId: 2, dateDepart: '2026-04-05' }),
      ligne(4, 'declare', { entrepriseId: 3, dateDepart: '2026-07-14', dateDeclaration: '2026-07-30' }),
      ligne(5, 'resilie', { entrepriseId: 4, dateDepart: '2026-01-02', dateResiliation: '2026-10-01' }),
      ligne(6, 'declare', { entrepriseId: 5, dateDepart: '2025-12-30', dateDeclaration: '2026-01-05' }),
      ligne(7, 'resilie', { entrepriseId: 6, dateDepart: '2026-09-01', dateResiliation: '2027-01-01' }), // résiliation FUTURE : hors période
    ]
    for (const periode of PERIODES) {
      const points = construireSeries(lignes, periode, MAINTENANT)
      const total = (cle) => points.reduce((a, p) => a + p[cle], 0)
      const parTuile = repartirParTuile(lignes, [], periode, MAINTENANT)
      expect(parTuile.nouveau.length, `Nouveaux ${periode.cle}`).toBe(total('nouveau'))
      expect(parTuile.renouvele.length, `Renouvelés ${periode.cle}`).toBe(total('renouveler'))
      expect(parTuile.declare.length, `Déclarées ${periode.cle}`).toBe(total('declary'))
      expect(parTuile.resilie.length, `Résiliées ${periode.cle}`).toBe(total('resilier'))
    }
  })

  it('la page propose la même période que la flèche d\'Expense Ratio (12 derniers mois par défaut) et la garde dans l\'adresse', () => {
    const liste = lire('modules/domiciliation/pages/DomiciliationList.jsx')
    expect(liste).toContain("periodeValide(params.get('periode'))")
    expect(liste).toContain('id="periode-tuiles"')
    expect(liste).toContain('PERIODES.map((p)')
    expect(PERIODE_PAR_DEFAUT.cle).toBe('12m')
  })

  it('les tuiles sont intégrées dans la carte du tableau, au-dessus de la barre de recherche (prop beforeToolbar)', () => {
    const liste = lire('modules/domiciliation/pages/DomiciliationList.jsx')
    expect(liste).toContain('beforeToolbar={(')
    expect(liste.indexOf('beforeToolbar')).toBeLessThan(liste.indexOf('<TuilesStatut'))
    const table = lire('components/ui/Table.jsx')
    expect(table.indexOf('{beforeToolbar &&')).toBeLessThan(table.indexOf('type="search"'))
    expect(table).toContain('xl:grid-cols-[1fr_minmax(0,40rem)_1fr]') // barre de recherche large et centrée
    expect(table).toContain('CLASSE_SELECT_BLEU')
  })

  it('la page : tuiles au-dessus du tableau, adresse ?statut=, impression des quatre documents, plus de page « List Domiciliation »', () => {
    const liste = lire('modules/domiciliation/pages/DomiciliationList.jsx')
    expect(liste).toContain('<TuilesStatut tuiles={TUILES_STATUT}')
    expect(liste).toContain("params.get('statut')")
    expect(liste).toContain('<MenuImprimer domiciliation={r} signaturePath={signaturePath} tous />')
    expect(fs.existsSync(path.join(SRC, 'modules/domiciliation/pages/DomiciliationStatuts.jsx'))).toBe(false)
  })

  it('le composant : un vrai bouton par tuile (aria-pressed), bandeau coloré, grand nombre, tuile choisie entourée', () => {
    const composant = lire('modules/domiciliation/components/TuilesStatut.jsx')
    expect(composant).toContain('aria-pressed={choisie}')
    expect(composant).toContain('text-[22px]')
    expect(composant).toContain('xl:grid-cols-8')
    const html = renderToStaticMarkup(createElement(TuilesStatut, {
      tuiles: TUILES_STATUT, comptes: { total: 2, nouveau: 1, alerte: 1, declare: 1 }, selection: 'total', onSelect: () => {},
    }))
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(7)
    expect(html).toContain('Expire bientôt')
    expect(html.match(/<button/g)).toHaveLength(8)
  })
})

describe('centres de domiciliation : colonne ACTIONS comme la liste des clients', () => {
  it('crayon (Modifier) + menu d\'actions avec Afficher / Archiver / corbeille, confirmation d\'archivage conservée', () => {
    const centres = lire('modules/domiciliation/pages/DomiciliationCentres.jsx')
    expect(centres).toContain('icon={<IconeActions />}')
    expect(centres).toContain('<IconeModifier />')
    expect(centres).toMatch(/label: 'Afficher'[\s\S]*navigate\(`\/domiciliation\/centres\/\$\{r\.id\}`\)/)
    expect(centres).toContain('onClick: () => setArchivagePour(r)')
    expect(centres).toContain('onClick: () => setSuppressionPour(r)')
  })
})

describe('prix des services en HT', () => {
  it('les libellés de prix indiquent HT, sans retirer la gestion de la TVA', () => {
    expect(lire('pages/ServicesList.jsx')).toContain("header: 'Prix HT'")
    expect(lire('pages/ServicesList.jsx')).toContain('label="Prix HT (Dh)"')
    expect(lire('modules/domiciliation/pages/DomiciliationDetails.jsx')).toContain('Prix Total (Dh HT)')
    expect(lire('components/navConfig.js')).toContain('/declaration-tva')
  })
})
