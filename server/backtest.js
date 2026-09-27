import { heuristicSignal } from './strategy.js'

const BYBIT_KLINE = 'https://api.bybit.com/v5/market/kline'
const LOOKBACK = 30
const FEE_RATE = 0.00055 // Bybit taker-ish fee per side

/**
 * Fetch BTCUSDT candles from Bybit (paginated, oldest → newest).
 * interval: D = daily (best for multi-year backtests)
 */
export async function fetchBybitHistory({
  symbol = 'BTCUSDT',
  category = 'linear',
  interval = 'D',
  years = 3,
} = {}) {
  const endMs = Date.now()
  const startMs = endMs - years * 365.25 * 24 * 60 * 60 * 1000
  const all = []
  let cursorEnd = endMs

  while (cursorEnd > startMs) {
    const url = new URL(BYBIT_KLINE)
    url.searchParams.set('category', category)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('interval', interval)
    url.searchParams.set('end', String(cursorEnd))
    url.searchParams.set('limit', '1000')

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Bybit kline HTTP ${res.status}`)
    }

    const json = await res.json()
    if (json.retCode !== 0) {
      throw new Error(json.retMsg || 'Bybit kline error')
    }

    const rows = json?.result?.list ?? []
    if (rows.length === 0) break

    // Bybit returns newest → oldest
    for (const row of rows) {
      const timeMs = Number(row[0])
      if (timeMs < startMs) continue
      all.push({
        time: Math.floor(timeMs / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      })
    }

    const oldest = Number(rows[rows.length - 1][0])
    if (oldest <= startMs || rows.length < 1000) break
    cursorEnd = oldest - 1
  }

  const byTime = new Map()
  for (const c of all) byTime.set(c.time, c)
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

function monthKey(unixSec) {
  const d = new Date(unixSec * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1]} ${y.slice(2)}`
}

/**
 * Walk historical candles with the same heuristic used live.
 * Futures-style: BUY → long (+1), SELL → short (-1), HOLD keeps position.
 * Equity marked to market each bar; fees charged on flips.
 */
export function runBacktest(candles, { startBalance = 500 } = {}) {
  if (!candles?.length || candles.length < LOOKBACK + 2) {
    throw new Error('Not enough historical candles for backtest')
  }

  let balance = startBalance
  let position = 0 // -1 short, 0 flat, +1 long
  let entryPrice = 0
  let peak = startBalance
  let maxDrawdown = 0

  const trades = []
  const equityCurve = []
  const monthlyEquity = new Map()

  for (let i = LOOKBACK; i < candles.length; i += 1) {
    const window = candles.slice(i - LOOKBACK, i)
    const bar = candles[i]
    const signal = heuristicSignal(window)
    const price = bar.close

    let target = position
    if (signal.direction === 'BUY') target = 1
    if (signal.direction === 'SELL') target = -1

    if (target !== position) {
      // Close existing
      if (position !== 0) {
        const rawPnlPct = position * ((price - entryPrice) / entryPrice)
        const fee = FEE_RATE
        const netPnlPct = rawPnlPct - fee
        const pnlUsd = balance * netPnlPct
        balance += pnlUsd
        trades.push({
          time: bar.time,
          side: position === 1 ? 'CLOSE_LONG' : 'CLOSE_SHORT',
          price,
          pnlUsd: Number(pnlUsd.toFixed(4)),
          balance: Number(balance.toFixed(2)),
        })
      }

      // Open new
      if (target !== 0) {
        balance -= balance * FEE_RATE
        entryPrice = price
        trades.push({
          time: bar.time,
          side: target === 1 ? 'OPEN_LONG' : 'OPEN_SHORT',
          price,
          pnlUsd: 0,
          balance: Number(balance.toFixed(2)),
          signal: signal.direction,
          confidence: signal.confidence,
        })
      } else {
        entryPrice = 0
      }

      position = target
    }

    // Mark-to-market equity
    let equity = balance
    if (position !== 0 && entryPrice > 0) {
      const unrealized = position * ((price - entryPrice) / entryPrice)
      equity = balance * (1 + unrealized)
    }

    peak = Math.max(peak, equity)
    const dd = peak > 0 ? (peak - equity) / peak : 0
    maxDrawdown = Math.max(maxDrawdown, dd)

    const mk = monthKey(bar.time)
    monthlyEquity.set(mk, equity)

    // Keep a readable equity series (~1 point / week for daily bars)
    if (i === LOOKBACK || i === candles.length - 1 || i % 7 === 0) {
      const d = new Date(bar.time * 1000)
      equityCurve.push({
        time: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
        equity: Number(equity.toFixed(2)),
      })
    }
  }

  // Flatten open position at last close
  const last = candles[candles.length - 1]
  if (position !== 0 && entryPrice > 0) {
    const rawPnlPct = position * ((last.close - entryPrice) / entryPrice)
    const pnlUsd = balance * (rawPnlPct - FEE_RATE)
    balance += pnlUsd
    trades.push({
      time: last.time,
      side: 'FLAT_EOD',
      price: last.close,
      pnlUsd: Number(pnlUsd.toFixed(4)),
      balance: Number(balance.toFixed(2)),
    })
    position = 0
  }

  const closed = trades.filter((t) => t.pnlUsd !== 0 || t.side === 'FLAT_EOD')
  const wins = closed.filter((t) => t.pnlUsd > 0)
  const losses = closed.filter((t) => t.pnlUsd < 0)
  const totalPnl = balance - startBalance

  const monthKeys = [...monthlyEquity.keys()].sort()
  const dailyPnl = []
  let prevEq = startBalance
  for (const key of monthKeys) {
    const eq = monthlyEquity.get(key)
    dailyPnl.push({
      day: monthLabel(key),
      pnl: Number((eq - prevEq).toFixed(2)),
    })
    prevEq = eq
  }

  return {
    meta: {
      symbol: 'BTCUSDT',
      interval: 'D',
      years: 3,
      candles: candles.length,
      lookback: LOOKBACK,
      feeRate: FEE_RATE,
      start: candles[0]?.time,
      end: candles[candles.length - 1]?.time,
      strategy: 'heuristic SMA(10) trend + momentum (same as live fallback)',
    },
    summary: {
      startBalance,
      endBalance: Number(balance.toFixed(2)),
      totalPnl: Number(totalPnl.toFixed(2)),
      totalReturnPct: Number(((totalPnl / startBalance) * 100).toFixed(2)),
      trades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length
        ? Number(((wins.length / closed.length) * 100).toFixed(1))
        : 0,
      maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
    },
    equitySeries: equityCurve,
    monthlyPnl: dailyPnl,
    recentTrades: trades.slice(-20),
  }
}

export async function backtestLastYears({ years = 3, startBalance = 500 } = {}) {
  const candles = await fetchBybitHistory({ years, interval: 'D' })
  const result = runBacktest(candles, { startBalance })
  result.meta.years = years
  result.meta.interval = 'D'
  return result
}
