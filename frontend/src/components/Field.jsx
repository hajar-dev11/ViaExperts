import { AlertCircle, Plus } from 'lucide-react'

/**
 * Champs de formulaire du design system.
 *
 * API HISTORIQUE CONSERVEE : `Field`, `Input`, `Select`, `Textarea`,
 * `Checkbox` et `FormCard` gardent exactement leurs props existantes — les 19
 * formulaires du projet continuent de fonctionner sans modification.
 *
 * Ajouts (tous optionnels) :
 *   - `error` : message d'erreur affiché sous le champ + bordure rouge
 *   - `hint`  : aide contextuelle sous le champ
 *   - `icon`  : icône à gauche DANS le champ, séparée par un filet vertical —
 *               c'est la forme exacte des champs des captures de référence
 *   - états `disabled` et focus homogènes
 */

export function Field({ label, required, children, className = '', error, hint, htmlFor }) {
  return (
    <label className={`block ${className}`} htmlFor={htmlFor}>
      {label && (
        <span className="mb-1.5 block text-[15px] font-medium text-ink-800">
          {label} {required && <span className="text-danger-500">*</span>}
        </span>
      )}
      {children}
      {error && (
        <span className="mt-1.5 flex items-start gap-1 text-[13px] text-danger-600">
          <AlertCircle size={13} className="mt-px shrink-0" />
          <span>{error}</span>
        </span>
      )}
      {!error && hint && <span className="mt-1.5 block text-[13px] text-ink-600">{hint}</span>}
    </label>
  )
}

const BASE =
  'w-full rounded-lg border bg-white px-3.5 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-600'

const OK = 'border-line hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const KO = 'border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500/20'

const control = (error, extra = '') => `${BASE} ${error ? KO : OK} ${extra}`

/**
 * Gabarit « champ à icône » des captures de référence : une icône à gauche,
 * séparée du texte par un FILET VERTICAL, puis la saisie.
 */
function WithIcon({ icon, children }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-ink-600">
        {icon}
      </span>
      <span className="pointer-events-none absolute inset-y-2.5 left-11 w-px bg-line" />
      {children}
    </span>
  )
}

export function Input({ error, icon, className = '', ...props }) {
  const input = (
    <input
      {...props}
      aria-invalid={error ? true : undefined}
      className={control(error, `h-11 ${icon ? 'pl-[3.25rem]' : ''} ${className}`)}
    />
  )
  return icon ? <WithIcon icon={icon}>{input}</WithIcon> : input
}

// Liste déroulante : même gabarit que les champs, teintée du bleu de la marque (voir .ve-select dans index.css).
// Pas de `bg-white` ici : il entrerait en conflit avec le fond bleuté.
const BASE_SELECT =
  'w-full rounded-lg border px-3.5 text-[15px] text-ink-900 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-600'
export const CLASSE_SELECT_BLEU = `ve-select ${BASE_SELECT} cursor-pointer border-brand-300 bg-brand-50/60 hover:border-brand-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20`

export function Select({ error, icon, children, className = '', ...props }) {
  const select = (
    <select
      {...props}
      aria-invalid={error ? true : undefined}
      className={`${error ? `ve-select ${BASE_SELECT} cursor-pointer bg-white ${KO}` : CLASSE_SELECT_BLEU} h-11 ${icon ? 'pl-[3.25rem]' : ''} ${className}`}
    >
      {children}
    </select>
  )
  return icon ? <WithIcon icon={icon}>{select}</WithIcon> : select
}

export function Textarea({ error, className = '', ...props }) {
  return (
    <textarea
      {...props}
      aria-invalid={error ? true : undefined}
      className={control(error, `min-h-[100px] resize-y py-2.5 ${className}`)}
    />
  )
}

/**
 * Champ d'import de fichier, habillé comme les autres champs du formulaire.
 * Le bouton natif « Parcourir » reprend le violet de la marque.
 */
export function FileInput({ className = '', ...props }) {
  return (
    <input
      type="file"
      {...props}
      className={`block w-full cursor-pointer rounded-lg border border-line bg-white text-[15px] text-ink-800 file:mr-4 file:cursor-pointer file:border-0 file:bg-brand-100 file:px-4 file:py-2.5 file:text-[15px] file:font-medium file:text-brand-600 focus-ring ${className}`}
    />
  )
}

