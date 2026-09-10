/**
 * The adjusted price series, and the three ways it lies.
 *
 * ── Why this file is the first one and not a utility ───────────────────────
 *
 * Every other strategy in the catalogue reads a price to *size* a judgement it
 * reached elsewhere. This one reads the price to reach the judgement: a fall is
 * the entry signal, so an artefact in the series **is** a buy signal here, not
 * a rounding error in one. That is why the three readings below refuse instead
 * of reporting, and it is the one place this package deliberately takes a
 * different policy from the module it was derived from.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/indicators.mjs`** —
 * `normalizeBars`, `unclosedNewestBar`, `sma`, `rsi` and
 * `priceSeriesDiscontinuity` (that last one from #248, bounds unchanged), plus
 * `source-parsers.mjs`'s `adjustment_basis_conflict`. What changed on the way
 * over is stated at each site. Nothing imports across package directories: the
 * published format is a path→contents map and a path out of this directory does
 * not survive publication.
 *
 * ── The three ways a series lies, and what each one costs here ─────────────
 *
 * | | the failure | what it manufactures |
 * |---|---|---|
 * | ⑴ | an incomplete newest bar | a "fall" that is a mid-session print |
 * | ⑵ | an unadjusted or mixed-basis series | a "fall" that is a split, or a year of dividends |
 * | ⑶ | a step by a factor inside the window | `ma200`, `high252` and the drawdown taken over two different price histories |
 *
 * ⑵ is the one #259's completion criteria name. An ex-dividend series does not
 * step by a factor and no discontinuity reading fires on it: a 3% gap is an
 * ordinary session. What it does is **accumulate** — twelve months of
 * distributions deepen a measured drawdown by the whole dividend yield, and a
 * high-payout Korean name then clears a 30% research gate it never fell to. So
 * the basis is checked by *declaration* rather than inferred from the shape,
 * which is the only reading that catches ⑵ before it becomes a signal.
 */
import { THRESHOLDS, diagnostic, finite, round } from './core.mjs'

/**
 * A daily bar is readable 24 hours after its own opening stamp — the host's
 * `prices`/`daily` contract, and the same rule `evidence-gated` applies for
 * #224. It needs no market-hours table, which is why it is the rule and not a
 * venue calendar this package would then own a second copy of.
 */
export const BAR_CLOSE_LAG_MS = 24 * 60 * 60 * 1000

export function unclosedNewestBar(bars, asOf) {
  const cutoff = Date.parse(asOf)
  const newest = Array.isArray(bars) && bars.length ? bars.at(-1) : null
  if (!newest || !Number.isFinite(cutoff)) return null
  const instant = Date.parse(newest.timestamp)
  if (!Number.isFinite(instant)) return null
  return instant + BAR_CLOSE_LAG_MS > cutoff ? { timestamp: newest.timestamp, ageMs: cutoff - instant } : null
}

export function sma(values, period) {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return null
  const window = values.slice(-period)
  return window.every(finite) ? round(window.reduce((sum, value) => sum + value, 0) / period) : null
}

