import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Archive, Clock, Download, Eye, FileText, MessageSquare, Paperclip, RefreshCw, Trash2,
} from 'lucide-react'
import { IconeActions } from './ui/icons.jsx'
import Modal from './ui/Modal.jsx'
import FilActivite from './ui/FilActivite.jsx'
import Button from './ui/Button.jsx'
import Alert from './ui/Alert.jsx'
import ActionMenu from './ui/ActionMenu.jsx'
import { useToast } from './ui/Toast.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { RowBtn } from './ListToolbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { API_URL } from '../api/http.js'
import { messageErreurApi } from '../utils/messageErreurApi.js'
import { formatDate, formatHeure, formatDateHeure } from '../utils/format.js'
import { ACCEPT_FICHIER_SERVICE, erreurFichierService } from '../utils/fichiersService.js'
import {
  addOperation, archiveServiceEnCours, corbeilleServiceEnCours, getServiceEnCours,
  remplacerFichierOperation, supprimerFichierOperation,
} from '../api/servicesEnCours.js'

/**
 * Interactions d'une ligne « Services en cours », partagées entre le tableau de bord et le module Services En Cours, pour
 * n'avoir qu'une seule implémentation :
 *
 *   • le BADGE de statut ouvre la liste des statuts réellement disponibles ; le choix est enregistré par l'API ;
 *   • l'ŒIL affiche le fil d'activité du service ;
 *   • le menu voisin propose Fichiers, Commentaires, Archiver et Corbeille ;
 *   • le fil « Activité Services » (ItemActiviteService) est le même partout : statut, auteur réel, date et heure réelles,
 *     fichier du service et fichier du document d'origine.
 *
 * Service en cours = l'élément suivi dans le tableau ; activité = une opération effectuée sur lui (création automatique,
 * changement de statut, commentaire, fichier ajouté).
 */

const ACTIONS = {
  creation: 'Service créé automatiquement',
  statut: 'Statut modifié',
  commentaire: 'Commentaire',
  fichier: 'Fichier ajouté',
}

const urlFichier = (chemin) => `${API_URL}/storage/${chemin}`

