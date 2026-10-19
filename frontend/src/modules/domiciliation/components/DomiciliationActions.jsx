import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Printer, FileText, RefreshCw, BadgeCheck, Ban, CircleCheck, Paperclip } from 'lucide-react'
// `CircleCheck` alimente le libellé « Activée » du journal d'actions (menu « Activer »).
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import { Field, FileInput, Input, Textarea, CheckboxCard } from '../../../components/Field.jsx'
import ChampSignature from '../../../components/ChampSignature.jsx'
import ModePaiementChamp from '../../../components/ModePaiementChamp.jsx'
import { arrondirPrix, enNombre, prixArrondiEnTexte } from '../../../utils/arrondi.js'
import { modePourEnvoi } from '../../../utils/modePaiement.js'
import { DOCUMENTS_DOMICILIATION, documentsDisponibles } from '../documents/documentsDomiciliation.js'
import { calculerDateFin, calculerPrixTotal, chargerPrixServiceDomiciliation } from '../utils/domiciliation.js'
import { aujourdhui } from '../../../shared/utils/date.js'
import { executerUneFois } from '../utils/formulaireDomiciliation.js'

/**
 * « Imprimer » — propose les documents cochés à l'enregistrement de la
 * domiciliation (Facture, Contrat, Attestation, Procuration) et imprime celui
 * que l'on choisit. Si aucune case n'a été cochée, le menu le dit plutôt que
 * de rester vide.
 */
export function MenuImprimer({ domiciliation, signaturePath, icone = <Printer size={16} />, tous = false }) {
  // `tous` : la liste de gestion propose les quatre documents, quelle que soit la case cochée à l'enregistrement.
  const disponibles = tous ? DOCUMENTS_DOMICILIATION : documentsDisponibles(domiciliation)
  const navigate = useNavigate()

  return (
    <ActionMenu
      label="Imprimer"
      icon={icone}
      items={disponibles.length > 0
        ? disponibles.map((doc) => ({
            label: doc.label,
            icon: <FileText size={15} />,
            // Contrat et attestation s'ouvrent dans leur page de prévisualisation (Modifier → PDF), comme les factures.
            onClick: () => (doc.editeur ? navigate(`/domiciliation/${domiciliation.id}/${doc.editeur}`) : doc.imprimer(domiciliation, { signaturePath })),
          }))
        : [{
            label: 'Aucun document coché sur cette domiciliation',
            icon: <FileText size={15} />,
            disabled: true,
          }]}
    />
  )
}

/**
 * Formulaire commun à « Déclarer » et « Résilier » : un justificatif et un
 * commentaire, tous deux facultatifs. Les deux actions ont exactement le même
 * besoin, elles partagent donc le même formulaire.
 */
