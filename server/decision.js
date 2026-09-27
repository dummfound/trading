/**
 * Auto-entry decision for paper trading.
 * ENTER only on clear BUY/SELL; skip HOLD and AI rejections.
 * Env thresholds read at call-time (after dotenv).
 */
function minConfAi() {
  const n = Number(process.env.AUTO_MIN_CONF_AI)
  return Number.isFinite(n) ? n : 0.55
}

function minConfHeuristic() {
  const n = Number(process.env.AUTO_MIN_CONF_HEURISTIC)
  return Number.isFinite(n) ? n : 0.72
}

function cooldownMs() {
  const n = Number(process.env.AUTO_COOLDOWN_MS)
  return Number.isFinite(n) ? n : 3 * 60 * 1000
}

export function decideTradeEntry(signal, { account = null } = {}) {
  const direction = signal?.direction
  const confidence = Number(signal?.confidence) || 0
  const source = signal?.source || 'heuristic'
  const MIN_CONF_AI = minConfAi()
  const MIN_CONF_HEURISTIC = minConfHeuristic()
  const COOLDOWN_MS = cooldownMs()

  if (direction !== 'BUY' && direction !== 'SELL') {
    return {
      action: 'SKIP',
      enter: false,
      reason: 'Сигнал HOLD — войти в сделку не нужно.',
    }
  }

  if (source === 'ai_validated' && signal.validated === false) {
    return {
      action: 'SKIP',
      enter: false,
      reason: `ИИ отклонил ${signal.heuristicDirection || direction}: ${signal.reason}`,
    }
  }

  if (source === 'ai_validated' && signal.validated === true) {
    if (confidence < MIN_CONF_AI) {
      return {
        action: 'SKIP',
        enter: false,
        reason: `ИИ подтвердил, но уверенность ${(confidence * 100).toFixed(0)}% ниже порога ${(MIN_CONF_AI * 100).toFixed(0)}%.`,
      }
    }
  } else if (source === 'heuristic') {
    if (confidence < MIN_CONF_HEURISTIC) {
      return {
        action: 'SKIP',
        enter: false,
        reason: `Только эвристика ${(confidence * 100).toFixed(0)}% — порог ${(MIN_CONF_HEURISTIC * 100).toFixed(0)}%. Ждём ИИ или более сильный сигнал.`,
      }
    }
  } else if (source === 'ai' && confidence < MIN_CONF_AI) {
    return {
      action: 'SKIP',
      enter: false,
      reason: `Слабая уверенность ИИ (${(confidence * 100).toFixed(0)}%).`,
    }
  }

  const targetPos = direction === 'BUY' ? 'LONG' : 'SHORT'
  if (account?.position === targetPos) {
    return {
      action: 'HOLD_POSITION',
      enter: false,
      reason: `Уже в позиции ${direction === 'BUY' ? 'ЛОНГ' : 'ШОРТ'} — повторный вход не нужен.`,
    }
  }

  const last = account?.lastAuto
  if (
    last?.direction === direction &&
    last?.time &&
    Date.now() - Number(last.time) < COOLDOWN_MS
  ) {
    const sec = Math.ceil((COOLDOWN_MS - (Date.now() - Number(last.time))) / 1000)
    return {
      action: 'SKIP',
      enter: false,
      reason: `Кулдаун того же направления ${direction}: ещё ${sec}с.`,
    }
  }

  return {
    action: 'ENTER',
    enter: true,
    direction,
    reason:
      source === 'ai_validated'
        ? `Вход: ИИ подтвердил ${direction} (${(confidence * 100).toFixed(0)}%). ${signal.reason}`
        : `Вход по сильной эвристике ${direction} (${(confidence * 100).toFixed(0)}%). ${signal.reason}`,
  }
}
