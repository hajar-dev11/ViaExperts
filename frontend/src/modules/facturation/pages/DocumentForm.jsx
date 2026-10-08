import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, X, Plus } from 'lucide-react'
import { Field, Input, Select, Textarea, Checkbox, FormCard, FormActions } from '../../../components/Field.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import { RowBtn } from '../../../components/ListToolbar.jsx'
import { ApiError } from '../../../api/http.js'
import { listClients } from '../../../api/clients.js'
import { listEntreprises } from '../../../api/entreprises.js'
import { listServices } from '../../../api/services.js'
import { aujourdhui } from '../../../shared/utils/date.js'
import {
  EMETTEURS, MODES_PAIEMENT, createDocument, updateDocument, getDocument, getNumeroPropose,
} from '../api/facturation.js'

const emptyLigne = { service_id: '', designation: '', quantite: 1, prix_unitaire: 0, remise_pourcent: 0, tva_pourcent: 20 }

const n = (v) => {
  const x = parseFloat(v)
  return Number.isNaN(x) ? 0 : x
}

// Champ calculé, en lecture seule : vert dès qu'il porte un montant, rose à
// zéro — reprend exactement le code couleur de la capture de référence.
const toneClasses = (v) => (n(v) > 0
  ? 'border-success-300 bg-success-50 text-success-700'
  : 'border-danger-200 bg-danger-50 text-danger-600')

function ChampCalcule({ label, value, bold = false }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      <div className={`tabular flex h-11 items-center rounded-lg border px-3.5 text-sm ${bold ? 'font-bold' : 'font-semibold'} ${toneClasses(value)}`}>
        {n(value).toFixed(2)}
      </div>
    </div>
  )
}

// Numéro : jamais pré-rempli, seul le placeholder change selon le type — le
// numéro réel reste entièrement à la saisie de l'utilisatrice.
const NUMERO_PLACEHOLDER = { facture: 'FAC-000/25', devis: 'DEV-000/25', bl: 'BL-000/25', avoir: 'FAV-000/25' }
const NOTE_LABEL = {
  facture: 'Note Ajouter Sur Facture',
  devis: 'Note à ajouter sur devis',
  bl: 'Note à ajouter sur bon de livraison',
  avoir: "Note à ajouter sur facture d'avoir",
}