/** Wilder's RSI, unchanged from the module it was derived from. */
export function rsi(values, period = THRESHOLDS.discovery.rsiPeriod) {
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

/**
 * The three integrity readings over the last 200 bars — the window every number
 * this package publishes is read from. Pure, and exported so the bounds are
 * testable without a two-hundred-bar fixture per assertion.
 *
 * ⚠️ **Unchanged from #248 except in what the caller does with it.** There the
 * finding is `info` and the reader judges; here it is `blocked`, because the
 * reader whose judgement that argument rests on is looking at a *ranking*, and
 * this package's reader is looking at the entry signal itself.
 */
export function priceSeriesDiscontinuity(bars) {
  const rows = (Array.isArray(bars) ? bars : []).slice(-THRESHOLDS.integrity.windowBars)
  if (rows.length === 0) return null
  const closes = rows.map((bar) => bar.close)
  const ma200 = sma(closes, THRESHOLDS.integrity.windowBars)
  const highs = rows.map((bar) => bar.high).filter(finite)
  const lows = rows.map((bar) => bar.low).filter(finite)
  const high200 = highs.length ? Math.max(...highs) : null
  const low200 = lows.length ? Math.min(...lows) : null
  const latest = closes.at(-1)

  const closeToMa200 = finite(latest) && finite(ma200) && ma200 > 0 ? round(latest / ma200, 6) : null
  const high200ToLow200 = finite(high200) && finite(low200) && low200 > 0 ? round(high200 / low200, 6) : null

  let jumpCount = 0
  let largestJump = null
  for (let index = 1; index < rows.length; index += 1) {
    const previous = closes[index - 1]
    const current = closes[index]
    if (!finite(previous) || !finite(current) || previous <= 0 || current <= 0) continue
    const logReturn = Math.log(current / previous)
    if (Math.abs(logReturn) <= THRESHOLDS.integrity.adjacentLogReturn) continue
    jumpCount += 1
    if (largestJump === null || Math.abs(logReturn) > Math.abs(largestJump.logReturn)) {
      largestJump = { timestamp: rows[index].timestamp ?? null, from: previous, to: current, logReturn: round(logReturn, 6) }
    }
  }

  const reasons = []
  const { closeToMa200: closeBounds, high200ToLow200: rangeBounds } = THRESHOLDS.integrity
  if (closeToMa200 !== null && (closeToMa200 < closeBounds.min || closeToMa200 > closeBounds.max)) reasons.push('close-to-ma200-outside-bounds')
  if (high200ToLow200 !== null && (high200ToLow200 < rangeBounds.min || high200ToLow200 > rangeBounds.max)) reasons.push('high200-to-low200-outside-bounds')
  if (jumpCount > 0) reasons.push('adjacent-session-step-beyond-half')

  return { windowBars: rows.length, closeToMa200, high200ToLow200, jumpCount, largestJump, suspected: reasons.length > 0, reasons }
}

/**
 * What the series says about its own adjustment basis, judged by declaration.
 *
 * ⛔ **This package does not adjust a series it was handed.** Re-deriving a
 * factor from a step would make it the second author of a price history whose
 * first author is the vendor, and a silently re-based series is the failure this
 * file exists to catch rather than a repair for it.
 *
 * ⚠️ **An undeclared basis is refused rather than assumed adjusted**, and that
 * is the whole ex-dividend defence. The shape of an unadjusted high-payout
 * series is an *ordinary* one — no step, no outlier session, a drawdown deeper
 * than the price ever fell by exactly the accumulated yield. Nothing in the bars
 * can distinguish it. Only the declaration can.
 */
export function adjustmentBasis(series, diagnostics) {
  const declared = series?.adjustment ?? null
  const actions = Array.isArray(series?.corporateActions) ? series.corporateActions : []
  if (declared === 'adjusted') return { basis: 'adjusted', usable: true }
  if (declared === null || declared === undefined) {
    diagnostics.push(diagnostic(
      'adjustment_basis_undeclared',
      'blocked',
      'The price series does not say whether it is adjusted for splits and distributions. This methodology measures a fall, so an undeclared basis is an undeclared signal: an unadjusted series of a high-payout name carries a drawdown deeper than the price ever fell by the whole accumulated yield, and no reading of the bars can tell that series from a real fall. Ask the vendor for an adjusted series, or declare `corporateActionsComplete` with an empty action list for the window',
      'series.adjustment',
      { declared, corporateActions: actions.length },
    ))
    return { basis: null, usable: false }
  }
  if (declared === 'mixed') {
    diagnostics.push(diagnostic(
      'adjustment_basis_conflict',
      'blocked',
      'Adjusted and unadjusted pages cannot be stitched into one series without reconciliation, and a series stitched across a factor is a fall that no session printed',
      'series.adjustment',
      { declared },
    ))
    return { basis: 'mixed', usable: false }
  }
  if (declared === 'unadjusted') {
    /**
     * The one route by which an unadjusted series is readable: the vendor says
     * the window holds **no** corporate action and says that its action list is
     * complete. Then adjusted and unadjusted are the same series, and refusing
     * it would refuse a fact rather than an artefact.
     */
    if (series?.corporateActionsComplete === true && actions.length === 0) {
      diagnostics.push(diagnostic(
        'unadjusted_series_accepted_no_actions',
        'info',
        'The series is unadjusted and the vendor states its corporate-action list for this window is complete and empty, so the adjusted and unadjusted series are the same rows',
        'series.adjustment',
        { declared },
      ))
      return { basis: 'unadjusted-no-actions', usable: true }
    }
    diagnostics.push(diagnostic(
      'adjustment_basis_unusable',
      'blocked',
      'The series is unadjusted and either declares a corporate action inside the window or does not claim its action list is complete. A split leaves a step and a distribution leaves an accumulation, and this methodology reads a drawdown off both',
      'series.adjustment',
      { declared, corporateActions: actions.length, corporateActionsComplete: series?.corporateActionsComplete ?? null },
    ))
    return { basis: 'unadjusted', usable: false }
  }
  diagnostics.push(diagnostic('adjustment_basis_unknown', 'blocked', 'The declared adjustment basis is not one this package reads', 'series.adjustment', { declared }))
  return { basis: declared, usable: false }
}

/**
 * Rows in, bars out: parsed, deduplicated, sorted, and cut at `asOf`.
 *
 * ⚠️ **The `asOf` cut is here and nowhere else**, so a bar dated after the
 * invocation's instant cannot reach any reading in this package — including the
 * one that runs across an earnings date, where a single leaked row is the whole
 * of the answer.
 */
export function normalizeBars(rows, asOf) {
  const diagnostics = []
  const cutoff = Date.parse(asOf)
  const seen = new Set()
  const bars = []
  if (!Number.isFinite(cutoff)) {
    diagnostics.push(diagnostic('as_of_invalid', 'blocked', 'asOf is missing or not an instant this package can parse', 'asOf', { asOf }))
    return { bars, diagnostics }
  }
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
    if (!values.every(finite) || values.some((value) => value <= 0) || row.high < row.low) {
      diagnostics.push(diagnostic('bar_value_invalid', 'unevaluated', 'OHLC values are invalid', `bars[${index}]`))
      continue
    }
    if (row.volume !== undefined && row.volume !== null && (!finite(row.volume) || row.volume < 0)) {
      diagnostics.push(diagnostic('bar_volume_invalid', 'unevaluated', 'Volume is invalid', `bars[${index}].volume`))
      continue
    }
    seen.add(timestamp)
    bars.push({ timestamp, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume ?? null })
  }
  bars.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

  const unclosed = unclosedNewestBar(bars, asOf)
  if (unclosed) {
    /**
     * ⚠️ **`blocked`, where the module this came from reports `info`.** The
     * cadence #259 fixes is a post-close review on *completed* daily bars, so a
     * run holding a partial newest bar is not a run of this methodology that
     * should be trusted about a low — the base low, the sessions since it, and
     * the reclaim above it are all read off the newest rows.
     */
    diagnostics.push(diagnostic(
      'newest_bar_may_be_unclosed',
      'blocked',
      'The newest bar is younger than the 24 hours after its own opening stamp that make a daily bar readable, so it may be an incomplete session. This methodology reviews after the close on completed bars: request an instant inside the previous day and check the first row\'s date',
      'bars',
      { timestamp: unclosed.timestamp, ageMs: unclosed.ageMs, closesAfterMs: BAR_CLOSE_LAG_MS, asOf },
    ))
  }

  const discontinuity = priceSeriesDiscontinuity(bars)
  if (discontinuity?.suspected) {
    diagnostics.push(diagnostic(
      'price_series_discontinuity_suspected',
      'blocked',
      'A derived level disagrees with the price it was derived from by a factor, which is the shape an unadjusted split or a part-way adjustment factor leaves. This package refuses rather than reports it, because the number being corrupted is this methodology\'s entry signal and not a ranking input: check the series against an adjusted source before any drawdown, RSI or moving-average distance here is read',
      'bars',
      discontinuity,
    ))
  }

  if (bars.length > 0 && bars.length < THRESHOLDS.history.minBars) {
    diagnostics.push(diagnostic(
      'history_too_short',
      'blocked',
      `The stabilisation test reads a ${THRESHOLDS.stabilisation.baseWindowBars}-bar base and the discovery gate reads a ${THRESHOLDS.discovery.drawdownWindowBars}-bar high, so fewer than ${THRESHOLDS.history.minBars} completed bars cannot answer either`,
      'bars',
      { bars: bars.length, required: THRESHOLDS.history.minBars },
    ))
  }
  if (bars.length === 0) {
    diagnostics.push(diagnostic('no_bars', 'blocked', 'No readable bar survived normalisation at asOf', 'bars', { rows: Array.isArray(rows) ? rows.length : 0 }))
  }

  return { bars, diagnostics, discontinuity }
}

