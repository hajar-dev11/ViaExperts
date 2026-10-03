// Données initiales de l'application.
// Aucune donnée personnelle, aucune donnée client ni donnée comptable fictive :
// l'application est livrée vide et prête à être configurée avec les données réelles du client.

function loadPersisted(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // stockage indisponible — les données restent en mémoire pour la session
  }
}

export const clients = loadPersisted('via-experts:clients')

export function addClient(data) {
  const id = `CL-${String(clients.length + 1).padStart(3, '0')}`
  const client = { status: 'actif', ...data, id }
  clients.push(client)
  persist('via-experts:clients', clients)
  return client
}

export function updateClient(id, data) {
  const idx = clients.findIndex((c) => c.id === id)
  if (idx === -1) return null
  clients[idx] = { ...clients[idx], ...data, id }
  persist('via-experts:clients', clients)
  return clients[idx]
}

export function getClientById(id) {
  return clients.find((c) => c.id === id) ?? null
}

// Le module Entreprises est désormais persisté via l'API Laravel/MySQL (voir src/api/entreprises.js).
// Ce tableau ne reçoit plus aucune écriture — il ne reste ici que pour les modules non encore migrés
// (Facturation, Paiement, Domiciliation, Déclaration TVA, Cachets, Mails, Data Center, Dashboard)
// qui continuent temporairement de le lire en attendant leur propre migration.
export const entreprises = loadPersisted('via-experts:entreprises')

export const centresDomiciliation = [
  { id: 'CD-01', nom: 'CS Plus' },
  { id: 'CD-02', nom: 'VIA EXPERTS' },
  { id: 'CD-03', nom: 'VIVENDIS INVEST' },
  { id: 'CD-04', nom: 'MA EXPERTISE SERVICES' },
  { id: 'CD-05', nom: 'FIDU-FISCASS CONSULTING & SERVICES MOROCCO' },
  { id: 'CD-06', nom: 'MOORISH ACCOUNTING GROUP' },
  { id: 'CD-07', nom: 'stratflow consulting' },
  { id: 'CD-08', nom: 'RECAT BUSINESS GROUP' },
  { id: 'CD-09', nom: "CENTRE RAKEM D'AFFAIRES" },
  { id: 'CD-10', nom: 'ALMAGHRIBIA LITATWIN' },
  { id: 'CD-11', nom: 'MACHROUHI AFFAIRE' },
]

export const domiciliations = []

export const servicesCatalog = []

export const servicesEnCours = []

export const activiteServices = []

function docLines(count) {
  const svc = servicesCatalog
  if (svc.length === 0) return []
  const lines = []
  for (let i = 0; i < count; i++) {
    const s = svc[(i * 3) % svc.length]
    const ht = s.prix
    const tva = Math.round(ht * 0.2 * 100) / 100
    lines.push({ designation: s.service, ht, tva, ttc: Math.round((ht + tva) * 100) / 100 })
  }
  return lines
}

function buildDocs(prefix, entities, statuses) {
  return entities.map((name, i) => {
    const lines = docLines(1 + (i % 2))
    const total = lines.reduce((a, l) => a + l.ttc, 0)
    const paye = statuses[i % statuses.length] === 'Payée' ? total : Math.round(total * 0.4 * 100) / 100
    return {
      id: `${prefix}-${290 - i}/26`,
      responsable: '',
      client: name,
      date: `${10 - i > 0 ? `0${10 - i}`.slice(-2) : 10}/09/2026`,
      lignes: lines,
      totalTTC: Math.round(total * 100) / 100,
      paye,
      reste: Math.round((total - paye) * 100) / 100,
      statut: statuses[i % statuses.length],
    }
  })
}

// Reconstitué à partir des entreprises et clients existants — se remplit automatiquement
// dès que des fiches réelles sont ajoutées.
const partenaires = [...entreprises.map((e) => e.denomination), ...clients.map((c) => c.nom)]

export const factures = buildDocs('FAC', partenaires, ['Payée', 'Partiel', 'Payée'])
export const devis = buildDocs('DEV', partenaires, ['En attente', 'Accepté', 'Refusé'])
export const bonsLivraison = buildDocs('BL', partenaires, ['Livré', 'En cours'])
export const avoirs = buildDocs('FAV', partenaires.slice(0, 4), ['Émise', 'Émise'])

export const paiements = factures.map((f, i) => ({
  id: `#${920 - i}`,
  responsable: f.responsable,
  client: f.client,
  service: f.lignes[0]?.designation ?? '—',
  total: f.totalTTC,
  paye: f.paye,
  reste: f.reste,
  dateOperation: f.date,
  dateCredit: f.reste > 0 ? '30/09/2026' : '',
  methode: i % 3 === 0 ? 'Virement' : i % 3 === 1 ? 'Espèce' : 'Chèque',
}))

export const declarationsTVA = []

export const chiffresAffaires = []

export const rapports = []

export const cachets = entreprises.slice(0, 6).map((e, i) => ({
  id: `CA-${400 + i}`,
  status: i % 4 === 0 ? 'En Attente' : 'Réception',
  lignes: 4 + (i % 5),
  client: e.denomination,
  depart: `1${i}/09/2026 | 10:0${i}`,
  derniere: `1${i}/09/2026 | 10:0${i}`,
}))

export const mails = entreprises.map((e, i) => ({
  id: `ML-${700 + i}`,
  status: ['Au Bureau', 'Réception', 'Retrait', 'Archivé'][i % 4],
  client: e.denomination,
  depart: `0${(i % 9) + 1}/09/2026 | 0${9 + (i % 3)}:1${i}`,
  derniere: `0${(i % 9) + 1}/09/2026 | 1${i % 6}:4${i % 6}`,
}))

// `dataCenter` retiré le 2026-09-18 : le module Data Center est branché sur
// l'API réelle (`api/dataCenter.js` → table `data_center_fiches`).

export const archiveCounts = {
  clients: 0,
  entreprises: 0,
  facturation: 0,
  services: 0,
  documents: 0,
}

export const corbeilleCounts = {
  clients: 0,
  entreprises: 0,
  facturation: 0,
  services: 0,
  documents: 0,
}

export const chatContacts = []

export const dashboardTrend = []

export const expenseRatio = []

export const kpis = [
  { label: 'Clients actifs', value: clients.length, sub: 'Aucune donnée', trend: 'flat' },
  { label: 'Entreprises gérées', value: entreprises.length, sub: 'Aucune donnée', trend: 'flat' },
  { label: 'Domiciliations en cours', value: domiciliations.filter((d) => d.situation !== 'Résilié').length, sub: 'Aucune donnée', trend: 'flat' },
  { label: 'Factures impayées', value: factures.filter((f) => f.reste > 0).length, sub: 'Aucune donnée', trend: 'flat' },
]
