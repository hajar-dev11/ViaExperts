import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, CalendarDays, TrendingUp, PieChart as PieChartIcon } from 'lucide-react'
import ServiceEnCoursRowActions, {
  ItemActiviteService, StatutServiceBadge,
} from '../components/ServiceEnCoursActions.jsx'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import DataTable from '../components/DataTable.jsx'
import FilActivite from '../components/ui/FilActivite.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Popover from '../components/Popover.jsx'
import { formatDateHeure } from '../utils/format.js'
import { listDomiciliations } from '../modules/domiciliation/index.js'
import { listServicesEnCours, listActivite, listStatutsService, getServiceEnCours } from '../api/servicesEnCours.js'
import { PERIODES, construireSeries } from '../utils/seriesDomiciliation.js'
import { SERIES_DOMICILIATION, calculerSegments, decrireArc, polarToCartesian, valeursParSerie } from '../utils/donut.js'
import LegendeRepartition from '../components/LegendeRepartition.jsx'

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

// Les 4 actions (ordre et couleurs) sont définies une seule fois, dans utils/donut.js : la légende du donut les affiche toujours.
const SERIES = SERIES_DOMICILIATION

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

// Tracé et angles du donut : voir utils/donut.js (une part de 100 % est tracée comme un anneau complet).

export default function Dashboard() {
  const [domiciliations, setDomiciliations] = useState(null)
  // Statuts de service (Paramètre > Services), proposés par le menu du statut d'une ligne.
  const [statuts, setStatuts] = useState([])
  const [services, setServices] = useState([])
  const [activite, setActivite] = useState([])
  const [loadingServices, setLoadingServices] = useState(true)
  // Ligne « Services en cours » choisie (clic ou œil) ; sans choix, la première ligne du tableau (même mécanisme que la page
  // Services En Cours).
  const [selectedId, setSelectedId] = useState(null)
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

    // Statuts réels de Paramètre > Services, servis avec le droit de lecture de « Services en cours » (et non celui de
    // Paramètres) : un utilisateur habilité à changer un statut voit la liste.
    listStatutsService()
      .then((r) => { if (!cancelled) setStatuts(Array.isArray(r) ? r : []) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  /** Rechargement après changement de statut, archivage ou suppression. */
  const rechargerServices = () => {
    listServicesEnCours('actif').then(setServices).catch(() => {})
    listActivite(6).then(setActivite).catch(() => {})
  }

  // Panneau « Activité Services » : par défaut le fil d'opérations de la PREMIÈRE ligne du tableau (ligne surlignée) ; l'œil ou le
  // clic sur une autre ligne affiche celui du service choisi, sans popup — même comportement que la page Services En Cours.
  // Le fil global ne sert que si le tableau est vide.
  const showServiceActivite = (r) => setSelectedId(r.id)
  const selectedService = services.find((r) => r.id === selectedId) ?? services[0] ?? null
  const selectedServiceId = selectedService?.id ?? null

  useEffect(() => {
    if (selectedServiceId === null) { setServiceActivite([]); return undefined }
    let annule = false
    setServiceActiviteLoading(true)
    getServiceEnCours(selectedServiceId)
      .then((full) => { if (!annule) setServiceActivite(full?.operations ?? []) })
      .catch(() => { if (!annule) setServiceActivite([]) })
      .finally(() => { if (!annule) setServiceActiviteLoading(false) })
    return () => { annule = true }
  }, [selectedServiceId, services])

  const trend = useMemo(
    () => (domiciliations ? construireSeries(domiciliations, periode) : []),
    [domiciliations, periode]
  )

  // Le donut reprend les MÊMES séries, cumulées sur la période affichée.
  // `valeursPeriode` garde les 4 actions (valeur 0 comprise) pour la légende fixe ; `repartition` (ce que trace le donut) ne
  // garde que celles > 0, comme avant.
  const valeursPeriode = useMemo(() => valeursParSerie(SERIES, trend), [trend])
  const repartition = useMemo(() => valeursPeriode.filter((s) => s.value > 0), [valeursPeriode])

  // Angle de chaque part (degrés, 0 = 3h, sens horaire) — part à part, dans
  // l'ordre de `repartition`, en partant de midi (-90°) comme la référence.
  // Calcul dans utils/donut.js : valeurs invalides ignorées, jamais de division
  // par zéro, une part unique (100 %) donne bien un anneau complet.
  const { total: totalRepartition, segments: segmentsAngles } = useMemo(() => calculerSegments(repartition), [repartition])
  const aucuneDonnee = domiciliations !== null && totalRepartition === 0
  // Ignore une sélection/survol devenu obsolète (période changée, part
  // retombée à 0). Le survol l'emporte sur la sélection tant qu'il dure.
  const partSelectionneeValide = partSelectionnee && repartition.some((s) => s.key === partSelectionnee.key)
    ? partSelectionnee
    : null
  const partSurvoleeValide = partSurvolee && repartition.some((s) => s.key === partSurvolee.key)
    ? partSurvolee
    : null
  const partAffichee = partSurvoleeValide ?? partSelectionneeValide

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
      // Le statut est cliquable : liste des statuts réels, enregistrée par l'API (même composant que Services En Cours).
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <StatutServiceBadge row={r} statuts={statuts} onChanged={rechargerServices} />
        </span>
      ),
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
            <>
            {repartition.length === 0 ? (
              <div className="grid flex-1 place-items-center pb-2">
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
                      const percent = seg.percent
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
                            d={decrireArc(DONUT_CX, DONUT_CY, rOuter, DONUT_INNER_R, seg.startAngle, seg.endAngle)}
                            fill={seg.color}
                            fillRule="evenodd"
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

              </>
            )}

            {/* Légende FIXE sous le cercle : les 4 actions restent toujours visibles, même à 0 ou sans aucune donnée.
                La part sélectionnée (clic) ressort du reste de la légende. */}
            <LegendeRepartition
              series={valeursPeriode}
              selectionneeKey={partSelectionneeValide?.key ?? null}
              onSelect={(s) => setPartSelectionnee((sel) => (sel?.key === s.key ? null : s))}
              onHover={setPartSurvolee}
            />
            </>
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
              {selectedService ? `Activité Services — ${selectedService.service || 'Service'}` : 'Activité Services'}
            </h2>
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
            <FilActivite className="space-y-5 px-6 pb-6">
              {activiteFeed.map((a, i) => (
                <ItemActiviteService key={a.id} a={a} dernier={i === activiteFeed.length - 1} />
              ))}
            </FilActivite>
          )}
        </div>
      </div>
    </div>
  )
}
