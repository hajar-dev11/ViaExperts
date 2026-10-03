import { useMemo, useState } from 'react'

const RATES = [20, 14, 10, 7, 0]

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export default function TvaCalculatorPanel() {
  const [mode, setMode] = useState('ht')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('20')
  const [customRate, setCustomRate] = useState('')

  const effectiveRate = rate === 'autre' ? Number(customRate || 0) : Number(rate)

  const result = useMemo(() => {
    const a = Number(amount)
    if (amount === '' || Number.isNaN(a) || a < 0 || Number.isNaN(effectiveRate) || effectiveRate < 0) {
      return { ht: 0, tva: 0, ttc: 0 }
    }
    if (mode === 'ht') {
      const ht = a
      const tva = round2(ht * (effectiveRate / 100))
      return { ht: round2(ht), tva, ttc: round2(ht + tva) }
    }
    const ttc = a
    const ht = round2(ttc / (1 + effectiveRate / 100))
    return { ht, tva: round2(ttc - ht), ttc: round2(ttc) }
  }, [amount, effectiveRate, mode])

  const fmt = (n) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Dh`
  const fieldCls = 'w-full rounded-lg border border-line bg-surface/60 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400'

  return (
    <div className="w-80 p-4">
      <div className="flex rounded-lg bg-surface p-1 mb-3 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMode('ht')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${mode === 'ht' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600'}`}
        >
          Je saisis le HT
        </button>
        <button
          type="button"
          onClick={() => setMode('ttc')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${mode === 'ttc' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600'}`}
        >
          Je saisis le TTC
        </button>
      </div>

      <label className="block mb-3">
        <span className="mb-1 block text-xs font-medium text-ink-600">{mode === 'ht' ? 'Montant HT (Dh)' : 'Montant TTC (Dh)'}</span>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={fieldCls} />
      </label>

      <label className="block mb-4">
        <span className="mb-1 block text-xs font-medium text-ink-600">Taux de TVA</span>
        <select value={rate} onChange={(e) => setRate(e.target.value)} className={`${fieldCls} cursor-pointer`}>
          {RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          <option value="autre">Autre…</option>
        </select>
        {rate === 'autre' && (
          <input
            type="number"
            min="0"
            step="0.01"
            value={customRate}
            onChange={(e) => setCustomRate(e.target.value)}
            placeholder="Taux personnalisé (%)"
            className={`${fieldCls} mt-2`}
          />
        )}
      </label>

      <div className="rounded-lg border border-line divide-y divide-line overflow-hidden text-sm">
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface">
          <span className="text-ink-600">Montant HT</span>
          <span className="font-semibold text-ink-900">{fmt(result.ht)}</span>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface">
          <span className="text-ink-600">TVA ({effectiveRate || 0}%)</span>
          <span className="font-semibold text-ink-900">{fmt(result.tva)}</span>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-brand-50">
          <span className="text-brand-700 font-medium">Montant TTC</span>
          <span className="font-bold text-brand-700">{fmt(result.ttc)}</span>
        </div>
      </div>
    </div>
  )
}
