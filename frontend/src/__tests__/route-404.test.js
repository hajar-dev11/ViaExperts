// Route 404 : l'URL inconnue affiche NotFound DANS le Layout, sans changer la navigation existante.
// Environnement Node (pas de jsdom) : App.jsx utilise HashRouter (window requis) et charge toutes les pages ; on lit donc
// son source, on en extrait les chemins déclarés et on les fait résoudre par le moteur de routes réel (matchRoutes).
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { matchRoutes, StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotFound from '../pages/NotFound.jsx'

const SRC = path.resolve(__dirname, '..')
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8')

// Chemins déclarés dans App.jsx, dans l'ordre du fichier.
const chemins = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1])
const exemple = (chemin) => chemin.replace(/:[A-Za-z]+/g, '1')

describe('App.jsx : route catch-all', () => {
  it('déclare path="*" une seule fois, en DERNIER, avec NotFound', () => {
    expect(chemins.filter((c) => c === '*')).toHaveLength(1)
    expect(chemins.at(-1)).toBe('*')
    expect(app).toMatch(/import NotFound from .+NotFound\.jsx/)
    expect(app).toContain('<Route path="*" element={<NotFound />} />')
  })

  it('est placée dans le Layout, lui-même sous RequireAuth (menu visible ; non connecté => /login)', () => {
    const iAuth = app.indexOf('<Route element={<RequireAuth />}>')
    const iLayout = app.indexOf('<Route element={<Layout />}>')
    const iCatchAll = app.indexOf('<Route path="*"')
    const iFinLayout = app.indexOf('</Route>', iCatchAll)
    expect(iAuth).toBeGreaterThan(-1)
    expect(iLayout).toBeGreaterThan(iAuth)
    expect(iCatchAll).toBeGreaterThan(iLayout)
    // Le catch-all est suivi de la fermeture du Layout puis de RequireAuth, rien d'autre entre les deux.
    expect(app.slice(iCatchAll, iFinLayout)).not.toMatch(/<Route path="(?!\*)/)
    // Les routes publiques (login…) restent déclarées avant la garde.
    expect(chemins.slice(0, 3)).toEqual(['/login', '/forgot-password', '/reset-password'])
  })

  it('les routes existantes sont intactes : chacune résout vers elle-même, jamais vers le catch-all', () => {
    const routes = chemins.map((chemin) => ({ path: chemin }))
    const existantes = chemins.filter((c) => c !== '*')
    expect(existantes.length).toBeGreaterThan(50)
    for (const chemin of existantes) {
      const correspondances = matchRoutes(routes, exemple(chemin))
      expect(correspondances?.at(-1).route.path, chemin).toBe(chemin)
    }
  })

  it('une URL inconnue (même proche d\'une route existante) résout vers le catch-all', () => {
    const routes = chemins.map((chemin) => ({ path: chemin }))
    for (const inconnue of ['/n-importe-quoi', '/clients/1/inconnu', '/facturation', '/parametres/a/b', '/domiciliation/1/inconnu']) {
      expect(matchRoutes(routes, inconnue)?.at(-1).route.path, inconnue).toBe('*')
    }
  })
})

describe('NotFound', () => {
  it('affiche le texte attendu et un lien « Retour à l\'accueil » vers /', () => {
    const html = renderToString(createElement(StaticRouter, { location: '/inconnu' }, createElement(NotFound)))
    expect(html).toContain('Page introuvable')
    expect(html).toContain('404')
    expect(html).toContain('Retour à l&#x27;accueil')
    expect(html).toMatch(/<a [^>]*href="\/"/)
  })
})
