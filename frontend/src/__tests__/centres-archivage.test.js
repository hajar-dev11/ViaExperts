// Centres de domiciliation : confirmation avant d'archiver, catégorie « Centres » dans Archive / Corbeille (lister, restaurer).
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/http.js', () => ({ apiFetch: vi.fn() }))

const { apiFetch } = await import('../api/http.js')
const { listAllCentres, archiveCentre, restoreCentre } = await import('../modules/domiciliation/api/centres.js')

const lire = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8')

describe('listAllCentres : aucun centre oublié au-delà de la première page', () => {
  beforeEach(() => apiFetch.mockReset())

  it('parcourt toutes les pages (100 par requête) avec le statut demandé', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], last_page: 3 })
      .mockResolvedValueOnce({ data: [{ id: 3 }], last_page: 3 })
      .mockResolvedValueOnce({ data: [{ id: 4 }], last_page: 3 })

    const centres = await listAllCentres('archive')

    expect(centres.map((c) => c.id)).toEqual([1, 2, 3, 4])
    expect(apiFetch).toHaveBeenCalledTimes(3)
    const urls = apiFetch.mock.calls.map(([url]) => url)
    expect(urls[0]).toContain('status=archive')
    expect(urls[0]).toContain('per_page=100')
    expect(urls.map((u) => new URL(u, 'http://x').searchParams.get('page'))).toEqual(['1', '2', '3'])
  })

  it('une seule page, ou une réponse sans données : un seul appel, liste vide possible', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], last_page: 1 })
    expect(await listAllCentres('corbeille')).toEqual([])
    expect(apiFetch).toHaveBeenCalledTimes(1)

    apiFetch.mockReset()
    apiFetch.mockResolvedValueOnce({})
    expect(await listAllCentres()).toEqual([])
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})

describe('routes appelées', () => {
  beforeEach(() => apiFetch.mockReset())

  it('archiver et restaurer visent le bon centre', async () => {
    apiFetch.mockResolvedValue({})
    await archiveCentre(7)
    await restoreCentre(7)
    expect(apiFetch.mock.calls).toEqual([
      ['/api/v1/centres-domiciliation/7/archive', { method: 'POST' }],
      ['/api/v1/centres-domiciliation/7/restore', { method: 'POST' }],
    ])
  })
})

describe('page Centres de Domiciliation', () => {
  const source = lire('modules/domiciliation/pages/DomiciliationCentres.jsx')

  it('« Archiver » demande confirmation avant d\'appeler l\'API', () => {
    expect(source).toContain('onClick: () => setArchivagePour(r)') // entrée « Archiver » du menu d'actions
    expect(source).not.toMatch(/runAction\(archiveCentre, r\.id\)/)
    expect(source).toContain('title="Archiver ce centre ?"')
  })

  it('l\'archivage n\'a lieu qu\'à la confirmation, « Annuler » ferme sans rien changer', () => {
    const bloc = source.slice(source.indexOf('open={!!archivagePour}'), source.indexOf('open={!!suppressionPour}'))
    expect(bloc).toContain('onCancel={() => setArchivagePour(null)}')
    expect(bloc).toContain('runAction(archiveCentre, cible.id')
    // L'appel n'est présent que dans le gestionnaire de confirmation (une seule fois dans tout le fichier).
    expect(source.match(/archiveCentre,/g)).toHaveLength(2) // import + confirmation
  })

  it('restaurer annonce que le centre est de nouveau actif', () => {
    expect(source).toContain('Centre restauré')
  })
})

describe('page Archive / Corbeille', () => {
  const source = lire('pages/Archive.jsx')

  it('contient la catégorie « Centres de Domiciliation » branchée sur lister, restaurer, corbeille et suppression', () => {
    const bloc = source.slice(source.indexOf('centres: {'), source.indexOf('services: {'))
    expect(bloc).toContain("label: 'Centres de Domiciliation'")
    expect(bloc).toContain('list: (status) => listAllCentres(status)')
    expect(bloc).toContain('restore: restoreCentre')
    expect(bloc).toContain('corbeille: corbeilleCentre')
    expect(bloc).toContain('destroy: deleteCentre')
  })

  it('le compteur de la catégorie vient de la clé `centres` de l\'API (même clé que la catégorie)', () => {
    expect(source).toMatch(/\n  centres: \{/)
    expect(source).toContain('counts[cle]')
  })
})
