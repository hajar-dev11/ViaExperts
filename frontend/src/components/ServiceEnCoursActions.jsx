import { useEffect, useState } from 'react'
import { Archive, Clock, Download, Eye, ListTree, Trash2 } from 'lucide-react'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import Alert from './ui/Alert.jsx'
import ActionMenu from './ui/ActionMenu.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { RowBtn } from './ListToolbar.jsx'
import { API_URL } from '../api/http.js'
import { formatDate, formatHeure, formatDateHeure } from '../utils/format.js'
import {
  addOperation, archiveServiceEnCours, corbeilleServiceEnCours, getServiceEnCours,
} from '../api/servicesEnCours.js'

/**
 * Interactions d'une ligne « Services en cours », partagées entre le tableau
 * de bord et le module Services En Cours, pour n'avoir qu'une seule
 * implémentation :
 *
 *   • le BADGE de statut est cliquable → « Changer le Statut du Service » ;
 *   • l'ŒIL ouvre le détail : statut, auteur, fichier, date et heure ;
 *   • l'icône voisine ouvre Archiver / Supprimer, avec confirmation avant
 *     suppression.
 *
 * Tout passe par les endpoints existants : aucune route ni logique backend
 * n'a été ajoutée.
 */

/** Badge de statut aux couleurs définies dans Paramètres → Services. */
export function BadgeStatutService({ statut, onClick, className = '' }) {
  if (!statut) return <span className="text-xs text-ink-600">—</span>

  const contenu = (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-semibold ${className}`}
      style={{ color: statut.couleurTexte, background: statut.couleurFond }}
    >
      {statut.nom}
    </span>
  )

  if (!onClick) return contenu

  return (
    <button
      type="button"
      onClick={onClick}
      title="Changer le statut du service"
      className="rounded-md transition-opacity hover:opacity-80 focus-ring"
    >
      {contenu}
    </button>
  )
}

/**
 * « Changer le Statut du Service — <client> »
 * Grille à DEUX COLONNES de grandes cases à cercle, chacune à la couleur de son
 * statut, puis import d'un fichier, commentaire, et les boutons Fermer /
 * Enregistrer, comme sur les captures.
 */
export function ModalChangerStatut({ open, row, statuts = [], onClose, onSaved }) {
  const [choisi, setChoisi] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [fichier, setFichier] = useState(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (open) {
      setChoisi(row?.statut?.id ?? null)
      setCommentaire('')
      setFichier(null)
      setErreur('')
    }
  }, [open, row])

  const enregistrer = async () => {
    if (!choisi) {
      setErreur('Sélectionnez un statut.')
      return
    }
    setEnvoi(true)
    setErreur('')
    try {
      await addOperation(row.id, { serviceStatusId: choisi, commentaire, fichier })
      onSaved?.()
      onClose?.()
    } catch {
      setErreur("Le statut n'a pas pu être enregistré. Réessayez.")
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Changer le Statut du Service${row?.client ? ` - ${row.client}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button onClick={enregistrer} loading={envoi}>Enregistrer</Button>
        </>
      }
    >
      {erreur && <Alert tone="danger" onAutoClose={() => setErreur('')} className="mb-4">{erreur}</Alert>}

      {statuts.length === 0 ? (
        <Alert tone="warning">
          Aucun statut n'est disponible. Les statuts se définissent dans
          Paramètre &gt; Services (réservé à l'administrateur).
        </Alert>
      ) : (
        <div className="grid max-h-[46vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
          {statuts.map((s) => {
            const actif = choisi === s.id
            return (
              <label
                key={s.id}
                className={`flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-center text-sm transition-all ${
                  actif ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:opacity-85'
                }`}
                style={{ background: s.couleur_fond, color: s.couleur_texte }}
              >
                <input
                  type="radio"
                  name="statut-service"
                  checked={actif}
                  onChange={() => setChoisi(s.id)}
                  className="h-4 w-4 shrink-0 border-current text-brand-500 focus:ring-brand-500/40"
                />
                <span className="line-clamp-2 font-medium leading-tight">{s.nom}</span>
              </label>
            )
          })}
        </div>
      )}

      <div className="mt-5">
        <label htmlFor="op-fichier" className="mb-1.5 block text-sm font-medium text-ink-800">
          Importer Un Fichier
        </label>
        <input
          id="op-fichier"
          type="file"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-line bg-white p-2.5 text-sm text-ink-800 file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink-800"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="op-commentaire" className="mb-1.5 block text-sm font-medium text-ink-800">
          Commentaire
        </label>
        <textarea
          id="op-commentaire"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          className="min-h-[110px] w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </div>
    </Modal>
  )
}

