import { Component } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import Button from './Button.jsx'

/**
 * ErrorBoundary — filet de sécurité contre l'écran blanc.
 *
 * Une erreur levée pendant le rendu d'un composant enfant (donnée inattendue, propriété manquante…) fait normalement
 * démonter TOUTE l'application React. Ici l'erreur est interceptée et remplacée par un écran clair : titre, phrase
 * rassurante, « Réessayer » (on retente le rendu) et « Recharger la page ».
 *
 * RÈGLE : l'utilisateur ne voit JAMAIS le message technique ni la stack. Ils ne sont écrits que dans la console du
 * navigateur, en développement (`import.meta.env.DEV`).
 *
 * `resetKey` : quand sa valeur change (ex. `location.pathname`), l'erreur est effacée et l'enfant est rendu à nouveau.
 * Posée autour de l'`<Outlet />` du Layout, elle évite qu'une page cassée immobilise le menu : naviguer ailleurs suffit.
 * `fullPage` : écran entier (niveau racine) au lieu d'une carte dans la zone de travail.
 *
 * Le fallback n'utilise ni routeur ni contexte (le niveau racine est monté au-dessus d'eux) : uniquement des boutons.
 */

export function ErrorFallback({ onRetry, onReload, fullPage = false }) {
  return (
    <div
      role="alert"
      className={`grid place-items-center px-4 ${fullPage ? 'min-h-screen bg-surface' : 'py-12'}`}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-50 text-danger-700">
          <TriangleAlert size={22} />
        </span>
        <h1 className="mt-4 text-xl text-ink-900">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-ink-600">
          Cette page n'a pas pu s'afficher correctement. Ce n'est pas de votre faute : vous pouvez réessayer ou recharger la page.
          Si le problème persiste, contactez l'administrateur.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" icon={<RefreshCw size={16} />} onClick={onRetry}>
            Réessayer
          </Button>
          <Button variant="secondary" onClick={onReload}>
            Recharger la page
          </Button>
        </div>
      </div>
    </div>
  )
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, resetKey: props.resetKey }
    this.reessayer = this.reessayer.bind(this)
    this.recharger = this.recharger.bind(this)
  }

  // Aucune information sur l'erreur n'est conservée dans l'état : rien ne peut donc être affiché par accident.
  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info?.componentStack)
    }
  }

  // Changement de `resetKey` (nouvelle route) : l'erreur est effacée et l'enfant est rendu à nouveau.
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { hasError: false, resetKey: props.resetKey } : null
  }

  reessayer() {
    this.setState({ hasError: false })
  }

  recharger() {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.reessayer} onReload={this.recharger} fullPage={this.props.fullPage} />
    }
    return this.props.children
  }
}
