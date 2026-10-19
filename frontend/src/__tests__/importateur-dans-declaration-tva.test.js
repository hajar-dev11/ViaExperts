// L'Importateur de Déclaration est une entrée de la section « Declaration TVA » (au milieu de ses sous-entrées), pas un bloc
// indépendant du menu ; sa page est sous /declaration-tva/.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { nav } from '../components/navConfig.js'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

const groupe = nav.find((n) => n.label === 'Declaration TVA')
const entree = groupe?.children.find((c) => c.to === '/declaration-tva/importateur')

describe('menu : l\'importateur est DANS la section Declaration TVA', () => {
  it('la section Declaration TVA contient l\'entrée « Importateur de Déclaration »', () => {
    expect(groupe).toBeDefined()
    expect(entree).toBeDefined()
    expect(entree.label).toBe('Importer Déclaration')
  })

  it('elle se trouve au milieu du contenu de la section : ni la première ni la dernière entrée', () => {
    const rang = groupe.children.indexOf(entree)

    expect(rang).toBeGreaterThan(0)
    expect(rang).toBeLessThan(groupe.children.length - 1)
    expect(rang).toBe(Math.floor(groupe.children.length / 2))
  })

  it('les entrées existantes de la section sont conservées', () => {
    expect(groupe.children.map((c) => c.label)).toEqual(expect.arrayContaining([
      'Nouvelle Déclaration', 'Liste des Déclarations', "Chiffre d'Affaire", "Liste des Chiffres d'Affaire",
    ]))
    expect(groupe.base).toBe('/declaration-tva')
  })

  it('aucune entrée indépendante hors de la section', () => {
    const horsSection = nav.filter((n) => n !== groupe && /import/i.test(n.label))
    expect(horsSection).toEqual([])
    expect(nav.some((n) => n.to === '/importateur-tva')).toBe(false)
  })

  it('sa page est sous /declaration-tva (la section reste active) et elle exige la permission Importeur', () => {
    expect(entree.to.startsWith(`${groupe.base}/`)).toBe(true)
    expect(entree.permission).toEqual({ module: 'declaration', action: 'importeur' })
  })

  it('les autres entrées de la section restent visibles sans cette permission', () => {
    const sansPermission = groupe.children.filter((c) => !c.permission).map((c) => c.to)
    expect(sansPermission).toEqual(expect.arrayContaining(['/declaration-tva', '/declaration-tva/nouvelle']))
  })
})

describe('routes', () => {
  const app = lire('App.jsx')

  it("la page de l'importateur est servie sous /declaration-tva/importateur", () => {
    expect(app).toMatch(/path="\/declaration-tva\/importateur" element=\{<ImportateurTva \/>\}/)
  })

  it("l'ancienne adresse /importateur-tva redirige vers la section (les favoris continuent de fonctionner)", () => {
    expect(app).toMatch(/path="\/importateur-tva" element=\{<Navigate to="\/declaration-tva\/importateur" replace \/>\}/)
  })

  it("l'import de lignes Excel / CSV reste disponible à part, sans entrée de menu", () => {
    expect(app).toMatch(/path="\/declaration-tva\/importateur\/fichier" element=\{<ImportateurTvaFichier \/>\}/)
    expect(JSON.stringify(nav)).not.toContain('importateur/fichier')
  })

  it("la page de l'importateur ne rend plus le formulaire générique d'import de fichier", () => {
    const page = lire('pages/ImportateurTva.jsx')

    expect(page).toContain('ACCEPT_DOCUMENT_DECLARATION')
    expect(page).not.toMatch(/lireFichierTva|\.csv|\.xlsx|importerLignes|apercuImport/)
  })
})
