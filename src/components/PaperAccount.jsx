const positionRu = {
  LONG: 'ЛОНГ',
  SHORT: 'ШОРТ',
  FLAT: 'ВНЕ РЫНКА',
}

export function PaperAccount({ account, onReset, resetting }) {
  if (!account) {
    return (
      <div className="surface px-4 py-3 text-[13px] text-[var(--fg-muted)]">
        Загрузка бумажного счёта…
      </div>
    )
  }

  const posColor =
    account.position === 'LONG'
      ? 'text-[var(--up)]'
      : account.position === 'SHORT'
        ? 'text-[var(--down)]'
        : 'text-[var(--fg-muted)]'

  return (
    <div className="surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="chip border-[rgba(192,133,50,0.35)] text-[#c08532]">
            БУМАГА
          </span>
          <span className="text-[12px] text-[var(--fg-muted)]">
            Без депозита · виртуальные ${account.startBalance}
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          className="chip hover:border-[var(--line-strong)]"
        >
          {resetting ? 'Сброс…' : 'Сбросить счёт'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Капитал" value={`$${account.equity.toFixed(2)}`} />
        <Stat
          label="Доходность"
          value={`${account.summary.totalReturnPct >= 0 ? '+' : ''}${account.summary.totalReturnPct}%`}
          tone={account.summary.totalReturnPct >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Позиция"
          value={positionRu[account.position] ?? account.position}
          className={posColor}
        />
        <Stat
          label="Нереализ. PnL"
          value={`${account.unrealizedPnl >= 0 ? '+' : ''}$${account.unrealizedPnl.toFixed(2)}`}
          tone={account.unrealizedPnl >= 0 ? 'up' : 'down'}
        />
      </div>

      <p className="mt-3 text-[11px] text-[var(--fg-faint)]">
        Размер {account.risk.notionalPct}% капитала · комиссия{' '}
        {(account.risk.feeRate * 100).toFixed(3)}% · сделок{' '}
        {account.summary.trades} · винрейт {account.summary.winRate}%
      </p>
    </div>
  )
}

function Stat({ label, value, tone, className = '' }) {
  const color =
    tone === 'up'
      ? 'text-[var(--up)]'
      : tone === 'down'
        ? 'text-[var(--down)]'
        : className || 'text-[var(--fg)]'

  return (
    <div>
      <p className="text-[11px] text-[var(--fg-muted)]">{label}</p>
      <p className={`mt-0.5 text-[18px] tracking-[-0.02em] ${color}`}>{value}</p>
    </div>
  )
}
