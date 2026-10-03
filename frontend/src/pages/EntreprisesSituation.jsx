import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, Eye, RotateCcw, ShieldOff } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Alert from '../components/ui/Alert.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import {
  listEntreprises, retirerListeNoireEntreprise, debloquerEntreprise,
} from '../api/entreprises.js'

const columns = [
  { key: 'denomination', header: 'Dénomination', clamp: 2, render: (r) => <Link to={`/entreprises/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.denomination}</Link> },
  { key: 'situation', header: 'Situation', render: (r) => <StatusBadge status={r.situation} /> },
  { key: 'ice', header: 'I.C.E' },
  { key: 'if', header: 'I.F' },
  { key: 'centreDomiciliation', header: 'Centre de Domiciliation', render: (r) => r.centreDomiciliation || <span className="text-ink-500">—</span> },
  {
    key: 'client',
    header: 'Client',
    render: (r) => (r.client
      ? (r.clientId
        ? <Link to={`/clients/${r.clientId}`} className="hover:underline">{r.client}</Link>
        : r.client)
      : <span className="text-ink-500">—</span>),
  },
]

/**
 * Panneau commun à « Liste Noire » et « Entreprises Bloquées » : les deux
 * pages filtrent la même liste (`entreprises.situation`) et ne changent que
 * le libellé, l'action de retour à la normale et le message de confirmation.
 */
function PanneauSituation({ titre, situation, actionLabel, retirer, messageConfirmation }) {
  const navigate = useNavigate()
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cible, setCible] = useState(null)

  const load = () => {
    setLoading(true)
    setError('')
    listEntreprises('actif')
      .then((rows) => setEntreprises(rows.filter((r) => r.situation === situation)))
      .catch(() => setError('Impossible de charger les entreprises.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [situation])

  const confirmer = async () => {
    if (!cible) return
    setError(''); setSuccess('')
    try {
      await retirer(cible.id)
      setSuccess(`« ${cible.denomination} » — situation remise à Normale.`)
      setCible(null)
      load()
    } catch {
      setError("L'action n'a pas pu être effectuée.")
      setCible(null)
    }
  }

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert tone="success" className="mb-3" onClose={() => setSuccess('')}>{success}</Alert>}

      <DataTable
        title={titre}
        columns={columns}
        rows={entreprises}
        loading={loading}
        emptyText={`Aucune entreprise dans « ${titre} »`}
        actionsHeader="ACTIONS"
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <RowBtn title="Afficher" onClick={() => navigate(`/entreprises/${r.id}`)}><Eye size={15} /></RowBtn>
            <RowBtn title={actionLabel} onClick={() => setCible(r)}>
              <RotateCcw size={15} />
            </RowBtn>
          </div>
        )}
      />

      <ConfirmDialog
        open={!!cible}
        title={`${actionLabel} ?`}
        message={`« ${cible?.denomination ?? ''} » — ${messageConfirmation}`}
        confirmLabel="Confirmer"
        onCancel={() => setCible(null)}
        onConfirm={confirmer}
      />
    </div>
  )
}

export function EntreprisesListeNoire() {
  return (
    <PanneauSituation
      titre="Liste Noire"
      situation="Liste Noire"
      icon={Ban}
      actionLabel="Retirer de la Liste Noire"
      retirer={retirerListeNoireEntreprise}
      messageConfirmation="Êtes-vous sûr de vouloir effectuer cette action ?"
    />
  )
}

export function EntreprisesBloquees() {
  return (
    <PanneauSituation
      titre="Entreprises Bloquées"
      situation="Bloqué"
      icon={ShieldOff}
      actionLabel="Débloquer"
      retirer={debloquerEntreprise}
      messageConfirmation="Êtes-vous sûr de vouloir effectuer cette action ?"
    />
  )
}
