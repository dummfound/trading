# NeonDesk · AI Trading Dashboard

Полуавтоматический AI-трейдинг терминал: **React + Vite + Tailwind**, live-свечи Bybit, ИИ-сигналы через локальный Express API.

## Архитектура

```
TRADE/
├── server/                 # Локальный бэкенд (секреты только здесь)
│   ├── index.js            # Express: /api/signals, /api/order
│   └── ai.js               # Обёртка OpenAI / Gemini + heuristic fallback
├── src/
│   ├── App.jsx             # Киберпанк-сетка (адаптив под мобилу)
│   ├── components/
│   │   ├── CryptoChart.jsx
│   │   ├── SignalPanel.jsx
│   │   └── StatsDashboard.jsx
│   ├── hooks/useBybitWebSocket.js
│   └── lib/api.js
├── .env.example
└── vite.config.js
```

### Библиотеки по назначению

| Библиотека | Роль |
|---|---|
| `lightweight-charts` | Главный график японских свечей BTC/USDT + стрелки входа |
| `recharts` | Equity (Area) и Daily PnL (Bar) внизу панели |
| `lucide-react` | Иконки UI |

### API

- `GET|POST /api/signals` — история свечей → `{ direction, confidence, reason }`
- `POST /api/order` — stub ордера Bybit (ключи остаются в `.env`)

## Запуск

```bash
cp .env.example .env
# заполните AI_API_KEY и при необходимости BYBIT_*

npm install
npm run dev
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:3001  

## AI validation (BUY/SELL only)

1. Heuristic fires first.
2. Parallel: BTC headlines (CryptoCompare) + Cursor Pro (`CURSOR_API_KEY`) and/or OpenAI (`AI_API_KEY`).
3. Hard deadline `AI_VALIDATE_TIMEOUT_MS` (default 1000ms).
4. Success → `source: "ai_validated"` + Russian `reason` for the UI.
5. Timeout / no keys → keep `source: "heuristic"`.

Put `CURSOR_API_KEY` from [Cursor Dashboard](https://cursor.com/dashboard) into `.env`, restart `npm run dev`.

## Bybit WebSocket

Публичный поток: `wss://stream.bybit.com/v5/public/linear`  
Топик: `kline.1.BTCUSDT` (в v5 интервал `1` = 1 минута).  
Хук держит последние **50** свечей и обновляет цену без лагов.
