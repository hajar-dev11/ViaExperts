import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, ListTree, Archive, Trash2, RotateCcw, ArrowLeft,
  Eye, FilePlus2, MessageSquarePlus, Ban, ShieldOff, Lock,
} from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { Field, FileInput, Input, Textarea } from '../components/Field.jsx'
import {
  listEntreprises, restoreEntreprise, deleteEntrepriseForever,
  archiveEntreprise, corbeilleEntreprise,
  addEntrepriseObservation, addEntrepriseDocument,
  listeNoireEntreprise, retirerListeNoireEntreprise, bloquerEntreprise, debloquerEntreprise,
} from '../api/entreprises.js'

/**
 * Observation affichée dans la colonne : la plus récente de l'historique
 * (`entreprise_observations`), sinon l'ancien champ texte `observation`,
 * qui reste rempli sur les fiches saisies avant l'historique.
 */
const derniereObservation = (r) => r.observationsListe?.find((o) => (o.status ?? 'actif') === 'actif')?.contenu
  || r.observations

// Titre de la confirmation, selon l'action Liste Noire / Bloquer choisie.
const SITUATION_TITRES = new Map([
  [listeNoireEntreprise, 'Ajouter à la Liste Noire ?'],
  [retirerListeNoireEntreprise, 'Retirer de la Liste Noire ?'],
  [bloquerEntreprise, 'Bloquer cette entreprise ?'],
  [debloquerEntreprise, 'Débloquer cette entreprise ?'],
])

// Colonnes réellement exportées (Imprimer / CSV / Excel / PDF).
const exportColumns = [
  { header: 'Dénomination', value: (r) => r.denomination },
  { header: 'Situation', value: (r) => r.situation },
  { header: 'Local', value: (r) => r.local },
  { header: 'I.F', value: (r) => r.if },
  { header: 'I.C.E', value: (r) => r.ice },
  { header: 'R.C', value: (r) => r.rc },
  { header: 'N° Archive', value: (r) => r.id },
  { header: 'Observations', value: derniereObservation },
]