/**
 * Détail d'un service : reprend la présentation du fil « Activité Services »
 * — statut, « Par <auteur> », fichier joint, date et heure.
 */
export function ModalDetailService({ open, row, onClose }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!open || !row) return
    // La ligne du tableau ne porte pas toujours ses opérations : on recharge
    // la fiche complète pour afficher le fil réel.
    setDetail(row)
    getServiceEnCours(row.id).then(setDetail).catch(() => {})
  }, [open, row])

  const operations = detail?.operations ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={detail?.service || 'Service'}
      description={detail?.client}
      footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}
    >
      <div className="mb-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="mb-1 text-xs text-ink-600">Statut</div>
          <BadgeStatutService statut={detail?.statut} />
        </div>
        <div>
          <div className="mb-1 text-xs text-ink-600">Départ</div>
          <div className="tabular text-ink-900">{formatDateHeure(detail?.dateDepart)}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-ink-600">Dernière opération</div>
          <div className="tabular text-ink-900">{formatDateHeure(detail?.derniereOperation) || '—'}</div>
        </div>
      </div>

      <div className="mb-2 text-sm font-semibold text-ink-900">Activité Services</div>

      {operations.length === 0 ? (
        <p className="text-sm text-ink-600">Aucune opération enregistrée.</p>
      ) : (
        <div className="space-y-5">
          {operations.map((o, i) => (
            <div key={o.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-info-500" />
                {i < operations.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <BadgeStatutService statut={o.statut} />
                    <span className="text-sm text-ink-700">Par</span>
                  </div>
                  <div className="flex shrink-0 items-start gap-1.5 text-xs text-ink-600">
                    <Clock size={13} className="mt-0.5 shrink-0" />
                    <span className="tabular text-right leading-tight">
                      {formatDate(o.createdAt)}<br />{formatHeure(o.createdAt)}
                    </span>
                  </div>
                </div>

                {/* L'auteur réel (membre de l'équipe) n'est jamais montré ici :
                    la fiche affiche le cabinet, pas la personne. */}
                <div className="mt-0.5 text-sm font-semibold text-ink-900">Via Experts</div>

                {o.commentaire && <p className="mt-1 text-sm text-ink-800">{o.commentaire}</p>}

                {o.fichierChemin && (
                  <a
                    href={`${API_URL}/storage/${o.fichierChemin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 break-all text-sm text-ink-800 hover:text-brand-500 hover:underline"
                  >
                    <Download size={14} className="shrink-0" /> {o.fichierNom}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/**
 * Les deux icônes de la colonne ACTIONS : l'œil (détail) et le menu
 * Archiver / Supprimer. La suppression demande confirmation.
 *
 * ⚠️ « Supprimer » place dans la CORBEILLE : dans ce projet la suppression
 * définitive n'est possible que depuis la corbeille (règle métier existante).
 */
export default function ServiceEnCoursRowActions({ row, onChanged, onAfficher }) {
  const [detailOuvert, setDetailOuvert] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const executer = async (action) => {
    setEnCours(true)
    try {
      await action()
      onChanged?.()
    } catch {
      /* l'écran appelant affiche déjà ses propres erreurs */
    } finally {
      setEnCours(false)
      setConfirmation(null)
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        <RowBtn title="Afficher" onClick={() => (onAfficher ? onAfficher(row) : setDetailOuvert(true))}>
          <Eye size={16} />
        </RowBtn>

        <ActionMenu
          label="Actions"
          icon={<ListTree size={16} />}
          items={[
            {
              label: 'Archiver',
              tone: 'warning',
              icon: <Archive size={15} />,
              onClick: () => executer(() => archiveServiceEnCours(row.id)),
            },
            {
              label: 'Corbeille',
              tone: 'danger',
              icon: <Trash2 size={15} />,
              onClick: () => setConfirmation(row),
            },
          ]}
        />
      </div>

      <ModalDetailService open={detailOuvert} row={row} onClose={() => setDetailOuvert(false)} />

      <ConfirmDialog
        open={!!confirmation}
        title="Supprimer ce service ?"
        message={`Voulez-vous vraiment supprimer le service « ${row.service ?? ''} » de ${row.client ?? ''} ? Il sera placé dans la corbeille.`}
        confirmLabel="Supprimer"
        loading={enCours}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => executer(() => corbeilleServiceEnCours(row.id))}
      />
    </>
  )
}