/**
 * The technical state, computed from adjusted prices — #259's third required
 * output. Every field says which window it was taken over, because two of them
 * differ by 52 bars and a reader who assumed one window would misread both.
 */
export function technicalState(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null
  const closes = bars.map((bar) => bar.close)
  const latest = bars.at(-1)
  const { drawdownWindowBars, rsiPeriod } = THRESHOLDS.discovery
  const highWindow = bars.slice(-drawdownWindowBars)
  const high252 = Math.max(...highWindow.map((bar) => bar.high))
  const high252Index = bars.length - highWindow.length + highWindow.findIndex((bar) => bar.high === high252)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const ma120 = sma(closes, 120)
  const ma200 = sma(closes, 200)
  /** The same average 20 completed bars ago, which is the only honest reading of its direction. */
  const ma200Prior20 = closes.length >= 220 ? sma(closes.slice(0, -20), 200) : null
  const volumes = bars.map((bar) => bar.volume).filter(finite)
  const recentVolume = volumes.slice(-10)
  const priorVolume = volumes.slice(-70, -10)
  const averageVolume = (window) => (window.length ? round(window.reduce((sum, value) => sum + value, 0) / window.length) : null)

  return {
    asOfBar: latest.timestamp,
    bars: bars.length,
    close: latest.close,
    /** `close / max(high over the last 252 bars) − 1`. Negative is a fall. */
    drawdownWindowBars,
    high252: round(high252),
    high252At: bars[high252Index]?.timestamp ?? null,
    drawdownFromHigh: high252 > 0 ? round(latest.close / high252 - 1) : null,
    rsiPeriod,
    rsi14: rsi(closes, rsiPeriod),
    ma20,
    ma60,
    ma120,
    ma200,
    ma200Prior20,
    /** `true` when the 200-bar average is higher than it was 20 bars ago. */
    ma200Rising: finite(ma200) && finite(ma200Prior20) ? ma200 > ma200Prior20 : null,
    ma60Distance: ma60 ? round(latest.close / ma60 - 1) : null,
    ma120Distance: ma120 ? round(latest.close / ma120 - 1) : null,
    ma200Distance: ma200 ? round(latest.close / ma200 - 1) : null,
    volume10: averageVolume(recentVolume),
    volume60Prior: averageVolume(priorVolume),
    /** `< 1` is a decline whose volume is drying up rather than expanding. */
    volumeRatio: averageVolume(recentVolume) && averageVolume(priorVolume) ? round(averageVolume(recentVolume) / averageVolume(priorVolume)) : null,
    /**
     * ⚠️ Carried whether or not anything is suspected (#248's rule, kept): «no
     * adjacent session moved by more than 50%» is the fact that makes the
     * drawdown above readable, and a field that appears only when it is bad is a
     * field whose absence has to be interpreted.
     */
    discontinuity: priceSeriesDiscontinuity(bars),
  }
}

