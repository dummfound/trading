import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const tooltipStyle = {
  backgroundColor: '#1b1913',
  border: '1px solid rgba(237,236,236,0.12)',
  borderRadius: 8,
  color: '#edeced',
  fontSize: 12,
}

export function StatsDashboard({
  equitySeries,
  dailyPnl,
  balance,
  winRate,
  summary = null,
  equityLabel = 'Капитал',
  pnlLabel = 'Месячный PnL',
}) {
  const start = summary?.startBalance ?? equitySeries[0]?.equity ?? 500
  const growth =
    summary?.totalReturnPct ?? ((balance - start) / start) * 100

  const pnlData = dailyPnl.length > 18 ? dailyPnl.slice(-18) : dailyPnl

  return (
    <section className="grid gap-3 sm:gap-4">
      {summary && (
        <div className="surface grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Metric
            label="Доходность"
            value={`${growth >= 0 ? '+' : ''}${Number(growth).toFixed(1)}%`}
            tone={growth >= 0 ? 'up' : 'down'}
          />
          <Metric
            label="Итог. баланс"
            value={`$${Number(balance).toFixed(0)}`}
          />
          <Metric
            label="Винрейт"
            value={`${Number(winRate).toFixed(0)}%`}
          />
          <Metric
            label="Макс. просадка"
            value={`${Number(summary.maxDrawdownPct ?? 0).toFixed(1)}%`}
            tone="down"
          />
          <Metric label="Сделки" value={String(summary.trades)} />
          <Metric
            label="PnL"
            value={`${summary.totalPnl >= 0 ? '+' : ''}$${Number(summary.totalPnl).toFixed(0)}`}
            tone={summary.totalPnl >= 0 ? 'up' : 'down'}
          />
          <Metric label="Свечи" value={String(summary.candles ?? '—')} />
          <Metric label="Режим" value={summary.interval ?? '—'} />
        </div>
      )}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <div className="surface flex min-h-[200px] flex-col p-4 sm:min-h-[220px]">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[12px] text-[var(--fg-muted)]">{equityLabel}</p>
              <h3 className="mt-0.5 text-[22px] tracking-[-0.02em]">
                ${Number(balance).toFixed(2)}
              </h3>
            </div>
            <span
              className={`text-[14px] ${
                growth >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'
              }`}
            >
              {growth >= 0 ? '+' : ''}
              {Number(growth).toFixed(2)}%
            </span>
          </div>

          <div className="h-[160px] w-full sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equitySeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#edeced" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#edeced" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(237,236,236,0.04)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: 'rgba(237,236,236,0.35)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tick={{ fill: 'rgba(237,236,236,0.35)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    `$${Number(value).toFixed(2)}`,
                    'Капитал',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#edeced"
                  strokeWidth={1.5}
                  fill="url(#equityFill)"
                  isAnimationActive
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface flex min-h-[200px] flex-col p-4 sm:min-h-[220px]">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[12px] text-[var(--fg-muted)]">{pnlLabel}</p>
              <h3 className="mt-0.5 text-[22px] tracking-[-0.02em]">
                Винрейт {Number(winRate).toFixed(0)}%
              </h3>
            </div>
          </div>

          <div className="h-[160px] w-full sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(237,236,236,0.04)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'rgba(237,236,236,0.35)', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: 'rgba(237,236,236,0.35)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    `${Number(value) >= 0 ? '+' : ''}$${Number(value).toFixed(2)}`,
                    'PnL',
                  ]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700}>
                  {pnlData.map((entry, index) => (
                    <Cell
                      key={`${entry.day}-${index}`}
                      fill={entry.pnl >= 0 ? '#81c995' : '#f28b82'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, tone }) {
  const color =
    tone === 'up'
      ? 'text-[var(--up)]'
      : tone === 'down'
        ? 'text-[var(--down)]'
        : 'text-[var(--fg)]'

  return (
    <div>
      <p className="text-[11px] text-[var(--fg-muted)]">{label}</p>
      <p className={`mt-0.5 text-[18px] tracking-[-0.02em] ${color}`}>{value}</p>
    </div>
  )
}
