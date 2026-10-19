import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArrowLeft, Building2, CalendarClock, Coins, CreditCard, FileText,
  Folder, IdCard, ListTree, Lock, Mail, Paperclip, RefreshCw, RotateCcw, ScanLine,
  Trash2, Wallet,
} from 'lucide-react'
import { IconeActions, IconeModifier } from '../../../components/ui/icons.jsx'
import Button, { IconButton } from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { SkeletonText } from '../../../components/ui/Skeleton.jsx'
import ConfirmDialog from '../../../components/ConfirmDialog.jsx'
import DataTable from '../../../components/DataTable.jsx'
import CarteBloc, { VUES_BLOC as VUES } from '../../../components/CarteBloc.jsx'
import StatutDomiciliation from '../components/StatutDomiciliation.jsx'
import { Ligne, Section } from '../../../components/FicheInfos.jsx'
import { Field, FileInput, Textarea } from '../../../components/Field.jsx'
import { FormulaireRenouvellement, JournalOperations, MenuImprimer } from '../components/DomiciliationActions.jsx'
import { DOCUMENTS_DOMICILIATION, chargerSignatureDomiciliation } from '../documents/documentsDomiciliation.js'
import { getIdentiteDomiciliation } from '../../../api/settings.js'
import {
  getDomiciliation, listDomiciliations, archiveDomiciliation, corbeilleDomiciliation, restoreDomiciliation,
  renouvelerDomiciliation,
  addObservation, addDocument, deleteDocument, deleteObservation,
  archiveDocument, corbeilleDocument, restoreDocument,
  archiveObservation, corbeilleObservation, restoreObservation,
  observationFichierUrl,
} from '../api/domiciliations.js'
import { API_URL } from '../../../api/http.js'
import { ApiError } from '../../../api/http.js'
import { formatDate, formatDateHeure } from '../../../utils/format.js'
import { formaterMontant } from '../../../utils/montants.js'

