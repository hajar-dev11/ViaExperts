import { SquarePen } from 'lucide-react'

/**
 * Icônes d'ACTION partagées — celles de la colonne ACTIONS des captures de référence.
 * Toute l'application passe par ces deux composants (jamais par `Pencil` ou `ListTree` directement),
 * pour que « Modifier » et « Menu d'actions » aient partout la même forme.
 *
 *   • IconeModifier : crayon dans un carré ouvert, contour fin et arrondi — `SquarePen` de Lucide, bibliothèque déjà
 *     utilisée dans toute l'application (aucun second jeu d'icônes).
 *   • IconeActions  : trois puces + trois barres arrondies, PLEINES. Aucune icône Lucide n'a ce dessin plein : il est
 *     tracé ici d'après la référence (viewBox 512, comme l'original).
 */

/** Crayon dans un carré — « Modifier ». */
export function IconeModifier({ size = 18, strokeWidth = 1.75, ...props }) {
  return <SquarePen size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />
}

/** Puces + barres — menu « Actions » de la ligne. */
export function IconeActions({ size = 18, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="34" cy="98" r="34" />
      <circle cx="34" cy="256" r="34" />
      <circle cx="34" cy="414" r="34" />
      <rect x="118" y="72" width="394" height="52" rx="26" />
      <rect x="118" y="230" width="394" height="52" rx="26" />
      <rect x="118" y="388" width="394" height="52" rx="26" />
    </svg>
  )
}
