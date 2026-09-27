import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_CANDLES = 50
const POLL_MS = 5000

function upsertCandle(list, next) {
  if (list.length === 0) return [next]

  const last = list[list.length - 1]
  if (last.time === next.time) {
    const copy = list.slice()
    copy[copy.length - 1] = next
    return copy
  }

  if (next.time > last.time) {
    const copy = list.concat(next)
    return copy.length > MAX_CANDLES ? copy.slice(-MAX_CANDLES) : copy
  }

  return list
}

function mergeCandles(prev, incoming) {
  if (!incoming?.length) return prev
  if (!prev.length) return incoming.slice(-MAX_CANDLES)

  let next = prev
  for (const candle of incoming) {
    next = upsertCandle(next, candle)
  }
  return next
}

/** Local Express → Bybit (browser never talks to Bybit directly) */
async function fetchSeedCandles() {
  const res = await fetch('/api/market/klines?limit=50')
  if (!res.ok) throw new Error(`Market proxy ${res.status}`)

  const json = await res.json()
  const candles = json?.candles ?? []
  return candles.slice(-MAX_CANDLES)
}

export function useBybitWebSocket() {
  const [candles, setCandles] = useState([])
  const [price, setPrice] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)

  const pollTimer = useRef(null)
  const alive = useRef(true)

  const pollOnce = useCallback(async () => {
    if (!alive.current) return
    try {
      const seed = await fetchSeedCandles()
      if (!alive.current || seed.length === 0) return
      setCandles((prev) => mergeCandles(prev, seed))
      setPrice(seed[seed.length - 1].close)
      setConnected(true)
      setError(null)
    } catch (err) {
      if (!alive.current) return
      setConnected(false)
      setError(err.message || 'Failed to fetch candles')
    }
  }, [])

  useEffect(() => {
    alive.current = true
    pollOnce()
    pollTimer.current = window.setInterval(pollOnce, POLL_MS)

    return () => {
      alive.current = false
      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [pollOnce])

  return { candles, price, connected, error }
}
