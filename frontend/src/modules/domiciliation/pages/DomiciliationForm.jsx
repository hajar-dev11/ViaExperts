import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Save, Archive, Trash2, Building2, ListTree, Pencil,
  CalendarDays, Wallet, Coins, CreditCard, Stamp,
} from 'lucide-react'
import DataTable from '../../../components/DataTable.jsx'
import EmptyState from '../../../components/EmptyState.jsx'
import ConfirmDialog from '../../../components/ConfirmDialog.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import Button from '../../../components/ui/Button.jsx'
import { FieldRow, Field, Input, Select, Checkbox, CheckboxCard, FormCard, FormActions } from '../../../components/Field.jsx'
import { MenuImprimer } from '../components/DomiciliationActions.jsx'
import { listEntreprises } from '../../../api/entreprises.js'
import { ApiError } from '../../../api/http.js'
import { chargerSignatureDomiciliation } from '../documents/documentsDomiciliation.js'
import { getIdentiteDomiciliation } from '../../../api/settings.js'
import { calculerDateFin } from '../utils/domiciliation.js'
import { aujourdhui } from '../../../shared/utils/date.js'
import { formatDateHeure } from '../../../utils/format.js'
import {
  listDomiciliations, createDomiciliation, updateDomiciliation,
  getDomiciliation, archiveDomiciliation, corbeilleDomiciliation,
} from '../api/domiciliations.js'
import { MODES_PAIEMENT } from '../../../shared/constants/documents.js'

const DOCUMENTS_CASES = [
  { cle: 'doc_facture', titre: 'Ajouter Facture de domiciliation', label: 'Facture de domiciliation' },
  { cle: 'doc_contrat', titre: 'Ajouter Contrat de domiciliation', label: 'Contrat de domiciliation' },
  { cle: 'doc_attestation', titre: 'Ajouter Attestation de domiciliation', label: 'Attestation de domiciliation' },
  { cle: 'doc_procuration', titre: 'Ajouter Procuration', label: 'Procuration' },
]

// `date_fin` par défaut calculée UNE FOIS, à partir des valeurs par défaut
// elles-mêmes (départ = aujourd'hui, 12 mois payés) — ce n'est pas un effet
// réactif : Prix par mois / Prix total, eux, ne bougent jamais tout seuls
// (voir `setEtRecalculer` dans le composant).
const dateDepartParDefaut = aujourdhui()

const emptyForm = {
  entreprise_id: '', centre_domiciliation_id: '',
  ancienne_date_depart: '', ancienne_date_fin: '',
  mois_payee: 12, mois_gratuits: 0,
  date_depart: dateDepartParDefaut, date_fin: calculerDateFin(dateDepartParDefaut, 12),
  mode_paiement: '', prix_par_mois: '104.17', prix_total: '0',
  signature_sur_facture: true,
  date_facture: aujourdhui(), date_paiement: aujourdhui(), date_legalisation: '',
  doc_facture: false, doc_contrat: false, doc_attestation: false, doc_procuration: false,
}

const toForm = (d) => ({
  entreprise_id: d.entrepriseId ?? '',
  centre_domiciliation_id: d.centreId ?? '',
  ancienne_date_depart: '',
  ancienne_date_fin: '',
  mois_payee: d.moisPayee ?? 0,
  mois_gratuits: d.moisGratuits ?? 0,
  date_depart: d.dateDepart ?? '',
  date_fin: d.dateFin ?? '',
  mode_paiement: d.modePaiement ?? '',
  prix_par_mois: d.prixParMois ?? '',
  prix_total: d.prixTotal ?? '0',
  signature_sur_facture: !!d.signatureSurFacture,
  date_facture: d.dateFacture ?? '',
  date_paiement: d.datePaiement ?? '',
  date_legalisation: d.dateLegalisation ?? '',
  doc_facture: !!d.docFacture,
  doc_contrat: !!d.docContrat,
  doc_attestation: !!d.docAttestation,
  doc_procuration: !!d.docProcuration,
})