export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-[15px] text-ink-800 ${className}`}>
      <input
        type="checkbox"
        {...props}
        className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500/40"
      />
      {label}
    </label>
  )
}

export function Radio({ label, className = '', ...props }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-[15px] text-ink-800 ${className}`}>
      <input
        type="radio"
        {...props}
        className="h-4 w-4 border-line text-brand-500 focus:ring-brand-500/40"
      />
      {label}
    </label>
  )
}

/**
 * Switch — interrupteur violet des captures de référence
 * (bascule « Entreprises / Clients » du formulaire de facturation).
 */
export function Switch({ label, checked, onChange, disabled, className = '', ...props }) {
  return (
    <label
      className={`inline-flex items-center gap-2.5 text-[15px] text-ink-800 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${className}`}
    >
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <span className="block h-6 w-11 rounded-full bg-ink-600/40 transition-colors peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
      {label}
    </label>
  )
}

/**
 * RadioCard / CheckboxCard — choix présentés dans une carte bordurée, comme sur
 * les captures (« Via Experts / Centre Domiciliation », matrice des permissions
 * de Paramètres → Assistance).
 */
export function RadioCard({ label, hint, className = '', ...props }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 py-3.5 text-[15px] transition-colors hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 ${className}`}
    >
      <input type="radio" {...props} className="h-4 w-4 border-line text-brand-500 focus:ring-brand-500/40" />
      <span className="min-w-0 flex-1 font-medium text-ink-900">{label}</span>
      {hint && <span className="shrink-0 text-ink-600">{hint}</span>}
    </label>
  )
}

export function CheckboxCard({ label, className = '', ...props }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white px-4 py-3.5 text-[15px] transition-colors hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 ${className}`}
    >
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500/40"
      />
      <span className="min-w-0 flex-1 text-ink-800">{label}</span>
    </label>
  )
}

/**
 * FieldRow — libellé à GAUCHE, champ à droite.
 *
 * C'est la disposition du formulaire « Ajouter Entreprise » de la référence
 * (le formulaire Client, lui, garde ses libellés au-dessus : la référence
 * n'est pas homogène et on la reproduit telle quelle).
 *
 * `action` place un élément à droite du champ, pour les boutons « + » violets
 * qui accompagnent Client, Secteur d'Activité et Activité.
 */
export function FieldRow({ label, required, htmlFor, children, action, error, hint, className = '' }) {
  return (
    <div className={`grid grid-cols-1 items-start gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,10rem)_1fr] ${className}`}>
      <label htmlFor={htmlFor} className="text-[15px] leading-snug text-ink-800 sm:pt-3">
        {label} {required && <span className="text-danger-500">*</span>}
      </label>
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{children}</div>
          {action}
        </div>
        {error && (
          <span className="mt-1.5 flex items-start gap-1 text-[13px] text-danger-600">
            <AlertCircle size={13} className="mt-px shrink-0" />
            <span>{error}</span>
          </span>
        )}
        {!error && hint && <span className="mt-1.5 block text-[13px] text-ink-600">{hint}</span>}
      </div>
    </div>
  )
}

/** Bouton « + » violet pâle des formulaires de la référence. */
export function AddButton({ title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600 transition-colors hover:bg-brand-200 focus-ring"
    >
      <Plus size={20} />
    </button>
  )
}

/** Séparateur à titre centré (« Accès Au Client » sur la capture Assistance). */
export function SectionDivider({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span className="h-px flex-1 bg-info-200" />
      <span className="text-[15px] font-medium text-ink-800">{children}</span>
      <span className="h-px flex-1 bg-info-200" />
    </div>
  )
}

/**
 * FormCard — carte de formulaire.
 *
 * `footer` (optionnel) rend un bandeau pleine largeur collé au bas de la carte :
 * c'est la forme du bouton « Ajouter Client » de la référence.
 * Sans `footer`, le comportement est exactement celui d'avant.
 */
export function FormCard({ title, action, children, footer, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-2">
          <h2 className="text-xl text-ink-900">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
      {footer}
    </div>
  )
}

/** Barre d'actions de formulaire, alignée à droite au-dessus d'un filet. */
export function FormActions({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4 ${className}`}>
      {children}
    </div>
  )
}
