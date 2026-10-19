import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive, Download as DownloadIcon, FileText, Folder,
  Lock, Paperclip, RefreshCw, RotateCcw, Trash2, Building2,
} from 'lucide-react'
import { IconeActions } from './ui/icons.jsx'
import DataTable from './DataTable.jsx'
import Alert from './ui/Alert.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import ActionMenu from './ui/ActionMenu.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { RowBtn } from './ListToolbar.jsx'
import { Field, FileInput, Input, Textarea } from './Field.jsx'
import CarteBloc, { VUES_BLOC as VUES } from './CarteBloc.jsx'
import { formaterMontant } from '../utils/montants.js'
import {
  StatutDomiciliation as StatutDomiciliationBadge, FormulaireRenouvellement, MenuImprimer,
  archiveDomiciliation, corbeilleDomiciliation, restoreDomiciliation, renouvelerDomiciliation,
} from '../modules/domiciliation/index.js'
import {
  addEntrepriseDocument, entrepriseDocumentUrl, archiveEntrepriseDocument,
  corbeilleEntrepriseDocument, restoreEntrepriseDocument, deleteEntrepriseDocumentForever,
  addEntrepriseObservation, entrepriseObservationFichierUrl, archiveEntrepriseObservation,
  corbeilleEntrepriseObservation, restoreEntrepriseObservation, deleteEntrepriseObservationForever,
} from '../api/entreprises.js'
import { ApiError } from '../api/http.js'
import { formatDate, formatDateHeure } from '../utils/format.js'

/**
 * Les trois blocs « Documents / Observations / Domiciliations » d'une fiche
 * entreprise, avec toutes leurs actions (ajout, archive, corbeille, restaurer,
 * suppression définitive, renouvellement, impression).
 *
 * Composant PARTAGÉ entre « Informations Entreprise » et « Informations
 * Client » (le client y voit les mêmes blocs pour l'entreprise dont il est
 * le titulaire) : une seule implémentation, donc un seul endroit à corriger.
 *
 * Le composant ne charge rien lui-même : `entreprise` et `domiciliations`
 * viennent du parent, qui reste responsable du chargement initial et sait
 * comment le recharger après une action.
 */

/**
 * Actions de ligne des blocs Documents et Observations.
 * Le menu dépend de la vue : depuis les archives ou la corbeille, « Archiver »
 * laisse la place à « Restaurer », et la suppression n'est définitive que
 * depuis la corbeille — même règle que partout ailleurs dans l'application.
 */
