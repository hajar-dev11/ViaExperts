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

export default function CalculatorPanel() {
  const [display, setDisplay] = useState('0')
  const [stored, setStored] = useState(null)
  const [operator, setOperator] = useState(null)
  const [resetNext, setResetNext] = useState(false)

  const inputDigit = (d) => {
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
  }

  const backspace = () => setDisplay((v) => (v.length > 1 ? v.slice(0, -1) : '0'))

  const percent = () => setDisplay((v) => String(parseFloat(v) / 100))

  const chooseOperator = (op) => {
    if (operator && !resetNext) {
      const result = compute(stored, display, operator)
      setStored(String(result))
      setDisplay(String(result))
    } else {
      setStored(display)
    }
    setOperator(op)
    setResetNext(true)
  }

  const equals = () => {
    if (!operator) return
    const result = compute(stored, display, operator)
    setDisplay(Number.isFinite(result) ? String(Math.round(result * 1e8) / 1e8) : 'Erreur')
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

  return (
    <div className="w-64 p-3">
      <div className="rounded-lg bg-ink-950 text-white px-4 py-3.5 mb-3 text-right overflow-hidden">
        <div className="text-2xl font-semibold tabular-nums truncate">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ROWS.flat().map((b, i) => (
          <button
            key={`${b}-${i}`}
            type="button"
            onClick={() => press(b)}
            className={`h-11 rounded-lg text-sm font-semibold transition-colors ${b === '=' ? 'col-span-2' : ''} ${
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
