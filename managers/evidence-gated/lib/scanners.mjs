import { diagnostic, finite, round } from './diagnostics.mjs'
import { indicatorPacket } from './indicators.mjs'
import { LENS_ENVELOPES } from './envelopes.mjs'

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
  /**
   * Every threshold below comes from `LENS_ENVELOPES`, which is also what
   * judges whether a revisit trigger is reachable. One source: a constant
   * edited here without the declaration moving is not drift, it is a syntax
   * error waiting to happen.
   */
  const meanReversion = LENS_ENVELOPES['mean-reversion'].signals
  const meanSignals = {
    rsiOversold: packet.rsi14 < meanReversion.rsiOversold.value,
    nearLow: packet.aboveLow200 !== null && packet.aboveLow200 <= meanReversion.nearLow.value,
    ma200Discount: packet.ma200Distance !== null && packet.ma200Distance <= meanReversion.ma200Discount.value,
    ma60Discount: packet.ma60Distance !== null && packet.ma60Distance <= meanReversion.ma60Discount.value,
    volumeCapitulation: capitulation,
  }
  const knownMean = Object.values(meanSignals).filter((value) => value !== null)
  const meanCount = knownMean.filter(Boolean).length
  const trendPullback = LENS_ENVELOPES['trend-pullback'].checks
  const trendSignals = {
    uptrend: packet.ma200 !== null && packet.close > packet.ma200 && packet.ma50 > packet.ma200,
    pullback: packet.offHigh200 >= trendPullback.pullback.min && packet.offHigh200 <= trendPullback.pullback.max,
    healthyRsi: packet.rsi14 >= trendPullback.healthyRsi.min && packet.rsi14 <= trendPullback.healthyRsi.max,
    notExtended: packet.ma200 !== null && packet.close <= packet.ma200 * (1 + trendPullback.notExtended.value),
  }
  /**
   * Lens C, the 5pp band the other two lenses drop between.
   *
   * `trend-pullback` takes `offHigh200` down to -20% and `mean-reversion` needs
   * two oversold signals, which a name trading above its MA200 rarely has. So a
   * quality name between -20% and -35% off its high falls out of both, and the
   * only way back in is to drop far enough to break the MA200 — cheaper means
   * less covered, which is the wrong sign. The Trading Harness measured the gap
   * on 2026-07-28 (ASML at -20.8% off high, +14.0% over MA200, RSI 36.5, in
   * neither lens) and the investor approved a separate lens on 2026-07-29 with
   * implementation anchored to 2026-08-24 so the September promotion sample was
   * not disturbed mid-flight.
   *
   * It is a separate lens rather than a widened `trend-pullback` band because
   * "a shallow pullback inside an intact uptrend" is a different claim from
   * "a quality name marked down a third"; merging them would put two claims in
   * one calibration sample. Its samples accrue under its own memory key, so no
   * existing row is retagged.
   */
  const qualityPullback = LENS_ENVELOPES['quality-pullback'].checks
  const qualityPullbackSignals = {
    aboveMa200: packet.ma200 !== null && packet.close > packet.ma200,
    deepPullback: packet.offHigh200 !== null && packet.offHigh200 >= qualityPullback.deepPullback.min && packet.offHigh200 <= qualityPullback.deepPullback.max,
    rsiBand: packet.rsi14 >= qualityPullback.rsiBand.min && packet.rsi14 <= qualityPullback.rsiBand.max,
  }
  const lenses = []
  if (meanCount >= 2) lenses.push('mean-reversion')
  if (Object.values(trendSignals).every(Boolean)) lenses.push('trend-pullback')
  if (Object.values(qualityPullbackSignals).every(Boolean)) lenses.push('quality-pullback')
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
      signals: { meanReversion: meanSignals, trendPullback: trendSignals, qualityPullback: qualityPullbackSignals },
    },
    diagnostics,
  }
}

/**
 * Trading days since the window low was last set, on one series.
 *
 * Strict `<`, so a flat base sitting at the low counts as basing rather than as
 * a fresh new low. The `no_new_low` condition below ties the other way. That
 * asymmetry is deliberate and documented in the Trading Harness (2026-07-27):
 * this value is descriptive, that one is a pre-purchase gate and takes the
 * conservative side. Unifying either direction changes a judgement definition.
 */
function sessionsSinceNewLow(lows) {
  if (!lows.length) return null
  let runMin = lows[0]
  let lastNew = 0
  for (const [index, low] of lows.entries()) {
    if (low < runMin) {
      runMin = low
      lastNew = index
    }
  }
  return lows.length - 1 - lastNew
}

const BASING_MIN_SESSIONS = 5
const RECENT_WINDOW_BARS = 60

