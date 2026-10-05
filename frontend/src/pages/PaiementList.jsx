import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Printer, Archive, Trash2, RotateCcw, Pencil, ArrowLeft, ListTree, Paperclip } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { Select } from '../components/Field.jsx'
import { ApiError, API_URL } from '../api/http.js'
import { EMETTEURS } from '../shared/constants/documents.js'
import { formatDate } from '../utils/format.js'
import ChoixFormatRecu from '../components/ChoixFormatRecu.jsx'
import { imprimerRecuPaiement, imprimerRecuPaiementPdf } from '../utils/documentPrint.js'
import {
  listPaiements, archivePaiement, corbeillePaiement, restorePaiement, deletePaiementForever,
} from '../api/paiements.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`

/** Impression réelle du reçu (gabarit Via Experts — logo, montant en lettres, deux exemplaires). */
export const imprimerPaiement = imprimerRecuPaiement

export default function PaiementList() {
  const navigate = useNavigate()
  const toast = useToast()
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  // Filtre venant de « Liste des factures → Paiement » ou de « Mouvements
  // entrées reçus → œil » : n'affiche que le(s) paiement(s) liés à l'élément
  // sélectionné, plutôt que toute la liste.
  const [filtreDocumentId] = useState(() => location.state?.documentId || null)
  const [filtrePaiementId] = useState(() => location.state?.paiementId || null)
  const [filtreActif, setFiltreActif] = useState(() => Boolean(location.state?.documentId || location.state?.paiementId))
  const [responsable, setResponsable] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  // Paiement dont l'utilisateur choisit le format de reçu (A5 / A4) avant impression.
  const [choixRecu, setChoixRecu] = useState(null)

  // `window.open` (dans `imprimerRecuPaiementPdf`) est appelé de façon synchrone depuis
  // ce clic de choix : le navigateur autorise l'onglet du PDF.
  const imprimerRecu = (format) => {
    const paiement = choixRecu
    setChoixRecu(null)
    imprimerRecuPaiementPdf(paiement, format).catch(() => setError("L'impression du reçu a échoué."))
  }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listPaiements({
      status,
      documentId: filtreActif ? filtreDocumentId || undefined : undefined,
      id: filtreActif ? filtrePaiementId || undefined : undefined,
    })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les paiements."
        : 'Impossible de charger les paiements.'))
      .finally(() => setLoading(false))
  }, [status, filtreActif, filtreDocumentId, filtrePaiementId])

  useEffect(load, [load])

  const visibles = useMemo(() => {
    const filtered = responsable ? rows.filter((r) => r.responsable === responsable) : rows
    return filtered.map((r, i) => ({ ...r, numeroOrdre: `#${i + 1}` }))
  }, [rows, responsable])

  const run = async (fn, message) => {
    setError('')
    try {
      await fn()
      toast.success(message)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const ask = (message, fn, messageOk, tone = 'warning', confirmLabel = 'Confirmer') => {
    setConfirm({ message, tone, confirmLabel, run: () => run(fn, messageOk) })
  }

  const columns = [
    { key: 'numeroOrdre', header: 'Reference', render: (r) => <span className="font-semibold text-brand-700">{r.numeroOrdre}</span> },
    { key: 'responsable', header: 'Responsable' },
    {
      key: 'client',
      header: 'Client',
      clamp: 2,
      render: (r) => (
        <Link
          to={r.entrepriseId ? `/entreprises/${r.entrepriseId}` : `/clients/${r.clientId}`}
          className="font-semibold text-brand-700 hover:underline"
        >
          {r.client}
        </Link>
      ),
    },
    { key: 'total', header: 'Total', value: (r) => r.total, render: (r) => dh(r.total) },
    { key: 'prixPaye', header: 'Montant Paye', value: (r) => r.prixPaye, render: (r) => dh(r.prixPaye) },
    {
      key: 'prixRestant',
      header: 'Prix Restant',
      value: (r) => r.prixRestant,
      render: (r) => <span className="font-semibold text-ink-900">{dh(r.prixRestant)}</span>,
    },
    { key: 'modePaiement', header: 'Paiements Method', render: (r) => r.modePaiement || <span className="text-ink-600">—</span> },
    { key: 'observation', header: 'Observation', clamp: 1, render: (r) => <span className="text-ink-600">{r.observation || '—'}</span> },
    {
      key: 'fichier',
      header: 'Fichier',
      render: (r) => (r.pieceJointeChemin ? (
        <a
          href={`${API_URL}/storage/${r.pieceJointeChemin}`}
          target="_blank"
          rel="noreferrer"
          title={r.pieceJointeNom || 'Télécharger'}
          className="inline-flex items-center gap-1.5 text-brand-600 hover:underline"
        >
          <Paperclip size={14} />
        </a>
      ) : <span className="text-ink-600">—</span>),
    },
    { key: 'dateOperation', header: 'Date Opération', render: (r) => formatDate(r.dateOperation) },
  ]

  const exportColumns = [
    { header: 'Reference', value: (r) => r.numeroOrdre },
    { header: 'Responsable', value: (r) => r.responsable },
    { header: 'Client', value: (r) => r.client },
    { header: 'Total', value: (r) => r.total },
    { header: 'Montant Paye', value: (r) => r.prixPaye },
    { header: 'Prix Restant', value: (r) => r.prixRestant },
    { header: 'Paiements Method', value: (r) => r.modePaiement },
    { header: 'Observation', value: (r) => r.observation },
  ]

  const menuItems = (r) => {
    if (status === 'actif') {
      return [
        {
          label: 'Modifier',
          icon: <Pencil size={15} />,
          onClick: () => navigate(`/paiement/${r.id}/modifier`),
        },
        {
          label: 'Archiver',
          icon: <Archive size={15} />,
          tone: 'warning',
          onClick: () => ask(
            `Archiver « ${r.reference} » ?`,
            () => archivePaiement(r.id),
            'Paiement archivé.',
            'warning',
            'Archiver',
          ),
        },
        {
          label: 'Corbeille',
          icon: <Trash2 size={15} />,
          tone: 'danger',
          onClick: () => ask(
            `Placer « ${r.reference} » dans la corbeille ?`,
            () => corbeillePaiement(r.id),
            'Paiement placé dans la corbeille.',
            'danger',
            'Corbeille',
          ),
        },
      ]
    }
    if (status === 'archive') {
      return [
        {
          label: 'Restaurer',
          icon: <RotateCcw size={15} />,
          onClick: () => ask(
            `Restaurer « ${r.reference} » ?`,
            () => restorePaiement(r.id),
            'Paiement restauré.',
            'success',
            'Restaurer',
          ),
        },
        {
          label: 'Corbeille',
          icon: <Trash2 size={15} />,
          tone: 'danger',
          onClick: () => ask(
            `Placer « ${r.reference} » dans la corbeille ?`,
            () => corbeillePaiement(r.id),
            'Paiement placé dans la corbeille.',
            'danger',
            'Corbeille',
          ),
        },
      ]
    }
    return [
      {
        label: 'Restaurer',
        icon: <RotateCcw size={15} />,
        onClick: () => ask(
          `Restaurer « ${r.reference} » ?`,
          () => restorePaiement(r.id),
          'Paiement restauré.',
          'success',
          'Restaurer',
        ),
      },
      {
        label: 'Supprimer définitivement',
        icon: <Trash2 size={15} />,
        tone: 'danger',
        onClick: () => ask(
          `Supprimer définitivement « ${r.reference} » ? Cette action est irréversible.`,
          () => deletePaiementForever(r.id),
          'Paiement supprimé définitivement.',
          'danger',
          'Supprimer',
        ),
      },
    ]
  }

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      <DataTable
        title="List Des Paiements"
        filter={(
          <>
            {filtreActif && (
              <button
                type="button"
                onClick={() => setFiltreActif(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
              >
                <ArrowLeft size={15} /> Voir tous les paiements
              </button>
            )}
            {status !== 'actif' && (
              <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
                Retour à la liste
              </Button>
            )}
            <div className="w-full sm:w-64">
              <Select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                <option value="">Tous les responsables</option>
                {EMETTEURS.map((e) => <option key={e.value} value={e.label}>{e.label}</option>)}
              </Select>
            </div>
          </>
        )}
        actions={(
          <>
            <ExportMenu
              filename={`paiements-${status}`}
              title="List Des Paiements"
              columns={exportColumns}
              rows={visibles}
              disabled={visibles.length === 0}
            />
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux paiements actifs' : 'Archive'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux paiements actifs' : 'Corbeille'}
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
        emptyText={status === 'actif' ? 'Aucun paiement' : status === 'archive' ? 'Aucun paiement archivé' : 'Corbeille vide'}
        actionsHeader="ACTION"
        rowClassName={(r) => (Number(r.prixRestant) > 0 ? 'bg-warning-200' : 'bg-success-200')}
        striped={false}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <RowBtn title="Imprimer" onClick={() => setChoixRecu(r)}><Printer size={14} /></RowBtn>
            <ActionMenu label="Actions" icon={<ListTree size={16} />} items={menuItems(r)} />
          </div>
        )}
      />

      <ChoixFormatRecu
        open={!!choixRecu}
        reference={choixRecu?.reference}
        onChoisir={imprimerRecu}
        onClose={() => setChoixRecu(null)}
      />

      <ConfirmDialog
        open={!!confirm}
        title="Confirmation"
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />
    </div>
  )
}
