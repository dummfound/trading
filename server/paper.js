import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, 'data')
const STORE_PATH = path.join(DATA_DIR, 'paper-account.json')

const START_BALANCE = 500
const FEE_RATE = 0.00055
/** Fraction of equity used as position notional */
const NOTIONAL_PCT = 0.1

function emptyAccount() {
  return {
    mode: 'paper',
    startBalance: START_BALANCE,
    cash: START_BALANCE,
    position: 0, // -1 short, 0 flat, +1 long
    entryPrice: 0,
    notional: 0,
    markPrice: null,
    realizedPnl: 0,
    feesPaid: 0,
    trades: [],
    equityCurve: [{ time: new Date().toISOString(), equity: START_BALANCE }],
    lastAuto: null,
    updatedAt: new Date().toISOString(),
  }
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(emptyAccount(), null, 2))
  }
}

function readAccount() {
  ensureStore()
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
}

function writeAccount(account) {
  ensureStore()
  account.updatedAt = new Date().toISOString()
  fs.writeFileSync(STORE_PATH, JSON.stringify(account, null, 2))
  return account
}

function markEquity(account, markPrice) {
  const price = Number(markPrice)
  if (!Number.isFinite(price) || price <= 0) {
    return account.cash
  }

  if (account.position === 0 || !account.entryPrice) {
    return account.cash
  }

  const pnlPct = account.position * ((price - account.entryPrice) / account.entryPrice)
  return account.cash + account.notional * pnlPct
}

function pushEquityPoint(account, equity) {
  const point = {
    time: new Date().toISOString().slice(0, 16).replace('T', ' '),
    equity: Number(equity.toFixed(2)),
  }
  const last = account.equityCurve[account.equityCurve.length - 1]
  if (last && last.time === point.time) {
    last.equity = point.equity
  } else {
    account.equityCurve.push(point)
    if (account.equityCurve.length > 500) {
      account.equityCurve = account.equityCurve.slice(-500)
    }
  }
}

export function getPaperSnapshot(markPrice) {
  const account = readAccount()
  if (markPrice != null) account.markPrice = Number(markPrice)

  const equity = markEquity(account, account.markPrice)
  const unrealized =
    account.position !== 0 && account.entryPrice && account.markPrice
      ? equity - account.cash
      : 0

  const closed = account.trades.filter((t) => t.pnlUsd != null && t.side.startsWith('CLOSE'))
  const wins = closed.filter((t) => t.pnlUsd > 0)
  const totalReturnPct = ((equity - account.startBalance) / account.startBalance) * 100

  return {
    mode: 'paper',
    deposit: false,
    startBalance: account.startBalance,
    cash: Number(account.cash.toFixed(2)),
    equity: Number(equity.toFixed(2)),
    unrealizedPnl: Number(unrealized.toFixed(2)),
    realizedPnl: Number(account.realizedPnl.toFixed(2)),
    feesPaid: Number(account.feesPaid.toFixed(4)),
    position:
      account.position === 1 ? 'LONG' : account.position === -1 ? 'SHORT' : 'FLAT',
    entryPrice: account.entryPrice || null,
    notional: Number(account.notional.toFixed(2)),
    markPrice: account.markPrice,
    risk: {
      notionalPct: NOTIONAL_PCT * 100,
      feeRate: FEE_RATE,
    },
    summary: {
      trades: closed.length,
      wins: wins.length,
      losses: closed.length - wins.length,
      winRate: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0,
      totalReturnPct: Number(totalReturnPct.toFixed(2)),
      totalPnl: Number((equity - account.startBalance).toFixed(2)),
    },
    equitySeries: account.equityCurve,
    recentTrades: account.trades.slice(-20).reverse(),
    lastAuto: account.lastAuto ?? null,
    updatedAt: account.updatedAt,
  }
}

export function resetPaperAccount() {
  return getPaperSnapshot(writeAccount(emptyAccount()).markPrice)
}

export function setPaperMark(markPrice) {
  const account = readAccount()
  account.markPrice = Number(markPrice)
  const equity = markEquity(account, account.markPrice)
  pushEquityPoint(account, equity)
  writeAccount(account)
  return getPaperSnapshot(account.markPrice)
}

/**
 * Paper fill at mark price. BUY → long, SELL → short (flip if needed).
 */
export function executePaperOrder({
  direction,
  price,
  symbol = 'BTCUSDT',
  auto = false,
  decisionReason = null,
}) {
  const side = String(direction).toUpperCase()
  if (!['BUY', 'SELL'].includes(side)) {
    throw new Error('direction must be BUY or SELL')
  }

  const fillPrice = Number(price)
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
    throw new Error('Valid mark price is required for paper fill')
  }

  const account = readAccount()
  account.markPrice = fillPrice
  const target = side === 'BUY' ? 1 : -1
  const ts = Date.now()
  const fills = []

  // Close opposite / existing if flipping or flat target different
  if (account.position !== 0 && account.position !== target) {
    const pnlPct =
      account.position * ((fillPrice - account.entryPrice) / account.entryPrice)
    const fee = account.notional * FEE_RATE
    const pnlUsd = account.notional * pnlPct - fee
    account.cash += account.notional * pnlPct
    account.cash -= fee
    account.realizedPnl += pnlUsd
    account.feesPaid += fee

    const closeTrade = {
      id: `paper_${ts}_close`,
      time: ts,
      symbol,
      side: account.position === 1 ? 'CLOSE_LONG' : 'CLOSE_SHORT',
      price: fillPrice,
      notional: Number(account.notional.toFixed(2)),
      pnlUsd: Number(pnlUsd.toFixed(4)),
      mode: 'paper',
      auto: Boolean(auto),
    }
    account.trades.push(closeTrade)
    fills.push(closeTrade)

    account.position = 0
    account.entryPrice = 0
    account.notional = 0
  }

  if (account.position === 0) {
    const equity = account.cash
    const notional = equity * NOTIONAL_PCT
    const fee = notional * FEE_RATE
    account.cash -= fee
    account.feesPaid += fee
    account.position = target
    account.entryPrice = fillPrice
    account.notional = notional

    const openTrade = {
      id: `paper_${ts}_open`,
      time: ts,
      symbol,
      side: target === 1 ? 'OPEN_LONG' : 'OPEN_SHORT',
      price: fillPrice,
      notional: Number(notional.toFixed(2)),
      pnlUsd: 0,
      signal: side,
      mode: 'paper',
      auto: Boolean(auto),
    }
    account.trades.push(openTrade)
    fills.push(openTrade)
  }

  if (auto && fills.length) {
    account.lastAuto = {
      direction: side,
      time: ts,
      reason: decisionReason,
      price: fillPrice,
    }
  }

  const equity = markEquity(account, fillPrice)
  pushEquityPoint(account, equity)
  writeAccount(account)

  return {
    status: 'filled_paper',
    mode: 'paper',
    deposit: false,
    auto: Boolean(auto),
    message: auto
      ? 'Авто-вход (бумага) — реальный Bybit не трогаем.'
      : 'Paper fill — no real funds sent to Bybit.',
    fills,
    account: getPaperSnapshot(fillPrice),
  }
}
