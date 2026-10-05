import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Archive, Trash2, Eye, ListTree, Calendar, ArrowLeft, Printer, Paperclip, Pencil } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { Field, Input, Select } from '../components/Field.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { ApiError, API_URL } from '../api/http.js'
import { EMETTEURS } from '../shared/constants/documents.js'
import { formatDate } from '../utils/format.js'
import { imprimerPaiement } from './PaiementList.jsx'
import {
  listGestion, getPaiement, archivePaiement, corbeillePaiement, restorePaiement, deletePaiementForever,
  updateDateCredit,
} from '../api/paiements.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`

const matchStatut = (r, statut) => {
  if (!statut) return true
  const restant = Number(r.prixRestant)
  const paye = Number(r.prixPaye)
  if (statut === 'payee') return restant <= 0
  if (statut === 'non_payee') return paye === 0
  if (statut === 'debiteurs') return restant > 0
  return true
}

export default function PaiementGestion() {
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState('actif')
  const [regle, setRegle] = useState('')
  const [responsable, setResponsable] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [focusedId, setFocusedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [dateEdit, setDateEdit] = useState(null)
  const [dateValue, setDateValue] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  /** Charge la fiche complète (Référence, Méthode, Observation, Fichier…) du
      paiement affiché — la vue « Gestion » n'a que sa ligne de service. */
  const afficher = (paiementId) => {
    setFocusedId(paiementId)
    setDetail(null)
    getPaiement(paiementId).then(setDetail).catch(() => {})
  }

  const fermerDetail = () => {
    setFocusedId(null)
    setDetail(null)
  }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listGestion({ status })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission d'accéder à la gestion des paiements."
        : 'Impossible de charger la gestion des paiements.'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(load, [load])

  const visibles = useMemo(() => {
    let list = rows
    if (responsable) list = list.filter((r) => r.responsable === responsable)
    list = list.filter((r) => matchStatut(r, regle))
    if (focusedId != null) list = list.filter((r) => r.paiementId === focusedId)
    return list
  }, [rows, responsable, regle, focusedId])

  const run = async (fn, message) => {
    setError('')
    try {
      await fn()
      toast.success(message)
      fermerDetail()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const ask = (message, fn, messageOk, tone = 'warning', confirmLabel = 'Confirmer') => {
    setConfirm({ message, tone, confirmLabel, run: () => run(fn, messageOk) })
  }

  const enregistrerDate = async () => {
    if (!dateEdit) return
    setSavingDate(true)
    setError('')
    try {
      await updateDateCredit(dateEdit.paiementId, dateValue)
      toast.success('Date de crédit mise à jour.')
      setDateEdit(null)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "La date de crédit n'a pas pu être modifiée.")
    } finally {
      setSavingDate(false)
    }
  }

  const columns = [
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
    {
      key: 'service',
      header: 'Service',
      clamp: 2,
      render: (r) => r.service || <span className="italic text-ink-600">Aucun service associé</span>,
    },
    { key: 'prixTotal', header: 'Prix Total', value: (r) => r.prixTotal, render: (r) => dh(r.prixTotal) },
    { key: 'prixPaye', header: 'Prix Payer', value: (r) => r.prixPaye, render: (r) => dh(r.prixPaye) },
    {
      key: 'prixRestant',
      header: 'Prix Restant',
      value: (r) => r.prixRestant,
      render: (r) => <span className="font-semibold text-ink-900">{dh(r.prixRestant)}</span>,
    },
    { key: 'dateOperation', header: 'Date Opération' },
    { key: 'dateCredit', header: 'Date Crédit', render: (r) => r.dateCredit || <span className="text-ink-600">—</span> },
  ]

  const rowClassName = (r) => (Number(r.prixRestant) > 0 ? 'bg-warning-200' : 'bg-success-200')

  const exportColumns = columns.map((c) => ({
    header: c.header,
    value: (r) => (c.value ? c.value(r) : r[c.key]),
  }))

  // Vue « œil » — mêmes colonnes que Liste des Paiements (capture de
  // référence), pour la fiche complète du paiement sélectionné : plus de
  // bloc « Informations du paiement » séparé.
  const columnsDetail = [
    { key: 'reference', header: 'Reference', render: (r) => <span className="font-semibold text-brand-700">{r.reference || '—'}</span> },
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
    { key: 'observation', header: 'Observation', clamp: 1, render: (r) => r.observation || <span className="text-ink-600">—</span> },
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

  const detailRowActions = (r) => (
    <div className="flex justify-end gap-1.5">
      <RowBtn title="Imprimer" onClick={() => imprimerPaiement(r)}><Printer size={14} /></RowBtn>
      <ActionMenu
        label="Actions"
        icon={<ListTree size={16} />}
        items={[
          {
            label: 'Archiver',
            icon: <Archive size={15} />,
            tone: 'warning',
            onClick: () => ask(
              `Archiver le paiement de « ${r.client} » ?`,
              () => archivePaiement(r.id),
              'Paiement archivé.',
              'warning',
              'Archiver',
            ),
          },
          {
            label: 'Supprimer',
            icon: <Trash2 size={15} />,
            tone: 'danger',
            onClick: () => ask(
              `Placer le paiement de « ${r.client} » dans la corbeille ?`,
              () => corbeillePaiement(r.id),
              'Paiement placé dans la corbeille.',
              'danger',
              'Supprimer',
            ),
          },
        ]}
      />
    </div>
  )

  const menuItems = (r) => {
    if (status === 'actif') {
      return [
        {
          label: 'Modifier',
          icon: <Pencil size={15} />,
          onClick: () => navigate(`/paiement/${r.paiementId}/modifier`),
        },
        {
          label: 'Modifier la date de crédit',
          icon: <Calendar size={15} />,
          onClick: () => {
            setDateValue(r.dateCredit || '')
            setDateEdit(r)
          },
        },
        {
          label: 'Archiver',
          icon: <Archive size={15} />,
          tone: 'warning',
          onClick: () => ask(
            `Archiver le paiement de « ${r.client} » ?`,
            () => archivePaiement(r.paiementId),
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
            `Placer le paiement de « ${r.client} » dans la corbeille ?`,
            () => corbeillePaiement(r.paiementId),
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
          onClick: () => ask(
            `Restaurer le paiement de « ${r.client} » ?`,
            () => restorePaiement(r.paiementId),
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
            `Placer le paiement de « ${r.client} » dans la corbeille ?`,
            () => corbeillePaiement(r.paiementId),
            'Paiement placé dans la corbeille.',
            'danger',
            'Corbeille',
          ),
        },
        {
          label: 'Modifier la date de crédit',
          icon: <Calendar size={15} />,
          onClick: () => {
            setDateValue(r.dateCredit || '')
            setDateEdit(r)
          },
        },
      ]
    }
    return [
      {
        label: 'Restaurer',
        onClick: () => ask(
          `Restaurer le paiement de « ${r.client} » ?`,
          () => restorePaiement(r.paiementId),
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
          `Supprimer définitivement le paiement de « ${r.client} » ? Cette action est irréversible.`,
          () => deletePaiementForever(r.paiementId),
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
        title={focusedId != null ? 'List Des Paiements' : 'Gestion des Paiements'}
        filter={(
          <>
            {status !== 'actif' && (
              <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => { setStatus('actif'); fermerDetail() }}>
                Retour à la liste
              </Button>
            )}
            {focusedId != null && (
              <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={fermerDetail}>
                Tous les paiements
              </Button>
            )}
            <div className="w-full sm:w-56">
              <Select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                <option value="">Tous les responsables</option>
                {EMETTEURS.map((e) => <option key={e.value} value={e.label}>{e.label}</option>)}
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Select value={regle} onChange={(e) => setRegle(e.target.value)}>
                <option value="">Toutes</option>
                <option value="payee">Payée</option>
                <option value="non_payee">Non payée</option>
                <option value="debiteurs">Débiteurs</option>
              </Select>
            </div>
          </>
        )}
        actions={(
          <>
            <ExportMenu
              filename="gestion-paiements"
              title="Gestion des Paiements"
              columns={exportColumns}
              rows={visibles}
              disabled={visibles.length === 0}
            />
            <Button variant="success" to="/paiement/nouveau" icon={<Plus size={16} />}>
              Ajouter Paiement
            </Button>
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux paiements actifs' : 'Archive'}
              aria-pressed={status === 'archive'}
              onClick={() => { fermerDetail(); setStatus((v) => (v === 'archive' ? 'actif' : 'archive')) }}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux paiements actifs' : 'Corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => { fermerDetail(); setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille')) }}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={focusedId != null ? columnsDetail : columns}
        rows={focusedId != null ? (detail ? [detail] : []) : visibles}
        loading={focusedId != null ? !detail : loading}
        emptyText={status === 'actif' ? 'Aucun paiement' : status === 'archive' ? 'Aucun paiement archivé' : 'Corbeille vide'}
        actionsHeader="ACTION"
        rowClassName={rowClassName}
        striped={false}
        rowActions={focusedId != null
          ? detailRowActions
          : (r) => (
            <div className="flex justify-end gap-1.5">
              <RowBtn title="Afficher" onClick={() => afficher(r.paiementId)}><Eye size={14} /></RowBtn>
              <ActionMenu label="Actions" icon={<ListTree size={16} />} items={menuItems(r)} />
            </div>
          )}
      />

      <Modal
        open={!!dateEdit}
        onClose={() => setDateEdit(null)}
        title="Modifier la date de crédit"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDateEdit(null)}>Annuler</Button>
            <Button onClick={enregistrerDate} loading={savingDate} disabled={!dateValue}>Modifier</Button>
          </>
        }
      >
        <Field>
          <Input
            type="date"
            icon={<Calendar size={16} />}
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />
        </Field>
      </Modal>

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
