import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Alert from '../../../components/ui/Alert.jsx'
import { ApiError } from '../../../api/http.js'
import { listDomiciliations } from '../api/domiciliations.js'
import { classerNouveauRenouveler } from '../utils/domiciliation.js'

const JOURS_COURTS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const JOURS_LONGS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MOIS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']

/**
 * Catégories du calendrier, dans l'ordre de la maquette.
 *
 * Nouveau / Renouveler distinguent une première période d'un renouvellement.
 * Alerte / Expiré / Déclary / Résilier reprennent le statut d'affichage calculé
 * par le serveur — aucune règle n'est réinventée ici.
 */
const CATEGORIES = [
  { cle: 'nouveau', label: 'Nouveau', case: 'accent-success-500', chip: 'bg-success-50 text-success-700' },
  { cle: 'renouveler', label: 'Renouveler', case: 'accent-brand-500', chip: 'bg-brand-50 text-brand-600' },
  { cle: 'alerte', label: 'Alerte', case: 'accent-warning-500', chip: 'bg-warning-50 text-warning-700' },
  { cle: 'expire', label: 'Expiré', case: 'accent-danger-500', chip: 'bg-danger-50 text-danger-700' },
  { cle: 'declare', label: 'Déclary', case: 'accent-ink-950', chip: 'bg-surface text-ink-800' },
  { cle: 'resilie', label: 'Résilier', case: 'accent-info-500', chip: 'bg-info-50 text-info-700' },
]

const cleJour = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** `YYYY-MM-DD` → Date locale, sans décalage de fuseau. */
function parseIso(valeur) {
  if (!valeur) return null
  const [a, m, j] = String(valeur).slice(0, 10).split('-').map(Number)
  if (!a || !m || !j) return null
  return new Date(a, m - 1, j)
}

const aujourdHui = new Date()

