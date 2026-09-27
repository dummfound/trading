/**
 * Fast BTC headline fetch for AI signal validation.
 * Uses public CryptoCompare news (no API key required for basic access).
 */
export async function fetchBtcHeadlines({ limit = 8, timeoutMs = 800 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url =
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,Marketplace'

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`news HTTP ${res.status}`)

    const json = await res.json()
    const items = Array.isArray(json?.Data) ? json.Data : []

    return items.slice(0, limit).map((item) => ({
      title: String(item.title || '').trim(),
      source: String(item.source_info?.name || item.source || 'unknown'),
      published: item.published_on
        ? new Date(item.published_on * 1000).toISOString()
        : null,
      url: item.url || null,
    })).filter((h) => h.title)
  } catch (error) {
    console.warn('[news] fetch failed:', error.message)
    return []
  } finally {
    clearTimeout(timer)
  }
}

export function formatHeadlinesForPrompt(headlines) {
  if (!headlines.length) {
    return 'No fresh headlines available (news fetch timed out or empty).'
  }

  return headlines
    .map((h, i) => `${i + 1}. [${h.source}] ${h.title}`)
    .join('\n')
}
