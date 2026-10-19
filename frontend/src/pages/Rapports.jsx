import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Download } from 'lucide-react'
import { IconeModifier } from '../components/ui/icons.jsx'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { Field, Input, Textarea, FormCard, FormActions } from '../components/Field.jsx'
import { ApiError } from '../api/http.js'
import { EMETTEURS } from '../shared/constants/documents.js'
import { aujourdhui } from '../shared/utils/date.js'
import { listRapports, getRapport, createRapport, updateRapport, urlDocument } from '../api/rapports.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`
const n = (v) => { const x = parseFloat(v); return Number.isNaN(x) ? 0 : x }

// Titre dynamique de la capture : « Rapport de jour : Mardi 15 septembre 2026 | 15/09/2026 »
function titreDuJour(iso) {
  if (!iso) return 'Rapport de jour'
  const d = new Date(`${iso}T00:00:00`)
  const longue = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `Rapport de jour : ${longue.charAt(0).toUpperCase()}${longue.slice(1)} | ${d.toLocaleDateString('fr-FR')}`
}

// ------------------------------------------------------------------ Formulaire

export function RapportForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [form, setForm] = useState({
    // Date LOCALE du jour : `toISOString()` donnait la date UTC, donc la veille entre minuit et 1 h (UTC+1).
    date_rapport: aujourdhui(),
    rapport_de: EMETTEURS[0].label,
    montant_restant: 0, revenu_local: 0, revenu_externe: 0, depense_jour: 0,
    solde_caisse: '', descriptive: '',
  })
  const [document, setDocument] = useState(null)
  const [documentActuel, setDocumentActuel] = useState(null)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [saving, setSaving] = useState(false)
  const [soldeTouche, setSoldeTouche] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const charger = useCallback(() => {
    if (!isEdit) return
    getRapport(id)
      .then((r) => {
        setErreurChargement('')
        setForm({
          date_rapport: r.dateRapport ?? '',
          rapport_de: r.rapportDe ?? '',
          montant_restant: r.montantRestant,
          revenu_local: r.revenuLocal,
          revenu_externe: r.revenuExterne,
          depense_jour: r.depenseJour,
          solde_caisse: r.soldeCaisse,
          descriptive: r.descriptive ?? '',
        })
        setDocumentActuel(r.documentNom ? { nom: r.documentNom } : null)
        setSoldeTouche(true)
      })
      .catch(() => setErreurChargement('Rapport introuvable.'))
  }, [id, isEdit])

  useEffect(() => { charger() }, [charger])

  // Total Revenu du jour = Revenu Local + Revenu Externe (règle lisible sur la capture).
  const totalRevenu = useMemo(
    () => n(form.revenu_local) + n(form.revenu_externe),
    [form.revenu_local, form.revenu_externe],
  )

  // Solde de Caisse : pré-rempli (Montant Restant − Dépense du Jour) mais MODIFIABLE,
  // la capture ne permettant pas de trancher la formule exacte (dépense = 0 partout).
  const soldePropose = useMemo(
    () => n(form.montant_restant) - n(form.depense_jour),
    [form.montant_restant, form.depense_jour],
  )
  const soldeAffiche = soldeTouche ? form.solde_caisse : soldePropose.toFixed(2)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setErrors({}); setError('')
    try {
      const payload = {
        date_rapport: form.date_rapport,
        rapport_de: form.rapport_de,
        montant_restant: Number(form.montant_restant) || 0,
        revenu_local: Number(form.revenu_local) || 0,
        revenu_externe: Number(form.revenu_externe) || 0,
        depense_jour: Number(form.depense_jour) || 0,
        solde_caisse: Number(soldeAffiche) || 0,
        descriptive: form.descriptive,
      }
      if (document) payload.document = document

      if (isEdit) await updateRapport(id, payload)
      else await createRapport(payload)
      navigate('/rapports')
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  const err = (k) => errors[k] && <span className="mt-1 block text-xs text-danger-600">{errors[k][0]}</span>

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={() => { setErreurChargement(''); charger() }}>{erreurChargement}</Alert>}

      <form onSubmit={submit}>
        {/* Un seul cadre, pleine largeur — titre, tous les champs et les
            boutons Annuler/Enregistrer dans le même bloc blanc. */}
        <FormCard
          title={titreDuJour(form.date_rapport)}
          footer={(
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => navigate('/rapports')}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" icon={<Save size={16} />} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </FormActions>
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Field label="Montant Restant">
              <Input type="number" step="0.01" value={form.montant_restant} onChange={set('montant_restant')} />
              {err('montant_restant')}
            </Field>
            <Field label="Revenu Local">
              <Input type="number" step="0.01" value={form.revenu_local} onChange={set('revenu_local')} />
            </Field>
            <Field label="Revenu Externe">
              <Input type="number" step="0.01" value={form.revenu_externe} onChange={set('revenu_externe')} />
            </Field>
            <Field label="Dépense du Jour">
              <Input type="number" step="0.01" value={form.depense_jour} onChange={set('depense_jour')} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
            <Field label="Rapport de">
              <Input value={form.rapport_de} onChange={set('rapport_de')} placeholder="Via Experts" />
            </Field>
            <Field label="Date du rapport" required>
              <Input type="date" required value={form.date_rapport} onChange={set('date_rapport')} />
              {err('date_rapport')}
            </Field>
          </div>

          <Field label="Descriptive de Rapport" className="mt-5">
            <Textarea rows={6} value={form.descriptive} onChange={set('descriptive')} />
          </Field>

          <Field label="Document (pour Multi-Document add sur ZIP, RAR)" className="mt-5">
            <input
              type="file"
              onChange={(e) => setDocument(e.target.files?.[0] || null)}
              className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
            />
            {documentActuel && !document && (
              <span className="mt-1.5 block text-xs text-ink-600">
                Document actuel : <a href={urlDocument(id)} className="text-brand-600 hover:underline">{documentActuel.nom}</a>
              </span>
            )}
            {err('document')}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
            <Field label="Solde de Caisse">
              <Input
                type="number"
                step="0.01"
                value={soldeAffiche}
                onChange={(e) => { setSoldeTouche(true); setForm((f) => ({ ...f, solde_caisse: e.target.value })) }}
              />
            </Field>
            <Field label="Total Revenu du jour">
              <Input readOnly value={totalRevenu.toFixed(2)} className="bg-slate-100 text-slate-500" />
            </Field>
          </div>
        </FormCard>
      </form>
    </div>
  )
}

