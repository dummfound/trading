import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

function toError(error, fallback) {
  const data = error.response?.data
  const message =
    (typeof data === 'string' && data) ||
    data?.message ||
    data?.error ||
    error.message ||
    fallback
  return new Error(message)
}

/** Signal + auto decision; set autoTrade=true to enter paper if allowed */
export async function fetchAiSignal(candles, { price, autoTrade = false } = {}) {
  try {
    const { data } = await api.post('/signals', {
      candles,
      price,
      autoTrade,
    })
    return data
  } catch (error) {
    throw toError(error, 'Signal request failed')
  }
}

export async function confirmOrder(payload) {
  try {
    const { data } = await api.post('/order', payload)
    return data
  } catch (error) {
    throw toError(error, 'Order request failed')
  }
}

export async function fetchPaperAccount(price) {
  try {
    const { data } = await api.get('/paper', {
      params: price != null ? { price } : undefined,
    })
    return data
  } catch (error) {
    throw toError(error, 'Paper account fetch failed')
  }
}

export async function resetPaperAccount() {
  try {
    const { data } = await api.post('/paper/reset')
    return data
  } catch (error) {
    throw toError(error, 'Paper reset failed')
  }
}

export default api
