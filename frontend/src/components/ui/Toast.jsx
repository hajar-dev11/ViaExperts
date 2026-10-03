import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

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

const DEFAULT_DURATION = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message, options = {}) => {
      if (!message) return undefined
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const tone = options.tone ?? 'info'
      const duration = options.duration ?? DEFAULT_DURATION

      setToasts((list) => [...list.slice(-3), { id, message, tone, title: options.title }])

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        )
      }
      return id
    },
    [dismiss]
  )

  // Nettoyage des minuteurs au démontage.
  const timersRef = timers
  useEffect(() => () => {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current.clear()
  }, [timersRef])

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
              className="ve-toast-in pointer-events-auto flex items-start gap-3 overflow-hidden rounded-lg bg-white py-3 pr-3 pl-0 shadow-menu"
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
