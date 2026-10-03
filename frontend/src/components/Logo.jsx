/**
 * Logo Via Experts — véritable identité de marque.
 *
 * Le symbole est servi depuis `public/logo-mark.png` (fond rendu transparent
 * pour se poser sur la sidebar sombre) ; le logo complet officiel, marque +
 * signature, est `public/logo-via-experts.jpg` (fond blanc, fourni tel quel)
 * pour les fonds clairs — formulaire de connexion, documents imprimés.
 *
 * API inchangée : `<Logo dark collapsed />`.
 */
export default function Logo({ collapsed = false, dark = true, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <img
        src="/logo-mark.png"
        alt="Via Experts"
        className="h-9 w-auto shrink-0"
        draggable="false"
      />
      {!collapsed && (
        <div className="leading-none">
          <div
            className={`text-[19px] font-extrabold tracking-[0.02em] ${
              dark ? 'text-white' : 'text-ink-900'
            }`}
          >
            VIA EXPERTS
          </div>
          <div
            className={`mt-1 border-t pt-1 text-[8px] font-medium tracking-[0.06em] whitespace-nowrap ${
              dark ? 'border-white/25 text-white/70' : 'border-ink-600/30 text-ink-600'
            }`}
          >
            Cabinet Comptable et de Conseil
          </div>
        </div>
      )}
    </div>
  )
}

/** Logo complet officiel, pour un affichage en grand sur fond clair. */
export function LogoFull({ className = '' }) {
  return (
    <img
      src="/logo-via-experts.jpg"
      alt="Via Experts — Cabinet Comptable et de Conseil"
      className={`w-auto select-none ${className}`}
      draggable="false"
    />
  )
}
