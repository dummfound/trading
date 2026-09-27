/**
 * Shared trading heuristic used by live signals and historical backtests.
 * Thresholds read at call-time so dotenv in app.js can apply.
 */
function trendThreshold() {
  const raw = Number(process.env.STRATEGY_TREND_PCT)
  return Number.isFinite(raw) ? raw : 0.15
}

export function heuristicSignal(candles) {
  if (!Array.isArray(candles) || candles.length < 3) {
    return {
      direction: 'HOLD',
      confidence: 0.4,
      reason: 'Недостаточно свечей для анализа. Ожидание данных рынка.',
    }
  }

  const thr = trendThreshold()
  const closes = candles.map((c) => Number(c.close))
  const last = closes[closes.length - 1]
  const prev = closes[closes.length - 2]
  const slice = closes.slice(-10)
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length
  const momentum = ((last - prev) / prev) * 100
  const trend = ((last - avg) / avg) * 100

  console.log(
    `[heuristic] trend=${trend.toFixed(4)}% mom=${momentum.toFixed(4)}% thr=±${thr}% last=${last}`,
  )

  if (trend > thr && momentum > 0) {
    return {
      direction: 'BUY',
      confidence: Math.min(0.92, 0.55 + Math.abs(trend) * 0.4),
      reason: `Локальный uptrend: цена выше SMA(${slice.length}) на ${trend.toFixed(3)}%, импульс ${momentum.toFixed(3)}%.`,
      meta: { trend, momentum, threshold: thr },
    }
  }

  if (trend < -thr && momentum < 0) {
    return {
      direction: 'SELL',
      confidence: Math.min(0.92, 0.55 + Math.abs(trend) * 0.4),
      reason: `Локальный downtrend: цена ниже SMA(${slice.length}) на ${Math.abs(trend).toFixed(3)}%, импульс ${momentum.toFixed(3)}%.`,
      meta: { trend, momentum, threshold: thr },
    }
  }

  return {
    direction: 'HOLD',
    confidence: 0.5,
    reason: `Боковой рынок (trend ${trend.toFixed(3)}%, mom ${momentum.toFixed(3)}%, порог ±${thr}%).`,
    meta: { trend, momentum, threshold: thr },
  }
}
