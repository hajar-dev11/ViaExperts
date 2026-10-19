import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Archive, Trash2, RotateCcw, ArrowLeft, Eye } from 'lucide-react'
import { IconeActions, IconeModifier } from '../../../components/ui/icons.jsx'
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import ServerTable from '../../../components/ServerTable.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import ConfirmDialog from '../../../components/ConfirmDialog.jsx'
import Button, { IconButton } from '../../../components/ui/Button.jsx'
import { RowBtn } from '../../../components/ListToolbar.jsx'
import { Field, Input } from '../../../components/Field.jsx'
import {
  listCentres, createCentre, updateCentre,
  archiveCentre, corbeilleCentre, restoreCentre, deleteCentre,
} from '../api/centres.js'
import { ApiError } from '../../../api/http.js'

const columns = [
  {
    key: 'nom',
    header: 'Nom',
    render: (r) => <Link to={`/domiciliation/centres/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.nom}</Link>,
  },
  { key: 'if', header: 'IF' },
  { key: 'ice', header: 'ICE' },
  { key: 'ville', header: 'Ville' },
  { key: 'adresse', header: 'Adresse', clamp: 1, render: (r) => <span className="text-ink-600">{r.adresse}</span> },
  { key: 'numero_archive', header: 'N° Archive', render: (r) => r.numero_archive || <span className="text-ink-600">—</span> },
  { key: 'telephone', header: 'Téléphone' },
  { key: 'email', header: 'Email', render: (r) => r.email || <span className="text-ink-600">—</span> },
]

const emptyForm = { nom: '', if: '', ice: '', ville: '', adresse: '', numero_archive: '', telephone: '', email: '' }

const CHAMPS = [
  { key: 'nom', label: 'Nom du centre', required: true, placeholder: 'Nom du centre' },
  { key: 'if', label: 'IF', placeholder: 'IF' },
  { key: 'ice', label: 'ICE', placeholder: 'ICE' },
  { key: 'ville', label: 'Ville', placeholder: 'Ville' },
  { key: 'adresse', label: 'Adresse', placeholder: 'Adresse' },
  { key: 'numero_archive', label: 'N° archive', placeholder: 'N° archive' },
  { key: 'telephone', label: 'Téléphone', placeholder: '06 06 06 06 06' },
  { key: 'email', label: 'Email', placeholder: 'contact@centre.ma', type: 'email' },
]

function apiErrorMessage(err, fallback) {
  if (err instanceof ApiError) {
    const first = err.errors && Object.values(err.errors)[0]?.[0]
    return first || err.message || fallback
  }
  return fallback
}

/**
 * Centres de domiciliation — même gabarit que Clients/Entreprises : onglets
 * Actifs/Archivés/Corbeille, visibles de tous (le backend tranche via les
 * permissions `domiciliation.*_centres` ; un 403 affiche juste une erreur,
 * comme partout ailleurs dans l'application — plus de garde `isAdmin` qui
 * masquait les boutons même à un non-admin habilité).
 */
export default function DomiciliationCentres() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('actif')
  const [meta, setMeta] = useState(null)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [success, setSuccess] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [archivagePour, setArchivagePour] = useState(null)
  const [suppressionPour, setSuppressionPour] = useState(null)
  const [suppressionDefinitivePour, setSuppressionDefinitivePour] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    listCentres({ page, perPage, search, status })
      .then((res) => { setRows(res.data || []); setMeta(res) })
      .catch((err) => setErreurChargement(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les centres de domiciliation."
        : 'Impossible de charger les centres de domiciliation.'))
      .finally(() => setLoading(false))
  }, [page, perPage, search, status])

  useEffect(load, [load])

  const changeStatus = (next) => { setStatus(next); setPage(1); setSuccess('') }

  const ouvrirAjout = () => { setEditing(null); setForm(emptyForm); setFormErrors({}); setSuccess(''); setDrawerOpen(true) }
  const ouvrirModifier = (r) => {
    setEditing(r)
    setForm({
      nom: r.nom || '', if: r.if || '', ice: r.ice || '', ville: r.ville || '',
      adresse: r.adresse || '', numero_archive: r.numero_archive || '',
      telephone: r.telephone || '', email: r.email || '',
    })
    setFormErrors({}); setSuccess(''); setDrawerOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setFormErrors({}); setError(''); setSuccess('')
    try {
      if (editing) await updateCentre(editing.id, form)
      else await createCentre(form)
      setSuccess(editing ? 'Centre modifié avec succès.' : 'Centre ajouté avec succès.')
      setDrawerOpen(false); setEditing(null); setForm(emptyForm)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(apiErrorMessage(err, "L'enregistrement a échoué."))
    } finally {
      setSaving(false)
    }
  }

  const runAction = async (action, id, message = '') => {
    setError(''); setSuccess('')
    try {
      await action(id)
      if (message) setSuccess(message)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, "L'action n'a pas pu être effectuée."))
    }
  }

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')} className="mb-3">{success}</Alert>}
      {status !== 'actif' && (
        <div className="mb-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink-700">
          Vous consultez <span className="font-semibold text-ink-900">{status === 'archive' ? 'les centres archivés' : 'la corbeille'}</span>.
        </div>
      )}

      <ServerTable
        title="Centres des Domiciliation"
        filter={status !== 'actif' && (
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => changeStatus('actif')}>
            Retour à la liste des centres
          </Button>
        )}
        actions={(
          <>
            {status === 'actif' && (
              <Button variant="success" icon={<Plus size={16} />} onClick={ouvrirAjout}>
                Ajouter Centres de Domiciliation
              </Button>
            )}
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux centres actifs' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => changeStatus(status === 'archive' ? 'actif' : 'archive')}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux centres actifs' : 'Voir la corbeille'}
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
        loading={loading}
        perPage={perPage}
        search={search}
        onPageChange={setPage}
        onPerPageChange={(n) => { setPerPage(n); setPage(1) }}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        actionsHeader="ACTIONS"
        emptyText={status === 'actif' ? 'Aucun centre de domiciliation' : status === 'archive' ? 'Aucun centre archivé' : 'Corbeille vide'}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            {status === 'actif' && (
              <>
                {/* Même colonne ACTIONS que la liste des clients : crayon (Modifier) + menu d'actions. */}
                <RowBtn title="Modifier" onClick={() => ouvrirModifier(r)}><IconeModifier /></RowBtn>
                <ActionMenu
                  label="Actions"
                  icon={<IconeActions />}
                  items={[
                    {
                      label: 'Afficher',
                      icon: <Eye size={15} />,
                      onClick: () => navigate(`/domiciliation/centres/${r.id}`),
                    },
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      separatorBefore: true,
                      onClick: () => setArchivagePour(r),
                    },
                    {
                      label: 'Mettre à la corbeille',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setSuppressionPour(r),
                    },
                  ]}
                />
              </>
            )}
            {status === 'archive' && (
              <>
                <RowBtn title="Restaurer" onClick={() => runAction(restoreCentre, r.id, 'Centre restauré : il figure de nouveau dans la liste des centres actifs.')}><RotateCcw size={14} /></RowBtn>
                <RowBtn title="Mettre à la corbeille" className="hover:text-danger-600" onClick={() => setSuppressionPour(r)}>
                  <Trash2 size={14} />
                </RowBtn>
              </>
            )}
            {status === 'corbeille' && (
              <>
                <RowBtn title="Restaurer" onClick={() => runAction(restoreCentre, r.id)}><RotateCcw size={14} /></RowBtn>
                <RowBtn title="Supprimer définitivement" onClick={() => setSuppressionDefinitivePour(r)}>
                  <Trash2 size={14} />
                </RowBtn>
              </>
            )}
          </div>
        )}
      />

      {/* Formulaire « Ajouter / Modifier Centre de Domiciliation », dans un
          panneau qui glisse depuis la droite — comme la référence. */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="right"
        title={editing ? `Modifier Centre de Domiciliation` : 'Ajouter Centre de Domiciliation'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Annuler</Button>
            <Button type="submit" form="form-centre" loading={saving}>
              {editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </>
        )}
      >
        <form id="form-centre" onSubmit={submit} className="space-y-4">
          {CHAMPS.map((f) => (
            <Field key={f.key} label={f.label} required={f.required}>
              <Input
                type={f.type ?? 'text'}
                required={f.required}
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
              {formErrors[f.key] && <span className="mt-1 block text-xs text-danger-600">{formErrors[f.key][0]}</span>}
            </Field>
          ))}
        </form>
      </Modal>

      {/* Confirmation avant d'archiver : « Annuler » ferme la fenêtre sans rien changer. */}
      <ConfirmDialog
        open={!!archivagePour}
        title="Archiver ce centre ?"
        message={`Voulez-vous vraiment archiver « ${archivagePour?.nom ?? ''} » ? Il quittera la liste des centres actifs et pourra être restauré depuis les archives.`}
        confirmLabel="Archiver"
        tone="warning"
        onCancel={() => setArchivagePour(null)}
        onConfirm={() => {
          const cible = archivagePour
          setArchivagePour(null)
          runAction(archiveCentre, cible.id, `Centre « ${cible.nom} » archivé.`)
        }}
      />

      <ConfirmDialog
        open={!!suppressionPour}
        title="Mettre ce centre à la corbeille ?"
        message={`Voulez-vous vraiment mettre « ${suppressionPour?.nom ?? ''} » à la corbeille ?`}
        confirmLabel="Mettre à la corbeille"
        onCancel={() => setSuppressionPour(null)}
        onConfirm={() => {
          const cible = suppressionPour
          setSuppressionPour(null)
          runAction(corbeilleCentre, cible.id)
        }}
      />

      <ConfirmDialog
        open={!!suppressionDefinitivePour}
        title="Supprimer définitivement ce centre ?"
        message={`Supprimer définitivement « ${suppressionDefinitivePour?.nom ?? ''} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        onCancel={() => setSuppressionDefinitivePour(null)}
        onConfirm={() => {
          const cible = suppressionDefinitivePour
          setSuppressionDefinitivePour(null)
          runAction(deleteCentre, cible.id)
        }}
      />
    </div>
  )
}
