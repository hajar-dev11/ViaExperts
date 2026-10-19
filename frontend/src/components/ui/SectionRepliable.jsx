import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Section repliable : le titre et la flèche restent visibles, le contenu n'est affiché qu'une fois la section ouverte.
 *
 *   - FERMÉE par défaut (`ouvertParDefaut` pour l'inverse) : le contenu n'est même pas rendu ;
 *   - un clic sur la flèche l'ouvre, un second la referme ; la flèche pointe vers le bas (fermée) ou vers le haut (ouverte) ;
 *   - `action` : zone à droite du titre, avant la flèche (ex. bouton de recherche). Peut être une fonction `({ ouvrir }) => nœud`
 *     pour ouvrir la section depuis l'action (la recherche affiche ses résultats dans le contenu) ;
 *   - compact : version discrète pour l'intérieur d'une fenêtre ou d'une fiche (cadre fin, sans ombre, titre plus petit) ;
 *   - accessible : bouton natif, `aria-expanded`, `aria-controls`, libellé « Afficher / Masquer … ».
 */
export default function SectionRepliable({ titre, ouvertParDefaut = false, action, children, className = '', compact = false }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  const idContenu = useId()
  const ouvrir = () => setOuvert(true)

  return (
    <section className={`overflow-hidden bg-white ${compact ? 'rounded-lg border border-line' : 'rounded-xl shadow-card'} ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${compact ? 'px-4 py-2.5' : 'px-6 py-4'}`}>
        <h2 className={`min-w-0 truncate font-medium text-ink-900 ${compact ? 'text-[15px]' : 'text-lg'}`}>{titre}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {typeof action === 'function' ? action({ ouvrir }) : action}
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            aria-controls={idContenu}
            aria-label={`${ouvert ? 'Masquer' : 'Afficher'} ${titre}`}
            title={`${ouvert ? 'Masquer' : 'Afficher'} ${titre}`}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-800 transition-colors hover:bg-surface hover:text-brand-600 focus-ring"
          >
            <ChevronDown size={20} className={`transition-transform duration-200 ${ouvert ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {ouvert && (
        <div id={idContenu} className={`border-t border-line ${compact ? 'px-4 pt-4 pb-4' : 'px-6 pt-4 pb-6'}`}>
          {children}
        </div>
      )}
    </section>
  )
}