// ------------------------------------------------------------------------ Liste

export function RapportList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    listRapports('actif')
      .then(setRows)
      .catch((err) => setErreurChargement(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les rapports."
        : 'Impossible de charger les rapports.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const columns = [
    { key: 'rapportDe', header: 'Rapport de' },
    {
      key: 'descriptive',
      header: 'Descriptive',
      clamp: 1,
      render: (r) => <span className="text-ink-600">{r.descriptive || '—'}</span>,
    },
    { key: 'montantRestant', header: 'Montant Restant', value: (r) => r.montantRestant, render: (r) => dh(r.montantRestant) },
    { key: 'revenuLocal', header: 'Revenu Local', value: (r) => r.revenuLocal, render: (r) => dh(r.revenuLocal) },
    { key: 'revenuExterne', header: 'Revenu Externe', value: (r) => r.revenuExterne, render: (r) => dh(r.revenuExterne) },
    { key: 'depenseJour', header: 'Depense du Jour', value: (r) => r.depenseJour, render: (r) => dh(r.depenseJour) },
    { key: 'soldeCaisse', header: 'Solde Caisse', value: (r) => r.soldeCaisse, render: (r) => dh(r.soldeCaisse) },
    { key: 'totalRevenuJour', header: 'Revenu du Jour', value: (r) => r.totalRevenuJour, render: (r) => dh(r.totalRevenuJour) },
    { key: 'dateRapport', header: 'Date' },
  ]

  const exportColumns = columns.map((c) => ({ header: c.header, value: (r) => (c.value ? c.value(r) : r[c.key]) }))

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}

      <DataTable
        title="List Raports"
        actions={(
          <ExportMenu
            filename="rapports-actif"
            title="List Raports"
            columns={exportColumns}
            rows={rows}
            disabled={rows.length === 0}
          />
        )}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="Aucun rapport"
        actionsHeader="ACTION"
        rowActions={(r) => (
            <div className="flex justify-end gap-1.5">
              <RowBtn title="Modifier" onClick={() => navigate(`/rapports/${r.id}/modifier`)}><IconeModifier /></RowBtn>
              {r.documentNom && (
                <a
                  href={urlDocument(r.id)}
                  title={`Télécharger ${r.documentNom}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-surface hover:text-brand-600 focus-ring"
                >
                  <Download size={14} />
                </a>
              )}
            </div>
          )}
        />
    </div>
  )
}
