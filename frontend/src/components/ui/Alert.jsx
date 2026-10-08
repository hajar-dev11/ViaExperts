import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { DUREE_FONDU, DUREE_MESSAGE } from './messages.js'

/**
 * Alert — message contextuel en place (erreur de formulaire, information de
 * contexte). Pour un retour transitoire après une action, préférer le Toast.
 *
 * `onAutoClose` : message TRANSITOIRE. Après `DUREE_MESSAGE` le bandeau s'efface en fondu, puis `onAutoClose` est appelé
 * pour que la page vide son état (`() => setSuccess('')`) : le message disparaît vraiment, et une action suivante qui
 * produit le même texte s'affiche à nouveau. Un nouveau texte remplace l'ancien et relance la durée. Sans `onAutoClose`,
 * le bandeau reste affiché (information de contexte, erreur qui remplace la page).
 *
 * `onRetry` : erreur CRITIQUE de chargement (« Impossible de charger les clients »). Elle ne s'efface JAMAIS toute seule —
 * sans `onAutoClose` — et propose « Réessayer ». Elle disparaît quand le chargement réussit (la page vide son état au début
 * de chaque nouvelle tentative) ou quand l'utilisateur change de page.
 */

const TONES = {
  success: { cls: 'bg-success-50 text-success-700', Icon: CheckCircle2 },
  warning: { cls: 'bg-warning-50 text-warning-700', Icon: TriangleAlert },
  danger: { cls: 'bg-danger-50 text-danger-700', Icon: AlertCircle },
  info: { cls: 'bg-info-50 text-info-700', Icon: Info },
  primary: { cls: 'bg-brand-50 text-brand-600', Icon: Info },
  neutral: { cls: 'bg-surface text-ink-700', Icon: Info },
}

export default function Alert({
  tone = 'info',
  title,
  children,
  icon = true,
  onClose,
  onAutoClose,
  onRetry,
  className = '',
}) {
  const { cls, Icon } = TONES[tone] ?? TONES.info

  // Clé du message courant : un texte différent repart avec une nouvelle durée.
  // Un contenu non textuel (JSX) n'est minuté qu'une fois, à l'affichage.
  const cle = typeof children === 'string' || typeof children === 'number' ? String(children) : ''
  const auto = typeof onAutoClose === 'function'
  const [fondu, setFondu] = useState(null)
  const rappel = useRef(onAutoClose)
  useEffect(() => { rappel.current = onAutoClose })

  useEffect(() => {
    if (!auto) return undefined
    const debutFondu = setTimeout(() => setFondu(cle), DUREE_MESSAGE)
    const fin = setTimeout(() => rappel.current?.(), DUREE_MESSAGE + DUREE_FONDU)
    return () => { clearTimeout(debutFondu); clearTimeout(fin) }
  }, [auto, cle])

  const sortie = auto && fondu === cle

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${cls} ${
        auto ? `transition-opacity ease-in ${sortie ? 'opacity-0' : 'opacity-100'}` : ''
      } ${className}`}
      style={auto ? { transitionDuration: `${DUREE_FONDU}ms` } : undefined}
    >
      {icon && <Icon size={17} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {typeof onRetry === 'function' && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold underline underline-offset-2 transition-opacity hover:opacity-80 focus-ring"
        >
          Réessayer
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-ring"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
