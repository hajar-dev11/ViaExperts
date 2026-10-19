/**
 * Fil d'activité (Services en cours, Cachet, Mail, Accueil, détail d'un service).
 * Toutes les activités sont affichées, dans l'ordre, sans barre de défilement interne.
 */
export default function FilActivite({ children, className = '', label = "Fil d'activité" }) {
  return (
    <div role="region" aria-label={label} data-fil-activite className={className}>
      {children}
    </div>
  )
}
