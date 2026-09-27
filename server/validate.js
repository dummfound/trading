import { Agent } from '@cursor/sdk'
import OpenAI from 'openai'
import { formatHeadlinesForPrompt } from './news.js'

function validateTimeoutMs() {
  const n = Number(process.env.AI_VALIDATE_TIMEOUT_MS)
  return Number.isFinite(n) ? n : 1000
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseValidationJson(raw) {
  const cleaned = String(raw ?? '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match ? match[0] : cleaned)

  const confirmed = Boolean(parsed.confirmed ?? parsed.approve ?? parsed.valid)
  let direction = String(parsed.direction || '').toUpperCase()
  const allowed = new Set(['BUY', 'SELL', 'HOLD'])
  if (!allowed.has(direction)) {
    direction = confirmed ? null : 'HOLD'
  }

  return {
    confirmed,
    direction,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    reason: String(parsed.reason || '').trim(),
  }
}

function buildValidationPrompt(heuristic, headlines, candles) {
  const last = candles[candles.length - 1]
  const newsBlock = formatHeadlinesForPrompt(headlines)

  return `You are a fast BTC/USDT trade-signal validator.
A mathematical heuristic proposed: ${heuristic.direction} (confidence ${heuristic.confidence}).
Heuristic note: ${heuristic.reason}

Latest mark candle close: ${last?.close ?? 'n/a'}

Recent BTC headlines from the web:
${newsBlock}

Decide in ONE shot whether news + context CONFIRM or REJECT that ${heuristic.direction} signal.
Return ONLY compact JSON (no markdown):
{"confirmed":true|false,"direction":"BUY"|"SELL"|"HOLD","confidence":0..1,"reason":"short human Russian explanation for the trader UI"}

Rules:
- If headlines clearly contradict the trade idea, set confirmed=false and direction=HOLD.
- If headlines are neutral/supportive, confirmed=true and keep direction=${heuristic.direction}.
- reason must be human-readable Russian, 1-2 sentences, mention news angle if any.`
}

/**
 * Cursor Pro agent validation (CURSOR_API_KEY).
 * Best-effort — often slower than 1s; raced against timeout by caller.
 */
async function validateWithCursor(prompt) {
  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey) throw new Error('CURSOR_API_KEY missing')

  const modelId = process.env.CURSOR_MODEL || 'composer-2.5'
  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: modelId },
    local: { cwd: process.cwd() },
  })

  if (result.status === 'error') {
    throw new Error(`Cursor agent error: ${result.id}`)
  }

  const text = typeof result.result === 'string'
    ? result.result
    : JSON.stringify(result.result)

  return { ...parseValidationJson(text), provider: 'cursor' }
}

/**
 * Fast OpenAI-compatible validation (AI_API_KEY) — usually fits the 1s budget.
 */
async function validateWithOpenAI(prompt) {
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) throw new Error('AI_API_KEY missing')

  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase()
  const baseURL =
    process.env.AI_BASE_URL ||
    (provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/'
      : undefined)

  const client = new OpenAI({ apiKey, baseURL })
  const completion = await client.chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
    max_tokens: 180,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You validate BTC trade signals using headlines. Reply with strict JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('Empty OpenAI validation')

  return { ...parseValidationJson(content), provider: 'openai' }
}

function firstResolved(promises) {
  return new Promise((resolve) => {
    let left = promises.length
    if (left === 0) {
      resolve(null)
      return
    }

    let settled = false
    for (const p of promises) {
      Promise.resolve(p)
        .then((value) => {
          if (!settled && value) {
            settled = true
            resolve(value)
          }
        })
        .catch((err) => {
          console.warn('[validate] provider failed:', err.message)
        })
        .finally(() => {
          left -= 1
          if (left === 0 && !settled) resolve(null)
        })
    }
  })
}

/**
 * Parallel AI validation of a BUY/SELL heuristic using web headlines.
 * Hard timeout ~1s — on timeout returns null (caller keeps heuristic).
 */
export async function validateHeuristicSignal(
  heuristic,
  candles,
  headlines,
  { timeoutMs } = {},
) {
  const budget = timeoutMs ?? validateTimeoutMs()
  const prompt = buildValidationPrompt(heuristic, headlines, candles)
  const runners = []

  if (process.env.CURSOR_API_KEY) {
    runners.push(validateWithCursor(prompt))
  }
  if (process.env.AI_API_KEY) {
    runners.push(validateWithOpenAI(prompt))
  }

  if (runners.length === 0) {
    console.warn(
      '[validate] No CURSOR_API_KEY / AI_API_KEY — skip AI validation',
    )
    return null
  }

  const winner = await Promise.race([
    firstResolved(runners),
    sleep(budget).then(() => null),
  ])

  if (!winner) {
    console.warn(`[validate] timed out after ${budget}ms`)
    return null
  }

  return winner
}

export { validateTimeoutMs as VALIDATE_TIMEOUT_MS }
