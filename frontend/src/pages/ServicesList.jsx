import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Archive, Trash2, RotateCcw, ArrowLeft } from 'lucide-react'
import { IconeActions, IconeModifier } from '../components/ui/icons.jsx'
import DataTable from '../components/DataTable.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { Field, Input, Textarea } from '../components/Field.jsx'
import { ApiError } from '../api/http.js'
import { enNombre } from '../utils/arrondi.js'
import { formaterMontant } from '../utils/montants.js'
import {
  listServices, createService, updateService, archiveService, corbeilleService, restoreService, deleteServiceForever,
} from '../api/services.js'

const responsableLabel = (r) => (r.via_experts ? 'Via Experts' : (r.maitre ? `Maître : ${r.maitre}` : '—'))

const columns = [
  { key: 'responsable', header: 'Responsable', value: responsableLabel, render: (r) => responsableLabel(r) },
  { key: 'nom', header: 'Service', clamp: 2, render: (r) => <span className="font-semibold text-ink-900">{r.nom}</span> },
  { key: 'prix', header: 'Prix HT', render: (r) => `${formaterMontant(r.prix ?? 0)} Dh` },
  {
    key: 'description',
    header: 'Description',
    clamp: 1,
    render: (r) => r.description || <span className="text-ink-600">—</span>,
  },
]

// Nom fixe du second responsable possible — ce n'est pas un champ libre,
// seul le choix entre les deux options est enregistré (via_experts).
const MAITRE = 'Morad Bendeq'

const RESPONSABLES = [
  { value: true, label: 'Via Experts' },
  { value: false, label: `Maître : ${MAITRE}` },
]

const emptyForm = { via_experts: true, nom: '', prix: '', description: '' }

function apiErrorMessage(err, fallback) {
  if (err instanceof ApiError) {
    const first = err.errors && Object.values(err.errors)[0]?.[0]
    return first || err.message || fallback
  }
  return fallback
}

