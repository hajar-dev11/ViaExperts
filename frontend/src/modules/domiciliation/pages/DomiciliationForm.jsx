import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Save, Archive, Trash2, Building2, Landmark,
  CalendarDays, Wallet, Coins, CreditCard, Stamp,
} from 'lucide-react'
import { IconeActions, IconeModifier } from '../../../components/ui/icons.jsx'
import DataTable from '../../../components/DataTable.jsx'
import EmptyState from '../../../components/EmptyState.jsx'
import ConfirmDialog from '../../../components/ConfirmDialog.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import ActionMenu from '../../../components/ui/ActionMenu.jsx'
import Button from '../../../components/ui/Button.jsx'
import { Field, Input, Select, CheckboxCard, FormCard, FormActions } from '../../../components/Field.jsx'
import ChampSignature from '../../../components/ChampSignature.jsx'
import SelectRecherche from '../../../components/SelectRecherche.jsx'
import { optionsEntreprises } from '../../../utils/rechercheOptions.js'
import { MenuImprimer } from '../components/DomiciliationActions.jsx'
import { listEntreprises } from '../../../api/entreprises.js'
import { ApiError } from '../../../api/http.js'
import { chargerSignatureDomiciliation } from '../documents/documentsDomiciliation.js'
import { getIdentiteDomiciliation } from '../../../api/settings.js'
import { calculerDateFin, calculerPrixTotal } from '../utils/domiciliation.js'
import { PRIX_PAR_MOIS_DEFAUT, construirePayload, deriverEntreprise, formulaireVide, soumettreFormulaire, erreurDuree } from '../utils/formulaireDomiciliation.js'
import { listCentres } from '../api/centres.js'
import { formatDateHeure } from '../../../utils/format.js'
import {
  listDomiciliations, createDomiciliation, updateDomiciliation,
  getDomiciliation, archiveDomiciliation, corbeilleDomiciliation,
} from '../api/domiciliations.js'
import ModePaiementChamp from '../../../components/ModePaiementChamp.jsx'
import { arrondirPrix, prixArrondiEnTexte } from '../../../utils/arrondi.js'
import { formaterMontant } from '../../../utils/montants.js'

const DOCUMENTS_CASES = [
  { cle: 'doc_facture', titre: 'Ajouter Facture de domiciliation', label: 'Facture de domiciliation' },
  { cle: 'doc_contrat', titre: 'Ajouter Contrat de domiciliation', label: 'Contrat de domiciliation' },
  { cle: 'doc_attestation', titre: 'Ajouter Attestation de domiciliation', label: 'Attestation de domiciliation' },
  { cle: 'doc_procuration', titre: 'Ajouter Procuration', label: 'Procuration' },
]

// Formulaire vierge : `formulaireVide()` (utils/formulaireDomiciliation.js). `date_fin` par défaut calculée UNE FOIS, à partir
// des valeurs par défaut elles-mêmes (départ = aujourd'hui, 12 mois payés) — ce n'est pas un effet réactif : Prix par mois /
// Prix total, eux, ne bougent jamais tout seuls (voir `setEtRecalculer` dans le composant).

