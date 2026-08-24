import { diagnostic, finite, round } from './diagnostics.mjs'
import { indicatorPacket } from './indicators.mjs'

function volumeCapitulation(bars) {
  if (bars.length < 6) return null
  const history = (bars.length >= 70 ? bars.slice(-70, -10) : bars.slice(0, -5)).map((bar) => bar.volume).filter(finite)
  if (history.length === 0) return null
  const average = history.reduce((sum, value) => sum + value, 0) / history.length
  const latestClose = bars.at(-1).close
  return bars.slice(-5).some((bar) =>
    finite(bar.volume) && average > 0 && bar.volume >= average * 2 && bar.low > 0 && latestClose / bar.low - 1 >= 0.03)
}

export function scanSymbol({ symbol, market, bars, held = false, pending = false }) {
  const diagnostics = []
  const packet = indicatorPacket(bars)
  if (!packet || bars.length < 60 || packet.rsi14 === null) {
    diagnostics.push(diagnostic('scanner_history_insufficient', 'unevaluated', 'At least 60 valid bars are required', 'bars', { count: bars?.length ?? 0 }))
    return { candidate: null, diagnostics }
  }
  const capitulation = volumeCapitulation(bars)
  const meanSignals = {
    rsiOversold: packet.rsi14 < 30,
    nearLow: packet.aboveLow200 !== null && packet.aboveLow200 <= 0.05,
    ma200Discount: packet.ma200Distance !== null && packet.ma200Distance <= -0.1,
    ma60Discount: packet.ma60Distance !== null && packet.ma60Distance <= -0.07,
    volumeCapitulation: capitulation,
  }
  const knownMean = Object.values(meanSignals).filter((value) => value !== null)
  const meanCount = knownMean.filter(Boolean).length
  const trendSignals = {
    uptrend: packet.ma200 !== null && packet.close > packet.ma200 && packet.ma50 > packet.ma200,
    pullback: packet.offHigh200 >= -0.2 && packet.offHigh200 <= -0.05,
    healthyRsi: packet.rsi14 >= 35 && packet.rsi14 <= 55,
    notExtended: packet.ma200 !== null && packet.close <= packet.ma200 * 1.4,
  }
  const lenses = []
  if (meanCount >= 2) lenses.push('mean-reversion')
  if (Object.values(trendSignals).every(Boolean)) lenses.push('trend-pullback')
  const discoveryScore = round((meanCount / Math.max(knownMean.length, 1)) * 100, 2)
  return {
    candidate: {
      symbol,
      market,
      held,
      pending,
      eligibleForNewResearch: !held && !pending && lenses.length > 0,
      lenses,
      discoveryScore,
      discoveryScoreMeaning: 'research-priority-only',
      indicators: packet,
      signals: { meanReversion: meanSignals, trendPullback: trendSignals },
    },
    diagnostics,
  }
}

export function relativeStrength(assetBars, benchmarkBars, periods = [20, 60, 120]) {
  const output = {}
  for (const period of periods) {
    if (assetBars.length <= period || benchmarkBars.length <= period) {
      output[`d${period}`] = null
      continue
    }
    const asset = assetBars.at(-1).close / assetBars.at(-(period + 1)).close - 1
    const benchmark = benchmarkBars.at(-1).close / benchmarkBars.at(-(period + 1)).close - 1
    output[`d${period}`] = round(asset - benchmark)
  }
  return output
}
