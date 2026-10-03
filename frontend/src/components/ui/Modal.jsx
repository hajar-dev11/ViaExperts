import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal — surcouche accessible du design system.
 *
 * Apporte ce qui manquait aux modales écrites à la main dans les pages :
 * `role="dialog"`, fermeture par Échap, piège de focus, restitution du focus
 * au déclencheur, et blocage du défilement de l'arrière-plan.
 *
 * `variant="right"` — panneau qui glisse depuis le bord droit (largeur fixe,
 * pleine hauteur), comme le formulaire « Ajouter Centre de Domiciliation » de
 * la référence, au lieu de la boîte centrée par défaut. Même machinerie
 * d'accessibilité (piège de focus, Échap, blocage du défilement) que la
 * modale centrée : seule l'habillage visuel change.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  variant = 'center',
  footer,
  closeOnBackdrop = true,
  children,
  className = '',
}) {
  const panelRef = useRef(null)
  const previouslyFocused = useRef(null)
  const titleId = useId()

  // Toujours la dernière fonction `onClose`, sans jamais forcer l'effet
  // ci-dessous à se rejouer : voir la remarque plus bas.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return

      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      )
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    // Focus initial : le premier élément interactif du panneau, sinon le panneau.
    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector(FOCUSABLE)
      ;(target ?? panelRef.current)?.focus()
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
    // ⚠️ `onClose` est délibérément absent de ce tableau de dépendances.
    // Dans presque tous les appelants, `onClose` est une fonction fléchée en
    // ligne (`onClose={() => setX(false)}`), donc une référence NEUVE à
    // chaque rendu du parent. Si elle figurait ici, chaque frappe dans un
    // champ de la modale (qui fait re-rendre le parent) rejouait cet effet :
    // le `setTimeout` replaçait alors le focus sur le PREMIER élément
    // focusable du panneau — le bouton de fermeture « X », placé avant le
    // contenu — et non sur le champ en cours de saisie. Résultat observé :
    // une seule lettre tapée dans « Ajouter une observation », puis plus
    // rien. `onCloseRef` (ci-dessus) garde l'accès à la version la plus
    // récente sans avoir besoin de la lister ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const isRight = variant === 'right'

  // ⚠️ Variante centrée : `overflow-y-auto` et `items-center` NE DOIVENT PAS
  // être sur le MÊME élément — combinaison connue pour rogner le haut d'un
  // contenu plus grand que l'écran (le panneau reste centré sur une zone qui
  // ne défile pas jusqu'à son propre sommet). D'où deux niveaux : le fond
  // `fixed` porte seul le défilement, un wrapper interne fait le centrage
  // avec `min-h-full` (jamais `h-full`) pour que le panneau puisse dépasser
  // et rester entièrement atteignable en scrollant.
  return (
    <div
      className={isRight
        ? 'fixed inset-0 z-50 flex justify-end bg-ink-950/50'
        : 'fixed inset-0 z-50 overflow-y-auto bg-ink-950/50'}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className={isRight ? 'contents' : 'flex min-h-full items-center justify-center p-4'}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          className={isRight
            ? `ve-slide-in-right relative flex h-full w-full max-w-[470px] flex-col bg-white shadow-menu outline-none ${className}`
            : `ve-fade-in relative w-full ${SIZES[size] ?? SIZES.md} rounded-xl bg-white shadow-menu outline-none ${className}`}
        >
          {(title || onClose) && (
            <div className={`flex items-start gap-4 px-6 pt-6 pb-4 ${isRight ? 'shrink-0 border-b border-line' : ''}`}>
              <div className="min-w-0 flex-1">
                {title && (
                  <h3 id={titleId} className="text-lg text-ink-900">
                    {title}
                  </h3>
                )}
                {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer"
                  className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-600 transition-colors hover:bg-surface hover:text-ink-900 focus-ring"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}

          <div className={isRight ? 'flex-1 overflow-y-auto px-6 py-5' : 'px-6 pb-6'}>{children}</div>

          {footer && (
            <div className={`flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4 ${isRight ? 'shrink-0' : ''}`}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