// Modification : le total enregistré est considéré comme SAISI À LA MAIN (donc conservé, jamais recalculé tout seul) quand il diffère
// du calcul prix par mois × mois payés ; _origine garde les montants enregistrés pour ne jamais réécrire un montant historique.
const toForm = (d) => ({
  entreprise_id: d.entrepriseId ?? '',
  centre_domiciliation_id: d.centreId ?? '',
  mois_payee: d.moisPayee ?? 0,
  mois_gratuits: d.moisGratuits ?? 0,
  date_depart: d.dateDepart ?? '',
  date_fin: d.dateFin ?? '',
  mode_paiement: d.modePaiement ?? '',
  prix_par_mois: d.prixParMois ?? '',
  prix_total: d.prixTotal ?? '0',
  prix_total_manuel: arrondirPrix(d.prixTotal) !== arrondirPrix(d.prixParMois) * (Number(d.moisPayee) || 0),
  _origine: { prix_par_mois: d.prixParMois, prix_total: d.prixTotal },
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

  const [form, setForm] = useState(() => formulaireVide())
  // Verrou d'envoi : lu et écrit de façon synchrone, contrairement à `saving` (état React, mis à jour au rendu suivant).
  const verrouEnvoi = useRef(false)
  const [entreprises, setEntreprises] = useState([])
  const [centres, setCentres] = useState([])
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
    listCentres({ page: 1, perPage: 100 }).then((res) => setCentres(res.data || [])).catch(() => setCentres([]))
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

  // Entreprise choisie : centre de sa dernière domiciliation connue, sinon le centre déjà associé à la fiche Entreprise.
  // Le champ Centre n'apparaît que lorsqu'aucun centre n'est connu : il est alors à choisir ici (l'entreprise n'est plus
  // bloquée), et ce choix n'est jamais écrasé par un rechargement.
  const connu = useMemo(
    () => (isEdit ? null : deriverEntreprise(rows, entreprises, form.entreprise_id)),
    [rows, entreprises, form.entreprise_id, isEdit],
  )

  // Centre retenu : celui choisi à la main, sinon celui déduit de l'entreprise (en modification : celui de la période).
  const centreId = form.centre_domiciliation_id || connu?.centreId || ''
  const choisirCentre = !isEdit && !!form.entreprise_id && !!connu && !connu.centreId

  const choisirEntreprise = (e) => {
    const valeur = e.target.value
    // Une autre entreprise : le centre choisi pour la précédente ne lui est pas transposé.
    setForm((f) => (isEdit ? { ...f, entreprise_id: valeur } : { ...f, entreprise_id: valeur, centre_domiciliation_id: '' }))
  }

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
      // Durée (payés + gratuits) pour la date de fin ; prix sur les seuls mois PAYÉS : les mois gratuits ne sont pas facturés.
      // Un total saisi à la main n'est PAS écrasé par un changement d'un autre champ : il reste tel quel jusqu'à « Recalculer ».
      const total = next.prix_total_manuel ? next.prix_total : (calculerPrixTotal(next.prix_par_mois, next.mois_payee) ?? '0')
      // Durée nulle : en création la date de fin est vidée (jamais conservée d'une saisie précédente, elle ne
      // correspondrait plus à la durée) ; en modification on garde celle de la période existante.
      return { ...next, date_fin: fin || (isEdit ? next.date_fin : ''), prix_total: total }
    })
  }

  // Total HT saisi à la main : conservé (drapeau prix_total_manuel), arrondi à l'entier à la sortie du champ.
  const saisirTotal = (e) => setForm((f) => ({ ...f, prix_total: e.target.value, prix_total_manuel: true }))
  const arrondirTotal = () => setForm((f) => ({ ...f, prix_total: prixArrondiEnTexte(f.prix_total) }))
  const recalculerTotal = () => setForm((f) => ({ ...f, prix_total: calculerPrixTotal(f.prix_par_mois, f.mois_payee) ?? '0', prix_total_manuel: false }))

  const submit = async (e) => {
    e.preventDefault()
    // Une soumission déjà en cours (double clic, Entrée répétée) : on l'ignore, rien n'est envoyé une seconde fois.
    if (verrouEnvoi.current) return
    setError(''); setSuccess('')

    if (!centreId) {
      setError('Sélectionnez le centre de domiciliation de cette entreprise.')
      return
    }
    const erreurDureeSaisie = isEdit ? '' : erreurDuree(form.mois_payee, form.mois_gratuits, form.date_fin)
    if (erreurDureeSaisie) {
      setError(erreurDureeSaisie)
      return
    }

    const payload = construirePayload(form, centreId)

    setSaving(true); setErrors({})
    const issue = await soumettreFormulaire({
      verrou: verrouEnvoi,
      formulaire: form,
      creation: !isEdit,
      envoyer: () => (isEdit ? updateDomiciliation(id, payload) : createDomiciliation(payload)),
    })

    if (issue.statut === 'ignoree') return

    setSaving(false)
    if (issue.statut === 'succes') {
      // La confirmation n'apparaît qu'APRÈS la réponse positive du serveur. En création, le formulaire repart à neuf
      // (champs, erreurs, entreprise et dates), comme au premier affichage.
      setForm(issue.formulaire)
      setErrors({}); setError('')
      setSuccess(isEdit ? 'Domiciliation modifiée avec succès.' : 'Domiciliation enregistrée avec succès.')
      loadRows()
      return
    }

    // Échec : les données saisies sont conservées pour être corrigées. On recharge la liste : si la période existe déjà
    // (nouvelle tentative après un premier envoi réussi), elle y apparaît.
    const err = issue.erreur
    if (err instanceof ApiError && err.errors) setErrors(err.errors)
    setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    loadRows()
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
          {/* 1. Entreprise : tout en haut du formulaire, avant les autres champs, sur toute la largeur de la ligne. */}
          <div>
            <Field label="Entreprise" required htmlFor="d-entreprise" error={e1('entreprise_id')}>
              <SelectRecherche
                id="d-entreprise"
                icon={<Building2 size={17} />}
                required
                options={optionsEntreprises(entreprises)}
                value={form.entreprise_id}
                onChange={(valeur) => choisirEntreprise({ target: { value: valeur } })}
                placeholder="Sélectionnez une Entreprise"
                error={!!e1('entreprise_id')}
              />
            </Field>
          </div>

          {/* Seulement quand ni l'entreprise ni ses périodes précédentes n'ont de centre : on le choisit ici, sans quitter la page. */}
          {choisirCentre && (
            <div className="mt-5">
              <Field label="Centre de Domiciliation" required htmlFor="d-centre" error={e1('centre_domiciliation_id')}>
                <Select
                  id="d-centre"
                  icon={<Landmark size={17} />}
                  required
                  value={form.centre_domiciliation_id}
                  onChange={set('centre_domiciliation_id')}
                  error={e1('centre_domiciliation_id')}
                >
                  <option value="">Sélectionnez un centre</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </Select>
              </Field>
              {centres.length === 0 && (
                <Alert tone="warning" className="mt-3">
                  Aucun centre de domiciliation actif : créez-en un dans Paramètres avant d'enregistrer.
                </Alert>
              )}
            </div>
          )}

          {/* 2. Période : « Date de départ » et « Date de fin », juste après l'entreprise (et le centre). */}
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Date de départ" required error={e1('date_depart')}>
              <Input type="date" required value={form.date_depart} onChange={setEtRecalculer('date_depart')} error={e1('date_depart')} />
            </Field>
            <Field label="Date de fin" hint={`Calculée : date de départ + ${dureeMois} mois (payés + gratuits).`}>
              <Input type="date" value={form.date_fin} readOnly disabled />
            </Field>
          </div>

          {/* 3. Durée du contrat. « Mois payés » démarre à 0. */}
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Mois payés" required error={e1('mois_payee')}>
              <Input type="number" min="0" required value={form.mois_payee} onChange={setEtRecalculer('mois_payee')} error={e1('mois_payee')} />
            </Field>
            <Field label="Mois gratuits">
              <Input type="number" min="0" value={form.mois_gratuits} onChange={setEtRecalculer('mois_gratuits')} />
            </Field>
          </div>

          {/* 4. Règlement : mode, prix par mois et prix total (HT). */}
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-3">
            <ModePaiementChamp icon={<CreditCard size={17} />} value={form.mode_paiement} onChange={(v) => setForm((f) => ({ ...f, mode_paiement: v }))} />
            <Field
              label="Prix par mois (Dh HT)"
              required
              error={e1('prix_par_mois')}
              hint={`Valeur par défaut : ${formaterMontant(PRIX_PAR_MOIS_DEFAUT)} Dh HT.`}
            >
              <Input icon={<Wallet size={17} />} type="number" step="0.01" min="0" required
                value={form.prix_par_mois} onChange={setEtRecalculer('prix_par_mois')} error={e1('prix_par_mois')} />
            </Field>
            <Field
              label="Prix total HT (Dh)"
              required
              error={e1('prix_total')}
              hint={form.prix_total_manuel
                ? <>Montant saisi à la main. <button type="button" onClick={recalculerTotal} className="font-semibold text-brand-600 hover:underline">Recalculer</button> (prix par mois × mois payés)</>
                : 'Calculé : prix par mois × mois payés, arrondi à l\'entier (mois gratuits non facturés). Modifiable.'}
            >
              <Input icon={<Coins size={17} />} type="number" step="0.01" min="0" required
                value={form.prix_total} onChange={saisirTotal} onBlur={arrondirTotal} error={e1('prix_total')} />
            </Field>
          </div>

          {/* 5. Facturation : dates et signature (même présentation partout : ChampSignature). */}
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date Facture" required>
              <Input icon={<CalendarDays size={17} />} type="date" required value={form.date_facture} onChange={set('date_facture')} />
            </Field>
            <Field label="Date Paiement" required>
              <Input icon={<CalendarDays size={17} />} type="date" required value={form.date_paiement} onChange={set('date_paiement')} />
            </Field>
            <Field label="Date Légalisation" required>
              <Input icon={<CalendarDays size={17} />} type="date" required value={form.date_legalisation} onChange={set('date_legalisation')} />
            </Field>
            <ChampSignature checked={form.signature_sur_facture} onChange={setCheck('signature_sur_facture')} />
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

      {/* Bloc centré dans son cadre : titre centré, et message « aucune domiciliation » centré dans un cadre blanc. */}
      <div className="mt-8">
        <h2 className="mb-3 text-center text-xl text-ink-900">Domiciliations ajoutées</h2>
        {rows.length === 0 ? (
          <div className="rounded-xl bg-white shadow-card">
            <EmptyState title="Aucune domiciliation enregistrée" />
          </div>
        ) : (
          <DataTable
            columns={[
              {
                key: 'denomination',
                header: 'Entreprise',
                wrap: true,
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
              { key: 'prixTotal', header: 'Prix payé HT', numeric: true },
              { key: 'createdAt', header: 'Date opération', wrap: true, render: (r) => formatDateHeure(r.createdAt) },
              { key: 'createdBy', header: 'Action de', wrap: true, value: (r) => r.createdBy || '—' },
            ]}
            compact
            rows={rows}
            actionsHeader="ACTION"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                <MenuImprimer domiciliation={r} signaturePath={signaturePath} />
                <ActionMenu
                  label="Actions"
                  icon={<IconeActions />}
                  items={[
                    {
                      label: 'Modifier',
                      icon: <IconeModifier size={15} />,
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
