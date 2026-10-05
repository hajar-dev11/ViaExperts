import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Save, Plus, X } from 'lucide-react'
import { Field, Input, Select, Textarea, Switch, FormCard, FormActions, FileInput } from '../components/Field.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { ApiError } from '../api/http.js'
import { listClients } from '../api/clients.js'
import { listEntreprises } from '../api/entreprises.js'
import { listServices } from '../api/services.js'
import { EMETTEURS, MODES_PAIEMENT } from '../shared/constants/documents.js'
import { aujourdhui } from '../utils/domiciliation.js'
import { createPaiement, updatePaiement, getPaiement } from '../api/paiements.js'

const n = (v) => {
  const x = parseFloat(v)
  return Number.isNaN(x) ? 0 : x
}

const jour = aujourdhui()

export default function PaiementForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id

  const [emetteur, setEmetteur] = useState('via_experts')
  const [showEntreprises, setShowEntreprises] = useState(true)
  const [showClients, setShowClients] = useState(true)

  const [form, setForm] = useState({
    party_id: '',
    document_id: searchParams.get('document') || '',
    date_operation: jour,
    date_credit: jour,
    mode_paiement: '',
    signature: true,
    observation: '',
    prix_paye: '',
  })
  const [lignes, setLignes] = useState([])
  const [serviceChoisi, setServiceChoisi] = useState('')
  const [fichier, setFichier] = useState(null)

  const [clients, setClients] = useState([])
  const [entreprises, setEntreprises] = useState([])
  const [services, setServices] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
    listServices('actif').then(setServices).catch(() => setServices([]))
  }, [])

  useEffect(() => {
    if (!isEdit) return
    getPaiement(id)
      .then((p) => {
        setEmetteur(p.emetteur)
        setForm({
          party_id: p.partyId ?? '',
          document_id: p.documentId ?? '',
          date_operation: (p.dateOperation || '').slice(0, 10),
          date_credit: p.dateCredit ?? '',
          mode_paiement: p.modePaiement ?? '',
          signature: !!p.signature,
          observation: p.observation ?? '',
          prix_paye: p.prixPaye ?? '',
        })
        setLignes((p.lignes || []).map((l) => ({
          service_id: l.serviceId ?? '',
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire: l.prixUnitaire,
        })))
      })
      .catch(() => setError('Paiement introuvable.'))
  }, [id, isEdit])

  // Même règle que le module Facturation : un service Via Experts ne se
  // propose que sous cet émetteur, un service Maître que sous l'autre.
  const servicesResponsable = useMemo(
    () => services.filter((s) => !!s.via_experts === (emetteur === 'via_experts')),
    [services, emetteur]
  )

  useEffect(() => {
    if (serviceChoisi && !servicesResponsable.some((s) => String(s.id) === String(serviceChoisi))) {
      setServiceChoisi('')
    }
  }, [servicesResponsable, serviceChoisi])

  const ajouterLigne = () => {
    const service = servicesResponsable.find((s) => String(s.id) === String(serviceChoisi))
    setLignes((ls) => [...ls, service
      ? { service_id: service.id, designation: service.nom, quantite: 1, prix_unitaire: service.prix }
      : { service_id: '', designation: '', quantite: 1, prix_unitaire: 0 }])
    setServiceChoisi('')
  }

  const majLigne = (i, k, v) => setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const retirerLigne = (i) => setLignes((ls) => ls.filter((_, idx) => idx !== i))

  const total = useMemo(
    () => lignes.reduce((acc, l) => acc + n(l.quantite) * n(l.prix_unitaire), 0),
    [lignes],
  )
  const prixRestant = Math.max(0, total - n(form.prix_paye))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setErrors({}); setError('')
    try {
      const payload = {
        emetteur,
        responsable: EMETTEURS.find((x) => x.value === emetteur)?.label || '',
        party_id: Number(form.party_id),
        document_id: form.document_id || '',
        date_operation: form.date_operation,
        date_credit: form.date_credit,
        mode_paiement: form.mode_paiement,
        signature: form.signature,
        observation: form.observation,
        prix_paye: form.prix_paye === '' ? 0 : Number(form.prix_paye),
        lignes: lignes.map((l) => ({
          service_id: l.service_id || '',
          designation: l.designation,
          quantite: Number(l.quantite) || 0,
          prix_unitaire: Number(l.prix_unitaire) || 0,
        })),
      }
      if (fichier) payload.piece_jointe = fichier

      if (isEdit) await updatePaiement(id, payload)
      else await createPaiement(payload)
      navigate('/paiement')
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  const err = (k) => errors[k] && <span className="mt-1 block text-xs text-danger-600">{errors[k][0]}</span>

  const tiers = [
    ...(showEntreprises ? entreprises.map((e) => ({ id: e.id, label: e.denomination, groupe: 'Entreprises' })) : []),
    ...(showClients ? clients.map((c) => ({ id: c.id, label: c.nom, groupe: 'Clients' })) : []),
  ]

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      <form onSubmit={submit}>
        <FormCard
          title={isEdit ? 'Modifier le Paiement' : 'Ajouter Paiement'}
          footer={(
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => navigate('/paiement')}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" icon={<Save size={16} />} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Sauvegarder'}
              </Button>
            </FormActions>
          )}
        >
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            {EMETTEURS.map((e) => (
              <label
                key={e.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3.5 transition-colors ${
                  emetteur === e.value ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="emetteur"
                  checked={emetteur === e.value}
                  onChange={() => setEmetteur(e.value)}
                  className="h-4 w-4 text-brand-600 focus:ring-brand-500/40"
                />
                <span className="text-sm font-medium text-ink-900">{e.label}</span>
                <span className="ml-auto text-sm text-slate-400">{e.sousTitre}</span>
              </label>
            ))}
          </div>

          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="mb-1.5 flex items-center gap-4">
                <Switch label="Entreprises" checked={showEntreprises} onChange={(e) => setShowEntreprises(e.target.checked)} />
                <Switch label="Clients" checked={showClients} onChange={(e) => setShowClients(e.target.checked)} />
              </div>
              <Select required value={form.party_id} onChange={set('party_id')}>
                <option value="">Sélectionner Entreprise/Client</option>
                {tiers.map((t) => <option key={`${t.groupe}-${t.id}`} value={t.id}>{t.label} — {t.groupe}</option>)}
              </Select>
              {err('party_id')}
            </div>

            <Field label="Date d'opération" required>
              <Input type="date" required value={form.date_operation} onChange={set('date_operation')} />
              {err('date_operation')}
            </Field>

            <Field label="Date Crédit">
              <Input type="date" value={form.date_credit} onChange={set('date_credit')} />
            </Field>

            <Field label="Mode de Paiement">
              <Select value={form.mode_paiement} onChange={set('mode_paiement')}>
                <option value="">Au choix du client</option>
                {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>

            <Field label="Signature">
              <label className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-white px-3.5 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={form.signature}
                  onChange={(e) => setForm((f) => ({ ...f, signature: e.target.checked }))}
                  className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500/40"
                />
                Ajouter la Signature
              </label>
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-800">Services</span>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select value={serviceChoisi} onChange={(e) => setServiceChoisi(e.target.value)}>
                    <option value="">Sélectionner le Service</option>
                    {servicesResponsable.map((s) => <option key={s.id} value={s.id}>{s.nom} — {s.prix} Dh</option>)}
                  </Select>
                </div>
                <Button type="button" variant="success-soft" icon={<Plus size={15} />} onClick={ajouterLigne}>
                  Ajouter
                </Button>
              </div>
            </div>
          </div>

          {lignes.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[13px] font-semibold tracking-wide uppercase text-ink-600">
                    <th className="py-2 pr-2">Désignation</th>
                    <th className="w-24 px-2 py-2">Qté</th>
                    <th className="w-32 px-2 py-2">Prix</th>
                    <th className="w-32 px-2 py-2 text-right">Total</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 pr-2"><Input required value={l.designation} onChange={(e) => majLigne(i, 'designation', e.target.value)} placeholder="Désignation" /></td>
                      <td className="px-2 py-2"><Input type="number" step="0.01" min="0" value={l.quantite} onChange={(e) => majLigne(i, 'quantite', e.target.value)} /></td>
                      <td className="px-2 py-2"><Input type="number" step="0.01" min="0" value={l.prix_unitaire} onChange={(e) => majLigne(i, 'prix_unitaire', e.target.value)} /></td>
                      <td className="px-2 py-2 text-right font-semibold text-ink-900">{(n(l.quantite) * n(l.prix_unitaire)).toFixed(2)}</td>
                      <td className="py-2">
                        <RowBtn title="Retirer" onClick={() => retirerLigne(i)} className="hover:bg-danger-50 hover:text-danger-600">
                          <X size={15} />
                        </RowBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {errors.lignes && <span className="mt-2 block text-xs text-danger-600">{errors.lignes[0]}</span>}

          <Field label="Pièce jointe" className="mt-5" hint="5 Mo maximum.">
            <FileInput onChange={(e) => setFichier(e.target.files?.[0] || null)} />
            {err('piece_jointe')}
          </Field>

          <Field label="Observation" className="mt-5">
            <Textarea rows={6} value={form.observation} onChange={set('observation')} />
          </Field>

          <Field label="Total" className="mt-5">
            <Input
              readOnly
              value={total.toFixed(2)}
              className="border-emerald-400 bg-emerald-50/50 text-ink-900 focus:border-emerald-500 focus:ring-emerald-500/20"
            />
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Prix Payer">
              <Input type="number" step="0.01" min="0" value={form.prix_paye} onChange={set('prix_paye')} placeholder="0.00" />
              {err('prix_paye')}
            </Field>
            <Field label="Prix Restants">
              <Input readOnly value={prixRestant.toFixed(2)} className="border-slate-200 bg-slate-100 text-slate-500" />
            </Field>
          </div>
        </FormCard>
      </form>
    </div>
  )
}
