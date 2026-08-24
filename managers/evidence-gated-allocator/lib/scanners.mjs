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

function returnOver(bars, period) {
  if (!Array.isArray(bars) || bars.length <= period || !finite(bars.at(-(period + 1))?.close) || bars.at(-(period + 1)).close === 0) return null
  return bars.at(-1).close / bars.at(-(period + 1)).close - 1
}

export function opportunityMetrics({ symbol, market, sector = 'unclassified', bars = [], held = false, pending = false }) {
  const diagnostics = []
  const packet = indicatorPacket(bars)
  if (!packet || bars.length < 20) {
    diagnostics.push(diagnostic('opportunity_history_insufficient', 'unevaluated', 'At least 20 bars are required', 'bars', { count: bars.length }))
    return { data: null, diagnostics }
  }
  const latest = bars.at(-1)
  const closes = bars.map((row) => row.close)
  const priorVolumes = bars.slice(0, -1).slice(-20).map((row) => row.volume).filter(finite)
  const averageVolume = priorVolumes.length ? priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length : null
  const technicalSignals = []
  if (packet.rsi14 !== null && packet.rsi14 < 30) technicalSignals.push('rsi-below-30')
  if (packet.ma200Distance !== null && packet.ma200Distance <= -0.1) technicalSignals.push('ma200-discount-10pct')
  if (packet.ma60Distance !== null && packet.ma60Distance <= -0.07) technicalSignals.push('ma60-discount-7pct')
  if (packet.aboveLow200 !== null && packet.aboveLow200 <= 0.05) technicalSignals.push('near-200d-low')
  if (closes.length >= 20) {
    const window = closes.slice(-20)
    const mean = window.reduce((sum, value) => sum + value, 0) / window.length
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length
    if (latest.close <= mean - 2 * Math.sqrt(variance)) technicalSignals.push('bollinger-lower-band')
  }
  const volumeSignals = []
  const volumeRatio = finite(latest.volume) && finite(averageVolume) && averageVolume > 0 ? latest.volume / averageVolume : null
  if (finite(volumeRatio) && volumeRatio >= 2) volumeSignals.push('volume-at-least-2x')
  const rebound = latest.low > 0 ? latest.close / latest.low - 1 : null
  if (finite(rebound) && rebound >= 0.03) volumeSignals.push('intraday-rebound-at-least-3pct')
  if (closes.length >= 4) {
    const recent = closes.slice(-4)
    if (Math.max(...recent) / Math.min(...recent) - 1 <= 0.02) volumeSignals.push('recent-price-stabilization')
  }
  return {
    data: {
      symbol, market, sector, held, pending,
      eligibleForNewResearch: !held && !pending,
      indicators: packet,
      return20: round(returnOver(bars, 20)),
      return60: round(returnOver(bars, 60)),
      volumeRatio20: round(volumeRatio, 4),
      reboundFromLow: round(rebound, 4),
      technicalSignals,
      volumeSignals,
      technicalScore: round(Math.min(30, 30 * technicalSignals.length / 5), 1),
      volumeScore: round(Math.min(25, 25 * volumeSignals.length / 3), 1),
    },
    diagnostics,
  }
}

