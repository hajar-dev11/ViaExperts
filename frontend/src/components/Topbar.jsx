import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Menu, Search, Files, StickyNote, Calculator, Percent, Upload,
  Plus, UserRound, Users, Building2, ChevronRight,
  MoreHorizontal, ChevronLeft, LogOut,
} from 'lucide-react'
import Popover from './Popover.jsx'
import EmptyState from './EmptyState.jsx'
import CalculatorPanel from './CalculatorPanel.jsx'
import TvaCalculatorPanel from './TvaCalculatorPanel.jsx'
import { useFiles } from '../context/FilesContext.jsx'
import { useNotes } from '../context/NotesContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatFileSize, formatDateTime, formatDate } from '../utils/format.js'
import { listClients } from '../api/clients.js'
import { listEntreprises } from '../api/entreprises.js'
import { listDomiciliations } from '../modules/domiciliation/index.js'
import { API_URL } from '../api/http.js'
import { calculerAlertesEcheance, JOURS_ALERTE } from '../utils/alertesDomiciliation.js'
import { EVT_DOMICILIATIONS_MODIFIEES } from '../shared/constants/evenements.js'

// Clé de persistance du bandeau d'alerte : évite qu'il disparaisse le temps
// qu'un F5 relance la requête (voire qu'un échec réseau ponctuel l'efface).
const CLE_ALERTES = 've-alertes-domiciliation'

function alertesDepuisCache() {
  try {
    const brut = sessionStorage.getItem(CLE_ALERTES)
    return brut ? JSON.parse(brut) : []
  } catch {
    return []
  }
}

/**
 * Topbar — reproduction de la barre du système de référence :
 * barre blanche flottante à coins arrondis, recherche sans bordure à gauche,
 * BANDEAU ROSE du dossier actif au centre, outils puis avatar à droite.
 *
 * ⚠️ Aucune fonctionnalité n'est modifiée : mêmes appels API (Clients et
 * Entreprises actifs, une seule fois au montage), même recherche globale, mêmes
 * panneaux Fichiers / Notes / Calculatrice / TVA / Notifications / Profil.
 */

function PanelHeader({ title }) {
  return <div className="px-4 py-3 text-sm font-semibold text-ink-900">{title}</div>
}

function PanelFooter({ to, label, onClick }) {
  const cls =
    'flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-brand-500 transition-colors hover:bg-surface'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {label} <ChevronRight size={13} />
      </button>
    )
  }
  return (
    <Link to={to} className={cls}>
      {label} <ChevronRight size={13} />
    </Link>
  )
}

