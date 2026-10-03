/**
 * Badge de statut d'une domiciliation.
 *
 * Extrait de `pages/DomiciliationList.jsx` : il est utilisé par la fiche
 * Domiciliation, la liste par statut, le formulaire et la fiche Entreprise.
 * Le garder dans une page créait un cycle d'import entre la page et la fiche.
 * `DomiciliationList` le réexporte pour ne pas casser les imports existants.
 */
export const STATUT_LABELS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  alerte: { label: 'Alerte', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  declare: { label: 'Déclaré', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  expire: { label: 'Expiré', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  resilie: { label: 'Résilié', className: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export default function StatutDomiciliation({ statut }) {
  const s = STATUT_LABELS[statut] || STATUT_LABELS.active
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>
      {s.label}
    </span>
  )
}
