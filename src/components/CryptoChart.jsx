import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'

function toChartCandle(c) {
  return {
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }
}

export function CryptoChart({ candles, markers = [] }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const markersPluginRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      layout: {
        background: { color: '#1b1913' },
        textColor: 'rgba(237,236,236,0.45)',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(237,236,236,0.04)' },
        horzLines: { color: 'rgba(237,236,236,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(237,236,236,0.08)',
      },
      timeScale: {
        borderColor: 'rgba(237,236,236,0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(237,236,236,0.25)' },
        horzLine: { color: 'rgba(237,236,236,0.25)' },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        pinch: true,
      },
      width: el.clientWidth,
      height: el.clientHeight,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#81c995',
      downColor: '#f28b82',
      borderUpColor: '#81c995',
      borderDownColor: '#f28b82',
      wickUpColor: '#81c995',
      wickDownColor: '#f28b82',
    })

    chartRef.current = chart
    seriesRef.current = series
    markersPluginRef.current = createSeriesMarkers(series, [])

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      chart.applyOptions({ width, height })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      markersPluginRef.current?.detach()
      markersPluginRef.current = null
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || candles.length === 0) return
    series.setData(candles.map(toChartCandle))
    chartRef.current?.timeScale().scrollToRealTime()
  }, [candles])

  useEffect(() => {
    const plugin = markersPluginRef.current
    if (!plugin) return

    plugin.setMarkers(
      markers.map((m) => ({
        time: m.time,
        position: m.direction === 'BUY' ? 'belowBar' : 'aboveBar',
        color: m.direction === 'BUY' ? '#81c995' : '#f28b82',
        shape: m.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: m.direction,
      })),
    )
  }, [markers])

  return (
    <div className="surface relative h-full min-h-[260px] w-full overflow-hidden sm:min-h-[320px]">
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <span className="chip">BTC/USDT · 1м</span>
      </div>
      <div ref={containerRef} className="h-full w-full touch-pan-x" />
    </div>
  )
}
