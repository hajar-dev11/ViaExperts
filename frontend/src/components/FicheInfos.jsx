/**
 * Briques de la fiche « Informations » — extraites de la page Détails
 * Entreprise pour que « Informations Domiciliation » et « Informations Client »
 * aient rigoureusement le MÊME rendu, sans code dupliqué.
 */

/** Ligne « icône — libellé : valeur ». */
export function Ligne({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={17} className="mt-0.5 shrink-0 text-ink-600" />
      <div className="min-w-0 text-sm">
        <span className="text-ink-800">{label} : </span>
        <span className="font-medium break-words text-ink-900">{value || '—'}</span>
      </div>
    </div>
  )
}

/** Petit titre de section en majuscules. */
export function Section({ children }) {
  return (
    <div className="mt-5 mb-1 text-[11px] font-semibold tracking-wider text-ink-600 uppercase">
      {children}
    </div>
  )
}

/** Carte blanche qui porte le titre et l'icône de la fiche. */
export function CarteFiche({ icon: Icon, titre, action, children, className = '' }) {
  return (
    <div className={`rounded-xl bg-white p-6 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon size={22} className="mt-1 shrink-0 text-ink-700" />
          <h2 className="text-xl leading-snug text-ink-900">{titre}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
