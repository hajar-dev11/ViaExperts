import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, CalendarDays, Clock, Download, TrendingUp, PieChart as PieChartIcon, ArrowLeft } from 'lucide-react'
import ServiceEnCoursRowActions, {
  BadgeStatutService, ModalChangerStatut,
} from '../components/ServiceEnCoursActions.jsx'
import { serviceStatusApi } from '../api/statuses.js'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import DataTable from '../components/DataTable.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Popover from '../components/Popover.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { API_URL } from '../api/http.js'
import { formatDateHeure, formatDate, formatHeure } from '../utils/format.js'
import { listDomiciliations } from '../api/domiciliations.js'
import { listServicesEnCours, listActivite, getServiceEnCours } from '../api/servicesEnCours.js'

/**
 * Accueil — reproduction de la page d'accueil du système de référence
 * (captures « Dashboard », images 1 et 2) :
 *
 *   ┌──────────────────────────────┬──────────────────┐
 *   │ Analyse de Domiciliation     │ Expense Ratio    │
 *   ├──────────────────────────────┼──────────────────┤
 *   │ Services en cours (tableau)  │ Activité Services│
 *   └──────────────────────────────┴──────────────────┘
 *
 * Les DEUX graphiques partagent les mêmes 4 séries et la même période :
 *   Nouveau    vert   #28C76F — première domiciliation d'une entreprise
 *   Renouveler violet #7367F0 — domiciliation suivante de la même entreprise
 *   Déclary    noir   #191919 — date de déclaration
 *   Résilier   cyan   #00CFE8 — date de résiliation
 *
 * Toutes les valeurs sont calculées sur les DATES RÉELLES des domiciliations.
 * Aucune donnée n'est inventée : sans domiciliation en base, les cartes
 * affichent un état vide.
 */

const SERIES = [
  { key: 'nouveau', label: 'Nouveau', color: '#28c76f' },
  { key: 'renouveler', label: 'Renouveler', color: '#7367f0' },
  { key: 'declary', label: 'Déclary', color: '#191919' },
  { key: 'resilier', label: 'Résilier', color: '#00cfe8' },
]

const MOIS = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

/**
 * Périodes d'analyse proposées par la flèche des deux cartes.
 * `pas` détermine le découpage de l'axe : un point par jour sur les courtes
 * périodes, un point par mois au-delà.
 */
const PERIODES = [
  { cle: '7j', label: '7 derniers jours', court: '7 Jours', pas: 'jour', n: 7 },
  { cle: '15j', label: '15 derniers jours', court: '15 Jours', pas: 'jour', n: 15 },
  { cle: '30j', label: '30 derniers jours', court: '30 Jours', pas: 'jour', n: 30 },
  { cle: '3m', label: '3 derniers mois', court: '3 Mois', pas: 'mois', n: 3 },
  { cle: '6m', label: '6 derniers mois', court: '6 Mois', pas: 'mois', n: 6 },
  { cle: '12m', label: '12 derniers mois', court: '12 Mois', pas: 'mois', n: 12 },
]

/**
 * Construit les séries mensuelles à partir des domiciliations réelles.
 *
 * « Nouveau » et « Renouveler » se déduisent de l'historique : pour une même
 * entreprise, la domiciliation la plus ancienne est une mise en place, les
 * suivantes sont des renouvellements. Rien n'est inventé et aucune colonne
 * supplémentaire n'est nécessaire en base.
 */