export default function Topbar({ onMenuClick }) {
  const navigate = useNavigate()
  const { files, addFiles } = useFiles()
  const { notes, addNote } = useNotes()
  const { user, logout } = useAuth()
  const fileInputRef = useRef(null)

  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef(null)
  const [clients, setClients] = useState([])
  const [entreprises, setEntreprises] = useState([])

  useEffect(() => {
    listClients('actif').then(setClients).catch(() => setClients([]))
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
  }, [])

  const [mobileTool, setMobileTool] = useState('menu')

  // --- Bandeau rose : ALERTE d'échéance de domiciliation -------------------
  // Entreprises dont la domiciliation se termine dans 1 mois ou moins.
  // Ce bandeau n'est pas un sélecteur de dossier : c'est un rappel d'échéance.
  const [alertes, setAlertes] = useState(alertesDepuisCache)
  const [indexAlerte, setIndexAlerte] = useState(0)

  useEffect(() => {
    let actif = true

    const memoriser = (liste) => {
      setAlertes(liste)
      try {
        sessionStorage.setItem(CLE_ALERTES, JSON.stringify(liste))
      } catch {
        // Stockage indisponible (navigation privée…) : le bandeau reste
        // fonctionnel, seule la persistance entre rechargements est perdue.
      }
    }

    const charger = () => {
      // Même requête que le tableau de bord : `api/http.js` déduplique les deux
      // appels, aucun trafic réseau supplémentaire n'est généré.
      listDomiciliations({ status: 'actif' })
        .then((res) => {
          if (!actif) return
          // Les règles (contrat le plus récent par entreprise, résilié ignoré, période renouvelée ignorée)
          // sont dans `calculerAlertesEcheance`.
          memoriser(calculerAlertesEcheance(Array.isArray(res) ? res : (res?.data ?? [])))
        })
        // Un échec réseau ponctuel (ex. juste après un F5) ne doit pas effacer
        // la dernière alerte connue — elle reste affichée jusqu'au prochain
        // chargement réussi.
        .catch(() => {})
    }

    // Une échéance vient d'être déplacée (« Renouveler ») : on retire tout de suite l'ancienne alerte de l'entreprise
    // — y compris de la copie conservée pour les rechargements —, puis on recalcule à partir des données à jour. Si le
    // recalcul échoue, l'ancienne alerte ne reste donc pas affichée.
    const surModification = (e) => {
      const entrepriseId = e.detail?.entrepriseId ?? null
      if (entrepriseId !== null) {
        setAlertes((courantes) => {
          const restantes = courantes.filter((a) => a.entrepriseId !== entrepriseId)
          try {
            sessionStorage.setItem(CLE_ALERTES, JSON.stringify(restantes))
          } catch {
            // voir ci-dessus
          }
          return restantes
        })
      }
      charger()
    }

    charger()
    window.addEventListener(EVT_DOMICILIATIONS_MODIFIEES, surModification)

    return () => {
      actif = false
      window.removeEventListener(EVT_DOMICILIATIONS_MODIFIEES, surModification)
    }
  }, [])

  // Plusieurs entreprises concernées : on les fait défiler l'une après l'autre.
  useEffect(() => {
    if (alertes.length < 2) return undefined
    const t = setInterval(() => setIndexAlerte((i) => (i + 1) % alertes.length), 4000)
    return () => clearInterval(t)
  }, [alertes.length])

  const alerteCourante = alertes[indexAlerte % Math.max(alertes.length, 1)]

  // Recherche globale — uniquement sur les modules réellement connectés à l'API
  // (Clients, Entreprises). Chaque résultat pointe vers la FICHE concernée.
  const searchSources = useMemo(() => [
    {
      label: 'Clients',
      icon: Users,
      data: clients,
      getLabel: (r) => r.nom,
      getHint: (r) => [r.email, r.cin, r.tel].filter(Boolean).join(' · '),
      getHaystack: (r) => [r.nom, r.email, r.cin, r.tel, r.tel2, r.adresse],
      getTo: (r) => `/clients/${r.id}`,
    },
    {
      label: 'Entreprises',
      icon: Building2,
      data: entreprises,
      getLabel: (r) => r.denomination,
      getHint: (r) => [r.ice && `ICE ${r.ice}`, r.if && `IF ${r.if}`, r.rc && `RC ${r.rc}`].filter(Boolean).join(' · '),
      getHaystack: (r) => [r.denomination, r.ice, r.if, r.rc, r.local, r.observations],
      getTo: (r) => `/entreprises/${r.id}`,
    },
  ], [clients, entreprises])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return searchSources.flatMap((src) =>
      src.data
        .filter((r) => src.getHaystack(r).some((v) => v && String(v).toLowerCase().includes(q)))
        .slice(0, 5)
        .map((r) => ({
          key: `${src.label}-${r.id}`,
          category: src.label,
          icon: src.icon,
          label: src.getLabel(r),
          hint: src.getHint(r),
          to: src.getTo(r),
        }))
    )
  }, [query, searchSources])

  const createNoteFromTopbar = () => {
    addNote({ title: '', content: '' })
    navigate('/notes')
  }

  const panel = 'w-80 overflow-hidden rounded-xl bg-white shadow-menu'

  return (
    <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6">
      {/* ⚠️ Pas de `overflow-hidden` ici : cette barre encadre tous les
          popovers (Fichiers, Notes, Calculatrice, TVA, Notifications, Profil,
          résultats de recherche). Avec `overflow-hidden`, leur panneau
          (positionné juste sous l'icône, donc hors des 64px de la barre) était
          bien ouvert dans le DOM mais totalement rogné — invisible, comme si
          les icônes ne faisaient rien. Les coins arrondis restent corrects
          sans lui : aucun enfant ne porte de fond plein qui déborderait. */}
      <div className="relative flex h-16 items-center rounded-xl bg-white shadow-card">
        <button
          className="pl-4 text-ink-700 lg:hidden"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
        >
          <Menu size={22} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {/* Recherche — sans bordure, comme sur la capture */}
        <div className="relative flex h-full min-w-0 flex-1 items-center gap-3 px-5" ref={searchRef}>
          <Search size={20} className="shrink-0 text-ink-900" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
            placeholder="Recherche"
            aria-label="Recherche globale"
            className="h-full w-full min-w-0 border-0 bg-transparent text-[15px] text-ink-900 placeholder:text-ink-600 focus:outline-none"
          />
          {searchFocused && query.trim() && (
            <div className="absolute top-full left-3 z-50 mt-1 w-full min-w-[320px] overflow-hidden rounded-xl bg-white shadow-menu">
              {results.length === 0 ? (
                <EmptyState title="Aucun résultat" hint={`Rien ne correspond à « ${query.trim()} »`} />
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {results.map((r) => {
                    const Icon = r.icon
                    return (
                      <li key={r.key}>
                        <Link
                          to={r.to}
                          onClick={() => { setQuery(''); setSearchFocused(false) }}
                          className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface"
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">
                            <Icon size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink-900">{r.label}</span>
                            <span className="block truncate text-[11px] text-ink-600">
                              {r.category}{r.hint ? ` — ${r.hint}` : ''}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Bandeau rose — ALERTE : domiciliations arrivant à échéance sous 1 mois.
            Un clic ouvre la liste par statut, où figurent les domiciliations en alerte. */}
        {alerteCourante && (
          <button
            type="button"
            onClick={() => navigate('/domiciliation/liste')}
            title={
              `${alertes.length} domiciliation(s) à renouveler (échéance passée ou sous ${JOURS_ALERTE} jours) :\n`
              + alertes.map((a) => `• ${a.nom} — ${a.expiree ? 'expirée le' : 'expire le'} ${formatDate(a.dateFin)}`).join('\n')
            }
            className="hidden min-w-0 items-center gap-2 bg-[#ffbdbd] px-6 text-left transition-colors hover:bg-[#ffaeae] md:absolute md:inset-y-0 md:left-1/2 md:flex md:w-[26%] md:-translate-x-1/2 lg:w-[30%]"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-warning-700">
              {alerteCourante.nom}
            </span>
            {alertes.length > 1 && (
              <span className="tabular shrink-0 text-xs font-semibold text-warning-700/70">
                {indexAlerte + 1}/{alertes.length}
              </span>
            )}
          </button>
        )}

        {/* Outils + profil */}
        <div className="flex shrink-0 items-center gap-1 px-4">
          <Popover
            align="right"
            panelClassName="min-w-56 overflow-hidden rounded-xl bg-white shadow-menu"
            trigger={(toggle) => (
              <button
                type="button"
                onClick={() => { setMobileTool('menu'); toggle() }}
                className="grid h-10 w-10 place-items-center rounded-lg text-ink-700 transition-colors hover:bg-surface hover:text-ink-900 sm:hidden"
                title="Outils"
                aria-label="Outils"
              >
                <MoreHorizontal size={20} />
              </button>
            )}
          >
            {() => (
              mobileTool === 'menu' ? (
                <div className="w-56 py-1">
                  <Link to="/fichiers" className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-800 hover:bg-surface">
                    <Files size={16} className="text-ink-600" /> Fichiers
                  </Link>
                  <Link to="/notes" className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-800 hover:bg-surface">
                    <StickyNote size={16} className="text-warning-500" /> Notes
                  </Link>
                  <button type="button" onClick={() => setMobileTool('calc')} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink-800 hover:bg-surface">
                    <Calculator size={16} className="text-ink-600" /> Calcul
                  </button>
                  <button type="button" onClick={() => setMobileTool('tva')} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink-800 hover:bg-surface">
                    <Percent size={16} className="text-ink-600" /> Calcul TVA
                  </button>
                </div>
              ) : (
                <div>
                  <button type="button" onClick={() => setMobileTool('menu')} className="flex w-full items-center gap-1.5 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-surface">
                    <ChevronLeft size={13} /> Retour
                  </button>
                  {mobileTool === 'calc' && <CalculatorPanel />}
                  {mobileTool === 'tva' && <TvaCalculatorPanel />}
                </div>
              )
            )}
          </Popover>

          <Popover
            panelClassName={panel}
            trigger={(toggle) => (
              <IconBtn title="Fichiers" onClick={toggle}><Files size={20} /></IconBtn>
            )}
          >
            {(close) => (
              <div>
                <PanelHeader title="Fichiers récents" />
                {files.length === 0 ? (
                  <EmptyState title="Aucun fichier" />
                ) : (
                  <ul className="max-h-64 overflow-y-auto">
                    {files.slice(0, 4).map((f) => (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink-900">{f.name}</span>
                          <span className="block text-[11px] text-ink-600">{formatFileSize(f.size)} · {formatDateTime(f.addedAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => { close(); fileInputRef.current?.click() }}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-surface"
                >
                  <Upload size={13} /> Ajouter un fichier
                </button>
                <PanelFooter to="/fichiers" label="Voir tous les fichiers" />
              </div>
            )}
          </Popover>

          <Popover
            panelClassName={panel}
            trigger={(toggle) => (
              <IconBtn title="Notes" onClick={toggle} className="text-warning-500 hover:text-warning-600">
                <StickyNote size={20} />
              </IconBtn>
            )}
          >
            {() => (
              <div>
                <PanelHeader title="Notes récentes" />
                {notes.length === 0 ? (
                  <EmptyState title="Aucune note" />
                ) : (
                  <ul className="max-h-64 overflow-y-auto">
                    {notes.slice(0, 4).map((n) => (
                      <li key={n.id}>
                        <Link to="/notes" className="block px-4 py-2.5 transition-colors hover:bg-surface">
                          <span className="block truncate text-sm text-ink-900">{n.title || 'Sans titre'}</span>
                          <span className="block truncate text-[11px] text-ink-600">{n.content || 'Note vide'}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={createNoteFromTopbar}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-surface"
                >
                  <Plus size={13} /> Nouvelle note
                </button>
                <PanelFooter to="/notes" label="Voir toutes les notes" />
              </div>
            )}
          </Popover>

          <Popover
            panelClassName="overflow-hidden rounded-xl bg-white shadow-menu"
            trigger={(toggle) => (
              <IconBtn title="Calcul" onClick={toggle}><Calculator size={20} /></IconBtn>
            )}
          >
            {() => <CalculatorPanel />}
          </Popover>

          <Popover
            panelClassName="overflow-hidden rounded-xl bg-white shadow-menu"
            trigger={(toggle) => (
              <IconBtn title="Calcul TVA" onClick={toggle}><Percent size={20} /></IconBtn>
            )}
          >
            {() => <TvaCalculatorPanel />}
          </Popover>

          <Popover
            align="right"
            panelClassName="w-72 overflow-hidden rounded-xl bg-white shadow-menu"
            trigger={(toggle) => (
              <button onClick={toggle} className="relative ml-1.5 focus-ring rounded-full" title="Profil" aria-label="Profil">
                <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-surface text-ink-600">
                  {user?.photo_path
                    ? <img src={`${API_URL}/storage/${user.photo_path}`} alt="" className="h-full w-full object-cover" />
                    : <UserRound size={20} />}
                </span>
                <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-success-500 ring-2 ring-white" />
              </button>
            )}
          >
            {(close) => (
              <div>
                <div className="flex items-center gap-3 border-b border-line px-4 py-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-ink-600">
                    {user?.photo_path
                      ? <img src={`${API_URL}/storage/${user.photo_path}`} alt="" className="h-full w-full object-cover" />
                      : <UserRound size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink-900">{user?.name || 'Utilisateur'}</div>
                    <div className="truncate text-xs text-ink-600">{user?.email || ''}</div>
                  </div>
                </div>
                <PanelFooter to="/parametres" label="Voir le profil" />
                <button
                  type="button"
                  onClick={() => { close(); logout().then(() => navigate('/login')) }}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-danger-600 transition-colors hover:bg-danger-50"
                >
                  <LogOut size={13} /> Se déconnecter
                </button>
              </div>
            )}
          </Popover>
        </div>
      </div>
    </header>
  )
}

function IconBtn({ children, title, onClick, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`hidden h-10 w-10 place-items-center rounded-lg text-ink-700 transition-colors hover:bg-surface hover:text-ink-900 focus-ring sm:grid ${className}`}
    >
      {children}
    </button>
  )
}
