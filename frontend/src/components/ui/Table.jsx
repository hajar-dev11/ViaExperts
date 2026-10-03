import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import EmptyState from '../EmptyState.jsx'
import Pagination from './Pagination.jsx'
import { SkeletonTable } from './Skeleton.jsx'

/**
 * Table — tableau unique du design system, en DEUX MODES.
 *
 *   mode="client" : reçoit toutes les lignes, filtre/trie/pagine en mémoire.
 *   mode="server" : le parent possède page / perPage / search et recharge.
 *
 * `DataTable.jsx` et `ServerTable.jsx` sont désormais de simples enveloppes
 * autour de ce composant : leurs API respectives sont inchangées, aucune page
 * n'a besoin d'être modifiée.
 *
 * Colonne :
 *   { key, header, value?(row), render?(row),
 *     align?: 'left'|'right'|'center', numeric?: bool, wrap?: bool,
 *     sortable?: bool, headerClassName?, cellClassName? }
 *
 *   `numeric` aligne à droite ET active les chiffres tabulaires : les montants
 *   d'une colonne de facturation se comparent alors verticalement.
 */

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/**
 * `clamp: 1 | 2` sur une colonne — texte coupé avec « … » (1 ligne) ou étalé
 * sur 2 lignes maximum (nom long), plutôt que d'élargir la ligne à l'infini.
 * Classes Tailwind littérales : `line-clamp-${n}` ne serait pas détecté par
 * le scanner JIT.
 */
const CLAMP_CLASS = { 1: 'line-clamp-1', 2: 'line-clamp-2' }

/** Tableaux teintés par statut (Domiciliation : Active / Alerte / Déclaré / Expiré). */
const TONES = {
  success: { head: 'bg-success-500 text-white', body: 'bg-success-50/60', row: 'hover:bg-success-50' },
  warning: { head: 'bg-warning-500 text-white', body: 'bg-warning-50/60', row: 'hover:bg-warning-50' },
  danger: { head: 'bg-danger-500 text-white', body: 'bg-danger-50/60', row: 'hover:bg-danger-50' },
  neutral: { head: 'bg-ink-600 text-white', body: 'bg-surface/60', row: 'hover:bg-surface' },
}

const cellValue = (column, row) => {
  if (column.value) return column.value(row)
  return row[column.key]
}

