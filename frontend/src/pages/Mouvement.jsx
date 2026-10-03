import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, Printer, Archive, Trash2, ListTree } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { Field, Input, Select } from '../components/Field.jsx'
import { ApiError } from '../api/http.js'
import { mouvementRecu, mouvementFacture } from '../api/mouvements.js'
import { getPaiement, archivePaiement, corbeillePaiement } from '../api/paiements.js'
import { getDocument } from '../api/facturation.js'
import ChoixFormatRecu from '../components/ChoixFormatRecu.jsx'
import { imprimerRecuPaiementPdf } from '../utils/documentPrint.js'
import { imprimerDocument } from '../components/DocumentList.jsx'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`

const TRIMESTRES = [
  { value: '1', label: 'Trimestre 1 (Jan–Mar)' },
  { value: '2', label: 'Trimestre 2 (Avr–Juin)' },
  { value: '3', label: 'Trimestre 3 (Juil–Sep)' },
  { value: '4', label: 'Trimestre 4 (Oct–Déc)' },
]

/**
 * Vue de mouvement — structure commune aux 2 captures :
 * bandeau de filtres, carte de totaux, puis le tableau détaillé et son export.
 * Pas de bandeau de titre séparé : la navigation Reçu/Facturé vit déjà dans
 * la sidebar (Mouvement), et `carteTitre` porte le titre visible.
 *
 * `onReloadReady` transmet la fonction de rechargement au parent, pour
 * recharger après Archiver/Corbeille.
 */
function VueMouvement({
  carteTitre, tableauTitre, charger, totauxDef, columns, exportColumns,
  rowActions, actionsHeader, onReloadReady, rowClassName,
}) {
  const [filtres, setFiltres] = useState({ dateDebut: '', dateFin: '', annee: '', trimestre: '' })
  const [appliques, setAppliques] = useState({ dateDebut: '', dateFin: '', annee: '', trimestre: '' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    charger(appliques)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter ce mouvement."
        : 'Impossible de charger les mouvements.'))
      .finally(() => setLoading(false))
  }, [charger, appliques])

  useEffect(load, [load])
  useEffect(() => { onReloadReady?.(load) }, [load, onReloadReady])

  const set = (k) => (e) => setFiltres((f) => ({ ...f, [k]: e.target.value }))
  const lignes = data?.lignes ?? []

  return (
    <div>
      <div className="rounded-xl bg-white p-5 shadow-card mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Date Range">
              <Input type="date" value={filtres.dateDebut} onChange={set('dateDebut')} />
            </Field>
            <span className="pb-3 text-sm text-ink-600">to</span>
            <Field label="&nbsp;">
              <Input type="date" value={filtres.dateFin} onChange={set('dateFin')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Date Range">
              <Select value={filtres.annee} onChange={set('annee')}>
                <option value="">Toute</option>
                {(data?.annees ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
            <Field label="&nbsp;">
              <Select value={filtres.trimestre} onChange={set('trimestre')}>
                <option value="">Select Trimestre</option>
                {TRIMESTRES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setAppliques(filtres)}
            className="rounded-lg border border-brand-300 bg-white text-brand-700 font-semibold px-6 py-2.5 text-sm hover:bg-brand-50 transition-colors"
          >
            Filtre
          </button>
        </div>
      </div>

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      <div className="rounded-xl bg-white shadow-card mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="font-bold text-ink-900">{carteTitre}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {totauxDef.map(({ cle, label }) => (
            <div key={cle} className="px-5 py-4 border-b sm:border-b-0 sm:border-r last:border-r-0 border-line">
              <div className="text-xs uppercase tracking-wide text-ink-600 mb-1.5">{label}</div>
              <div className="text-lg font-bold text-ink-900">
                {loading ? '…' : dh(data?.totaux?.[cle])}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DataTable
        title={tableauTitre}
        actions={(
          <ExportMenu
            filename={tableauTitre.toLowerCase().replace(/\s+/g, '-')}
            title={tableauTitre}
            columns={exportColumns}
            rows={lignes}
            disabled={lignes.length === 0}
          />
        )}
        columns={columns}
        rows={lignes}
        loading={loading}
        actionsHeader={actionsHeader}
        rowActions={rowActions}
        rowClassName={rowClassName}
        striped={!rowClassName}
        emptyText="Aucun mouvement sur cette période"
      />
    </div>
  )
}

export function MouvementRecu() {
  const navigate = useNavigate()
  const toast = useToast()
  const reloadRef = useRef(() => {})
  const [confirm, setConfirm] = useState(null)
  // Paiement dont l'utilisateur choisit le format de reçu (A5 / A4) avant impression.
  const [choixRecu, setChoixRecu] = useState(null)

  // Le paiement est chargé APRÈS l'ouverture de l'onglet du PDF (fait ici, au clic).
  const imprimerRecu = (format) => {
    const { id } = choixRecu
    setChoixRecu(null)
    imprimerRecuPaiementPdf(() => getPaiement(id), format).catch(() => toast.error("L'impression du reçu a échoué."))
  }

  const run = async (fn, message) => {
    try {
      await fn()
      toast.success(message)
      reloadRef.current()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const columns = [
    { key: 'responsable', header: 'Responsable' },
    {
      key: 'client',
      header: 'Client',
      clamp: 2,
      render: (r) => (r.entrepriseId
        ? <Link to={`/entreprises/${r.entrepriseId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link>
        : r.clientId
          ? <Link to={`/clients/${r.clientId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link>
          : <span className="font-semibold text-brand-700">{r.client}</span>),
    },
    { key: 'prixTotal', header: 'Prix Total', value: (r) => r.prixTotal, render: (r) => dh(r.prixTotal) },
    { key: 'prixPaye', header: 'Prix Payer', value: (r) => r.prixPaye, render: (r) => dh(r.prixPaye) },
    {
      key: 'prixRestant',
      header: 'Prix Restant',
      value: (r) => r.prixRestant,
      render: (r) => <span className="font-semibold text-ink-900">{dh(r.prixRestant)}</span>,
    },
    { key: 'dateOperation', header: 'Date Opération' },
    { key: 'dateCredit', header: 'Date Fine', render: (r) => r.dateCredit || <span className="text-ink-600">—</span> },
  ]

  const rowClassName = (r) => (Number(r.prixRestant) > 0 ? 'bg-warning-200' : 'bg-success-200')

  return (
    <>
      <VueMouvement
        carteTitre="Mouvement Entrés (Reçu)"
        tableauTitre="Gestion des Paiements"
        charger={mouvementRecu}
        totauxDef={[
          { cle: 'montantRestante', label: 'Montant Restante' },
          { cle: 'montantPaye', label: 'Montant Paye' },
          { cle: 'montantTotal', label: 'Montant Total' },
        ]}
        columns={columns}
        exportColumns={columns.map((c) => ({ header: c.header, value: (r) => (c.value ? c.value(r) : r[c.key]) }))}
        onReloadReady={(fn) => { reloadRef.current = fn }}
        actionsHeader="ACTION"
        rowClassName={rowClassName}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <RowBtn title="Afficher" onClick={() => navigate('/paiement', { state: { paiementId: r.id } })}><Eye size={14} /></RowBtn>
            <RowBtn title="Imprimer" onClick={() => setChoixRecu(r)}><Printer size={14} /></RowBtn>
            <ActionMenu
              label="Actions"
              icon={<ListTree size={16} />}
              items={[
                {
                  label: 'Archiver',
                  icon: <Archive size={15} />,
                  tone: 'warning',
                  onClick: () => setConfirm({
                    title: 'Archiver ce paiement ?',
                    message: `« ${r.client} » sera déplacé dans les archives.`,
                    confirmLabel: 'Archiver',
                    run: () => run(() => archivePaiement(r.id), 'Paiement archivé.'),
                  }),
                },
                {
                  label: 'Corbeille',
                  icon: <Trash2 size={15} />,
                  tone: 'danger',
                  onClick: () => setConfirm({
                    title: 'Mettre ce paiement à la corbeille ?',
                    message: `« ${r.client} » sera déplacé dans la corbeille.`,
                    confirmLabel: 'Corbeille',
                    run: () => run(() => corbeillePaiement(r.id), 'Paiement placé dans la corbeille.'),
                  }),
                },
              ]}
            />
          </div>
        )}
      />
      <ChoixFormatRecu
        open={!!choixRecu}
        reference={choixRecu?.reference}
        onChoisir={imprimerRecu}
        onClose={() => setChoixRecu(null)}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        confirmLabel={confirm?.confirmLabel}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />
    </>
  )
}

export function MouvementFacture() {
  const reloadRef = useRef(() => {})

  const columns = [
    { key: 'responsable', header: 'Responsable' },
    { key: 'numero', header: 'Numéro', render: (r) => <span className="font-mono text-xs font-semibold text-ink-900">{r.numero}</span> },
    {
      key: 'client',
      header: 'Client / Entreprise',
      clamp: 2,
      render: (r) => (r.entrepriseId
        ? <Link to={`/entreprises/${r.entrepriseId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link>
        : r.clientId
          ? <Link to={`/clients/${r.clientId}`} className="font-semibold text-brand-700 hover:underline">{r.client}</Link>
          : <span className="font-semibold text-brand-700">{r.client}</span>),
    },
    { key: 'dateDocument', header: 'Date Facturation' },
    { key: 'totalHt', header: 'Total HT', value: (r) => r.totalHt, render: (r) => dh(r.totalHt) },
    { key: 'totalTtc', header: 'Total TTC', value: (r) => r.totalTtc, render: (r) => dh(r.totalTtc) },
    { key: 'prixPaye', header: 'Prix Payer', value: (r) => r.prixPaye, render: (r) => dh(r.prixPaye) },
    {
      key: 'prixRestant',
      header: 'Rest',
      value: (r) => r.prixRestant,
      render: (r) => <span className="font-semibold text-ink-900">{dh(r.prixRestant)}</span>,
    },
  ]

  const rowClassName = (r) => (Number(r.prixRestant) > 0 ? 'bg-warning-200' : 'bg-success-200')

  return (
    <>
      <VueMouvement
        carteTitre="Mouvement Entrés (Facture)"
        tableauTitre="List Des Facturs"
        charger={mouvementFacture}
        totauxDef={[
          { cle: 'montantTotal', label: 'Montant Total' },
          { cle: 'montantHt', label: 'Montant HT' },
          { cle: 'montantPaye', label: 'Montant Paye' },
        ]}
        columns={columns}
        exportColumns={columns.map((c) => ({ header: c.header, value: (r) => (c.value ? c.value(r) : r[c.key]) }))}
        onReloadReady={(fn) => { reloadRef.current = fn }}
        actionsHeader="ACTION"
        rowClassName={rowClassName}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <RowBtn title="Imprimer" onClick={() => getDocument('facture', r.id).then((d) => imprimerDocument('facture', d))}>
              <Printer size={14} />
            </RowBtn>
          </div>
        )}
      />
    </>
  )
}
