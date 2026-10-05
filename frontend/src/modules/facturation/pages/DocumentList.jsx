import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Plus, Printer, ListTree, Archive, Trash2, RotateCcw, Pencil, Wallet, ArrowLeft } from 'lucide-react'
import DataTable from '../../../components/DataTable.jsx'
import ExportMenu from '../../../components/ExportMenu.jsx'
import ConfirmDialog from '../../../components/ConfirmDialog.jsx'
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button, { IconButton } from '../../../components/ui/Button.jsx'
import { RowBtn } from '../../../components/ListToolbar.jsx'
import { Select } from '../../../components/Field.jsx'
import { ApiError } from '../../../api/http.js'
import { imprimerDocumentCommercial } from '../print/documentCommercial.js'
import {
  listDocuments, archiveDocument, corbeilleDocument, restoreDocument, deleteDocumentForever,
} from '../api/facturation.js'

// « Actifs » a été retiré : c'est la vue par défaut, et « Retour à la liste »
// suffit déjà à y revenir depuis Archivés/Corbeille — plus besoin d'un
// troisième bouton entre Exporter et Archivés.
const TABS = [
  { key: 'archive', label: 'Archivés', icon: Archive },
  { key: 'corbeille', label: 'Corbeille', icon: Trash2 },
]

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`

/** Impression réelle du document (gabarit Via Experts — logo, bandeau coloré, montant en lettres, cachet). */
export const imprimerDocument = imprimerDocumentCommercial

export default function DocumentList({ title, addTo, addLabel, type, editBase }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [responsable, setResponsable] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listDocuments(type, { status })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter ces documents."
        : 'Impossible de charger les documents.'))
      .finally(() => setLoading(false))
  }, [type, status])

  useEffect(load, [load])

  // Filtre « Tous les Responsables » de la capture de référence.
  const responsables = useMemo(
    () => [...new Set(rows.map((r) => r.responsable).filter(Boolean))],
    [rows],
  )
  const visibles = useMemo(
    () => (responsable ? rows.filter((r) => r.responsable === responsable) : rows),
    [rows, responsable],
  )

  const run = async (fn, message) => {
    setError(''); setSuccess('')
    try {
      await fn()
      setSuccess(message)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const columns = [
    { key: 'responsable', header: 'Responsable' },
    { key: 'numero', header: 'Numéro', render: (r) => <span className="font-mono text-xs font-semibold text-ink-900">{r.numero}</span> },
    {
      key: 'tiers',
      header: 'Client / Entreprise',
      render: (r) => (
        <Link
          to={r.tiersType === 'entreprise' ? `/entreprises/${r.partyId}` : `/clients/${r.partyId}`}
          className="font-semibold text-brand-700 hover:underline"
        >
          {r.tiers}
        </Link>
      ),
    },
    { key: 'dateDocument', header: 'Date Facturation' },
    { key: 'totalTtc', header: 'Total TTC', value: (r) => r.totalTtc, render: (r) => dh(r.totalTtc) },
    { key: 'prixPaye', header: 'Prix Payer', value: (r) => r.prixPaye, render: (r) => dh(r.prixPaye) },
    {
      key: 'prixRestant',
      header: 'Rest',
      value: (r) => r.prixRestant,
      render: (r) => <span className="font-semibold text-ink-900">{dh(r.prixRestant)}</span>,
    },
  ]

  const exportColumns = [
    { header: 'Responsable', value: (r) => r.responsable },
    { header: 'Numéro', value: (r) => r.numero },
    { header: 'Client / Entreprise', value: (r) => r.tiers },
    { header: 'Date Facturation', value: (r) => r.dateDocument },
    { header: 'Total TTC', value: (r) => r.totalTtc },
    { header: 'Prix Payer', value: (r) => r.prixPaye },
    { header: 'Rest', value: (r) => r.prixRestant },
  ]

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {success && <Alert tone="success" className="mb-3">{success}</Alert>}

      <DataTable
        title={title}
        filter={(
          <div className="flex flex-wrap items-center gap-2">
            {status !== 'actif' && (
              <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
                Retour à la liste
              </Button>
            )}
            <div className="w-full sm:w-56">
              <Select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                <option value="">Tous les Responsables</option>
                {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
          </div>
        )}
        actions={(
          <>
            <Button variant="success" to={addTo} icon={<Plus size={16} />}>{addLabel}</Button>
            <ExportMenu
              filename={`${type}-${status}`}
              title={title}
              subtitle={TABS.find((t) => t.key === status)?.label}
              columns={exportColumns}
              rows={visibles}
              disabled={visibles.length === 0}
            />
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir à la liste' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir à la liste' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille'))}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={visibles}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucun document' : status === 'archive' ? 'Aucun document archivé' : 'Corbeille vide'}
        actionsHeader="ACTION"
        rowClassName={(r) => (Number(r.prixRestant) > 0 ? 'bg-warning-200' : 'bg-success-200')}
        striped={false}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <RowBtn title="Imprimer" onClick={() => imprimerDocument(type, r).catch(() => setError("L'impression a échoué."))}><Printer size={14} /></RowBtn>
            <ActionMenu
              label="Actions"
              icon={<ListTree size={15} />}
              items={
                status === 'actif'
                  ? [
                      // « Paiements » n'a de sens que pour une Facture — Devis, Bon de
                      // Livraison et Facture d'Avoir n'ont pas de règlement à rattacher.
                      ...(type === 'facture' ? [{
                        label: 'Paiements',
                        icon: <Wallet size={15} />,
                        onClick: () => navigate('/paiement', { state: { documentId: r.id } }),
                      }] : []),
                      { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => navigate(`${editBase}/${r.id}/modifier`) },
                      {
                        label: 'Archiver',
                        icon: <Archive size={15} />,
                        tone: 'warning',
                        onClick: () => setConfirm({
                          title: 'Archiver ce document ?',
                          message: `« ${r.numero} » sera déplacé dans les archives.`,
                          confirmLabel: 'Archiver',
                          run: () => run(() => archiveDocument(type, r.id), 'Document archivé.'),
                        }),
                      },
                      {
                        label: 'Corbeille',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        onClick: () => setConfirm({
                          title: 'Mettre ce document à la corbeille ?',
                          message: `« ${r.numero} » sera déplacé dans la corbeille.`,
                          confirmLabel: 'Corbeille',
                          run: () => run(() => corbeilleDocument(type, r.id), 'Document placé dans la corbeille.'),
                        }),
                      },
                    ]
                  : status === 'archive'
                  ? [
                      { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreDocument(type, r.id), 'Document restauré.') },
                      {
                        label: 'Corbeille',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        onClick: () => setConfirm({
                          title: 'Mettre ce document à la corbeille ?',
                          message: `« ${r.numero} » sera déplacé dans la corbeille.`,
                          confirmLabel: 'Corbeille',
                          run: () => run(() => corbeilleDocument(type, r.id), 'Document placé dans la corbeille.'),
                        }),
                      },
                    ]
                  : [
                      { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreDocument(type, r.id), 'Document restauré.') },
                      {
                        label: 'Supprimer définitivement',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        onClick: () => setConfirm({
                          title: 'Supprimer définitivement',
                          message: `Supprimer définitivement « ${r.numero} » ? Cette action est irréversible.`,
                          confirmLabel: 'Supprimer',
                          run: () => run(() => deleteDocumentForever(type, r.id), 'Document supprimé définitivement.'),
                        }),
                      },
                    ]
              }
            />
          </div>
        )}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        confirmLabel={confirm?.confirmLabel}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />
    </div>
  )
}
