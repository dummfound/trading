import { Loader2 } from 'lucide-react'

const tone = {
  BUY: {
    label: 'text-[var(--up)]',
    bar: 'bg-[var(--up)]',
    chip: 'border-[rgba(129,201,149,0.35)] text-[var(--up)]',
  },
  SELL: {
    label: 'text-[var(--down)]',
    bar: 'bg-[var(--down)]',
    chip: 'border-[rgba(242,139,130,0.35)] text-[var(--down)]',
  },
  HOLD: {
    label: 'text-[var(--fg)]',
    bar: 'bg-[var(--fg-muted)]',
    chip: 'border-[var(--line-strong)] text-[var(--fg-muted)]',
  },
}

const sourceLabel = {
  heuristic: 'эвристика',
  ai_validated: 'ИИ-валидация',
  ai: 'ИИ',
}

const actionRu = {
  ENTER: 'ВХОД',
  SKIP: 'ПРОПУСК',
  HOLD_POSITION: 'ДЕРЖИМ',
}

export function SignalPanel({
  signal,
  decision,
  loading,
  price,
  autoEnabled,
  onScanNow,
}) {
  const direction = signal?.direction ?? 'HOLD'
  const confidence = signal ? Math.round(signal.confidence * 100) : 0
  const t = tone[direction] ?? tone.HOLD
  const action = decision?.action ?? null

  return (
    <aside className="surface flex h-full flex-col p-4 sm:p-5">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] text-[var(--fg-muted)]">Авто-решение</p>
          <h2 className="mt-0.5 text-[18px] tracking-[-0.01em]">
            {autoEnabled ? 'Бот решает сам' : 'Авто на паузе'}
          </h2>
        </div>
        <span className={`chip ${t.chip}`}>{direction}</span>
      </div>

      <div className="flex flex-1 flex-col items-start justify-center">
        <p className="text-[12px] text-[var(--fg-muted)]">Директива</p>
        <div
          className={`mt-1 text-[56px] font-normal leading-none tracking-[-0.04em] sm:text-[64px] ${t.label}`}
        >
          {direction}
        </div>

        {action && (
          <span
            className={`mt-3 chip ${
              action === 'ENTER'
                ? 'border-[rgba(129,201,149,0.45)] text-[var(--up)]'
                : 'border-[var(--line-strong)]'
            }`}
          >
            {actionRu[action] ?? action}
          </span>
        )}

        <div className="mt-6 w-full max-w-[280px]">
          <div className="mb-1.5 flex justify-between text-[12px] text-[var(--fg-muted)]">
            <span>Уверенность</span>
            <span className="text-[var(--fg)]">{confidence}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-black/25">
            <div
              className={`h-full rounded-full transition-all duration-500 ${t.bar}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>

        <p className="font-serif mt-5 max-w-sm text-[16px] leading-relaxed text-[var(--fg-muted)]">
          {decision?.reason ??
            signal?.reason ??
            'Автоцикл запросит сигнал и сам решит: входить или пропустить.'}
        </p>

        {price !== null && (
          <p className="mt-4 text-[14px] text-[var(--fg)]">
            Цена · $
            {price.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
          </p>
        )}

        {signal?.source && (
          <p className="mt-2 text-[11px] text-[var(--fg-faint)]">
            источник: {sourceLabel[signal.source] ?? signal.source}
            {signal.validated != null
              ? ` · ${signal.validated ? 'подтверждён' : 'отклонён'}`
              : ''}
            {signal.provider ? ` · ${signal.provider}` : ''}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-2.5">
        <button
          type="button"
          onClick={onScanNow}
          disabled={loading}
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Думаю…' : 'Проверить рынок сейчас'}
        </button>

        <p className="px-1 text-[11px] leading-snug text-[var(--fg-faint)]">
          Вход только если ИИ подтвердил BUY/SELL (или очень сильная эвристика).
          HOLD и отклонения — пропуск. Кулдаун 3 мин на то же направление.
        </p>
      </div>
    </aside>
  )
}
