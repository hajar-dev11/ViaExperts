import { Inbox } from 'lucide-react'

/**
 * EmptyState — absence de données.
 *
 * API inchangée (icon, title, hint, className) ; `action` (optionnel) permet de
 * proposer directement la sortie de l'état vide.
 *
 * Règle du projet : un module sans données reste VISIBLEMENT vide.
 * Aucune donnée fictive n'est affichée pour « remplir » un écran.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Aucune donnée disponible',
  hint,
  action,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-4 py-12 text-center ${className}`}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-ink-600">
        <Icon size={22} />
      </span>
      <span className="text-sm font-medium text-ink-800">{title}</span>
      {hint && <span className="max-w-sm text-xs text-ink-600">{hint}</span>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
