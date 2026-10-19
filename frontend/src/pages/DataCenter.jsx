import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Archive, Trash2, RotateCcw, ArrowLeft } from 'lucide-react'
import { IconeActions, IconeModifier } from '../components/ui/icons.jsx'
import ServerTable from '../components/ServerTable.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { Field, Input } from '../components/Field.jsx'
import { ApiError } from '../api/http.js'
import {
  listFiches, createFiche, updateFiche,
  archiveFiche, corbeilleFiche, restoreFiche, deleteFicheForever,
} from '../api/dataCenter.js'

const emptyForm = { denomination: '', ice: '', if: '', rc: '', tp: '' }

export default function DataCenter() {
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [success, setSuccess] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    listFiches({ status, page, perPage, search })
      .then((res) => { setRows(res.data || []); setMeta(res) })
      .catch((err) => {
        setRows([]); setMeta(null)
        setErreurChargement(err instanceof ApiError && err.status === 403
          ? "Vous n'avez pas la permission de consulter le Data Center."
          : 'Impossible de charger les fiches du Data Center.')
      })
      .finally(() => setLoading(false))
  }, [status, page, perPage, search])

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

  const changeStatus = (key) => { setStatus(key); setPage(1); setDrawerOpen(false) }

  const ouvrirAjout = () => { setEditing(null); setForm(emptyForm); setFormErrors({}); setSuccess(''); setDrawerOpen(true) }
  const ouvrirModifier = (r) => {
    setEditing(r)
    setForm({
      denomination: r.denomination || '',
      ice: r.ice || '',
      if: r.if || '',
      rc: r.rc || '',
      tp: r.tp || '',
    })
    setFormErrors({}); setSuccess(''); setDrawerOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setFormErrors({}); setError(''); setSuccess('')
    try {
      const payload = {
        denomination: form.denomination,
        ice: form.ice || null,
        if: form.if || null,
        rc: form.rc || null,
        tp: form.tp || null,
      }
      if (editing) await updateFiche(editing.id, payload)
      else await createFiche(payload)
      setSuccess(editing ? 'Fiche modifiée.' : 'Fiche ajoutée.')
      setDrawerOpen(false); setEditing(null); setForm(emptyForm)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  // Colonnes reprises exactement de la capture image68.
  const columns = [
    { key: 'denomination', header: 'DENOMINATION', clamp: 2, render: (r) => <span className="font-semibold text-brand-700">{r.denomination}</span> },
    { key: 'ice', header: 'I_C_E', render: (r) => r.ice || '—' },
    { key: 'if', header: 'I_F', render: (r) => r.if || '—' },
    { key: 'rc', header: 'R_C', render: (r) => r.rc || '—' },
    { key: 'tp', header: 'TP_NUMBER', render: (r) => r.tp || '—' },
  ]

  const err = (k) => formErrors[k] && <span className="mt-1 block text-xs text-danger-600">{formErrors[k][0]}</span>

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')} className="mb-3">{success}</Alert>}

      <ServerTable
        title="List des Data"
        filter={status !== 'actif' && (
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => changeStatus('actif')}>
            Retour au Data Center
          </Button>
        )}
        actions={(
          <>
            {status === 'actif' && (
              <Button variant="success" icon={<Plus size={16} />} onClick={ouvrirAjout}>Ajouter data</Button>
            )}
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux fiches actives' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => changeStatus(status === 'archive' ? 'actif' : 'archive')}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux fiches actives' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => changeStatus(status === 'corbeille' ? 'actif' : 'corbeille')}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={rows}
        meta={meta}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        perPage={perPage}
        onPerPageChange={(v) => { setPerPage(v); setPage(1) }}
        onPageChange={setPage}
        loading={loading}
        actionsHeader="ACTIONS"
        emptyText={status === 'actif' ? 'Aucune fiche' : status === 'archive' ? 'Aucune fiche archivée' : 'Corbeille vide'}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            {status === 'actif' && (
              <>
                <RowBtn title="Modifier" onClick={() => ouvrirModifier(r)}><IconeModifier /></RowBtn>
                <ActionMenu
                  label="Actions"
                  icon={<IconeActions />}
                  items={[
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      onClick: () => run(() => archiveFiche(r.id), 'Fiche archivée.'),
                    },
                    {
                      label: 'Corbeille',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => run(() => corbeilleFiche(r.id), 'Fiche placée dans la corbeille.'),
                    },
                  ]}
                />
              </>
            )}
            {status === 'archive' && (
              <ActionMenu
                label="Actions"
                icon={<IconeActions />}
                items={[
                  { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreFiche(r.id), 'Fiche restaurée.') },
                  {
                    label: 'Corbeille',
                    icon: <Trash2 size={15} />,
                    tone: 'danger',
                    onClick: () => run(() => corbeilleFiche(r.id), 'Fiche placée dans la corbeille.'),
                  },
                ]}
              />
            )}
            {status === 'corbeille' && (
              <ActionMenu
                label="Actions"
                icon={<IconeActions />}
                items={[
                  { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreFiche(r.id), 'Fiche restaurée.') },
                  {
                    label: 'Supprimer définitivement',
                    icon: <Trash2 size={15} />,
                    tone: 'danger',
                    onClick: () => setConfirm({
                      message: 'Supprimer définitivement cette fiche ? Cette action est irréversible.',
                      run: () => run(() => deleteFicheForever(r.id), 'Fiche supprimée définitivement.'),
                    }),
                  },
                ]}
              />
            )}
          </div>
        )}
      />

      <ConfirmDialog
        open={!!confirm}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />

      {/* « Ajouter / Modifier data » — panneau glissant depuis la droite,
          même structure que les autres formulaires latéraux de l'application. */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="right"
        title={editing ? 'Modifier la fiche' : 'Ajouter data'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Annuler</Button>
            <Button type="submit" form="form-data-center" loading={saving}>
              {editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </>
        )}
      >
        <form id="form-data-center" onSubmit={submit} className="space-y-4">
          <Field label="Dénomination" required>
            <Input required placeholder="Dénomination" value={form.denomination} onChange={(e) => setForm((f) => ({ ...f, denomination: e.target.value }))} />
            {err('denomination')}
          </Field>
          <Field label="ICE" required>
            <Input required placeholder="ICE" value={form.ice} onChange={(e) => setForm((f) => ({ ...f, ice: e.target.value }))} />
            {err('ice')}
          </Field>
          <Field label="Identifiant fiscal">
            <Input placeholder="IF" value={form.if} onChange={(e) => setForm((f) => ({ ...f, if: e.target.value }))} />
            {err('if')}
          </Field>
          <Field label="Registre de commerce">
            <Input placeholder="RC" value={form.rc} onChange={(e) => setForm((f) => ({ ...f, rc: e.target.value }))} />
            {err('rc')}
          </Field>
          <Field label="N° TP">
            <Input placeholder="TP" value={form.tp} onChange={(e) => setForm((f) => ({ ...f, tp: e.target.value }))} />
            {err('tp')}
          </Field>
        </form>
      </Modal>
    </div>
  )
}
