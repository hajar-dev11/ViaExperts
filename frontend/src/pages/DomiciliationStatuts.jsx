import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, Plus, RefreshCw } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import { IconButton } from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { FormulaireRenouvellement } from '../components/DomiciliationActions.jsx'
import { ApiError } from '../api/http.js'
import { listDomiciliations, renouvelerDomiciliation } from '../api/domiciliations.js'
import { classerNouveauRenouveler } from '../utils/domiciliation.js'
import { formatDate } from '../utils/format.js'

/**
 * Six tableaux, côte à côte, comme « List Domiciliation » de la référence.
 * `tone` teinte l'en-tête et les lignes.
 *
 * « Nouveau » / « Renouveler » distinguent une première période d'un
 * renouvellement (`classerNouveauRenouveler`) parmi les domiciliations
 * actives ; les quatre suivants reprennent directement le statut d'affichage
 * calculé côté serveur.
 */
const SECTIONS = [
  { cle: 'nouveau', titre: 'Nouveau', tone: 'success', texte: 'text-success-700' },
  { cle: 'renouveler', titre: 'Renouveler', tone: 'neutral', texte: 'text-info-700' },
  { cle: 'alerte', titre: 'Alerte', tone: 'warning', texte: 'text-warning-700' },
  { cle: 'expire', titre: 'Expiré', tone: 'danger', texte: 'text-danger-700' },
  { cle: 'declare', titre: 'Déclaré', tone: 'neutral', texte: 'text-ink-800' },
  { cle: 'resilie', titre: 'Résilié', tone: 'neutral', texte: 'text-ink-800' },
]

const exportColumns = [
  { header: 'Dénomination', value: (r) => r.denomination },
  { header: 'Centre', value: (r) => r.centre },
  { header: 'Date de', value: (r) => r.dateDepart },
  { header: 'à', value: (r) => r.dateFin },
  { header: 'N° Archive', value: (r) => r.numeroArchive },
  { header: 'Email', value: (r) => r.email },
  { header: 'Action de', value: (r) => r.createdBy },
]

export default function DomiciliationStatuts() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [renouvellementFor, setRenouvellementFor] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    // Un seul appel : le statut d'affichage est calculé côté serveur et renvoyé
    // pour chaque ligne, on répartit ensuite dans les tableaux.
    listDomiciliations({ status: 'actif' })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les domiciliations."
        : 'Impossible de charger les domiciliations.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  // « (N) » pour une première période, « (R) » pour un renouvellement.
  const classement = useMemo(() => classerNouveauRenouveler(rows), [rows])

  const rowsDeSection = (cle) => {
    if (cle === 'nouveau' || cle === 'renouveler') {
      return rows.filter((r) => r.statutAffichage === 'active' && classement.get(r.id) === cle)
    }
    return rows.filter((r) => r.statutAffichage === cle)
  }

  const colonnes = (section) => [
    {
      key: 'denomination',
      header: 'Dénomination',
      clamp: 2,
      value: (r) => r.denomination,
      render: (r) => (
        <Link to={`/domiciliation/${r.id}`} className={`font-medium hover:underline ${section.texte}`}>
          {r.denomination}
        </Link>
      ),
    },
    { key: 'centre', header: 'Centre', clamp: 2, render: (r) => <span className={section.texte}>{r.centre}</span> },
    {
      key: 'periode',
      header: 'Date',
      value: (r) => `${r.dateDepart ?? ''} ${r.dateFin ?? ''}`,
      render: (r) => (
        <span className={`block leading-snug ${section.texte}`}>
          {formatDate(r.dateDepart) || '—'}
          <span className="block text-ink-600">À</span>
          {formatDate(r.dateFin) || '—'}
        </span>
      ),
    },
    { key: 'createdBy', header: 'Action de', clamp: 1, value: (r) => r.createdBy || '—' },
  ]

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert tone="success" className="mb-3" onClose={() => setSuccess('')}>{success}</Alert>}

      {renouvellementFor && (
        <FormulaireRenouvellement
          domiciliation={renouvellementFor}
          onAnnuler={() => setRenouvellementFor(null)}
          onEnregistrer={async ({ champs }) => {
            const cible = renouvellementFor
            setError(''); setSuccess('')
            try {
              await renouvelerDomiciliation(cible.id, champs)
              setSuccess(`Domiciliation « ${cible.denomination} » renouvelée.`)
              setRenouvellementFor(null)
              load()
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Le renouvellement n'a pas pu être enregistré.")
            }
          }}
        />
      )}

      <div className="grid items-start gap-6 xl:grid-cols-3">
        {SECTIONS.map((section) => {
          const sectionRows = rowsDeSection(section.cle)
          return (
            <DataTable
              key={section.cle}
              title={section.titre}
              actions={(
                <>
                  {section.cle === 'nouveau' && (
                    <IconButton variant="success" to="/domiciliation/nouvelle" title="Nouvelle Domiciliation">
                      <Plus size={18} />
                    </IconButton>
                  )}
                  <ExportMenu
                    filename={`domiciliations-${section.cle}`}
                    title={section.titre}
                    columns={exportColumns}
                    rows={sectionRows}
                    disabled={sectionRows.length === 0}
                  />
                </>
              )}
              columns={colonnes(section)}
              rows={sectionRows}
              tone={section.tone}
              // « Afficher N entrées » reste au-dessus du tableau — le titre et
              // l'export sont désormais dans l'en-tête de la carte.
              searchable={false}
              pageSize={5}
              pageSizeOptions={[5, 10, 25, 50]}
              actionsHeader="ACTION"
              rowActions={(r) => (
                <div className="flex justify-end gap-1.5">
                  {/* Renouveler directement depuis le tableau. */}
                  <RowBtn title="Renouveler" onClick={() => setRenouvellementFor(r)}>
                    <RefreshCw size={15} />
                  </RowBtn>
                  <RowBtn title="Afficher" onClick={() => navigate(`/domiciliation/${r.id}`)}>
                    <Eye size={15} />
                  </RowBtn>
                </div>
              )}
              loading={loading}
              emptyText="Aucune domiciliation dans ce statut"
            />
          )
        })}
      </div>
    </div>
  )
}
