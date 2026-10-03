/**
 * Skeleton — état de chargement.
 * Remplace les « Chargement… » textuels par une silhouette du contenu attendu.
 */
export default function Skeleton({ className = '', rounded = 'rounded-md' }) {
  return (
    <span
      aria-hidden="true"
      className={`relative block overflow-hidden bg-surface ${rounded} ${className}`}
    >
      <span
        className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/70 to-transparent"
        style={{ animation: 've-shimmer 1.4s infinite' }}
      />
    </span>
  )
}

/** Lignes de texte au chargement. */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** Squelette de tableau : reproduit la grille pour éviter tout saut de mise en page. */
export function SkeletonTable({ rows = 5, columns = 5, className = '' }) {
  return (
    <div className={`px-6 py-2 ${className}`} role="status" aria-label="Chargement des données">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line py-4 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? 'w-40' : 'w-24'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Squelette de carte KPI. */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`rounded-xl bg-white p-5 shadow-card ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-16" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  )
}