/**
 * The entry-quality gate, ported with both of its approved dual lenses.
 *
 * The Trading Harness blocked `falling_knife` in code
 * (`sizing_policy.risk_gates.entry_quality_gate`, approved 2026-07-10); this
 * package had the rule in prose only, in `evidence-gates` and
 * `candidate-research`. A prose gate does not refuse anything.
 *
 * Two later approvals hang off it, and both are the same shape — a lens that
 * can be fooled, a second lens that catches it, and a refusal to silently pick
 * the friendlier answer:
 *
 * - **eq-v2 (approved 2026-07-28).** Sessions-since-new-low measured over the
 *   whole window goes mechanically large when the window low is nine months
 *   old, which forced `basing` no matter how the name had traded since — a
 *   false pass on a blocking gate. It is now measured over the window *and*
 *   the last 60 bars and the stricter reading wins. `recentReversalUp` stays an
 *   independent path: the defect was the window artifact, not the
 *   capitulation-and-reversal idea.
 * - **no_new_low dual lens (approved 2026-07-27).** An intraday spike low left
 *   inside the lookback window can mask closes that are still setting fresh
 *   lows. The verdict still comes from the intraday-low lens, unchanged, and
 *   the close lens is reported beside it; a disagreement is surfaced loudly
 *   rather than resolved in favour of "basing".
 *
 * Absent data never blocks. The harness rule is explicit that a name with no
 * scan data degrades to a warning, so that over-constraint does not masquerade
 * as caution.
 */
