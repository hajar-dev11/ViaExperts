import { IconButton } from './Button.jsx'

/**
 * StatusTabs — bascule Actifs / Archivés / Corbeille des listes.
 *
 * Reprend le code couleur des barres d'action de la référence :
 *   Actifs    violet  (#7367F0)
 *   Archivés  orange  (#FF9F43)
 *   Corbeille anthracite (#4B4B4B)
 *
 * Le bouton de la vue courante est plein ; les autres sont en version pâle.
 *
 * `tabs` garde la forme déjà utilisée par les pages : [{ key, label, icon }].
 * Le comportement est identique à l'ancienne série de `ToolBtn` : un clic
 * appelle `onChange(key)`.
 */

const VARIANT_BY_KEY = {
  actif: { on: 'primary', off: 'primary-soft' },
  archive: { on: 'warning', off: 'warning-soft' },
  corbeille: { on: 'dark', off: 'secondary' },
}

const FALLBACK = { on: 'primary', off: 'primary-soft' }

export default function StatusTabs({ tabs = [], value, onChange, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {tabs.map((t) => {
        const palette = VARIANT_BY_KEY[t.key] ?? FALLBACK
        const active = value === t.key
        const Icon = t.icon
        return (
          <IconButton
            key={t.key}
            variant={active ? palette.on : palette.off}
            title={t.label}
            aria-pressed={active}
            onClick={() => onChange(t.key)}
          >
            {Icon && <Icon size={18} />}
          </IconButton>
        )
      })}
    </div>
  )
}
