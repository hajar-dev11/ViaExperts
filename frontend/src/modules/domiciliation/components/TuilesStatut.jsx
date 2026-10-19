/**
 * Rangée de tuiles-compteurs de « Gestion Domiciliation » (référence : capture « Total en cours / Nouveaux / Renouvelés / Expire
 * bientôt / Expirées / Déclarées / Résiliées / Archivées ») : bandeau coloré en haut, grand nombre, puce de couleur et libellé.
 * La tuile sélectionnée est entourée. Chaque tuile est un vrai bouton (clavier, `aria-pressed`) qui filtre le tableau.
 *
 * @param {{ tuiles: Array<{cle, label, couleur}>, comptes: Record<string, number>, selection: string|null, onSelect: (cle: string) => void }} props
 */
export default function TuilesStatut({ tuiles, comptes, selection, onSelect, chargement = false }) {
  return (
    <div role="group" aria-label="Filtrer les domiciliations par statut" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
      {tuiles.map((t) => {
        const choisie = t.cle === selection
        return (
          <button
            key={t.cle}
            type="button"
            aria-pressed={choisie}
            onClick={() => onSelect(t.cle)}
            className={`relative overflow-hidden rounded-lg bg-surface px-3 pt-4 pb-3 text-left transition-shadow focus-ring ${
              choisie ? 'shadow-[0_0_0_2px_#4b4b4b]' : 'hover:shadow-card'
            }`}
          >
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.couleur }} />
            <span className="tabular block text-[22px] leading-none font-semibold text-ink-900">{chargement ? '…' : (comptes[t.cle] ?? 0)}</span>
            <span className="mt-2 flex items-start gap-1.5 text-[13px] leading-tight text-ink-800">
              <span aria-hidden="true" className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: t.couleur }} />
              <span>{t.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
