// Caractérisation du frontend Facturation (migration Modular Monolith — étape 14).
// Écrit AVANT le déplacement dans `modules/facturation/` : décrit l'existant (appels API, routes, navigation, pages) pour
// prouver qu'il ne change pas. Environnement Node : on teste des fonctions pures, des chemins d'import et le texte des
// routes, sans rendre de composant.
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/http.js', () => ({ apiFetch: vi.fn(async () => ({ data: { ok: true } })) }))

import { apiFetch } from '../api/http.js'
import * as apiFacturation from '../modules/facturation/api/facturation.js'
import { nav as NAV } from '../components/navConfig.js'

const SRC = path.resolve(__dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('API Facturation : URLs, méthodes et corps inchangés', () => {
  beforeEach(() => apiFetch.mockClear())

  it('listDocuments / getDocument / getNumeroPropose', async () => {
    await apiFacturation.listDocuments('facture')
    await apiFacturation.listDocuments('devis', { status: 'archive', responsable: 'A B' })
    await apiFacturation.getDocument('bl', 12)
    await apiFacturation.getNumeroPropose('avoir', 'via_experts')
    expect(apiFetch.mock.calls).toEqual([
      ['/api/v1/facturation/facture?status=actif'],
      ['/api/v1/facturation/devis?status=archive&responsable=A+B'],
      ['/api/v1/facturation/bl/12'],
      ['/api/v1/facturation/avoir/numero-propose?emetteur=via_experts'],
    ])
  })

  it('createDocument / updateDocument / actions / suppression', async () => {
    const payload = { numero: 'F-1' }
    await apiFacturation.createDocument('facture', payload)
    await apiFacturation.updateDocument('facture', 5, payload)
    await apiFacturation.archiveDocument('devis', 5)
    await apiFacturation.corbeilleDocument('bl', 6)
    await apiFacturation.restoreDocument('avoir', 7)
    await apiFacturation.deleteDocumentForever('facture', 8)
    expect(apiFetch.mock.calls).toEqual([
      ['/api/v1/facturation/facture', { method: 'POST', body: payload }],
      ['/api/v1/facturation/facture/5', { method: 'PUT', body: payload }],
      ['/api/v1/facturation/devis/5/archive', { method: 'POST' }],
      ['/api/v1/facturation/bl/6/corbeille', { method: 'POST' }],
      ['/api/v1/facturation/avoir/7/restore', { method: 'POST' }],
      ['/api/v1/facturation/facture/8', { method: 'DELETE' }],
    ])
  })

  it('les réponses sont dépaquetées (data) comme avant', async () => {
    expect(await apiFacturation.getDocument('facture', 1)).toEqual({ ok: true })
  })
})

describe('Routes React Facturation : mêmes URLs, mêmes composants et props', () => {
  const app = lire('App.jsx')
  const routes = [...app.matchAll(/<Route path="(\/facturation\/[^"]*)" element=\{<(Document(?:List|Form))\s+key="([^"]+)"\s+type="([^"]+)"/g)]
    .map((m) => ({ path: m[1], composant: m[2], key: m[3], type: m[4] }))

  it('12 routes, URLs et ordre inchangés', () => {
    expect(routes.map((r) => `${r.composant} ${r.path} ${r.type}`)).toEqual([
      'DocumentList /facturation/factures facture',
      'DocumentForm /facturation/factures/nouvelle facture',
      'DocumentForm /facturation/factures/:id/modifier facture',
      'DocumentList /facturation/devis devis',
      'DocumentForm /facturation/devis/nouveau devis',
      'DocumentForm /facturation/devis/:id/modifier devis',
      'DocumentList /facturation/bon-livraison bl',
      'DocumentForm /facturation/bon-livraison/nouveau bl',
      'DocumentForm /facturation/bon-livraison/:id/modifier bl',
      'DocumentList /facturation/avoir avoir',
      'DocumentForm /facturation/avoir/nouveau avoir',
      'DocumentForm /facturation/avoir/:id/modifier avoir',
    ])
  })

  it('chaque route garde un `key` distinct (état local réinitialisé en changeant de type)', () => {
    expect(new Set(routes.map((r) => r.key)).size).toBe(12)
  })

  it('aucune route Facturation en dehors de ces 12 (même nombre d\'occurrences de /facturation/)', () => {
    expect([...app.matchAll(/path="\/facturation\//g)]).toHaveLength(12)
  })

  it('les props de titre / libellés de chaque route sont conservées', () => {
    expect(app).toContain('title="Liste des Factures" addTo="/facturation/factures/nouvelle" addLabel="Ajouter Facture" editBase="/facturation/factures"')
    expect(app).toContain('title="Ajouter Facture" dateLabel="Date Facture" secondDateLabel="Date Paiement" listTo="/facturation/factures"')
    expect(app).toContain('title="Liste des Factures d\'Avoir" addTo="/facturation/avoir/nouveau" addLabel="Ajouter Facture d\'Avoir" editBase="/facturation/avoir"')
  })
})

describe('Navigation Facturation : libellés, liens et ordre inchangés', () => {
  it('le groupe Facturation du menu', () => {
    const groupe = NAV.find((g) => g.label === 'Facturation')
    expect(groupe.base).toBe('/facturation')
    expect(groupe.children.map((c) => [c.label, c.to])).toEqual([
      ['Ajouter Facture', '/facturation/factures/nouvelle'],
      ['Liste des Factures', '/facturation/factures'],
      ['Ajouter Devis', '/facturation/devis/nouveau'],
      ['Liste des Devis', '/facturation/devis'],
      ['Ajouter Bon de Livraison', '/facturation/bon-livraison/nouveau'],
      ['Liste des Bon de Livraison', '/facturation/bon-livraison'],
      ["Ajouter Facture d'Avoir", '/facturation/avoir/nouveau'],
      ["Liste des Factures d'Avoir", '/facturation/avoir'],
    ])
  })
})

describe('Pages Facturation : chargeables, mêmes exports', () => {
  it('DocumentList et DocumentForm exportent un composant par défaut ; imprimerDocument reste exporté', async () => {
    const liste = await import('../modules/facturation/pages/DocumentList.jsx')
    const formulaire = await import('../modules/facturation/pages/DocumentForm.jsx')
    expect(typeof liste.default).toBe('function')
    expect(typeof formulaire.default).toBe('function')
    expect(Object.keys(liste).sort()).toEqual(['default', 'imprimerDocument'])
    expect(Object.keys(formulaire)).toEqual(['default'])
  })
})

describe('Module Facturation : point d\'entrée public', () => {
  it('index.js expose l\'API, les pages et le rendu des documents', async () => {
    const index = await import('../modules/facturation/index.js')
    expect(Object.keys(index).sort()).toEqual([
      'DocumentForm', 'DocumentList', 'EMETTEURS', 'MODES_PAIEMENT', 'archiveDocument', 'construireHtmlDocumentCommercial',
      'corbeilleDocument', 'createDocument', 'deleteDocumentForever', 'getDocument', 'getNumeroPropose',
      'imprimerDocument', 'imprimerDocumentCommercial', 'listDocuments', 'restoreDocument', 'updateDocument',
    ])
  })

  it('les constantes partagées restent à un seul endroit (shared) et sont les mêmes objets partout', async () => {
    const partagees = await import('../shared/constants/documents.js')
    const index = await import('../modules/facturation/index.js')
    expect(index.EMETTEURS).toBe(partagees.EMETTEURS)
    expect(index.MODES_PAIEMENT).toBe(partagees.MODES_PAIEMENT)
  })
})

// ---- Garde-fous d'architecture (analyse statique des imports de src/) ----------------------------------------------
function fichiersSrc(dossier = SRC, sortie = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name)
    if (e.isDirectory()) fichiersSrc(p, sortie)
    else if (/\.(js|jsx)$/.test(e.name)) sortie.push(p)
  }
  return sortie
}
const RE_IMPORT = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g
function importsDe(fichier) {
  const src = fs.readFileSync(fichier, 'utf8')
  return [...src.matchAll(RE_IMPORT)].map((m) => path.resolve(path.dirname(fichier), m[1]))
}
const MODULE = path.join(SRC, 'modules', 'facturation')
const dansModule = (p) => p === MODULE || p.startsWith(MODULE + path.sep)
const estTest = (f) => f.includes(`${path.sep}__tests__${path.sep}`)

describe('Module Facturation : frontières et dépendances', () => {
  it('hors d\'un module, on n\'importe que son point d\'entrée index.js (Facturation, Paiements, Domiciliation)', () => {
    const fautes = []
    for (const nom of ['facturation', 'paiements', 'domiciliation']) {
      const dossier = path.join(SRC, 'modules', nom)
      const entree = path.join(dossier, 'index.js')
      const interne = (p) => p === dossier || p.startsWith(dossier + path.sep)
      for (const f of fichiersSrc().filter((x) => !interne(x) && !estTest(x))) {
        for (const cible of importsDe(f)) {
          if (interne(cible) && cible !== entree) fautes.push(`${path.relative(SRC, f)} -> ${path.relative(SRC, cible)}`)
        }
      }
    }
    expect(fautes).toEqual([])
  })

  it('le dossier shared/ et les utilitaires d\'impression communs ne dépendent d\'aucun module', () => {
    const communs = fichiersSrc().filter((f) => {
      const rel = path.relative(SRC, f).split(path.sep).join('/')
      return rel.startsWith('shared/') || rel.startsWith('utils/print/') || ['utils/exporters.js', 'utils/pdfDocument.js', 'utils/montantEnLettres.js', 'utils/format.js'].includes(rel)
    })
    expect(communs.length).toBeGreaterThan(5)
    for (const f of communs) {
      for (const cible of importsDe(f)) {
        expect(cible.startsWith(path.join(SRC, 'modules') + path.sep), `${path.relative(SRC, f)} importe ${path.relative(SRC, cible)}`).toBe(false)
      }
    }
  })

  it('Facturation n\'importe ni Paiements ni Domiciliation (dépendances à sens unique)', () => {
    for (const f of fichiersSrc(MODULE)) {
      for (const cible of importsDe(f)) {
        for (const autre of ['paiements', 'domiciliation']) {
          expect(cible.startsWith(path.join(SRC, 'modules', autre)), `${path.relative(SRC, f)} importe ${path.relative(SRC, cible)}`).toBe(false)
        }
      }
    }
  })
  it('les modules de paiements / rapports n\'importent plus les constantes via l\'API Facturation', () => {
    for (const rel of ['pages/PaiementForm.jsx', 'pages/PaiementGestion.jsx', 'pages/PaiementList.jsx', 'pages/Rapports.jsx']) {
      expect(fs.readFileSync(path.join(SRC, rel), 'utf8')).not.toMatch(/from '\.\.\/api\/facturation\.js'/)
    }
  })

  it('le module ne dépend d\'aucune page d\'un autre domaine (ni Paiements, ni Domiciliation…)', () => {
    for (const f of fichiersSrc(MODULE)) {
      for (const cible of importsDe(f)) {
        if (dansModule(cible)) continue
        expect(cible.startsWith(path.join(SRC, 'pages') + path.sep), `${path.relative(SRC, f)} importe ${path.relative(SRC, cible)}`).toBe(false)
      }
    }
  })

  it('aucun cycle d\'imports dans src/', () => {
    const resolu = (cible) => ['', '.js', '.jsx', `${path.sep}index.js`].map((x) => cible + x).find((c) => fs.existsSync(c) && fs.statSync(c).isFile())
    const graphe = new Map(fichiersSrc().map((f) => [f, importsDe(f).map(resolu).filter(Boolean)]))
    const etat = new Map()
    const cycles = []
    const visiter = (n, pile) => {
      etat.set(n, 1)
      for (const d of graphe.get(n) ?? []) {
        if (etat.get(d) === 1) cycles.push([...pile.slice(pile.indexOf(d)), n, d].map((x) => path.relative(SRC, x)).join(' -> '))
        else if (!etat.get(d)) visiter(d, [...pile, n])
      }
      etat.set(n, 2)
    }
    for (const n of graphe.keys()) if (!etat.get(n)) visiter(n, [])
    expect(cycles).toEqual([])
  })
})