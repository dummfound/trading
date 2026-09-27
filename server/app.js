import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSignal } from './ai.js'
import { backtestLastYears } from './backtest.js'
import {
  executePaperOrder,
  getPaperSnapshot,
  resetPaperAccount,
  setPaperMark,
} from './paper.js'
import { decideTradeEntry } from './decision.js'
import { fetchBtcUsdtKlines } from './market.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true })

export function createApp() {
  const app = express()

  app.use(cors({ origin: true }))
  app.use(express.json({ limit: '1mb' }))

  app.use((req, _res, next) => {
    if (
      req.path.startsWith('/api') &&
      !(req.method === 'GET' && req.path === '/api/paper')
    ) {
      console.log(
        `[api] ${req.method} ${req.path}`,
        req.body?.direction ? `dir=${req.body.direction}` : '',
        req.body?.price != null ? `price=${req.body.price}` : '',
      )
    }
    next()
  })

  async function signalsHandler(req, res) {
    try {
      const candles = req.body?.candles ?? req.query?.candles
      const autoTrade = Boolean(req.body?.autoTrade ?? req.query?.autoTrade)
      const price = Number(req.body?.price ?? req.query?.price)

      let parsed = candles
      if (typeof candles === 'string') {
        parsed = JSON.parse(candles)
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(400).json({
          error: 'candles array is required',
        })
      }

      console.log(`[signals] candles=${parsed.length} autoTrade=${autoTrade}`)
      const signal = await generateSignal(parsed)
      console.log(
        `[signals] → ${signal.direction} conf=${signal.confidence} src=${signal.source ?? 'n/a'}`,
      )

      const account = getPaperSnapshot(
        Number.isFinite(price) && price > 0 ? price : undefined,
      )
      const decision = decideTradeEntry(signal, { account })
      console.log(`[decision] ${decision.action}: ${decision.reason}`)

      let trade = null
      if (
        autoTrade &&
        decision.enter &&
        Number.isFinite(price) &&
        price > 0
      ) {
        trade = executePaperOrder({
          direction: decision.direction,
          price,
          symbol: 'BTCUSDT',
          auto: true,
          decisionReason: decision.reason,
        })
        console.log(
          `[auto] ENTER ${decision.direction} @ ${price} equity=$${trade.account.equity}`,
        )
      }

      return res.json({
        ...signal,
        decision,
        trade,
        account: trade?.account ?? account,
      })
    } catch (error) {
      console.error('[signals]', error)
      return res.status(500).json({
        error: 'Failed to generate signal',
        message: error.message,
      })
    }
  }

  app.get('/api/signals', signalsHandler)
  app.post('/api/signals', signalsHandler)

  /** Paper trading only — no real Bybit deposit/orders */
  app.post('/api/order', (req, res) => {
    try {
      const { direction, symbol = 'BTCUSDT', price } = req.body ?? {}
      const result = executePaperOrder({ direction, symbol, price })
      console.log(
        `[paper] FILL ${direction} @ ${price} → ${result.account.position} equity=$${result.account.equity}`,
      )
      return res.status(200).json(result)
    } catch (error) {
      console.error('[paper] order error:', error.message)
      return res.status(400).json({
        error: error.message,
        mode: 'paper',
      })
    }
  })

  app.get('/api/paper', (req, res) => {
    const mark = req.query.price != null ? Number(req.query.price) : undefined
    return res.json(getPaperSnapshot(mark))
  })

  app.post('/api/paper/mark', (req, res) => {
    const price = Number(req.body?.price)
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'price is required' })
    }
    return res.json(setPaperMark(price))
  })

  app.post('/api/paper/reset', (_req, res) => {
    console.log('[paper] RESET account')
    return res.json(resetPaperAccount())
  })

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'paper',
      deposit: false,
      aiConfigured: Boolean(process.env.AI_API_KEY),
      bybitConfigured: Boolean(
        process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET,
      ),
    })
  })

  /** Proxy public Bybit klines so the browser avoids VPN/proxy blocks */
  app.get('/api/market/klines', async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 50)
      const candles = await fetchBtcUsdtKlines(limit)
      return res.json({ candles })
    } catch (error) {
      console.error('[market] klines', error.message)
      return res.status(502).json({
        error: 'Failed to fetch Bybit klines',
        message: error.message,
      })
    }
  })

  async function backtestHandler(req, res) {
    try {
      const years = Number(req.body?.years ?? req.query?.years ?? 3)
      const startBalance = Number(
        req.body?.startBalance ?? req.query?.startBalance ?? 500,
      )

      console.log(`[backtest] start years=${years} balance=${startBalance}`)
      const result = await backtestLastYears({
        years: Number.isFinite(years) ? Math.min(Math.max(years, 1), 5) : 3,
        startBalance: Number.isFinite(startBalance) ? startBalance : 500,
      })
      console.log(
        `[backtest] done return=${result.summary.totalReturnPct}% trades=${result.summary.trades}`,
      )

      return res.json(result)
    } catch (error) {
      console.error('[backtest]', error)
      return res.status(500).json({
        error: 'Backtest failed',
        message: error.message,
      })
    }
  }

  app.get('/api/backtest', backtestHandler)
  app.post('/api/backtest', backtestHandler)

  return app
}
