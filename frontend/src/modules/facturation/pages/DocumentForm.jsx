import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, X, Plus } from 'lucide-react'
import { Field, Input, Select, Textarea, Checkbox, FormCard, FormActions } from '../../../components/Field.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import { CelluleCalculee, CelluleInput, TableauLignes } from '../../../components/ui/LigneSaisie.jsx'
import ModePaiementChamp from '../../../components/ModePaiementChamp.jsx'
import ChampSignature from '../../../components/ChampSignature.jsx'
import SelectRecherche from '../../../components/SelectRecherche.jsx'
import { RowBtn } from '../../../components/ListToolbar.jsx'
import { ApiError } from '../../../api/http.js'
import { listClients } from '../../../api/clients.js'
import { listEntreprises } from '../../../api/entreprises.js'
import { listServices } from '../../../api/services.js'
import { aujourdhui } from '../../../shared/utils/date.js'
import { enNombre, totauxDocument } from '../../../utils/arrondi.js'
import { modePourEnvoi } from '../../../utils/modePaiement.js'
import { formaterMontant, quantiteEntiere, remiseEnDh, saisieQuantite, soldeRestant } from '../../../utils/montants.js'
import {
  EMETTEURS, createDocument, updateDocument, getDocument, getNumeroPropose,
} from '../api/facturation.js'

// `remise` : remise de la ligne EN MONTANT (Dh), plus en pourcentage.
const emptyLigne = { service_id: '', designation: '', quantite: 1, prix_unitaire: 0, remise: 0, tva_pourcent: 20 }

const n = enNombre

// Champ calculé, en lecture seule : vert dès qu'il porte un montant, rose à
// zéro — reprend exactement le code couleur de la capture de référence.
const toneClasses = (v) => (n(v) > 0
  ? 'border-success-300 bg-success-50 text-success-700'
  : 'border-danger-200 bg-danger-50 text-danger-600')

// Même gabarit que les champs de saisie (libellé 15 px, boîte de 44 px, mêmes marges) : les montants calculés et les champs
// saisissables s'alignent sur une même ligne.
function ChampCalcule({ label, value, bold = false }) {
  return (
    <div>
      <span className="mb-1.5 block text-[15px] font-medium text-ink-800">{label}</span>
      <div className={`tabular flex h-11 items-center rounded-lg border px-3.5 text-[15px] ${bold ? 'font-bold' : 'font-semibold'} ${toneClasses(value)}`}>
        {n(value).toFixed(2)}
      </div>
    </div>
  )
}

// Numéro : proposé automatiquement par la numérotation de l'émetteur choisi (Centre de domiciliation ou Bureau de
// comptabilité) ; le placeholder ne sert que tant que la proposition n'est pas arrivée.
const NUMERO_PLACEHOLDER = { facture: 'FAC-000/25', devis: 'DEV-000/25', bl: 'BL-000/25', avoir: 'FAV-000/25' }
const NOTE_LABEL = {
  facture: 'Note Ajouter Sur Facture',
  devis: 'Note à ajouter sur devis',
  bl: 'Note à ajouter sur bon de livraison',
  avoir: "Note à ajouter sur facture d'avoir",
}

// Libellé de l'option « signature » : dit clairement qu'elle ajoute une signature sur LE document en cours de saisie.
const SIGNATURE_TEXTE = {
  facture: 'Ajouter une signature sur la facture',
  devis: 'Ajouter une signature sur le devis',
  bl: 'Ajouter une signature sur le bon de livraison',
  avoir: "Ajouter une signature sur la facture d'avoir",
}

// Colonnes des lignes (compactes) : Service, PU HT, Qté, Total HT, Remise, Net HT, TVA %, TVA (Dh), Total TTC, retirer.
const COLONNES = 'grid-cols-[minmax(11rem,2.4fr)_5.5rem_4rem_5.5rem_4.5rem_5.5rem_4rem_5rem_5.5rem_2rem]'
const EN_TETES = ['Service', 'PU HT', 'Qté', 'Total HT', 'Remise (Dh)', 'Net HT', 'TVA %', 'TVA (Dh)', 'Total TTC', '']

/** Remise d'une ligne en Dh : saisie positive, plafonnée au total HT de la ligne (comme le serveur). */
const remiseLigne = (l, brut) => remiseEnDh(l.remise, brut)

