import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { MoreVertical } from 'lucide-react'

/**
 * ActionMenu — menu d'actions de ligne, comme sur les captures de référence :
 * une icône discrète ouvre un menu « Afficher / Archive / Supprimer », chaque
 * entrée portant sa couleur sémantique.
 *
 * Le panneau est rendu dans un PORTAL en position fixed : sans cela il serait
 * rogné par le `overflow-x-auto` du conteneur de tableau.
 *
 * items: [{ label, icon, onClick | to | href, tone, disabled, separatorBefore }]
 * tone : 'default' | 'primary' | 'warning' | 'danger' | 'success' | 'info'
 */

const TONES = {
  default: 'text-ink-800 hover:bg-surface',
  primary: 'text-brand-600 hover:bg-brand-50',
  success: 'text-success-700 hover:bg-success-50',
  warning: 'text-warning-700 hover:bg-warning-50',
  danger: 'text-danger-700 hover:bg-danger-50',
  info: 'text-info-700 hover:bg-info-50',
}

const MENU_WIDTH = 208

export default function ActionMenu({
  items = [],
  label = 'Actions',
  icon,
  align = 'right',
  triggerClassName = '',
  children,
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const height = panelRef.current?.offsetHeight ?? 0

    let left = align === 'right' ? r.right - MENU_WIDTH : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8))

    // Bascule au-dessus du déclencheur s'il n'y a pas la place en dessous.
    const below = r.bottom + 6
    const top = height && below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below

    setPos({ top, left })
  }, [align])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReflow = () => place()

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, place])

  const visible = items.filter(Boolean)
  if (visible.length === 0 && !children) return null

  const close = () => setOpen(false)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-8 w-8 place-items-center rounded-lg text-ink-800 transition-colors hover:bg-surface hover:text-brand-600 focus-ring [&>svg]:h-[18px] [&>svg]:w-[18px] ${
          open ? 'bg-surface text-brand-600' : ''
        } ${triggerClassName}`}
      >
        {icon ?? <MoreVertical size={16} />}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="ve-fade-in fixed z-[70] overflow-hidden rounded-lg bg-white py-1 shadow-menu"
          >
            {visible.map((item, i) => {
              const cls = `flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] transition-colors ${
                TONES[item.tone] ?? TONES.default
              } ${item.disabled ? 'pointer-events-none opacity-50' : ''}`
              const content = (
                <>
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </>
              )

              return (
                <div key={item.key ?? `${item.label}-${i}`} role="none">
                  {item.separatorBefore && <div className="my-1 border-t border-line" />}
                  {item.to ? (
                    <Link role="menuitem" to={item.to} onClick={close} className={cls}>
                      {content}
                    </Link>
                  ) : item.href ? (
                    <a
                      role="menuitem"
                      href={item.href}
                      target={item.target ?? '_blank'}
                      rel="noreferrer"
                      onClick={close}
                      className={cls}
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      role="menuitem"
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        close()
                        item.onClick?.()
                      }}
                      className={cls}
                    >
                      {content}
                    </button>
                  )}
                </div>
              )
            })}
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body
        )}
    </>
  )
}
