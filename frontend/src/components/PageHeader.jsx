import { NavLink } from 'react-router-dom'
import Button from './ui/Button.jsx'

/**
 * PageHeader — titre de page, action principale et onglets.
 *
 * API inchangée : `title`, `action` ({ to | onClick, label, icon, color }),
 * `tabs`.
 *
 * Alignement sur les captures de référence : l'action principale d'une liste
 * (« + Nouvelle Client », « Ajouter Facture »…) y est VERTE. `action.color`
 * permet toujours d'imposer une autre variante au cas par cas.
 */

export function TabLink({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
          isActive
            ? 'border-brand-500 text-brand-500'
            : 'border-transparent text-ink-700 hover:text-ink-900'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

const KNOWN_VARIANTS = [
  'primary', 'success', 'warning', 'danger', 'info', 'dark', 'secondary', 'ghost', 'link',
]

export default function PageHeader({ title, action, tabs }) {
  // `color` historique : 'brand' ou une classe Tailwind. On le traduit vers les
  // variantes du design system sans casser les appels existants.
  const variant =
    action?.color && KNOWN_VARIANTS.includes(action.color)
      ? action.color
      : 'success'
  const extraClass =
    action?.color && !KNOWN_VARIANTS.includes(action.color) && action.color !== 'brand'
      ? action.color
      : ''

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] text-ink-900">{title}</h1>
        {action && (
          <Button
            variant={variant}
            to={action.to}
            onClick={action.onClick}
            icon={action.icon}
            className={extraClass}
          >
            {action.label}
          </Button>
        )}
      </div>
      {tabs && <div className="mt-4 flex flex-wrap gap-1 border-b border-line">{tabs}</div>}
    </div>
  )
}
