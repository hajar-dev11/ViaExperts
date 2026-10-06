import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Activity, Archive, Building, Building2, CalendarClock, Contact,
  DollarSign, FileText, Folder, IdCard, Info,
  Mail, MapPin, Phone, ScanLine, UserRound, Users,
} from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
// Briques partagées avec « Informations Domiciliation » : même rendu partout.
import { Ligne, Section } from '../components/FicheInfos.jsx'
// Blocs Documents/Observations/Domiciliations, partagés avec « Informations
// Client » : une seule implémentation pour les deux pages.
import BlocsEntreprise from '../components/BlocsEntreprise.jsx'
import { SkeletonText } from '../components/ui/Skeleton.jsx'
import { getEntreprise, archiveEntreprise, corbeilleEntreprise, restoreEntreprise } from '../api/entreprises.js'
import { listClients } from '../api/clients.js'
import { listDomiciliations, chargerSignatureDomiciliation } from '../modules/domiciliation/index.js'
import { getDomiciliationSettings } from '../api/settings.js'
import { formatDate, formatDateHeure } from '../utils/format.js'

/**
 * Détails d'une entreprise — reproduction de « Details_Entreprise » :
 *
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │ Informations         │ Personnes rattachées         │
 *   │ Entreprise           ├──────────────────────────────┤
 *   │ (fiche verticale     │ Documents                    │
 *   │  par sections)       ├──────────────────────────────┤
 *   │                      │ Observations                 │
 *   │ [Modifier][Archive]  ├──────────────────────────────┤
 *   │                      │ Domiciliations               │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * Les quatre blocs de droite sont alimentés par de vraies tables :
 * `entreprise_associes`, `entreprise_documents`, `entreprise_observations`
 * et `domiciliations`. Les trois derniers viennent de `BlocsEntreprise.jsx`,
 * réutilisé tel quel par « Informations Client ».
 */

