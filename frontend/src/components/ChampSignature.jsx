/**
 * Option « Signature » des formulaires (domiciliation, renouvellement, entreprise, facture, paiement) : UNE SEULE présentation
 * pour tout le système — libellé au-dessus comme les autres champs, puis une boîte de 44 px (même hauteur qu'un champ de saisie)
 * dont la case et le texte sont CENTRÉS. Toute la boîte est cliquable ; elle s'illumine quand la case est cochée.
 *
 * `label` : intitulé du champ (« Signature », « Ajouter Signature »…) ; `texte` : intitulé de l'option cochable.
 */
// Libellé par défaut (formulaires de domiciliation) : la signature/le cachet est ajouté sur la facture, le contrat et l'attestation
// de domiciliation (la procuration n'en porte jamais). Les autres formulaires passent leur propre `texte`.
export default function ChampSignature({ label = 'Signature', texte = "Ajouter une signature sur la facture, le contrat et l'attestation", checked, onChange, className = '', disabled = false }) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-[15px] font-medium text-ink-800">{label}</span>
      <label
        className={`flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg border bg-white px-4 py-1.5 text-[15px] text-ink-800 transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 ${
          disabled ? 'cursor-not-allowed border-line opacity-60' : 'cursor-pointer border-line hover:border-brand-300'
        }`}
      >
        <input
          type="checkbox"
          checked={!!checked}
          onChange={onChange}
          disabled={disabled}
          className="h-4 w-4 shrink-0 cursor-[inherit] rounded border-line accent-brand-500"
        />
        <span className="text-center leading-snug">{texte}</span>
      </label>
    </div>
  )
}