export function opportunityUniverse({ rows = [] }) {
  const diagnostics = []
  const usable = rows.filter((row) => row && typeof row.sector === 'string')
  const sectors = new Map()
  for (const row of usable) {
    if (!sectors.has(row.sector)) sectors.set(row.sector, [])
    sectors.get(row.sector).push(row)
  }
  const averages = new Map([...sectors].map(([sector, members]) => {
    const average = (field) => {
      const values = members.map((row) => row[field]).filter(finite)
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    }
    return [sector, { return20: average('return20'), return60: average('return60') }]
  }))
  const ranked = usable.map((row) => {
    const sector = averages.get(row.sector)
    let sectorScore = 0
    const sectorSignals = []
    if (finite(sector.return60) && sector.return60 <= -0.08) { sectorScore += 8; sectorSignals.push('weak-sector-contrarian') }
    if (finite(sector.return20) && finite(row.return20) && row.return20 > sector.return20) { sectorScore += 6; sectorSignals.push('sector-relative-strength-20d') }
    if (finite(sector.return60) && sector.return60 >= 0.08 && finite(row.return20) && row.return20 <= -0.05) { sectorScore += 8; sectorSignals.push('strong-sector-pullback') }
    if (finite(sector.return60) && finite(row.return60) && row.return60 > sector.return60) { sectorScore += 4; sectorSignals.push('sector-relative-strength-60d') }
    sectorScore = Math.min(20, sectorScore)
    const score = round((row.technicalScore ?? 0) + (row.volumeScore ?? 0) + sectorScore, 1)
    const ratio = score / 75
    const category = ratio >= 0.8 ? 'very_high' : ratio >= 0.7 ? 'high' : ratio >= 0.5 ? 'middle' : 'skip'
    return {
      ...row,
      sectorScore,
      sectorSignals,
      sectorAverage20: round(sector.return20),
      sectorAverage60: round(sector.return60),
      earningsScore: 0,
      valuationScore: 0,
      score,
      maximumAutomatedScore: 75,
      scoreFraction: round(ratio, 4),
      category,
      scoreMeaning: 'research-priority-only',
    }
  }).sort((a, b) => b.score - a.score || String(a.symbol).localeCompare(String(b.symbol)))
  return { data: { rows: ranked, sectorAverages: Object.fromEntries(averages) }, diagnostics }
}

export function trendState({ symbol, bars = [] }) {
  const diagnostics = []
  if (bars.length < 200) {
    diagnostics.push(diagnostic('trend_history_insufficient', 'unevaluated', 'MA200 requires 200 bars', 'bars', { count: bars.length }))
    return { data: { symbol, state: 'insufficient_data', bars: bars.length }, diagnostics }
  }
  const packet = indicatorPacket(bars)
  const closes = bars.map((row) => row.close)
  const offHighPct = packet.offHigh200 * 100
  const extensionPct = packet.ma200Distance * 100
  const uptrend = packet.close > packet.ma200 && packet.ma50 > packet.ma200
  const pullback = uptrend && (packet.close < packet.ma20 || (offHighPct >= -15 && offHighPct <= -5))
  const broken = closes.at(-1) < packet.ma200 && closes.at(-2) < packet.ma200
  const deep = offHighPct < -20
  let state
  let trancheGuidance
  if (broken) [state, trancheGuidance] = ['BROKEN', 'stop']
  else if (!uptrend) [state, trancheGuidance] = ['DOWNTREND', 'stop']
  else if (pullback) [state, trancheGuidance] = [deep ? 'DEEP_PULLBACK_TREND_INTACT' : 'PULLBACK_IN_UPTREND', extensionPct > 30 || deep ? 'half' : 'full']
  else [state, trancheGuidance] = ['UPTREND', 'small_or_wait']
  return {
    data: {
      symbol, state, trancheGuidance,
      close: packet.close, ma20: packet.ma20, ma50: packet.ma50, ma200: packet.ma200,
      offHighPct: round(offHighPct, 2), extensionPct: round(extensionPct, 2),
      goldenCross: packet.ma50 > packet.ma200,
      extended: extensionPct > 30,
      deepDrawdown: deep,
      deepDrawdownCappedToHalf: state === 'DEEP_PULLBACK_TREND_INTACT' && trancheGuidance === 'half',
      stopNewTranchesBelow: packet.ma200,
      meaning: 'drawdown-control-not-return-edge',
    },
    diagnostics,
  }
}

export function blendedSectorStrength(assetBars, benchmarkBars, weights = [[60, 0.5], [120, 0.3], [200, 0.2]]) {
  const detail = {}
  let score = 0
  let weight = 0
  for (const [period, allocation] of weights) {
    const asset = returnOver(assetBars, period)
    const benchmark = returnOver(benchmarkBars, period)
    const excess = finite(asset) && finite(benchmark) ? asset - benchmark : null
    detail[`rs${period}`] = finite(excess) ? round(excess * 100, 2) : null
    if (finite(excess)) { score += excess * allocation; weight += allocation }
  }
  return { data: { scorePct: weight ? round(score / weight * 100, 3) : null, detail, weights: Object.fromEntries(weights.map(([period, value]) => [`d${period}`, value])) }, diagnostics: [] }
}
