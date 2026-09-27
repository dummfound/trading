const BYBIT_KLINE =
  'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&limit=50'

/**
 * Public Bybit klines — fetched server-side so the browser
 * does not depend on VPN/proxy reachability to Bybit.
 */
export async function fetchBtcUsdtKlines(limit = 50) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const url = `${BYBIT_KLINE.replace('limit=50', `limit=${capped}`)}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Bybit REST ${res.status}`)
  }

  const json = await res.json()
  if (json.retCode !== 0) {
    throw new Error(json.retMsg || 'Bybit kline error')
  }

  const rows = json?.result?.list ?? []
  return rows
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .reverse()
}
