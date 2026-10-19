import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, ListTree, Archive, Trash2, RotateCcw, ArrowLeft, Eye,
} from 'lucide-react'
import { IconeActions, IconeModifier } from '../components/ui/icons.jsx'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import {
  listClients, restoreClient, deleteClientForever, archiveClient, corbeilleClient,
} from '../api/clients.js'

// Colonnes réellement exportées (Imprimer / CSV / Excel / PDF).
const exportColumns = [
  { header: 'Nom Complet', value: (r) => r.nom },
  { header: 'Email', value: (r) => r.email },
  { header: 'CIN', value: (r) => r.cin },
  { header: 'Téléphone', value: (r) => r.tel },
  { header: 'Téléphone 2', value: (r) => r.tel2 },
  { header: 'Adresse', value: (r) => r.adresse },
]

const baseColumns = [
  { key: 'nom', header: 'Nom Complet', clamp: 2, render: (r) => <Link to={`/clients/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.nom}</Link> },
  { key: 'email', header: 'Email' },
  { key: 'cin', header: 'CIN' },
  { key: 'tel', header: 'Téléphone' },
  { key: 'tel2', header: 'Téléphone 2' },
  { key: 'adresse', header: 'Adresse', clamp: 1 },
]

const TABS = [
  { key: 'actif', label: 'Actifs', icon: ListTree },
  { key: 'archive', label: 'Archivés', icon: Archive },
  { key: 'corbeille', label: 'Corbeille', icon: Trash2 },
]

export default function ClientsList() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('actif')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [suppressionPour, setSuppressionPour] = useState(null)
  const [suppressionDefinitivePour, setSuppressionDefinitivePour] = useState(null)

  const load = () => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    listClients(status)
      .then(setClients)
      .catch(() => setErreurChargement('Impossible de charger les clients.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [status])

  const runAction = async (action, id) => {
    try {
      await action(id)
      load()
    } catch {
      setError("L'action n'a pas pu être effectuée.")
    }
  }

  return (
    <div>
      {status !== 'actif' && (
        <div className="mb-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink-700">
          Vous consultez <span className="font-semibold text-ink-900">{status === 'archive' ? 'les clients archivés' : 'la corbeille'}</span>.
        </div>
      )}

      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}

      <DataTable
        title="Liste des Clients"
        filter={status !== 'actif' && (
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
            Retour à la liste des clients
          </Button>
        )}
        actions={(
          <>
            <Button variant="success" to="/clients/nouveau" icon={<Plus size={16} />}>Nouveau Client</Button>
            <ExportMenu
              filename={`clients-${status}`}
              title="Liste des Clients"
              subtitle={TABS.find((t) => t.key === status)?.label}
              columns={exportColumns}
              rows={clients}
              disabled={clients.length === 0}
            />
            {/* Directement Archive puis Corbeille, comme la référence : pas de
                bouton « Actifs » intermédiaire — le lien « Retour » ci-dessus
                suffit à revenir à la liste active. */}
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux clients actifs' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux clients actifs' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille'))}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={baseColumns}
        rows={clients}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucun client' : status === 'archive' ? 'Aucun client archivé' : 'Corbeille vide'}
        rowActions={(r) => (
            <div className="flex justify-end gap-1.5">
              {status === 'actif' && (
                <>
                  <RowBtn title="Modifier" onClick={() => navigate(`/clients/${r.id}/modifier`)}><IconeModifier /></RowBtn>
                  {/* Menu d'actions : Afficher / Archiver / Supprimer. */}
                  <ActionMenu
                    label="Actions"
                    icon={<IconeActions />}
                    items={[
                      {
                        label: 'Afficher',
                        icon: <Eye size={15} />,
                        onClick: () => navigate(`/clients/${r.id}`),
                      },
                      {
                        label: 'Archiver',
                        icon: <Archive size={15} />,
                        tone: 'warning',
                        separatorBefore: true,
                        onClick: () => runAction(archiveClient, r.id),
                      },
                      {
                        label: 'Supprimer',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        onClick: () => setSuppressionPour(r),
                      },
                    ]}
                  />
                </>
              )}
              {status === 'archive' && (
                <RowBtn title="Restaurer" onClick={() => runAction(restoreClient, r.id)}><RotateCcw size={14} /></RowBtn>
              )}
              {status === 'corbeille' && (
                <>
                  <RowBtn title="Restaurer" onClick={() => runAction(restoreClient, r.id)}><RotateCcw size={14} /></RowBtn>
                  <RowBtn
                    title="Supprimer définitivement"
                    onClick={() => setSuppressionDefinitivePour(r)}
                  >
                    <Trash2 size={14} />
                  </RowBtn>
                </>
              )}
            </div>
          )}
        />

      <ConfirmDialog
        open={!!suppressionPour}
        title="Supprimer ce client ?"
        message={`Voulez-vous vraiment supprimer « ${suppressionPour?.nom ?? ''} » ? Il sera placé dans la corbeille.`}
        confirmLabel="Supprimer"
        onCancel={() => setSuppressionPour(null)}
        onConfirm={() => {
          const cible = suppressionPour
          setSuppressionPour(null)
          runAction(corbeilleClient, cible.id)
        }}
      />

      <ConfirmDialog
        open={!!suppressionDefinitivePour}
        title="Supprimer définitivement ce client ?"
        message={`Supprimer définitivement « ${suppressionDefinitivePour?.nom ?? ''} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        onCancel={() => setSuppressionDefinitivePour(null)}
        onConfirm={() => {
          const cible = suppressionDefinitivePour
          setSuppressionDefinitivePour(null)
          runAction(deleteClientForever, cible.id)
        }}
      />
    </div>
  )
}
