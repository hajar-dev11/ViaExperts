import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, CircleDot, Circle, X } from 'lucide-react'
import Logo from './Logo.jsx'
import { nav } from './navConfig.js'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Sidebar — reproduction du menu du système de référence.
 *
 * Relevé au pixel sur les captures :
 *   fond              #2F3349
 *   groupe ouvert     pilule violette translucide + libellé et chevron DORÉS
 *   élément actif     pilule violette #7367F0 en dégradé + texte blanc
 *   sous-éléments     puce annulaire, actif en pilule violette pleine
 *   chevrons          dorés, orientés à droite (fermé) / bas (ouvert)
 *
 * ⚠️ La NAVIGATION n'est pas modifiée : mêmes entrées, mêmes destinations,
 * même logique d'ouverture automatique du groupe courant. Seule la
 * présentation change. `navConfig.js` reste l'unique source des entrées.
 */

const STORAGE_KEY = 'via-experts:sidebar-collapsed'

export default function Sidebar({ mobileOpen, onClose }) {
  const location = useLocation()
  const { hasPermission } = useAuth()
  // Une entrée sans `permission` reste visible à tous ; sinon elle ne s'affiche
  // que si l'utilisateur (admin, ou staff via Paramètres → Assistance) l'a.
  const visible = (item) => !item.permission || hasPermission(item.permission.module, item.permission.action)
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(
      nav.filter((n) => n.children).map((n) => [n.label, location.pathname.startsWith(n.base)])
    )
  )

  // Repli en rail d'icônes (desktop uniquement), mémorisé dans le navigateur.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* stockage indisponible : le repli reste valable pour la session */
    }
  }, [collapsed])

  // Le groupe de la route active reste seul ouvert : tout autre groupe,
  // même ouvert manuellement, se referme dès qu'on change de module.
  useEffect(() => {
    setOpenGroups(
      Object.fromEntries(
        nav.filter((n) => n.children).map((n) => [n.label, location.pathname.startsWith(n.base)])
      )
    )
  }, [location.pathname])

  const toggle = (label) => setOpenGroups((p) => ({ ...p, [label]: !p[label] }))

  const ACTIVE_PILL =
    'bg-linear-to-r from-brand-500 to-brand-500/70 text-white shadow-[0_2px_6px_rgba(115,103,240,0.45)]'

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink-950/60 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-ink-950 transition-[transform,width] duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-[260px] lg:w-[84px]' : 'w-[260px]'}`}
      >
        {/* En-tête : logo + bouton de repli (le cercle de la capture) */}
        <div
          className={`flex h-[70px] shrink-0 items-center gap-2 px-5 ${
            collapsed ? 'lg:justify-center lg:gap-1.5 lg:px-2' : ''
          }`}
        >
          <Logo dark collapsed={false} className={collapsed ? 'lg:hidden' : ''} />
          <Logo dark collapsed className={collapsed ? 'hidden lg:flex' : 'hidden'} />

          {/* Repli / dépli — le bouton reste TOUJOURS accessible, y compris une
              fois le menu réduit en rail d'icônes. */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className={`hidden shrink-0 rounded text-white/70 transition-colors hover:text-white focus-ring lg:block ${
              collapsed ? '' : 'ml-auto'
            }`}
          >
            <CircleDot size={19} />
          </button>

          <button
            type="button"
            className="ml-auto text-white/70 transition-colors hover:text-white lg:hidden"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto px-3 pt-2 pb-6">
          {nav.filter(visible).map((item) => {
            const Icon = item.icon

            // ---- Groupe avec sous-entrées ------------------------------------
            if (item.children) {
              const active = location.pathname.startsWith(item.base)
              const open = !!openGroups[item.label]

              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => (collapsed ? setCollapsed(false) : toggle(item.label))}
                    title={collapsed ? item.label : undefined}
                    aria-expanded={open}
                    className={`flex w-full items-center gap-3 rounded-lg px-4 py-2 transition-colors focus-ring ${
                      collapsed ? 'lg:justify-center lg:px-0' : ''
                    } ${
                      active
                        ? 'bg-brand-500/55 text-amber-accent'
                        : 'text-white/90 hover:bg-white/10'
                    }`}
                  >
                    <Icon size={19} className="shrink-0" />
                    <span
                      className={`flex-1 text-left text-[15px] whitespace-nowrap ${
                        collapsed ? 'lg:hidden' : ''
                      }`}
                    >
                      {item.label}
                    </span>
                    <ChevronRight
                      size={17}
                      className={`shrink-0 text-amber-accent transition-transform ${
                        open ? 'rotate-90' : ''
                      } ${collapsed ? 'lg:hidden' : ''}`}
                    />
                  </button>

                  {open && (
                    <div className={`mt-1.5 space-y-1.5 ${collapsed ? 'lg:hidden' : ''}`}>
                      {item.children.filter(visible).map((c) => (
                        <NavLink
                          key={c.to}
                          to={c.to}
                          end={c.to === item.base}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-lg py-2 pr-4 pl-5 text-[15px] transition-colors focus-ring ${
                              isActive ? ACTIVE_PILL : 'text-white/85 hover:bg-white/10'
                            }`
                          }
                        >
                          <Circle size={9} strokeWidth={2.5} className="shrink-0" />
                          <span className="truncate">{c.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // ---- Entrée simple ------------------------------------------------
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 py-2 text-[15px] transition-colors focus-ring ${
                    collapsed ? 'lg:justify-center lg:px-0' : ''
                  } ${isActive ? ACTIVE_PILL : 'text-white/90 hover:bg-white/10'}`
                }
              >
                <Icon size={19} className="shrink-0" />
                <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