export default function DomiciliationForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [form, setForm] = useState(emptyForm)
  const [entreprises, setEntreprises] = useState([])
  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [signaturePath, setSignaturePath] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setCheck = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }))

  const loadRows = useCallback(() => {
    listDomiciliations({ status: 'actif' }).then(setRows).catch(() => setRows([]))
  }, [])

  useEffect(() => {
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
    chargerSignatureDomiciliation(getIdentiteDomiciliation).then(setSignaturePath)
    loadRows()
  }, [loadRows])

  const charger = useCallback(() => {
    if (!isEdit) return
    getDomiciliation(id).then((d) => { setErreurChargement(''); setForm(toForm(d)) }).catch(() => setErreurChargement('Domiciliation introuvable.'))
  }, [id, isEdit])

  useEffect(() => {
    charger()
  }, [charger])

  // Entreprise choisie : dernière domiciliation connue (Ancienne Date de
  // départ/fin + Centre repris automatiquement), sinon le centre déjà associé
  // à la fiche Entreprise. Aucun champ Centre n'est affiché à l'écran — comme
  // la capture de référence — le centre est dérivé, jamais ressaisi.
  useEffect(() => {
    if (isEdit || !form.entreprise_id) return
    const derniere = rows
      .filter((r) => String(r.entrepriseId) === String(form.entreprise_id))
      .sort((a, b) => String(b.dateDepart ?? '').localeCompare(String(a.dateDepart ?? '')))[0]
    const entreprise = entreprises.find((e) => String(e.id) === String(form.entreprise_id))

    setForm((f) => ({
      ...f,
      ancienne_date_depart: derniere?.dateDepart ?? '',
      ancienne_date_fin: derniere?.dateFin ?? '',
      centre_domiciliation_id: derniere?.centreId ?? entreprise?.centreDomiciliationId ?? '',
    }))
  }, [form.entreprise_id, rows, entreprises, isEdit])

  // Durée du contrat = mois payés + mois gratuits. Elle pilote la date de fin
  // ET le prix total, exactement comme dans « Ajouter Entreprise ».
  const dureeMois = (Number(form.mois_payee) || 0) + (Number(form.mois_gratuits) || 0)

  // Prix par mois / Prix total ne doivent JAMAIS changer tout seuls au
  // chargement de la page (pas d'effet réactif ici, volontairement) : le
  // recalcul n'est déclenché que par une saisie explicite de l'utilisateur
  // sur l'un des 4 champs concernés — voir `setEtRecalculer` ci-dessous,
  // branché sur leurs `onChange` à la place de `set(...)`.
  const setEtRecalculer = (k) => (e) => {
    const valeur = e.target.value
    setForm((f) => {
      const next = { ...f, [k]: valeur }
      const duree = (Number(next.mois_payee) || 0) + (Number(next.mois_gratuits) || 0)
      const fin = calculerDateFin(next.date_depart, duree)
      const pm = parseFloat(next.prix_par_mois)
      const total = Number.isNaN(pm) ? '0' : (pm * duree).toFixed(2)
      return { ...next, date_fin: fin || next.date_fin, prix_total: total }
    })
  }

  const entrepriseChoisie = useMemo(
    () => entreprises.find((e) => String(e.id) === String(form.entreprise_id)),
    [entreprises, form.entreprise_id]
  )

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!form.centre_domiciliation_id) {
      setError("Cette entreprise n'a pas de centre de domiciliation : renseignez-le d'abord sur sa fiche Entreprise.")
      return
    }

    setSaving(true); setErrors({})
    try {
      const payload = {
        entreprise_id: Number(form.entreprise_id),
        centre_domiciliation_id: Number(form.centre_domiciliation_id),
        mois_payee: Number(form.mois_payee) || 0,
        mois_gratuits: Number(form.mois_gratuits) || 0,
        date_depart: form.date_depart,
        date_fin: form.date_fin || null,
        mode_paiement: form.mode_paiement || null,
        prix_par_mois: form.prix_par_mois === '' ? 0 : Number(form.prix_par_mois),
        prix_total: form.prix_total === '' ? 0 : Number(form.prix_total),
        signature_sur_facture: form.signature_sur_facture,
        date_facture: form.date_facture || null,
        date_paiement: form.date_paiement || null,
        date_legalisation: form.date_legalisation || null,
        doc_facture: form.doc_facture,
        doc_contrat: form.doc_contrat,
        doc_attestation: form.doc_attestation,
        doc_procuration: form.doc_procuration,
      }

      if (isEdit) {
        await updateDomiciliation(id, payload)
        setSuccess('Domiciliation modifiée avec succès.')
      } else {
        await createDomiciliation(payload)
        setSuccess('Domiciliation enregistrée avec succès.')
        setForm({ ...emptyForm, prix_par_mois: form.prix_par_mois })
      }
      loadRows()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  const run = async (fn, message) => {
    setError(''); setSuccess('')
    try {
      await fn()
      setSuccess(message)
      loadRows()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const e1 = (k) => errors[k]?.[0]

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-4">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-4" onRetry={() => { setErreurChargement(''); charger() }}>{erreurChargement}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')} className="mb-4">{success}</Alert>}

      <form onSubmit={submit}>
        {/* Un seul cadre, pleine largeur — titre, champs et boutons
            Annuler/Enregistrer dans le même bloc blanc. */}
        <FormCard
          title={isEdit ? 'Modifier la Domiciliation' : 'Nouvelle Domiciliation'}
          footer={(
            <FormActions>
              {isEdit && (
                <Button type="button" variant="secondary" onClick={() => navigate('/domiciliation')}>
                  Annuler
                </Button>
              )}
              <Button type="submit" variant="primary" icon={<Save size={18} />} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </FormActions>
          )}
        >
          <FieldRow label="Entreprise" required htmlFor="d-entreprise" error={e1('entreprise_id')}>
            <Select
              id="d-entreprise"
              icon={<Building2 size={17} />}
              required
              value={form.entreprise_id}
              onChange={set('entreprise_id')}
              error={e1('entreprise_id')}
            >
              <option value="">Sélectionnez une Entreprise</option>
              {entreprises.map((e) => <option key={e.id} value={e.id}>{e.denomination}</option>)}
            </Select>
          </FieldRow>

          {entrepriseChoisie && !form.centre_domiciliation_id && (
            <Alert tone="warning" className="mt-4">
              Cette entreprise n'a pas encore de centre de domiciliation associé : renseignez-le sur sa fiche Entreprise avant d'enregistrer.
            </Alert>
          )}

          <div className="mt-5 grid gap-x-10 gap-y-5 lg:grid-cols-2">
            <Field label="Ancienne Date de depart">
              <Input type="date" value={form.ancienne_date_depart} readOnly disabled />
            </Field>
            <Field label="Ancienne Date de fin">
              <Input type="date" value={form.ancienne_date_fin} readOnly disabled />
            </Field>

            <Field label="Mois Payée" required error={e1('mois_payee')}>
              <Input type="number" min="0" required value={form.mois_payee} onChange={setEtRecalculer('mois_payee')} error={e1('mois_payee')} />
            </Field>
            <Field label="Mois Gratuits">
              <Input type="number" min="0" value={form.mois_gratuits} onChange={setEtRecalculer('mois_gratuits')} />
            </Field>

            <Field label="Date de depart" required error={e1('date_depart')}>
              <Input type="date" required value={form.date_depart} onChange={setEtRecalculer('date_depart')} error={e1('date_depart')} />
            </Field>
            <Field label="Date de fin" hint={`Calculée : date de départ + ${dureeMois} mois (Payée + Gratuits).`}>
              <Input type="date" value={form.date_fin} readOnly disabled />
            </Field>
          </div>

          <div className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-3">
            <Field label="Mode de Paiement">
              <Select icon={<CreditCard size={17} />} value={form.mode_paiement} onChange={set('mode_paiement')}>
                <option value="">Au choix du client</option>
                {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field
              label="Prix Par Mois (Dh)"
              required
              error={e1('prix_par_mois')}
              hint="Valeur par défaut : 104,17 Dh (modifiable)."
            >
              <Input icon={<Wallet size={17} />} type="number" step="0.01" min="0" required
                value={form.prix_par_mois} onChange={setEtRecalculer('prix_par_mois')} error={e1('prix_par_mois')} />
            </Field>
            <Field label="Prix Totale (Dh)" required hint="Prix par mois × (Payée + Gratuits).">
              <Input icon={<Coins size={17} />} type="number" value={form.prix_total} readOnly disabled />
            </Field>
          </div>

          <div className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Signature">
              <div className="flex h-11 items-center rounded-lg border border-line bg-white px-4">
                <Checkbox
                  label="Signature sur Facture"
                  checked={form.signature_sur_facture}
                  onChange={setCheck('signature_sur_facture')}
                />
              </div>
            </Field>
            <Field label="Date Facture" required>
              <Input icon={<CalendarDays size={17} />} type="date" required value={form.date_facture} onChange={set('date_facture')} />
            </Field>
            <Field label="Date Paiement" required>
              <Input icon={<CalendarDays size={17} />} type="date" required value={form.date_paiement} onChange={set('date_paiement')} />
            </Field>
            <Field label="Date Galisation" required>
              <Input icon={<CalendarDays size={17} />} type="date" required value={form.date_legalisation} onChange={set('date_legalisation')} />
            </Field>
          </div>

          <div className="my-6 border-t border-line" />

          {/* Les cases cochées ici décident des documents proposés ensuite
              par « Imprimer » dans les listes. */}
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Stamp size={17} className="text-ink-700" /> Documents du dossier
          </div>
          <p className="mt-1 mb-4 text-xs text-ink-600">
            Les documents cochés seront proposés à l'impression depuis la liste des domiciliations.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DOCUMENTS_CASES.map((d) => (
              <div key={d.cle}>
                <span className="mb-1.5 block text-sm font-medium text-ink-800">{d.titre}</span>
                <CheckboxCard label={d.label} checked={form[d.cle]} onChange={setCheck(d.cle)} />
              </div>
            ))}
          </div>
        </FormCard>
      </form>

      <div className="mt-8">
        <h2 className="mb-3 text-xl text-ink-900">Domiciliations ajoutées</h2>
        {rows.length === 0 ? (
          <EmptyState title="Aucune domiciliation enregistrée" />
        ) : (
          <DataTable
            columns={[
              {
                key: 'denomination',
                header: 'Entreprise',
                render: (r) => (
                  <Link to={`/domiciliation/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                    {r.denomination}
                  </Link>
                ),
              },
              { key: 'moisPayee', header: 'Mois payés' },
              { key: 'moisGratuits', header: 'Mois gratuits' },
              { key: 'dateLegalisation', header: 'Date légalisation' },
              { key: 'dateDepart', header: 'Date départ' },
              { key: 'dateFin', header: 'Date fin' },
              { key: 'prixTotal', header: 'Prix payé', numeric: true },
              { key: 'createdAt', header: 'Date opération', render: (r) => formatDateHeure(r.createdAt) },
              { key: 'createdBy', header: 'Action de', value: (r) => r.createdBy || '—' },
            ]}
            rows={rows}
            actionsHeader="ACTION"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                <MenuImprimer domiciliation={r} signaturePath={signaturePath} />
                <ActionMenu
                  label="Actions"
                  icon={<ListTree size={15} />}
                  items={[
                    {
                      label: 'Modifier',
                      icon: <Pencil size={15} />,
                      // Même formulaire que la création, en mode modification (données préremplies) ;
                      // remonter en haut de page pour que le formulaire soit visible.
                      onClick: () => {
                        navigate(`/domiciliation/${r.id}/modifier`)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      },
                    },
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
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
              </div>
            )}
          />
        )}
      </div>

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
