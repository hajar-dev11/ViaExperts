import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Save, Plus, X } from 'lucide-react'
import { Field, Input, Select, Textarea, Switch, FormCard, FormActions, FileInput } from '../components/Field.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { CelluleCalculee, CelluleInput, TableauLignes } from '../components/ui/LigneSaisie.jsx'
import ModePaiementChamp from '../components/ModePaiementChamp.jsx'
import ChampSignature from '../components/ChampSignature.jsx'
import SelectRecherche from '../components/SelectRecherche.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { ApiError } from '../api/http.js'
import { listClients } from '../api/clients.js'
import { listEntreprises } from '../api/entreprises.js'
import { listServices } from '../api/services.js'
import { EMETTEURS } from '../shared/constants/documents.js'
import { aujourdhui } from '../shared/utils/date.js'
import { enNombre } from '../utils/arrondi.js'
import { modePourEnvoi } from '../utils/modePaiement.js'
import { formaterMontant, montantAPayer, quantiteEntiere, saisieQuantite, soldeRestant } from '../utils/montants.js'
import { createPaiement, updatePaiement, getPaiement, listFacturesDisponibles } from '../api/paiements.js'

const n = enNombre

const jour = aujourdhui()

// Colonnes des lignes (compactes) : Désignation, PU HT, Qté, Total, retirer.
const COLONNES = 'grid-cols-[minmax(11rem,3fr)_6rem_4.5rem_6rem_2rem]'
const EN_TETES = ['Désignation', 'PU HT', 'Qté', 'Total', '']

/** Prix unitaire HT retenu : arrondi à l'entier, sauf un prix déjà enregistré resté identique. */
const prixLigne = (l) => enNombre(l.prix_unitaire) // prix unitaire HT avec ses centimes (seul le TOTAL est arrondi)

