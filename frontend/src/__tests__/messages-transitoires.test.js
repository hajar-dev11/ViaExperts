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

  it('tout bandeau « {message && <Alert tone="danger|success"> » est à fermeture automatique (action) ou permanent avec « Réessayer » (chargement)', () => {
    // Exception : l'erreur pilote le texte « Chargement… » du document (la vider relancerait un faux chargement).
    const exceptions = new Set(['modules/domiciliation/documents/DocumentDomiciliationEditable.jsx'])
    const sansRegle = []
    for (const rel of pages) {
      if (exceptions.has(rel)) continue
      for (const m of lire(rel).matchAll(/\{(\w+) && <Alert tone="(?:danger|success)"[^\n]*/g)) {
        if (!m[0].includes('onAutoClose') && !m[0].includes('onRetry')) sansRegle.push(`${rel} : ${m[0].slice(0, 70)}`)
      }
    }
    expect(sansRegle).toEqual([])
  })

  it('une erreur CRITIQUE de chargement ne se ferme jamais toute seule : bandeau « Réessayer », sans onAutoClose ni onClose', () => {
    const faux = []
    let total = 0
    for (const rel of pages) {
      for (const m of lire(rel).matchAll(/\{(erreur(?:Chargement|Contacts|Conversation)\w*) && <Alert[^\n]*/g)) {
        total++
        if (!m[0].includes('onRetry=') || m[0].includes('onAutoClose') || m[0].includes('onClose')) faux.push(`${rel} : ${m[0].slice(0, 90)}`)
      }
    }
    expect(faux).toEqual([])
    expect(total).toBeGreaterThanOrEqual(29) // 30 avant la fusion de « List Domiciliation » dans la gestion de domiciliation
  })

  it('plus aucun message de chargement dans l\'état des erreurs d\'ACTION (qui, lui, se ferme seul)', () => {
    // Exceptions : écrans qui REMPLACENT la page par l'erreur quand rien n'est chargé (déjà permanents), et les paramètres
    // de Bureau / Centre (`{error ? <Alert> : (formulaire)}`, déjà permanents tant que le formulaire n'est pas chargé).
    const exceptions = [
      /pages\/ClientDetails\.jsx$/, /pages\/EntrepriseDetails\.jsx$/, /domiciliation\/pages\/DomiciliationDetails\.jsx$/,
      /domiciliation\/pages\/CentreDomiciliationDetails\.jsx$/, /domiciliation\/documents\/DocumentDomiciliationEditable\.jsx$/,
    ]
    const motif = /\bset(?:Error|Erreur|GlobalError)\((?:(?!\bset[A-Z]\w*\()[\s\S]){0,260}?(?:Impossible de charger|introuvable\.)[^'"`]*/g
    const restants = []
    for (const rel of pages) {
      if (exceptions.some((re) => re.test(rel))) continue
      for (const m of lire(rel).matchAll(motif)) {
        if (/paramètres du (bureau|centre)/.test(m[0])) continue
        restants.push(`${rel} : ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`)
      }
    }
    expect(restants).toEqual([])
  })
})
