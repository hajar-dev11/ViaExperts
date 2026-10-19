// Services en cours / Activité Services : fichiers joints (mêmes règles que le serveur), fil d'activité réel (auteur, date,
// fichiers distingués), statut choisi dans la liste des statuts réels.
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/http.js', async (original) => ({ ...(await original()), apiFetch: vi.fn(), apiUpload: vi.fn() }))

const { apiFetch, apiUpload } = await import('../api/http.js')
const api = await import('../api/servicesEnCours.js')
const {
  ACCEPT_FICHIER_SERVICE, EXTENSIONS_FICHIER_SERVICE, EXTENSIONS_INTERDITES_SERVICE, TAILLE_MAX_FICHIER_SERVICE, erreurFichierService,
} = await import('../utils/fichiersService.js')
const { BadgeStatutService, ItemActiviteService } = await import('../components/ServiceEnCoursActions.jsx')

const lire = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8')
const fichier = (name, size = 1024) => ({ name, size })

describe('fichiers joints : contrôle côté écran', () => {
  it('accepte les documents autorisés', () => {
    for (const nom of ['Recu.pdf', 'scan.JPG', 'photo.png', 'tableau.xlsx', 'lettre.docx', 'notes.txt', 'export.csv']) {
      expect(erreurFichierService(fichier(nom)), nom).toBe('')
    }
  })

  it('refuse un type non autorisé, un script ou une extension exécutable cachée', () => {
    expect(erreurFichierService(fichier('script.php'))).toMatch(/pas autorisé/)
    expect(erreurFichierService(fichier('archive.zip'))).toMatch(/pas autorisé/)
    expect(erreurFichierService(fichier('sans-extension'))).toMatch(/pas autorisé/)
    expect(erreurFichierService(fichier('shell.php.jpg'))).toMatch(/exécutable/)
    expect(erreurFichierService(fichier('page.html'))).toMatch(/pas autorisé/)
  })

  it('refuse un fichier de plus de 5 Mo, accepte exactement 5 Mo', () => {
    expect(erreurFichierService(fichier('gros.pdf', TAILLE_MAX_FICHIER_SERVICE))).toBe('')
    expect(erreurFichierService(fichier('gros.pdf', TAILLE_MAX_FICHIER_SERVICE + 1))).toMatch(/trop lourd/)
  })

  it('refuse l\'absence de fichier et un nom invalide', () => {
    expect(erreurFichierService(null)).toMatch(/Choisissez/)
    expect(erreurFichierService(fichier('a/b.pdf'))).toMatch(/invalide/)
    expect(erreurFichierService(fichier(''))).toMatch(/invalide/)
  })

  it('l\'attribut accept reprend exactement la liste blanche', () => {
    expect(ACCEPT_FICHIER_SERVICE.split(',')).toEqual(EXTENSIONS_FICHIER_SERVICE.map((e) => `.${e}`))
  })

  it('la liste blanche et les extensions interdites sont identiques à celles du serveur (FichierAutorise.php)', () => {
    const php = fs.readFileSync(path.join(import.meta.dirname, '../../../backend/app/Rules/FichierAutorise.php'), 'utf8')
    const documents = php.slice(php.indexOf('private const DOCUMENTS'), php.indexOf('];', php.indexOf('private const DOCUMENTS')))
    const serveur = [...documents.matchAll(/^\s*'([a-z0-9]+)' =>/gm)].map((m) => m[1])
    expect([...EXTENSIONS_FICHIER_SERVICE].sort()).toEqual([...serveur].sort())

    const interdites = php.slice(php.indexOf('EXTENSIONS_INTERDITES'), php.indexOf('];', php.indexOf('EXTENSIONS_INTERDITES')))
    const serveurInterdites = [...interdites.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1])
    expect([...EXTENSIONS_INTERDITES_SERVICE].sort()).toEqual([...serveurInterdites].sort())
  })
})

describe('appels API', () => {
  beforeEach(() => { apiFetch.mockReset(); apiUpload.mockReset() })

  it('les statuts viennent de la route des services en cours (pas de Paramètres)', async () => {
    apiFetch.mockResolvedValue([{ id: 1, nom: 'En Attente' }])
    expect(await api.listStatutsService()).toEqual([{ id: 1, nom: 'En Attente' }])
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/services-en-cours/statuts')
  })

  it('un changement de statut, un commentaire et un fichier passent par la même opération', async () => {
    apiUpload.mockResolvedValue({ data: { id: 5 } })
    const f = fichier('a.pdf')

    await api.addOperation(5, { serviceStatusId: 3 })
    await api.addOperation(5, { commentaire: 'Bonjour' })
    await api.addOperation(5, { fichier: f })

    const corps = apiUpload.mock.calls.map(([, form]) => Object.fromEntries(form.entries()))
    expect(apiUpload.mock.calls.every(([url]) => url === '/api/v1/services-en-cours/5/operations')).toBe(true)
    expect(corps[0]).toEqual({ service_status_id: '3' })
    expect(corps[1]).toEqual({ commentaire: 'Bonjour' })
    expect(Object.keys(corps[2])).toEqual(['fichier'])
  })

  it('remplacer et supprimer un fichier visent l\'opération du bon service', async () => {
    apiUpload.mockResolvedValue({ data: {} })
    apiFetch.mockResolvedValue({ data: {} })

    await api.remplacerFichierOperation(5, 9, new Blob(['x']))
    await api.supprimerFichierOperation(5, 9)

    expect(apiUpload.mock.calls[0][0]).toBe('/api/v1/services-en-cours/5/operations/9/fichier')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/services-en-cours/5/operations/9/fichier', { method: 'DELETE' })
  })
})

