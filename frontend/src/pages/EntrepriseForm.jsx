import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Save, Trash2, ChevronDown, PenLine, Gavel, Link2, ScanLine, Briefcase, IdCard,
  FileText, Building, Building2, CalendarDays, Wallet, UserRound, Percent, Home,
  Folder, Archive, Eye, Users,
} from 'lucide-react'
import {
  Field, FieldRow, AddButton, Input, Select, Checkbox, FormCard,
} from '../components/Field.jsx'
import Alert from '../components/ui/Alert.jsx'
import { SkeletonText } from '../components/ui/Skeleton.jsx'
import { listClients } from '../api/clients.js'
import { listCentres, createDomiciliation, calculerDateFin } from '../modules/domiciliation/index.js'
import { createEntreprise, updateEntreprise, getEntreprise } from '../api/entreprises.js'
import { MODES_PAIEMENT } from '../shared/constants/documents.js'
import { ApiError } from '../api/http.js'

const formes = ['SARL', 'SARL AU', 'SA', 'SNC', 'Auto-Entrepreneur', 'Établissement Public']
const periodes = ['Mensuel', 'Trimestriel', 'Annuel']
const locaux = ['Contrat de domiciliation', 'Contrat de bail', 'Attestation de propriété']
const secteursActivite = [
  'Commerce', 'Services', 'Industrie', 'BTP / Construction', 'Import-Export',
  'Conseil', 'Informatique / IT', 'Immobilier', 'Restauration', 'Textile',
  'Agriculture', 'Santé', 'Éducation', 'Transport & Logistique',
  'Finance & Assurance', 'Tourisme', 'Artisanat', 'Autre',
]

/**
 * Rôles des personnes rattachées à l'entreprise.
 * Doit rester aligné sur `EntrepriseAssocie::TYPES` côté backend : l'API
 * refuse (422) toute autre valeur.
 */
const typesAssocie = ['Partenaire', 'Gèrent', 'Co-Gèrent', 'Associé', 'Gérant non Associé']

const emptyAssocie = () => ({ nom: '', cin: '', type: '' })

const emptyForm = {
  denomination: '', tribunal: '', forme: formes[0], ice: '', rc: '', if: '', tp: '',
  cnss: '', dateDebut: '', capital: '', single: '', periode: periodes[0],
  local: '', centreDomiciliation: '', numDossier: '', numArchive: '', observation: '',
  client: '',
}