export function entryQualityGate({ bars = [], lenses = [], noNewLow = {} }) {
  const diagnostics = []
  const rows = bars.filter((bar) => finite(bar?.close))
  const packet = indicatorPacket(rows)
  if (!packet || rows.length < RECENT_WINDOW_BARS || packet.rsi14 === null) {
    diagnostics.push(diagnostic('entry_quality_unverified', 'unevaluated', 'Entry quality cannot be read without scan history; absent data warns rather than blocks', 'bars', { count: rows.length }))
    return { data: { state: null, passed: null, blocking: false }, diagnostics }
  }
  const lows = rows.map((bar) => (finite(bar.low) ? bar.low : bar.close))
  const closes = rows.map((bar) => bar.close)
  const above = packet.ma200 !== null && packet.close > packet.ma200
  const golden = packet.ma50 !== null && packet.ma200 !== null && packet.ma50 > packet.ma200
  const sessionsWindow = sessionsSinceNewLow(lows)
  const sessionsRecent = sessionsSinceNewLow(lows.slice(-RECENT_WINDOW_BARS))
  const sessionsEffective = Math.min(...[sessionsWindow, sessionsRecent].filter((value) => value !== null))
  const last = rows.at(-1)
  const range = finite(last.high) && finite(last.low) ? last.high - last.low : 0
  const reversalUp = finite(last.open) && last.close > last.open && range > 0 && (last.close - last.low) / range >= 0.6

  let state
  if (above && golden) state = 'pullback_in_uptrend'
  else if (!above && (sessionsEffective >= BASING_MIN_SESSIONS || reversalUp)) state = 'basing'
  else if (!above) state = 'falling_knife'
  else state = 'neutral'

  /**
   * eq-v1 would have read `basing` off the window alone. Kept so a report can
   * say why a name that used to pass no longer does.
   */
  const eqV1WouldPassBasing = state === 'falling_knife' && sessionsWindow >= BASING_MIN_SESSIONS && sessionsRecent !== null && sessionsRecent < BASING_MIN_SESSIONS
  if (eqV1WouldPassBasing) {
    diagnostics.push(diagnostic('entry_quality_window_artifact', 'info', 'eq-v2 demotion: the window reading was basing but the last 60 bars are still near a new low', 'bars', { sessionsWindow, sessionsRecent }))
  }

  /**
   * The pre-purchase lens: `<=`, so tying the window low counts as a new low.
   */
  const sessions = Number.isInteger(noNewLow?.sessions) && noNewLow.sessions > 0 ? noNewLow.sessions : 3
  const lookback = Number.isInteger(noNewLow?.lookback) && noNewLow.lookback > 0 ? noNewLow.lookback : 200
  let noNewLowResult = null
  if (rows.length < sessions + 2) {
    diagnostics.push(diagnostic('no_new_low_unverified', 'unevaluated', 'Not enough bars to read the no-new-low condition', 'bars'))
  } else {
    const newLowDays = (series) => {
      const hits = []
      for (let index = series.length - sessions; index < series.length; index += 1) {
        const priorWindow = series.slice(Math.max(0, index - lookback), index)
        if (priorWindow.length && series[index] <= Math.min(...priorWindow)) hits.push(rows[index].date ?? index)
      }
      return hits
    }
    const lowLensHits = newLowDays(lows)
    const closeLensHits = newLowDays(closes)
    const lensDisagreement = lowLensHits.length === 0 && closeLensHits.length > 0
    noNewLowResult = { met: lowLensHits.length === 0, lowLensNewLowDays: lowLensHits, closeLensNewLowDays: closeLensHits, lensDisagreement, verdictLens: 'intraday-low', sessions, lookback }
    if (lensDisagreement) {
      diagnostics.push(diagnostic('no_new_low_lens_disagreement', 'info', 'The intraday-low lens reads no new low while closes are still setting them; an intraday spike low may be masking a falling knife. Re-check the basing call by hand', 'bars', { closeLensNewLowDays: closeLensHits }))
    }
  }

  if (state === 'falling_knife') {
    diagnostics.push(diagnostic('entry_quality_falling_knife', 'blocked', 'A falling knife is not an entry; below MA200 and still cutting lows', 'bars', { sessionsWindow, sessionsRecent }))
  }
  /**
   * A mean-reversion signal with no trend-pullback beside it must have its
   * entry quality confirmed rather than merely not-refuted (approved
   * 2026-07-13). `neutral` is not a pass.
   */
  const meanReversionOnly = lenses.includes('mean-reversion') && !lenses.includes('trend-pullback')
  if (meanReversionOnly && !['pullback_in_uptrend', 'basing'].includes(state)) {
    diagnostics.push(diagnostic('mean_reversion_unconfirmed', 'blocked', 'A mean-reversion-only candidate needs a confirmed pass state, not an unconfirmed one', 'lenses', { state }))
  }

  return {
    data: {
      state,
      passed: !diagnostics.some((row) => row.severity === 'blocked'),
      blocking: state === 'falling_knife',
      aboveMa200: above,
      ma50AboveMa200: golden,
      sessionsSinceNewLow: sessionsWindow,
      sessionsSinceNewLow60: sessionsRecent,
      sessionsSinceNewLowEffective: sessionsEffective,
      recentReversalUp: reversalUp,
      eqV1WouldPassBasing,
      noNewLow: noNewLowResult,
      ruleVersion: 'eq-v2',
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

const TOP_RESEARCH_RANK = 3
const RANK_JUMP_FOR_RESEARCH = 3
const AT_HIGH_TOLERANCE = 0.995

/**
 * L1 — where the team should look, which is not what the team should buy.
 *
 * `blendedSectorStrength` above scores one sector against one benchmark. That
 * number alone was all this package carried, and a score with nothing to rank
 * it against decides nothing. The Trading Harness `bin/sector-strength` ranked
 * the lane, tracked each sector's move since the previous run, read the regime
 * off the benchmark and the character of the leaders, and emitted a
 * `research_queue`. The queue is the input to the research layer; without it a
 * schedule that says "wake up and research" has nowhere to send anyone.
 *
 * ⛔ Nothing here is a buy signal, and the output says so in `meaning` rather
 * than only in prose. The design this is ported from is explicit that mechanical
 * RS confirmed the 2026 semiconductor leadership only after the move had already
 * happened; its job is to aim attention cheaply, not to take positions.
 *
 * The bot baseline is the second half of that demotion. `rs_leader_pullback` and
 * `rs_breakout` are logged as paper signals so the question "do the team's picks
 * beat a dumb momentum bot, and not merely the index?" has an answer. They are
 * never traded, and `tradeable: false` travels with every row.
 */
export function sectorStrength({ benchmarkBars = [], sectors = [], previousRanks = {}, lane = null, weights } = {}) {
  const diagnostics = []
  if (benchmarkBars.length === 0) {
    diagnostics.push(diagnostic('sector_benchmark_missing', 'unevaluated', 'Without the lane benchmark no relative strength is measurable; the lane is unread rather than neutral', 'benchmarkBars'))
    return { data: { lane, regime: null, sectors: [], researchQueue: [], baselineSignals: [], meaning: 'research-priority-only' }, diagnostics }
  }
  const scored = []
  const unread = []
  for (const sector of sectors) {
    const bars = sector?.bars ?? []
    if (bars.length === 0) {
      unread.push({ name: sector?.name ?? null, etf: sector?.etf ?? null, status: 'unverified' })
      diagnostics.push(diagnostic('sector_series_unverified', 'unevaluated', 'A sector whose series could not be read is named as unread, never dropped silently', 'sectors', { name: sector?.name ?? null }))
      continue
    }
    const { data: rs } = blendedSectorStrength(bars, benchmarkBars, weights)
    if (rs.scorePct === null) {
      unread.push({ name: sector?.name ?? null, etf: sector?.etf ?? null, status: 'insufficient-history' })
      continue
    }
    const closes = bars.map((row) => row.close).filter(finite)
    const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((sum, value) => sum + value, 0) / 200 : null
    const high = Math.max(...closes)
    scored.push({
      name: sector.name,
      etf: sector.etf ?? null,
      risk: sector.risk ?? null,
      rsScorePct: rs.scorePct,
      rsDetail: rs.detail,
      atHigh: closes.at(-1) >= high * AT_HIGH_TOLERANCE,
      aboveMa200: ma200 !== null ? closes.at(-1) > ma200 : null,
      leaders: sector.leaders ?? [],
    })
  }
  scored.sort((a, b) => b.rsScorePct - a.rsScorePct)
  for (const [index, row] of scored.entries()) {
    row.rank = index + 1
    const previous = previousRanks[row.name]
    row.rankChange = Number.isInteger(previous) ? previous - row.rank : null
  }

  const benchmarkCloses = benchmarkBars.map((row) => row.close).filter(finite)
  const benchmarkMa200 = benchmarkCloses.length >= 200 ? benchmarkCloses.slice(-200).reduce((sum, value) => sum + value, 0) / 200 : null
  if (benchmarkMa200 === null) diagnostics.push(diagnostic('regime_trend_unevaluated', 'unevaluated', 'The benchmark trend needs 200 bars; the regime is read without it rather than assumed', 'benchmarkBars'))
  /**
   * Two independent readings, kept apart. The trend is the benchmark against
   * its own MA200; the character is who is leading. A single fused number would
   * be the aggregate macro score this package refuses to hold.
   */
  const topThree = scored.slice(0, 3)
  const votes = topThree.map((row) => row.risk).filter((risk) => risk === 'on' || risk === 'off')
  const onVotes = votes.filter((risk) => risk === 'on').length
  const offVotes = votes.filter((risk) => risk === 'off').length
  const character = onVotes >= 2 ? 'risk_on' : offVotes >= 2 ? 'risk_off' : 'mixed'
  const regime = {
    benchmarkAboveMa200: benchmarkMa200 === null ? null : benchmarkCloses.at(-1) > benchmarkMa200,
    leadershipCharacter: character,
    leaders: topThree.map((row) => row.name),
    isJudgementInput: true,
  }

  /**
   * Rank alone is noise in a narrow market — third place in a lane where
   * everything trails the benchmark is not leadership, so a top rank has to
   * come with actual outperformance before it earns anyone's attention.
   */
  const researchQueue = []
  for (const row of scored) {
    const reasons = []
    if (row.rank <= TOP_RESEARCH_RANK && row.rsScorePct > 0) reasons.push({ code: 'rs-rank', rank: row.rank })
    if ((row.rankChange ?? 0) >= RANK_JUMP_FOR_RESEARCH) reasons.push({ code: 'rank-jump', rankChange: row.rankChange })
    if (row.atHigh) reasons.push({ code: 'at-200d-high' })
    if (reasons.length) {
      researchQueue.push({
        lane,
        sector: row.name,
        etf: row.etf,
        rsScorePct: row.rsScorePct,
        reasons,
        question: 'Why is it leading, what would make the lead persist, and which second-order beneficiary is not priced yet?',
      })
    }
  }

  const baselineSignals = []
  for (const row of topThree) {
    for (const leader of row.leaders) {
      const closes = (leader?.bars ?? []).map((entry) => entry.close).filter(finite)
      if (closes.length < 200) {
        diagnostics.push(diagnostic('baseline_leader_unverified', 'unevaluated', 'A leader without 200 bars cannot produce a baseline signal', 'sectors', { symbol: leader?.symbol ?? null }))
        continue
      }
      const excess60 = returnOver(leader.bars, 60) - returnOver(benchmarkBars, 60)
      if (!finite(excess60) || excess60 <= 0) continue
      const setup = baselineSetup(closes)
      if (setup) baselineSignals.push({ lane, sector: row.name, symbol: leader.symbol, setup, close: closes.at(-1), excess60Pct: round(excess60 * 100, 2), tradeable: false })
    }
  }

  return {
    data: {
      lane,
      regime,
      sectors: [...scored, ...unread],
      researchQueue,
      baselineSignals,
      meaning: 'research-priority-only',
      baselineMeaning: 'measurement-only-never-traded',
    },
    diagnostics,
  }
}

/**
 * The dumb momentum bot the team is measured against: a leader at its 200-bar
 * high, or one pulling back shallowly inside an intact uptrend.
 */
function baselineSetup(closes) {
  const mean = (n) => closes.slice(-n).reduce((sum, value) => sum + value, 0) / n
  if (closes.length < 200) return null
  const close = closes.at(-1)
  const ma20 = mean(20)
  const ma50 = mean(50)
  const ma200 = mean(200)
  if (close >= Math.max(...closes) * AT_HIGH_TOLERANCE) return 'rs_breakout'
  const offHigh60 = close / Math.max(...closes.slice(-60)) - 1
  if (close > ma200 && ma50 > ma200 && close <= ma20 && close >= ma50 * 0.98 && offHigh60 >= -0.15 && offHigh60 <= -0.03) return 'rs_leader_pullback'
  return null
}
