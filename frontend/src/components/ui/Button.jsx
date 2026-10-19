import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

/**
 * Button / IconButton — boutons du design system.
 *
 * Variantes reprises des captures de référence :
 *   primary   violet  #7367F0  → action principale, pagination active
 *   success   vert    #28C76F  → « + Ajouter » en tête de liste
 *   warning   orange  #FF9F43  → Archive
 *   danger    rouge   #EA5455  → Supprimer
 *   info      cyan    #00CFE8
 *   dark      #4B4B4B          → Corbeille
 *   secondary / ghost / link   → actions discrètes
 *
 * `to` rend un <Link> react-router, sinon un <button>.
 */

const VARIANTS = {
  primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm',
  success: 'bg-success-500 hover:bg-success-600 text-white shadow-sm',
  warning: 'bg-warning-500 hover:bg-warning-600 text-white shadow-sm',
  danger: 'bg-danger-500 hover:bg-danger-600 text-white shadow-sm',
  info: 'bg-info-500 hover:bg-info-600 text-white shadow-sm',
  dark: 'bg-dark-500 hover:bg-dark-600 text-white shadow-sm',
  secondary: 'bg-white border border-line text-ink-800 hover:bg-surface',
  ghost: 'text-ink-800 hover:bg-surface',
  link: 'text-brand-500 hover:text-brand-600 hover:underline',
  'primary-soft': 'bg-brand-50 text-brand-600 hover:bg-brand-100',
  'success-soft': 'bg-success-50 text-success-700 hover:bg-success-100',
  'warning-soft': 'bg-warning-50 text-warning-700 hover:bg-warning-100',
  'danger-soft': 'bg-danger-50 text-danger-700 hover:bg-danger-100',
}

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-[15px] gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
}

const ICON_SIZES = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
}

const BASE =
  'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors focus-ring disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none'

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  to,
  className = '',
  children,
  disabled,
  ...props
}) {
  const classes = [
    BASE,
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </>
  )

  if (to && !disabled && !loading) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" disabled={disabled || loading} className={classes} {...props}>
      {content}
    </button>
  )
}

/**
 * IconButton — carré coloré des barres d'action de liste (export / ajouter /
 * archive / corbeille sur les captures). `title` sert aussi d'`aria-label`.
 */
export function IconButton({
  variant = 'secondary',
  size = 'md',
  to,
  title,
  className = '',
  children,
  loading = false,
  disabled,
  ...props
}) {
  const classes = [
    BASE,
    VARIANTS[variant] ?? VARIANTS.secondary,
    ICON_SIZES[size] ?? ICON_SIZES.md,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = loading ? <Loader2 size={16} className="animate-spin" /> : children

  if (to && !disabled && !loading) {
    return (
      <Link to={to} title={title} aria-label={title} className={classes} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled || loading}
      className={classes}
      {...props}
    >
      {content}
    </button>
  )
}
