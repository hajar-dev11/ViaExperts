import { useState } from 'react'
import { Archive, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { IconButton } from './ui/Button.jsx'
import Badge from './ui/Badge.jsx'

/** Libellés des trois vues d'un bloc, dans l'ordre des boutons d'en-tête. */
export const VUES_BLOC = { actif: 'Actifs', archive: 'Archive', corbeille: 'Corbeille' }

/**
 * Carte repliable des blocs « Documents / Observations / Domiciliations » —
 * titre + chevron, puis les boutons carrés d'en-tête de la référence : vert
 * pour ajouter (ou toute autre action mise en avant), orange « Archive »,
 * anthracite « Corbeille ». Les deux derniers changent la LISTE affichée ; un
 * second clic revient aux éléments actifs.
 *
 * Composant partagé entre « Informations Entreprise » et « Informations
 * Client » : les deux pages affichent donc rigoureusement le même bloc.
 * Omettre `onAjouter` retire le bouton d'action ; omettre `onVue` retire les
 * bascules Archive/Corbeille — utile pour un affichage purement consultatif
 * (ex. le résumé Documents/Observations sur la fiche Client).
 */
export default function CarteBloc({ icon: Icon, titre, onAjouter, titreAjout = 'Ajouter', iconeAjout, vue, onVue, children }) {
  const [ouvert, setOuvert] = useState(true)
  const bascule = (cible) => onVue?.(vue === cible ? 'actif' : cible)

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 px-6 pt-6 pb-4">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="flex min-w-0 items-center gap-2 text-left focus-ring"
        >
          <Icon size={19} className="shrink-0 text-ink-700" />
          <span className="truncate text-xl text-ink-900">{titre}</span>
          <ChevronDown size={18} className={`shrink-0 text-ink-600 transition-transform ${ouvert ? '' : '-rotate-90'}`} />
        </button>

        {vue && vue !== 'actif' && (
          <Badge tone={vue === 'archive' ? 'warning' : 'neutral'}>{VUES_BLOC[vue]}</Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          {onAjouter && (
            <IconButton variant="success" title={titreAjout} onClick={onAjouter}>
              {iconeAjout ?? <Plus size={18} />}
            </IconButton>
          )}
          {onVue && (
            <>
              <IconButton
                variant="warning"
                title={vue === 'archive' ? 'Revenir aux éléments actifs' : 'Voir les archives'}
                aria-pressed={vue === 'archive'}
                onClick={() => bascule('archive')}
              >
                <Archive size={18} />
              </IconButton>
              <IconButton
                variant="dark"
                title={vue === 'corbeille' ? 'Revenir aux éléments actifs' : 'Voir la corbeille'}
                aria-pressed={vue === 'corbeille'}
                onClick={() => bascule('corbeille')}
              >
                <Trash2 size={18} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {ouvert && children}
    </div>
  )
}