function ContenuBadge({ statut, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-semibold ${className}`}
      style={statut
        ? { color: statut.couleurTexte, background: statut.couleurFond }
        : undefined}
    >
      {statut ? statut.nom : 'Sans statut'}
    </span>
  )
}

/**
 * Badge de statut aux couleurs définies dans Paramètres → Services. Un service sans statut le dit clairement
 * (« Sans statut ») au lieu d'un tiret : c'est une anomalie à corriger, pas une valeur normale.
 */
export function BadgeStatutService({ statut, onClick, className = '' }) {
  const contenu = <ContenuBadge statut={statut} className={statut ? className : `bg-surface text-ink-600 ${className}`} />

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
 * « Changer le Statut du Service - <client> » : grille à DEUX COLONNES de grandes cases à cercle, chacune à la couleur de son
 * statut (les statuts réels de Paramètres → Services, sans doublon ni invention), puis « Importer Un Fichier », « Commentaire »
 * et les boutons Fermer / Enregistrer, comme sur la référence.
 *
 * L'enregistrement passe par l'API ; le tableau n'est rafraîchi qu'après la réponse du serveur, avec un message de succès ou
 * l'erreur exacte (droit refusé, fichier refusé…). Le statut actuel est présélectionné ; le fichier est contrôlé (type, 5 Mo)
 * ici puis par le serveur.
 */
export function ModalChangerStatut({ open, row, statuts = [], onClose, onSaved }) {
  const toast = useToast()
  const [choisi, setChoisi] = useState(null)
  const [commentaire, setCommentaire] = useState('')
  const [fichier, setFichier] = useState(null)
  const [erreur, setErreur] = useState('')
  const [erreurFichier, setErreurFichier] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const verrou = useRef(false)

  useEffect(() => {
    if (open) {
      setChoisi(row?.statut?.id ?? null)
      setCommentaire('')
      setFichier(null)
      setErreur('')
      setErreurFichier('')
    }
  }, [open, row])

  const choisirFichier = (e) => {
    const f = e.target.files?.[0] ?? null
    setFichier(f)
    setErreurFichier(f ? erreurFichierService(f) : '')
  }

  const enregistrer = async () => {
    if (verrou.current) return
    const texte = commentaire.trim()

    if (fichier) {
      const probleme = erreurFichierService(fichier)
      if (probleme) { setErreurFichier(probleme); return }
    }
    if (!choisi && !texte && !fichier) {
      setErreur('Sélectionnez un statut.')
      return
    }
    if (choisi === row?.statut?.id && !texte && !fichier) {
      setErreur('Ce statut est déjà celui du service : choisissez-en un autre, ou ajoutez un commentaire ou un fichier.')
      return
    }

    verrou.current = true
    setEnvoi(true)
    setErreur('')
    try {
      await addOperation(row.id, { serviceStatusId: choisi, commentaire: texte, fichier })
      const change = choisi && choisi !== row?.statut?.id
      toast.success(change ? `Statut « ${statuts.find((s) => s.id === choisi)?.nom ?? ''} » enregistré.` : 'Enregistré.')
      onSaved?.()
      onClose?.()
    } catch (err) {
      setErreur(messageErreurApi(err, "Le statut n'a pas pu être enregistré. Réessayez."))
    } finally {
      verrou.current = false
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
          Aucun statut n'est disponible. Les statuts se définissent dans Paramètre &gt; Services.
        </Alert>
      ) : (
        <div className="grid max-h-[46vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {statuts.map((s) => {
            const actif = choisi === s.id
            return (
              <label
                key={s.id}
                className={`flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all ${
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
                <span className="font-medium leading-tight">{s.nom}</span>
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
          accept={ACCEPT_FICHIER_SERVICE}
          onChange={choisirFichier}
          className="w-full rounded-lg border border-line bg-white p-2.5 text-sm text-ink-800 file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink-800"
        />
        {erreurFichier && <p className="mt-1 text-xs text-danger-600">{erreurFichier}</p>}
      </div>

      <div className="mt-4">
        <label htmlFor="op-commentaire" className="mb-1.5 block text-sm font-medium text-ink-800">
          Commentaire
        </label>
        <textarea
          id="op-commentaire"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          maxLength={2000}
          className="min-h-[110px] w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </div>
    </Modal>
  )
}

/**
 * Statut cliquable d'une ligne : le badge ouvre « Changer le Statut du Service » (ModalChangerStatut). Sans le droit
 * `services_en_cours.modifier`, le statut s'affiche sans pouvoir être modifié.
 */
export function StatutServiceBadge({ row, statuts = [], onChanged }) {
  const { hasPermission } = useAuth()
  const [ouvert, setOuvert] = useState(false)

  if (!hasPermission('services_en_cours', 'modifier')) return <BadgeStatutService statut={row.statut} />

  return (
    <>
      <BadgeStatutService statut={row.statut} onClick={() => setOuvert(true)} />
      <ModalChangerStatut open={ouvert} row={row} statuts={statuts} onClose={() => setOuvert(false)} onSaved={onChanged} />
    </>
  )
}


/**
 * Une activité du fil « Activité Services » : statut (et ancien statut quand il a changé), « Par <utilisateur réel> », date et
 * heure réelles, commentaire, fichier ajouté au service, et fichier du document d'origine (distingué, jamais mélangé).
 * Les informations viennent de la base ; une valeur absente est omise, jamais inventée.
 */
export function ItemActiviteService({ a, dernier = false }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-info-500" />
        {!dernier && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <BadgeStatutService statut={a.statut} />
            <span className="text-sm text-ink-700">Par</span>
          </div>
          <div className="flex shrink-0 items-start gap-1.5 text-xs text-ink-600">
            <Clock size={13} className="mt-0.5 shrink-0" />
            <span className="tabular text-right leading-tight">
              {formatDate(a.createdAt)}
              <br />
              {formatHeure(a.createdAt)}
            </span>
          </div>
        </div>

        <div className="mt-0.5 text-sm font-semibold text-ink-900">{a.par || '—'}</div>

        {(ACTIONS[a.action] || a.ancienStatut) && (
          <div className="mt-0.5 text-xs text-ink-600">
            {ACTIONS[a.action]}
            {a.ancienStatut && ` (ancien statut : ${a.ancienStatut.nom})`}
          </div>
        )}
        {(a.service || a.client) && (
          <div className="text-xs text-ink-600">{[a.service, a.client].filter(Boolean).join(' — ')}</div>
        )}

        {a.commentaire && <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-800">{a.commentaire}</p>}

        {a.fichierChemin && (
          <a
            href={urlFichier(a.fichierChemin)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center gap-1.5 break-all text-sm text-ink-800 hover:text-brand-500 hover:underline"
          >
            <Download size={14} className="shrink-0" /> {a.fichierNom}
          </a>
        )}
        {a.fichierSource && (
          <a
            href={urlFichier(a.fichierSource.chemin)}
            target="_blank"
            rel="noreferrer"
            title="Pièce jointe du document d'origine"
            className="mt-2 flex items-center gap-1.5 break-all text-sm text-ink-800 hover:text-brand-500 hover:underline"
          >
            <FileText size={14} className="shrink-0" /> {a.fichierSource.nom}
            <span className="shrink-0 text-xs text-ink-600">(document d'origine)</span>
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Fichiers et commentaires d'un service en cours.
 *
 *   • Commentaire : texte libre ajouté au fil, avec son auteur, sa date et son heure ; les anciens sont conservés.
 *   • Fichier : joint au SERVICE (formats et taille contrôlés ici puis par le serveur) ; il peut être ouvert, remplacé ou
 *     supprimé. Les pièces jointes du DOCUMENT D'ORIGINE (ex. paiement) sont listées à part, en lecture seule : on ne les
 *     modifie ni ne les supprime d'ici.
 *
 * Sans le droit `services_en_cours.modifier`, tout est consultable mais rien ne peut être ajouté, remplacé ou supprimé.
 */
export function ModalSuiviService({ open, row, mode = 'commentaire', onClose, onChanged }) {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const peutModifier = hasPermission('services_en_cours', 'modifier')

  const [detail, setDetail] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [fichier, setFichier] = useState(null)
  const [erreurFichier, setErreurFichier] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(null)
  const champFichier = useRef(null)
  const verrou = useRef(false)
  const modifie = useRef(false)

  const recharger = useCallback(() => {
    if (!row) return Promise.resolve()
    return getServiceEnCours(row.id).then(setDetail)
  }, [row])

  // Chargement de la fiche : l'erreur reste affichée avec « Réessayer » (comme sur les pages), jamais effacée seule.
  const charger = useCallback(() => {
    setErreurChargement(''); setChargement(true)
    recharger().catch(() => setErreurChargement('Impossible de charger ce service.')).finally(() => setChargement(false))
  }, [recharger])

  useEffect(() => {
    if (!open || !row) return
    setCommentaire(''); setFichier(null); setErreurFichier(''); setErreur(''); setDetail(null)
    modifie.current = false
    charger()
  }, [open, row, charger])

  // Une seule opération à la fois (double clic) ; le serveur répond avant que l'écran ne change.
  const executer = async (action, messageSucces) => {
    if (verrou.current) return false
    verrou.current = true
    setEnvoi(true)
    setErreur('')
    try {
      const maj = await action()
      if (maj) setDetail(maj)
      toast.success(messageSucces)
      modifie.current = true // le tableau est rechargé à la FERMETURE : le recharger ici démonterait cette fenêtre
      return true
    } catch (err) {
      setErreur(messageErreurApi(err, "L'action n'a pas pu être effectuée. Réessayez."))
      return false
    } finally {
      verrou.current = false
      setEnvoi(false)
    }
  }

  const ajouterCommentaire = async () => {
    const texte = commentaire.trim()
    if (!texte) return
    if (await executer(() => addOperation(row.id, { commentaire: texte }), 'Commentaire ajouté.')) setCommentaire('')
  }

  const choisirFichier = (e) => {
    const f = e.target.files?.[0] ?? null
    setFichier(f)
    setErreurFichier(f ? erreurFichierService(f) : '')
  }

  const joindreFichier = async () => {
    const probleme = erreurFichierService(fichier)
    if (probleme) { setErreurFichier(probleme); return }
    const reussi = await executer(() => addOperation(row.id, { fichier }), 'Fichier ajouté.')
    if (reussi) {
      setFichier(null)
      if (champFichier.current) champFichier.current.value = ''
    }
  }

  const remplacer = async (operation, f) => {
    const probleme = erreurFichierService(f)
    if (probleme) { setErreur(probleme); return }
    await executer(() => remplacerFichierOperation(row.id, operation.id, f), 'Fichier remplacé.')
  }

  // Fermeture : si quelque chose a changé, le tableau est rechargé (statut, dernière opération).
  const fermer = () => {
    onClose?.()
    if (modifie.current) onChanged?.()
  }

  const operations = detail?.operations ?? []
  const fichiersService = operations.filter((o) => o.fichierChemin)
  const fichiersOrigine = operations.filter((o) => o.fichierSource)
  const commentaires = operations.filter((o) => o.commentaire)

  const blocCommentaire = peutModifier && (
    <section aria-label="Ajouter un commentaire" className={mode === 'commentaire' ? 'order-first' : ''}>
      <h3 className="mb-1.5 text-sm font-semibold text-ink-900">Ajouter un commentaire</h3>
      <textarea
        id="suivi-commentaire"
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        maxLength={2000}
        placeholder="Votre commentaire…"
        autoFocus={mode === 'commentaire'}
        className="min-h-[90px] w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
      <div className="mt-2 flex justify-end">
        <Button onClick={ajouterCommentaire} loading={envoi} disabled={!commentaire.trim()} icon={<MessageSquare size={15} />}>
          Ajouter le commentaire
        </Button>
      </div>
    </section>
  )

  const blocFichier = peutModifier && (
    <section aria-label="Ajouter un fichier">
      <h3 className="mb-1.5 text-sm font-semibold text-ink-900">Ajouter un fichier</h3>
      <input
        ref={champFichier}
        id="suivi-fichier"
        type="file"
        accept={ACCEPT_FICHIER_SERVICE}
        onChange={choisirFichier}
        className="w-full rounded-lg border border-line bg-white p-2.5 text-sm text-ink-800 file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink-800"
      />
      <p className="mt-1 text-xs text-ink-600">5 Mo maximum. PDF, images, Word, Excel, PowerPoint, texte.</p>
      {erreurFichier && <p className="mt-1 text-xs text-danger-600">{erreurFichier}</p>}
      <div className="mt-2 flex justify-end">
        <Button onClick={joindreFichier} loading={envoi} disabled={!fichier || !!erreurFichier} icon={<Paperclip size={15} />}>
          Joindre le fichier
        </Button>
      </div>
    </section>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={fermer}
        size="lg"
        title={`Fichiers et commentaires — ${row?.service ?? 'Service'}`}
        description={row?.client}
        footer={<Button variant="secondary" onClick={fermer}>Fermer</Button>}
      >
        {erreur && <Alert tone="danger" onAutoClose={() => setErreur('')} className="mb-4">{erreur}</Alert>}
        {erreurChargement && <Alert tone="danger" className="mb-4" onRetry={charger}>{erreurChargement}</Alert>}

        {chargement ? (
          <p className="text-sm text-ink-600">Chargement…</p>
        ) : erreurChargement ? null : (
          <div className="flex flex-col gap-6">
            {mode === 'fichier' ? <>{blocFichier}{blocCommentaire}</> : <>{blocCommentaire}{blocFichier}</>}

            <section aria-label="Fichiers du service">
              <h3 className="mb-1.5 text-sm font-semibold text-ink-900">Fichiers du service ({fichiersService.length})</h3>
              {fichiersService.length === 0 ? (
                <p className="text-sm text-ink-600">Aucun fichier ajouté à ce service.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {fichiersService.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <a
                          href={urlFichier(o.fichierChemin)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 break-all text-sm font-medium text-ink-900 hover:text-brand-500 hover:underline"
                        >
                          <Download size={14} className="shrink-0" /> {o.fichierNom}
                        </a>
                        <div className="text-xs text-ink-600">{o.par || '—'} · {formatDateHeure(o.createdAt)}</div>
                      </div>
                      {peutModifier && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <label
                            title="Remplacer ce fichier"
                            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-800 hover:bg-surface"
                          >
                            <RefreshCw size={13} /> Remplacer
                            <input
                              type="file"
                              accept={ACCEPT_FICHIER_SERVICE}
                              className="sr-only"
                              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) remplacer(o, f) }}
                            />
                          </label>
                          <RowBtn title="Supprimer ce fichier" className="hover:text-danger-600" onClick={() => setSuppression(o)}>
                            <Trash2 size={14} />
                          </RowBtn>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {fichiersOrigine.length > 0 && (
              <section aria-label="Fichiers du document d'origine">
                <h3 className="mb-1.5 text-sm font-semibold text-ink-900">Document d'origine</h3>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {fichiersOrigine.map((o) => (
                    <li key={o.id} className="px-3 py-2.5">
                      <a
                        href={urlFichier(o.fichierSource.chemin)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 break-all text-sm font-medium text-ink-900 hover:text-brand-500 hover:underline"
                      >
                        <FileText size={14} className="shrink-0" /> {o.fichierSource.nom}
                      </a>
                      <div className="text-xs text-ink-600">Pièce jointe du document d'origine : modifiable depuis ce document uniquement.</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Commentaires">
              <h3 className="mb-1.5 text-sm font-semibold text-ink-900">Commentaires ({commentaires.length})</h3>
              {commentaires.length === 0 ? (
                <p className="text-sm text-ink-600">Aucun commentaire.</p>
              ) : (
                <ul className="space-y-3">
                  {commentaires.map((o) => (
                    <li key={o.id} className="rounded-lg bg-surface px-3.5 py-2.5">
                      <p className="whitespace-pre-line break-words text-sm text-ink-900">{o.commentaire}</p>
                      <div className="mt-1 text-xs text-ink-600">{o.par || '—'} · {formatDateHeure(o.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!suppression}
        title="Supprimer ce fichier ?"
        message={`Le fichier « ${suppression?.fichierNom ?? ''} » sera supprimé de ce service. La pièce jointe du document d'origine n'est pas concernée.`}
        confirmLabel="Supprimer"
        loading={envoi}
        onCancel={() => setSuppression(null)}
        onConfirm={async () => {
          const cible = suppression
          setSuppression(null)
          await executer(() => supprimerFichierOperation(row.id, cible.id), 'Fichier supprimé.')
        }}
      />
    </>
  )
}

/**
 * Détail d'un service : reprend la présentation du fil « Activité Services » (ItemActiviteService).
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
        <FilActivite className="space-y-5">
          {operations.map((o, i) => <ItemActiviteService key={o.id} a={o} dernier={i === operations.length - 1} />)}
        </FilActivite>
      )}
    </Modal>
  )
}

/**
 * Les icônes de la colonne ACTIONS : l'œil (fil d'activité du service) et le menu Fichiers / Commentaires / Archiver /
 * Corbeille. La suppression demande confirmation.
 *
 * ⚠️ « Supprimer » place dans la CORBEILLE : dans ce projet la suppression
 * définitive n'est possible que depuis la corbeille (règle métier existante).
 */
export default function ServiceEnCoursRowActions({ row, onChanged, onAfficher }) {
  const { hasPermission } = useAuth()
  const [detailOuvert, setDetailOuvert] = useState(false)
  const [suivi, setSuivi] = useState(null) // 'fichier' | 'commentaire'
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
          icon={<IconeActions />}
          items={[
            {
              label: 'Fichiers',
              icon: <Paperclip size={15} />,
              onClick: () => setSuivi('fichier'),
            },
            {
              label: 'Commentaires',
              icon: <MessageSquare size={15} />,
              onClick: () => setSuivi('commentaire'),
            },
            hasPermission('services_en_cours', 'archive') && {
              label: 'Archiver',
              tone: 'warning',
              icon: <Archive size={15} />,
              separatorBefore: true,
              onClick: () => executer(() => archiveServiceEnCours(row.id)),
            },
            hasPermission('services_en_cours', 'corbeille') && {
              label: 'Corbeille',
              tone: 'danger',
              icon: <Trash2 size={15} />,
              onClick: () => setConfirmation(row),
            },
          ]}
        />
      </div>

      <ModalDetailService open={detailOuvert} row={row} onClose={() => setDetailOuvert(false)} />
      <ModalSuiviService open={!!suivi} row={row} mode={suivi ?? 'commentaire'} onClose={() => setSuivi(null)} onChanged={onChanged} />

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
