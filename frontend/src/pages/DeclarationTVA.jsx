import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Plus, Save, Trash2, Download, Archive, RotateCcw, Pencil, ListTree, ArrowLeft, X, FileCode2, FileSpreadsheet, FileArchive } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { Field, Input, Select, FormCard, FormActions } from '../components/Field.jsx'
import { ApiError } from '../api/http.js'
import { listEntreprises } from '../api/entreprises.js'
import {
  listDeclarations, getDeclaration, createDeclaration, updateDeclaration, urlExport,
  archiveDeclaration, corbeilleDeclaration, restoreDeclaration, deleteDeclarationForever,
} from '../api/declarationsTva.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`
const n = (v) => { const x = parseFloat(v); return Number.isNaN(x) ? 0 : x }

function SituationBadge({ situation }) {
  const declaree = situation === 'declaree'
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${declaree ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {declaree ? 'Déclarée' : 'Non Déclaré'}
    </span>
  )
}

const emptyLigne = {
  ordre_ref: '', fact_num: '', designation: '', ht: 0, tva: 0, ttc: 0,
  identifiant_fiscal: '', libelle_fournisseur: '', ice: '', taux: 20,
  id_paie: '', date_paie: '', date_fac: '',
}

// Colonnes du tableau de saisie, reprises de la capture (référence production
// « Nouvelle Chiffre d'Affaire », même tableau pour « Nouvelle Déclaration »).
// Libellé Fournisseur / ICE restent dans les données de chaque ligne (envoyés
// tels quels à l'enregistrement) sans être affichés. IF est réaffiché : c'est
// la clé qui identifie « le même fournisseur/client » pour le contrôle du
// seuil espèces (5 000 Dh cumulés, règle ci-dessous).
const COLONNES_LIGNE = [
  { cle: 'ordre_ref', label: 'OR', largeur: 'w-20' },
  { cle: 'fact_num', label: 'FACT NUM', largeur: 'w-28' },
  { cle: 'designation', label: 'DESIGNATION', largeur: 'min-w-[160px]' },
  { cle: 'ht', label: 'HT', type: 'number', largeur: 'w-28' },
  { cle: 'tva', label: 'TVA', type: 'number', largeur: 'w-28' },
  { cle: 'ttc', label: 'TTC', type: 'number', largeur: 'w-28' },
  { cle: 'identifiant_fiscal', label: 'IF', largeur: 'w-24' },
  { cle: 'taux', label: 'TAUX', type: 'number', largeur: 'w-20' },
  { cle: 'id_paie', label: 'ID PAIE', largeur: 'w-24' },
  { cle: 'date_paie', label: 'DATE PAIE', type: 'date', largeur: 'w-36' },
  { cle: 'date_fac', label: 'DATE FAC', type: 'date', largeur: 'w-36' },
]

// ---- Contrôle « espèces > 5 000 Dh cumulés par fournisseur/client » -------
// Règle : pour un même fournisseur/client (identifié par IF), on cumule le
// TTC de toutes ses factures réglées en espèces (id_paie de la ligne, ou à
// défaut l'Identifiant de Paiement de l'en-tête, contient « ESPECE » — seul
// indicateur de mode de paiement disponible sur ce formulaire). Les factures
// virement/chèque/autre ne sont jamais comptées. Dès que le cumul dépasse
// 5 000 Dh, TOUTES les factures espèces de ce fournisseur sont signalées —
// pas seulement celle qui fait franchir le seuil (ex. 3 000 + 3 000 Dh).
const SEUIL_ESPECES = 5000

const estReglementEspeces = (ligne, identifiantPaiementDefaut) => {
  const identifiant = String(ligne.id_paie || identifiantPaiementDefaut || '').toUpperCase()
  return identifiant.includes('ESPECE')
}

// Clé de regroupement « même fournisseur/client » : l'IF normalisé (espaces
// retirés, insensible à la casse). Une ligne sans IF saisi n'est jamais
// regroupée avec une autre ligne sans IF (ce serait un mauvais regroupement,
// pas un vrai point commun) : elle reçoit une clé unique qui lui est propre.
const cleFournisseur = (ligne, index) => {
  const identifiantFiscal = String(ligne.identifiant_fiscal || '').trim().toUpperCase()
  return identifiantFiscal || `__sans_if_${index}`
}

