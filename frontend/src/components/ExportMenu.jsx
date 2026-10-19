import { FileOutput, Printer, FileSpreadsheet, FileText, FileType2 } from 'lucide-react'
import Popover from './Popover.jsx'
import { IconButton } from './ui/Button.jsx'
import { exportCsv, exportExcel, printTable } from '../utils/exporters.js'

/**
 * Menu d'export partagé (Clients, Entreprises…).
 * `columns` : [{ header, value: (row) => string }] — colonnes RÉELLEMENT exportées.
 * `rows`    : les lignes actuellement affichées dans la liste.
 *
 * Le déclencheur est le bouton carré VIOLET des barres d'action de la référence.
 * Les exports eux-mêmes sont inchangés (impression / CSV / Excel / PDF).
 */
export default function ExportMenu({ filename, title, subtitle = '', columns, rows, disabled = false }) {
  const items = [
    { label: 'Imprimer', icon: Printer, run: () => printTable(title, columns, rows, subtitle) },
    { label: 'CSV', icon: FileText, run: () => exportCsv(filename, columns, rows) },
    { label: 'Excel', icon: FileSpreadsheet, run: () => exportExcel(filename, columns, rows) },
    { label: 'PDF', icon: FileType2, run: () => printTable(title, columns, rows, subtitle) },
  ]

  return (
    <Popover
      align="right"
      panelClassName="w-56 overflow-hidden rounded-xl bg-white shadow-menu"
      trigger={(toggle) => (
        <IconButton variant="primary" title="Exporter" onClick={toggle} disabled={disabled}>
          <FileOutput size={18} />
        </IconButton>
      )}
    >
      {(close) => (
        <div className="py-1">
          <div className="px-4 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-600 uppercase">
            Exporter {rows.length} ligne(s)
          </div>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => { close(); it.run() }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink-800 transition-colors hover:bg-surface"
            >
              <it.icon size={15} className="text-ink-600" /> {it.label}
            </button>
          ))}
          <p className="mt-1 border-t border-line px-4 pt-1.5 pb-2 text-[11px] leading-snug text-ink-600">
            PDF : choisissez « Enregistrer au format PDF » comme destination d'impression.
          </p>
        </div>
      )}
    </Popover>
  )
}
