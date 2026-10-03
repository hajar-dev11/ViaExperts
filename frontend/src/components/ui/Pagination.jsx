import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Pagination numérotée, comme sur les captures de référence :
 * « ‹ 1 2 3 4 5 … 79 › », la page courante en pilule violette pleine,
 * précédée du compteur « Affichage de X à Y sur Z entrées ».
 *
 * Les pages sont indexées à partir de 1.
 */

/** Construit la suite de pages avec ellipses : 1 … 4 [5] 6 … 79 */
function buildPages(current, last, windowSize = 1) {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)

  const pages = new Set([1, last, current])
  for (let i = 1; i <= windowSize; i += 1) {
    if (current - i > 1) pages.add(current - i)
    if (current + i < last) pages.add(current + i)
  }
  // Toujours montrer au moins 5 numéros pour éviter une barre qui « saute ».
  if (current <= 3) [2, 3, 4].forEach((p) => p < last && pages.add(p))
  if (current >= last - 2) [last - 1, last - 2, last - 3].forEach((p) => p > 1 && pages.add(p))

  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b)

  const withGaps = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withGaps.push('…')
    withGaps.push(p)
  })
  return withGaps
}

export default function Pagination({
  page = 1,
  lastPage = 1,
  total = 0,
  perPage = 10,
  onPageChange,
  className = '',
  showSummary = true,
}) {
  if (lastPage <= 1 && !showSummary) return null

  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const pages = buildPages(page, Math.max(1, lastPage))

  const go = (p) => {
    if (p < 1 || p > lastPage || p === page) return
    onPageChange?.(p)
  }

  const cell =
    'grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm transition-colors focus-ring'

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${className}`}>
      {showSummary && (
        <p className="text-sm text-ink-600 tabular">
          Affichage de {from} à {to} sur {total} entrée{total > 1 ? 's' : ''}
        </p>
      )}

      {lastPage > 1 && (
        <nav aria-label="Pagination" className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Page précédente"
            className={`${cell} text-ink-700 hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            <ChevronLeft size={16} />
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className={`${cell} text-ink-600`}>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`${cell} tabular ${
                  p === page
                    ? 'bg-brand-500 font-semibold text-white shadow-sm'
                    : 'text-ink-700 hover:bg-surface'
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={page >= lastPage}
            aria-label="Page suivante"
            className={`${cell} text-ink-700 hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  )
}
