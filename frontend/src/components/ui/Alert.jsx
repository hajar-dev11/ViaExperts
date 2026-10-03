import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

/**
 * Alert — message contextuel en place (erreur de formulaire, information de
 * contexte). Pour un retour transitoire après une action, préférer le Toast.
 */

const TONES = {
  success: { cls: 'bg-success-50 text-success-700', Icon: CheckCircle2 },
  warning: { cls: 'bg-warning-50 text-warning-700', Icon: TriangleAlert },
  danger: { cls: 'bg-danger-50 text-danger-700', Icon: AlertCircle },
  info: { cls: 'bg-info-50 text-info-700', Icon: Info },
  primary: { cls: 'bg-brand-50 text-brand-600', Icon: Info },
  neutral: { cls: 'bg-surface text-ink-700', Icon: Info },
}

export default function Alert({
  tone = 'info',
  title,
  children,
  icon = true,
  onClose,
  className = '',
}) {
  const { cls, Icon } = TONES[tone] ?? TONES.info

  return (
    <div role="alert" className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${cls} ${className}`}>
      {icon && <Icon size={17} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-ring"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