/** Prix unitaire HT d'une ligne : tel que saisi, avec ses centimes (seul le TOTAL du document est arrondi). */
const prixLigne = (l) => enNombre(l.prix_unitaire)

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
  // `numeroAuto` : le numéro affiché est celui proposé par la numérotation de l'émetteur et n'a pas été modifié à la main.
  // Le serveur attribue alors lui-même le numéro libre (aucun doublon, même à plusieurs utilisateurs en même temps).
  const [numeroAuto, setNumeroAuto] = useState(true)
  // `prixPayeManuel` : « Prix à payer » est pré-rempli avec le total TTC tant que l'utilisateur n'y a pas touché ; sa saisie
  // n'est ensuite plus jamais écrasée par un changement de ligne.
  const [prixPayeManuel, setPrixPayeManuel] = useState(false)
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

  // Numéro et responsable proposés par la numérotation de l'ÉMETTEUR choisi. À chaque changement d'émetteur le numéro de la
  // sélection précédente est retiré aussitôt, puis remplacé par celui du nouvel émetteur ; une réponse qui arrive après un
  // nouveau changement (réseau lent) est ignorée (compteur de requête).
  const requeteProposition = useRef(0)
  const chargerProposition = useCallback((emetteurChoisi) => {
    const requete = ++requeteProposition.current
    setNumeroAuto(true)
    setForm((f) => ({ ...f, numero: '' }))
    getNumeroPropose(type, emetteurChoisi)
      .then((res) => {
        if (requete !== requeteProposition.current) return
        setForm((f) => ({
          ...f,
          numero: res.numero || '',
          responsable: res.responsable || EMETTEURS.find((e) => e.value === emetteurChoisi)?.label || '',
        }))
      })
      .catch(() => {})
  }, [type])

  useEffect(() => {
    if (!isEdit) chargerProposition(emetteur)
  }, [emetteur, isEdit, chargerProposition])

  const charger = useCallback(() => {
    if (!isEdit) return
    getDocument(type, id)
      .then((d) => {
        setErreurChargement('')
        setEmetteur(d.emetteur)
        setNumeroAuto(false)
        setPrixPayeManuel(true)
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
          // Montant en Dh : celui saisi, ou l'équivalent exact de l'ancien pourcentage pour une ligne historique.
          remise: l.remiseMontant ?? 0,
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
      // Prix du service (HT) avec ses centimes.
      ? { ...emptyLigne, service_id: service.id, designation: service.nom, prix_unitaire: service.prix ?? 0 }
      : { ...emptyLigne }])
    setServiceChoisi('')
  }

  const majLigne = (i, k, v) => setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const retirerLigne = (i) => setLignes((ls) => ls.filter((_, idx) => idx !== i))

  // Totaux calculés à l'identique du backend (Remise en Dh, TVA en %, ligne par ligne) : prix unitaires avec leurs centimes,
  // quantité entière. Le TOTAL HT est arrondi à l'entier (règle du demi) ; TVA et TTC sont calculés sur ce total arrondi.
  const totaux = useMemo(() => totauxDocument(lignes.map((l) => {
    const brut = quantiteEntiere(l.quantite) * prixLigne(l)
    return { brut, remise: remiseLigne(l, brut), tva: n(l.tva_pourcent) }
  })), [lignes])

  // « Prix à payer » : pré-rempli avec le total TTC (le montant que le client doit réellement payer) tant qu'il n'a pas été saisi
  // à la main, y compris quand les lignes changent. Une facture déjà enregistrée garde son montant (voir `charger`).
  useEffect(() => {
    if (!avecPaiement || isEdit || prixPayeManuel) return
    setForm((f) => {
      const propose = totaux.ttc > 0 ? totaux.ttc.toFixed(2) : ''
      return f.prix_paye === propose ? f : { ...f, prix_paye: propose }
    })
  }, [avecPaiement, isEdit, prixPayeManuel, totaux.ttc])

  const prixRestant = soldeRestant(totaux.ttc, form.prix_paye)

  const submit = async (e) => {
    e.preventDefault()
    setErrors({}); setError('')
    // Remise en Dh : jamais supérieure au total HT de sa ligne (le serveur la refuse aussi).
    const horsPlafond = {}
    lignes.forEach((l, i) => {
      const brut = quantiteEntiere(l.quantite) * prixLigne(l)
      if (n(l.remise) > brut + 0.005) horsPlafond[`lignes.${i}.remise_montant`] = [`La remise de la ligne ${i + 1} ne peut pas dépasser son total HT (${brut.toFixed(2)} Dh).`]
    })
    if (Object.keys(horsPlafond).length > 0) {
      setErrors(horsPlafond)
      setError('Merci de corriger les remises en rouge avant d’enregistrer.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        emetteur,
        responsable: form.responsable || null,
        party_id: Number(form.party_id),
        numero: form.numero,
        // Création : tant que le numéro est celui proposé, le serveur attribue le numéro libre sous verrou.
        ...(!isEdit && numeroAuto ? { numero_auto: true } : {}),
        date_document: form.date_document,
        date_paiement: avecPaiement ? (form.date_paiement || null) : null,
        date_credit: avecPaiement ? (form.date_credit || null) : null,
        mode_paiement: modePourEnvoi(form.mode_paiement) || null,
        signature: form.signature,
        note: form.note || null,
        prix_paye: avecPaiement ? (form.prix_paye === '' ? 0 : Number(form.prix_paye)) : 0,
        lignes: lignes.map((l) => ({
          service_id: l.service_id || null,
          designation: l.designation,
          quantite: quantiteEntiere(l.quantite),
          prix_unitaire: prixLigne(l),
          remise_montant: remiseLigne(l, quantiteEntiere(l.quantite) * prixLigne(l)),
          remise_pourcent: 0,
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
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {EMETTEURS.map((e) => (
              <label
                key={e.value}
                className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${
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
          {/* 4 colonnes pour la Facture (8 champs = 2 rangées pleines) ; 3 colonnes pour Devis / BL / Avoir (6 champs = 2 rangées
              pleines) : plus de cases vides à droite sur grand écran. */}
          <div className={`grid gap-x-5 gap-y-4 sm:grid-cols-2 ${avecPaiement ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <div>
              <div className="flex items-center gap-4 mb-1.5">
                <Checkbox label="Entreprises" checked={showEntreprises} onChange={(e) => setShowEntreprises(e.target.checked)} />
                <Checkbox label="Clients" checked={showClients} onChange={(e) => setShowClients(e.target.checked)} />
              </div>
              {/* Recherche par nom d'entreprise ou de client ; la valeur enregistrée reste l'identifiant du tiers choisi. */}
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

            {/* Numéro automatique de l'émetteur choisi, modifiable : aucun texte d'aide sous le champ. */}
            <Field label="Numéro" required>
              <Input
                required
                value={form.numero}
                onChange={(e) => { setNumeroAuto(false); set('numero')(e) }}
                placeholder={NUMERO_PLACEHOLDER[type] ?? 'FAC-000/25'}
              />
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

            <ModePaiementChamp value={form.mode_paiement} onChange={(v) => setForm((f) => ({ ...f, mode_paiement: v }))} />

            <ChampSignature
              label="Signature"
              texte={SIGNATURE_TEXTE[type] ?? SIGNATURE_TEXTE.facture}
              checked={form.signature}
              onChange={(e) => setForm((f) => ({ ...f, signature: e.target.checked }))}
            />

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-800">Services <span className="font-normal text-ink-600">(prix HT)</span></span>
              <div className="flex gap-2">
                <Select
                  className="min-w-0 flex-1 truncate pr-8"
                  value={serviceChoisi}
                  onChange={(e) => choisirService(e.target.value)}
                >
                  <option value="">Sélectionner le Service</option>
                  {servicesResponsable.map((s) => <option key={s.id} value={s.id}>{s.nom} — {formaterMontant(s.prix)} Dh HT</option>)}
                </Select>
                {/* Bouton texte « + Ajouter », comme la référence. */}
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

          {/* Lignes de service COMPACTES : une rangée par ligne, intitulés une seule fois en tête ; au-delà de 4 lignes la
              zone défile dans sa propre hauteur. Colonnes : Service, PU HT, Qté, Total HT, Remise, Net HT, TVA, TVA (Dh), TTC. */}
          <div className="mt-4">
            {lignes.length === 0 ? (
              <p className="text-sm text-ink-600">Aucune ligne. Sélectionnez un service puis « Ajouter », ou ajoutez une ligne libre.</p>
            ) : (
              <TableauLignes colonnes={COLONNES} enTetes={EN_TETES} nombre={lignes.length}>
                {lignes.map((l, i) => {
                  const brut = quantiteEntiere(l.quantite) * prixLigne(l)
                  const remiseMontant = remiseLigne(l, brut)
                  const net = brut - remiseMontant
                  const tvaMontant = net * (n(l.tva_pourcent) / 100)
                  const ttc = net + tvaMontant
                  return (
                    <div key={i} className={`grid ${COLONNES} items-center gap-2 px-3 py-1.5`}>
                      <CelluleInput required aria-label={`Désignation de la ligne ${i + 1}`} value={l.designation} onChange={(e) => majLigne(i, 'designation', e.target.value)} placeholder="Désignation" />
                      <CelluleInput
                        type="number" step="0.01" min="0" className="text-right" aria-label={`Prix unitaire HT de la ligne ${i + 1}`}
                        value={l.prix_unitaire}
                        onChange={(e) => majLigne(i, 'prix_unitaire', e.target.value)}
                      />
                      {/* Quantité : nombre ENTIER uniquement (la virgule et le point sont refusés dès la saisie). */}
                      <CelluleInput
                        type="text" inputMode="numeric" pattern="[0-9]*" className="text-right" aria-label={`Quantité de la ligne ${i + 1}`}
                        value={l.quantite}
                        onChange={(e) => majLigne(i, 'quantite', saisieQuantite(e.target.value))}
                        erreur={!!errors[`lignes.${i}.quantite`]}
                      />
                      <CelluleCalculee positif={brut > 0}>{brut.toFixed(2)}</CelluleCalculee>
                      {/* Remise en MONTANT (Dh) : plafonnée au total HT de la ligne. */}
                      <CelluleInput
                        type="number" step="0.01" min="0" max={brut} className="tabular text-right" aria-label={`Remise en Dh de la ligne ${i + 1}`}
                        value={l.remise} onChange={(e) => majLigne(i, 'remise', e.target.value)}
                        erreur={!!errors[`lignes.${i}.remise_montant`] || n(l.remise) > brut + 0.005}
                      />
                      <CelluleCalculee positif={net > 0}>{net.toFixed(2)}</CelluleCalculee>
                      <CelluleInput type="number" step="0.01" min="0" max="100" className="text-right" aria-label={`TVA de la ligne ${i + 1}`} value={l.tva_pourcent} onChange={(e) => majLigne(i, 'tva_pourcent', e.target.value)} />
                      <CelluleCalculee positif={tvaMontant > 0}>{tvaMontant.toFixed(2)}</CelluleCalculee>
                      <CelluleCalculee positif={ttc > 0} gras>{ttc.toFixed(2)}</CelluleCalculee>
                      <div className="flex justify-center">
                        <RowBtn title="Retirer" onClick={() => retirerLigne(i)} className="hover:bg-danger-50 hover:text-danger-600">
                          <X size={15} />
                        </RowBtn>
                      </div>
                    </div>
                  )
                })}
              </TableauLignes>
            )}
            {errors.lignes && <span className="mt-2 block text-xs text-danger-600">{errors.lignes[0]}</span>}
            {Object.keys(errors).filter((k) => /^lignes\.\d+\.(quantite|remise_montant)$/.test(k)).map((k) => (
              <span key={k} className="mt-2 block text-xs text-danger-600">{errors[k][0]}</span>
            ))}
          </div>

          <div className="my-4 border-t border-line" />

          <div>
            {/* Remplie automatiquement à la sélection d'un service (voir
                `choisirService`) ; reste éditable à la main ensuite. */}
            <Field label={NOTE_LABEL[type] ?? NOTE_LABEL.facture}>
              <Textarea rows={3} value={form.note} onChange={set('note')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            <ChampCalcule label="Total HT" value={totaux.ht} />
            <ChampCalcule label="Total Remise" value={totaux.remise} />
            <ChampCalcule label="Total Net HT" value={totaux.netHt} />
            <ChampCalcule label="Total Montant TVA" value={totaux.tva} />
            <ChampCalcule label="Total TTC" value={totaux.ttc} bold />
          </div>

          {avecPaiement && (
            <div className="grid items-start gap-x-4 gap-y-3 mt-3 sm:grid-cols-3">
              {/* Total, déjà payé / à payer, et solde restant : trois montants distincts, sur une même ligne, même gabarit. */}
              <ChampCalcule label="Total TTC de la facture" value={totaux.ttc} />
              {/* Saisissable, conformément à la référence et à la décision métier (option C). Pré-rempli avec le total TTC :
                  pas de texte d'aide sous le champ (il décalait la ligne) ; l'info-bulle le rappelle. */}
              <Field label={isEdit ? 'Prix payé (déjà réglé)' : 'Prix à payer (TTC)'}>
                <Input
                  type="number" step="0.01" min="0" value={form.prix_paye} placeholder="0.00" className="tabular"
                  title={isEdit ? undefined : (prixPayeManuel ? 'Montant saisi à la main.' : 'Pré-rempli avec le total TTC ; modifiable (paiement partiel).')}
                  onChange={(e) => { setPrixPayeManuel(true); set('prix_paye')(e) }}
                />
                {err('prix_paye')}
              </Field>
              {/* Ambre : solde restant dû, calculé, jamais saisi ni stocké. */}
              <div>
                <span className="mb-1.5 block text-[15px] font-medium text-ink-800">Prix Restants</span>
                <div className="tabular flex h-11 items-center rounded-lg border border-warning-300 bg-warning-50 px-3.5 text-[15px] font-semibold text-warning-700">
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
