import { useMemo, useState } from 'react'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import { calculerTva } from '../utils/calculTva.js'

/**
 * Calculateur de TVA — fenêtre large (référence : « Calculateur de TVA ») : taux en %, puis trois montants côte à côte
 * (TVA, HT, TTC). On saisit dans l'UN des trois champs ; les deux autres se calculent.
 *
 * Règles de calcul inchangées par rapport à l'ancien panneau : arrondi au centime, TVA = HT × taux, TTC = HT + TVA,
 * HT = TTC ÷ (1 + taux). S'y ajoute la saisie de la TVA (HT = TVA ÷ taux) puisque le champ est affiché.
 */

function ChampMontant({ label, value, onChange, lectureCalculee }) {
  return (
    <label className="relative flex min-h-[4.5rem] cursor-text flex-col justify-center rounded-lg border border-line bg-white px-4 py-2 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 hover:border-brand-300">
      <span className="text-[15px] text-ink-700">{label}</span>
      <span className="flex items-baseline gap-3">
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder="0.00"
          aria-label={label}
          data-calcule={lectureCalculee ? 'oui' : 'non'}
          className="tabular min-w-0 flex-1 border-0 bg-transparent p-0 text-lg font-medium text-ink-900 placeholder:text-ink-600 focus:outline-none"
        />
        <span className="shrink-0 text-[15px] text-ink-700">Dh</span>
      </span>
    </label>
  )
}

export default function TvaCalculatorPanel({ open, onClose }) {
  const [source, setSource] = useState('ht')
  const [saisie, setSaisie] = useState('')
  const [taux, setTaux] = useState('20')

  const calcule = useMemo(() => calculerTva(source, saisie, taux), [source, saisie, taux])

  // Le champ saisi garde EXACTEMENT ce que l'on tape ; les deux autres affichent le résultat (vide tant qu'on n'a rien saisi).
  const valeurChamp = (cle) => {
    if (cle === source) return saisie
    return saisie === '' ? '' : String(calcule[cle])
  }
  const surSaisie = (cle) => (e) => {
    setSource(cle)
    setSaisie(e.target.value)
  }

  return (
    <Modal open={open} onClose={onClose} size="wide" position="haut" title="Calculateur de TVA" footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      <div className="space-y-5">
        <div className="flex">
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
            aria-label="Taux de TVA (%)"
            className="h-12 min-w-0 flex-1 rounded-l-lg border border-line bg-white px-4 text-[15px] text-ink-900 transition-colors hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
          <span className="grid h-12 w-14 shrink-0 place-items-center rounded-r-lg border border-l-0 border-line bg-white text-[15px] text-ink-700">%</span>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <ChampMontant label="Montant Tva" value={valeurChamp('tva')} onChange={surSaisie('tva')} lectureCalculee={source !== 'tva'} />
          <ChampMontant label="Montant HT" value={valeurChamp('ht')} onChange={surSaisie('ht')} lectureCalculee={source !== 'ht'} />
          <ChampMontant label="Montant TTC" value={valeurChamp('ttc')} onChange={surSaisie('ttc')} lectureCalculee={source !== 'ttc'} />
        </div>
      </div>
    </Modal>
  )
}