function useAnalyseEspeces(lignes, identifiantPaiementDefaut) {
  return useMemo(() => {
    const groupes = new Map()
    lignes.forEach((ligne, index) => {
      if (!estReglementEspeces(ligne, identifiantPaiementDefaut)) return
      const cle = cleFournisseur(ligne, index)
      const groupe = groupes.get(cle) ?? { identifiantFiscal: ligne.identifiant_fiscal || '', total: 0, indices: [] }
      groupe.total += n(ligne.ttc)
      groupe.indices.push(index)
      groupes.set(cle, groupe)
    })
    const depassements = [...groupes.values()].filter((g) => g.total > SEUIL_ESPECES)
    const lignesSignalees = new Set(depassements.flatMap((g) => g.indices))
    return { depassements, lignesSignalees }
  }, [lignes, identifiantPaiementDefaut])
}

// ------------------------------------------------------------------ Formulaire

function Formulaire({ type, titre, listTo, avecExportsComplets }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [form, setForm] = useState({
    entreprise_id: '', client_if: '', identifiant_paiement: '1-ESPECES',
    periode_type: 'trimestre', periode_valeur: '', annee: String(new Date().getFullYear()), regime: '2',
  })
  // Table vide au départ : seuls les titres de colonnes sont visibles tant que
  // l'utilisateur n'a pas cliqué sur « Ajouter » (le cas édition repeuple ce
  // state depuis les lignes existantes, ci-dessous).
  const [lignes, setLignes] = useState([])
  const [entreprises, setEntreprises] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
  }, [])

  useEffect(() => {
    if (!isEdit) return
    getDeclaration(type, id)
      .then((d) => {
        setForm({
          entreprise_id: d.entrepriseId ?? '',
          client_if: d.clientIf ?? '',
          identifiant_paiement: d.identifiantPaiement ?? '',
          periode_type: d.periodeType ?? 'trimestre',
          periode_valeur: d.periodeValeur ?? '',
          annee: String(d.annee ?? ''),
          regime: d.regime ?? '',
        })
        setLignes((d.lignes || []).map((l) => ({
          ordre_ref: l.ordreRef ?? '', fact_num: l.factNum ?? '', designation: l.designation ?? '',
          ht: l.ht, tva: l.tva, ttc: l.ttc,
          identifiant_fiscal: l.identifiantFiscal ?? '', libelle_fournisseur: l.libelleFournisseur ?? '',
          ice: l.ice ?? '', taux: l.taux, id_paie: l.idPaie ?? '',
          date_paie: l.datePaie ?? '', date_fac: l.dateFac ?? '',
        })))
      })
      .catch(() => setError('Déclaration introuvable.'))
  }, [id, isEdit, type])

  const totaux = useMemo(() => ({
    ht: lignes.reduce((a, l) => a + n(l.ht), 0),
    tva: lignes.reduce((a, l) => a + n(l.tva), 0),
    ttc: lignes.reduce((a, l) => a + n(l.ttc), 0),
  }), [lignes])

  const analyseEspeces = useAnalyseEspeces(lignes, form.identifiant_paiement)

  const majLigne = (i, k, v) => setLignes((ls) => ls.map((l, idx) => {
    if (idx !== i) return l
    let val = v
    // Le taux ne doit jamais dépasser 100 (ni être négatif) — clampé au fil
    // de la saisie, en miroir de la règle backend `max:100`/`min:0`.
    if (k === 'taux' && val !== '') {
      const num = Number(val)
      if (Number.isFinite(num)) {
        if (num > 100) val = '100'
        else if (num < 0) val = '0'
      }
    }
    const maj = { ...l, [k]: val }
    // TTC déduit de HT + TVA dès que l'un des deux change.
    if (k === 'ht' || k === 'tva') maj.ttc = (n(maj.ht) + n(maj.tva)).toFixed(2)
    return maj
  }))

  // Miroir des règles backend (DeclarationTvaController::regles) côté
  // frontend : évite un aller-retour 422 pour une erreur détectable ici.
  const validerLignes = () => {
    const errs = {}
    if (lignes.length === 0) {
      errs.lignes = ['Ajoutez au moins une ligne avant d’enregistrer.']
      return errs
    }
    lignes.forEach((l, i) => {
      const taux = l.taux === '' ? null : Number(l.taux)
      if (taux !== null && (Number.isNaN(taux) || taux < 0 || taux > 100)) {
        errs[`lignes.${i}.taux`] = ['Le taux doit être compris entre 0 et 100.']
      }
    })
    return errs
  }

  const enregistrer = async (situation) => {
    const erreursLignes = validerLignes()
    if (Object.keys(erreursLignes).length > 0) {
      setErrors(erreursLignes)
      setError('Merci de corriger les champs en rouge avant d’enregistrer.')
      return
    }
    setSaving(true); setErrors({}); setError('')
    try {
      const payload = {
        ...form,
        entreprise_id: Number(form.entreprise_id),
        periode_valeur: Number(form.periode_valeur),
        annee: Number(form.annee),
        situation,
        lignes: lignes.map((l) => ({
          ...l,
          ht: Number(l.ht) || 0, tva: Number(l.tva) || 0, ttc: Number(l.ttc) || 0,
          taux: Number(l.taux) || 0,
          date_paie: l.date_paie || null,
          date_fac: l.date_fac || null,
        })),
      }
      if (isEdit) await updateDeclaration(type, id, payload)
      else await createDeclaration(type, payload)
      navigate(listTo)
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  const err = (k) => errors[k] && <span className="mt-1 block text-xs text-danger-600">{errors[k][0]}</span>

  // Les exports ne peuvent pointer que vers une déclaration déjà enregistrée
  // (id connu) — visibles dès la création (comme la référence), désactivés
  // tant qu'il n'y a rien à exporter.
  // Classes identiques à celles du composant partagé `Button` (variant/size
  // "md") : un `<a>`/`<span>` est nécessaire ici car la cible est une URL
  // d'export externe, que `Button` (`to` interne uniquement) ne gère pas.
  const exportBtn = (href, label, Icon, classes) => (
    isEdit ? (
      <a href={href} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition-colors focus-ring ${classes}`}>
        <Icon size={15} /> {label}
      </a>
    ) : (
      <span
        title="Disponible après l'enregistrement"
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap text-white shadow-sm opacity-60 cursor-not-allowed ${classes}`}
      >
        <Icon size={15} /> {label}
      </span>
    )
  )

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}

      {/* Un seul cadre, pleine largeur — titre, champs, lignes, totaux et
          boutons Sauvegarder dans le même bloc blanc. */}
      <FormCard
        title={isEdit ? `Modifier — ${titre}` : titre}
        action={avecExportsComplets ? (
          <div className="flex flex-wrap items-center gap-2">
            {exportBtn(isEdit && urlExport(type, id, 'zip'), 'ZIP', FileArchive, 'bg-info-500 hover:bg-info-600')}
            {exportBtn(isEdit && urlExport(type, id, 'xml'), 'XML', FileCode2, 'bg-warning-500 hover:bg-warning-600')}
            {exportBtn(isEdit && urlExport(type, id, 'xls'), 'XLS', FileSpreadsheet, 'bg-success-500 hover:bg-success-600')}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {exportBtn(isEdit && urlExport(type, id, 'xls'), 'Exporter Excel', FileSpreadsheet, 'bg-success-500 hover:bg-success-600')}
          </div>
        )}
        footer={(
          <FormActions>
            <Button type="button" variant="primary" loading={saving} onClick={() => enregistrer('non_declaree')} icon={<Save size={16} />}>
              Sauvegarder (Non Déclaré)
            </Button>
            <Button type="button" variant="success" loading={saving} onClick={() => enregistrer('declaree')} icon={<Save size={16} />}>
              Sauvegarder (Déclarée)
            </Button>
          </FormActions>
        )}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Field label="Sélectionner Entreprise" required>
            <Select required value={form.entreprise_id} onChange={set('entreprise_id')}>
              <option value="">Sélectionner Entreprise</option>
              {entreprises.map((e) => <option key={e.id} value={e.id}>{e.denomination}</option>)}
            </Select>
            {err('entreprise_id')}
          </Field>
          <Field label="Client IF" required>
            <Input required value={form.client_if} onChange={set('client_if')} placeholder="Client IF" />
            {err('client_if')}
          </Field>
          <Field label="Identifiant de Paiement">
            <Input value={form.identifiant_paiement} onChange={set('identifiant_paiement')} placeholder="1-ESPECES" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Selectionner Periode" required>
              <Select value={form.periode_type} onChange={set('periode_type')}>
                <option value="trimestre">PERIODE(Trimestre)</option>
                <option value="mois">PERIODE(Mois)</option>
              </Select>
            </Field>
            <Field label="&nbsp;">
              <Select required value={form.periode_valeur} onChange={set('periode_valeur')}>
                <option value="">Sélectionner Période</option>
                {(form.periode_type === 'trimestre' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((v) => (
                  <option key={v} value={v}>{form.periode_type === 'trimestre' ? `Trimestre ${v}` : `Mois ${v}`}</option>
                ))}
              </Select>
              {err('periode_valeur')}
            </Field>
          </div>

          <Field label="Annee" required>
            <Input type="number" required min="2000" max="2100" value={form.annee} onChange={set('annee')} />
            {err('annee')}
          </Field>
          <Field label="Regime(Encaissement-2)" required>
            <Input required value={form.regime} onChange={set('regime')} placeholder="2" />
            {err('regime')}
          </Field>
        </div>

        {analyseEspeces.depassements.length > 0 && (
          <Alert tone="warning" className="mt-6">
            <span className="font-semibold">
              Seuil espèces dépassé ({dh(SEUIL_ESPECES)}) pour {analyseEspeces.depassements.length} fournisseur(s)/client(s) :
            </span>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {analyseEspeces.depassements.map((g) => (
                <li key={g.identifiantFiscal}>
                  IF {g.identifiantFiscal} — cumul espèces {dh(g.total)} sur {g.indices.length} facture(s)
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface text-left text-[13px] font-semibold tracking-wide uppercase text-ink-600">
                {COLONNES_LIGNE.map((c) => <th key={c.cle} className="border-b border-line py-3 px-3">{c.label}</th>)}
                <th className="border-b border-line py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={COLONNES_LIGNE.length + 1} className="py-8 text-center text-sm text-ink-600">
                    Aucune ligne. Cliquez sur « Ajouter » pour commencer la saisie.
                  </td>
                </tr>
              ) : lignes.map((l, i) => (
                <tr key={i} className={`border-b border-line last:border-0 ${i % 2 === 1 ? 'bg-surface' : ''}`}>
                  {COLONNES_LIGNE.map((c) => {
                    const signalee = c.cle === 'ttc' && analyseEspeces.lignesSignalees.has(i)
                    return (
                      <td key={c.cle} className={`px-3 py-3 align-top ${c.largeur}`}>
                        <div className={signalee ? 'rounded-lg ring-2 ring-warning-500' : ''}>
                          <Input
                            type={c.type || 'text'}
                            step={c.type === 'number' ? '0.01' : undefined}
                            min={c.cle === 'taux' ? 0 : undefined}
                            max={c.cle === 'taux' ? 100 : undefined}
                            value={l[c.cle]}
                            onChange={(e) => majLigne(i, c.cle, e.target.value)}
                            error={errors[`lignes.${i}.${c.cle}`]?.[0]}
                          />
                        </div>
                        {signalee && (
                          <span className="mt-1 block text-[11px] font-medium text-warning-700">
                            Espèces &gt; {dh(SEUIL_ESPECES)} cumulés pour ce fournisseur
                          </span>
                        )}
                        {errors[`lignes.${i}.${c.cle}`] && (
                          <span className="mt-1 block text-[11px] text-danger-600">{errors[`lignes.${i}.${c.cle}`][0]}</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-3 align-top">
                    <RowBtn
                      title="Retirer"
                      onClick={() => setLignes((ls) => ls.filter((_, idx) => idx !== i))}
                      className="hover:bg-danger-50 hover:text-danger-600"
                    >
                      <X size={15} />
                    </RowBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.lignes && <span className="block border-t border-line px-2 py-2 text-xs text-danger-600">{errors.lignes[0]}</span>}
        </div>

        <Button
          variant="primary"
          fullWidth
          className="mt-3"
          onClick={() => setLignes((ls) => [...ls, { ...emptyLigne }])}
          icon={<Plus size={15} />}
        >
          Ajouter
        </Button>

        {/* Totaux en lecture seule, dérivés des lignes ci-dessus. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Field label="Total HT"><Input readOnly value={totaux.ht.toFixed(2)} className="bg-slate-100" /></Field>
          <Field label="Total Montant TVA"><Input readOnly value={totaux.tva.toFixed(2)} className="bg-slate-100" /></Field>
          <Field label="Total TTC"><Input readOnly value={totaux.ttc.toFixed(2)} className="bg-slate-100" /></Field>
        </div>
      </FormCard>
    </div>
  )
}

// ------------------------------------------------------------------------ Liste

function Liste({ type, titre, editBase, addTo, addLabel, avecExportsComplets }) {
  const navigate = useNavigate()
  const toast = useToast()
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [situation, setSituation] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listDeclarations(type, { status, situation })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter cette liste."
        : 'Impossible de charger la liste.'))
      .finally(() => setLoading(false))
  }, [type, status, situation])

  useEffect(load, [load])

  const run = async (fn, message) => {
    try {
      await fn()
      toast.success(message)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const columns = [
    { key: 'situation', header: 'Situation', value: (r) => r.situation, render: (r) => <SituationBadge situation={r.situation} /> },
    { key: 'nomComplet', header: 'Nom Complet', clamp: 2, render: (r) => <span className="font-semibold text-brand-700">{r.nomComplet}</span> },
    { key: 'periode', header: 'Periode' },
    { key: 'annee', header: 'Annee' },
    { key: 'totalHt', header: 'HT', value: (r) => r.totalHt, render: (r) => dh(r.totalHt) },
    { key: 'totalTva', header: 'TVA', value: (r) => r.totalTva, render: (r) => dh(r.totalTva) },
    { key: 'totalTtc', header: 'TTC', value: (r) => r.totalTtc, render: (r) => dh(r.totalTtc) },
    { key: 'date', header: 'Date' },
  ]

  const exportColumns = columns.map((c) => ({ header: c.header, value: (r) => (c.value ? c.value(r) : r[c.key]) }))

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}

      <DataTable
        title={titre}
        filter={(
          <>
            {status !== 'actif' && (
              <Button variant="secondary" onClick={() => setStatus('actif')} icon={<ArrowLeft size={15} />}>
                Retour à la liste
              </Button>
            )}
            <div className="w-full sm:w-52">
              <Select value={situation} onChange={(e) => setSituation(e.target.value)}>
                <option value="">Toutes les situations</option>
                <option value="declaree">Déclarée</option>
                <option value="non_declaree">Non Déclaré</option>
              </Select>
            </div>
          </>
        )}
        actions={(
          <>
            <Button variant="success" to={addTo} icon={<Plus size={16} />}>{addLabel}</Button>
            <ExportMenu
              filename={`${type}-${status}`}
              title={titre}
              columns={exportColumns}
              rows={rows}
              disabled={rows.length === 0}
            />
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux éléments actifs' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux éléments actifs' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille'))}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucune ligne' : status === 'archive' ? 'Aucune ligne archivée' : 'Corbeille vide'}
        actionsHeader="ACTION"
        rowActions={(r) => (
            <div className="flex justify-end gap-1.5">
              <a
                href={urlExport(type, r.id, avecExportsComplets ? 'zip' : 'xls')}
                title={avecExportsComplets ? 'Télécharger (ZIP)' : 'Télécharger (XLS)'}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-surface hover:text-brand-600 focus-ring"
              >
                <Download size={14} />
              </a>
              <ActionMenu
                label="Actions"
                icon={<ListTree size={16} />}
                items={
                  status === 'actif' ? [
                    { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => navigate(`${editBase}/${r.id}/modifier`) },
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      onClick: () => setConfirm({
                        title: 'Archiver cette ligne ?',
                        message: `« ${r.nomComplet} » sera déplacée dans les archives.`,
                        confirmLabel: 'Archiver',
                        run: () => run(() => archiveDeclaration(type, r.id), 'Ligne archivée.'),
                      }),
                    },
                    {
                      label: 'Corbeille',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirm({
                        title: 'Mettre cette ligne à la corbeille ?',
                        message: `« ${r.nomComplet} » sera déplacée dans la corbeille.`,
                        confirmLabel: 'Corbeille',
                        run: () => run(() => corbeilleDeclaration(type, r.id), 'Ligne placée dans la corbeille.'),
                      }),
                    },
                  ] : status === 'archive' ? [
                    { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreDeclaration(type, r.id), 'Ligne restaurée.') },
                  ] : [
                    { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreDeclaration(type, r.id), 'Ligne restaurée.') },
                    {
                      label: 'Supprimer définitivement',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirm({
                        message: 'Supprimer définitivement cette ligne ? Cette action est irréversible.',
                        run: () => run(() => deleteDeclarationForever(type, r.id), 'Ligne supprimée définitivement.'),
                      }),
                    },
                  ]
                }
              />
            </div>
          )}
        />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        confirmLabel={confirm?.confirmLabel}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />
    </div>
  )
}

// -------------------------------------------------------------------- Exports

export function DeclarationForm() {
  return <Formulaire type="tva" titre="Nouvelle Declaration" listTo="/declaration-tva" avecExportsComplets />
}

export function DeclarationList() {
  return (
    <Liste
      type="tva"
      titre="Liste des Déclarations de TVA"
      editBase="/declaration-tva"
      addTo="/declaration-tva/nouvelle"
      addLabel="Nouvelle Declaration"
      avecExportsComplets
    />
  )
}

export function ChiffreAffairesForm() {
  return <Formulaire type="chiffre_affaire" titre="Chiffre d'Affaire" listTo="/declaration-tva/chiffre-affaires" />
}

export function ChiffreAffairesList() {
  return (
    <Liste
      type="chiffre_affaire"
      titre="Liste des Chiffre d'Affaire"
      editBase="/declaration-tva/chiffre-affaires"
      addTo="/declaration-tva/chiffre-affaires/nouveau"
      addLabel="Ajouter Chiffre d'Affaire"
    />
  )
}