const alignClass = (column) => {
  const align = column.align ?? (column.numeric ? 'right' : 'left')
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

function compare(a, b) {
  const an = typeof a === 'number' ? a : Number(String(a ?? '').replace(/[^\d.-]/g, ''))
  const bn = typeof b === 'number' ? b : Number(String(b ?? '').replace(/[^\d.-]/g, ''))
  const bothNumeric =
    Number.isFinite(an) && Number.isFinite(bn) && String(a ?? '').trim() !== '' && String(b ?? '').trim() !== ''
  if (bothNumeric) return an - bn
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', { numeric: true, sensitivity: 'base' })
}

export default function Table({
  // --- données ---
  columns = [],
  rows = [],
  mode = 'client',
  // --- en-tête de carte (optionnel) ---
  title,
  filter,
  actions,
  // --- barre d'outils ---
  showToolbar = true,
  showSizePicker = true,
  // Contenu placé à droite de la ligne « Afficher N entrées », au-dessus du
  // tableau — c'est là que la maquette place le bouton « Export ».
  toolbarRight,
  searchable = true,
  searchPlaceholder = 'Rechercher…',
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  // --- mode client ---
  pageSize = 10,
  sortable = true,
  // --- mode serveur ---
  meta,
  search: searchProp,
  onSearchChange,
  perPage: perPageProp,
  onPerPageChange,
  onPageChange,
  // --- rendu ---
  loading = false,
  rowActions,
  actionsHeader = '',
  rowClassName,
  rowKey,
  onRowClick,
  emptyText = 'Aucune donnée trouvée',
  emptyHint,
  tone,
  // Teinte de survol des lignes. La référence surligne la ligne pointée en
  // VERT sur certains tableaux (Services en cours) : d'où ce réglage.
  hoverClassName = 'hover:bg-surface',
  striped = true,
  stickyHeader = false,
  dense = false,
  className = '',
  footer,
}) {
  const server = mode === 'server'

  const [clientQuery, setClientQuery] = useState('')
  const [clientPage, setClientPage] = useState(0)
  const [clientSize, setClientSize] = useState(pageSize)
  const [sort, setSort] = useState(null) // { key, dir: 'asc' | 'desc' }

  const query = server ? (searchProp ?? '') : clientQuery
  const perPage = server ? (perPageProp ?? pageSize) : clientSize

  // --- filtrage (client uniquement) -----------------------------------------
  const filtered = useMemo(() => {
    if (server || !clientQuery.trim()) return rows
    const q = clientQuery.toLowerCase()
    return rows.filter((r) =>
      columns.some((c) => String(cellValue(c, r) ?? '').toLowerCase().includes(q))
    )
  }, [server, rows, clientQuery, columns])

  // --- tri (client uniquement) ----------------------------------------------
  const sorted = useMemo(() => {
    if (server || !sort) return filtered
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      const result = compare(cellValue(column, a), cellValue(column, b))
      return sort.dir === 'asc' ? result : -result
    })
    return copy
  }, [server, filtered, sort, columns])

  // --- pagination ------------------------------------------------------------
  const total = server ? (meta?.total ?? rows.length) : sorted.length
  const currentPage = server ? (meta?.current_page ?? 1) : clientPage + 1
  const lastPage = server ? (meta?.last_page ?? 1) : Math.max(1, Math.ceil(total / perPage))
  const pageRows = server ? rows : sorted.slice(clientPage * clientSize, clientPage * clientSize + clientSize)

  const handleSearch = (v) => {
    if (server) onSearchChange?.(v)
    else {
      setClientQuery(v)
      setClientPage(0)
    }
  }

  const handlePerPage = (v) => {
    if (server) onPerPageChange?.(v)
    else {
      setClientSize(v)
      setClientPage(0)
    }
  }

  const handlePage = (p) => {
    if (server) onPageChange?.(p)
    else setClientPage(p - 1)
  }

  const toggleSort = (column) => {
    if (server || !sortable || column.sortable === false) return
    setSort((s) =>
      s?.key === column.key
        ? s.dir === 'asc'
          ? { key: column.key, dir: 'desc' }
          : null
        : { key: column.key, dir: 'asc' }
    )
    setClientPage(0)
  }

  const palette = tone ? (TONES[tone] ?? TONES.neutral) : null
  const colCount = columns.length + (rowActions ? 1 : 0)
  const padY = dense ? 'py-2.5' : 'py-4'

  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-card ${className}`}>
      {(title || filter || actions) && (
        <div className="flex flex-wrap items-center gap-4 px-6 pt-6">
          {title && <h2 className="min-w-0 truncate text-xl text-ink-900">{title}</h2>}
          {filter}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}

      {showToolbar && (searchable || showSizePicker || toolbarRight) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          {showSizePicker ? (
            <label className="flex items-center gap-2 text-sm text-ink-600">
              Afficher
              <select
                value={perPage}
                onChange={(e) => handlePerPage(Number(e.target.value))}
                className="h-9 cursor-pointer rounded-lg border border-line bg-white px-2 text-sm text-ink-800 transition-colors focus-ring hover:border-brand-300"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              entrées
            </label>
          ) : (
            <span />
          )}

          {searchable && (
            <input
              type="search"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Rechercher dans le tableau"
              className="h-10 w-full max-w-xs rounded-lg border border-line bg-white px-3.5 text-sm text-ink-800 transition-colors placeholder:text-ink-600 focus-ring hover:border-brand-300"
            />
          )}

          {toolbarRight && <div className="flex items-center gap-2">{toolbarRight}</div>}
        </div>
      )}

      <div className="table-wrap overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className={
                palette
                  ? palette.head
                  : 'border-y border-line bg-white text-ink-600'
              }
            >
              {columns.map((c) => {
                const active = sort?.key === c.key
                const canSort = !server && sortable && c.sortable !== false
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-4 ${padY} text-[13px] font-semibold tracking-wide uppercase whitespace-nowrap ${alignClass(
                      c
                    )} ${stickyHeader ? 'sticky top-0 z-10 bg-white' : ''} ${c.headerClassName ?? ''}`}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        className={`inline-flex items-center gap-1.5 rounded transition-colors focus-ring hover:text-brand-600 ${
                          active ? 'text-brand-600' : ''
                        } ${c.align === 'right' || c.numeric ? 'flex-row-reverse' : ''}`}
                      >
                        {c.header}
                        {active ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp size={13} />
                          ) : (
                            <ArrowDown size={13} />
                          )
                        ) : (
                          <ChevronsUpDown size={13} className="opacity-30" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
              {rowActions && (
                <th
                  scope="col"
                  className={`px-4 ${padY} text-right text-[13px] font-semibold tracking-wide uppercase whitespace-nowrap ${
                    stickyHeader ? 'sticky top-0 z-10 bg-white' : ''
                  }`}
                >
                  {actionsHeader}
                </th>
              )}
            </tr>
          </thead>

          <tbody className={palette ? palette.body : ''}>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <SkeletonTable rows={5} columns={Math.min(colCount, 6)} />
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState title={emptyText} hint={emptyHint} />
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const statusClass = rowClassName?.(row) ?? ''
                return (
                <tr
                  key={rowKey?.(row) ?? row.id ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-line/70 transition-colors last:border-0 ${
                    striped && !palette && !statusClass && i % 2 === 1 ? 'bg-surface' : ''
                  } ${palette ? palette.row : statusClass ? '' : hoverClassName} ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${statusClass}`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 ${padY} align-middle text-ink-800 ${alignClass(c)} ${
                        c.numeric ? 'tabular' : ''
                      } ${c.clamp ? '' : c.wrap ? '' : 'whitespace-nowrap'} ${c.cellClassName ?? ''}`}
                    >
                      {/* `-webkit-line-clamp` n'a pas d'effet fiable posé
                          directement sur un `<td>` (conflit avec `display:
                          table-cell`) : la classe part donc sur un `<div>`
                          interne, seul point qui reçoit aussi la largeur max. */}
                      {c.clamp ? (
                        <div
                          className={CLAMP_CLASS[c.clamp] ?? ''}
                          style={{ maxWidth: c.width ?? 260 }}
                        >
                          {c.render ? c.render(row) : cellValue(c, row)}
                        </div>
                      ) : (
                        c.render ? c.render(row) : cellValue(c, row)
                      )}
                    </td>
                  ))}
                  {rowActions && (
                    <td className={`px-4 ${padY} text-right whitespace-nowrap`}>{rowActions(row)}</td>
                  )}
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <Pagination
          page={currentPage}
          lastPage={lastPage}
          total={total}
          perPage={perPage}
          onPageChange={handlePage}
        />
      )}

      {footer}
    </div>
  )
}
