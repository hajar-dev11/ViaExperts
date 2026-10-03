import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Eye, Download, Archive, Trash2, RotateCcw, ArrowLeft, Pencil, Plus } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import Alert from '../components/ui/Alert.jsx'
import { IconButton } from '../components/ui/Button.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import { Field, Input, Select } from '../components/Field.jsx'
import { API_URL, ApiError } from '../api/http.js'
import { listClients } from '../api/clients.js'
import { listServices } from '../api/services.js'
import { serviceStatusApi } from '../api/statuses.js'
import ServiceEnCoursRowActions, { BadgeStatutService, ModalChangerStatut } from '../components/ServiceEnCoursActions.jsx'
import {
  listServicesEnCours, listActivite, getServiceEnCours, createServiceEnCours, updateServiceEnCours,
  corbeilleServiceEnCours, restoreServiceEnCours, deleteServiceEnCoursForever,
} from '../api/servicesEnCours.js'

const emptyForm = { service_id: '', client_id: '', service_status_id: '', date_depart: '' }

export default function ServicesEnCours() {
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [rows, setRows] = useState([])
  const [activite, setActivite] = useState([])
  const [services, setServices] = useState([])
  const [clients, setClients] = useState([])
  const [statuts, setStatuts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [selectedService, setSelectedService] = useState(null)
  const [serviceActivite, setServiceActivite] = useState([])
  const [serviceActiviteLoading, setServiceActiviteLoading] = useState(false)
  const [confirm, setConfirm] = useState(null)
  // Changement de statut — même composant partagé que la page Accueil
  // (ServiceEnCoursActions.jsx) : une seule logique, un seul endpoint
  // (`addOperation`), donc les deux pages restent forcément synchronisées.
  const [statutPour, setStatutPour] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([listServicesEnCours(status), listActivite(15)])
      .then(([list, feed]) => { setRows(list); setActivite(feed) })
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les services en cours."
        : 'Impossible de charger les services en cours.'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(load, [load])

  useEffect(() => {
    listServices('actif').then(setServices).catch(() => setServices([]))
    listClients('actif').then(setClients).catch(() => setClients([]))
    serviceStatusApi.list({ page: 1, perPage: 100 }).then((r) => setStatuts(r.data || [])).catch(() => setStatuts([]))
  }, [])

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

  // Le statut « business » par défaut d'un service tout juste ajouté : « En
  // Attente » si ce statut existe dans le catalogue (Paramètres → Services),
  // sinon le backend tranchera lui-même (même règle des deux côtés).
  const statutParDefautId = () => statuts.find((s) => s.nom === 'En Attente')?.id ?? ''

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...emptyForm,
      service_status_id: statutParDefautId(),
      // Date de départ pré-remplie à maintenant — le champ reste modifiable.
      date_depart: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    })
    setFormErrors({}); setFormOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      service_id: r.serviceId ?? '',
      client_id: r.clientId ?? '',
      service_status_id: r.statut?.id ?? '',
      date_depart: (r.dateDepart || '').replace(' ', 'T').slice(0, 16),
    })
    setFormErrors({}); setFormOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setFormErrors({}); setError(''); setSuccess('')
    try {
      const payload = {
        service_id: Number(form.service_id),
        client_id: Number(form.client_id),
        service_status_id: form.service_status_id ? Number(form.service_status_id) : null,
        date_depart: form.date_depart.replace('T', ' '),
      }
      if (editing) {
        await updateServiceEnCours(editing.id, payload)
        setSuccess('Service en cours modifié.')
      } else {
        await createServiceEnCours(payload)
        setSuccess('Service en cours ajouté.')
      }
      setFormOpen(false); setEditing(null); setForm(emptyForm)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  // L'œil affiche le fil d'opérations du service directement dans le panneau
  // « Activité Services » (à droite), au lieu d'un popup — on y remplace
  // temporairement le flux global par celui du service sélectionné.
  const showServiceActivite = async (r) => {
    setSelectedService(r)
    setServiceActiviteLoading(true)
    try {
      const full = await getServiceEnCours(r.id)
      setServiceActivite(full?.operations ?? [])
    } catch {
      setServiceActivite([])
    } finally {
      setServiceActiviteLoading(false)
    }
  }
  const closeServiceActivite = () => { setSelectedService(null); setServiceActivite([]) }

  const columns = [
    {
      key: 'statut',
      header: 'Status',
      value: (r) => r.statut?.nom,
      // Badge cliquable → « Changer le Statut du Service », identique à l'Accueil.
      render: (r) => <BadgeStatutService statut={r.statut} onClick={() => setStatutPour(r)} />,
    },
    { key: 'service', header: 'Services', clamp: 2 },
    { key: 'client', header: 'Client', clamp: 2, render: (r) => <Link to={`/clients/${r.clientId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link> },
    { key: 'dateDepart', header: 'Départ' },
    { key: 'derniereOperation', header: 'Dernière Opération', clamp: 1 },
  ]

  const err = (k) => formErrors[k] && <span className="mt-1 block text-xs text-danger-600">{formErrors[k][0]}</span>

  // Panneau « Activité Services » : flux global par défaut, ou fil d'un seul
  // service quand l'œil d'une ligne a été cliqué (voir showServiceActivite).
  const activiteFeed = selectedService ? serviceActivite : activite

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {success && <Alert tone="success" className="mb-3">{success}</Alert>}

      {/* Ouverte par un clic sur le badge de statut d'une ligne — même modale
          que sur l'Accueil (ServiceEnCoursActions.jsx). */}
      <ModalChangerStatut
        open={!!statutPour}
        row={statutPour}
        statuts={statuts}
        onClose={() => setStatutPour(null)}
        onSaved={load}
      />

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        title={editing ? 'Modifier le service en cours' : 'Ajouter un service en cours'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setFormOpen(false); setEditing(null) }}>Annuler</Button>
            <Button loading={saving} onClick={submit}>Enregistrer</Button>
          </>
        )}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Service" required>
              <Select required value={form.service_id} onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}>
                <option value="">Sélectionnez un service</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </Select>
              {err('service_id')}
            </Field>
            <Field label="Client" required>
              <Select required value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
                <option value="">Sélectionnez un client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </Select>
              {err('client_id')}
            </Field>
            <Field label="Statut">
              <Select value={form.service_status_id} onChange={(e) => setForm((f) => ({ ...f, service_status_id: e.target.value }))}>
                <option value="">Aucun statut</option>
                {statuts.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </Select>
              {err('service_status_id')}
            </Field>
            <Field label="Date de départ" required>
              <Input type="datetime-local" required value={form.date_depart} onChange={(e) => setForm((f) => ({ ...f, date_depart: e.target.value }))} />
              {err('date_depart')}
            </Field>
          </div>
        </form>
      </Modal>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <DataTable
            title="Services en cours"
            filter={status !== 'actif' && (
              <button
                type="button"
                onClick={() => setStatus('actif')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft size={15} /> Retour aux services en cours
              </button>
            )}
            actions={(
              <>
                {status === 'actif' && (
                  <Button variant="success" icon={<Plus size={16} />} onClick={openCreate}>
                    Ajouter un Service en Cours
                  </Button>
                )}
                <IconButton
                  variant="warning"
                  title={status === 'archive' ? 'Revenir aux services en cours' : 'Voir les archives'}
                  aria-pressed={status === 'archive'}
                  onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
                >
                  <Archive size={18} />
                </IconButton>
                <IconButton
                  variant="dark"
                  title={status === 'corbeille' ? 'Revenir aux services en cours' : 'Voir la corbeille'}
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
            emptyText={status === 'actif' ? 'Aucun service en cours' : status === 'archive' ? 'Aucun service archivé' : 'Corbeille vide'}
            actionsHeader="ACTIONS"
            onRowClick={(r) => showServiceActivite(r)}
            rowClassName={(r) => (selectedService?.id === r.id ? 'bg-success-100' : '')}
            rowActions={(r) => (
                <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {status === 'actif' && (
                    <>
                      <RowBtn title="Modifier" onClick={() => openEdit(r)}><Pencil size={14} /></RowBtn>
                      {/* Œil + Archiver/Corbeille : même composant partagé que
                          l'Accueil (ServiceEnCoursActions.jsx), pas de logique dupliquée. */}
                      <ServiceEnCoursRowActions row={r} onChanged={load} onAfficher={showServiceActivite} />
                    </>
                  )}
                  {status === 'archive' && (
                    <>
                      <RowBtn title="Afficher" onClick={() => showServiceActivite(r)}><Eye size={14} /></RowBtn>
                      <RowBtn title="Restaurer" onClick={() => run(() => restoreServiceEnCours(r.id), 'Service restauré.')}><RotateCcw size={14} /></RowBtn>
                      <RowBtn title="Corbeille" className="hover:text-danger-600" onClick={() => run(() => corbeilleServiceEnCours(r.id), 'Service placé dans la corbeille.')}><Trash2 size={14} /></RowBtn>
                    </>
                  )}
                  {status === 'corbeille' && (
                    <>
                      <RowBtn title="Afficher" onClick={() => showServiceActivite(r)}><Eye size={14} /></RowBtn>
                      <RowBtn title="Restaurer" onClick={() => run(() => restoreServiceEnCours(r.id), 'Service restauré.')}><RotateCcw size={14} /></RowBtn>
                      <RowBtn
                        title="Supprimer définitivement"
                        className="hover:text-danger-600"
                        onClick={() => setConfirm({
                          message: `Supprimer définitivement ce service en cours ? Cette action est irréversible.`,
                          run: () => run(() => deleteServiceEnCoursForever(r.id), 'Service supprimé définitivement.'),
                        })}
                      >
                        <Trash2 size={14} />
                      </RowBtn>
                    </>
                  )}
                </div>
              )}
            />
        </div>

        <div className="rounded-xl bg-white shadow-card overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-2">
            <h2 className="font-bold text-ink-900 truncate">
              {selectedService ? `Activité — ${selectedService.service || 'Service'}` : 'Activité Services'}
            </h2>
            {selectedService && (
              <RowBtn title="Revenir à l'activité globale" onClick={closeServiceActivite}>
                <ArrowLeft size={14} />
              </RowBtn>
            )}
          </div>
          {serviceActiviteLoading ? (
            <EmptyState title="Chargement…" />
          ) : activiteFeed.length === 0 ? (
            <EmptyState title={selectedService ? 'Aucune opération enregistrée' : 'Aucune activité récente'} />
          ) : (
            <div className="p-5 space-y-4">
              {activiteFeed.map((a, i) => (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-500 mt-1" />
                    {i < activiteFeed.length - 1 && <span className="flex-1 w-px bg-line mt-1" />}
                  </div>
                  <div className="pb-2 min-w-0">
                    <BadgeStatutService statut={a.statut} />
                    <div className="text-xs text-ink-600 mt-1">Par <span className="font-semibold text-ink-800">Via Experts</span></div>
                    <div className="text-[11px] text-ink-600">{a.createdAt}</div>
                    {a.fichierChemin && (
                      <a href={`${API_URL}/storage/${a.fichierChemin}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                        <Download size={11} /> {a.fichierNom}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
