import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { ApiError } from '../api/http.js'
import { getArchiveCounts } from '../api/archive.js'
import { listClients, corbeilleClient, restoreClient, deleteClientForever } from '../api/clients.js'
import { listEntreprises, corbeilleEntreprise, restoreEntreprise, deleteEntrepriseForever } from '../api/entreprises.js'
import {
  listDomiciliations, corbeilleDomiciliation, restoreDomiciliation, deleteDomiciliationForever,
} from '../modules/domiciliation/index.js'
import { listServices, corbeilleService, restoreService, deleteServiceForever } from '../api/services.js'
import {
  listServicesEnCours, corbeilleServiceEnCours, restoreServiceEnCours, deleteServiceEnCoursForever,
} from '../api/servicesEnCours.js'
import { listDocuments, corbeilleDocument, restoreDocument, deleteDocumentForever } from '../modules/facturation/index.js'
import { listPaiements, corbeillePaiement, restorePaiement, deletePaiementForever } from '../api/paiements.js'
import {
  listDeclarations, corbeilleDeclaration, restoreDeclaration, deleteDeclarationForever,
} from '../api/declarationsTva.js'
import { listRapports, corbeilleRapport, restoreRapport, deleteRapportForever } from '../api/rapports.js'
import { listCachets, corbeilleCachet, restoreCachet, deleteCachetForever } from '../api/cachets.js'
import { listMails, corbeilleMail, restoreMail, deleteMailForever } from '../api/mails.js'
import { listFiches, corbeilleFiche, restoreFiche, deleteFicheForever } from '../api/dataCenter.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`

/**
 * Catégories réellement branchées sur un backend.
 *
 * Chaque entrée déclare comment lister, restaurer et supprimer définitivement,
 * ses colonnes (reprises d'aussi près que possible du tableau d'origine), et
 * comment retrouver l'élément complet quand on clique dessus :
 *   - `to(r)`       une fiche dédiée existe (Client/Entreprise/Domiciliation) →
 *                    lien direct vers CETTE fiche, données complètes, quel
 *                    que soit son statut.
 *   - `listPath`    pas de fiche dédiée → clic sur la ligne renvoie vers le
 *                    tableau d'origine du module, sur le même onglet
 *                    Archivés/Corbeille, avec toutes ses colonnes et actions.
 *
 * Aucune catégorie n'est ajoutée sans backend correspondant : la liste suit
 * exactement les modules disponibles côté API.
 */
