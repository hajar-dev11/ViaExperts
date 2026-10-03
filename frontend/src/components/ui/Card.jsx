/**
 * Card — surface blanche du design system.
 *
 * Reprend les cartes des captures : coins arrondis ~12 px, ombre très douce,
 * pas de bordure marquée, titre en graisse normale (et non en gras lourd).
 */
export default function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-xl bg-white shadow-card ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * En-tête de carte : titre à gauche, actions à droite (barre de boutons
 * colorés des listes de référence). `filter` s'intercale entre les deux.
 */
export function CardHeader({ title, subtitle, filter, actions, className = '', children }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 px-6 pt-6 pb-4 ${className}`}>
      {(title || subtitle) && (
        <div className="min-w-0">
          {title && <h2 className="text-xl text-ink-900 truncate">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-ink-600">{subtitle}</p>}
        </div>
      )}
      {filter && <div className="min-w-0">{filter}</div>}
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className = '', children }) {
  return <div className={`px-6 pb-6 ${className}`}>{children}</div>
}

export function CardFooter({ className = '', children }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line px-6 py-4 ${className}`}>
      {children}
    </div>
  )
}
