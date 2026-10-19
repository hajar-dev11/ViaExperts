import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CLASSE_SELECT_BLEU } from './Field.jsx'
import { filtrerOptions } from '../utils/rechercheOptions.js'

const MAX_RESULTATS = 200

/**
 * Liste déroulante AVEC RECHERCHE (combobox) : au clic on peut taper pour filtrer, puis choisir un résultat (souris ou
 * clavier : ↑ ↓ Entrée Échap). La valeur enregistrée reste l'IDENTIFIANT réel de l'option choisie — jamais le texte saisi :
 * tant qu'aucun résultat n'est choisi, la valeur ne change pas.
 *
 * @param {{ options: Array<{ cle: string, value: string|number, label: string, groupe?: string }>,
 *           value: string|number, onChange: (value: string) => void, placeholder?: string, required?: boolean, id?: string,
 *           error?: boolean, disabled?: boolean, icon?: React.ReactNode }} props
 */
export default function SelectRecherche({
  options, value, onChange, placeholder = 'Sélectionner…', required = false, id, error = false, disabled = false, icon = null,
}) {
  const [ouvert, setOuvert] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [actif, setActif] = useState(0)
  const [cleChoisie, setCleChoisie] = useState(null)
  const racine = useRef(null)
  const liste = useRef(null)
  const idListe = useId()

  const valeurTexte = value === null || value === undefined ? '' : String(value)
  // L'option affichée : celle qu'on vient de choisir (clé précise, deux groupes pouvant partager un identifiant), sinon la
  // première qui porte la valeur (ouverture d'une fiche existante).
  const selectionnee = useMemo(() => {
    if (valeurTexte === '') return null
    return options.find((o) => o.cle === cleChoisie && String(o.value) === valeurTexte)
      ?? options.find((o) => String(o.value) === valeurTexte)
      ?? null
  }, [options, valeurTexte, cleChoisie])

  const resultats = useMemo(() => filtrerOptions(options, saisie).slice(0, MAX_RESULTATS), [options, saisie])

  useEffect(() => {
    if (!ouvert) return undefined
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [ouvert])

  // L'option active reste visible quand on navigue au clavier.
  useEffect(() => {
    if (ouvert) liste.current?.querySelector('[data-actif="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [actif, ouvert])

  const ouvrir = () => {
    if (disabled) return
    setOuvert(true)
    setSaisie('')
    setActif(Math.max(0, options.findIndex((o) => o === selectionnee)))
  }

  const choisir = (option) => {
    setCleChoisie(option.cle)
    onChange(String(option.value))
    setOuvert(false)
    setSaisie('')
  }

  const surTouche = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!ouvert) { ouvrir(); return }
      setActif((a) => Math.min(a + 1, resultats.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && ouvert) {
      // Entrée choisit le résultat actif ; elle ne doit PAS envoyer le formulaire.
      e.preventDefault()
      if (resultats[actif]) choisir(resultats[actif])
    } else if (e.key === 'Escape' && ouvert) {
      e.stopPropagation()
      setOuvert(false)
      setSaisie('')
    } else if (e.key === 'Tab') {
      setOuvert(false)
    }
  }

  const texteAffiche = ouvert ? saisie : (selectionnee ? `${selectionnee.label}${selectionnee.groupe ? ` — ${selectionnee.groupe}` : ''}` : '')

  return (
    <div ref={racine} className="relative">
      {icon && (
        <>
          <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center text-ink-600">{icon}</span>
          <span className="pointer-events-none absolute inset-y-2.5 left-11 z-10 w-px bg-line" />
        </>
      )}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        disabled={disabled}
        value={texteAffiche}
        placeholder={ouvert && selectionnee ? selectionnee.label : placeholder}
        onClick={() => { if (!ouvert) ouvrir() }}
        onFocus={() => { if (!ouvert) ouvrir() }}
        onChange={(e) => { setSaisie(e.target.value); setOuvert(true); setActif(0) }}
        onKeyDown={surTouche}
        className={`${CLASSE_SELECT_BLEU} h-11 truncate ${icon ? 'pl-[3.25rem]' : ''} ${error ? 'border-danger-500' : ''}`}
      />
      {/* Champ requis : la validation du navigateur porte sur l'identifiant choisi, pas sur le texte tapé. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={valeurTexte}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      )}
      {ouvert && (
        <ul
          ref={liste}
          id={idListe}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-menu"
        >
          {resultats.length === 0 ? (
            <li className="px-3.5 py-2.5 text-[15px] text-ink-600">Aucun résultat</li>
          ) : resultats.map((o, i) => (
            <li
              key={o.cle}
              role="option"
              aria-selected={selectionnee === o}
              data-actif={i === actif}
              // mousedown (et non click) : le champ garde le focus, la liste ne se ferme pas avant le choix.
              onMouseDown={(e) => { e.preventDefault(); choisir(o) }}
              onMouseEnter={() => setActif(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-[15px] ${
                i === actif ? 'bg-brand-50 text-ink-900' : 'text-ink-800'
              } ${selectionnee === o ? 'font-medium' : ''}`}
            >
              <span className="min-w-0 truncate">{o.label}</span>
              {o.groupe && <span className="shrink-0 text-xs text-ink-600">{o.groupe}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