/**
 * Is this a fall this methodology researches, or a pullback inside an uptrend?
 *
 * ⚠️ **Being below the 200-bar average is never on its own a permanent
 * exclusion, and is never on its own an entry either** (#259). It appears here
 * as one of *two* corroborating readings behind a drawdown gate that has already
 * been met, and in `uptrendPullback` as one of two readings that say this fall
 * belongs to a different methodology.
 */
export function discoveryState(state) {
  if (!state) return null
  const { drawdownFloor, rsiCeiling, ma200DistanceCeiling } = THRESHOLDS.discovery
  const drawdownMet = finite(state.drawdownFromHigh) && state.drawdownFromHigh <= drawdownFloor
  const rsiMet = finite(state.rsi14) && state.rsi14 <= rsiCeiling
  const maMet = finite(state.ma200Distance) && state.ma200Distance <= ma200DistanceCeiling
  const corroborating = [rsiMet ? 'rsi' : null, maMet ? 'ma200-distance' : null].filter(Boolean)
  /**
   * A name that has fallen far and is **still above** its 200-bar average, with
   * that average **still rising**, is a pullback inside an uptrend. That is a
   * real trade and it is not this one: this methodology's claim is about a price
   * that has left its normal range, not about one that dipped inside it.
   *
   * ⚠️ Two readings, and the second is the one that matters. Price above a
   * falling average is a name on its way down that has not got there yet; price
   * above a rising average is a name whose range moved up with it.
   */
  const uptrendPullback = finite(state.ma200Distance) && state.ma200Distance > 0 && state.ma200Rising === true
  return {
    drawdownMet,
    corroborating,
    /** The gate: the fall, plus at least one of the two corroborating readings. */
    researchOpen: drawdownMet && corroborating.length >= 1,
    uptrendPullback,
    thresholds: { drawdownFloor, rsiCeiling, ma200DistanceCeiling },
  }
}
