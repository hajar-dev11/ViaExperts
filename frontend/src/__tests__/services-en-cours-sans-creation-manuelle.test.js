// « Ajouter un Service en Cours » n'existe plus : un service en cours naît uniquement des actions métier (facture, devis,
// bon de livraison, facture d'avoir, paiement). Le module « Services en cours » (liste, modification, statut, archive,
// corbeille) reste en place.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as api from '../api/servicesEnCours.js'

const SRC = path.resolve(__dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('Services en cours : plus de création manuelle', () => {
  it('l\'API frontend n\'expose plus de création, mais garde le reste du module', () => {
    expect(api.createServiceEnCours).toBeUndefined()
    for (const nom of ['listServicesEnCours', 'getServiceEnCours', 'listActivite', 'updateServiceEnCours', 'addOperation',
      'archiveServiceEnCours', 'corbeilleServiceEnCours', 'restoreServiceEnCours', 'deleteServiceEnCoursForever']) {
      expect(typeof api[nom], nom).toBe('function')
    }
    // Plus aucun appel POST sur la collection (création).
    expect(lire('api/servicesEnCours.js')).not.toContain("apiFetch('/api/v1/services-en-cours', {")
  })

  it('la page n\'a plus de bouton, de formulaire ni d\'appel de création', () => {
    const page = lire('pages/ServicesEnCours.jsx')
    expect(page).not.toMatch(/Ajouter un Service en Cours/i)
    expect(page).not.toMatch(/Ajouter un service en cours/i)
    expect(page).not.toContain('createServiceEnCours')
    expect(page).not.toContain('openCreate')
    // Ce qui reste : modification d'un service existant, archive / corbeille, activité.
    expect(page).toContain('updateServiceEnCours')
    expect(page).toContain('Modifier le service en cours')
    expect(page).toContain('Services en cours')
  })

  it('aucune autre page ni composant ne propose d\'ajouter un service en cours', () => {
    const fichiers = []
    const parcourir = (dir) => {
      for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory() && e.name !== '__tests__') parcourir(rel)
        else if (/\.(jsx?|js)$/.test(e.name)) fichiers.push(rel)
      }
    }
    for (const d of ['pages', 'components', 'modules', 'api']) parcourir(d)
    const fautifs = fichiers.filter((f) => /createServiceEnCours|Ajouter un service en cours|Ajouter service en cours/i.test(lire(f)))
    expect(fautifs).toEqual([])
  })

  it('la permission « Ajouter » du module n\'est plus proposée dans Paramètres, les autres le sont', () => {
    const bloc = lire('pages/Parametres.jsx').match(/module: 'services_en_cours',[\s\S]*?\n  \},/)?.[0] ?? ''
    expect(bloc).toContain('modifier:')
    expect(bloc).toContain('supprimer:')
    expect(bloc).not.toMatch(/\bajouter:/)
  })
})