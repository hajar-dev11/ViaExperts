import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Printer, FileText, RefreshCw, BadgeCheck, Ban, CircleCheck, Paperclip } from 'lucide-react'
// `CircleCheck` alimente le libellé « Activée » du journal d'actions (menu « Activer »).
import ActionMenu from './ui/ActionMenu.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import { Field, FileInput, Input, Select, Textarea, Checkbox, CheckboxCard } from './Field.jsx'
import { MODES_PAIEMENT } from '../api/domiciliations.js'
import { documentsDisponibles } from '../utils/documentsDomiciliation.js'
import { calculerDateFin, chargerPrixServiceDomiciliation } from '../utils/domiciliation.js'
import { aujourdhui } from '../shared/utils/date.js'

/**
 * « Imprimer » — propose les documents cochés à l'enregistrement de la
 * domiciliation (Facture, Contrat, Attestation, Procuration) et imprime celui
 * que l'on choisit. Si aucune case n'a été cochée, le menu le dit plutôt que
 * de rester vide.
 */
export function MenuImprimer({ domiciliation, signaturePath, icone = <Printer size={16} /> }) {
  const disponibles = documentsDisponibles(domiciliation)
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
export function FormulaireActionSimple({ titre, description, libelleBouton, tone = 'primary', onAnnuler, onEnregistrer }) {
  const [commentaire, setCommentaire] = useState('')
  const [fichier, setFichier] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const enregistrer = async () => {
    setEnCours(true)
    try {
      await onEnregistrer({ commentaire: commentaire.trim(), fichier })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modal
      open
      onClose={onAnnuler}
      title={titre}
      description={description}
      footer={(
        <>
          <Button variant="secondary" onClick={onAnnuler}>Annuler</Button>
          <Button variant={tone} loading={enCours} onClick={enregistrer}>{libelleBouton}</Button>
        </>
      )}
    >
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
export function FormulaireRenouvellement({ domiciliation, onAnnuler, onEnregistrer }) {
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

  // Date de fin et Prix Total suivent la durée saisie.
  const dureeMois = (Number(form.mois_payee) || 0) + (Number(form.mois_gratuits) || 0)
  useEffect(() => {
    setForm((f) => {
      const fin = calculerDateFin(f.date_depart, (Number(f.mois_payee) || 0) + (Number(f.mois_gratuits) || 0))
      const pm = parseFloat(f.prix_par_mois)
      const total = Number.isNaN(pm)
        ? ''
        : (pm * ((Number(f.mois_payee) || 0) + (Number(f.mois_gratuits) || 0))).toFixed(2)
      if (f.date_fin === fin && f.prix_total === total) return f
      return { ...f, date_fin: fin, prix_total: total }
    })
  }, [form.date_depart, form.mois_payee, form.mois_gratuits, form.prix_par_mois])

  const enregistrer = async () => {
    setEnCours(true)
    try {
      await onEnregistrer({
        champs: {
          ...form,
          mois_payee: Number(form.mois_payee) || 0,
          mois_gratuits: Number(form.mois_gratuits) || 0,
          prix_par_mois: form.prix_par_mois === '' ? 0 : Number(form.prix_par_mois),
          prix_total: form.prix_total === '' ? 0 : Number(form.prix_total),
          mode_paiement: form.mode_paiement || null,
          date_fin: form.date_fin || null,
        },
      })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modal
      open
      onClose={onAnnuler}
      size="lg"
      title={(
        <span className="flex items-center gap-2">
          <Building2 size={19} className="text-ink-700" /> Renouveler Domiciliation
        </span>
      )}
      footer={(
        <>
          <Button variant="secondary" onClick={onAnnuler}>Close</Button>
          <Button loading={enCours} disabled={!form.date_depart} onClick={enregistrer}>
            <RefreshCw size={16} /> Renouveler
          </Button>
        </>
      )}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ancienne Date de depart">
          <Input type="date" value={domiciliation?.dateDepart ?? ''} readOnly disabled />
        </Field>
        <Field label="Ancienne Date de fin">
          <Input type="date" value={domiciliation?.dateFin ?? ''} readOnly disabled />
        </Field>

        <Field label="Mois Payée" required>
          <Input type="number" min="0" value={form.mois_payee} onChange={set('mois_payee')} />
        </Field>
        <Field label="Mois Gratuits">
          <Input type="number" min="0" value={form.mois_gratuits} onChange={set('mois_gratuits')} />
        </Field>

        <Field label="Date de depart" required>
          <Input type="date" value={form.date_depart} onChange={set('date_depart')} />
        </Field>
        <Field label="Date de fin" hint={`Calculée : date de départ + ${dureeMois} mois.`}>
          <Input type="date" value={form.date_fin} readOnly disabled />
        </Field>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <Field label="Mode de Paiement">
          <Select value={form.mode_paiement} onChange={set('mode_paiement')}>
            <option value="">Au choix du client</option>
            {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field
          label="Prix Par Mois (Dh)"
          required
          hint={origineService ? `Repris du service « ${origineService} ».` : undefined}
        >
          <Input type="number" step="0.01" min="0" value={form.prix_par_mois} onChange={set('prix_par_mois')} />
        </Field>
        <Field label="Prix Totale (Dh)" required hint="Prix par mois × (Payée + Gratuits).">
          <Input type="number" value={form.prix_total} readOnly disabled />
        </Field>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Signature">
          <div className="flex h-11 items-center rounded-lg border border-line bg-white px-4">
            <Checkbox
              label="Signature sur Facture"
              checked={form.signature_sur_facture}
              onChange={setCheck('signature_sur_facture')}
            />
          </div>
        </Field>
        <Field label="Date Facture">
          <Input type="date" value={form.date_facture} onChange={set('date_facture')} />
        </Field>
        <Field label="Date Paiement">
          <Input type="date" value={form.date_paiement} onChange={set('date_paiement')} />
        </Field>
        <Field label="Date Galisation" required>
          <Input type="date" value={form.date_legalisation} onChange={set('date_legalisation')} />
        </Field>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DOCUMENTS_CASES.map((d) => (
          <div key={d.cle}>
            <span className="mb-1.5 block text-sm font-medium text-ink-800">{d.titre}</span>
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
            <span className="mt-1 block text-[11px] text-ink-600">
              {o.createdAt}{o.par ? ` — ${o.par}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
