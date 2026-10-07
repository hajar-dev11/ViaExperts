import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Archive, Trash2, RotateCcw, FileText, CircleCheck, Pencil,
  MessageSquarePlus, BadgeCheck, Ban, ArrowLeft, RefreshCw, ListTree, Eye,
} from 'lucide-react'
import DataTable from '../../../components/DataTable.jsx'
import ExportMenu from '../../../components/ExportMenu.jsx'
import ConfirmDialog from '../../../components/ConfirmDialog.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import Button, { IconButton } from '../../../components/ui/Button.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import { RowBtn } from '../../../components/ListToolbar.jsx'
import { Field, FileInput, Textarea } from '../../../components/Field.jsx'
import StatutDomiciliationBadge, { STATUT_LABELS } from '../components/StatutDomiciliation.jsx'
import { FormulaireRenouvellement, FormulaireActionSimple } from '../components/DomiciliationActions.jsx'
import { formatDate } from '../../../utils/format.js'
import { ApiError } from '../../../api/http.js'
import {
  listDomiciliations, archiveDomiciliation, corbeilleDomiciliation, restoreDomiciliation,
  deleteDomiciliationForever, declarerDomiciliation, resilierDomiciliation,
  activerDomiciliation, renouvelerDomiciliation, addObservation, addDocument,
} from '../api/domiciliations.js'

// Réexport historique : plusieurs pages importent `StatutDomiciliation` depuis
// ce fichier. Le composant vit désormais dans `components/`.
export { default as StatutDomiciliation } from '../components/StatutDomiciliation.jsx'

// Colonnes de la capture « Gestion Domiciliation » : Situation, Dénomination,
// Centre de Domiciliation, Date Départ, Date Fin.
const columns = [
  { key: 'statutAffichage', header: 'Situation', render: (r) => <StatutDomiciliationBadge statut={r.statutAffichage} /> },
  {
    key: 'denomination',
    header: 'Dénomination',
    clamp: 2,
    render: (r) => (
      <Link to={`/domiciliation/${r.id}`} className="font-semibold text-brand-700 hover:underline">
        {r.denomination}
      </Link>
    ),
  },
  { key: 'centre', header: 'Centre de Domiciliation' },
  { key: 'dateDepart', header: 'Date Départ', render: (r) => formatDate(r.dateDepart) },
  { key: 'dateFin', header: 'Date Fin', render: (r) => formatDate(r.dateFin) },
  { key: 'createdBy', header: 'Action de', value: (r) => r.createdBy || '—' },
]

const exportColumns = [
  { header: 'Situation', value: (r) => STATUT_LABELS[r.statutAffichage]?.label ?? r.statutAffichage },
  { header: 'Dénomination', value: (r) => r.denomination },
  { header: 'Centre', value: (r) => r.centre },
  { header: 'Date Départ', value: (r) => r.dateDepart },
  { header: 'Date Fin', value: (r) => r.dateFin },
  { header: 'Action de', value: (r) => r.createdBy },
]

const VUES = { actif: 'Actifs', archive: 'Archive', corbeille: 'Corbeille' }