function construireSeries(domiciliations, periode) {
  const aujourdhui = new Date()
  const cases = []
  const index = new Map()
  const parJour = periode.pas === 'jour'

  for (let i = periode.n - 1; i >= 0; i -= 1) {
    let cle
    let libelle
    if (parJour) {
      const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() - i)
      cle = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      libelle = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    } else {
      const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - i, 1)
      cle = `${d.getFullYear()}-${d.getMonth()}`
      libelle = MOIS[d.getMonth()]
    }
    const point = { mois: libelle, nouveau: 0, renouveler: 0, declary: 0, resilier: 0 }
    index.set(cle, point)
    cases.push(point)
  }

  const compter = (valeur, champ) => {
    if (!valeur) return
    const d = new Date(valeur)
    if (Number.isNaN(d.getTime())) return
    const cle = parJour
      ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      : `${d.getFullYear()}-${d.getMonth()}`
    const point = index.get(cle)
    if (point) point[champ] += 1
  }

  // Rang de chaque domiciliation dans l'historique de son entreprise.
  const parEntreprise = new Map()
  domiciliations.forEach((dom) => {
    const cle = dom.entrepriseId ?? dom.denomination ?? dom.id
    if (!parEntreprise.has(cle)) parEntreprise.set(cle, [])
    parEntreprise.get(cle).push(dom)
  })
  const rangs = new Map()
  parEntreprise.forEach((liste) => {
    liste
      .slice()
      .sort((a, b) => String(a.dateDepart ?? '').localeCompare(String(b.dateDepart ?? '')))
      .forEach((dom, i) => rangs.set(dom.id, i))
  })

  domiciliations.forEach((dom) => {
    compter(dom.dateDepart, rangs.get(dom.id) > 0 ? 'renouveler' : 'nouveau')
    compter(dom.dateDeclaration, 'declary')
    compter(dom.dateResiliation, 'resilier')
  })

  return cases
}

/**
 * En-tête des cartes graphiques : titre à gauche, icônes calendrier + chevron
 * à droite (choix de la période au clic, repli/dépli de la carte via le
 * menu) — reproduit exactement la référence (capture dashboard.php).
 */