const dh = (v) => `${n(v).toFixed(2)} Dh`

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
  // « Prix à payer » (montant de ce paiement) : proposé automatiquement — solde restant de la facture rattachée, sinon total des
  // lignes — tant que l'utilisateur n'y a pas touché ; sa saisie n'est ensuite jamais écrasée par un changement de ligne.
  // Changer de facture est un changement de contexte : la proposition est alors recalculée.
  const [prixPayeManuel, setPrixPayeManuel] = useState(false)
  const [lignes, setLignes] = useState([])
  const [serviceChoisi, setServiceChoisi] = useState('')
  const [fichier, setFichier] = useState(null)

  const [clients, setClients] = useState([])
  const [entreprises, setEntreprises] = useState([])
  const [services, setServices] = useState([])
  const [factures, setFactures] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
    listServices('actif').then(setServices).catch(() => setServices([]))
    listFacturesDisponibles().then((r) => setFactures(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => setFactures([]))
  }, [])

  const charger = useCallback(() => {
    if (!isEdit) return
    getPaiement(id)
      .then((p) => {
        setErreurChargement('')
        setEmetteur(p.emetteur)
        setPrixPayeManuel(true) // un paiement enregistré garde son montant
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
      .catch(() => setErreurChargement('Paiement introuvable.'))
  }, [id, isEdit])

  useEffect(() => {
    charger()
  }, [charger])

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
      ? { service_id: service.id, designation: service.nom, quantite: 1, prix_unitaire: service.prix ?? 0 }
      : { service_id: '', designation: '', quantite: 1, prix_unitaire: 0 }])
    setServiceChoisi('')
  }

  const majLigne = (i, k, v) => setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const retirerLigne = (i) => setLignes((ls) => ls.filter((_, idx) => idx !== i))

  // Total HT du paiement : somme exacte des lignes (prix unitaire × quantité entière), centimes conservés comme le serveur.
  const total = useMemo(
    () => Math.round(lignes.reduce((acc, l) => acc + quantiteEntiere(l.quantite) * prixLigne(l), 0) * 100) / 100,
    [lignes],
  )

  // Facture déjà rattachée au paiement (modification d'un paiement existant) : ses totaux restent affichés plus bas.
  const facture = useMemo(
    () => factures.find((f) => String(f.id) === String(form.document_id)) ?? null,
    [factures, form.document_id],
  )

  // Proposition du montant à payer : tant qu'il n'a pas été saisi à la main, il suit la facture rattachée (solde restant) ou le
  // total des lignes. Évite aussi le piège du double paiement : une facture soldée ne propose rien.
  useEffect(() => {
    if (isEdit || prixPayeManuel) return
    if (form.document_id && !facture) return // facture pas encore chargée
    const propose = montantAPayer(facture, total)
    setForm((f) => (f.prix_paye === propose ? f : { ...f, prix_paye: propose }))
  }, [isEdit, prixPayeManuel, form.document_id, facture, total])

  const soldeAvant = facture ? n(facture.prixRestant) : total
  const resteApres = soldeRestant(soldeAvant, form.prix_paye)
  const depasse = !!facture && !isEdit && n(form.prix_paye) > soldeAvant + 0.004
  // Règle serveur : le montant payé ne dépasse jamais le total des services (lignes) du paiement.
  const depasseLignes = !depasse && lignes.length > 0 && n(form.prix_paye) > total + 0.004

  const submit = async (e) => {
    e.preventDefault()
    setErrors({}); setError('')
    // Un paiement porte toujours au moins un service : message clair avant tout envoi.
    if (lignes.length === 0) { setError('Ajoutez au moins un service au paiement (« Sélectionner le Service » puis « Ajouter »).'); return }
    setSaving(true)
    try {
      const payload = {
        emetteur,
        responsable: EMETTEURS.find((x) => x.value === emetteur)?.label || '',
        party_id: Number(form.party_id),
        document_id: form.document_id || '',
        date_operation: form.date_operation,
        date_credit: form.date_credit,
        mode_paiement: modePourEnvoi(form.mode_paiement),
        signature: form.signature,
        observation: form.observation,
        prix_paye: form.prix_paye === '' ? 0 : Number(form.prix_paye),
        lignes: lignes.map((l) => ({
          service_id: l.service_id || '',
          designation: l.designation,
          quantite: quantiteEntiere(l.quantite),
          prix_unitaire: prixLigne(l),
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
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={() => { setErreurChargement(''); charger() }}>{erreurChargement}</Alert>}

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
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {EMETTEURS.map((e) => (
              <label
                key={e.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${
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

          {/* Trois colonnes pleine largeur, comme la référence : tiers | date d'opération | date crédit, puis mode | signature | services. */}
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="mb-1.5 flex items-center gap-4">
                <Switch label="Entreprises" checked={showEntreprises} onChange={(e) => setShowEntreprises(e.target.checked)} />
                <Switch label="Clients" checked={showClients} onChange={(e) => setShowClients(e.target.checked)} />
              </div>
              <SelectRecherche
                required
                options={tiers.map((t) => ({ cle: `${t.groupe}-${t.id}`, value: t.id, label: t.label, groupe: t.groupe }))}
                value={form.party_id}
                onChange={(valeur) => set('party_id')({ target: { value: valeur } })}
                placeholder="Sélectionner Entreprise/Client"
                error={!!errors.party_id}
              />
              {err('party_id')}
            </div>

            <Field label="Date d'opération" required>
              <Input type="date" required value={form.date_operation} onChange={set('date_operation')} />
              {err('date_operation')}
            </Field>

            <Field label="Date Crédit">
              <Input type="date" value={form.date_credit} onChange={set('date_credit')} />
            </Field>

            <ModePaiementChamp value={form.mode_paiement} onChange={(v) => setForm((f) => ({ ...f, mode_paiement: v }))} />

            <ChampSignature
              texte="Ajouter une signature sur le reçu de paiement"
              checked={form.signature}
              onChange={(e) => setForm((f) => ({ ...f, signature: e.target.checked }))}
            />

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-800">Services <span className="font-normal text-ink-600">(prix HT)</span></span>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select value={serviceChoisi} onChange={(e) => setServiceChoisi(e.target.value)}>
                    <option value="">Sélectionner le Service</option>
                    {servicesResponsable.map((s) => <option key={s.id} value={s.id}>{s.nom} — {formaterMontant(s.prix)} Dh HT</option>)}
                  </Select>
                </div>
                <Button type="button" variant="success-soft" icon={<Plus size={15} />} onClick={ajouterLigne}>
                  Ajouter
                </Button>
              </div>
            </div>
          </div>

          {/* Lignes COMPACTES : une rangée par ligne ; au-delà de 4 lignes la zone défile dans sa propre hauteur. */}
          {lignes.length > 0 && (
            <div className="mt-4">
              <TableauLignes colonnes={COLONNES} enTetes={EN_TETES} nombre={lignes.length}>
                {lignes.map((l, i) => (
                  <div key={i} className={`grid ${COLONNES} items-center gap-2 px-3 py-1.5`}>
                    <CelluleInput required aria-label={`Désignation de la ligne ${i + 1}`} value={l.designation} onChange={(e) => majLigne(i, 'designation', e.target.value)} placeholder="Désignation" />
                    <CelluleInput
                      type="number" step="0.01" min="0" className="text-right" aria-label={`Prix unitaire HT de la ligne ${i + 1}`}
                      value={l.prix_unitaire}
                      onChange={(e) => majLigne(i, 'prix_unitaire', e.target.value)}
                    />
                    <CelluleInput
                      type="text" inputMode="numeric" pattern="[0-9]*" className="text-right" aria-label={`Quantité de la ligne ${i + 1}`}
                      value={l.quantite}
                      onChange={(e) => majLigne(i, 'quantite', saisieQuantite(e.target.value))}
                      erreur={!!errors[`lignes.${i}.quantite`]}
                    />
                    <CelluleCalculee positif gras>{(quantiteEntiere(l.quantite) * prixLigne(l)).toFixed(2)}</CelluleCalculee>
                    <div className="flex justify-center">
                      <RowBtn title="Retirer" onClick={() => retirerLigne(i)} className="hover:bg-danger-50 hover:text-danger-600">
                        <X size={15} />
                      </RowBtn>
                    </div>
                  </div>
                ))}
              </TableauLignes>
            </div>
          )}
          {errors.lignes && <span className="mt-2 block text-xs text-danger-600">{errors.lignes[0]}</span>}
          {Object.keys(errors).filter((k) => /^lignes\.\d+\.quantite$/.test(k)).map((k) => (
            <span key={k} className="mt-2 block text-xs text-danger-600">{errors[k][0]}</span>
          ))}

          {/* Pièce jointe puis Observation, chacune sur toute la largeur (référence). */}
          <div className="mt-4 space-y-4">
            <Field label="Pièce jointe" hint="5 Mo maximum.">
              <FileInput onChange={(e) => setFichier(e.target.files?.[0] || null)} />
              {err('piece_jointe')}
            </Field>
            <Field label="Observation">
              <Textarea rows={6} value={form.observation} onChange={set('observation')} className="min-h-[10rem]" />
            </Field>
          </div>

          {/* Le total, puis le prix à payer (cadre vert) et le solde restant (cadre orange). Le déjà payé n'est jamais saisi ici :
              il se déduit des paiements enregistrés (solde restant de la facture rattachée), et l'ajout d'un paiement complémentaire
              se fait depuis « Gestion des Paiements ». */}
          <div className="mt-4">
            <Field label={facture ? 'Total TTC de la facture' : 'Total HT'}>
              <Input readOnly value={(facture ? n(facture.totalTtc) : total).toFixed(2)} className="border-success-500 bg-surface text-ink-900" />
            </Field>
          </div>
          <div className="mt-4 grid gap-x-5 gap-y-4 md:grid-cols-2">
            <Field
              label="Prix à payer (ce paiement)"
              hint={isEdit ? undefined : (prixPayeManuel ? 'Montant saisi à la main.' : 'Proposé automatiquement ; modifiable.')}
              error={depasse
                ? `Dépasse le solde restant de la facture (${dh(soldeAvant)}).`
                : (depasseLignes ? `Dépasse le total des services du paiement (${dh(total)}) : ajoutez les services correspondants.` : undefined)}
            >
              <Input
                type="number" step="0.01" min="0" value={form.prix_paye} placeholder="0.00"
                onChange={(e) => { setPrixPayeManuel(true); set('prix_paye')(e) }}
                error={depasse || depasseLignes || undefined}
                className="border-success-500"
              />
              {err('prix_paye')}
            </Field>
            <Field label="Solde restant après ce paiement">
              <Input readOnly value={resteApres.toFixed(2)} className="border-warning-500 bg-surface text-ink-700" />
            </Field>
          </div>
        </FormCard>
      </form>
    </div>
  )
}
