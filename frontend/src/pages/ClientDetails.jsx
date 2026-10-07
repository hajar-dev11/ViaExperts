import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Building2, CalendarClock, Contact, FileText, Flag, IdCard,
  Info, Mail, MapPin, Phone, ScanLine, UserRound, Users,
} from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { Ligne, Section } from '../components/FicheInfos.jsx'
// Blocs Documents/Observations/Domiciliations, partagés avec « Informations
// Entreprise » : une seule implémentation pour les deux pages.
import BlocsEntreprise from '../components/BlocsEntreprise.jsx'
import { SkeletonText } from '../components/ui/Skeleton.jsx'
import { getClient, archiveClient, corbeilleClient, restoreClient } from '../api/clients.js'
import { getEntreprise } from '../api/entreprises.js'
import { listDomiciliations, chargerSignatureDomiciliation } from '../modules/domiciliation/index.js'
import { getDomiciliationSettings } from '../api/settings.js'
import { formatDate, formatDateHeure } from '../utils/format.js'

/**
 * Détails d'un client — même gabarit que « Informations Entreprise » :
 *
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │ Informations         │ Entreprise                   │
 *   │ Client                ├──────────────────────────────┤
 *   │ (fiche verticale     │ Documents                     │
 *   │  par sections)       ├──────────────────────────────┤
 *   │ [Modifier][Archive]  │ Observations                  │
 *   │                      ├──────────────────────────────┤
 *   │                      │ Domiciliation                 │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * Documents / Observations / Domiciliation appartiennent à l'ENTREPRISE dont
 * ce client est le titulaire (`entreprises.client_id`) : le client lui-même
 * ne porte aucune de ces données, mais leur gestion complète (ajout, archive,
 * corbeille, restaurer, renouveler, imprimer…) reste disponible ici, via le
 * même composant `BlocsEntreprise` que la fiche Entreprise elle-même.
 */
