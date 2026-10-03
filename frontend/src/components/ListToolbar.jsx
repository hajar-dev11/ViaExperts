/**
 * ToolBtn / RowBtn — boutons icônes historiques des listes.
 *
 * API inchangée : ce sont des `<button>` qui reçoivent `className` en surcharge.
 * Seules leurs couleurs sont réalignées sur les tokens du design system.
 *
 * Pour les onglets Actifs / Archivés / Corbeille, utiliser `ui/StatusTabs.jsx`,
 * qui applique le code couleur des captures de référence.
 */

export function ToolBtn({ children, className = '', title, ...props }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      {...props}
      className={`grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink-700 transition-colors hover:bg-surface hover:text-brand-600 focus-ring disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

export function RowBtn({ children, className = '', title, ...props }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      {...props}
      className={`grid h-8 w-8 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-surface hover:text-brand-600 focus-ring disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}