export default function DomiciliationList() {
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState('actif')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [observationFor, setObservationFor] = useState(null)
  const [observationText, setObservationText] = useState('')
  const [observationPrivee, setObservationPrivee] = useState(false)
  const [observationFichier, setObservationFichier] = useState(null)
  const [documentFor, setDocumentFor] = useState(null)
  const [documentNom, setDocumentNom] = useState('')
  const [documentFichier, setDocumentFichier] = useState(null)
  const [confirm, setConfirm] = useState(null)
  // Formulaires affichés sur la même page que la liste.
  const [renouvellementFor, setRenouvellementFor] = useState(null)
  const [declarationFor, setDeclarationFor] = useState(null)
  const [resiliationFor, setResiliationFor] = useState(null)

  const fermerFormulaires = () => {
    setRenouvellementFor(null); setDeclarationFor(null); setResiliationFor(null)
    setObservationFor(null); setObservationText(''); setObservationPrivee(false); setObservationFichier(null)
    setDocumentFor(null); setDocumentNom(''); setDocumentFichier(null)
  }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listDomiciliations({ status })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les domiciliations."
        : 'Impossible de charger les domiciliations.'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(load, [load])

  const run = async (fn, message) => {
    setError('')
    try {
      await fn()
      toast.success(message)
      load()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
      return false
    }
  }

  const submitObservation = async () => {
    if (!observationText.trim()) return
    const target = observationFor
    setObservationFor(null)
    await run(
      () => addObservation(target.id, observationText, { privee: observationPrivee, fichier: observationFichier }),
      'Observation ajoutée.'
    )
    setObservationText(''); setObservationPrivee(false); setObservationFichier(null)
  }

  const submitDocument = async () => {
    const target = documentFor
    const fichier = documentFichier
    setDocumentFor(null)
    await run(() => addDocument(target.id, fichier, documentNom.trim()), 'Document ajouté.')
    setDocumentNom(''); setDocumentFichier(null)
  }

  /** Bascule Archive / Corbeille : un second clic revient aux actifs. */
  const basculerVue = (cible) => setStatus((v) => (v === cible ? 'actif' : cible))

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3" onClose={() => setError('')}>{error}</Alert>}
      {status !== 'actif' && (
        <Alert tone="neutral" className="mb-3">
          Vous consultez <span className="font-semibold text-ink-900">{status === 'archive' ? 'les domiciliations archivées' : 'la corbeille'}</span>.
        </Alert>
      )}

      {/* ---- Formulaires d'action, en modale centrée --------------------- */}
      {renouvellementFor && (
        <FormulaireRenouvellement
          domiciliation={renouvellementFor}
          onAnnuler={() => setRenouvellementFor(null)}
          onEnregistrer={async ({ champs }) => {
            const cible = renouvellementFor
            const ok = await run(
              () => renouvelerDomiciliation(cible.id, champs),
              `Domiciliation « ${cible.denomination} » renouvelée.`
            )
            if (ok) setRenouvellementFor(null)
          }}
        />
      )}

      {declarationFor && (
        <FormulaireActionSimple
          titre={`Déclarer la domiciliation — ${declarationFor.denomination}`}
          description="La domiciliation passe à l'état « Déclaré » à la date du jour."
          libelleBouton="Déclarer"
          tone="success"
          onAnnuler={() => setDeclarationFor(null)}
          onEnregistrer={async ({ commentaire, fichier }) => {
            const cible = declarationFor
            const ok = await run(
              () => declarerDomiciliation(cible.id, { commentaire, fichier }),
              'Domiciliation déclarée.'
            )
            if (ok) setDeclarationFor(null)
          }}
        />
      )}

      {resiliationFor && (
        <FormulaireActionSimple
          titre={`Résilier la domiciliation — ${resiliationFor.denomination}`}
          description="La domiciliation passe à l'état « Résilié » à la date du jour."
          libelleBouton="Résilier"
          tone="danger"
          onAnnuler={() => setResiliationFor(null)}
          onEnregistrer={async ({ commentaire, fichier }) => {
            const cible = resiliationFor
            const ok = await run(
              () => resilierDomiciliation(cible.id, { commentaire, fichier }),
              'Domiciliation résiliée.'
            )
            if (ok) setResiliationFor(null)
          }}
        />
      )}

      <Modal
        open={!!observationFor}
        onClose={() => { setObservationFor(null); setObservationText(''); setObservationPrivee(false); setObservationFichier(null) }}
        title={`Ajouter une observation — ${observationFor?.denomination ?? ''}`}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setObservationFor(null); setObservationText(''); setObservationPrivee(false); setObservationFichier(null) }}>Annuler</Button>
            <Button disabled={!observationText.trim()} onClick={submitObservation}>Enregistrer</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field label="Observation" required>
            <Textarea
              autoFocus
              rows={3}
              value={observationText}
              onChange={(e) => setObservationText(e.target.value)}
              placeholder="Votre observation…"
            />
          </Field>
          <Field label="Fichier à importer" hint="5 Mo maximum. Facultatif.">
            <FileInput onChange={(e) => setObservationFichier(e.target.files?.[0] ?? null)} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <input
              type="checkbox"
              checked={observationPrivee}
              onChange={(e) => setObservationPrivee(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
            />
            <span className="min-w-0 text-sm">
              <span className="font-medium text-ink-900">Observation privée</span>
              <span className="mt-0.5 block text-xs text-ink-600">Seuls vous et les administrateurs pourrez la lire.</span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={!!documentFor}
        onClose={() => { setDocumentFor(null); setDocumentNom(''); setDocumentFichier(null) }}
        title={`Ajouter un document — ${documentFor?.denomination ?? ''}`}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setDocumentFor(null); setDocumentNom(''); setDocumentFichier(null) }}>Annuler</Button>
            <Button disabled={!documentFichier} onClick={submitDocument}>Enregistrer</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field label="Nom du document" hint="Laissé vide, le nom du fichier est repris.">
            <input
              type="text"
              value={documentNom}
              onChange={(e) => setDocumentNom(e.target.value)}
              placeholder="Nom du document"
              className="h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-500 focus-ring"
            />
          </Field>
          <Field label="Fichier" required hint="5 Mo maximum.">
            <FileInput onChange={(e) => setDocumentFichier(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
      </Modal>

      <DataTable
        title="Gestion Domiciliation"
        filter={status !== 'actif' && (
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
            Retour aux domiciliations
          </Button>
        )}
        actions={(
          <>
            <Button variant="success" to="/domiciliation/nouvelle" icon={<Plus size={16} />}>Nouvelle Domiciliation</Button>
            <ExportMenu
              filename={`domiciliations-${status}`}
              title="Gestion Domiciliation"
              subtitle={VUES[status]}
              columns={exportColumns}
              rows={rows}
              disabled={rows.length === 0}
            />
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux domiciliations actives' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => basculerVue('archive')}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux domiciliations actives' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => basculerVue('corbeille')}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucune domiciliation' : status === 'archive' ? 'Aucune domiciliation archivée' : 'Corbeille vide'}
        actionsHeader="ACTIONS"
        rowActions={(r) => (
            <div className="flex flex-wrap justify-end gap-1.5">
              {status === 'actif' && (
                <>
                  {/* Renouveler directement depuis le tableau — les deux flèches de la capture. */}
                  <RowBtn
                    title="Renouveler"
                    onClick={() => { fermerFormulaires(); setRenouvellementFor(r) }}
                  >
                    <RefreshCw size={15} />
                  </RowBtn>
                  <ActionMenu
                    label="Actions"
                    icon={<ListTree size={15} />}
                    items={[
                      {
                        label: 'Modifier',
                        icon: <Pencil size={15} />,
                        onClick: () => navigate(`/domiciliation/${r.id}/modifier`),
                      },
                      {
                        label: 'Activer',
                        icon: <CircleCheck size={15} />,
                        tone: 'success',
                        disabled: r.etat === 'active' || !r.etat,
                        onClick: () => run(() => activerDomiciliation(r.id), 'Domiciliation activée.'),
                      },
                      { label: 'Afficher', icon: <Eye size={15} />, onClick: () => navigate(`/domiciliation/${r.id}`) },
                      { label: 'Ajouter Documents', icon: <FileText size={15} />, onClick: () => { fermerFormulaires(); setDocumentFor(r) } },
                      { label: 'Ajouter Observation', icon: <MessageSquarePlus size={15} />, onClick: () => { fermerFormulaires(); setObservationFor(r) } },
                      {
                        label: r.etat === 'declare' ? 'Déclarée' : 'Déclary',
                        icon: <BadgeCheck size={15} />,
                        separatorBefore: true,
                        onClick: () => { fermerFormulaires(); setDeclarationFor(r) },
                      },
                      {
                        label: r.etat === 'resilie' ? 'Résiliée' : 'Résilier',
                        icon: <Ban size={15} />,
                        tone: 'danger',
                        onClick: () => { fermerFormulaires(); setResiliationFor(r) },
                      },
                      {
                        label: 'Archive',
                        icon: <Archive size={15} />,
                        tone: 'warning',
                        separatorBefore: true,
                        onClick: () => setConfirm({
                          title: 'Archiver cette domiciliation ?',
                          message: `« ${r.denomination} » sera déplacée dans les archives.`,
                          confirmLabel: 'Archiver',
                          run: () => run(() => archiveDomiciliation(r.id), 'Domiciliation archivée.'),
                        }),
                      },
                      {
                        label: 'Supprimer',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        onClick: () => setConfirm({
                          title: 'Supprimer cette domiciliation ?',
                          message: `« ${r.denomination} » sera placée dans la corbeille.`,
                          confirmLabel: 'Supprimer',
                          run: () => run(() => corbeilleDomiciliation(r.id), 'Domiciliation placée dans la corbeille.'),
                        }),
                      },
                    ]}
                  />
                </>
              )}
              {status === 'archive' && (
                <>
                  <RowBtn title="Afficher" onClick={() => navigate(`/domiciliation/${r.id}`)}><Eye size={15} /></RowBtn>
                  <RowBtn title="Restaurer" onClick={() => run(() => restoreDomiciliation(r.id), 'Domiciliation restaurée.')}><RotateCcw size={14} /></RowBtn>
                  <RowBtn title="Corbeille" className="hover:text-danger-600" onClick={() => run(() => corbeilleDomiciliation(r.id), 'Domiciliation placée dans la corbeille.')}><Trash2 size={14} /></RowBtn>
                </>
              )}
              {status === 'corbeille' && (
                <>
                  <RowBtn title="Afficher" onClick={() => navigate(`/domiciliation/${r.id}`)}><Eye size={15} /></RowBtn>
                  <RowBtn title="Restaurer" onClick={() => run(() => restoreDomiciliation(r.id), 'Domiciliation restaurée.')}><RotateCcw size={14} /></RowBtn>
                  <RowBtn
                    title="Supprimer définitivement"
                    className="hover:text-danger-600"
                    onClick={() => setConfirm({
                      title: 'Supprimer définitivement',
                      message: `Supprimer définitivement « ${r.denomination} » ? Cette action est irréversible.`,
                      run: () => run(() => deleteDomiciliationForever(r.id), 'Domiciliation supprimée définitivement.'),
                    })}
                  >
                    <Trash2 size={14} />
                  </RowBtn>
                </>
              )}
            </div>
          )}
        />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />
    </div>
  )
}
