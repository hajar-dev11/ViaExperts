import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { DUREE_FONDU, DUREE_MESSAGE } from './messages.js'

/**
 * Toast — retour transitoire après une action (enregistré, archivé, supprimé…).
 *
 * Usage :
 *   const toast = useToast()
 *   toast.success('Client enregistré.')
 *   toast.error("L'action n'a pas pu être effectuée.")
 *
 * Le provider est monté une fois dans App.jsx. Si un composant appelle
 * `useToast()` hors provider, les méthodes ne font rien : aucune page ne peut
 * planter à cause d'un toast.
 */

const NOOP = {
  show: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
  dismiss: () => {},
}

const ToastContext = createContext(NOOP)

export function useToast() {
  return useContext(ToastContext)
}

const TONES = {
  success: { cls: 'text-success-700', bar: 'bg-success-500', Icon: CheckCircle2 },
  error: { cls: 'text-danger-700', bar: 'bg-danger-500', Icon: AlertCircle },
  warning: { cls: 'text-warning-700', bar: 'bg-warning-500', Icon: TriangleAlert },
  info: { cls: 'text-info-700', bar: 'bg-info-500', Icon: Info },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Copie synchrone de la liste : `show` / `dismiss` s'appellent en rafale (ancien message qui part, nouveau qui arrive).
  const liste = useRef([])
  const timers = useRef(new Map()) // id -> minuterie d'effacement
  const sorties = useRef(new Map()) // id -> minuterie de retrait après le fondu

  const maj = useCallback((suivante) => {
    liste.current = suivante
    setToasts(suivante)
  }, [])

  // Un message quitte l'écran en deux temps : fondu (`leaving`), puis retrait.
  const dismiss = useCallback((id) => {
    const minuterie = timers.current.get(id)
    if (minuterie) {
      clearTimeout(minuterie)
      timers.current.delete(id)
    }
    const courant = liste.current.find((t) => t.id === id)
    if (!courant || courant.leaving) return
    maj(liste.current.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    sorties.current.set(
      id,
      setTimeout(() => {
        sorties.current.delete(id)
        maj(liste.current.filter((t) => t.id !== id))
      }, DUREE_FONDU)
    )
  }, [maj])

  const planifier = useCallback((id, duration) => {
    const ancienne = timers.current.get(id)
    if (ancienne) clearTimeout(ancienne)
    if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration))
  }, [dismiss])

  const show = useCallback(
    (message, options = {}) => {
      if (!message) return undefined
      const tone = options.tone ?? 'info'
      const duration = options.duration ?? DUREE_MESSAGE

      // Même message déjà à l'écran : on relance simplement sa durée au lieu de l'empiler.
      const doublon = liste.current.find(
        (t) => !t.leaving && t.message === message && t.tone === tone && t.title === options.title
      )
      if (doublon) {
        planifier(doublon.id, duration)
        return doublon.id
      }

      // Un nouveau message remplace l'ancien : aucun message d'une action précédente ne reste bloqué.
      liste.current.filter((t) => !t.leaving).forEach((t) => dismiss(t.id))

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      maj([...liste.current, { id, message, tone, title: options.title }])
      planifier(id, duration)
      return id
    },
    [dismiss, maj, planifier]
  )

  // Nettoyage des minuteurs au démontage.
  useEffect(() => {
    const aEffacer = timers.current
    const aRetirer = sorties.current
    return () => {
      aEffacer.forEach((t) => clearTimeout(t))
      aEffacer.clear()
      aRetirer.forEach((t) => clearTimeout(t))
      aRetirer.clear()
    }
  }, [])

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show(message, { ...options, tone: 'success' }),
      error: (message, options) => show(message, { ...options, tone: 'error' }),
      warning: (message, options) => show(message, { ...options, tone: 'warning' }),
      info: (message, options) => show(message, { ...options, tone: 'info' }),
    }),
    [show, dismiss]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed top-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const { cls, bar, Icon } = TONES[t.tone] ?? TONES.info
          return (
            <div
              key={t.id}
              className={`ve-toast-in flex items-start gap-3 overflow-hidden rounded-lg bg-white py-3 pr-3 pl-0 shadow-menu transition-[opacity,transform] ease-in ${
                t.leaving ? 'pointer-events-none translate-x-4 opacity-0' : 'pointer-events-auto'
              }`}
              style={{ transitionDuration: `${DUREE_FONDU}ms` }}
            >
              <span className={`w-1 self-stretch ${bar}`} />
              <Icon size={17} className={`mt-0.5 shrink-0 ${cls}`} />
              <div className="min-w-0 flex-1 text-sm">
                {t.title && <div className="font-semibold text-ink-900">{t.title}</div>}
                <div className="text-ink-800 break-words">{t.message}</div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fermer la notification"
                className="shrink-0 rounded p-0.5 text-ink-600 transition-colors hover:text-ink-900 focus-ring"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
