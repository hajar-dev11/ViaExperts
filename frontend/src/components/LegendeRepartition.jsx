/**
 * Légende FIXE du donut « Expense Ratio » : les quatre actions (Nouveau, Renouveler, Déclary, Résilier) sont toujours
 * affichées sous le cercle, même quand leur valeur est nulle ou qu'il n'y a aucune donnée. Aucune valeur n'est inventée :
 * une action sans valeur apparaît simplement atténuée (sa pastille de couleur reste visible) et n'est pas cliquable.
 *
 * `series` : `[{ key, label, color, value }]` — toutes les actions, valeur 0 comprise (voir `valeursParSerie`).
 * `selectionneeKey` : action mise en avant (clic sur le donut ou sur la légende) ; `onSelect` / `onHover` reçoivent la série.
 */
export default function LegendeRepartition({ series, selectionneeKey = null, onSelect, onHover }) {
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 px-6 pt-2 pb-6" aria-label="Légende du graphique Expense Ratio">
      {series.map((s) => {
        const sansValeur = !(s.value > 0)
        const pastille = <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />

        if (sansValeur) {
          return (
            <li key={s.key} data-legende={s.key} data-vide="true">
              <span
                className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-ink-600"
                title="Aucune valeur sur la période affichée"
              >
                {pastille}
                {s.label}
              </span>
            </li>
          )
        }

        const selectionnee = selectionneeKey === s.key
        return (
          <li key={s.key} data-legende={s.key}>
            <button
              type="button"
              onClick={() => onSelect?.(s)}
              onMouseEnter={() => onHover?.(s)}
              onMouseLeave={() => onHover?.(null)}
              className={`-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors focus-ring ${
                selectionnee ? 'font-semibold text-ink-900' : 'text-ink-800 hover:bg-surface'
              }`}
              style={selectionnee ? { background: `${s.color}1a` } : undefined}
            >
              {pastille}
              {s.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