/** Poids d'un fichier en unité lisible. */
function formatTaille(octets) {
  if (!octets && octets !== 0) return '—'
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

/**
 * « Informations Domiciliation » — même gabarit que « Informations Entreprise »
 * (EntrepriseDetails.jsx) : fiche verticale à gauche (Modifier / Archive /
 * Corbeille), Documents / Observations / journal des actions à droite.
 */
export default function DomiciliationDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const toast = useToast()

  const [d, setD] = useState(null)
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)

  // { id, data } de la période à renouveler — la fiche courante pour le
  // bouton d'en-tête, ou une période de l'historique pour son bouton dédié.
  const [renouvellementCible, setRenouvellementCible] = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmCorbeille, setConfirmCorbeille] = useState(false)

  const [ajoutDocument, setAjoutDocument] = useState(false)
  const [documentNom, setDocumentNom] = useState('')
  const [documentFichier, setDocumentFichier] = useState(null)
  const [ajoutObservation, setAjoutObservation] = useState(false)
  const [texteObservation, setTexteObservation] = useState('')
  const [observationPrivee, setObservationPrivee] = useState(false)
  const [observationFichier, setObservationFichier] = useState(null)
  const [suppressionDocument, setSuppressionDocument] = useState(null)
  const [suppressionObservation, setSuppressionObservation] = useState(null)

  // Vue courante de chaque bloc : actif / archive / corbeille — même principe
  // que les blocs « Informations Entreprise » (BlocsEntreprise.jsx).
  const [vueDocuments, setVueDocuments] = useState('actif')
  const [vueObservations, setVueObservations] = useState('actif')
  const [vueHistorique, setVueHistorique] = useState('actif')

  // Historique complet des périodes de la même entreprise (tableau « Domiciliation »).
  const [historique, setHistorique] = useState([])
  const [confirmHistorique, setConfirmHistorique] = useState(null)

  const rechargerHistorique = useCallback(() => {
    if (!d?.entrepriseId) return
    listDomiciliations({ status: vueHistorique, entrepriseId: d.entrepriseId }).then(setHistorique).catch(() => {})
  }, [d?.entrepriseId, vueHistorique])

  const charger = useCallback(() => {
    setChargement(true)
    getDomiciliation(id)
      .then(setD)
      .catch(() => setErreur('Impossible de charger cette domiciliation.'))
      .finally(() => setChargement(false))
  }, [id])

  useEffect(charger, [charger])

  useEffect(rechargerHistorique, [rechargerHistorique])

  // Cachet des documents imprimés (menu « Imprimer » des documents du dossier).
  const [signaturePath, setSignaturePath] = useState(null)
  useEffect(() => { chargerSignatureDomiciliation(getIdentiteDomiciliation).then(setSignaturePath) }, [])

  const executer = async (action, message, messageErreur) => {
    setErreur('')
    try {
      await action()
      toast.success(message)
      charger()
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : messageErreur)
    }
  }

  const fermerAjoutObservation = () => {
    setAjoutObservation(false); setTexteObservation(''); setObservationPrivee(false); setObservationFichier(null)
  }
  const fermerAjoutDocument = () => {
    setAjoutDocument(false); setDocumentNom(''); setDocumentFichier(null)
  }

  const soumettreObservation = async () => {
    if (!texteObservation.trim()) return
    setAjoutObservation(false)
    await executer(
      () => addObservation(id, texteObservation, { privee: observationPrivee, fichier: observationFichier }),
      'Observation ajoutée.',
      "L'observation n'a pas pu être ajoutée."
    )
    setTexteObservation(''); setObservationPrivee(false); setObservationFichier(null)
  }

  const soumettreDocument = async () => {
    if (!documentFichier) return
    setAjoutDocument(false)
    await executer(() => addDocument(id, documentFichier, documentNom.trim()), 'Document ajouté.', "Le document n'a pas pu être ajouté.")
    setDocumentNom(''); setDocumentFichier(null)
  }

  if (chargement) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <SkeletonText lines={12} />
      </div>
    )
  }

  if (!d) {
    return <Alert tone="danger">{erreur || 'Domiciliation introuvable.'}</Alert>
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
      <Button
        variant="secondary"
        className="col-span-full -mb-2 w-fit"
        icon={<ArrowLeft size={15} />}
        onClick={() => navigate('/domiciliation')}
      >
        Retour à la Gestion Domiciliation
      </Button>

      {/* ---- Colonne gauche : fiche de la domiciliation --------------------- */}
      <div className="rounded-xl bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Building2 size={22} className="mt-1 shrink-0 text-ink-700" />
            <h1 className="text-xl leading-snug text-ink-900">Informations<br />Domiciliation</h1>
          </div>
          <StatutDomiciliation statut={d.statutAffichage} />
        </div>

        {/* Pendant qu'une fenêtre d'action est ouverte, l'erreur s'affiche DANS la fenêtre (pas deux fois). */}
        {!renouvellementCible && erreur && <Alert tone="danger" onAutoClose={() => setErreur('')} className="mt-4" onClose={() => setErreur('')}>{erreur}</Alert>}

        <Section>À propos</Section>
        <Ligne icon={FileText} label="Denomination" value={d.denomination} />
        <Ligne icon={Building2} label="Centre de Domiciliation" value={d.centre} />
        <Ligne icon={Archive} label="N° Archive" value={d.numeroArchive} />
        <Ligne icon={ScanLine} label="I.C.E" value={d.ice} />
        <Ligne icon={IdCard} label="Identifiant Fiscal" value={d.if} />
        <Ligne icon={Mail} label="Email" value={d.email} />

        <Section>Période</Section>
        <Ligne icon={CalendarClock} label="Date de Depart" value={formatDate(d.dateDepart)} />
        <Ligne icon={CalendarClock} label="Date de Fin" value={formatDate(d.dateFin)} />
        <Ligne icon={CalendarClock} label="Mois Payée" value={d.moisPayee != null ? `${d.moisPayee} Mois` : null} />
        <Ligne icon={CalendarClock} label="Mois Gratuits" value={d.moisGratuits != null ? `${d.moisGratuits} Mois` : null} />
        <Ligne icon={CalendarClock} label="Date Galisation" value={formatDate(d.dateLegalisation)} />

        <Section>Facturation</Section>
        <Ligne icon={CreditCard} label="Mode de Paiement" value={d.modePaiement} />
        <Ligne icon={Wallet} label="Prix Par Mois (Dh HT)" value={d.prixParMois != null ? formaterMontant(d.prixParMois) : null} />
        <Ligne icon={Coins} label="Prix Total (Dh HT)" value={d.prixTotal != null ? formaterMontant(d.prixTotal) : null} />
        <Ligne icon={CalendarClock} label="Date Facture" value={formatDate(d.dateFacture)} />
        <Ligne icon={CalendarClock} label="Date Paiement" value={formatDate(d.datePaiement)} />

        {/* Les cases « Documents du dossier » cochées à l'enregistrement de CETTE domiciliation. */}
        <Section>Documents du dossier</Section>
        {DOCUMENTS_DOMICILIATION.map((doc) => (
          <Ligne key={doc.cle} icon={FileText} label={doc.label} value={d[doc.drapeau] ? 'Inclus au dossier' : 'Non inclus'} />
        ))}
        <div className="mt-2 flex items-center gap-2 text-sm text-ink-800">
          <MenuImprimer domiciliation={d} signaturePath={signaturePath} />
          <span>Imprimer les documents inclus</span>
        </div>

        <Section>Détail de création</Section>
        <Ligne icon={CalendarClock} label="Créé Le" value={formatDateHeure(d.createdAt)} />
        <Ligne icon={IdCard} label="Créé par" value={d.createdBy} />
        <Ligne icon={RefreshCw} label="Type de période" value={d.renouvelleDeId ? 'Renouvellement' : 'Première période'} />

        {/* Trois actions seulement. Archiver et Corbeille demandent une confirmation (voir plus bas). Renouveler reste dans le
            tableau des périodes ; Activer, Déclarer et Résilier restent dans le menu d'actions de « Gestion Domiciliation ». */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button variant="secondary" icon={<IconeModifier size={15} />} onClick={() => navigate(`/domiciliation/${id}/modifier`)}>
            Modifier
          </Button>
          {d.status === 'actif' && (
            <>
              <Button variant="warning" icon={<Archive size={15} />} onClick={() => setConfirmArchive(true)}>
                Archiver
              </Button>
              <Button variant="dark" icon={<Trash2 size={15} />} onClick={() => setConfirmCorbeille(true)}>
                Corbeille
              </Button>
            </>
          )}
          {/* Une domiciliation archivée ou à la corbeille se restaure (comportement existant). */}
          {d.status !== 'actif' && (
            <Button
              variant="success"
              icon={<RotateCcw size={15} />}
              onClick={() => executer(() => restoreDomiciliation(id), 'Domiciliation restaurée.', "La restauration n'a pas pu être effectuée.")}
            >
              Restaurer
            </Button>
          )}
        </div>      </div>

      {/* ---- Colonne droite -------------------------------------------------- */}
      <div className="space-y-6 xl:col-span-2">
        <div className="overflow-hidden rounded-xl bg-white shadow-card p-6">
          <h2 className="mb-3 text-xl text-ink-900">Actions ({d.operations?.length || 0})</h2>
          <JournalOperations
            operations={d.operations ?? []}
            urlFichier={(operationId) => `${API_URL}/api/v1/domiciliations/${id}/operations/${operationId}/download`}
          />
        </div>

        <CarteBloc
          icon={Folder}
          titre="Documents"
          ouvertParDefaut={false}
          onAjouter={() => setAjoutDocument(true)}
          vue={vueDocuments}
          onVue={setVueDocuments}
        >
          <DataTable
            columns={[
              { key: 'nom', header: 'Nom Document', clamp: 2 },
              { key: 'taille', header: 'Taille', render: (r) => formatTaille(r.taille) },
              { key: 'createdAt', header: "Date d'ajout", render: (r) => formatDateHeure(r.createdAt) },
              { key: 'ajoutePar', header: 'Ajouté par', value: (r) => r.ajoutePar || '—' },
            ]}
            rows={(d.documents ?? []).filter((r) => (r.status ?? 'actif') === vueDocuments)}
            pageSize={10}
            pageSizeOptions={[10, 25, 50]}
            actionsHeader="ACTION"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                <a
                  href={`${API_URL}/storage/${r.chemin}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Télécharger"
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-surface hover:text-brand-600 focus-ring"
                >
                  <FileText size={15} />
                </a>
                <ActionMenu
                  label="Actions"
                  icon={<IconeActions />}
                  items={vueDocuments === 'actif' ? [
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      onClick: () => setConfirmHistorique({
                        title: 'Archiver ce document ?',
                        message: `« ${r.nom} » sera déplacé dans les archives.`,
                        confirmLabel: 'Archiver',
                        run: () => executer(() => archiveDocument(id, r.id), 'Document archivé.', "L'archivage n'a pas pu être effectué.").then(charger),
                      }),
                    },
                    {
                      label: 'Supprimer',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirmHistorique({
                        title: 'Mettre ce document à la corbeille ?',
                        message: `« ${r.nom} » sera déplacé dans la corbeille.`,
                        confirmLabel: 'Corbeille',
                        run: () => executer(() => corbeilleDocument(id, r.id), 'Document placé dans la corbeille.', "L'action n'a pas pu être effectuée.").then(charger),
                      }),
                    },
                  ] : [
                    {
                      label: 'Restaurer',
                      icon: <RotateCcw size={15} />,
                      onClick: () => executer(() => restoreDocument(id, r.id), 'Document restauré.', "La restauration n'a pas pu être effectuée.").then(charger),
                    },
                    vueDocuments === 'archive' ? {
                      label: 'Supprimer',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirmHistorique({
                        title: 'Mettre ce document à la corbeille ?',
                        message: `« ${r.nom} » sera déplacé dans la corbeille.`,
                        confirmLabel: 'Corbeille',
                        run: () => executer(() => corbeilleDocument(id, r.id), 'Document placé dans la corbeille.', "L'action n'a pas pu être effectuée.").then(charger),
                      }),
                    } : {
                      label: 'Supprimer définitivement',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      separatorBefore: true,
                      onClick: () => setSuppressionDocument(r),
                    },
                  ]}
                />
              </div>
            )}
            emptyText={vueDocuments === 'actif' ? 'Aucun document' : `Aucun document dans ${VUES[vueDocuments]}`}
          />
        </CarteBloc>

        <CarteBloc
          icon={ListTree}
          titre="Observations"
          ouvertParDefaut={false}
          onAjouter={() => { setTexteObservation(''); setAjoutObservation(true) }}
          vue={vueObservations}
          onVue={setVueObservations}
        >
          <DataTable
            columns={[
              {
                key: 'contenu',
                header: 'Observation',
                clamp: 1,
                render: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    {r.privee && <Lock size={12} className="shrink-0 text-ink-500" />}
                    {r.contenu}
                  </span>
                ),
              },
              { key: 'createdAt', header: "Date d'ajout", render: (r) => formatDateHeure(r.createdAt) },
              { key: 'ajoutePar', header: 'Ajouté par', value: (r) => r.ajoutePar || '—' },
            ]}
            rows={(d.observations ?? []).filter((r) => (r.status ?? 'actif') === vueObservations)}
            pageSize={10}
            pageSizeOptions={[10, 25, 50]}
            actionsHeader="ACTION"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                {r.aFichier && (
                  <a
                    href={observationFichierUrl(id, r.id)}
                    target="_blank"
                    rel="noreferrer"
                    title={r.fichierNom || 'Télécharger la pièce jointe'}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-surface hover:text-brand-600 focus-ring"
                  >
                    <Paperclip size={15} />
                  </a>
                )}
                <ActionMenu
                  label="Actions"
                  icon={<IconeActions />}
                  items={vueObservations === 'actif' ? [
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      onClick: () => setConfirmHistorique({
                        title: 'Archiver cette observation ?',
                        message: 'Cette observation sera déplacée dans les archives.',
                        confirmLabel: 'Archiver',
                        run: () => executer(() => archiveObservation(id, r.id), 'Observation archivée.', "L'archivage n'a pas pu être effectué.").then(charger),
                      }),
                    },
                    {
                      label: 'Supprimer',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirmHistorique({
                        title: 'Mettre cette observation à la corbeille ?',
                        message: 'Cette observation sera déplacée dans la corbeille.',
                        confirmLabel: 'Corbeille',
                        run: () => executer(() => corbeilleObservation(id, r.id), 'Observation placée dans la corbeille.', "L'action n'a pas pu être effectuée.").then(charger),
                      }),
                    },
                  ] : [
                    {
                      label: 'Restaurer',
                      icon: <RotateCcw size={15} />,
                      onClick: () => executer(() => restoreObservation(id, r.id), 'Observation restaurée.', "La restauration n'a pas pu être effectuée.").then(charger),
                    },
                    vueObservations === 'archive' ? {
                      label: 'Supprimer',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirmHistorique({
                        title: 'Mettre cette observation à la corbeille ?',
                        message: 'Cette observation sera déplacée dans la corbeille.',
                        confirmLabel: 'Corbeille',
                        run: () => executer(() => corbeilleObservation(id, r.id), 'Observation placée dans la corbeille.', "L'action n'a pas pu être effectuée.").then(charger),
                      }),
                    } : {
                      label: 'Supprimer définitivement',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      separatorBefore: true,
                      onClick: () => setSuppressionObservation(r),
                    },
                  ]}
                />
              </div>
            )}
            emptyText={vueObservations === 'actif' ? 'Aucune observation' : `Aucune observation dans ${VUES[vueObservations]}`}
          />
        </CarteBloc>

        <CarteBloc
          icon={CalendarClock}
          titre="Domiciliation"
          ouvertParDefaut={false}
          actions={d.status === 'actif' && (
            <IconButton variant="success" title="Renouveler cette domiciliation" onClick={() => setRenouvellementCible({ id, data: d })}>
              <RefreshCw size={18} />
            </IconButton>
          )}
          vue={vueHistorique}
          onVue={setVueHistorique}
        >
          <DataTable
            columns={[
              { key: 'statutAffichage', header: 'Situation', render: (r) => <StatutDomiciliation statut={r.statutAffichage} /> },
              { key: 'dateDepart', header: 'Date départ', render: (r) => formatDate(r.dateDepart) },
              { key: 'dateFin', header: 'Date fin', render: (r) => formatDate(r.dateFin) },
              { key: 'moisPayee', header: 'Payée', value: (r) => (r.moisPayee != null ? `${r.moisPayee} Mois` : '—') },
              { key: 'dateLegalisation', header: 'Date légalisation', render: (r) => formatDate(r.dateLegalisation) },
              { key: 'prixTotal', header: 'Prix HT', numeric: true, value: (r) => r.prixTotal },
              { key: 'createdBy', header: 'Action de', value: (r) => r.createdBy || '—' },
            ]}
            rows={historique}
            pageSize={10}
            pageSizeOptions={[10, 25, 50]}
            actionsHeader="ACTION"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                <ActionMenu
                  label="Actions"
                  icon={<IconeActions />}
                  items={vueHistorique === 'actif' ? [
                    {
                      label: 'Renouveler',
                      icon: <RefreshCw size={15} />,
                      tone: 'success',
                      onClick: () => getDomiciliation(r.id).then((data) => setRenouvellementCible({ id: r.id, data })),
                    },
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      separatorBefore: true,
                      onClick: () => setConfirmHistorique({
                        title: 'Archiver cette domiciliation ?',
                        message: `« ${r.denomination} » (${formatDate(r.dateDepart)} — ${formatDate(r.dateFin)}) sera déplacée dans les archives.`,
                        confirmLabel: 'Archiver',
                        run: () => executer(() => archiveDomiciliation(r.id), 'Domiciliation archivée.', "L'archivage n'a pas pu être effectué.").then(rechargerHistorique),
                      }),
                    },
                    {
                      label: 'Supprimer',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirmHistorique({
                        title: 'Mettre cette domiciliation à la corbeille ?',
                        message: `« ${r.denomination} » (${formatDate(r.dateDepart)} — ${formatDate(r.dateFin)}) sera déplacée dans la corbeille.`,
                        confirmLabel: 'Corbeille',
                        run: () => executer(() => corbeilleDomiciliation(r.id), 'Domiciliation placée dans la corbeille.', "L'action n'a pas pu être effectuée.").then(rechargerHistorique),
                      }),
                    },
                  ] : [
                    {
                      label: 'Restaurer',
                      icon: <RotateCcw size={15} />,
                      onClick: () => executer(() => restoreDomiciliation(r.id), 'Domiciliation restaurée.', "La restauration n'a pas pu être effectuée.").then(rechargerHistorique),
                    },
                    {
                      label: 'Supprimer',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      disabled: vueHistorique === 'corbeille',
                      onClick: () => setConfirmHistorique({
                        title: 'Mettre cette domiciliation à la corbeille ?',
                        message: `« ${r.denomination} » (${formatDate(r.dateDepart)} — ${formatDate(r.dateFin)}) sera déplacée dans la corbeille.`,
                        confirmLabel: 'Corbeille',
                        run: () => executer(() => corbeilleDomiciliation(r.id), 'Domiciliation placée dans la corbeille.', "L'action n'a pas pu être effectuée.").then(rechargerHistorique),
                      }),
                    },
                  ]}
                />
              </div>
            )}
            emptyText={vueHistorique === 'actif' ? 'Aucune période' : `Aucune période dans ${VUES[vueHistorique]}`}
          />
        </CarteBloc>
      </div>

      {renouvellementCible && (
        <FormulaireRenouvellement
          domiciliation={renouvellementCible.data}
          erreur={erreur}
          onEffacerErreur={() => setErreur('')}
          onAnnuler={() => { setRenouvellementCible(null); setErreur('') }}
          onEnregistrer={async ({ champs, fichier }) => {
            setErreur('')
            try {
              await renouvelerDomiciliation(renouvellementCible.id, champs, fichier)
              setRenouvellementCible(null)
              toast.success('Domiciliation renouvelée.')
              charger()
              rechargerHistorique()
            } catch (err) {
              setErreur(err instanceof ApiError ? err.message : "Le renouvellement n'a pas pu être enregistré.")
            }
          }}
        />
      )}

      <Modal
        open={ajoutObservation}
        onClose={fermerAjoutObservation}
        size="xxl"
        title="Ajouter une observation"
        footer={(
          <>
            <Button variant="secondary" onClick={fermerAjoutObservation}>Annuler</Button>
            <Button disabled={!texteObservation.trim()} onClick={soumettreObservation}>Enregistrer</Button>
          </>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Observation" required className="lg:col-span-2">
            <Textarea
              autoFocus
              rows={8}
              value={texteObservation}
              onChange={(e) => setTexteObservation(e.target.value)}
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
        open={ajoutDocument}
        onClose={fermerAjoutDocument}
        size="xxl"
        title="Ajouter un document"
        footer={(
          <>
            <Button variant="secondary" onClick={fermerAjoutDocument}>Annuler</Button>
            <Button disabled={!documentFichier} onClick={soumettreDocument}>Enregistrer</Button>
          </>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
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

      <ConfirmDialog
        open={confirmArchive}
        title="Archiver cette domiciliation ?"
        message={`« ${d.denomination} » sera déplacée dans les archives.`}
        confirmLabel="Archiver"
        tone="warning"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false)
          executer(() => archiveDomiciliation(id), 'Domiciliation archivée.', "L'archivage n'a pas pu être effectué.").then(rechargerHistorique)
        }}
      />
      <ConfirmDialog
        open={confirmCorbeille}
        title="Mettre cette domiciliation à la corbeille ?"
        message={`« ${d.denomination} » sera déplacée dans la corbeille.`}
        confirmLabel="Corbeille"
        tone="danger"
        onCancel={() => setConfirmCorbeille(false)}
        onConfirm={() => {
          setConfirmCorbeille(false)
          executer(() => corbeilleDomiciliation(id), 'Domiciliation placée dans la corbeille.', "L'action n'a pas pu être effectuée.").then(rechargerHistorique)
        }}
      />
      <ConfirmDialog
        open={!!confirmHistorique}
        title={confirmHistorique?.title}
        message={confirmHistorique?.message}
        confirmLabel={confirmHistorique?.confirmLabel}
        tone={confirmHistorique?.confirmLabel === 'Archiver' ? 'warning' : 'danger'}
        onCancel={() => setConfirmHistorique(null)}
        onConfirm={() => { const c = confirmHistorique; setConfirmHistorique(null); c?.run() }}
      />
      <ConfirmDialog
        open={!!suppressionDocument}
        title="Supprimer ce document ?"
        message={suppressionDocument ? `« ${suppressionDocument.nom} » sera définitivement supprimé.` : ''}
        confirmLabel="Supprimer"
        onCancel={() => setSuppressionDocument(null)}
        onConfirm={() => {
          const doc = suppressionDocument
          setSuppressionDocument(null)
          executer(() => deleteDocument(id, doc.id), 'Document supprimé.', 'Le document n\'a pas pu être supprimé.')
        }}
      />
      <ConfirmDialog
        open={!!suppressionObservation}
        title="Supprimer cette observation ?"
        message="Cette observation sera définitivement supprimée."
        confirmLabel="Supprimer"
        onCancel={() => setSuppressionObservation(null)}
        onConfirm={() => {
          const obs = suppressionObservation
          setSuppressionObservation(null)
          executer(() => deleteObservation(id, obs.id), 'Observation supprimée.', "L'observation n'a pas pu être supprimée.")
        }}
      />
    </div>
  )
}