export default function EntrepriseDetails() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [entreprise, setEntreprise] = useState(null)
  const [clients, setClients] = useState([])
  const [personneActive, setPersonneActive] = useState(0)
  const [domiciliations, setDomiciliations] = useState([])
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmCorbeille, setConfirmCorbeille] = useState(false)
  const [signaturePath, setSignaturePath] = useState(null)

  const charger = useCallback(() => {
    setChargement(true)
    getEntreprise(id)
      .then(setEntreprise)
      .catch(() => setErreur('Impossible de charger cette entreprise.'))
      .finally(() => setChargement(false))

    listDomiciliations({ status: 'actif' })
      .then((r) => {
        const lignes = Array.isArray(r) ? r : (r?.data ?? [])
        setDomiciliations(lignes.filter((d) => String(d.entrepriseId) === String(id)))
      })
      .catch(() => setDomiciliations([]))
  }, [id])

  useEffect(charger, [charger])

  // Les coordonnées complètes (adresse, téléphones, email) vivent dans la fiche
  // Client : on les retrouve par le nom quand la personne rattachée en possède une.
  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
  }, [])

  // Cachet utilisé à l'impression de la facture de domiciliation.
  useEffect(() => {
    chargerSignatureDomiciliation(getDomiciliationSettings).then(setSignaturePath)
  }, [])

  // --- Personnes rattachées --------------------------------------------------
  // Le CLIENT de l'entreprise (`entreprises.client_id`) ouvre toujours la liste :
  // c'est lui le titulaire du dossier. Viennent ensuite les autres personnes
  // rattachées (`entreprise_associes`). Si le client figure déjà parmi elles,
  // il n'est pas dupliqué : sa ligne est simplement remontée en tête.
  const personnes = useMemo(() => {
    const associes = entreprise?.associes ?? []
    const nomClient = entreprise?.client
    if (!nomClient) return associes

    const ligneClient = associes.find((a) => a.nom === nomClient)
    const autres = associes.filter((a) => a.nom !== nomClient)

    return [
      { ...(ligneClient ?? { id: 'client', nom: nomClient, type: null }), estClient: true },
      ...autres,
    ]
  }, [entreprise])

  const personne = personnes[personneActive] ?? personnes[0] ?? null
  const ficheClient = personne ? clients.find((c) => c.nom === personne.nom) ?? null : null

  /**
   * Archive / corbeille / restaure l'ENTREPRISE elle-même.
   *
   * ⚠️ Contrairement à l'ancien comportement, on ne quitte plus la page :
   * l'utilisatrice doit pouvoir continuer à consulter les Documents,
   * Observations et Domiciliations d'une fiche qu'elle vient d'archiver ou de
   * mettre à la corbeille, pas être renvoyée à la liste.
   */
  const executerSurEntreprise = async (action, messageErreur) => {
    try {
      await action()
      charger()
    } catch {
      setErreur(messageErreur)
    }
  }

  if (chargement) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <SkeletonText lines={12} />
      </div>
    )
  }

  if (erreur && !entreprise) {
    return <Alert tone="danger">{erreur}</Alert>
  }

  if (!entreprise) {
    return <Alert tone="danger">Entreprise introuvable.</Alert>
  }

  const secteurs = entreprise.secteurs ?? []

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
      {/* ---- Colonne gauche : fiche de l'entreprise ------------------------ */}
      <div className="rounded-xl bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Contact size={22} className="mt-1 shrink-0 text-ink-700" />
            <h1 className="text-xl leading-snug text-ink-900">{entreprise.denomination || 'Entreprise'}</h1>
          </div>
          <Badge tone={entreprise.status === 'actif' ? 'success' : entreprise.status === 'archive' ? 'warning' : 'neutral'}>
            {entreprise.status === 'actif' ? 'Active' : entreprise.status === 'archive' ? 'Archivée' : 'Corbeille'}
          </Badge>
        </div>

        {/* Rappel visible : on peut continuer à consulter (et rouvrir) une
            fiche archivée ou mise à la corbeille depuis cette même page. */}
        {entreprise.status !== 'actif' && (
          <Alert tone={entreprise.status === 'archive' ? 'warning' : 'neutral'} className="mt-4">
            {entreprise.status === 'archive'
              ? 'Cette entreprise est archivée. Ses documents, observations et domiciliations restent consultables ci-dessous.'
              : 'Cette entreprise est dans la corbeille. Ses documents, observations et domiciliations restent consultables ci-dessous.'}
          </Alert>
        )}

        <Section>À propos</Section>
        <Ligne icon={FileText} label="Denomination" value={entreprise.denomination} />
        <Ligne icon={Building} label="Tribunal" value={entreprise.tribunal} />
        <Ligne icon={Activity} label="Forme Juridique" value={entreprise.forme} />

        <Section>Contacts</Section>
        <Ligne icon={ScanLine} label="I.C.E" value={entreprise.ice} />
        <Ligne icon={FileText} label="Registre de Commerce" value={entreprise.rc} />
        <Ligne icon={FileText} label="Identifiant Fiscal" value={entreprise.if} />
        <Ligne icon={Folder} label="N° de dossier" value={entreprise.numDossier} />
        <Ligne icon={Archive} label="N° d'Archive" value={entreprise.numArchive} />
        <Ligne icon={IdCard} label="N° Tp" value={entreprise.tp} />
        <Ligne icon={UserRound} label="Single" value={entreprise.single} />
        <Ligne icon={Building} label="N° d'Affiliation à La CNSS" value={entreprise.cnss} />
        <Ligne icon={DollarSign} label="Capitale" value={entreprise.capital} />
        <Ligne icon={FileText} label="Déclarations TVA" value={entreprise.periode} />
        <Ligne icon={MapPin} label="Local" value={entreprise.local} />
        <Ligne icon={Building2} label="Centre de Domiciliation" value={entreprise.centreDomiciliation} />
        {/* Le client titulaire du dossier : champ du formulaire qui manquait ici. */}
        <Ligne icon={UserRound} label="Client" value={entreprise.client} />

        <Section>Secteur d'activité</Section>
        {secteurs.length === 0
          ? <Ligne icon={Activity} label="Secteur" value={null} />
          : [...new Set(secteurs.map((s) => s.secteur))].map((s) => (
              <Ligne key={s} icon={Activity} label="Secteur" value={s} />
            ))}

        <Section>Activites</Section>
        {secteurs.length === 0
          ? <Ligne icon={Activity} label="Activité" value={null} />
          : secteurs.map((s, i) => (
              <Ligne key={i} icon={Activity} label="Activité" value={s.activite} />
            ))}

        <Section>Détail de domiciliation</Section>
        <Ligne icon={CalendarClock} label="date depart" value={formatDate(domiciliations[0]?.dateDepart)} />
        <Ligne icon={Users} label="date fin" value={formatDate(domiciliations[0]?.dateFin)} />

        <Section>Date début d'activité</Section>
        <Ligne icon={CalendarClock} label="Date d'Activité" value={formatDate(entreprise.dateDebut)} />

        <Section>Détail de création</Section>
        <Ligne icon={CalendarClock} label="Créé Le" value={formatDateHeure(entreprise.createdAt)} />
        {/* Membre du système (assistant ou admin) qui a créé la fiche. */}
        <Ligne icon={UserRound} label="Créé par" value={entreprise.createdBy} />

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary-soft" onClick={() => navigate(`/entreprises/${id}/modifier`)}>
            Modifier
          </Button>
          {entreprise.status === 'actif' && (
            <>
              <Button variant="warning-soft" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
              <Button variant="danger-soft" onClick={() => setConfirmCorbeille(true)}>
                Corbeille
              </Button>
            </>
          )}
          {entreprise.status !== 'actif' && (
            <>
              <Button
                variant="success-soft"
                onClick={() => executerSurEntreprise(
                  () => restoreEntreprise(id),
                  "La restauration n'a pas pu être effectuée."
                )}
              >
                Restaurer
              </Button>
              {entreprise.status === 'archive' && (
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
        {erreur && <Alert tone="danger" onClose={() => setErreur('')}>{erreur}</Alert>}

        {/* Personnes rattachées : un onglet par personne, comme la référence. */}
        <div className="overflow-hidden rounded-xl bg-white shadow-card">
          <div className="flex flex-wrap gap-6 border-b border-line px-6 pt-5">
            {personnes.length === 0 ? (
              <span className="inline-block pb-3 text-[15px] font-semibold text-ink-600">
                Aucune personne rattachée
              </span>
            ) : personnes.map((p, i) => (
              <button
                key={p.id ?? i}
                type="button"
                onClick={() => setPersonneActive(i)}
                className={`inline-flex items-center gap-2 border-b-2 pb-3 text-[15px] font-semibold transition-colors focus-ring ${
                  i === personneActive
                    ? 'border-brand-500 text-brand-500'
                    : 'border-transparent text-ink-700 hover:text-ink-900'
                }`}
              >
                {p.nom}
                {/* Repère le titulaire du dossier parmi les personnes rattachées. */}
                {p.estClient && <Badge tone="primary">Client</Badge>}
              </button>
            ))}
          </div>

          {personne && (
            <div className="p-6">
              <div className="flex items-center gap-3">
                <Building2 size={22} className="shrink-0 text-ink-700" />
                <h2 className="text-xl text-ink-900">
                  {personne.type || (personne.estClient ? 'Client' : 'Personne rattachée')}
                </h2>
              </div>

              <Section>À propos</Section>
              <Ligne icon={UserRound} label="Nom et Prénom" value={personne.nom} />
              <Ligne icon={IdCard} label="C.I.N.E" value={personne.cin || ficheClient?.cin} />
              <Ligne icon={MapPin} label="Adresse" value={personne.adresse || ficheClient?.adresse} />

              <Section>Contacts</Section>
              <Ligne icon={Phone} label="Téléphone 1" value={personne.telephone || ficheClient?.tel} />
              <Ligne icon={Phone} label="Téléphone 2" value={personne.telephone2 || ficheClient?.tel2} />
              <Ligne icon={Mail} label="Email" value={personne.email || ficheClient?.email} />

              {ficheClient && (
                <button
                  type="button"
                  onClick={() => navigate(`/clients/${ficheClient.id}`)}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-info-600 hover:underline focus-ring"
                >
                  <Info size={16} /> Plus de Détails
                </button>
              )}
            </div>
          )}
        </div>

        <BlocsEntreprise
          entrepriseId={id}
          entreprise={entreprise}
          domiciliations={domiciliations}
          signaturePath={signaturePath}
          onEntrepriseChange={setEntreprise}
          onDomiciliationsChange={charger}
          onRecharger={charger}
          onSansDomiciliation={() => navigate('/domiciliation/nouvelle')}
        />
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title="Archiver cette entreprise ?"
        message={`« ${entreprise.denomination} » sera déplacée dans les archives. Vous resterez sur cette page.`}
        confirmLabel="Archiver"
        tone="warning"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false)
          executerSurEntreprise(() => archiveEntreprise(id), "L'archivage n'a pas pu être effectué.")
        }}
      />

      <ConfirmDialog
        open={confirmCorbeille}
        title="Mettre cette entreprise à la corbeille ?"
        message={`« ${entreprise.denomination} » sera déplacée dans la corbeille. Vous resterez sur cette page.`}
        confirmLabel="Corbeille"
        tone="danger"
        onCancel={() => setConfirmCorbeille(false)}
        onConfirm={() => {
          setConfirmCorbeille(false)
          executerSurEntreprise(() => corbeilleEntreprise(id), "L'action n'a pas pu être effectuée.")
        }}
      />
    </div>
  )
}