function ChartHeader({ title, periode, onPeriode, ouvert, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
      <h2 className="text-xl text-ink-900">{title}</h2>
      <div className="flex items-center gap-1">
        {/* Un clic simple ouvre le choix de période, un double-clic replie la carte. */}
        <Popover
          align="right"
          panelClassName="w-52 overflow-hidden rounded-xl bg-white shadow-menu"
          trigger={(toggle) => (
            <button
              type="button"
              onClick={toggle}
              onDoubleClick={onToggle}
              title="Choisir la période (double-clic : replier la carte)"
              aria-label="Choisir la période"
              aria-expanded={ouvert}
              className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-ink-600 transition-colors hover:bg-surface hover:text-brand-500 focus-ring"
            >
              <CalendarDays size={17} />
              <ChevronDown size={18} className={`transition-transform ${ouvert ? '' : '-rotate-90'}`} />
            </button>
          )}
        >
          {(close) => (
            <div className="py-1">
              {PERIODES.map((p) => (
                <button
                  key={p.cle}
                  type="button"
                  onClick={() => { close(); onPeriode(p) }}
                  className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-surface ${
                    p.cle === periode.cle ? 'font-semibold text-brand-500' : 'text-ink-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <div className="my-1 border-t border-line" />
              <button
                type="button"
                onClick={() => { close(); onToggle() }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-ink-800 transition-colors hover:bg-surface"
              >
                {ouvert ? 'Replier la carte' : 'Déplier la carte'}
              </button>
            </div>
          )}
        </Popover>
      </div>
    </div>
  )
}

/**
 * Légende à pastilles rondes, sous le titre — cliquable : un clic sur une
 * catégorie la masque/réaffiche dans le graphique (`masquees` porte les clés
 * désactivées). Reste un simple `<span>` non interactif si `onToggle` n'est
 * pas fourni, pour les usages en lecture seule (donut Expense Ratio).
 */
function Legend({ items, className = '', masquees, onToggle }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${className}`}>
      {items.map((it) => {
        const masquee = masquees?.has(it.key)
        if (!onToggle) {
          return (
            <span key={it.label} className="flex items-center gap-2 text-sm text-ink-800">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
              {it.label}
            </span>
          )
        }
        return (
          <button
            key={it.label}
            type="button"
            onClick={() => onToggle(it.key)}
            title={masquee ? `Afficher « ${it.label} »` : `Masquer « ${it.label} »`}
            aria-pressed={!masquee}
            className={`flex items-center gap-2 rounded px-1 -mx-1 text-sm transition-opacity focus-ring ${
              masquee ? 'text-ink-400 opacity-50 hover:opacity-75' : 'text-ink-800 hover:opacity-80'
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: masquee ? '#c7c5d1' : it.color }} />
            <span>{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Infobulle des graphiques — reproduction de celle de la référence :
 * la période en titre, puis une ligne par série avec sa pastille de couleur,
 * son libellé et sa valeur. Le contenu suit le point réellement survolé.
 */
function InfobulleGraphique({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="min-w-[168px] rounded-lg bg-white px-3.5 py-2.5 shadow-menu">
      <div className="mb-1.5 text-sm font-semibold text-ink-900">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color ?? p.stroke }} />
          <span className="text-ink-800">{p.name} :</span>
          <span className="tabular ml-auto font-semibold text-ink-900">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Anneau « Expense Ratio » — tracé à la main (SVG pur, sans Recharts) pour
 * permettre à une part sélectionnée/survolée de grossir légèrement tout en
 * restant accolée à ses voisines (chose que le `Pie` de Recharts ne permet
 * pas : son `outerRadius` est unique pour toutes les parts).
 */
// Taille/épaisseur exactes de la référence (98/62) — le centre du viewBox
// est décalé à 108 (au lieu de 100) pour donner à `DONUT_GROW` une marge
// mathématiquement garantie (108 − (98+6) = 4) sans jamais rogner l'anneau,
// sans pour autant changer sa taille ou son épaisseur réelles à l'écran.
const DONUT_CX = 108
const DONUT_CY = 108
const DONUT_INNER_R = 62
const DONUT_BASE_R = 98
const DONUT_GROW = 6

/** Texte lisible (blanc ou encre foncée) selon la luminosité d'une couleur hex — utilisé pour le fond coloré de l'infobulle du donut. */
function texteLisibleSur(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#191919' : '#ffffff'
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

/** Secteur d'anneau plein (donut), de `startAngle` à `endAngle` (degrés, 0 = 3h, sens horaire). */
function describeArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const large = (endAngle - startAngle) % 360 > 180 ? 1 : 0
  const [x1, y1] = polarToCartesian(cx, cy, rOuter, startAngle)
  const [x2, y2] = polarToCartesian(cx, cy, rOuter, endAngle)
  const [x3, y3] = polarToCartesian(cx, cy, rInner, endAngle)
  const [x4, y4] = polarToCartesian(cx, cy, rInner, startAngle)
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
}

export default function Dashboard() {
  const [domiciliations, setDomiciliations] = useState(null)
  // Statuts de service (Paramètre > Services) et ligne dont on change le statut.
  const [statuts, setStatuts] = useState([])
  const [statutPour, setStatutPour] = useState(null)
  const [services, setServices] = useState([])
  const [activite, setActivite] = useState([])
  const [loadingServices, setLoadingServices] = useState(true)
  // Œil d'une ligne « Services en cours » : remplace temporairement le fil
  // global par celui du seul service sélectionné (même mécanisme que la page
  // Services En Cours).
  const [selectedService, setSelectedService] = useState(null)
  const [serviceActivite, setServiceActivite] = useState([])
  const [serviceActiviteLoading, setServiceActiviteLoading] = useState(false)

  // Période partagée : les deux cartes restent cohérentes entre elles.
  const [periode, setPeriode] = useState(PERIODES[PERIODES.length - 1])
  const [analyseOuverte, setAnalyseOuverte] = useState(true)
  const [ratioOuvert, setRatioOuvert] = useState(true)
  // Catégories désactivées via un clic sur la légende « Analyse de
  // Domiciliation » — retirées du graphique tant qu'elles restent ici.
  const [seriesMasquees, setSeriesMasquees] = useState(() => new Set())
  const basculerSerie = (cle) => setSeriesMasquees((s) => {
    const suivant = new Set(s)
    if (suivant.has(cle)) suivant.delete(cle); else suivant.add(cle)
    return suivant
  })
  // Part du donut sélectionnée au clic : { label, value } affiché au centre
  // à la place du total, tant qu'on ne re-clique pas sur la même part.
  const [partSelectionnee, setPartSelectionnee] = useState(null)
  // Part survolée : prioritaire sur la sélection tant que la souris reste
  // dessus, purement transitoire (jamais conservée après un `mouseleave`).
  const [partSurvolee, setPartSurvolee] = useState(null)
  // Position (dans le cadre du donut) de l'infobulle sombre qui suit la
  // souris pendant le survol — même rendu que la référence.
  const [survolPos, setSurvolPos] = useState({ x: 0, y: 0 })
  // L'infobulle qui suit le curseur n'a de sens que survolée depuis l'anneau
  // lui-même (une position de souris dans la légende, en dessous, ne l'est pas).
  const [survolDepuisAnneau, setSurvolDepuisAnneau] = useState(false)
  const donutWrapRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    // Une absence de permission ne doit pas casser le tableau de bord.
    listDomiciliations({ status: 'actif' })
      .then((r) => {
        if (cancelled) return
        setDomiciliations(Array.isArray(r) ? r : (r?.data ?? []))
      })
      .catch(() => { if (!cancelled) setDomiciliations([]) })

    listServicesEnCours('actif')
      .then((r) => { if (!cancelled) setServices(r) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingServices(false) })

    listActivite(6).then((r) => { if (!cancelled) setActivite(r) }).catch(() => {})

    // Statuts pour « Changer le Statut du Service ». L'endpoint est réservé à
    // l'administrateur : un non-admin obtient une liste vide et la fenêtre le
    // signale, au lieu d'échouer.
    serviceStatusApi.list({ page: 1, perPage: 100 })
      .then((r) => { if (!cancelled) setStatuts(r.data || []) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  /** Rechargement après changement de statut, archivage ou suppression. */
  const rechargerServices = () => {
    listServicesEnCours('actif').then(setServices).catch(() => {})
    listActivite(6).then(setActivite).catch(() => {})
  }

  // L'œil affiche le fil d'opérations du service directement dans le panneau
  // « Activité Services », au lieu d'un popup — même comportement que la page
  // Services En Cours.
  const showServiceActivite = async (r) => {
    setSelectedService(r)
    setServiceActiviteLoading(true)
    try {
      const full = await getServiceEnCours(r.id)
      setServiceActivite(full?.operations ?? [])
    } catch {
      setServiceActivite([])
    } finally {
      setServiceActiviteLoading(false)
    }
  }
  const closeServiceActivite = () => { setSelectedService(null); setServiceActivite([]) }

  const trend = useMemo(
    () => (domiciliations ? construireSeries(domiciliations, periode) : []),
    [domiciliations, periode]
  )

  // Le donut reprend les MÊMES séries, cumulées sur la période affichée.
  const repartition = useMemo(
    () => SERIES
      .map((s) => ({ ...s, value: trend.reduce((acc, p) => acc + p[s.key], 0) }))
      .filter((s) => s.value > 0),
    [trend]
  )

  const totalRepartition = repartition.reduce((acc, s) => acc + s.value, 0)
  const aucuneDonnee = domiciliations !== null && totalRepartition === 0

  // Angle de chaque part (degrés, 0 = 3h, sens horaire) — part à part, dans
  // l'ordre de `repartition`, en partant de midi (-90°) comme la référence.
  // Calcul purement fonctionnel (aucune variable réassignée pendant le rendu) :
  // l'angle de départ d'une part est la somme cumulée des valeurs qui la
  // précèdent dans `repartition`.
  const segmentsAngles = useMemo(() => repartition.map((s, i) => {
    const avant = repartition.slice(0, i).reduce((acc, x) => acc + x.value, 0)
    const sweep = totalRepartition > 0 ? (s.value / totalRepartition) * 360 : 0
    const startAngle = -90 + (totalRepartition > 0 ? (avant / totalRepartition) * 360 : 0)
    return { ...s, startAngle, endAngle: startAngle + sweep, mid: startAngle + sweep / 2 }
  }), [repartition, totalRepartition])
  // Ignore une sélection/survol devenu obsolète (période changée, part
  // retombée à 0). Le survol l'emporte sur la sélection tant qu'il dure.
  const partSelectionneeValide = partSelectionnee && repartition.some((s) => s.key === partSelectionnee.key)
    ? partSelectionnee
    : null
  const partSurvoleeValide = partSurvolee && repartition.some((s) => s.key === partSurvolee.key)
    ? partSurvolee
    : null
  const partAffichee = partSurvoleeValide ?? partSelectionneeValide

  // Panneau « Activité Services » : flux global par défaut, ou fil d'un seul
  // service quand l'œil d'une ligne a été cliqué (voir showServiceActivite).
  const activiteFeed = selectedService ? serviceActivite : activite

  // Colonnes exactement celles de la capture, y compris ACTIONS.
  // Les libellés et les dates reviennent à la ligne comme dans la référence :
  // les lignes y sont hautes, c'est voulu. Les dates sont en revanche
  // formatées « 01/09/2026 | 19:09 » et non brutes.
  const servicesColumns = [
    {
      key: 'statut',
      header: 'Status',
      value: (r) => r.statut?.nom,
      // Le badge est cliquable : il ouvre « Changer le Statut du Service ».
      render: (r) => <BadgeStatutService statut={r.statut} onClick={() => setStatutPour(r)} />,
    },
    { key: 'service', header: 'Services', wrap: true },
    {
      key: 'client',
      header: 'Client',
      wrap: true,
      render: (r) => (r.clientId
        ? <Link to={`/clients/${r.clientId}`} className="font-medium text-brand-500 hover:underline">{r.client}</Link>
        : <span className="font-medium text-brand-500">{r.client}</span>),
    },
    { key: 'dateDepart', header: 'Départ', wrap: true, render: (r) => formatDateHeure(r.dateDepart) },
    { key: 'derniereOperation', header: 'Dernière Opération', wrap: true, render: (r) => formatDateHeure(r.derniereOperation) },
  ]

  return (
    <div className="space-y-6">
      {/* Ouverte par un clic sur le badge de statut d'une ligne. */}
      <ModalChangerStatut
        open={!!statutPour}
        row={statutPour}
        statuts={statuts}
        onClose={() => setStatutPour(null)}
        onSaved={rechargerServices}
      />

      {/* ---- Ligne 1 : les deux graphiques ---------------------------------- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl bg-white shadow-card xl:col-span-2">
          <ChartHeader
            title="Analyse de Domiciliation"
            periode={periode}
            onPeriode={setPeriode}
            ouvert={analyseOuverte}
            onToggle={() => setAnalyseOuverte((o) => !o)}
          />

          {analyseOuverte && (
            aucuneDonnee ? (
              <div className="pb-6">
                <EmptyState
                  icon={TrendingUp}
                  title="Aucune donnée disponible"
                  hint="Le graphique se remplira dès que des domiciliations seront enregistrées."
                />
              </div>
            ) : (
              <>
                <Legend items={SERIES} className="px-6 pb-2" masquees={seriesMasquees} onToggle={basculerSerie} />
                <div className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={trend} margin={{ left: -12, right: 16, top: 8 }}>
                      <defs>
                        {SERIES.map((s) => (
                          <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid stroke="#ebeaee" vertical={false} />
                      <XAxis dataKey="mois" tick={{ fontSize: 12, fill: '#a5a3ae' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#a5a3ae' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<InfobulleGraphique />} cursor={{ stroke: '#dbdade', strokeWidth: 1 }} />
                      {/* Une catégorie masquée via la légende n'est plus rendue du
                          tout : elle disparaît du graphique et de ses données. */}
                      {SERIES.filter((s) => !seriesMasquees.has(s.key)).map((s) => (
                        <Area
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={s.color}
                          fill={`url(#grad-${s.key})`}
                          strokeWidth={2.5}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-card">
          <ChartHeader
            title="Expense Ratio"
            periode={periode}
            onPeriode={setPeriode}
            ouvert={ratioOuvert}
            onToggle={() => setRatioOuvert((o) => !o)}
          />

          {ratioOuvert && (
            repartition.length === 0 ? (
              <div className="grid flex-1 place-items-center pb-6">
                <EmptyState
                  icon={PieChartIcon}
                  title={domiciliations === null ? 'Chargement…' : 'Aucune donnée disponible'}
                />
              </div>
            ) : (
              <>
                <div ref={donutWrapRef} className="relative" style={{ height: 266 }}>
                  <svg
                    viewBox="0 0 216 216"
                    className="mx-auto block h-full"
                    style={{ maxWidth: 266 }}
                  >
                    {segmentsAngles.map((seg) => {
                      const survolee = partSurvoleeValide?.key === seg.key
                      const selectionnee = partSelectionneeValide?.key === seg.key
                      // Le survol (part OU légende) estompe les autres parts ;
                      // la sélection au clic ne fait que grossir la part
                      // choisie, sans jamais estomper les autres une fois la
                      // souris repartie de la légende.
                      const faded = !!partSurvoleeValide && !survolee
                      // Le survol grossit aussi la part (même effet que la
                      // sélection) : l'association entre la zone et l'infobulle
                      // devient immédiatement visible.
                      const rOuter = DONUT_BASE_R + (selectionnee || survolee ? DONUT_GROW : 0)
                      const percent = totalRepartition > 0 ? seg.value / totalRepartition : 0
                      // Étiquette à position fixe : la croissance de la part
                      // sélectionnée ne doit pas déplacer son pourcentage.
                      const labelR = (DONUT_BASE_R + DONUT_INNER_R) / 2
                      const [lx, ly] = polarToCartesian(DONUT_CX, DONUT_CY, labelR, seg.mid)
                      return (
                        <g
                          key={seg.key}
                          className="cursor-pointer"
                          style={{ opacity: faded ? 0.4 : 1, transition: 'opacity .15s ease' }}
                          onClick={() => setPartSelectionnee((sel) => (sel?.key === seg.key ? null : seg))}
                          onMouseEnter={() => { setPartSurvolee(seg); setSurvolDepuisAnneau(true) }}
                          onMouseLeave={() => { setPartSurvolee(null); setSurvolDepuisAnneau(false) }}
                          onMouseMove={(e) => {
                            const rect = donutWrapRef.current?.getBoundingClientRect()
                            if (!rect) return
                            setSurvolPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                          }}
                        >
                          <path
                            d={describeArc(DONUT_CX, DONUT_CY, rOuter, DONUT_INNER_R, seg.startAngle, seg.endAngle)}
                            fill={seg.color}
                            style={{ transition: 'd .18s ease' }}
                          />
                          {percent > 0 && (
                            <text
                              x={lx}
                              y={ly}
                              fill="#fff"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={9.5}
                              fontWeight={600}
                              stroke="rgba(47,51,73,0.35)"
                              strokeWidth={0.8}
                              paintOrder="stroke"
                            >
                              {`${Math.round(percent * 100)}%`}
                            </text>
                          )}
                        </g>
                      )
                    })}
                  </svg>
                  {/* Infobulle sombre qui suit la souris pendant le survol —
                      même rendu que la référence (fond foncé, texte coloré). */}
                  {partSurvoleeValide && survolDepuisAnneau && (
                    <div
                      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold shadow-menu"
                      style={{
                        left: survolPos.x,
                        top: survolPos.y,
                        transform: 'translate(-50%, -135%)',
                        background: partSurvoleeValide.color,
                        color: texteLisibleSur(partSurvoleeValide.color),
                      }}
                    >
                      {partSurvoleeValide.label} : {partSurvoleeValide.value}
                    </div>
                  )}
                  {/* Centre du donut : total par défaut, ou la part cliquée
                      (type de domiciliation + son nombre) tant qu'elle reste
                      sélectionnée — même comportement quelle que soit la part. */}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <div
                        className={`text-xl font-bold ${partAffichee ? '' : 'text-ink-600'}`}
                        style={partAffichee ? { color: partAffichee.color } : undefined}
                      >
                        {partAffichee ? partAffichee.label : periode.court}
                      </div>
                      <div
                        className={`tabular mt-1 text-[28px] leading-none font-bold ${partAffichee ? '' : 'text-ink-900'}`}
                        style={partAffichee ? { color: partAffichee.color } : undefined}
                      >
                        {partAffichee ? partAffichee.value : totalRepartition}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Indication sous le graphique : la part actuellement
                    sélectionnée (clic) ressort du reste de la légende. */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 px-6 pt-2 pb-6">
                  {SERIES.map((s) => {
                    const partCorrespondante = repartition.find((r) => r.key === s.key)
                    const selectionnee = partSelectionneeValide?.key === s.key
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => partCorrespondante && setPartSelectionnee((sel) => (sel?.key === s.key ? null : partCorrespondante))}
                        onMouseEnter={() => partCorrespondante && setPartSurvolee(partCorrespondante)}
                        onMouseLeave={() => setPartSurvolee(null)}
                        disabled={!partCorrespondante}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 text-left text-sm transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                          selectionnee ? 'font-semibold text-ink-900' : 'text-ink-800 hover:bg-surface'
                        }`}
                        style={selectionnee ? { background: `${s.color}1a` } : undefined}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* ---- Ligne 2 : services en cours + activité ------------------------
          `items-start` : dans la référence la carte « Activité Services »
          s'arrête à la hauteur de son contenu, elle ne s'étire pas pour
          s'aligner sur le tableau voisin. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DataTable
            title="Services en cours"
            columns={servicesColumns}
            rows={services}
            pageSize={3}
            pageSizeOptions={[3, 10, 25, 50]}
            loading={loadingServices}
            emptyText="Aucun service en cours"
            actionsHeader="ACTIONS"
            hoverClassName="hover:bg-success-50"
            onRowClick={(r) => showServiceActivite(r)}
            rowClassName={(r) => (selectedService?.id === r.id ? 'bg-success-100' : '')}
            rowActions={(r) => (
              <div onClick={(e) => e.stopPropagation()}>
                <ServiceEnCoursRowActions row={r} onChanged={rechargerServices} onAfficher={showServiceActivite} />
              </div>
            )}
            actions={
              <a href="#/services-en-cours" className="text-xs font-semibold text-brand-500 hover:underline">
                Voir tout
              </a>
            }
          />
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-card">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl text-ink-900 truncate">
              {selectedService ? `Activité — ${selectedService.service || 'Service'}` : 'Activité Services'}
            </h2>
            {selectedService && (
              <RowBtn title="Revenir à l'activité globale" onClick={closeServiceActivite}>
                <ArrowLeft size={14} />
              </RowBtn>
            )}
          </div>

          {serviceActiviteLoading ? (
            <div className="pb-6">
              <EmptyState title="Chargement…" />
            </div>
          ) : activiteFeed.length === 0 ? (
            <div className="pb-6">
              <EmptyState title={selectedService ? 'Aucune opération enregistrée' : 'Aucune activité récente'} />
            </div>
          ) : (
            <div className="space-y-5 px-6 pb-6">
              {activiteFeed.map((a, i) => (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-info-500" />
                    {i < activiteFeed.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                  </div>

                  <div className="min-w-0 flex-1 pb-1">
                    {/* Badge + « Par » à gauche, horodatage à droite sur deux
                        lignes (date puis heure), exactement comme la capture. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <BadgeStatutService statut={a.statut} />
                        <span className="text-sm text-ink-700">Par</span>
                      </div>
                      <div className="flex shrink-0 items-start gap-1.5 text-xs text-ink-600">
                        <Clock size={13} className="mt-0.5 shrink-0" />
                        <span className="tabular text-right leading-tight">
                          {formatDate(a.createdAt)}
                          <br />
                          {formatHeure(a.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Le cabinet est affiché, jamais le membre de l'équipe
                        qui a réellement effectué l'opération. */}
                    <div className="mt-0.5 text-sm font-semibold text-ink-900">Via Experts</div>

                    {a.fichierChemin && (
                      <a
                        href={`${API_URL}/storage/${a.fichierChemin}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 break-all text-sm text-ink-800 hover:text-brand-500 hover:underline"
                      >
                        <Download size={14} className="shrink-0" /> {a.fichierNom}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