/** Date du jour au format attendu par <input type="date"> — jamais codée en dur. */
const aujourdhui = () => {
  const d = new Date()
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jour = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mois}-${jour}`
}

/** Prix par mois proposé par défaut sur une nouvelle domiciliation. */
const PRIX_PAR_MOIS_DEFAUT = '104.17'

/**
 * Section « Ajouter Domiciliation » intégrée à la page Ajouter Entreprise.
 *
 * `signature_sur_facture` est COCHÉ PAR DÉFAUT : la facture de domiciliation
 * sortira avec le cachet enregistré dans Paramètre > Centre Domiciliation.
 * Les dates de facture et de paiement sont pré-remplies au jour courant.
 */
const emptyDomiciliation = () => ({
  mois_payee: '',
  mois_gratuits: '',
  // La référence pré-remplit les quatre dates au jour courant.
  date_depart: aujourdhui(),
  date_fin: aujourdhui(),
  mode_paiement: '',
  prix_par_mois: PRIX_PAR_MOIS_DEFAUT,
  prix_total: '',
  signature_sur_facture: true,
  date_facture: aujourdhui(),
  date_paiement: aujourdhui(),
})

export default function EntrepriseForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [form, setForm] = useState(emptyForm)
  const [secteurs, setSecteurs] = useState([{ secteur: '', secteurAutre: '', activite: '' }])
  // Personnes rattachées : nom, CIN et rôle. Table `entreprise_associes`.
  const [associes, setAssocies] = useState([emptyAssocie()])
  const [clients, setClients] = useState([])
  // Centres issus de la vraie table `centres_domiciliation` (et non de mockData) :
  // c'est elle que référence la FK de `entreprises`.
  const [centres, setCentres] = useState([])
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [globalError, setGlobalError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // --- Section « Ajouter Domiciliation » (création d'entreprise uniquement) ---
  // Fermée au chargement : elle ne s'ouvre qu'au clic sur son en-tête.
  const [domiOpen, setDomiOpen] = useState(false)
  const [domi, setDomi] = useState(emptyDomiciliation)
  const setDomiField = (k) => (e) => setDomi((d) => ({ ...d, [k]: e.target.value }))
  const setDomiCheck = (k) => (e) => setDomi((d) => ({ ...d, [k]: e.target.checked }))

  // La section n'est prise en compte que si la date de départ est saisie :
  // c'est le seul champ que l'API exige en plus de l'entreprise et du centre.
  const domiRenseignee = !!domi.date_depart

  // Prix Totale = Prix par mois × (Mois Payée + Mois Gratuits), en lecture seule.
  // Date de Fin = Date de Depart + (Mois Payée + Mois Gratuits), également
  // calculée : même logique que « Nouvelle Domiciliation » et « Renouveler ».
  useEffect(() => {
    const pm = parseFloat(domi.prix_par_mois)
    const dureeMois = (Number(domi.mois_payee) || 0) + (Number(domi.mois_gratuits) || 0)
    setDomi((d) => ({
      ...d,
      prix_total: Number.isNaN(pm) ? '' : (pm * dureeMois).toFixed(2),
      date_fin: calculerDateFin(d.date_depart, dureeMois) || d.date_fin,
    }))
  }, [domi.prix_par_mois, domi.mois_payee, domi.mois_gratuits, domi.date_depart])

  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
    listCentres({ page: 1, perPage: 100 }).then((res) => setCentres(res.data || [])).catch(() => setCentres([]))

  }, [])

  useEffect(() => {
    if (!id) return
    getEntreprise(id)
      .then((e) => {
        setForm({ ...emptyForm, ...e, observation: e.observation ?? '' })
        if (e.secteurs && e.secteurs.length > 0) {
          setSecteurs(e.secteurs.map((s) => (
            secteursActivite.includes(s.secteur)
              ? { secteur: s.secteur, secteurAutre: '', activite: s.activite ?? '' }
              : { secteur: 'Autre', secteurAutre: s.secteur, activite: s.activite ?? '' }
          )))
        }
        if (e.associes && e.associes.length > 0) {
          setAssocies(e.associes.map((a) => ({
            nom: a.nom ?? '', cin: a.cin ?? '', type: a.type ?? '',
          })))
        }
      })
      .catch(() => setGlobalError('Impossible de charger cette entreprise.'))
      .finally(() => setLoading(false))
  }, [id])

  const addSecteur = () => setSecteurs((s) => [...s, { secteur: '', secteurAutre: '', activite: '' }])
  const removeSecteur = (i) => setSecteurs((s) => s.filter((_, idx) => idx !== i))
  const setSecteurField = (i, field, value) => setSecteurs((s) => s.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))

  const addAssocie = () => setAssocies((a) => [...a, emptyAssocie()])
  // La dernière ligne n'est jamais retirée : elle est simplement vidée, sinon
  // le bloc disparaîtrait de la page sans moyen de le faire revenir.
  const removeAssocie = (i) => setAssocies((a) => (a.length === 1 ? [emptyAssocie()] : a.filter((_, idx) => idx !== i)))
  const setAssocieField = (i, field, value) => setAssocies((a) => a.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})
    setGlobalError('')
    setSaving(true)
    // Le secteur est choisi une seule fois (première ligne) : toutes les
    // activités saisies lui sont rattachées, ce que la table
    // `entreprise_secteurs` enregistre sous forme de paires secteur/activité.
    const premier = secteurs[0] ?? {}
    const secteurRetenu = premier.secteur === 'Autre' ? premier.secteurAutre : premier.secteur
    const secteursData = secteurRetenu
      ? secteurs
          .filter((row, i) => i === 0 || row.activite?.trim())
          .map((row) => ({ secteur: secteurRetenu, activite: row.activite }))
      : []
    // Les lignes laissées vides ne sont pas envoyées : le backend remplace
    // intégralement la liste à chaque enregistrement.
    const associesData = associes.filter((a) => a.nom.trim())
    try {
      if (id) {
        await updateEntreprise(id, { ...form, secteurs: secteursData, associes: associesData })
        navigate('/entreprises')
        return
      }

      const entreprise = await createEntreprise({ ...form, secteurs: secteursData, associes: associesData })

      // Un seul bouton Sauvegarder : si la section Domiciliation est renseignée,
      // on enchaîne la création de la domiciliation sur l'entreprise qui vient
      // d'être créée.
      if (domiRenseignee) {
        const centre = centres.find((c) => c.nom === form.centreDomiciliation)
        if (!centre) {
          setGlobalError(
            "L'entreprise a bien été créée, mais la domiciliation n'a pas pu être enregistrée : "
            + 'sélectionnez un Centre de Domiciliation (champ « Local » = Contrat de domiciliation).'
          )
          setSaving(false)
          return
        }

        try {
          await createDomiciliation({
            entreprise_id: Number(entreprise.id),
            centre_domiciliation_id: Number(centre.id),
            mois_payee: Number(domi.mois_payee) || 0,
            mois_gratuits: Number(domi.mois_gratuits) || 0,
            date_depart: domi.date_depart,
            date_fin: domi.date_fin || null,
            mode_paiement: domi.mode_paiement || null,
            prix_par_mois: domi.prix_par_mois === '' ? 0 : Number(domi.prix_par_mois),
            prix_total: domi.prix_total === '' ? 0 : Number(domi.prix_total),
            signature_sur_facture: domi.signature_sur_facture,
            date_facture: domi.date_facture || null,
            date_paiement: domi.date_paiement || null,
          })
        } catch (errDomi) {
          // L'entreprise existe déjà : on le dit clairement plutôt que de laisser
          // croire que rien n'a été enregistré.
          const detail = errDomi instanceof ApiError && errDomi.status === 422
            ? Object.values(errDomi.errors)[0]?.[0] ?? ''
            : ''
          setGlobalError(
            `L'entreprise « ${form.denomination} » a bien été créée, mais sa domiciliation n'a pas pu `
            + `être enregistrée${detail ? ` : ${detail}` : '.'} Vous pouvez la saisir depuis `
            + 'Domiciliation > Nouvelle Domiciliation.'
          )
          setSaving(false)
          return
        }
      }

      navigate('/entreprises')
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.errors)
      } else {
        setGlobalError("Impossible d'enregistrer cette entreprise. Réessayez.")
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <FormCard title="Modifier Entreprise">
        <SkeletonText lines={10} />
      </FormCard>
    )
  }

  return (
    <div>
      <form onSubmit={submit}>
        {globalError && <Alert tone="danger" className="mb-4">{globalError}</Alert>}
        <FormCard title={id ? 'Modifier Entreprise' : 'Ajouter Entreprise'}>
          {/* Libellé à GAUCHE du champ, deux paires par ligne : c'est la
              disposition exacte de « Ajouter Entreprise » dans la référence. */}
          <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
            <FieldRow label="Dénomination" required htmlFor="e-denom" error={errors.denomination?.[0]}>
              <Input id="e-denom" icon={<PenLine size={17} />} required placeholder="Dénomination"
                value={form.denomination} onChange={set('denomination')} error={errors.denomination?.[0]} />
            </FieldRow>
            <FieldRow label="Tribunal" htmlFor="e-tribunal">
              <Input id="e-tribunal" icon={<Gavel size={17} />} placeholder="Tribunal"
                value={form.tribunal ?? ''} onChange={set('tribunal')} />
            </FieldRow>

            <FieldRow label="Forme Juridique" htmlFor="e-forme">
              <Select id="e-forme" icon={<Link2 size={17} />} value={form.forme} onChange={set('forme')}>
                {formes.map((f) => <option key={f}>{f}</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="I.C.E" htmlFor="e-ice" error={errors.ice?.[0]}>
              <Input id="e-ice" icon={<ScanLine size={17} />} placeholder="I.C.E"
                value={form.ice ?? ''} onChange={set('ice')} error={errors.ice?.[0]} />
            </FieldRow>

            <FieldRow label="Registre de Commerce" htmlFor="e-rc" error={errors.rc?.[0]}>
              <Input id="e-rc" icon={<Briefcase size={17} />} placeholder="R.C"
                value={form.rc ?? ''} onChange={set('rc')} error={errors.rc?.[0]} />
            </FieldRow>
            <FieldRow label="Identifiant Fiscal" htmlFor="e-if" error={errors.if?.[0]}>
              <Input id="e-if" icon={<IdCard size={17} />} placeholder="I.F"
                value={form.if ?? ''} onChange={set('if')} error={errors.if?.[0]} />
            </FieldRow>

            <FieldRow label="N° Tp" htmlFor="e-tp">
              <Input id="e-tp" icon={<FileText size={17} />} placeholder="N° Tp"
                value={form.tp ?? ''} onChange={set('tp')} />
            </FieldRow>
            <FieldRow label="N° d'Affiliation à La CNSS" htmlFor="e-cnss">
              <Input id="e-cnss" icon={<Building size={17} />} placeholder="N° d'Affiliation à La CNSS"
                value={form.cnss ?? ''} onChange={set('cnss')} />
            </FieldRow>

            <FieldRow label="La Date Début d'Activité" htmlFor="e-date">
              <Input id="e-date" icon={<CalendarDays size={17} />} type="date"
                value={form.dateDebut ?? ''} onChange={set('dateDebut')} />
            </FieldRow>
            <FieldRow label="Capitale" htmlFor="e-capital">
              <Input id="e-capital" icon={<Wallet size={17} />} type="number" placeholder="Capitale (Dh)"
                value={form.capital ?? ''} onChange={set('capital')} />
            </FieldRow>

            <FieldRow label="Single" htmlFor="e-single">
              <Input id="e-single" icon={<UserRound size={17} />} placeholder="Single"
                value={form.single ?? ''} onChange={set('single')} />
            </FieldRow>
            <FieldRow label="Déclarations TVA" htmlFor="e-periode">
              <Select id="e-periode" icon={<Percent size={17} />} value={form.periode} onChange={set('periode')}>
                {periodes.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </FieldRow>

            <FieldRow label="Local" htmlFor="e-local">
              <Select id="e-local" icon={<Home size={17} />} value={form.local ?? ''} onChange={set('local')}>
                <option value="">Sélectionner Local</option>
                {locaux.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </FieldRow>
            {/* Comme la référence : le champ reste visible mais DÉSACTIVÉ tant
                que le local n'est pas un contrat de domiciliation. */}
            <FieldRow label="Centre de Domiciliation" htmlFor="e-centre">
              <Select
                id="e-centre"
                icon={<Building2 size={17} />}
                disabled={form.local !== 'Contrat de domiciliation'}
                value={form.centreDomiciliation ?? ''}
                onChange={set('centreDomiciliation')}
              >
                <option value="">Sélectionner Centre de Domiciliation</option>
                {centres.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
              </Select>
            </FieldRow>

            <FieldRow label="N° de dossier" htmlFor="e-dossier">
              <Input id="e-dossier" icon={<Folder size={17} />} placeholder="N° de dossier"
                value={form.numDossier ?? ''} onChange={set('numDossier')} />
            </FieldRow>
            <FieldRow label="N° d'Archive" htmlFor="e-archive">
              <Input id="e-archive" icon={<Archive size={17} />} placeholder="N° d'Archive"
                value={form.numArchive ?? ''} onChange={set('numArchive')} />
            </FieldRow>

            <FieldRow label="Observation" htmlFor="e-observation">
              <Input id="e-observation" icon={<Eye size={17} />} placeholder="Observation"
                value={form.observation ?? ''} onChange={set('observation')} />
            </FieldRow>
            <FieldRow
              label="Client"
              htmlFor="e-client"
              action={<AddButton title="Ajouter un client" onClick={() => navigate('/clients/nouveau')} />}
            >
              <Select id="e-client" value={form.client ?? ''} onChange={set('client')}>
                <option value="">Sélectionner le Client</option>
                {clients.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
              </Select>
            </FieldRow>
          </div>

          {/* Filet de séparation avant Secteur d'Activité / Activité. */}
          <div className="my-6 border-t border-line" />

          <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">

            {/* Comme la référence : UN secteur à gauche, et autant d'activités
                que nécessaire à droite. Les activités ajoutées reprennent le
                secteur de la première ligne — c'est ce que stocke la table
                `entreprise_secteurs`, qui associe un secteur à une activité. */}
            {secteurs.map((row, i) => (
              <Fragment key={i}>
                {i === 0 ? (
                  <FieldRow
                    label="Secteur d'Activité 1"
                    htmlFor="e-secteur-0"
                    action={<AddButton title="Ajouter une activité" onClick={addSecteur} />}
                  >
                    <Select
                      id="e-secteur-0"
                      value={row.secteur}
                      onChange={(e) => setSecteurField(0, 'secteur', e.target.value)}
                    >
                      <option value="">Select Secteur d'Activité</option>
                      {secteursActivite.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                    {row.secteur === 'Autre' && (
                      <Input
                        className="mt-2"
                        placeholder="Précisez le secteur d'activité"
                        value={row.secteurAutre}
                        onChange={(e) => setSecteurField(0, 'secteurAutre', e.target.value)}
                      />
                    )}
                  </FieldRow>
                ) : (
                  // Les lignes suivantes n'affichent que l'activité : la colonne
                  // de gauche reste vide, comme sur la capture.
                  <div className="hidden lg:block" />
                )}

                <FieldRow
                  label={`Activité ${i + 1}`}
                  htmlFor={`e-activite-${i}`}
                  action={i === 0
                    ? <AddButton title="Ajouter une activité" onClick={addSecteur} />
                    : (
                      <button
                        type="button"
                        onClick={() => removeSecteur(i)}
                        title="Retirer cette activité"
                        aria-label="Retirer cette activité"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-danger-500 transition-colors hover:bg-danger-50 hover:text-danger-600 focus-ring"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                >
                  <Input
                    id={`e-activite-${i}`}
                    placeholder="Activité"
                    value={row.activite}
                    onChange={(e) => setSecteurField(i, 'activite', e.target.value)}
                  />
                </FieldRow>
              </Fragment>
            ))}
          </div>

          {/* Personnes rattachées : nom, CIN et rôle — uniquement en
              modification. À la création, l'entreprise n'a pas encore
              d'identité propre à laquelle les rattacher dans le formulaire ;
              ce bloc n'apparaît donc plus sur « Ajouter Entreprise ». */}
          {id && (
          <>
          <div className="my-6 border-t border-line" />

          <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
            {associes.map((row, i) => (
              <Fragment key={i}>
                <FieldRow
                  label={`Nom du Client ${i + 1}`}
                  htmlFor={`e-associe-nom-${i}`}
                  error={errors[`associes.${i}.nom`]?.[0]}
                  action={i === 0
                    ? <AddButton title="Ajouter une personne" onClick={addAssocie} />
                    : (
                      <button
                        type="button"
                        onClick={() => removeAssocie(i)}
                        title="Retirer cette personne"
                        aria-label="Retirer cette personne"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-danger-500 transition-colors hover:bg-danger-50 hover:text-danger-600 focus-ring"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                >
                  <Input
                    id={`e-associe-nom-${i}`}
                    icon={<UserRound size={17} />}
                    placeholder="Nom du Client"
                    value={row.nom}
                    onChange={(e) => setAssocieField(i, 'nom', e.target.value)}
                    error={errors[`associes.${i}.nom`]?.[0]}
                  />
                </FieldRow>

                <FieldRow label="C.I.N" htmlFor={`e-associe-cin-${i}`} error={errors[`associes.${i}.cin`]?.[0]}>
                  <Input
                    id={`e-associe-cin-${i}`}
                    icon={<IdCard size={17} />}
                    placeholder="C.I.N"
                    value={row.cin}
                    onChange={(e) => setAssocieField(i, 'cin', e.target.value)}
                    error={errors[`associes.${i}.cin`]?.[0]}
                  />
                </FieldRow>

                <FieldRow label="Type" htmlFor={`e-associe-type-${i}`} error={errors[`associes.${i}.type`]?.[0]}>
                  <Select
                    id={`e-associe-type-${i}`}
                    icon={<Users size={17} />}
                    value={row.type}
                    onChange={(e) => setAssocieField(i, 'type', e.target.value)}
                  >
                    <option value="">Sélectionner le Type</option>
                    {typesAssocie.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </FieldRow>
                {/* Colonne de droite laissée libre : la personne suivante
                    recommence sur une nouvelle ligne. */}
                <div className="hidden lg:block" />
              </Fragment>
            ))}
          </div>
          </>
          )}
        </FormCard>

        {/* ---- Section repliable « Ajouter Domiciliation » ------------------
            Uniquement à la création : sur une entreprise existante, la
            domiciliation se gère depuis son propre module. */}
        {!id && (
          // `relative` : les deux pistes vertes se posent sur le contour.
          <div className="relative mt-5 overflow-hidden rounded-xl bg-white shadow-card">
            {/* Le filet vert parcourt le haut puis le bas de la carte. */}
            <span className="ve-piste-verte ve-piste-haut top-0" aria-hidden="true" />
            <span className="ve-piste-verte ve-piste-bas bottom-0" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setDomiOpen((o) => !o)}
              aria-expanded={domiOpen}
              aria-controls="section-domiciliation"
              className="flex w-full items-center justify-between gap-4 px-6 py-6 text-left focus-ring"
            >
              {/* Même style de titre que « Ajouter Entreprise » de la carte au-dessus. */}
              <h2 className="text-xl text-ink-900">Ajouter Domiciliation</h2>
              <ChevronDown
                size={20}
                className={`shrink-0 text-ink-600 transition-transform duration-300 ${domiOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Ouverture/fermeture fluide : la grille passe de 0fr à 1fr, ce qui
                anime la hauteur réelle du contenu sans la coder en dur. */}
            <div
              id="section-domiciliation"
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                domiOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="space-y-5 px-6 pb-6">
                {/* Ligne 1 : trois champs, comme la capture. */}
                <div className="grid gap-5 lg:grid-cols-3">
                  <Field label="Prix Par Mois (Dh HT)" required={domiRenseignee}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={domi.prix_par_mois}
                      onChange={setDomiField('prix_par_mois')}
                    />
                  </Field>

                  <Field
                    label="Prix Totale (Dh HT)"
                    required={domiRenseignee}
                    hint="Calculé : Prix par mois × (Mois Payée + Mois Gratuits)"
                  >
                    <Input type="number" value={domi.prix_total} readOnly disabled placeholder="0" />
                  </Field>

                  <Field label="Mode de Paiement">
                    <Select value={domi.mode_paiement} onChange={setDomiField('mode_paiement')}>
                      <option value="">Au choix du client</option>
                      {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </Field>
                </div>

                {/* Ligne 2 : Mois Payée / Mois Gratuits. */}
                <div className="grid gap-5 lg:grid-cols-2">
                  <Field label="Mois Payée">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={domi.mois_payee}
                      onChange={setDomiField('mois_payee')}
                    />
                  </Field>
                  <Field label="Mois Gratuits">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={domi.mois_gratuits}
                      onChange={setDomiField('mois_gratuits')}
                    />
                  </Field>
                </div>

                {/* Ligne 3 : les deux dates de période. Date de Fin est
                    calculée, jamais saisie : départ + (Payée + Gratuits). */}
                <div className="grid gap-5 lg:grid-cols-2">
                  <Field label="Date de Depart">
                    <Input type="date" value={domi.date_depart} onChange={setDomiField('date_depart')} />
                  </Field>
                  <Field
                    label="Date de Fin"
                    hint={`Calculée : date de départ + ${(Number(domi.mois_payee) || 0) + (Number(domi.mois_gratuits) || 0)} mois.`}
                  >
                    <Input type="date" value={domi.date_fin} readOnly disabled />
                  </Field>
                </div>

                {/* Ligne 4 : signature encadrée + les deux dates de facturation. */}
                <div className="grid gap-5 lg:grid-cols-3">
                  <Field label="Signature">
                    <div className="flex min-h-11 items-center rounded-lg border border-line bg-white px-4 py-2.5">
                      <Checkbox
                        label="Ajouter la Signature sur Facture"
                        checked={domi.signature_sur_facture}
                        onChange={setDomiCheck('signature_sur_facture')}
                      />
                    </div>
                    <span className="mt-1.5 block text-xs text-ink-600">
                      Si cette case est cochée, la facture de domiciliation de cette entreprise sera
                      imprimée avec le cachet/signature configuré dans Paramètre &gt; Centre Domiciliation.
                    </span>
                  </Field>

                  <Field label="Date Facture">
                    <Input type="date" value={domi.date_facture} onChange={setDomiField('date_facture')} />
                  </Field>
                  <Field label="Date Paiement">
                    <Input type="date" value={domi.date_paiement} onChange={setDomiField('date_paiement')} />
                  </Field>
                </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bouton unique, pleine largeur, sous les cartes. */}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-4 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Save size={18} />
          {saving ? 'Enregistrement…' : id ? 'Enregistrer les Modifications' : 'Sauvegarder'}
        </button>
      </form>
    </div>
  )
}
