import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Building2, IdCard, ScanLine, MapPin, Archive, Phone, Mail, Eye, Trash2,
} from 'lucide-react'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { SkeletonText } from '../components/ui/Skeleton.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import DataTable from '../components/DataTable.jsx'
import StatutDomiciliation from '../components/StatutDomiciliation.jsx'
import { CarteFiche, Ligne, Section } from '../components/FicheInfos.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getCentre, deleteCentre } from '../api/centres.js'
import { ApiError } from '../api/http.js'
import { formatDate } from '../utils/format.js'

/**
 * « Informations Centre de domiciliation » — mêmes briques (`CarteFiche` /
 * `Ligne` / `Section`) que « Informations Entreprise » et « Informations
 * Domiciliation », plus la liste des entreprises domiciliées dans ce centre.
 */
export default function CentreDomiciliationDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const isAdmin = !!user?.is_admin

  const [centre, setCentre] = useState(null)
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)
  const [confirmSuppression, setConfirmSuppression] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const charger = useCallback(() => {
    setChargement(true)
    getCentre(id)
      .then(setCentre)
      .catch(() => setErreur('Impossible de charger ce centre de domiciliation.'))
      .finally(() => setChargement(false))
  }, [id])

  useEffect(charger, [charger])

  if (chargement) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <SkeletonText lines={10} />
      </div>
    )
  }

  if (!centre) {
    return <Alert tone="danger">{erreur || 'Centre introuvable.'}</Alert>
  }

  const domiciliations = centre.domiciliations ?? []

  const supprimer = async () => {
    setConfirmSuppression(false)
    setSuppression(true)
    try {
      await deleteCentre(id)
      navigate('/domiciliation/centres')
    } catch (err) {
      // 422 attendu si le centre est référencé par une entreprise (FK ON DELETE RESTRICT).
      setErreur(err instanceof ApiError ? err.message : 'La suppression a échoué.')
      setSuppression(false)
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
      <button
        type="button"
        onClick={() => navigate('/domiciliation/centres')}
        className="col-span-full -mb-2 inline-flex w-fit items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900 focus-ring"
      >
        <ArrowLeft size={15} /> Retour aux Centres des Domiciliation
      </button>

      {erreur && <Alert tone="danger" className="col-span-full" onClose={() => setErreur('')}>{erreur}</Alert>}

      <CarteFiche icon={Building2} titre="Informations Centre de domiciliation">
        <Section>À propos</Section>
        <Ligne icon={Building2} label="Nom du centre" value={centre.nom} />
        <Ligne icon={IdCard} label="IF" value={centre.if} />
        <Ligne icon={ScanLine} label="ICE" value={centre.ice} />
        <Ligne icon={MapPin} label="Ville" value={centre.ville} />
        <Ligne icon={MapPin} label="Adresse" value={centre.adresse} />
        <Ligne icon={Archive} label="N° archive" value={centre.numero_archive} />

        <Section>Contacts</Section>
        <Ligne icon={Phone} label="Téléphone" value={centre.telephone} />
        <Ligne icon={Mail} label="Email" value={centre.email} />

        {isAdmin && (
          <div className="mt-6">
            <Button variant="danger-soft" loading={suppression} onClick={() => setConfirmSuppression(true)}>
              <Trash2 size={15} /> Supprimer
            </Button>
          </div>
        )}
      </CarteFiche>

      <div className="xl:col-span-2">
        <div className="overflow-hidden rounded-xl bg-white shadow-card">
          <h2 className="px-6 pt-6 pb-4 text-xl text-ink-900">
            Entreprises domiciliées ({domiciliations.length})
          </h2>
          <DataTable
            columns={[
              { key: 'situation', header: 'Situation', render: (r) => <StatutDomiciliation statut={r.statut_affichage} /> },
              {
                key: 'denomination',
                header: 'Dénomination',
                render: (r) => (r.entreprise?.party_id
                  ? <Link to={`/entreprises/${r.entreprise.party_id}`} className="font-semibold text-brand-700 hover:underline">{r.entreprise?.denomination}</Link>
                  : <span className="font-semibold text-brand-700">{r.entreprise?.denomination}</span>),
              },
              { key: 'date_depart', header: 'Date Départ', render: (r) => formatDate(r.date_depart) },
              { key: 'date_fin', header: 'Date Fin', render: (r) => formatDate(r.date_fin) },
            ]}
            rows={domiciliations}
            actionsHeader="ACTIONS"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                <RowBtn title="Afficher" onClick={() => navigate(`/domiciliation/${r.id}`)}><Eye size={15} /></RowBtn>
              </div>
            )}
            emptyText="Aucune entreprise domiciliée dans ce centre"
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmSuppression}
        title="Supprimer ce centre"
        message={`Voulez-vous vraiment supprimer « ${centre.nom} » ?`}
        onCancel={() => setConfirmSuppression(false)}
        onConfirm={supprimer}
      />
    </div>
  )
}