export default function DocumentForm({ title, type, listTo, dateLabel = 'Date Facture', secondDateLabel }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  // Seule la Facture porte un règlement (Date Paiement / Date de Crédit /
  // Prix Payer / Prix Restants) : Devis, Bon de Livraison et Facture d'Avoir
  // s'arrêtent aux totaux, comme demandé.
  const avecPaiement = type === 'facture'

  const [emetteur, setEmetteur] = useState('bureau_comptabilite')
  const [showEntreprises, setShowEntreprises] = useState(true)
  const [showClients, setShowClients] = useState(true)

  const [form, setForm] = useState({
    party_id: '', numero: '', responsable: '',
    date_document: aujourdhui(), date_paiement: aujourdhui(), date_credit: '',
    mode_paiement: '', signature: true, note: '', prix_paye: '',
  })
  const [lignes, setLignes] = useState([])
  const [serviceChoisi, setServiceChoisi] = useState('')

  const [clients, setClients] = useState([])
  const [entreprises, setEntreprises] = useState([])
  const [services, setServices] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
    listServices('actif').then(setServices).catch(() => setServices([]))
  }, [])

  // Seul le Responsable est proposé par les paramètres de l'émetteur choisi
  // (domiciliation_settings pour Via Experts, cabinet_settings pour le Bureau).
  // Le Numéro, lui, n'est JAMAIS pré-rempli : il reste vide, avec pour seul
  // repère son placeholder (FAC-000/25…), jusqu'à ce qu'il soit saisi.
  const chargerResponsable = useCallback((emetteurChoisi) => {
    getNumeroPropose(type, emetteurChoisi)
      .then((res) => setForm((f) => ({
        ...f,
        responsable: res.responsable || EMETTEURS.find((e) => e.value === emetteurChoisi)?.label || '',
      })))
      .catch(() => {})
  }, [type])

  useEffect(() => {
    if (!isEdit) chargerResponsable(emetteur)
  }, [emetteur, isEdit, chargerResponsable])

  const charger = useCallback(() => {
    if (!isEdit) return
    getDocument(type, id)
      .then((d) => {
        setErreurChargement('')
        setEmetteur(d.emetteur)
        setForm({
          party_id: d.partyId ?? '',
          numero: d.numero ?? '',
          responsable: d.responsable ?? '',
          date_document: (d.dateDocument || '').slice(0, 10),
          date_paiement: d.datePaiement ?? '',
          date_credit: d.dateCredit ?? '',
          mode_paiement: d.modePaiement ?? '',
          signature: !!d.signature,
          note: d.note ?? '',
          prix_paye: d.prixPaye ?? '',
        })
        setLignes((d.lignes || []).map((l) => ({
          service_id: l.serviceId ?? '',
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire: l.prixUnitaire,
          remise_pourcent: l.remisePourcent,
          tva_pourcent: l.tvaPourcent,
        })))
      })
      .catch(() => setErreurChargement('Document introuvable.'))
  }, [id, isEdit, type])

  useEffect(() => {
    charger()
  }, [charger])

  // Un service « Via Experts » ne se propose que sous l'émetteur Via Experts,
  // un service rattaché à un maître (Bureau de Comptabilité) que sous l'autre
  // — jamais les deux à la fois.
  const servicesResponsable = useMemo(
    () => services.filter((s) => !!s.via_experts === (emetteur === 'via_experts')),
    [services, emetteur]
  )

  // Reset la sélection si le service choisi ne correspond plus au responsable
  // après un changement d'émetteur.
  useEffect(() => {
    if (serviceChoisi && !servicesResponsable.some((s) => String(s.id) === String(serviceChoisi))) {
      setServiceChoisi('')
    }
  }, [servicesResponsable, serviceChoisi])

  // Choisir un service remplit automatiquement la Note avec sa description
  // (page Services) ; changer de service la met à jour, sans jamais la
  // cumuler avec un choix précédent.
  const choisirService = (idService) => {
    setServiceChoisi(idService)
    const service = servicesResponsable.find((s) => String(s.id) === String(idService))
    setForm((f) => ({ ...f, note: service?.description || '' }))
  }

  const ajouterLigne = () => {
    const service = servicesResponsable.find((s) => String(s.id) === String(serviceChoisi))
    setLignes((ls) => [...ls, service
      ? { ...emptyLigne, service_id: service.id, designation: service.nom, prix_unitaire: service.prix }
      : { ...emptyLigne }])
    setServiceChoisi('')
  }

  const majLigne = (i, k, v) => setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const retirerLigne = (i) => setLignes((ls) => ls.filter((_, idx) => idx !== i))

  // Totaux calculés à l'identique du backend (Remise et TVA en %, ligne par ligne).
  const totaux = useMemo(() => {
    let ht = 0, remise = 0, tva = 0
    lignes.forEach((l) => {
      const brut = n(l.quantite) * n(l.prix_unitaire)
      const r = brut * (n(l.remise_pourcent) / 100)
      const net = brut - r
      ht += brut; remise += r; tva += net * (n(l.tva_pourcent) / 100)
    })
    const netHt = ht - remise
    return { ht, remise, netHt, tva, ttc: netHt + tva }
  }, [lignes])

  const prixRestant = Math.max(0, totaux.ttc - n(form.prix_paye))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setErrors({}); setError('')
    try {
      const payload = {
        emetteur,
        responsable: form.responsable || null,
        party_id: Number(form.party_id),
        numero: form.numero,
        date_document: form.date_document,
        date_paiement: avecPaiement ? (form.date_paiement || null) : null,
        date_credit: avecPaiement ? (form.date_credit || null) : null,
        mode_paiement: form.mode_paiement || null,
        signature: form.signature,
        note: form.note || null,
        prix_paye: avecPaiement ? (form.prix_paye === '' ? 0 : Number(form.prix_paye)) : 0,
        lignes: lignes.map((l) => ({
          service_id: l.service_id || null,
          designation: l.designation,
          quantite: Number(l.quantite) || 0,
          prix_unitaire: Number(l.prix_unitaire) || 0,
          remise_pourcent: Number(l.remise_pourcent) || 0,
          tva_pourcent: Number(l.tva_pourcent) || 0,
        })),
      }

      if (isEdit) await updateDocument(type, id, payload)
      else await createDocument(type, payload)
      navigate(listTo)
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
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={() => { setErreurChargement(''); charger() }}>{erreurChargement}</Alert>}

      <form onSubmit={submit}>
        {/* Un seul cadre, pleine largeur — titre, tous les champs et les
            boutons Annuler/Sauvegarder dans le même bloc blanc. */}
        <FormCard
          title={isEdit ? `Modifier — ${title}` : title}
          footer={(
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => navigate(listTo)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" icon={<Save size={16} />} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Sauvegarder'}
              </Button>
            </FormActions>
          )}
        >
          {/* Les 2 émetteurs de la référence : chacun porte sa propre numérotation. */}
          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            {EMETTEURS.map((e) => (
              <label
                key={e.value}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3.5 cursor-pointer transition-colors ${
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

          {/* Grille à 4 colonnes de la référence — les champs s'enchaînent dans
              son ordre exact ; ceux propres à la Facture (avecPaiement) n'en
              retirent que des cases, jamais la grille elle-même. */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-4 mb-1.5">
                <Checkbox label="Entreprises" checked={showEntreprises} onChange={(e) => setShowEntreprises(e.target.checked)} />
                <Checkbox label="Clients" checked={showClients} onChange={(e) => setShowClients(e.target.checked)} />
              </div>
              <Select required value={form.party_id} onChange={set('party_id')}>
                <option value="">Sélectionner Entreprise/Client</option>
                {tiers.map((t) => <option key={`${t.groupe}-${t.id}`} value={t.id}>{t.label} — {t.groupe}</option>)}
              </Select>
              {err('party_id')}
            </div>

            <Field label="Numéro" required>
              <Input required value={form.numero} onChange={set('numero')} placeholder={NUMERO_PLACEHOLDER[type] ?? 'FAC-000/25'} />
              {err('numero')}
            </Field>

            {/* Date seule, jamais d'heure : juste le jour du document. */}
            <Field label={dateLabel} required>
              <Input type="date" required value={form.date_document} onChange={set('date_document')} />
              {err('date_document')}
            </Field>

            {avecPaiement && (
              <>
                <Field label={secondDateLabel || 'Date Paiement'}>
                  <Input type="date" value={form.date_paiement} onChange={set('date_paiement')} />
                </Field>

                <Field label="Date de Crédit">
                  <Input type="date" value={form.date_credit} onChange={set('date_credit')} />
                </Field>
              </>
            )}

            <Field label="Mode de Paiement">
              <Select value={form.mode_paiement} onChange={set('mode_paiement')}>
                <option value="">Au choix du client</option>
                {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>

            <Field label="Ajouter Signature">
              <Checkbox label="Signature" checked={form.signature} onChange={(e) => setForm((f) => ({ ...f, signature: e.target.checked }))} />
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-800">Services</span>
              <div className="flex gap-2">
                <Select
                  className="min-w-0 flex-1 truncate pr-8"
                  value={serviceChoisi}
                  onChange={(e) => choisirService(e.target.value)}
                >
                  <option value="">Sélectionner le Service</option>
                  {servicesResponsable.map((s) => <option key={s.id} value={s.id}>{s.nom} — {s.prix} Dh</option>)}
                </Select>
                {/* Bouton texte « + Ajouter », comme la référence — le formulaire
                    est maintenant pleine largeur, la place ne manque plus. */}
                <button
                  type="button"
                  onClick={ajouterLigne}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-success-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-success-600 focus-ring"
                >
                  <Plus size={16} /> Ajouter
                </button>
              </div>
            </div>
          </div>

          {/* Lignes de service — une carte par ligne, mêmes colonnes que la
              référence : Service, PU HT, Qté, Total HT, Remise, Net HT, TVA,
              TVA (Dh), Total TTC. */}
          <div className="mt-5 space-y-3">
            {lignes.length === 0 ? (
              <p className="text-sm text-ink-600">Aucune ligne. Sélectionnez un service puis « Ajouter », ou ajoutez une ligne libre.</p>
            ) : (
              lignes.map((l, i) => {
                const brut = n(l.quantite) * n(l.prix_unitaire)
                const remiseMontant = brut * (n(l.remise_pourcent) / 100)
                const net = brut - remiseMontant
                const tvaMontant = net * (n(l.tva_pourcent) / 100)
                const ttc = net + tvaMontant
                return (
                  <div key={i} className="rounded-lg border border-line bg-surface/50 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 xl:items-end">
                      <Field label="Service" className="xl:col-span-2">
                        <Input required value={l.designation} onChange={(e) => majLigne(i, 'designation', e.target.value)} placeholder="Désignation" />
                      </Field>
                      <Field label="PU HT">
                        <Input type="number" step="0.01" min="0" value={l.prix_unitaire} onChange={(e) => majLigne(i, 'prix_unitaire', e.target.value)} />
                      </Field>
                      <Field label="Qté">
                        <Input type="number" step="0.01" min="0" value={l.quantite} onChange={(e) => majLigne(i, 'quantite', e.target.value)} />
                      </Field>
                      <ChampCalcule label="Total HT" value={brut} />
                      <Field label="Remise %">
                        <Input type="number" step="0.01" min="0" max="100" value={l.remise_pourcent} onChange={(e) => majLigne(i, 'remise_pourcent', e.target.value)} />
                      </Field>
                      <ChampCalcule label="Net HT" value={net} />
                      <Field label="TVA %">
                        <Input type="number" step="0.01" min="0" max="100" value={l.tva_pourcent} onChange={(e) => majLigne(i, 'tva_pourcent', e.target.value)} />
                      </Field>
                      <ChampCalcule label="TVA (Dh)" value={tvaMontant} />
                      <ChampCalcule label="Total TTC" value={ttc} bold />
                      <div className="flex items-end justify-end xl:justify-center">
                        <RowBtn title="Retirer" onClick={() => retirerLigne(i)} className="hover:bg-danger-50 hover:text-danger-600">
                          <X size={15} />
                        </RowBtn>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            {errors.lignes && <span className="mt-2 block text-xs text-danger-600">{errors.lignes[0]}</span>}
          </div>

          <div className="my-6 border-t border-line" />

          <div>
            {/* Remplie automatiquement à la sélection d'un service (voir
                `choisirService`) ; reste éditable à la main ensuite. */}
            <Field label={NOTE_LABEL[type] ?? NOTE_LABEL.facture}>
              <Textarea rows={5} value={form.note} onChange={set('note')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-5">
            <ChampCalcule label="Total HT" value={totaux.ht} />
            <ChampCalcule label="Total Remise" value={totaux.remise} />
            <ChampCalcule label="Total Net HT" value={totaux.netHt} />
            <ChampCalcule label="Total Montant TVA" value={totaux.tva} />
            <ChampCalcule label="Total TTC" value={totaux.ttc} bold />
          </div>

          {avecPaiement && (
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {/* Saisissable, conformément à la référence et à la décision métier (option C). */}
              <Field label="Prix Payer">
                <Input type="number" step="0.01" min="0" value={form.prix_paye} onChange={set('prix_paye')} placeholder="0.00" />
                {err('prix_paye')}
              </Field>
              {/* Ambre : solde restant dû, calculé, jamais saisi ni stocké. */}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink-800">Prix Restants</span>
                <div className="tabular flex h-11 items-center rounded-lg border border-warning-300 bg-warning-50 px-3.5 text-sm font-semibold text-warning-700">
                  {prixRestant.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </FormCard>
      </form>
    </div>
  )
}
