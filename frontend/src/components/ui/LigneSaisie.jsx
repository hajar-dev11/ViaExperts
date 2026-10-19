/**
 * Briques des lignes de saisie COMPACTES (Facture, Devis, Bon de livraison, Avoir, Paiement) : une ligne = une rangée de
 * champs de 36 px de haut, avec les intitulés UNE SEULE FOIS en tête de tableau. Quatre lignes ou plus restent lisibles :
 * la zone défile dans sa propre hauteur au lieu d'allonger tout le formulaire.
 */

const CELLULE = 'h-9 w-full rounded-md border bg-white px-2 text-[13px] text-ink-900 transition-colors placeholder:text-ink-500 focus:outline-none focus:ring-2 disabled:bg-surface'
const OK = 'border-line hover:border-brand-300 focus:border-brand-500 focus:ring-brand-500/20'
const KO = 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20'

/** Champ d'une cellule de ligne. `aria-label` obligatoire : les intitulés visibles sont dans l'en-tête du tableau. */
export function CelluleInput({ erreur = false, className = '', ...props }) {
  return (
    <input
      {...props}
      aria-invalid={erreur ? true : undefined}
      className={`${CELLULE} ${erreur ? KO : OK} ${className}`}
    />
  )
}

/** Montant calculé, en lecture seule (vert dès qu'il porte un montant, rose à zéro — code couleur de la référence). */
export function CelluleCalculee({ children, positif = false, gras = false }) {
  return (
    <div
      className={`tabular flex h-9 items-center justify-end rounded-md border px-2 text-[13px] ${gras ? 'font-bold' : 'font-semibold'} ${
        positif ? 'border-success-300 bg-success-50 text-success-700' : 'border-danger-200 bg-danger-50 text-danger-600'
      }`}
    >
      {children}
    </div>
  )
}

/** Conteneur : défile horizontalement sur petit écran, et verticalement au-delà de 4 lignes (en-tête fixe). */
export function TableauLignes({ colonnes, enTetes, children, nombre = 0 }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <div className="min-w-[56rem]">
        <div className={`grid ${colonnes} items-center gap-2 border-b border-line bg-surface px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-600 uppercase`}>
          {enTetes.map((e, i) => <span key={`${e}-${i}`} className={i === 0 ? '' : 'text-right'}>{e}</span>)}
        </div>
        <div className={`divide-y divide-line ${nombre > 4 ? 'max-h-[20rem] overflow-y-auto' : ''}`}>{children}</div>
      </div>
    </div>
  )
}
