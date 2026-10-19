import { useState } from 'react'

const ROWS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
]

function compute(a, b, op) {
  const x = parseFloat(a)
  const y = parseFloat(b)
  switch (op) {
    case '+': return x + y
    case '−': return x - y
    case '×': return x * y
    case '÷': return y === 0 ? NaN : x / y
    default: return y
  }
}

const OPERATORS = ['÷', '×', '−', '+']

// Arrondi d'affichage (évite 0,1 + 0,2 = 0.30000000000000004) ; les règles de calcul ne changent pas.
const formater = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e8) / 1e8) : 'Erreur')

export default function CalculatorPanel() {
  const [display, setDisplay] = useState('0')
  const [stored, setStored] = useState(null)
  const [operator, setOperator] = useState(null)
  const [resetNext, setResetNext] = useState(false)
  // Dernière opération complète (« 4 + 2 = 6 »), affichée jusqu'à la saisie suivante.
  const [derniere, setDerniere] = useState(null)

  const inputDigit = (d) => {
    if (derniere) setDerniere(null)
    if (resetNext) {
      setDisplay(d === '.' ? '0.' : d)
      setResetNext(false)
      return
    }
    if (d === '.' && display.includes('.')) return
    setDisplay((v) => (v === '0' && d !== '.' ? d : v + d))
  }

  const clear = () => {
    setDisplay('0')
    setStored(null)
    setOperator(null)
    setResetNext(false)
    setDerniere(null)
  }

  const backspace = () => setDisplay((v) => (v.length > 1 ? v.slice(0, -1) : '0'))

  const percent = () => setDisplay((v) => String(parseFloat(v) / 100))

  const chooseOperator = (op) => {
    if (operator && !resetNext) {
      const result = formater(compute(stored, display, operator))
      setStored(result)
      setDisplay(result)
    } else {
      setStored(display)
    }
    setDerniere(null)
    setOperator(op)
    setResetNext(true)
  }

  const equals = () => {
    if (!operator) return
    const result = formater(compute(stored, display, operator))
    setDerniere(`${stored} ${operator} ${display} = ${result}`)
    setDisplay(result)
    setStored(null)
    setOperator(null)
    setResetNext(true)
  }

  const press = (b) => {
    if (b === 'C') return clear()
    if (b === '⌫') return backspace()
    if (b === '%') return percent()
    if (b === '=') return equals()
    if (OPERATORS.includes(b)) return chooseOperator(b)
    return inputDigit(b)
  }

  // Ligne du haut : l'opération complète (« 4 + 2 » en cours de saisie, « 4 + 2 = 6 » après « = »).
  const operation = derniere ?? (operator ? (resetNext ? `${stored} ${operator}` : `${stored} ${operator} ${display}`) : '')

  return (
    <div className="w-72 p-3">
      <div className="mb-3 min-h-[5.75rem] overflow-hidden rounded-lg bg-ink-950 px-4 py-3 text-right text-white" aria-live="polite">
        <div className="tabular-nums h-6 truncate text-base text-white/70" data-testid="calc-operation">{operation || '\u00a0'}</div>
        <div className="tabular-nums mt-1 truncate text-3xl font-semibold" data-testid="calc-resultat">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ROWS.flat().map((b, i) => (
          <button
            key={`${b}-${i}`}
            type="button"
            onClick={() => press(b)}
            className={`h-12 rounded-lg text-base font-semibold transition-colors ${b === '=' ? 'col-span-2' : ''} ${
              b === '='
                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                : OPERATORS.includes(b)
                ? 'bg-surface hover:bg-line/40 text-ink-900'
                : ['C', '⌫', '%'].includes(b)
                ? 'bg-surface hover:bg-line/30 text-ink-700'
                : 'bg-white border border-line hover:bg-surface text-ink-900'
            }`}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  )
}