const columns = [
  { key: 'situation', header: 'Situation', render: (r) => <StatusBadge status={r.situation} /> },
  { key: 'denomination', header: 'Dénomination', clamp: 2, render: (r) => <Link to={`/entreprises/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.denomination}</Link> },
  { key: 'local', header: 'Local' },
  { key: 'if', header: 'I.F' },
  { key: 'id', header: 'N° Archive', value: (r) => r.id },
  { key: 'observations', header: 'Observations', clamp: 1, render: (r) => derniereObservation(r) || <span className="text-ink-600">—</span> },
]

const TABS = [
  { key: 'actif', label: 'Actifs', icon: ListTree },
  { key: 'archive', label: 'Archivés', icon: Archive },
  { key: 'corbeille', label: 'Corbeille', icon: Trash2 },
]

export default function EntreprisesList() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('actif')
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Fenêtres « Ajouter Observation » / « Ajouter Documents » et confirmation
  // de suppression.
  const [observationPour, setObservationPour] = useState(null)
  const [observationTexte, setObservationTexte] = useState('')
  const [observationFichiers, setObservationFichiers] = useState([])
  const [observationPrivee, setObservationPrivee] = useState(false)
  const [documentPour, setDocumentPour] = useState(null)
  const [documentFichier, setDocumentFichier] = useState(null)
  const [documentNom, setDocumentNom] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [suppressionPour, setSuppressionPour] = useState(null)
  const [suppressionDefinitivePour, setSuppressionDefinitivePour] = useState(null)
  // Confirmation générique avant Liste Noire / Bloquer (et leur retrait).
  const [situationPour, setSituationPour] = useState(null)

  const load = () => {
    setLoading(true)
    setError('')
    listEntreprises(status)
      .then(setEntreprises)
      .catch(() => setError('Impossible de charger les entreprises.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [status])

  /** Ajoute une ligne à l'historique des observations de l'entreprise. */
  const enregistrerObservation = async () => {
    if (!observationPour || !observationTexte.trim()) return
    setEnregistrement(true)
    setError('')
    try {
      await addEntrepriseObservation(observationPour.id, observationTexte.trim(), {
        privee: observationPrivee,
        fichiers: observationFichiers,
      })
      setObservationPour(null)
      load()
    } catch {
      setError("L'observation n'a pas pu être enregistrée.")
    } finally {
      setEnregistrement(false)
    }
  }

  /** Joint un fichier au bloc « Documents » de l'entreprise. */
  const enregistrerDocument = async () => {
    if (!documentPour || !documentFichier) return
    setEnregistrement(true)
    setError('')
    try {
      await addEntrepriseDocument(documentPour.id, documentFichier, documentNom.trim())
      setDocumentPour(null)
      load()
    } catch {
      setError("Le document n'a pas pu être ajouté.")
    } finally {
      setEnregistrement(false)
    }
  }

  const runAction = async (action, id) => {
    try {
      await action(id)
      load()
    } catch {
      setError("L'action n'a pas pu être effectuée.")
    }
  }

  /** Exécute l'action Liste Noire / Bloquer choisie, une fois confirmée. */
  const confirmerSituation = async () => {
    if (!situationPour) return
    setError('')
    try {
      await situationPour.action(situationPour.row.id)
      setSituationPour(null)
      load()
    } catch {
      setError("L'action n'a pas pu être effectuée.")
      setSituationPour(null)
    }
  }

  return (
    <div>
      {status !== 'actif' && (
        <div className="mb-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink-700">
          Vous consultez <span className="font-semibold text-ink-900">{status === 'archive' ? 'les entreprises archivées' : 'la corbeille'}</span>.
        </div>
      )}

      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}

      <DataTable
        title="Liste des Entreprises"
        filter={status !== 'actif' && (
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => setStatus('actif')}>
            Retour à la liste des entreprises
          </Button>
        )}
        actions={(
          <>
            <Button variant="success" to="/entreprises/nouvelle" icon={<Plus size={16} />}>Nouvelle Entreprise</Button>
            <ExportMenu
              filename={`entreprises-${status}`}
              title="Liste des Entreprises"
              subtitle={TABS.find((t) => t.key === status)?.label}
              columns={exportColumns}
              rows={entreprises}
              disabled={entreprises.length === 0}
            />
            {/* Directement Archive puis Corbeille, comme la référence : pas de
                bouton « Actifs » intermédiaire — le lien « Retour » ci-dessus
                suffit à revenir à la liste active. */}
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux entreprises actives' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux entreprises actives' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille'))}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={entreprises}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucune entreprise' : status === 'archive' ? 'Aucune entreprise archivée' : 'Corbeille vide'}
        rowActions={(r) => (
            <div className="flex justify-end gap-1.5">
              {status === 'actif' && (
                <>
                  <RowBtn title="Modifier" onClick={() => navigate(`/entreprises/${r.id}/modifier`)}><Pencil size={16} /></RowBtn>
                  {/* Menu d'actions de la référence : Afficher / Ajouter Documents /
                      Ajouter Observation — Liste Noire / Bloquer — Archive / Supprimer. */}
                  <ActionMenu
                    label="Actions"
                    icon={<ListTree size={16} />}
                    items={[
                      {
                        label: 'Afficher',
                        icon: <Eye size={15} />,
                        onClick: () => navigate(`/entreprises/${r.id}`),
                      },
                      {
                        label: 'Ajouter Documents',
                        icon: <FilePlus2 size={15} />,
                        onClick: () => { setDocumentPour(r); setDocumentFichier(null); setDocumentNom('') },
                      },
                      {
                        label: 'Ajouter Observation',
                        icon: <MessageSquarePlus size={15} />,
                        onClick: () => {
                          setObservationPour(r)
                          setObservationTexte('')
                          setObservationFichiers([])
                          setObservationPrivee(false)
                        },
                      },
                      {
                        label: r.situation === 'Liste Noire' ? 'Retirer de la Liste Noire' : 'Liste Noire',
                        icon: <Ban size={15} />,
                        separatorBefore: true,
                        onClick: () => setSituationPour({
                          row: r,
                          action: r.situation === 'Liste Noire' ? retirerListeNoireEntreprise : listeNoireEntreprise,
                        }),
                      },
                      {
                        label: r.situation === 'Bloqué' ? 'Débloquer' : 'Bloquer',
                        icon: <ShieldOff size={15} />,
                        tone: 'danger',
                        onClick: () => setSituationPour({
                          row: r,
                          action: r.situation === 'Bloqué' ? debloquerEntreprise : bloquerEntreprise,
                        }),
                      },
                      {
                        label: 'Archive',
                        icon: <Archive size={15} />,
                        tone: 'warning',
                        separatorBefore: true,
                        onClick: () => runAction(archiveEntreprise, r.id),
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
                <RowBtn title="Restaurer" onClick={() => runAction(restoreEntreprise, r.id)}><RotateCcw size={14} /></RowBtn>
              )}
              {status === 'corbeille' && (
                <>
                  <RowBtn title="Restaurer" onClick={() => runAction(restoreEntreprise, r.id)}><RotateCcw size={14} /></RowBtn>
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

      {/* « Ajouter Observation » — nouvelle ligne dans l'historique de la fiche.
          Elle est visible dans le bloc Observations de la page Détails. */}
      <Modal
        open={!!observationPour}
        onClose={() => setObservationPour(null)}
        title={`Observation — ${observationPour?.denomination ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setObservationPour(null)}>Fermer</Button>
            <Button
              loading={enregistrement}
              disabled={!observationTexte.trim()}
              onClick={enregistrerObservation}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Observation" required>
            <Textarea
              value={observationTexte}
              onChange={(e) => setObservationTexte(e.target.value)}
              placeholder="Observation"
              className="min-h-[140px]"
            />
          </Field>

          <Field
            label="Pièces jointes"
            hint={observationFichiers.length > 0
              ? `${observationFichiers.length} fichier(s) sélectionné(s).`
              : '10 fichiers maximum, 5 Mo chacun.'}
          >
            <FileInput multiple onChange={(e) => setObservationFichiers([...e.target.files])} />
          </Field>

          {/* Une observation privée n'est lisible que par son auteur et les
              administrateurs — le serveur ne la renvoie pas aux autres. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <input
              type="checkbox"
              checked={observationPrivee}
              onChange={(e) => setObservationPrivee(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
            />
            <span className="min-w-0 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-ink-900">
                <Lock size={14} /> Observation privée
              </span>
              <span className="mt-0.5 block text-xs text-ink-600">
                Seuls vous et les administrateurs pourrez la lire.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      {/* « Ajouter Documents » — le fichier rejoint le bloc Documents de la fiche. */}
      <Modal
        open={!!documentPour}
        onClose={() => setDocumentPour(null)}
        title={`Ajouter un document — ${documentPour?.denomination ?? ''}`}
        description="5 Mo maximum."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDocumentPour(null)}>Fermer</Button>
            <Button
              loading={enregistrement}
              disabled={!documentFichier}
              onClick={enregistrerDocument}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Fichier" required hint="5 Mo maximum.">
            <FileInput onChange={(e) => setDocumentFichier(e.target.files?.[0] ?? null)} />
          </Field>

          <Field label="Nom du document" hint="Laissé vide, le nom du fichier est repris.">
            <Input
              placeholder="Nom du document"
              value={documentNom}
              onChange={(e) => setDocumentNom(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!suppressionPour}
        title="Supprimer cette entreprise ?"
        message={`Voulez-vous vraiment supprimer « ${suppressionPour?.denomination ?? ''} » ? Elle sera placée dans la corbeille.`}
        confirmLabel="Supprimer"
        onCancel={() => setSuppressionPour(null)}
        onConfirm={() => {
          const cible = suppressionPour
          setSuppressionPour(null)
          runAction(corbeilleEntreprise, cible.id)
        }}
      />

      {/* Confirmation commune à Liste Noire et Bloquer : la phrase exacte
          demandée, avec le nom de l'entreprise pour ne pas se tromper de fiche. */}
      <ConfirmDialog
        open={!!situationPour}
        title={SITUATION_TITRES.get(situationPour?.action) ?? 'Confirmer cette action ?'}
        message={`« ${situationPour?.row?.denomination ?? ''} » — Êtes-vous sûr de vouloir effectuer cette action ?`}
        confirmLabel="Confirmer"
        tone={situationPour?.action === listeNoireEntreprise || situationPour?.action === bloquerEntreprise ? 'danger' : 'primary'}
        onCancel={() => setSituationPour(null)}
        onConfirm={confirmerSituation}
      />

      <ConfirmDialog
        open={!!suppressionDefinitivePour}
        title="Supprimer définitivement cette entreprise ?"
        message={`Supprimer définitivement « ${suppressionDefinitivePour?.denomination ?? ''} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        onCancel={() => setSuppressionDefinitivePour(null)}
        onConfirm={() => {
          const cible = suppressionDefinitivePour
          setSuppressionDefinitivePour(null)
          runAction(deleteEntrepriseForever, cible.id)
        }}
      />
    </div>
  )
}
