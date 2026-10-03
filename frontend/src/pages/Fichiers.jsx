import { useRef } from 'react'
import { Plus, Download, Trash2, FileText, FileImage, FileSpreadsheet, FileArchive, File as FileIcon } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import Button from '../components/ui/Button.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { useFiles } from '../context/FilesContext.jsx'
import { formatFileSize, formatDateTime } from '../utils/format.js'

function iconFor(type = '') {
  if (type.startsWith('image/')) return FileImage
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return FileSpreadsheet
  if (type.includes('zip') || type.includes('rar') || type.includes('compressed')) return FileArchive
  if (type.includes('pdf') || type.includes('word') || type.includes('text')) return FileText
  return FileIcon
}

export default function Fichiers() {
  const { files, addFiles, removeFile } = useFiles()
  const inputRef = useRef(null)

  const columns = [
    {
      key: 'name',
      header: 'Nom',
      render: (r) => {
        const Icon = iconFor(r.type)
        return (
          <span className="inline-flex items-center gap-2.5 font-semibold text-ink-900">
            <span className="h-8 w-8 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0">
              <Icon size={15} />
            </span>
            <span className="truncate max-w-[260px]">{r.name}</span>
          </span>
        )
      },
    },
    { key: 'type', header: 'Type', render: (r) => <span className="text-ink-600">{r.type || '—'}</span> },
    { key: 'size', header: 'Taille', render: (r) => formatFileSize(r.size) },
    { key: 'addedAt', header: 'Ajouté le', render: (r) => formatDateTime(r.addedAt) },
  ]

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <DataTable
        title="Fichiers"
        filter={<p className="text-sm text-ink-600">Les fichiers ajoutés sont enregistrés et restent disponibles après fermeture de l'application.</p>}
        actions={<Button variant="success" icon={<Plus size={16} />} onClick={() => inputRef.current?.click()}>Ajouter des fichiers</Button>}
        columns={columns}
        rows={files}
        emptyText="Aucun fichier"
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              title="Télécharger"
              aria-label="Télécharger"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-surface hover:text-brand-600 focus-ring"
            >
              <Download size={14} />
            </a>
            <RowBtn title="Supprimer" onClick={() => removeFile(r.id)}>
              <Trash2 size={14} />
            </RowBtn>
          </div>
        )}
      />
    </div>
  )
}
