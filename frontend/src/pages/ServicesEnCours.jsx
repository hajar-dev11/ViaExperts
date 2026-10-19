import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Eye, Archive, Trash2, RotateCcw, ArrowLeft } from 'lucide-react'
import { IconeModifier } from '../components/ui/icons.jsx'
import DataTable from '../components/DataTable.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import Alert from '../components/ui/Alert.jsx'
import { IconButton } from '../components/ui/Button.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import { Field, Input, Select } from '../components/Field.jsx'
import SelectRecherche from '../components/SelectRecherche.jsx'
import { optionsClients } from '../utils/rechercheOptions.js'
import { ApiError } from '../api/http.js'
import { listClients } from '../api/clients.js'
import { listServices } from '../api/services.js'
import FilActivite from '../components/ui/FilActivite.jsx'
import ServiceEnCoursRowActions, { ItemActiviteService, StatutServiceBadge } from '../components/ServiceEnCoursActions.jsx'
import {
  listServicesEnCours, listActivite, listStatutsService, getServiceEnCours, updateServiceEnCours,
  corbeilleServiceEnCours, restoreServiceEnCours, deleteServiceEnCoursForever,
} from '../api/servicesEnCours.js'

const emptyForm = { service_id: '', client_id: '', service_status_id: '', date_depart: '' }

/** Comparaison de noms de statut sans casse, accent ni espace superflu (comme la base côté serveur). */
const normaliser = (nom) => String(nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export default function ServicesEnCours() {
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [rows, setRows] = useState([])
  const [activite, setActivite] = useState([])
  const [services, setServices] = useState([])
  const [clients, setClients] = useState([])
  const [statuts, setStatuts] = useState([])
  const [statutsCharges, setStatutsCharges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [success, setSuccess] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const [serviceActivite, setServiceActivite] = useState([])
  const [serviceActiviteLoading, setServiceActiviteLoading] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    Promise.all([listServicesEnCours(status), listActivite(15)])
      .then(([list, feed]) => { setRows(list); setActivite(feed) })
      .catch((err) => setErreurChargement(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les services en cours."
        : 'Impossible de charger les services en cours.'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(load, [load])

  useEffect(() => {
    listServices('actif').then(setServices).catch(() => setServices([]))
    listClients('actif').then(setClients).catch(() => setClients([]))
    // Statuts réels de Paramètres → Services, servis avec le droit de lecture de cette page (pas celui de Paramètres).
    listStatutsService().then((r) => setStatuts(Array.isArray(r) ? r : [])).catch(() => setStatuts([])).finally(() => setStatutsCharges(true))
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
      // Plus de création manuelle : un service en cours naît d'une action métier (facture, devis, bon de livraison,
      // facture d'avoir, paiement). Ce formulaire ne sert qu'à modifier un service existant.
      await updateServiceEnCours(editing.id, payload)
      setSuccess('Service en cours modifié.')
      setFormOpen(false); setEditing(null); setForm(emptyForm)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  // Panneau « Activité Services » (à droite) : par défaut le fil d'opérations de la PREMIÈRE ligne du tableau (ligne surlignée) ;
  // le clic sur une ligne ou son œil affiche celui du service choisi, sans popup. Le fil global ne sert que si le tableau est vide.
  const showServiceActivite = (r) => setSelectedId(r.id)
  const selectedService = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null
  const selectedServiceId = selectedService?.id ?? null

  // Les opérations sont lues au détail du service ; rechargées quand la liste l'est (statut modifié, etc.).
  useEffect(() => {
    if (selectedServiceId === null) { setServiceActivite([]); return undefined }
    let annule = false
    setServiceActiviteLoading(true)
    getServiceEnCours(selectedServiceId)
      .then((full) => { if (!annule) setServiceActivite(full?.operations ?? []) })
      .catch(() => { if (!annule) setServiceActivite([]) })
      .finally(() => { if (!annule) setServiceActiviteLoading(false) })
    return () => { annule = true }
  }, [selectedServiceId, rows])

  const columns = [
    {
      key: 'statut',
      header: 'Status',
      value: (r) => r.statut?.nom,
      // Statut cliquable → liste des statuts réels ; même composant que l'Accueil (une seule logique, un seul endpoint).
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <StatutServiceBadge row={r} statuts={statuts} onChanged={load} />
        </span>
      ),
    },
    { key: 'service', header: 'Services', clamp: 2 },
    { key: 'client', header: 'Client', clamp: 2, render: (r) => <Link to={`/clients/${r.clientId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link> },
    { key: 'dateDepart', header: 'Départ' },
    { key: 'derniereOperation', header: 'Dernière Opération', clamp: 1 },
  ]

  const err = (k) => formErrors[k] && <span className="mt-1 block text-xs text-danger-600">{formErrors[k][0]}</span>

  const activiteFeed = selectedService ? serviceActivite : activite

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')} className="mb-3">{success}</Alert>}

      {/* Le statut « En Attente » est celui des nouveaux services : s'il manque, ils naissent sans statut — on le dit. */}
      {statutsCharges && (!statuts.some((s) => normaliser(s.nom) === 'en attente') || rows.some((r) => !r.statut)) && (
        <Alert tone="warning" className="mb-3">
          {!statuts.some((s) => normaliser(s.nom) === 'en attente')
            ? 'Le statut « En Attente » n\'existe pas dans Paramètres → Services : les nouveaux services sont créés sans statut. Créez-le (nom exact « En Attente »).'
            : 'Certains services n\'ont pas de statut : choisissez-en un en cliquant sur « Sans statut ».'}
        </Alert>
      )}

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        title="Modifier le service en cours"
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
              <SelectRecherche
                required
                options={optionsClients(clients)}
                value={form.client_id}
                onChange={(valeur) => setForm((f) => ({ ...f, client_id: valeur }))}
                placeholder="Sélectionnez un client"
                error={!!formErrors?.client_id}
              />
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
                      <RowBtn title="Modifier" onClick={() => openEdit(r)}><IconeModifier /></RowBtn>
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
              {selectedService ? `Activité Services — ${selectedService.service || 'Service'}` : 'Activité Services'}
            </h2>
          </div>
          {serviceActiviteLoading ? (
            <EmptyState title="Chargement…" />
          ) : activiteFeed.length === 0 ? (
            <EmptyState title={selectedService ? 'Aucune opération enregistrée' : 'Aucune activité récente'} />
          ) : (
            <FilActivite className="p-5 space-y-4">
              {activiteFeed.map((a, i) => (
                <ItemActiviteService key={a.id} a={a} dernier={i === activiteFeed.length - 1} />
              ))}
            </FilActivite>
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
