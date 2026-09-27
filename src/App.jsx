import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { CryptoChart } from './components/CryptoChart.jsx'
import { PaperAccount } from './components/PaperAccount.jsx'
import { SignalPanel } from './components/SignalPanel.jsx'
import { StatsDashboard } from './components/StatsDashboard.jsx'
import { useBybitWebSocket } from './hooks/useBybitWebSocket.js'
import {
  fetchAiSignal,
  fetchPaperAccount,
  resetPaperAccount,
} from './lib/api.js'

const START_BALANCE = 500
/** Auto scan interval (ms) — shortened for demo AI validation */
const AUTO_INTERVAL_MS = 20_000

export default function App() {
  const { candles, price, connected, error } = useBybitWebSocket()
  const [signal, setSignal] = useState(null)
  const [decision, setDecision] = useState(null)
  const [markers, setMarkers] = useState([])
  const [loadingSignal, setLoadingSignal] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Авторежим · ждём рынок')
  const [paper, setPaper] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [autoEnabled, setAutoEnabled] = useState(true)

  const busyRef = useRef(false)
  const candlesRef = useRef(candles)
  const priceRef = useRef(price)
  candlesRef.current = candles
  priceRef.current = price

  const refreshPaper = useCallback(async (mark) => {
    const account = await fetchPaperAccount(mark ?? undefined)
    setPaper(account)
    return account
  }, [])

  const runAutoCycle = useCallback(async () => {
    const liveCandles = candlesRef.current
    const livePrice = priceRef.current

    if (busyRef.current) return
    if (!liveCandles.length || livePrice == null) {
      setStatusMsg('Авторежим · ждём свечи и цену…')
      return
    }

    busyRef.current = true
    setLoadingSignal(true)
    setStatusMsg('Автоанализ рынка…')

    try {
      const next = await fetchAiSignal(liveCandles, {
        price: livePrice,
        autoTrade: true,
      })

      const {
        decision: dec,
        trade,
        account,
        ...sig
      } = next

      setSignal(sig)
      setDecision(dec)

      if (account) setPaper(account)

      const candleTime = liveCandles[liveCandles.length - 1]?.time
      if (
        candleTime &&
        (sig.direction === 'BUY' || sig.direction === 'SELL')
      ) {
        setMarkers((prev) => [
          ...prev.slice(-19),
          {
            time: candleTime,
            direction: sig.direction,
            confidence: sig.confidence,
            reason: sig.reason,
          },
        ])
      }

      if (trade?.status === 'filled_paper') {
        setStatusMsg(
          `АВТО-ВХОД ${dec.direction} · $${trade.account.equity.toFixed(2)}`,
        )
      } else {
        setStatusMsg(
          `${dec?.action ?? 'SKIP'} · ${sig.direction} ${(sig.confidence * 100).toFixed(0)}% — ${dec?.reason ?? sig.reason}`,
        )
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Ошибка автоцикла')
    } finally {
      setLoadingSignal(false)
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    refreshPaper().catch(() => {})
  }, [refreshPaper])

  useEffect(() => {
    if (price == null) return
    const id = window.setTimeout(() => {
      refreshPaper(price).catch(() => {})
    }, 2000)
    return () => window.clearTimeout(id)
  }, [price, refreshPaper])

  // First tick soon after data arrives, then every AUTO_INTERVAL_MS
  useEffect(() => {
    if (!autoEnabled) return undefined

    let cancelled = false
    const boot = window.setTimeout(() => {
      if (!cancelled) runAutoCycle()
    }, 4000)

    const id = window.setInterval(() => {
      if (!cancelled) runAutoCycle()
    }, AUTO_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearTimeout(boot)
      window.clearInterval(id)
    }
  }, [autoEnabled, runAutoCycle])

  const handleResetPaper = async () => {
    setResetting(true)
    try {
      const account = await resetPaperAccount()
      setPaper(account)
      setStatusMsg('Бумажный счёт сброшен до $500')
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Ошибка сброса')
    } finally {
      setResetting(false)
    }
  }

  const paperEquitySeries = useMemo(() => {
    if (paper?.equitySeries?.length) return paper.equitySeries
    return [{ time: 'старт', equity: START_BALANCE }]
  }, [paper])

  const paperPnl = useMemo(() => {
    const trades = paper?.recentTrades ?? []
    const closed = trades.filter((t) => t.side?.startsWith('CLOSE'))
    if (!closed.length) {
      return [{ day: '—', pnl: 0 }]
    }
    return closed
      .slice(0, 12)
      .reverse()
      .map((t, i) => ({
        day: `Сд.${i + 1}`,
        pnl: Number(t.pnlUsd) || 0,
      }))
  }, [paper])

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto flex min-h-dvh max-w-[1200px] flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:gap-5 sm:p-6 md:p-8">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="chip border-[rgba(192,133,50,0.35)] text-[#c08532]">
                БУМАГА
              </span>
              <span
                className={`chip ${autoEnabled ? 'border-[rgba(129,201,149,0.4)] text-[var(--up)]' : ''}`}
              >
                {autoEnabled ? 'АВТО ВКЛ' : 'АВТО ВЫКЛ'}
              </span>
              <span className="chip">
                {connected ? (
                  <Wifi className="h-3 w-3 text-[var(--up)]" />
                ) : (
                  <WifiOff className="h-3 w-3 text-[var(--down)]" />
                )}
                {connected ? 'Онлайн' : 'Переподключение'}
              </span>
              <span className="chip">{candles.length}/50 свечей</span>
              <button
                type="button"
                onClick={() => setAutoEnabled((v) => !v)}
                className="chip hover:border-[var(--line-strong)]"
              >
                {autoEnabled ? 'Пауза авто' : 'Включить авто'}
              </button>
              <button
                type="button"
                onClick={runAutoCycle}
                disabled={loadingSignal}
                className="chip hover:border-[var(--line-strong)]"
              >
                Сейчас
              </button>
            </div>
            <h1 className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
              Автоторговля на бумаге — без депозита.
            </h1>
            <p className="font-serif mt-2 max-w-xl text-[17px] leading-snug text-[var(--fg-muted)] sm:text-[18px]">
              Бот сам решает: входить или пропустить. Реальный Bybit не
              используется.
            </p>
          </div>

          {price !== null && (
            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[12px] text-[var(--fg-muted)]">BTC/USDT</p>
              <p className="mt-0.5 text-[22px] tracking-[-0.02em]">
                ${price.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
        </header>

        <PaperAccount
          account={paper}
          onReset={handleResetPaper}
          resetting={resetting}
        />

        <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--fg-muted)]">
          <span className="truncate">{statusMsg}</span>
          {price !== null && (
            <span className="sm:hidden">
              ${price.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-[var(--radius-sm)] border border-[rgba(242,139,130,0.25)] bg-[rgba(242,139,130,0.08)] px-3 py-2 text-sm text-[#f28b82]">
            {error}
          </div>
        )}

        <main className="grid flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1.7fr_1fr] lg:grid-rows-[minmax(420px,1.35fr)_auto]">
          <div className="h-[280px] sm:h-[360px] lg:h-auto lg:min-h-[420px]">
            <CryptoChart candles={candles} markers={markers} />
          </div>

          <div className="min-h-[360px] lg:min-h-[420px]">
            <SignalPanel
              signal={signal}
              decision={decision}
              loading={loadingSignal}
              price={price}
              autoEnabled={autoEnabled}
              onScanNow={runAutoCycle}
            />
          </div>

          <div className="lg:col-span-2">
            <StatsDashboard
              equitySeries={paperEquitySeries}
              dailyPnl={paperPnl}
              balance={paper?.equity ?? START_BALANCE}
              winRate={paper?.summary?.winRate ?? 0}
              equityLabel="Капитал бумажной сессии"
              pnlLabel="PnL бумажных сделок"
              summary={
                paper
                  ? {
                      startBalance: paper.startBalance,
                      endBalance: paper.equity,
                      totalPnl: paper.summary.totalPnl,
                      totalReturnPct: paper.summary.totalReturnPct,
                      trades: paper.summary.trades,
                      winRate: paper.summary.winRate,
                      maxDrawdownPct: 0,
                      candles: paper.summary.trades,
                      interval: 'бумага',
                    }
                  : null
              }
            />
          </div>
        </main>
      </div>
    </div>
  )
}
