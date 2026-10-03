import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Eye, ListTree, Download, Plus, Archive, Trash2, RotateCcw, ArrowLeft, Pencil } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { Field, Input, Select, Textarea } from '../components/Field.jsx'
import { API_URL, ApiError } from '../api/http.js'
import { listClients } from '../api/clients.js'
import { listEntreprises } from '../api/entreprises.js'
import { cachetStatusApi } from '../api/statuses.js'
import {
  listCachets, listActivite, createCachet, updateCachet, addOperation,
  archiveCachet, corbeilleCachet, restoreCachet, deleteCachetForever,
} from '../api/cachets.js'

// Badge repris des couleurs définies dans Paramètres → Cachet (cachet_statuses).
// Un cachet sans opération n'a encore aucun statut métier : « En attente »
// (texte seul, pas une valeur de `cachet_statuses`) reflète ce défaut.
function StatutBadge({ statut }) {
  if (!statut) {
    return (
      <span className="inline-flex items-center rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
        En attente
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold"
      style={{ color: statut.couleurTexte, background: statut.couleurFond }}
    >
      {statut.nom}
    </span>
  )
}

const TABS = [
  { key: 'archive', label: 'Archivés', icon: Archive },
  { key: 'corbeille', label: 'Corbeille', icon: Trash2 },
]

const emptyForm = { party_id: '', lignes: 0 }

export default function Cachets() {
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [rows, setRows] = useState([])
  const [activite, setActivite] = useState([])
  const [clients, setClients] = useState([])
  const [entreprises, setEntreprises] = useState([])
  const [statuts, setStatuts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [fichier, setFichier] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Œil d'une ligne : remplace temporairement le fil global du panneau
  // « Cashet Activité » par celui du seul cachet sélectionné.
  const [selected, setSelected] = useState(null)

  // Clic sur la ligne : petit formulaire « Changer le Statut », repris tel
  // quel de la capture de référence (grandes cartes colorées par statut).
  const [statusFor, setStatusFor] = useState(null)
  const [statusChoisi, setStatusChoisi] = useState(null)
  const [statusFichier, setStatusFichier] = useState(null)
  const [statusCommentaire, setStatusCommentaire] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([listCachets(status), listActivite(15)])
      .then(([list, feed]) => { setRows(list); setActivite(feed) })
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les cachets."
        : 'Impossible de charger les cachets.'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(load, [load])

  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
    cachetStatusApi.list({ page: 1, perPage: 100 }).then((r) => setStatuts(r.data || [])).catch(() => setStatuts([]))
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

  const ouvrirAjout = () => { setEditing(null); setForm(emptyForm); setFichier(null); setFormErrors({}); setSuccess(''); setDrawerOpen(true) }
  const ouvrirModifier = (r) => {
    setEditing(r)
    setForm({ party_id: r.partyId ?? '', lignes: r.lignes ?? 0 })
    setFichier(null)
    setFormErrors({}); setSuccess(''); setDrawerOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setFormErrors({}); setError(''); setSuccess('')
    try {
      const payload = {
        party_id: Number(form.party_id),
        lignes: Number(form.lignes) || 0,
      }
      let cachet
      if (editing) {
        cachet = await updateCachet(editing.id, payload)
      } else {
        cachet = await createCachet({ ...payload, date_depart: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      }
      if (fichier) await addOperation(cachet.id, { fichier })
      setSuccess(editing ? 'Cachet modifié.' : 'Cachet ajouté.')
      setDrawerOpen(false); setEditing(null); setForm(emptyForm); setFichier(null)
      load()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  const ouvrirStatus = (r) => {
    setStatusFor(r)
    setStatusChoisi(r.statut?.id ?? null)
    setStatusFichier(null)
    setStatusCommentaire('')
  }
  const fermerStatus = () => { setStatusFor(null); setStatusChoisi(null); setStatusFichier(null); setStatusCommentaire('') }

  const enregistrerStatus = async () => {
    if (!statusFor) return
    setStatusSaving(true)
    try {
      await addOperation(statusFor.id, {
        cachetStatusId: statusChoisi || undefined,
        commentaire: statusCommentaire || undefined,
        fichier: statusFichier || undefined,
      })
      setSuccess('Statut mis à jour.')
      fermerStatus()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    } finally {
      setStatusSaving(false)
    }
  }

  // Colonnes exactement : Statut, Client, Départ, Dernière opération, Action.
  const columns = [
    { key: 'statut', header: 'Status', value: (r) => r.statut?.nom, render: (r) => <StatutBadge statut={r.statut} /> },
    {
      key: 'client',
      header: 'Client',
      clamp: 2,
      render: (r) => (r.entrepriseId
        ? <Link to={`/entreprises/${r.entrepriseId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link>
        : r.clientId
          ? <Link to={`/clients/${r.clientId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link>
          : <span className="font-semibold text-brand-700">{r.client}</span>),
    },
    { key: 'lignes', header: 'Lignes', align: 'right' },
    { key: 'dateDepart', header: 'Départ' },
    { key: 'derniereOperation', header: 'Dernière Opération' },
  ]

  const exportColumns = [
    { header: 'Status', value: (r) => r.statut?.nom ?? 'En attente' },
    { header: 'Client', value: (r) => r.client },
    { header: 'Lignes', value: (r) => r.lignes },
    { header: 'Départ', value: (r) => r.dateDepart },
    { header: 'Dernière Opération', value: (r) => r.derniereOperation },
  ]

  const err = (k) => formErrors[k] && <span className="mt-1 block text-xs text-danger-600">{formErrors[k][0]}</span>

  const tiers = [
    ...entreprises.map((e) => ({ id: e.id, label: e.denomination, groupe: 'Entreprises' })),
    ...clients.map((c) => ({ id: c.id, label: c.nom, groupe: 'Clients' })),
  ]

  // Panneau « Cashet Activité » : fil global par défaut, ou fil du seul
  // cachet sélectionné (œil) — déjà chargé avec chaque ligne (`r.operations`).
  const activiteFeed = selected ? (selected.operations ?? []) : activite

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {success && <Alert tone="success" className="mb-3">{success}</Alert>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <DataTable
            title="Cashet"
            filter={status !== 'actif' && (
              <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
                Retour aux cachets
              </Button>
            )}
            actions={(
              <>
                <Button variant="success" icon={<Plus size={16} />} onClick={ouvrirAjout}>Nouvelle Cashet</Button>
                <ExportMenu
                  filename={`cachets-${status}`}
                  title="Cashet"
                  subtitle={status === 'actif' ? 'Actifs' : TABS.find((t) => t.key === status)?.label}
                  columns={exportColumns}
                  rows={rows}
                  disabled={rows.length === 0}
                />
                <IconButton
                  variant="warning"
                  title={status === 'archive' ? 'Revenir aux cachets actifs' : 'Voir les archives'}
                  aria-pressed={status === 'archive'}
                  onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
                >
                  <Archive size={18} />
                </IconButton>
                <IconButton
                  variant="dark"
                  title={status === 'corbeille' ? 'Revenir aux cachets actifs' : 'Voir la corbeille'}
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
            emptyText={status === 'actif' ? 'Aucun cachet' : status === 'archive' ? 'Aucun cachet archivé' : 'Corbeille vide'}
            actionsHeader="ACTIONS"
            onRowClick={(r) => ouvrirStatus(r)}
            rowActions={(r) => (
                <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <RowBtn title="Afficher" onClick={() => setSelected(r)}><Eye size={14} /></RowBtn>
                  <ActionMenu
                    label="Actions"
                    icon={<ListTree size={16} />}
                    items={
                      status === 'actif' ? [
                        { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => ouvrirModifier(r) },
                        {
                          label: 'Archiver',
                          icon: <Archive size={15} />,
                          tone: 'warning',
                          onClick: () => setConfirm({
                            title: 'Archiver ce cachet ?',
                            message: `« ${r.client} » sera déplacé dans les archives.`,
                            confirmLabel: 'Archiver',
                            run: () => run(() => archiveCachet(r.id), 'Cachet archivé.'),
                          }),
                        },
                        {
                          label: 'Corbeille',
                          icon: <Trash2 size={15} />,
                          tone: 'danger',
                          onClick: () => setConfirm({
                            title: 'Mettre ce cachet à la corbeille ?',
                            message: `« ${r.client} » sera déplacé dans la corbeille.`,
                            confirmLabel: 'Corbeille',
                            run: () => run(() => corbeilleCachet(r.id), 'Cachet placé dans la corbeille.'),
                          }),
                        },
                      ] : status === 'archive' ? [
                        { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreCachet(r.id), 'Cachet restauré.') },
                        {
                          label: 'Corbeille',
                          icon: <Trash2 size={15} />,
                          tone: 'danger',
                          onClick: () => setConfirm({
                            title: 'Mettre ce cachet à la corbeille ?',
                            message: `« ${r.client} » sera déplacé dans la corbeille.`,
                            confirmLabel: 'Corbeille',
                            run: () => run(() => corbeilleCachet(r.id), 'Cachet placé dans la corbeille.'),
                          }),
                        },
                      ] : [
                        { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreCachet(r.id), 'Cachet restauré.') },
                        {
                          label: 'Supprimer définitivement',
                          icon: <Trash2 size={15} />,
                          tone: 'danger',
                          onClick: () => setConfirm({
                            message: 'Supprimer définitivement ce cachet ? Cette action est irréversible.',
                            run: () => run(() => deleteCachetForever(r.id), 'Cachet supprimé définitivement.'),
                          }),
                        },
                      ]
                    }
                  />
                </div>
              )}
            />
        </div>

        <div className="rounded-xl bg-white shadow-card overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-2">
            <h2 className="font-bold text-ink-900 truncate">
              {selected ? `Activité — ${selected.client}` : 'Cashet Activité'}
            </h2>
            {selected && (
              <RowBtn title="Revenir à l'activité globale" onClick={() => setSelected(null)}>
                <ArrowLeft size={14} />
              </RowBtn>
            )}
          </div>
          {activiteFeed.length === 0 ? (
            <EmptyState title={selected ? 'Aucune opération enregistrée' : 'Aucune activité récente'} />
          ) : (
            <div className="p-5 space-y-4">
              {activiteFeed.map((a, i) => (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-500 mt-1" />
                    {i < activiteFeed.length - 1 && <span className="flex-1 w-px bg-line mt-1" />}
                  </div>
                  <div className="pb-2 min-w-0">
                    <StatutBadge statut={a.statut} />
                    <div className="text-xs text-ink-600 mt-1">Par <span className="font-semibold text-ink-800">{a.par ?? '—'}</span></div>
                    <div className="text-[11px] text-ink-600">{a.createdAt}</div>
                    {a.fichierChemin && (
                      <a href={`${API_URL}/storage/${a.fichierChemin}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline break-all">
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

      {/* « Ajouter / Modifier Cashet » — panneau glissant depuis la droite,
          reproduit de la capture de référence (Entreprises, Lignes, Fichier). */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="right"
        title={editing ? 'Modifier Cashet' : 'Ajouter Cashet'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="submit" form="form-cachet" loading={saving}>
              {editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </>
        )}
      >
        <form id="form-cachet" onSubmit={submit} className="space-y-4">
          <Field label="Entreprises" required>
            <Select required value={form.party_id} onChange={(e) => setForm((f) => ({ ...f, party_id: e.target.value }))}>
              <option value="">Sélectionnez une Entreprise</option>
              {tiers.map((t) => <option key={`${t.groupe}-${t.id}`} value={t.id}>{t.label} — {t.groupe}</option>)}
            </Select>
            {err('party_id')}
          </Field>
          <Field label="Lignes">
            <Input icon={<ListTree size={17} />} type="number" min="0" value={form.lignes} onChange={(e) => setForm((f) => ({ ...f, lignes: e.target.value }))} />
            {err('lignes')}
          </Field>
          <Field label="Fichier">
            <input
              type="file"
              onChange={(e) => setFichier(e.target.files?.[0] || null)}
              className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
            />
          </Field>
        </form>
      </Modal>

      {/* « Changer le Statut du Cashet » — grandes cartes colorées reprises
          des statuts configurés dans Paramètres → Cachet (aucune couleur
          codée en dur), Importer Un Fichier, Commentaire, Fermer/Enregistrer. */}
      <Modal
        open={!!statusFor}
        onClose={fermerStatus}
        size="lg"
        title="Changer le Statut du Cashet"
        footer={(
          <>
            <Button variant="secondary" onClick={fermerStatus}>Fermer</Button>
            <Button onClick={enregistrerStatus} loading={statusSaving}>Enregistrer</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {statuts.map((s) => {
            const actif = statusChoisi === s.id
            return (
              <label
                key={s.id}
                className={`flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition-all ${
                  actif ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:opacity-85'
                }`}
                style={{ background: s.couleur_fond, color: s.couleur_texte }}
              >
                <input
                  type="radio"
                  name="cachet-statut"
                  checked={actif}
                  onChange={() => setStatusChoisi(s.id)}
                  className="h-4 w-4 shrink-0 border-current text-brand-500 focus:ring-brand-500/40"
                />
                <span className="line-clamp-2 leading-tight">{s.nom}</span>
              </label>
            )
          })}
        </div>

        <div className="mt-5">
          <label htmlFor="cachet-status-fichier" className="mb-1.5 block text-sm font-medium text-ink-800">
            Importer Un Fichier
          </label>
          <input
            id="cachet-status-fichier"
            type="file"
            onChange={(e) => setStatusFichier(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-line bg-white p-2.5 text-sm text-ink-800 file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink-800"
          />
        </div>

        <div className="mt-4">
          <Field label="Commentaire">
            <Textarea rows={4} value={statusCommentaire} onChange={(e) => setStatusCommentaire(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
