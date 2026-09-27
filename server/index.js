import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Must load .env before other server modules read process.env
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
  quiet: true,
})

const { createApp } = await import('./app.js')

const PORT = Number(process.env.PORT) || 3001
const app = createApp()

const server = app.listen(PORT, () => {
  console.log('')
  console.log('══════════════════════════════════════')
  console.log(`  PAPER API  http://localhost:${PORT}`)
  console.log(
    `  Demo thr=±${process.env.STRATEGY_TREND_PCT || '0.15'}%  AI timeout=${process.env.AI_VALIDATE_TIMEOUT_MS || 1000}ms`,
  )
  console.log('  Endpoints: /api/signals /api/order /api/paper /api/market/klines')
  console.log('══════════════════════════════════════')
  console.log('')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} busy. Kill it and retry:`)
    console.error(`  netstat -ano | findstr :${PORT}`)
    console.error('  taskkill /PID <pid> /F')
  } else {
    console.error('[server] listen error:', err)
  }
  process.exit(1)
})
