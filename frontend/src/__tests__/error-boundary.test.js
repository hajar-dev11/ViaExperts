// ErrorBoundary : jamais d'écran blanc, jamais de message technique affiché.
// Environnement Node (pas de jsdom) : rendu serveur (renderToString) + appel direct des méthodes de cycle de vie.
// Le rendu d'un enfant qui plante n'est pas testable côté serveur (React relance l'erreur) : on instancie donc la classe,
// on lui applique getDerivedStateFromError, puis on rend ce que render() renvoie dans cet état.
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary, { ErrorFallback } from '../components/ui/ErrorBoundary.jsx'

const SRC = path.resolve(__dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

const MESSAGE_TECHNIQUE = "Cannot read properties of undefined (reading 'nom_secret_xyz')"

/** Instance en état d'erreur, comme après une erreur de rendu d'un enfant. */
function instanceEnErreur(props = {}) {
  const boundary = new ErrorBoundary({ children: createElement('p', null, 'enfant'), ...props })
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(new TypeError(MESSAGE_TECHNIQUE)) }
  return boundary
}

afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary — chemin sain', () => {
  it('rend ses enfants tels quels tant qu\'il n\'y a pas d\'erreur', () => {
    const html = renderToString(createElement(ErrorBoundary, null, createElement('p', null, 'Contenu de la page')))
    expect(html).toContain('Contenu de la page')
    expect(html).not.toContain('Réessayer')
    expect(html).not.toContain('Recharger')
  })
})

describe('ErrorBoundary — erreur de rendu', () => {
  it('getDerivedStateFromError bascule en état d\'erreur sans conserver l\'erreur', () => {
    const etat = ErrorBoundary.getDerivedStateFromError(new Error(MESSAGE_TECHNIQUE))
    expect(etat).toEqual({ hasError: true })
    expect(JSON.stringify(etat)).not.toContain('nom_secret_xyz')
  })

  it('affiche un écran en français avec « Réessayer » et « Recharger la page »', () => {
    const html = renderToString(instanceEnErreur().render())
    expect(html).toContain('Une erreur est survenue')
    expect(html).toContain('Réessayer')
    expect(html).toContain('Recharger la page')
    expect(html).toContain('role="alert"')
    // L'enfant qui a planté n'est plus rendu.
    expect(html).not.toContain('enfant')
  })

  it('ne laisse fuiter ni le message d\'erreur, ni la stack, ni le nom de l\'erreur', () => {
    const html = renderToString(instanceEnErreur({ fullPage: true }).render())
    for (const interdit of ['nom_secret_xyz', 'Cannot read', 'TypeError', 'undefined', 'stack', 'Stack', ' at ', 'componentStack', '.jsx', 'node_modules']) {
      expect(html, interdit).not.toContain(interdit)
    }
  })

  it('componentDidCatch écrit dans la console (développement) mais n\'ajoute rien à l\'écran', () => {
    const erreurConsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boundary = instanceEnErreur()
    boundary.componentDidCatch(new Error(MESSAGE_TECHNIQUE), { componentStack: '\n    at Page (Page.jsx:1:1)' })
    expect(erreurConsole).toHaveBeenCalledTimes(1)
    expect(boundary.state.hasError).toBe(true)
    expect(renderToString(boundary.render())).not.toContain('Page.jsx')
  })

  it('« Réessayer » réinitialise l\'état d\'erreur', () => {
    const boundary = instanceEnErreur()
    const setState = vi.fn()
    boundary.setState = setState
    boundary.reessayer()
    expect(setState).toHaveBeenCalledWith({ hasError: false })
  })

  it('« Recharger la page » appelle window.location.reload()', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    try {
      instanceEnErreur().recharger()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('un changement de resetKey (changement de route) efface l\'erreur ; sans changement, elle reste', () => {
    const boundary = instanceEnErreur({ resetKey: '/clients' })
    expect(boundary.state.hasError).toBe(true)

    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: '/clients' }, boundary.state)).toBeNull()
    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: '/entreprises' }, boundary.state))
      .toEqual({ hasError: false, resetKey: '/entreprises' })
  })

  it('l\'écran de repli ne dépend d\'aucun routeur ni contexte (utilisable au niveau racine)', () => {
    // Aucun <Router> autour : rendre le repli seul ne doit pas lever d'erreur.
    const html = renderToString(createElement(ErrorFallback, { onRetry: () => {}, onReload: () => {}, fullPage: true }))
    expect(html).toContain('min-h-screen')
    expect(html).toContain('<button')
  })
})

describe('ErrorBoundary — branchement dans l\'application', () => {
  it('main.jsx enveloppe <App /> (niveau racine)', () => {
    const source = lire('main.jsx')
    expect(source).toMatch(/<ErrorBoundary[^>]*>\s*<App \/>\s*<\/ErrorBoundary>/)
  })

  it('Layout.jsx enveloppe l\'<Outlet /> et se réinitialise à chaque changement de route', () => {
    const source = lire('components/Layout.jsx')
    expect(source).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Outlet \/>\s*<\/ErrorBoundary>/)
    expect(source).toContain('useLocation()')
  })
})
