import { heuristicSignal } from './strategy.js'
import { fetchBtcHeadlines } from './news.js'
import { validateHeuristicSignal, VALIDATE_TIMEOUT_MS } from './validate.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timeoutBudget() {
  return typeof VALIDATE_TIMEOUT_MS === 'function'
    ? VALIDATE_TIMEOUT_MS()
    : Number(VALIDATE_TIMEOUT_MS) || 1000
}

/**
 * 1) Always compute mathematical heuristic.
 * 2) On BUY/SELL: parallel BTC news fetch + Cursor Pro / OpenAI validation.
 * 3) On success → source: ai_validated + human Russian reason.
 */
export async function generateSignal(candles) {
  const heuristic = {
    ...heuristicSignal(candles),
    source: 'heuristic',
  }

  if (heuristic.direction !== 'BUY' && heuristic.direction !== 'SELL') {
    console.log(
      `[signals] HOLD — skip AI (trend=${heuristic.meta?.trend?.toFixed?.(4) ?? '?'}% mom=${heuristic.meta?.momentum?.toFixed?.(4) ?? '?'}%)`,
    )
    return heuristic
  }

  const budget = timeoutBudget()
  const deadline = Date.now() + budget
  console.log(
    `[signals] heuristic ${heuristic.direction} → AI validate (≤${budget}ms)`,
  )

  try {
    // News in parallel, but don't burn the whole budget waiting for it
    const headlines = await Promise.race([
      fetchBtcHeadlines({ limit: 8, timeoutMs: 600 }),
      sleep(500).then(() => []),
    ])
    console.log(`[news] headlines=${headlines.length}`)

    const remaining = Math.max(150, deadline - Date.now())
    const validation = await validateHeuristicSignal(
      heuristic,
      candles,
      headlines,
      { timeoutMs: remaining },
    )

    if (!validation) {
      return {
        ...heuristic,
        warning: `AI validation timed out after ${budget}ms`,
        headlinesUsed: headlines.length,
      }
    }

    const confirmed = validation.confirmed
    const direction = confirmed
      ? heuristic.direction
      : validation.direction === 'BUY' || validation.direction === 'SELL'
        ? validation.direction
        : 'HOLD'

    const confidence = confirmed
      ? Math.max(
          heuristic.confidence,
          validation.confidence || heuristic.confidence,
        )
      : Math.min(validation.confidence || 0.45, 0.55)

    const reason =
      validation.reason ||
      (confirmed
        ? `ИИ подтвердил ${heuristic.direction} по новостному фону.`
        : `ИИ опроверг ${heuristic.direction}: новостной фон против сигнала.`)

    const result = {
      direction,
      confidence,
      reason,
      source: 'ai_validated',
      validated: confirmed,
      heuristicDirection: heuristic.direction,
      provider: validation.provider,
      headlinesUsed: headlines.length,
    }

    console.log(
      `[signals] ai_validated confirmed=${confirmed} → ${direction} via ${validation.provider}`,
    )

    return result
  } catch (error) {
    console.error('[signals] validation pipeline error:', error.message)
    return {
      ...heuristic,
      warning: error.message,
    }
  }
}
