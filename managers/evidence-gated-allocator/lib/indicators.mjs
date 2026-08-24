import { diagnostic, finite, round } from './diagnostics.mjs'

export function normalizeBars(rows, asOf) {
  const diagnostics = []
  const cutoff = Date.parse(asOf)
  const seen = new Set()
  const bars = []
  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const timestamp = row?.timestamp ?? row?.time ?? row?.date
    const instant = Date.parse(timestamp)
    if (!Number.isFinite(instant)) {
      diagnostics.push(diagnostic('bar_timestamp_invalid', 'unevaluated', 'Bar timestamp is missing or invalid', `bars[${index}].timestamp`))
      continue
    }
    if (instant > cutoff) {
      diagnostics.push(diagnostic('post_as_of_row_dropped', 'info', 'Bar is later than asOf and was dropped', `bars[${index}]`, { timestamp }))
      continue
    }
    if (seen.has(timestamp)) {
      diagnostics.push(diagnostic('duplicate_bar_dropped', 'info', 'Duplicate bar timestamp was dropped', `bars[${index}]`, { timestamp }))
      continue
    }
    const values = ['open', 'high', 'low', 'close'].map((key) => row?.[key])
    if (!values.every(finite) || values.some((value) => value < 0) || row.high < row.low) {
      diagnostics.push(diagnostic('bar_value_invalid', 'unevaluated', 'OHLC values are invalid', `bars[${index}]`))
      continue
    }
    if (row.volume !== undefined && (!finite(row.volume) || row.volume < 0)) {
      diagnostics.push(diagnostic('bar_volume_invalid', 'unevaluated', 'Volume is invalid', `bars[${index}].volume`))
      continue
    }
    seen.add(timestamp)
    bars.push({ timestamp, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume ?? null })
  }
  bars.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  return { bars, diagnostics }
}

export function sma(values, period) {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null
  const window = values.slice(-period)
  return window.every(finite) ? round(window.reduce((sum, value) => sum + value, 0) / period) : null
}

export function rsi(values, period = 14) {
  if (values.length < period + 1) return null
  const gains = []
  const losses = []
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1]
    gains.push(Math.max(change, 0))
    losses.push(Math.max(-change, 0))
  }
  let averageGain = gains.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  let averageLoss = losses.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  for (let index = period; index < gains.length; index += 1) {
    averageGain = (averageGain * (period - 1) + gains[index]) / period
    averageLoss = (averageLoss * (period - 1) + losses[index]) / period
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100
  return round(100 - 100 / (1 + averageGain / averageLoss), 6)
}

export function maxDrawdown(values) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(finite)) return null
  let peak = values[0]
  let worst = 0
  for (const value of values) {
    peak = Math.max(peak, value)
    if (peak > 0) worst = Math.min(worst, value / peak - 1)
  }
  return round(worst)
}

export function indicatorPacket(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null
  const closes = bars.map((bar) => bar.close)
  const latest = bars.at(-1)
  const window200 = bars.slice(-200)
  const high200 = Math.max(...window200.map((bar) => bar.high))
  const low200 = Math.min(...window200.map((bar) => bar.low))
  const ma20 = sma(closes, 20)
  const ma50 = sma(closes, 50)
  const ma60 = sma(closes, 60)
  const ma200 = sma(closes, 200)
  const volumes = bars.map((bar) => bar.volume).filter(finite)
  const legacyVolumeWindow = volumes.length >= 70 ? volumes.slice(-70, -10) : volumes.slice(0, -5)
  const avgVolume20 = legacyVolumeWindow.length
    ? round(legacyVolumeWindow.reduce((sum, value) => sum + value, 0) / legacyVolumeWindow.length)
    : null
  return {
    close: latest.close,
    rsi14: rsi(closes, 14),
    ma20,
    ma50,
    ma60,
    ma200,
    high200: round(high200),
    low200: round(low200),
    offHigh200: high200 > 0 ? round(latest.close / high200 - 1) : null,
    aboveLow200: low200 > 0 ? round(latest.close / low200 - 1) : null,
    ma60Distance: ma60 ? round(latest.close / ma60 - 1) : null,
    ma200Distance: ma200 ? round(latest.close / ma200 - 1) : null,
    avgVolume20,
  }
}
