import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const trendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus }
const trendColor = {
  up: 'text-success-700 bg-success-50',
  down: 'text-danger-700 bg-danger-50',
  flat: 'text-ink-700 bg-surface',
}

/**
 * StatCard — indicateur du tableau de bord.
 * API inchangée : label, value, sub, trend, icon.
 */
export default function StatCard({ label, value, sub, trend = 'flat', icon: Icon }) {
  const TIcon = trendIcon[trend] ?? Minus
  return (
    <div className="rounded-xl bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold tracking-wide text-ink-600 uppercase">
          {label}
        </span>
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="tabular mt-3 text-[28px] leading-tight font-semibold text-ink-900">{value}</div>
      {sub && (
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${trendColor[trend]}`}
        >
          <TIcon size={12} /> {sub}
        </div>
      )}
    </div>
  )
}