describe('fil « Activité Services »', () => {
  const statut = (nom) => ({ id: 1, nom, couleurTexte: '#111111', couleurFond: '#eeeeee' })
  const rendre = (a, dernier = true) => renderToStaticMarkup(createElement(ItemActiviteService, { a, dernier }))

  it('affiche le statut, l\'auteur RÉEL, la date et l\'heure réelles', () => {
    const html = rendre({ id: 1, action: 'creation', statut: statut('En Attente'), par: 'Hajar Test', createdAt: '2026-10-12 17:07:07', service: 'Déclaration TVA', client: 'CLIENT A' })

    expect(html).toContain('En Attente')
    expect(html).toContain('Hajar Test')
    expect(html).not.toContain('Via Experts') // plus de nom de cabinet codé en dur à la place de l'utilisateur
    expect(html).toContain('12/10/2026')
    expect(html).toContain('17:07')
    expect(html).toContain('Service créé automatiquement')
    expect(html).toContain('Déclaration TVA — CLIENT A')
  })

  it('un auteur absent n\'est pas inventé', () => {
    expect(rendre({ id: 1, statut: statut('En Attente'), par: null, createdAt: '2026-10-12 17:07:07' })).toContain('—')
  })

  it('indique l\'ancien statut lors d\'un changement', () => {
    const html = rendre({ id: 2, action: 'statut', statut: statut('Terminé'), ancienStatut: statut('En Attente'), par: 'A', createdAt: '2026-10-12 18:00:00' })
    expect(html).toContain('Statut modifié')
    expect(html).toContain('ancien statut : En Attente')
  })

  it('distingue le fichier ajouté au service et la pièce jointe du document d\'origine', () => {
    const html = rendre({
      id: 3, statut: statut('En Attente'), par: 'A', createdAt: '2026-10-12 18:00:00',
      fichierNom: 'manuel.pdf', fichierChemin: 'services-en-cours/4/x.pdf',
      fichierSource: { nom: 'recu.pdf', chemin: 'paiements/y.pdf' },
    })

    expect(html).toContain('/storage/services-en-cours/4/x.pdf')
    expect(html).toContain('manuel.pdf')
    expect(html).toContain('/storage/paiements/y.pdf')
    expect(html).toContain('recu.pdf')
    expect(html).toContain('document d&#x27;origine')
  })

  it('affiche le commentaire tel quel', () => {
    expect(rendre({ id: 4, action: 'commentaire', statut: statut('En Attente'), par: 'A', createdAt: '2026-10-12 18:00:00', commentaire: 'Dossier transmis' })).toContain('Dossier transmis')
  })

  it('un service sans statut le dit clairement (« Sans statut »), jamais un statut inventé', () => {
    expect(renderToStaticMarkup(createElement(BadgeStatutService, { statut: null }))).toContain('Sans statut')
  })
})

describe('pages', () => {
  it.each(['pages/Dashboard.jsx', 'pages/ServicesEnCours.jsx'])('%s : statut cliquable (fenêtre « Changer le Statut »), statuts réels, fil partagé', (rel) => {
    const source = lire(rel)

    expect(source).toContain('StatutServiceBadge')
    expect(source).toContain('listStatutsService')
    expect(source).toContain('ItemActiviteService')
    expect(source).not.toContain('serviceStatusApi')
    expect(source).not.toMatch(/>Via Experts</)
  })

  it('la fenêtre « Changer le Statut du Service » propose statuts en grille, fichier et commentaire, et contrôle le fichier', () => {
    const source = lire('components/ServiceEnCoursActions.jsx')
    const modal = source.slice(source.indexOf('export function ModalChangerStatut'), source.indexOf('export function StatutServiceBadge'))

    expect(modal).toContain('Changer le Statut du Service')
    expect(modal).toContain('grid-cols-2')
    expect(modal).toContain('Importer Un Fichier')
    expect(modal).toContain('Commentaire')
    expect(modal).toContain('erreurFichierService')
    expect(modal).toContain('toast.success')
    expect(modal).toContain('messageErreurApi')
  })

  it('le menu d\'actions propose Fichiers et Commentaires, et les écritures exigent le droit « modifier »', () => {
    const source = lire('components/ServiceEnCoursActions.jsx')

    expect(source).toContain("label: 'Fichiers'")
    expect(source).toContain("label: 'Commentaires'")
    expect(source).toContain("hasPermission('services_en_cours', 'modifier')")
    expect(source).toContain('erreurFichierService')
  })
})
