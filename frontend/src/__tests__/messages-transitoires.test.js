// Messages de succès / d'erreur : un seul système de durée, partagé par le Toast et les bandeaux Alert.
// Environnement Node (pas de jsdom) : constantes et texte source uniquement ; le comportement à l'écran est vérifié dans le navigateur.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DUREE_FONDU, DUREE_MESSAGE } from '../components/ui/messages.js'

const SRC = path.resolve(__dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('Durée des messages transitoires', () => {
  it('un message reste visible 3 à 4 secondes, puis s\'efface en fondu court', () => {
    expect(DUREE_MESSAGE).toBeGreaterThanOrEqual(3000)
    expect(DUREE_MESSAGE).toBeLessThanOrEqual(4000)
    expect(DUREE_FONDU).toBeGreaterThan(0)
    expect(DUREE_FONDU).toBeLessThanOrEqual(500)
  })

  it('le Toast et l\'Alert utilisent la même source de durée (aucun second réglage)', () => {
    for (const rel of ['components/ui/Toast.jsx', 'components/ui/Alert.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain("from './messages.js'")
      expect(source, rel).not.toMatch(/\b(setTimeout\([^)]*,\s*\d{3,}\))/)
    }
  })

  it('un bandeau transitoire vide l\'état de la page après sa durée (onAutoClose)', () => {
    const source = lire('components/ui/Alert.jsx')
    expect(source).toContain('onAutoClose')
    expect(source).toContain('DUREE_MESSAGE + DUREE_FONDU')
  })
})

describe('Bandeaux de succès / d\'erreur des pages', () => {
  const pages = []
  const parcourir = (dir) => {
    for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) parcourir(rel)
      else if (e.name.endsWith('.jsx')) pages.push(rel)
    }
  }
  parcourir('pages'); parcourir('modules'); parcourir('components')

  it('tout bandeau « {message && <Alert tone="danger|success"> » est à fermeture automatique, sauf exceptions documentées', () => {
    // Exception : l'erreur pilote le texte « Chargement… » du document (la vider relancerait un faux chargement).
    const exceptions = new Set(['modules/domiciliation/documents/DocumentDomiciliationEditable.jsx'])
    const sansFermeture = []
    for (const rel of pages) {
      if (exceptions.has(rel)) continue
      for (const m of lire(rel).matchAll(/\{(\w+) && <Alert tone="(?:danger|success)"[^\n]*/g)) {
        if (!m[0].includes('onAutoClose')) sansFermeture.push(`${rel} : ${m[0].slice(0, 70)}`)
      }
    }
    expect(sansFermeture).toEqual([])
  })
})