export default function DomiciliationCalendar() {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Toutes les catégories sont cochées au départ, comme la maquette.
  const [actives, setActives] = useState(() => new Set(CATEGORIES.map((c) => c.cle)))

  const load = useCallback(() => {
    setLoading(true)
    listDomiciliations({ status: 'actif' })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter les domiciliations."
        : 'Impossible de charger les domiciliations.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const classement = useMemo(() => classerNouveauRenouveler(rows), [rows])

  /**
   * Une domiciliation est placée sur sa DATE DE DÉPART.
   * Sa catégorie : d'abord son statut d'affichage quand il est remarquable
   * (alerte / expiré / déclaré / résilié), sinon nouveau ou renouvellement.
   */
  const evenements = useMemo(() => {
    const parJour = new Map()
    rows.forEach((d) => {
      const depart = parseIso(d.dateDepart)
      if (!depart) return

      const statut = d.statutAffichage
      const categorie = ['alerte', 'expire', 'declare', 'resilie'].includes(statut)
        ? statut
        : (classement.get(d.id) ?? 'nouveau')

      const cle = cleJour(depart)
      if (!parJour.has(cle)) parJour.set(cle, [])
      parJour.get(cle).push({ domiciliation: d, categorie })
    })
    return parJour
  }, [rows, classement])

  const annee = cursor.getFullYear()
  const mois = cursor.getMonth()

  /** Grille de 6 semaines complètes, débordements des mois voisins inclus. */
  const semaines = useMemo(() => {
    const premier = new Date(annee, mois, 1)
    const debut = new Date(annee, mois, 1 - premier.getDay())
    const grille = []
    for (let s = 0; s < 6; s++) {
      const semaine = []
      for (let j = 0; j < 7; j++) {
        semaine.push(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + s * 7 + j))
      }
      grille.push(semaine)
    }
    return grille
  }, [annee, mois])

  const changerMois = (delta) => setCursor(new Date(annee, mois + delta, 1))

  const basculer = (cle) => setActives((set) => {
    const suivant = new Set(set)
    if (suivant.has(cle)) suivant.delete(cle)
    else suivant.add(cle)
    return suivant
  })

  const evenementsDuJour = (date) => (evenements.get(cleJour(date)) ?? [])
    .filter((e) => actives.has(e.categorie))

  const chip = (categorie) => CATEGORIES.find((c) => c.cle === categorie)?.chip ?? 'bg-surface text-ink-800'

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3" onClose={() => setError('')}>{error}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {/* ---- Colonne gauche : mini-calendrier + filtres ----------------- */}
        <div className="rounded-xl bg-white p-6 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] text-ink-900">
              {MOIS[mois]} <span className="text-ink-700">{annee}</span>
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => changerMois(-1)}
                aria-label="Mois précédent"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-surface focus-ring"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => changerMois(1)}
                aria-label="Mois suivant"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-surface focus-ring"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 text-center text-xs text-ink-600">
            {JOURS_COURTS.map((j) => <div key={j} className="py-1.5">{j}</div>)}
          </div>
          <div className="grid grid-cols-7 text-center text-sm">
            {semaines.flat().map((date) => {
              const dansLeMois = date.getMonth() === mois
              const estAujourdHui = cleJour(date) === cleJour(aujourdHui)
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => setCursor(new Date(date.getFullYear(), date.getMonth(), 1))}
                  className={`mx-auto my-0.5 grid h-8 w-8 place-items-center rounded-full transition-colors focus-ring ${
                    estAujourdHui ? 'bg-brand-100 font-semibold text-brand-600' : 'hover:bg-surface'
                  } ${dansLeMois ? 'text-ink-900' : 'text-ink-500'}`}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <h3 className="mt-6 text-[15px] text-ink-900">Calendrier de domiciliation</h3>
          <div className="mt-3 space-y-3">
            {CATEGORIES.map((c) => (
              <label key={c.cle} className="flex cursor-pointer items-center gap-3 text-sm text-ink-900">
                <input
                  type="checkbox"
                  checked={actives.has(c.cle)}
                  onChange={() => basculer(c.cle)}
                  className={`h-4 w-4 shrink-0 rounded ${c.case}`}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {/* ---- Colonne droite : le mois ---------------------------------- */}
        <div className="overflow-hidden rounded-xl bg-white shadow-card">
          <div className="flex items-center gap-3 px-6 py-5">
            <button
              type="button"
              onClick={() => changerMois(-1)}
              aria-label="Mois précédent"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-surface focus-ring"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => changerMois(1)}
              aria-label="Mois suivant"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-surface focus-ring"
            >
              <ChevronRight size={18} />
            </button>
            <h2 className="text-xl text-ink-900">{MOIS_FR[mois]} {annee}</h2>
          </div>

          <div className="grid grid-cols-7 border-t border-line text-center text-sm text-ink-700">
            {JOURS_LONGS.map((j) => <div key={j} className="py-3">{j}</div>)}
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-ink-600">Chargement…</div>
          ) : (
            <div className="grid grid-cols-7 border-t border-line">
              {semaines.flat().map((date) => {
                const dansLeMois = date.getMonth() === mois
                const jourEvenements = evenementsDuJour(date)
                return (
                  <div
                    key={date.toISOString()}
                    className={`min-h-[7.5rem] border-r border-b border-line p-1.5 last:border-r-0 ${
                      dansLeMois ? '' : 'bg-surface/50'
                    }`}
                  >
                    <div className={`mb-1 px-1 text-sm ${dansLeMois ? 'text-ink-800' : 'text-ink-500'}`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {jourEvenements.map(({ domiciliation, categorie }) => (
                        <button
                          key={domiciliation.id}
                          type="button"
                          onClick={() => navigate(`/entreprises/${domiciliation.entrepriseId}`)}
                          title={domiciliation.denomination}
                          className={`block w-full truncate rounded px-2 py-1 text-left text-xs font-medium transition-opacity hover:opacity-80 focus-ring ${chip(categorie)}`}
                        >
                          {domiciliation.denomination}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
