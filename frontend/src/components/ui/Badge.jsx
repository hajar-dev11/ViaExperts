/**
 * Badge — pastille de statut du design system.
 *
 * Les captures de référence utilisent des pilules à fond très pâle et texte
 * coloré (« En Attente », « Demande Certificat Négatif »).
 */

const TONES = {
  primary: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
  neutral: 'bg-surface text-ink-700',
  dark: 'bg-dark-50 text-dark-600',
}

const SOLID = {
  primary: 'bg-brand-500 text-white',
  success: 'bg-success-500 text-white',
  warning: 'bg-warning-500 text-white',
  danger: 'bg-danger-500 text-white',
  info: 'bg-info-500 text-white',
  neutral: 'bg-ink-600 text-white',
  dark: 'bg-dark-500 text-white',
}

const SIZES = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}

export default function Badge({
  tone = 'neutral',
  solid = false,
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}) {
  const palette = solid ? SOLID : TONES
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-semibold ${
        palette[tone] ?? palette.neutral
      } ${SIZES[size] ?? SIZES.md} ${className}`}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}
