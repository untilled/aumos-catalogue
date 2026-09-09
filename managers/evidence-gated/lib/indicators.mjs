import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── The bar whose shape is valid and whose data is wrong (#224) ────────────
 *
 * `/api/v1/candles` takes `before`, and `before` is **inclusive**. Toss stamps a
 * daily bar at the venue's local midnight, so the most natural way to write
 * *«exclude today»* — pass today's midnight — returns **exactly today's
 * incomplete bar**. Measured on 2026-09-08, 069500, XKRX mid-session:
 * `before=2026-09-08T00:00:00+09:00` and no `before` at all both answered with
 * a 2026-09-08 first row, and two calls seconds apart disagreed about it —
 * close 113,470 → 113,485, volume 11,452,779 → 11,466,966. Its close was 2,665
 * above the real 2026-09-07 close, and `trendState` computed `close`, `ma20`
 * and `extensionPct` off a price no session ever printed.
 *
 * ⛔ **Every existing bar defence misses it.** `bar_value_invalid`,
 * `trend_bars_unreadable` and `trend_moving_average_unavailable` all ask
 * whether the row *parsed*; a partial bar has complete, finite, numeric OHLCV
 * and parses perfectly. This is the case where the shape is valid and the data
 * is wrong, and nothing in this package could see it.
 *
 * ⚠️ **What is detected is age, not the session — because this package cannot
 * honestly know the session.** It holds no market-hours table on purpose: the
 * sleeves take the close from the Toss market-calendar source precisely because
 * DST, holidays and early closes are not derivable, and encoding hours here
 * would make these operations a second and worse answer to a question the
 * calendar source already owns. So the rule applied is the one this package
 * already publishes, from the host's own `prices`/`daily` contract (aumos#732):
 * **a daily bar becomes readable 24 hours after its own opening stamp**, which
 * is at or after the close on every venue and needs no timezone table.
 *
 * ⚠️ **`info`, and it changes no verdict.** A run pinned between a venue's close
 * and the next local midnight holds a same-day bar that is genuinely complete,
 * and this rule cannot tell it from a partial one — so it reports and never
 * refuses. ⛔ It is deliberately *not* silent on that case either: on the
 * corrected prescription (an instant **inside the previous day**) the newest bar
 * is yesterday's and this row does not appear at all, so the row fires exactly
 * when a run did not follow it. The cost is one `info` on a post-close run that
 * hand-collected candles, which is a route the sleeves already tell it not to
 * take for the roster sweep.
 */
export const BAR_CLOSE_LAG_MS = 24 * 60 * 60 * 1000

/**
 * The newest bar's own instant when it is younger than `BAR_CLOSE_LAG_MS` at
 * `asOf`, and `null` otherwise. Pure, and exported so the check is testable
 * without reconstructing a two-hundred-bar series.
 *
 * ⚠️ Bars are already sorted and already cut at `asOf` by the time this reads
 * them, so «newest» is the last row and never a future one.
 */
export function unclosedNewestBar(bars, asOf) {
  const cutoff = Date.parse(asOf)
  const newest = Array.isArray(bars) && bars.length ? bars.at(-1) : null
  if (!newest || !Number.isFinite(cutoff)) return null
  const instant = Date.parse(newest.timestamp)
  if (!Number.isFinite(instant)) return null
  return instant + BAR_CLOSE_LAG_MS > cutoff ? { timestamp: newest.timestamp, ageMs: cutoff - instant } : null
}

/**
 * ── The series whose shape is valid and whose *history* is wrong (#248) ────
 *
 * #224 closed the case where one bar is incomplete. This is the case where the
 * bars are all complete and the **series** is not: an unadjusted split, or a
 * vendor adjustment factor that stops part-way through the window, leaves a
 * price history that steps by a factor rather than by a session. Measured on
 * the 2026-09-09 US sweep (83 names, `roster-scan` answers):
 *
 *   BKNG  `close` 193.29 · `ma200` **2,316.55** · `offHigh200` **−96.5%**
 *         → `ma200Discount: true`, `discoveryScore` **20**
 *   VZ    `close` 50.14  · `low200` **10.5999** · `aboveLow200` **+373%**
 *
 * Neither is a drawdown. BKNG's `discoveryScore` of 20 came **entirely** from
 * the artifact, and `discoveryScore` reads `offHigh200` and `ma200Distance`, so
 * the price branch's own ranking was partly made of it.
 *
 * ⛔ **Every existing defence passes it, and for the same reason #224 did.**
 * `bar_value_invalid` asks whether the row parsed and every row does;
 * `trend_moving_average_unavailable` asks whether the average computed and it
 * computed — 2,316.55 is a finite number. `newest_bar_may_be_unclosed` is about
 * one bar's age and says nothing about the two hundred behind it. Nothing here
 * compared a derived number against the price it was derived from, so nothing
 * could see it.
 *
 * ── Three readings, and each one caught one of the measured names ──────────
 *
 * | reading | bound | the measured name it catches |
 * |---|---|---|
 * | `close / ma200` | outside [0.1, 10] | BKNG — 193.29 / 2,316.55 = **0.083** |
 * | `high200 / low200` | outside [1, 20] | neither, and it is kept: it is the one reading that fires when the step is *inside* the window's extremes rather than at its edge |
 * | adjacent-bar `ln(close₂/close₁)` | beyond ±0.5 | VZ — a bar at 10.60 beside one near 38 is `ln(38/10.6)` ≈ **1.28** |
 *
 * ⚠️ **The count is carried whether or not anything is suspected**, because
 * *«no adjacent session moved by more than 50%»* is the fact a reader needs in
 * order to trust `offHigh200`, and a field that only appears when it is bad is
 * a field whose absence has to be interpreted (`dateSource`'s rule, one module
 * over).
 *
 * ⚠️ **The window is the last 200 bars — the same window the corrupted numbers
 * are read from.** A step 250 sessions back corrupts nothing this packet
 * publishes, and reporting it would make a name with three years of clean
 * history and one ancient split permanently suspect.
 *
 * ⚠️ **`info`, and it refuses nothing.** A name that really did split 1:10 has
 * exactly this shape and its history is exactly right; the judgement is the
 * reader's. What was wrong was that the reader had no way to know — so this
 * reports, the score is not touched, and no verdict moves. ⛔ It is deliberately
 * **not** registered in `CAUSE_CODE_REGISTRY`: that table is
 * `mandateExecution`'s vocabulary for *«why does this book hold no single
 * name?»*, and a suspected artifact is neither a stage that lost an input nor
 * an answer that refuses both conclusions — the sweep ran and answered.
 *
 * ⛔ **And it does not try to repair the series.** Re-deriving an adjustment
 * factor from the step would make this package the second author of a price
 * history whose first author is the vendor, and a silently re-based series is
 * the failure this file exists to report rather than a fix for it.
 */
export const PRICE_DISCONTINUITY_BOUNDS = Object.freeze({
  windowBars: 200,
  closeToMa200: Object.freeze({ min: 0.1, max: 10 }),
  high200ToLow200: Object.freeze({ min: 1, max: 20 }),
  adjacentLogReturn: 0.5,
})

/**
 * The three readings over one series, or `null` when there is no series to read.
 * Pure, and exported so the bounds can be tested without standing up an
 * operation.
 *
 * ⚠️ It calls the same `sma` over the same 200-bar slice `indicatorPacket`
 * reads, so a ratio can never disagree with the level it was taken over — the
 * levels and the ratios are one computation with two readers, which is why this
 * lives beside them rather than in `scanners.mjs`.
 */
export function priceSeriesDiscontinuity(bars) {
  const rows = (Array.isArray(bars) ? bars : []).slice(-PRICE_DISCONTINUITY_BOUNDS.windowBars)
  if (rows.length === 0) return null
  const closes = rows.map((bar) => bar.close)
  const ma200 = sma(closes, PRICE_DISCONTINUITY_BOUNDS.windowBars)
  const highs = rows.map((bar) => bar.high).filter(finite)
  const lows = rows.map((bar) => bar.low).filter(finite)
  const high200 = highs.length ? Math.max(...highs) : null
  const low200 = lows.length ? Math.min(...lows) : null
  const latest = closes.at(-1)

  const closeToMa200 = finite(latest) && finite(ma200) && ma200 > 0 ? round(latest / ma200, 6) : null
  const high200ToLow200 = finite(high200) && finite(low200) && low200 > 0 ? round(high200 / low200, 6) : null

  /**
   * ⚠️ Counted over **adjacent readable closes**, and a pair whose earlier
   * close is zero or unreadable is skipped rather than counted: a ratio against
   * nothing is not a step, and reporting it would make a missing volume look
   * like a split.
   */
  let jumpCount = 0
  let largestJump = null
  for (let index = 1; index < rows.length; index += 1) {
    const previous = closes[index - 1]
    const current = closes[index]
    if (!finite(previous) || !finite(current) || previous <= 0 || current <= 0) continue
    const logReturn = Math.log(current / previous)
    if (Math.abs(logReturn) <= PRICE_DISCONTINUITY_BOUNDS.adjacentLogReturn) continue
    jumpCount += 1
    if (largestJump === null || Math.abs(logReturn) > Math.abs(largestJump.logReturn)) {
      largestJump = { timestamp: rows[index].timestamp ?? null, from: previous, to: current, logReturn: round(logReturn, 6) }
    }
  }

  const reasons = []
  if (closeToMa200 !== null && (closeToMa200 < PRICE_DISCONTINUITY_BOUNDS.closeToMa200.min || closeToMa200 > PRICE_DISCONTINUITY_BOUNDS.closeToMa200.max)) {
    reasons.push('close-to-ma200-outside-bounds')
  }
  if (high200ToLow200 !== null && (high200ToLow200 < PRICE_DISCONTINUITY_BOUNDS.high200ToLow200.min || high200ToLow200 > PRICE_DISCONTINUITY_BOUNDS.high200ToLow200.max)) {
    reasons.push('high200-to-low200-outside-bounds')
  }
  if (jumpCount > 0) reasons.push('adjacent-session-step-beyond-half')

  return {
    windowBars: rows.length,
    closeToMa200,
    high200ToLow200,
    jumpCount,
    largestJump,
    suspected: reasons.length > 0,
    reasons,
  }
}

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
  const unclosed = unclosedNewestBar(bars, asOf)
  if (unclosed) {
    diagnostics.push(diagnostic(
      'newest_bar_may_be_unclosed',
      'info',
      'The newest bar is younger than the 24 hours after its own opening stamp that make a daily bar readable, so it may be an incomplete session. On `/api/v1/candles` this is the shape a mid-session partial bar has: `before` is inclusive and a daily bar is stamped at local midnight, so today\'s midnight returns today\'s partial bar — pass an instant inside the previous day and check the first row\'s date. ⚠️ A run pinned after the close holds a same-day bar that is complete, and this rule cannot tell the two apart; it reports and refuses nothing',
      'bars',
      { timestamp: unclosed.timestamp, ageMs: unclosed.ageMs, closesAfterMs: BAR_CLOSE_LAG_MS, asOf },
    ))
  }
  const discontinuity = priceSeriesDiscontinuity(bars)
  if (discontinuity?.suspected) {
    diagnostics.push(diagnostic(
      'price_series_discontinuity_suspected',
      'info',
      'A derived level disagrees with the price it was derived from by a factor, which is the shape an unadjusted split or a part-way adjustment factor leaves: `close/ma200` outside [0.1, 10], `high200/low200` outside [1, 20], or an adjacent session stepping by more than 50%. Measured on the 2026-09-09 US sweep — BKNG close 193.29 against ma200 2,316.55, VZ close 50.14 against low200 10.5999 — where `offHigh200` and `ma200Distance` fed `discoveryScore` off a fall no session printed. ⚠️ A name that really did split has exactly this shape and its history is right, so this reports and refuses nothing: check the series against an adjusted source before reading `offHigh200`, `aboveLow200`, `ma60Distance` or `ma200Distance` as a drawdown',
      'bars',
      discontinuity,
    ))
  }
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
    /**
     * ⚠️ **Always present, and `jumpCount: 0` is the answer a reader needs**
     * (#248). Every field above it is a level or a distance and none of them can
     * say whether the series they were taken over steps by a factor; this one
     * says so, and it says so on a clean name too — a field that appears only
     * when something is wrong is a field whose absence has to be interpreted.
     */
    discontinuity: priceSeriesDiscontinuity(bars),
  }
}