function ActionsLigne({ vue, telecharger, archiver, restaurer, corbeille, supprimer }) {
  const items = []
  if (vue === 'actif') {
    items.push({ label: 'Archiver', icon: <Archive size={15} />, tone: 'warning', onClick: archiver })
    items.push({ label: 'Supprimer', icon: <Trash2 size={15} />, tone: 'danger', onClick: corbeille })
  } else {
    items.push({ label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: restaurer })
    if (vue === 'archive') {
      items.push({ label: 'Supprimer', icon: <Trash2 size={15} />, tone: 'danger', onClick: corbeille })
    } else {
      items.push({
        label: 'Supprimer définitivement',
        icon: <Trash2 size={15} />,
        tone: 'danger',
        separatorBefore: true,
        onClick: supprimer,
      })
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      {telecharger && (
        <RowBtn title="Télécharger" onClick={telecharger}>
          <DownloadIcon size={16} />
        </RowBtn>
      )}
      <ActionMenu label="Actions" icon={<IconeActions />} items={items} />
    </div>
  )
}

/** Poids d'un fichier en unité lisible. */
function formatTaille(octets) {
  if (!octets && octets !== 0) return '—'
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

export default function BlocsEntreprise({
  entrepriseId,
  entreprise,
  domiciliations,
  signaturePath,
  onEntrepriseChange,
  onDomiciliationsChange,
  onSansDomiciliation,
  onRecharger,
}) {
  const [erreur, setErreur] = useState('')

  // Vue courante de chaque bloc : actif / archive / corbeille.
  const [vueDocuments, setVueDocuments] = useState('actif')
  const [vueObservations, setVueObservations] = useState('actif')
  const [vueDomiciliations, setVueDomiciliations] = useState('actif')
  // Formulaire « Renouveler Domiciliation », affiché dans la page.
  const [renouvellementFor, setRenouvellementFor] = useState(null)

  // Modales d'ajout et confirmation de suppression définitive.
  const [ajoutDocument, setAjoutDocument] = useState(false)
  const [fichier, setFichier] = useState(null)
  const [nomDocument, setNomDocument] = useState('')
  const [ajoutObservation, setAjoutObservation] = useState(false)
  const [texteObservation, setTexteObservation] = useState('')
  const [fichiersObservation, setFichiersObservation] = useState([])
  const [observationPrivee, setObservationPrivee] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [suppressionDefinitive, setSuppressionDefinitive] = useState(null)
  const [suppressionDomi, setSuppressionDomi] = useState(null)

  /** Exécute une action d'un bloc et remplace la fiche par celle renvoyée. */
  const executer = async (action, messageErreur) => {
    setEnCours(true)
    try {
      const maj = await action()
      if (maj) onEntrepriseChange?.(maj)
      else onRecharger?.()
    } catch {
      setErreur(messageErreur)
    } finally {
      setEnCours(false)
    }
  }

  /** Archive / corbeille d'une domiciliation, puis rechargement de la liste. */
  const executerDomiciliation = async (action) => {
    try {
      await action()
      onDomiciliationsChange?.()
    } catch {
      setErreur("L'action n'a pas pu être effectuée sur cette domiciliation.")
    }
  }

  // Période la plus récente : c'est elle que « Renouveler Domiciliation »
  // prolonge, comme le ferait l'action depuis la page Gestion Domiciliation.
  const derniereDomiciliation = [...domiciliations]
    .sort((a, b) => String(b.dateDepart ?? '').localeCompare(String(a.dateDepart ?? '')))[0] ?? null

  const documents = (entreprise?.documents ?? []).filter((d) => (d.status ?? 'actif') === vueDocuments)
  const observations = (entreprise?.observationsListe ?? []).filter((o) => (o.status ?? 'actif') === vueObservations)

  const colonnesDomiciliation = [
    {
      key: 'statut',
      header: 'Situation',
      render: (r) => (
        <Link to={`/domiciliation/${r.id}`} className="hover:opacity-80">
          <StatutDomiciliationBadge statut={r.statutAffichage} />
        </Link>
      ),
    },
    { key: 'dateDepart', header: 'Date Depart', render: (r) => formatDate(r.dateDepart) },
    { key: 'dateFin', header: 'Date Fin', render: (r) => formatDate(r.dateFin) },
    { key: 'moisPayee', header: 'Payee', render: (r) => `${r.moisPayee ?? 0} Mois` },
    { key: 'moisGratuits', header: 'Gratuits', render: (r) => `${r.moisGratuits ?? 0} Mois` },
    { key: 'dateLegalisation', header: 'Date Galisation', render: (r) => formatDate(r.dateLegalisation) },
    { key: 'prixTotal', header: 'Prix HT', numeric: true, render: (r) => `${formaterMontant(r.prixTotal ?? 0)} Dh` },
    { key: 'createdAt', header: "Date d'ajout", render: (r) => formatDateHeure(r.createdAt) || '—' },
    { key: 'createdBy', header: 'Action de', render: (r) => r.createdBy ?? '—' },
  ]

  return (
    <>
      {/* Pendant que la fenêtre de renouvellement est ouverte, l'erreur s'affiche DANS la fenêtre (pas deux fois). */}
      {!renouvellementFor && erreur && <Alert tone="danger" onAutoClose={() => setErreur('')}>{erreur}</Alert>}

      {/* Documents */}
      <CarteBloc
        icon={Folder}
        titre="Documents"
        ouvertParDefaut={false}
        onAjouter={() => { setFichier(null); setNomDocument(''); setAjoutDocument(true) }}
        vue={vueDocuments}
        onVue={setVueDocuments}
      >
        <DataTable
          columns={[
            { key: 'nom', header: 'Nom Document', wrap: true },
            { key: 'taille', header: 'Taille', render: (r) => formatTaille(r.taille) },
            { key: 'createdAt', header: "Date d'ajout", render: (r) => formatDateHeure(r.createdAt) },
            { key: 'par', header: 'Ajouter par', render: (r) => r.par ?? '—' },
          ]}
          rows={documents}
          pageSize={25}
          pageSizeOptions={[25, 50, 100]}
          actionsHeader="ACTION"
          rowActions={(r) => (
            <ActionsLigne
              vue={vueDocuments}
              telecharger={() => window.open(entrepriseDocumentUrl(entrepriseId, r.id), '_blank', 'noopener')}
              archiver={() => executer(() => archiveEntrepriseDocument(entrepriseId, r.id), "Ce document n'a pas pu être archivé.")}
              restaurer={() => executer(() => restoreEntrepriseDocument(entrepriseId, r.id), "Ce document n'a pas pu être restauré.")}
              corbeille={() => executer(() => corbeilleEntrepriseDocument(entrepriseId, r.id), "Ce document n'a pas pu être déplacé.")}
              supprimer={() => setSuppressionDefinitive({ genre: 'document', ligne: r })}
            />
          )}
          emptyText={vueDocuments === 'actif' ? 'Aucun document' : `Aucun document dans ${VUES[vueDocuments]}`}
        />
      </CarteBloc>

      {/* Observations */}
      <CarteBloc
        icon={FileText}
        titre="Observations"
        ouvertParDefaut={false}
        onAjouter={() => {
          setTexteObservation('')
          setFichiersObservation([])
          setObservationPrivee(false)
          setAjoutObservation(true)
        }}
        vue={vueObservations}
        onVue={setVueObservations}
      >
        <DataTable
          columns={[
            {
              key: 'contenu',
              header: 'Observation',
              wrap: true,
              render: (r) => (
                <span className="flex items-start gap-2">
                  {/* Une observation privée n'arrive ici que si l'utilisateur
                      a le droit de la lire : le serveur filtre les autres. */}
                  {r.privee && (
                    <Lock size={14} className="mt-0.5 shrink-0 text-warning-600" aria-label="Observation privée" />
                  )}
                  <span className="min-w-0">{r.contenu}</span>
                </span>
              ),
            },
            {
              key: 'fichiers',
              header: 'Pièces jointes',
              wrap: true,
              render: (r) => (r.fichiers?.length
                ? (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {r.fichiers.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => window.open(
                          entrepriseObservationFichierUrl(entrepriseId, r.id, f.id), '_blank', 'noopener'
                        )}
                        title={`Télécharger ${f.nom}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-info-600 hover:underline focus-ring"
                      >
                        <Paperclip size={14} /> {f.nom}
                      </button>
                    ))}
                  </span>
                )
                : <span className="text-ink-500">—</span>),
            },
            { key: 'createdAt', header: "Date d'ajout", render: (r) => formatDateHeure(r.createdAt) },
            { key: 'par', header: 'Ajouter par', render: (r) => r.par ?? '—' },
          ]}
          rows={observations}
          pageSize={5}
          pageSizeOptions={[5, 10, 25]}
          actionsHeader="ACTION"
          rowActions={(r) => (
            <ActionsLigne
              vue={vueObservations}
              archiver={() => executer(() => archiveEntrepriseObservation(entrepriseId, r.id), "Cette observation n'a pas pu être archivée.")}
              restaurer={() => executer(() => restoreEntrepriseObservation(entrepriseId, r.id), "Cette observation n'a pas pu être restaurée.")}
              corbeille={() => executer(() => corbeilleEntrepriseObservation(entrepriseId, r.id), "Cette observation n'a pas pu être déplacée.")}
              supprimer={() => setSuppressionDefinitive({ genre: 'observation', ligne: r })}
            />
          )}
          emptyText={vueObservations === 'actif' ? 'Aucune observation' : `Aucune observation dans ${VUES[vueObservations]}`}
        />
      </CarteBloc>

      {/* Renouvellement — même logique métier que la page Gestion
          Domiciliation : le composant est le même, l'appel API aussi. */}
      {renouvellementFor && (
        <FormulaireRenouvellement
          domiciliation={renouvellementFor}
          erreur={erreur}
          onEffacerErreur={() => setErreur('')}
          onAnnuler={() => { setRenouvellementFor(null); setErreur('') }}
          onEnregistrer={async ({ champs, fichier }) => {
            const cible = renouvellementFor
            try {
              await renouvelerDomiciliation(cible.id, champs, fichier)
              setRenouvellementFor(null)
              setVueDomiciliations('actif')
              onDomiciliationsChange?.()
            } catch (err) {
              setErreur(err instanceof ApiError ? err.message : "Le renouvellement n'a pas pu être enregistré.")
            }
          }}
        />
      )}

      {/* Domiciliations — données réelles de l'entreprise.
          Le bouton d'en-tête est « Renouveler » (et non « + ») : c'est
          l'action normale sur une entreprise qui a déjà une domiciliation.
          Sans aucune période existante, il amorce la toute première. */}
      <CarteBloc
        icon={Building2}
        titre="Domiciliations"
        ouvertParDefaut={false}
        titreAjout="Renouveler Domiciliation"
        iconeAjout={<RefreshCw size={18} />}
        onAjouter={() => (derniereDomiciliation
          ? setRenouvellementFor(derniereDomiciliation)
          : onSansDomiciliation?.())}
        vue={vueDomiciliations}
        onVue={setVueDomiciliations}
      >
        <DataTable
          columns={colonnesDomiciliation}
          rows={domiciliations}
          pageSize={10}
          actionsHeader="ACTION"
          rowActions={(r) => (
            <div className="flex justify-end gap-1.5">
              {/* « Imprimer » propose les documents cochés sur la période. */}
              <MenuImprimer domiciliation={r} signaturePath={signaturePath} />
              <ActionMenu
                label="Actions"
                icon={<IconeActions />}
                items={vueDomiciliations === 'actif'
                  ? [
                      {
                        label: 'Renouveler',
                        icon: <RefreshCw size={15} />,
                        onClick: () => setRenouvellementFor(r),
                      },
                      {
                        label: 'Archiver',
                        icon: <Archive size={15} />,
                        tone: 'warning',
                        separatorBefore: true,
                        onClick: () => executerDomiciliation(() => archiveDomiciliation(r.id)),
                      },
                      {
                        label: 'Supprimer',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        onClick: () => setSuppressionDomi(r),
                      },
                    ]
                  : [
                      {
                        label: 'Restaurer',
                        icon: <RotateCcw size={15} />,
                        onClick: () => executerDomiciliation(() => restoreDomiciliation(r.id)),
                      },
                      {
                        label: 'Supprimer',
                        icon: <Trash2 size={15} />,
                        tone: 'danger',
                        disabled: vueDomiciliations === 'corbeille',
                        onClick: () => setSuppressionDomi(r),
                      },
                    ]}
              />
            </div>
          )}
          emptyText={vueDomiciliations === 'actif'
            ? 'Aucune domiciliation'
            : `Aucune domiciliation dans ${VUES[vueDomiciliations]}`}
        />
      </CarteBloc>

      {/* ---- Modale « Ajouter Document » ----------------------------------- */}
      <Modal
        open={ajoutDocument}
        onClose={() => setAjoutDocument(false)}
        size="xxl"
        title="Ajouter un document"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setAjoutDocument(false)}>Fermer</Button>
            <Button
              disabled={!fichier || enCours}
              onClick={async () => {
                await executer(
                  () => addEntrepriseDocument(entrepriseId, fichier, nomDocument),
                  "Le document n'a pas pu être ajouté."
                )
                setAjoutDocument(false)
                setVueDocuments('actif')
              }}
            >
              Enregistrer
            </Button>
          </>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Fichier" required hint="5 Mo maximum.">
            <FileInput onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Nom affiché" hint="Laissé vide, le nom du fichier est repris.">
            <Input
              placeholder="Nom du document"
              value={nomDocument}
              onChange={(e) => setNomDocument(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* ---- Modale « Ajouter Observation » -------------------------------- */}
      <Modal
        open={ajoutObservation}
        onClose={() => setAjoutObservation(false)}
        size="xxl"
        title="Ajouter une observation"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setAjoutObservation(false)}>Fermer</Button>
            <Button
              disabled={!texteObservation.trim() || enCours}
              onClick={async () => {
                await executer(
                  () => addEntrepriseObservation(entrepriseId, texteObservation.trim(), {
                    privee: observationPrivee,
                    fichiers: fichiersObservation,
                  }),
                  "L'observation n'a pas pu être ajoutée."
                )
                setAjoutObservation(false)
                setVueObservations('actif')
              }}
            >
              Enregistrer
            </Button>
          </>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Observation" required className="lg:col-span-2">
            <Textarea
              rows={8}
              placeholder="Saisissez l'observation…"
              value={texteObservation}
              onChange={(e) => setTexteObservation(e.target.value)}
            />
          </Field>

          <Field
            label="Pièces jointes"
            hint={fichiersObservation.length > 0
              ? `${fichiersObservation.length} fichier(s) sélectionné(s).`
              : '10 fichiers maximum, 5 Mo chacun.'}
          >
            <FileInput multiple onChange={(e) => setFichiersObservation([...e.target.files])} />
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

      <ConfirmDialog
        open={!!suppressionDefinitive}
        title={suppressionDefinitive?.genre === 'document'
          ? 'Supprimer définitivement ce document ?'
          : 'Supprimer définitivement cette observation ?'}
        message="Cette action est irréversible."
        confirmLabel="Supprimer définitivement"
        onCancel={() => setSuppressionDefinitive(null)}
        onConfirm={() => {
          const cible = suppressionDefinitive
          setSuppressionDefinitive(null)
          if (!cible) return
          executer(
            () => (cible.genre === 'document'
              ? deleteEntrepriseDocumentForever(entrepriseId, cible.ligne.id)
              : deleteEntrepriseObservationForever(entrepriseId, cible.ligne.id)),
            "La suppression définitive n'a pas pu être effectuée."
          )
        }}
      />

      <ConfirmDialog
        open={!!suppressionDomi}
        title="Supprimer cette domiciliation ?"
        message="Elle sera placée dans la corbeille."
        confirmLabel="Supprimer"
        onCancel={() => setSuppressionDomi(null)}
        onConfirm={() => {
          const cible = suppressionDomi
          setSuppressionDomi(null)
          executerDomiciliation(() => corbeilleDomiciliation(cible.id))
        }}
      />
    </>
  )
}