const CATEGORIES = {
  clients: {
    label: 'Clients',
    list: (status) => listClients(status),
    corbeille: corbeilleClient,
    restore: restoreClient,
    destroy: deleteClientForever,
    rowLabel: (r) => r.nom,
    to: (r) => `/clients/${r.id}`,
    columns: [
      { key: 'nom', header: 'Nom', render: (r) => <Link to={`/clients/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.nom}</Link> },
      { key: 'email', header: 'Email' },
      { key: 'cin', header: 'CIN' },
      { key: 'tel', header: 'Téléphone' },
    ],
  },
  entreprises: {
    label: 'Entreprises',
    list: (status) => listEntreprises(status),
    corbeille: corbeilleEntreprise,
    restore: restoreEntreprise,
    destroy: deleteEntrepriseForever,
    rowLabel: (r) => r.denomination,
    to: (r) => `/entreprises/${r.id}`,
    columns: [
      { key: 'denomination', header: 'Dénomination', render: (r) => <Link to={`/entreprises/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.denomination}</Link> },
      { key: 'local', header: 'Local' },
      { key: 'if', header: 'I.F' },
      { key: 'id', header: 'N° Archive', value: (r) => r.id },
    ],
  },
  domiciliation: {
    label: 'Domiciliation',
    list: (status) => listDomiciliations({ status }),
    corbeille: corbeilleDomiciliation,
    restore: restoreDomiciliation,
    destroy: deleteDomiciliationForever,
    rowLabel: (r) => r.denomination,
    to: (r) => `/domiciliation/${r.id}`,
    columns: [
      { key: 'denomination', header: 'Dénomination', render: (r) => <Link to={`/domiciliation/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.denomination}</Link> },
      { key: 'centre', header: 'Centre' },
      { key: 'dateDepart', header: 'Date Départ' },
      { key: 'dateFin', header: 'Date Fin' },
      { key: 'createdBy', header: 'Action de', value: (r) => r.createdBy || '—' },
    ],
  },
  services: {
    label: 'Services',
    list: (status) => listServices(status),
    corbeille: corbeilleService,
    restore: restoreService,
    destroy: deleteServiceForever,
    rowLabel: (r) => r.nom,
    listPath: '/services',
    columns: [
      { key: 'nom', header: 'Service' },
      { key: 'prix', header: 'Prix', render: (r) => dh(r.prix) },
      { key: 'description', header: 'Description', clamp: 1 },
    ],
  },
  services_en_cours: {
    label: 'Services En Cours',
    list: (status) => listServicesEnCours(status),
    corbeille: corbeilleServiceEnCours,
    restore: restoreServiceEnCours,
    destroy: deleteServiceEnCoursForever,
    rowLabel: (r) => r.service,
    listPath: '/services-en-cours',
    columns: [
      { key: 'statut', header: 'Statut', value: (r) => r.statut?.nom, render: (r) => r.statut ? <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold" style={{ color: r.statut.couleurTexte, background: r.statut.couleurFond }}>{r.statut.nom}</span> : '—' },
      { key: 'service', header: 'Service' },
      { key: 'client', header: 'Client' },
      { key: 'dateDepart', header: 'Départ' },
    ],
  },
  facture: {
    label: 'Factures',
    list: (status) => listDocuments('facture', { status }),
    corbeille: (id) => corbeilleDocument('facture', id),
    restore: (id) => restoreDocument('facture', id),
    destroy: (id) => deleteDocumentForever('facture', id),
    rowLabel: (r) => r.numero,
    listPath: '/facturation/factures',
    columns: [
      { key: 'numero', header: 'Numéro' },
      { key: 'tiers', header: 'Client / Entreprise' },
      { key: 'dateDocument', header: 'Date' },
      { key: 'totalTtc', header: 'Total TTC', render: (r) => dh(r.totalTtc) },
      { key: 'prixRestant', header: 'Reste', render: (r) => dh(r.prixRestant) },
    ],
  },
  devis: {
    label: 'Devis',
    list: (status) => listDocuments('devis', { status }),
    corbeille: (id) => corbeilleDocument('devis', id),
    restore: (id) => restoreDocument('devis', id),
    destroy: (id) => deleteDocumentForever('devis', id),
    rowLabel: (r) => r.numero,
    listPath: '/facturation/devis',
    columns: [
      { key: 'numero', header: 'Numéro' },
      { key: 'tiers', header: 'Client / Entreprise' },
      { key: 'dateDocument', header: 'Date' },
      { key: 'totalTtc', header: 'Total TTC', render: (r) => dh(r.totalTtc) },
    ],
  },
  bl: {
    label: 'Bons de Livraison',
    list: (status) => listDocuments('bl', { status }),
    corbeille: (id) => corbeilleDocument('bl', id),
    restore: (id) => restoreDocument('bl', id),
    destroy: (id) => deleteDocumentForever('bl', id),
    rowLabel: (r) => r.numero,
    listPath: '/facturation/bon-livraison',
    columns: [
      { key: 'numero', header: 'Numéro' },
      { key: 'tiers', header: 'Client / Entreprise' },
      { key: 'dateDocument', header: 'Date' },
      { key: 'totalTtc', header: 'Total TTC', render: (r) => dh(r.totalTtc) },
    ],
  },
  avoir: {
    label: "Factures d'Avoir",
    list: (status) => listDocuments('avoir', { status }),
    corbeille: (id) => corbeilleDocument('avoir', id),
    restore: (id) => restoreDocument('avoir', id),
    destroy: (id) => deleteDocumentForever('avoir', id),
    rowLabel: (r) => r.numero,
    listPath: '/facturation/avoir',
    columns: [
      { key: 'numero', header: 'Numéro' },
      { key: 'tiers', header: 'Client / Entreprise' },
      { key: 'dateDocument', header: 'Date' },
      { key: 'totalTtc', header: 'Total TTC', render: (r) => dh(r.totalTtc) },
    ],
  },
  paiements: {
    label: 'Paiements',
    list: (status) => listPaiements({ status }),
    corbeille: corbeillePaiement,
    restore: restorePaiement,
    destroy: deletePaiementForever,
    rowLabel: (r) => r.reference,
    listPath: '/paiement',
    columns: [
      { key: 'reference', header: 'Référence' },
      { key: 'client', header: 'Client' },
      { key: 'total', header: 'Total', render: (r) => dh(r.total) },
      { key: 'prixRestant', header: 'Prix Restant', render: (r) => dh(r.prixRestant) },
    ],
  },
  tva: {
    label: 'Déclarations TVA',
    list: (status) => listDeclarations('tva', { status }),
    corbeille: (id) => corbeilleDeclaration('tva', id),
    restore: (id) => restoreDeclaration('tva', id),
    destroy: (id) => deleteDeclarationForever('tva', id),
    rowLabel: (r) => `${r.nomComplet} — ${r.periode}`,
    listPath: '/declaration-tva',
    columns: [
      { key: 'nomComplet', header: 'Nom Complet' },
      { key: 'periode', header: 'Periode' },
      { key: 'annee', header: 'Annee' },
      { key: 'totalTtc', header: 'TTC', render: (r) => dh(r.totalTtc) },
    ],
  },
  chiffre_affaire: {
    label: "Chiffre d'Affaire",
    list: (status) => listDeclarations('chiffre_affaire', { status }),
    corbeille: (id) => corbeilleDeclaration('chiffre_affaire', id),
    restore: (id) => restoreDeclaration('chiffre_affaire', id),
    destroy: (id) => deleteDeclarationForever('chiffre_affaire', id),
    rowLabel: (r) => `${r.nomComplet} — ${r.periode}`,
    listPath: '/declaration-tva/chiffre-affaires',
    columns: [
      { key: 'nomComplet', header: 'Nom Complet' },
      { key: 'periode', header: 'Periode' },
      { key: 'annee', header: 'Annee' },
      { key: 'totalTtc', header: 'TTC', render: (r) => dh(r.totalTtc) },
    ],
  },
  rapports: {
    label: 'Rapports',
    list: (status) => listRapports(status),
    corbeille: corbeilleRapport,
    restore: restoreRapport,
    destroy: deleteRapportForever,
    rowLabel: (r) => `${r.rapportDe} — ${r.dateRapport}`,
    columns: [
      { key: 'rapportDe', header: 'Rapport de' },
      { key: 'dateRapport', header: 'Date' },
      { key: 'montantRestant', header: 'Montant Restant', render: (r) => dh(r.montantRestant) },
      { key: 'totalRevenuJour', header: 'Revenu du Jour', render: (r) => dh(r.totalRevenuJour) },
    ],
  },
  cachets: {
    label: 'Les Cachets',
    list: (status) => listCachets(status),
    corbeille: corbeilleCachet,
    restore: restoreCachet,
    destroy: deleteCachetForever,
    rowLabel: (r) => r.client,
    listPath: '/cachets',
    columns: [
      { key: 'statut', header: 'Statut', value: (r) => r.statut?.nom ?? 'En attente', render: (r) => r.statut ? <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold" style={{ color: r.statut.couleurTexte, background: r.statut.couleurFond }}>{r.statut.nom}</span> : <span className="inline-flex items-center rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">En attente</span> },
      { key: 'client', header: 'Client' },
      { key: 'dateDepart', header: 'Départ' },
      { key: 'derniereOperation', header: 'Dernière Opération' },
    ],
  },
  mails: {
    label: 'Les Mails',
    list: (status) => listMails(status),
    corbeille: corbeilleMail,
    restore: restoreMail,
    destroy: deleteMailForever,
    rowLabel: (r) => r.client,
    listPath: '/mails',
    columns: [
      { key: 'statut', header: 'Statut', value: (r) => r.statut?.nom ?? 'En attente', render: (r) => r.statut ? <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold" style={{ color: r.statut.couleurTexte, background: r.statut.couleurFond }}>{r.statut.nom}</span> : <span className="inline-flex items-center rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">En attente</span> },
      { key: 'client', header: 'Client' },
      { key: 'dateDepart', header: 'Départ' },
      { key: 'derniereOperation', header: 'Dernière Opération' },
    ],
  },
  data_center: {
    label: 'Data Center',
    list: (status) => listFiches({ status, perPage: 100 }).then((res) => res.data || []),
    corbeille: corbeilleFiche,
    restore: restoreFiche,
    destroy: deleteFicheForever,
    rowLabel: (r) => r.denomination,
    listPath: '/data-center',
    columns: [
      { key: 'denomination', header: 'Dénomination' },
      { key: 'ice', header: 'I.C.E' },
      { key: 'if', header: 'I.F' },
      { key: 'rc', header: 'R.C' },
    ],
  },
}

const CLES = Object.keys(CATEGORIES)

function ArchivedPanel({ pageTitle, status, showDeleteForever }) {
  const navigate = useNavigate()
  const [active, setActive] = useState('clients')
  const [rowsByCategory, setRowsByCategory] = useState({})
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  // Compteurs de TOUTES les catégories, en une seule requête — visibles dès
  // l'ouverture de la page, sans avoir à cliquer sur chaque catégorie.
  useEffect(() => {
    getArchiveCounts(status).then(setCounts).catch(() => setCounts({}))
  }, [status])

  /**
   * Chargement À LA DEMANDE, catégorie par catégorie, pour les LIGNES
   * complètes (les compteurs, eux, sont déjà tous chargés ci-dessus).
   *
   * Charger les 16 catégories d'un coup au montage déclenchait le throttle
   * Laravel (60 req/min → HTTP 429) dès quelques navigations. On ne charge
   * donc les lignes que de la catégorie consultée ; les résultats déjà
   * obtenus restent en cache tant que l'on ne change pas de statut.
   */
  const load = (cle = active) => {
    setLoading(true)
    setError('')
    // Une catégorie sans permission renvoie 403 : elle est marquée inaccessible
    // (null) au lieu de faire échouer la page.
    CATEGORIES[cle].list(status)
      .then((lignes) => setRowsByCategory((prev) => ({ ...prev, [cle]: lignes })))
      .catch((err) => {
        setRowsByCategory((prev) => ({ ...prev, [cle]: null }))
        if (!(err instanceof ApiError) || err.status !== 403) {
          setError('Impossible de charger cette catégorie.')
        }
      })
      .finally(() => setLoading(false))
  }

  // Changer de statut (Archive ↔ Corbeille) invalide le cache.
  useEffect(() => {
    setRowsByCategory({})
    load(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const choisirCategorie = (cle) => {
    setActive(cle)
    setConfirmation('')
    if (rowsByCategory[cle] === undefined) load(cle)
  }

  const runAction = async (action, id, succes) => {
    setError('')
    setConfirmation('')
    try {
      await action(id)
      setConfirmation(succes)
      load()
      getArchiveCounts(status).then(setCounts).catch(() => {})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  const demanderConfirmation = (action, id, succes, message) => {
    setConfirmDialog({
      message,
      run: () => { setConfirmDialog(null); runAction(action, id, succes) },
    })
  }

  const categorie = CATEGORIES[active]
  const rows = rowsByCategory[active]
  const inaccessible = rows === null
  // Élément identifiable individuellement (Client/Entreprise/Domiciliation) :
  // clic sur la ligne inutile, le nom est déjà un lien vers sa fiche complète.
  // Les autres catégories renvoient vers leur tableau d'origine (même onglet
  // Archivés/Corbeille, mêmes colonnes, mêmes actions).
  const onRowClick = !categorie.to && categorie.listPath
    ? (r) => navigate(categorie.listPath, { state: { initialStatus: status } })
    : undefined

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      <div className="rounded-xl bg-white shadow-card p-2 h-fit max-h-[70vh] overflow-y-auto">
        <div className="px-2 pt-1.5 pb-2 mb-1 border-b border-line">
          <h1 className="text-lg font-bold text-ink-900">{pageTitle}</h1>
        </div>
        {CLES.map((cle) => {
          const count = counts[cle]
          return (
            <button
              key={cle}
              onClick={() => choisirCategorie(cle)}
              className={`w-full flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active === cle ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-surface'
              }`}
            >
              <span className="truncate text-left">{CATEGORIES[cle].label}</span>
              <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 ${active === cle ? 'bg-white/20' : count > 0 ? 'bg-brand-50 text-brand-700' : 'bg-surface text-ink-600'}`}>
                {count ?? '…'}
              </span>
            </button>
          )
        })}
      </div>

      <div>
        {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
        {confirmation && <Alert tone="success" className="mb-3">{confirmation}</Alert>}

        {inaccessible ? (
          <div className="rounded-xl bg-white shadow-card">
            <EmptyState
              title="Accès non autorisé"
              hint={`Vous n'avez pas la permission de consulter « ${categorie.label} ».`}
            />
          </div>
        ) : (
          <DataTable
            title={categorie.label}
            columns={categorie.columns}
            rows={rows ?? []}
            loading={loading}
            onRowClick={onRowClick}
            emptyText={status === 'archive'
              ? `Aucune entrée archivée dans ${categorie.label}`
              : `Corbeille vide pour ${categorie.label}`}
            actionsHeader="ACTIONS"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                <RowBtn
                  title="Restaurer"
                  onClick={() => runAction(categorie.restore, r.id, 'Élément restauré.')}
                >
                  <RotateCcw size={14} />
                </RowBtn>
                {status === 'archive' && (
                  <RowBtn
                    title="Mettre à la corbeille"
                    className="hover:text-danger-600"
                    onClick={() => demanderConfirmation(
                      categorie.corbeille,
                      r.id,
                      'Élément déplacé dans la corbeille.',
                      `Mettre "${categorie.rowLabel(r)}" à la corbeille ?`,
                    )}
                  >
                    <Trash2 size={14} />
                  </RowBtn>
                )}
                {showDeleteForever && (
                  <RowBtn
                    title="Supprimer définitivement"
                    className="hover:text-danger-600"
                    onClick={() => demanderConfirmation(
                      categorie.destroy,
                      r.id,
                      'Élément supprimé définitivement.',
                      `Supprimer définitivement "${categorie.rowLabel(r)}" ? Cette action est irréversible.`,
                    )}
                  >
                    <Trash2 size={14} />
                  </RowBtn>
                )}
              </div>
            )}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Confirmation"
        message={confirmDialog?.message}
        confirmLabel="Supprimer"
        tone="danger"
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => confirmDialog?.run()}
      />
    </div>
  )
}

export default function Archive() {
  return <ArchivedPanel pageTitle="Archive" status="archive" showDeleteForever={false} />
}

export function Corbeille() {
  return <ArchivedPanel pageTitle="Corbeille" status="corbeille" showDeleteForever />
}