export default function ServicesList() {
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [success, setSuccess] = useState('')
  const [confirm, setConfirm] = useState(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    listServices(status)
      .then(setRows)
      .catch((err) => setErreurChargement(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les services."
        : 'Impossible de charger les services.'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(load, [load])

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

  const ouvrirAjout = () => { setEditing(null); setForm(emptyForm); setFormErrors({}); setSuccess(''); setDrawerOpen(true) }
  const ouvrirModifier = (r) => {
    setEditing(r)
    setForm({
      via_experts: !!r.via_experts,
      nom: r.nom ?? '',
      prix: r.prix ?? '',
      description: r.description ?? '',
    })
    setFormErrors({}); setSuccess(''); setDrawerOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setFormErrors({}); setError(''); setSuccess('')
    try {
      const payload = {
        via_experts: form.via_experts,
        maitre: form.via_experts ? null : MAITRE,
        nom: form.nom,
        // Prix HT unitaire avec ses centimes : seuls les totaux sont arrondis (règle 0,50).
        prix: form.prix === '' ? 0 : enNombre(form.prix),
        description: form.description || null,
      }
      if (editing) await updateService(editing.id, payload)
      else await createService(payload)
      setSuccess(editing ? 'Service modifié avec succès.' : 'Service ajouté avec succès.')
      setDrawerOpen(false); setEditing(null); setForm(emptyForm)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(apiErrorMessage(err, "L'enregistrement a échoué."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')} className="mb-3">{success}</Alert>}

      <DataTable
        title="Liste des Services"
        filter={status !== 'actif' && (
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
            Retour à la liste des services
          </Button>
        )}
        actions={(
          <>
            <Button variant="success" icon={<Plus size={16} />} onClick={ouvrirAjout}>Ajouter Service</Button>
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux services actifs' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux services actifs' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille'))}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucun service' : status === 'archive' ? 'Aucun service archivé' : 'Corbeille vide'}
        actionsHeader="ACTIONS"
        rowActions={(r) => {
          const items = []
          if (status === 'actif') {
            items.push({
              label: 'Archiver',
              icon: <Archive size={15} />,
              tone: 'warning',
              onClick: () => setConfirm({
                title: 'Archiver ce service ?',
                message: `« ${r.nom} » sera déplacé dans les archives.`,
                confirmLabel: 'Archiver',
                run: () => run(() => archiveService(r.id), 'Service archivé.'),
              }),
            })
          }
          if (status === 'archive' || status === 'corbeille') {
            items.push({ label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreService(r.id), 'Service restauré.') })
          }
          if (status === 'actif' || status === 'archive') {
            items.push({
              label: 'Corbeille',
              icon: <Trash2 size={15} />,
              tone: 'danger',
              onClick: () => setConfirm({
                title: 'Mettre ce service à la corbeille ?',
                message: `« ${r.nom} » sera déplacé dans la corbeille.`,
                confirmLabel: 'Corbeille',
                run: () => run(() => corbeilleService(r.id), 'Service placé dans la corbeille.'),
              }),
            })
          }
          if (status === 'corbeille') {
            items.push({
              label: 'Supprimer définitivement',
              icon: <Trash2 size={15} />,
              tone: 'danger',
              onClick: () => setConfirm({
                title: 'Supprimer définitivement',
                message: `Supprimer définitivement « ${r.nom} » ? Cette action est irréversible.`,
                confirmLabel: 'Supprimer',
                run: () => run(() => deleteServiceForever(r.id), 'Service supprimé définitivement.'),
              }),
            })
          }
          return (
            <div className="flex justify-end gap-1.5">
              {(status === 'actif' || status === 'archive') && (
                <RowBtn title="Modifier" onClick={() => ouvrirModifier(r)}><IconeModifier /></RowBtn>
              )}
              <ActionMenu label="Actions" icon={<IconeActions />} items={items} />
            </div>
          )
        }}
        />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        confirmLabel={confirm?.confirmLabel}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />

      {/* Formulaire « Ajouter / Modifier Service », dans un panneau qui glisse
          depuis la droite — même structure que « Ajouter Centre de Domiciliation ». */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="right"
        title={editing ? 'Modifier le Service' : 'Ajouter Service'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Annuler</Button>
            <Button type="submit" form="form-service" loading={saving}>
              {editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </>
        )}
      >
        <form id="form-service" onSubmit={submit} className="space-y-4">
          <Field label="Responsable" required>
            <div className="grid gap-4 sm:grid-cols-2">
              {RESPONSABLES.map((r) => (
                <label
                  key={r.label}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3.5 cursor-pointer transition-colors ${
                    form.via_experts === r.value ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="responsable"
                    checked={form.via_experts === r.value}
                    onChange={() => setForm((f) => ({ ...f, via_experts: r.value }))}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500/40"
                  />
                  <span className="text-sm font-medium text-ink-900">{r.label}</span>
                </label>
              ))}
            </div>
            {formErrors.via_experts && <span className="mt-1 block text-xs text-danger-600">{formErrors.via_experts[0]}</span>}
          </Field>

          <Field label="Nom du service" required>
            <Input
              required
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="Nom du service"
            />
            {formErrors.nom && <span className="mt-1 block text-xs text-danger-600">{formErrors.nom[0]}</span>}
          </Field>

          <Field label="Prix HT (Dh)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.prix}
              onChange={(e) => setForm((f) => ({ ...f, prix: e.target.value }))}
              placeholder="0"
            />
            {formErrors.prix && <span className="mt-1 block text-xs text-danger-600">{formErrors.prix[0]}</span>}
          </Field>

          <Field label="Description">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description du service…"
            />
            {formErrors.description && <span className="mt-1 block text-xs text-danger-600">{formErrors.description[0]}</span>}
          </Field>
        </form>
      </Modal>
    </div>
  )
}