export function FormulaireActionSimple({ titre, description, libelleBouton, tone = 'primary', onAnnuler, onEnregistrer, erreur = '', onEffacerErreur }) {
  const [commentaire, setCommentaire] = useState('')
  const [fichier, setFichier] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const verrou = useRef(false)

  // Un seul envoi à la fois : un second clic pendant l'envoi est ignoré.
  const enregistrer = () => executerUneFois(verrou, async () => {
    setEnCours(true)
    try {
      await onEnregistrer({ commentaire: commentaire.trim(), fichier })
    } finally {
      setEnCours(false)
    }
  })

  return (
    <Modal
      open
      onClose={onAnnuler}
      size="lg"
      title={titre}
      description={description}
      footer={(
        <>
          <Button variant="secondary" onClick={onAnnuler}>Annuler</Button>
          <Button variant={tone} loading={enCours} onClick={enregistrer}>{libelleBouton}</Button>
        </>
      )}
    >
      {erreur && <Alert tone="danger" className="mb-4" onAutoClose={onEffacerErreur}>{erreur}</Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Justificatif" hint="5 Mo maximum. Facultatif.">
          <FileInput onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Commentaire" hint="Facultatif.">
          <Textarea
            rows={3}
            placeholder="Commentaire…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

const DOCUMENTS_CASES = [
  { cle: 'doc_facture', titre: 'Ajouter Facture de domiciliation', label: 'Facture de domiciliation' },
  { cle: 'doc_contrat', titre: 'Ajouter Contrat de domiciliation', label: 'Contrat de domiciliation' },
  { cle: 'doc_attestation', titre: 'Ajouter Attestation de domiciliation', label: 'Attestation de domiciliation' },
  { cle: 'doc_procuration', titre: 'Ajouter Procuration', label: 'Procuration' },
]

/**
 * Formulaire « Renouveler Domiciliation » — fenêtre modale, reproduction exacte
 * de la capture de référence de l'ancien site.
 *
 * Il reprend la logique du formulaire de domiciliation : prix mensuel repris du
 * module Services, date de fin calculée depuis la date de départ et le nombre
 * de mois, Prix Total = prix × (mois payés + mois gratuits).
 *
 * La période proposée démarre le lendemain de la fin de la période en cours,
 * de sorte que les deux ne se chevauchent pas. « Ancienne Date de départ/fin »
 * rappellent, en lecture seule, la période que ce renouvellement prolonge.
 *
 * Composant unique, utilisé partout où un renouvellement peut être lancé
 * (Gestion Domiciliation, Liste par statut, Informations Domiciliation) : le
 * rendu est donc rigoureusement identique d'un endroit à l'autre.
 */
export function FormulaireRenouvellement({ domiciliation, onAnnuler, onEnregistrer, erreur = '', onEffacerErreur }) {
  const departPropose = () => {
    if (!domiciliation?.dateFin) return aujourdhui()
    const [a, m, j] = String(domiciliation.dateFin).split('-').map(Number)
    if (!a || !m || !j) return aujourdhui()
    const suivant = new Date(a, m - 1, j + 1)
    return `${suivant.getFullYear()}-${String(suivant.getMonth() + 1).padStart(2, '0')}-${String(suivant.getDate()).padStart(2, '0')}`
  }

  const [form, setForm] = useState(() => ({
    date_depart: departPropose(),
    date_fin: '',
    mois_payee: domiciliation?.moisPayee ?? 12,
    mois_gratuits: domiciliation?.moisGratuits ?? 0,
    mode_paiement: domiciliation?.modePaiement ?? '',
    prix_par_mois: domiciliation?.prixParMois ?? '',
    prix_total: '',
    prix_total_manuel: false,
    signature_sur_facture: !!domiciliation?.signatureSurFacture,
    date_facture: aujourdhui(),
    date_paiement: aujourdhui(),
    date_legalisation: '',
    doc_facture: !!domiciliation?.docFacture,
    doc_contrat: !!domiciliation?.docContrat,
    doc_attestation: !!domiciliation?.docAttestation,
    doc_procuration: !!domiciliation?.docProcuration,
  }))
  const [origineService, setOrigineService] = useState('')
  const [enCours, setEnCours] = useState(false)
  const verrou = useRef(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setCheck = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }))

  // Prix mensuel repris de la fiche Service « Domiciliation ».
  useEffect(() => {
    chargerPrixServiceDomiciliation().then(({ prix, service }) => {
      if (!prix) return
      setOrigineService(service.nom)
      setForm((f) => (f.prix_par_mois ? f : { ...f, prix_par_mois: prix }))
    })
  }, [])

  // Date de fin et Prix Total (proposition) suivent la durée saisie ; un total saisi à la main n'est jamais écrasé.
  const dureeMois = (Number(form.mois_payee) || 0) + (Number(form.mois_gratuits) || 0)
  useEffect(() => {
    setForm((f) => {
      const fin = calculerDateFin(f.date_depart, (Number(f.mois_payee) || 0) + (Number(f.mois_gratuits) || 0))
      // Date de fin : payés + gratuits. Prix : mois PAYÉS seulement (les mois gratuits ne sont pas facturés).
      const total = f.prix_total_manuel ? f.prix_total : (calculerPrixTotal(f.prix_par_mois, f.mois_payee) ?? '')
      if (f.date_fin === fin && f.prix_total === total) return f
      return { ...f, date_fin: fin, prix_total: total }
    })
  }, [form.date_depart, form.mois_payee, form.mois_gratuits, form.prix_par_mois, form.prix_total_manuel])

  const saisirTotal = (e) => setForm((f) => ({ ...f, prix_total: e.target.value, prix_total_manuel: true }))
  const arrondirTotal = () => setForm((f) => ({ ...f, prix_total: prixArrondiEnTexte(f.prix_total) }))
  const recalculerTotal = () => setForm((f) => ({ ...f, prix_total_manuel: false }))

  // Un seul envoi à la fois : un second clic pendant l'envoi est ignoré (le serveur refuserait de toute façon un second
  // renouvellement de la même période, mais l'utilisateur ne doit pas voir deux messages). En cas d'échec la fenêtre reste
  // ouverte avec les données saisies ; elle n'est fermée par la page qu'après la réponse positive du serveur.
  const enregistrer = () => executerUneFois(verrou, async () => {
    setEnCours(true)
    try {
      // prix_total_manuel est un drapeau d'écran : il n'est jamais envoyé.
      const { prix_total_manuel: _manuel, ...champsForm } = form
      await onEnregistrer({
        champs: {
          ...champsForm,
          mois_payee: Number(form.mois_payee) || 0,
          mois_gratuits: Number(form.mois_gratuits) || 0,
          // Prix par mois EXACT (104,17 reste 104,17) ; le total, calculé (arrondi à l'entier) ou saisi à la main, est conservé par le serveur.
          prix_par_mois: form.prix_par_mois === '' ? 0 : Math.round(enNombre(form.prix_par_mois) * 100) / 100,
          prix_total: form.prix_total === '' ? null : arrondirPrix(form.prix_total),
          mode_paiement: modePourEnvoi(form.mode_paiement) || null,
          date_fin: form.date_fin || null,
        },
      })
    } finally {
      setEnCours(false)
    }
  })

  return (
    <Modal
      open
      onClose={onAnnuler}
      size="xxl"
      title={(
        <span className="flex items-center gap-2">
          <Building2 size={19} className="text-ink-700" /> Renouveler Domiciliation
        </span>
      )}
      footer={(
        <>
          <Button variant="secondary" onClick={onAnnuler}>Fermer</Button>
          <Button loading={enCours} disabled={!form.date_depart} onClick={enregistrer}>
            <RefreshCw size={16} /> Renouveler
          </Button>
        </>
      )}
    >
      {erreur && <Alert tone="danger" className="mb-4" onAutoClose={onEffacerErreur}>{erreur}</Alert>}

      {/* Même ordre et même présentation que la capture de référence : chaque rangée est lisible en entier, sans défilement. */}

      {/* Période précédente (lecture seule) que ce renouvellement prolonge. */}
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Ancienne Date de départ">
          <Input type="date" value={domiciliation?.dateDepart ?? ''} readOnly disabled />
        </Field>
        <Field label="Ancienne Date de fin">
          <Input type="date" value={domiciliation?.dateFin ?? ''} readOnly disabled />
        </Field>
      </div>

      {/* Durée : mois payés (facturés) et mois gratuits. */}
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Mois Payés" required>
          <Input type="number" min="0" value={form.mois_payee} onChange={set('mois_payee')} />
        </Field>
        <Field label="Mois Gratuits">
          <Input type="number" min="0" value={form.mois_gratuits} onChange={set('mois_gratuits')} />
        </Field>
      </div>

      {/* Nouvelle période : départ, fin calculée. */}
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Date de départ" required>
          <Input type="date" value={form.date_depart} onChange={set('date_depart')} />
        </Field>
        <Field label="Date de fin" hint={`Calculée : départ + ${dureeMois} mois.`}>
          <Input type="date" value={form.date_fin} readOnly disabled />
        </Field>
      </div>

      {/* Règlement : mode, prix par mois et prix total (HT). */}
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-3">
        <ModePaiementChamp value={form.mode_paiement} onChange={(v) => setForm((f) => ({ ...f, mode_paiement: v }))} />
        <Field
          label="Prix par mois (Dh HT)"
          required
          hint={origineService ? `Repris du service « ${origineService} ».` : undefined}
        >
          <Input type="number" step="0.01" min="0" value={form.prix_par_mois} onChange={set('prix_par_mois')} />
        </Field>
        <Field
          label="Prix total HT (Dh)"
          required
          hint={form.prix_total_manuel
            ? <>Montant saisi à la main. <button type="button" onClick={recalculerTotal} className="font-semibold text-brand-600 hover:underline">Recalculer</button></>
            : 'Prix par mois × mois payés, arrondi à l\'entier (mois gratuits non facturés). Modifiable.'}
        >
          <Input type="number" step="0.01" min="0" value={form.prix_total} onChange={saisirTotal} onBlur={arrondirTotal} />
        </Field>
      </div>

      {/* Facturation : signature puis dates (même présentation que partout : ChampSignature). */}
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <ChampSignature checked={form.signature_sur_facture} onChange={setCheck('signature_sur_facture')} />
        <Field label="Date Facture">
          <Input type="date" value={form.date_facture} onChange={set('date_facture')} />
        </Field>
        <Field label="Date Paiement">
          <Input type="date" value={form.date_paiement} onChange={set('date_paiement')} />
        </Field>
        <Field label="Date Légalisation" required>
          <Input type="date" value={form.date_legalisation} onChange={set('date_legalisation')} />
        </Field>
      </div>

      {/* Documents à produire : les quatre cartes sont toujours visibles, comme sur la capture de référence. */}
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {DOCUMENTS_CASES.map((d) => (
          <div key={d.cle}>
            <span className="mb-1.5 block text-[15px] font-medium text-ink-800">{d.titre}</span>
            <CheckboxCard label={d.label} checked={form[d.cle]} onChange={setCheck(d.cle)} />
          </div>
        ))}
      </div>

    </Modal>
  )
}

/** Journal des actions d'une domiciliation, affiché dans sa fiche. */
export function JournalOperations({ operations = [], urlFichier }) {
  const LIBELLES = {
    renouvellement: { label: 'Renouvelée', icon: <RefreshCw size={14} />, cls: 'text-brand-600' },
    declaration: { label: 'Déclarée', icon: <BadgeCheck size={14} />, cls: 'text-success-600' },
    resiliation: { label: 'Résiliée', icon: <Ban size={14} />, cls: 'text-danger-600' },
    activation: { label: 'Activée', icon: <CircleCheck size={14} />, cls: 'text-success-600' },
  }

  if (operations.length === 0) {
    return <p className="text-sm text-ink-600">Aucune action enregistrée.</p>
  }

  return (
    <ul className="space-y-2">
      {operations.map((o) => {
        const l = LIBELLES[o.type] ?? { label: o.type, icon: null, cls: 'text-ink-700' }
        return (
          <li key={o.id} className="rounded-lg bg-surface px-3.5 py-2.5 text-sm">
            <span className={`flex items-center gap-1.5 font-semibold ${l.cls}`}>{l.icon} {l.label}</span>
            {o.commentaire && <span className="mt-1 block text-ink-800">{o.commentaire}</span>}
            {o.fichierNom && urlFichier && (
              <button
                type="button"
                onClick={() => window.open(urlFichier(o.id), '_blank', 'noopener')}
                className="mt-1 inline-flex items-center gap-1.5 font-medium text-info-600 hover:underline focus-ring"
              >
                <Paperclip size={13} /> {o.fichierNom}
              </button>
            )}
            <span className="mt-1 block text-xs text-ink-600">
              {o.createdAt}{o.par ? ` — ${o.par}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