export default function ClientDetails() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [client, setClient] = useState(null)
  const [entreprise, setEntreprise] = useState(null)
  const [domiciliations, setDomiciliations] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmCorbeille, setConfirmCorbeille] = useState(false)
  const [signaturePath, setSignaturePath] = useState(null)

  // Entreprise dont ce client est le titulaire ; s'il y en a plusieurs
  // (rare), on retient la première comme fiche principale.
  const entreprisePrincipale = client?.entreprises?.[0] ?? null

  const chargerClient = useCallback((signal) => {
    setChargement(true)
    setErreur('')
    getClient(id, { signal })
      .then(setClient)
      .catch((err) => { if (err?.name !== 'AbortError') setErreur('Impossible de charger ce client.') })
      .finally(() => { if (!signal?.aborted) setChargement(false) })
  }, [id])

  useEffect(() => {
    // En quittant la page avant la fin du chargement (navigation rapide, clic
    // sur un autre lien), la requête est annulée plutôt que laissée en vol :
    // sans ça, sa réponse (parfois un 403 si la session a changé entre-temps)
    // arrive après coup et pollue la console d'une page qui n'a rien demandé.
    const controller = new AbortController()
    chargerClient(controller.signal)
    return () => controller.abort()
  }, [chargerClient])

  // Cachet utilisé à l'impression des documents de domiciliation.
  useEffect(() => {
    chargerSignatureDomiciliation(getDomiciliationSettings).then(setSignaturePath)
  }, [])

  // Une fois le client connu, on va chercher la fiche complète de son
  // entreprise (documents, observations) et ses domiciliations réelles —
  // exactement les mêmes appels que la page Informations Entreprise.
  const chargerDomiciliations = useCallback(() => {
    if (!entreprisePrincipale) { setDomiciliations([]); return }
    listDomiciliations({ status: 'actif' })
      .then((r) => {
        const lignes = Array.isArray(r) ? r : (r?.data ?? [])
        setDomiciliations(lignes.filter((d) => String(d.entrepriseId) === String(entreprisePrincipale.id)))
      })
      .catch(() => setDomiciliations([]))
  }, [entreprisePrincipale])

  useEffect(() => {
    if (!entreprisePrincipale) { setEntreprise(null); setDomiciliations([]); return }
    getEntreprise(entreprisePrincipale.id).then(setEntreprise).catch(() => setEntreprise(null))
    chargerDomiciliations()
  }, [entreprisePrincipale, chargerDomiciliations])

  if (chargement) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <SkeletonText lines={12} />
      </div>
    )
  }

  if (erreur && !client) {
    return <Alert tone="danger">{erreur}</Alert>
  }

  if (!client) {
    return <Alert tone="danger">Client introuvable.</Alert>
  }

  /**
   * Archive / corbeille / restaure le CLIENT lui-même, sans quitter la page :
   * l'utilisatrice doit pouvoir continuer à consulter le bloc Entreprise et
   * les Documents/Observations/Domiciliations qui vont avec.
   */
  const executerSurClient = async (action, messageErreur) => {
    try {
      await action()
      chargerClient()
    } catch {
      setErreur(messageErreur)
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
      {/* ---- Colonne gauche : fiche du client ------------------------------ */}
      <div className="rounded-xl bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Contact size={22} className="mt-1 shrink-0 text-ink-700" />
            <h1 className="text-xl leading-snug text-ink-900">{client.nom || 'Client'}</h1>
          </div>
          <Badge tone={client.status === 'actif' ? 'success' : client.status === 'archive' ? 'warning' : 'neutral'}>
            {client.status === 'actif' ? 'Actif' : client.status === 'archive' ? 'Archivé' : 'Corbeille'}
          </Badge>
        </div>

        {/* Rappel visible : on peut continuer à consulter (et rouvrir) une
            fiche archivée ou mise à la corbeille depuis cette même page. */}
        {client.status !== 'actif' && (
          <Alert tone={client.status === 'archive' ? 'warning' : 'neutral'} className="mt-4">
            {client.status === 'archive'
              ? 'Ce client est archivé. Le bloc Entreprise et ses documents, observations et domiciliations restent consultables ci-dessous.'
              : 'Ce client est dans la corbeille. Le bloc Entreprise et ses documents, observations et domiciliations restent consultables ci-dessous.'}
          </Alert>
        )}

        <Section>À propos</Section>
        <Ligne icon={UserRound} label="Nom et Prénom" value={client.nom} />
        <Ligne icon={Users} label="Genre" value={client.genre} />
        <Ligne icon={Flag} label="Nationalité" value={client.nationalite} />
        <Ligne icon={CalendarClock} label="Date de Naissance" value={formatDate(client.naissance)} />

        <Section>Contacts</Section>
        <Ligne icon={IdCard} label="C.I.N.E" value={client.cin} />
        <Ligne icon={Mail} label="Email" value={client.email} />
        <Ligne icon={Phone} label="Téléphone" value={client.tel} />
        <Ligne icon={Phone} label="Téléphone 2" value={client.tel2} />
        <Ligne icon={MapPin} label="Adresse" value={client.adresse} />

        <Section>Détail de création</Section>
        <Ligne icon={CalendarClock} label="Créé Le" value={formatDateHeure(client.createdAt)} />
        {/* Membre du système (assistant ou admin) qui a créé la fiche. */}
        <Ligne icon={UserRound} label="Créé par" value={client.createdBy} />

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary-soft" onClick={() => navigate(`/clients/${id}/modifier`)}>
            Modifier
          </Button>
          {client.status === 'actif' && (
            <>
              <Button variant="warning-soft" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
              <Button variant="danger-soft" onClick={() => setConfirmCorbeille(true)}>
                Corbeille
              </Button>
            </>
          )}
          {client.status !== 'actif' && (
            <>
              <Button
                variant="success-soft"
                onClick={() => executerSurClient(
                  () => restoreClient(id),
                  "La restauration n'a pas pu être effectuée."
                )}
              >
                Restaurer
              </Button>
              {client.status === 'archive' && (
                <Button variant="danger-soft" onClick={() => setConfirmCorbeille(true)}>
                  Corbeille
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---- Colonne droite ------------------------------------------------ */}
      <div className="space-y-6 xl:col-span-2">
        {erreur && <Alert tone="danger" onAutoClose={() => setErreur('')} onClose={() => setErreur('')}>{erreur}</Alert>}

        {/* Entreprise dont ce client est le titulaire. */}
        <div className="overflow-hidden rounded-xl bg-white shadow-card">
          <div className="flex items-center gap-3 border-b border-line px-6 py-5">
            <Building2 size={22} className="shrink-0 text-ink-700" />
            <h2 className="text-xl text-ink-900">Entreprise</h2>
          </div>

          {!entreprisePrincipale ? (
            <p className="p-6 text-sm text-ink-600">Aucune entreprise rattachée à ce client.</p>
          ) : (
            <div className="p-6">
              <Section>À propos</Section>
              <Ligne icon={FileText} label="Denomination" value={entreprisePrincipale.denomination} />
              <Ligne icon={ScanLine} label="I.C.E" value={entreprisePrincipale.ice} />
              <Ligne icon={IdCard} label="Identifiant Fiscal" value={entreprisePrincipale.if} />
              <Ligne icon={MapPin} label="Local" value={entreprisePrincipale.local} />
              <Ligne icon={Building2} label="Centre de Domiciliation" value={entreprisePrincipale.centreDomiciliation} />
              <Ligne icon={Info} label="Situation" value={entreprisePrincipale.situation} />

              <button
                type="button"
                onClick={() => navigate(`/entreprises/${entreprisePrincipale.id}`)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-info-600 hover:underline focus-ring"
              >
                <Info size={16} /> Voir la fiche complète
              </button>
            </div>
          )}
        </div>

        {/* Documents / Observations / Domiciliations de cette entreprise —
            mêmes actions (ajout, archive, corbeille, restaurer, renouveler,
            imprimer) qu'sur sa propre fiche : c'est le même composant. */}
        {entreprisePrincipale && entreprise && (
          <BlocsEntreprise
            entrepriseId={entreprisePrincipale.id}
            entreprise={entreprise}
            domiciliations={domiciliations}
            signaturePath={signaturePath}
            onEntrepriseChange={setEntreprise}
            onDomiciliationsChange={chargerDomiciliations}
            onRecharger={chargerDomiciliations}
            onSansDomiciliation={() => navigate('/domiciliation/nouvelle')}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title="Archiver ce client ?"
        message={`« ${client.nom} » sera déplacé dans les archives. Vous resterez sur cette page.`}
        confirmLabel="Archiver"
        tone="warning"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false)
          executerSurClient(() => archiveClient(id), "L'archivage n'a pas pu être effectué.")
        }}
      />

      <ConfirmDialog
        open={confirmCorbeille}
        title="Mettre ce client à la corbeille ?"
        message={`« ${client.nom} » sera déplacé dans la corbeille. Vous resterez sur cette page.`}
        confirmLabel="Corbeille"
        tone="danger"
        onCancel={() => setConfirmCorbeille(false)}
        onConfirm={() => {
          setConfirmCorbeille(false)
          executerSurClient(() => corbeilleClient(id), "L'action n'a pas pu être effectuée.")
        }}
      />
    </div>
  )
}
