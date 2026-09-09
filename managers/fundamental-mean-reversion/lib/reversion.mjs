/**
 * Where the price is supposed to come back to, and what kind of claim that is.
 *
 * ── The one confusion this file exists to make impossible ──────────────────
 *
 * #259: *«the reversion target must state which it is — a historical price band,
 * a moving average, or a normalised-earning-power valuation range»*, and *«a
 * bounce's plausibility is never written up as an independent valuation
 * result»*. Those two sentences are one rule read from two ends, and the failure
 * they name is a single sentence in a run's prose: **"fair value is 240,000"**
 * where 240,000 was the 200-bar average. A reader cannot tell the two apart
 * afterwards, and a price band inherits the authority of a valuation it never
 * did.
 *
 * So `basis` is an argument and `kind` is **derived from it** and never
 * accepted from the caller. A run that hands in `kind: 'valuation'` over a
 * moving average is refused by name rather than corrected quietly — the mistake
 * is in the sentence the run was about to write, and silently relabelling it
 * would leave that sentence intact.
 *
 * ⛔ **No basis here is a discounted cash flow, and `normalised-earning-power`
 * is not one either.** It is a normalised earning figure times a multiple range,
 * both of which the run must hand in with the evidence they came from. This
 * package computes no terminal value and discounts nothing; a DCF is a different
 * document and it is not produced by this file under any argument.
 */
import { diagnostic, finite, round } from './core.mjs'

/** The three bases, and the kind of claim each one is. Nothing else is read. */
export const TARGET_BASES = Object.freeze({
  'historical-price-band': 'price-history',
  'moving-average': 'technical',
  'normalised-earning-power': 'valuation',
})

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

/**
 * The target range, its kind, and the derivation a reader can recompute.
 *
 * `input`:
 *   `basis`            one of `TARGET_BASES`
 *   `bars`             the normalised, `asOf`-cut series
 *   `state`            `technicalState`'s answer over the same bars
 *   `referenceWindow`  `{ from, to }` ISO dates — required by `historical-price-band`
 *   `movingAverage`    `'ma120' | 'ma200'` — required by `moving-average`
 *   `earningPower`     `{ normalisedEps, multipleRange: { low, high }, derivation, evidenceIds }`
 *                      — required by `normalised-earning-power`
 *   `claimedKind`      what the run was about to call it, when it says
 */
export function reversionTarget(input = {}) {
  const diagnostics = []
  const { basis, bars, state, claimedKind } = input
  const kind = TARGET_BASES[basis]

  if (!kind) {
    diagnostics.push(diagnostic('target_basis_unstated', 'blocked', `A reversion target must name its basis. This package reads ${Object.keys(TARGET_BASES).join(', ')} and nothing else`, 'basis', { basis: basis ?? null }))
    return { status: 'refused', diagnostics }
  }
  if (claimedKind !== undefined && claimedKind !== null && claimedKind !== kind) {
    diagnostics.push(diagnostic(
      'technical_target_labelled_as_valuation',
      'blocked',
      `A ${basis} target is a ${kind} claim and was about to be written up as a ${claimedKind} one. A bounce's plausibility is not an independent valuation result, and relabelling it here would leave the sentence that says otherwise standing`,
      'claimedKind',
      { basis, kind, claimedKind },
    ))
    return { status: 'refused', diagnostics }
  }
  if (!state || !finite(state.close)) {
    diagnostics.push(diagnostic('target_price_unreadable', 'blocked', 'There is no current close to measure a target against', 'state'))
    return { status: 'refused', diagnostics }
  }

  let low = null
  let mid = null
  let high = null
  let derivation = null

  if (basis === 'historical-price-band') {
    const window = input.referenceWindow ?? {}
    const from = Date.parse(window.from)
    const to = Date.parse(window.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      diagnostics.push(diagnostic('target_reference_window_invalid', 'blocked', 'A historical price band needs a reference window with a start before its end — the period the run claims was the normal range, named rather than assumed', 'referenceWindow', { window }))
      return { status: 'refused', diagnostics }
    }
    const closes = (Array.isArray(bars) ? bars : [])
      .filter((bar) => {
        const instant = Date.parse(bar.timestamp)
        return Number.isFinite(instant) && instant >= from && instant <= to
      })
      .map((bar) => bar.close)
      .filter(finite)
      .sort((a, b) => a - b)
    if (closes.length < 60) {
      diagnostics.push(diagnostic('target_reference_window_thin', 'blocked', 'Fewer than 60 completed bars fall inside the reference window, which is too few sessions for a band to describe a range rather than an episode', 'referenceWindow', { bars: closes.length, required: 60 }))
      return { status: 'refused', diagnostics }
    }
    low = round(percentile(closes, 0.25))
    mid = round(percentile(closes, 0.5))
    high = round(percentile(closes, 0.75))
    derivation = { statistic: 'closing-price percentiles 25/50/75 inside the named window', bars: closes.length, from: window.from, to: window.to }
  }

  if (basis === 'moving-average') {
    const name = input.movingAverage ?? 'ma200'
    const level = state[name]
    if (!finite(level)) {
      diagnostics.push(diagnostic('target_moving_average_unavailable', 'blocked', `${name} could not be computed over this series`, 'movingAverage', { movingAverage: name }))
      return { status: 'refused', diagnostics }
    }
    /**
     * ⚠️ A moving-average target is a **point**, and a point pretending to be a
     * range is a false precision. The band is ±5% around the level and it is
     * labelled as an envelope rather than as an estimate of anything.
     */
    low = round(level * 0.95)
    mid = round(level)
    high = round(level * 1.05)
    derivation = { statistic: `${name} at the decision bar, with a ±5% envelope`, level: round(level), movingAverage: name }
  }

  if (basis === 'normalised-earning-power') {
    const power = input.earningPower ?? {}
    const eps = power.normalisedEps
    const range = power.multipleRange ?? {}
    const missing = []
    if (!finite(eps) || eps <= 0) missing.push('normalisedEps')
    if (!finite(range.low) || range.low <= 0) missing.push('multipleRange.low')
    if (!finite(range.high) || range.high <= 0) missing.push('multipleRange.high')
    if (typeof power.derivation !== 'string' || power.derivation.trim() === '') missing.push('derivation')
    if (!Array.isArray(power.evidenceIds) || power.evidenceIds.length === 0) missing.push('evidenceIds')
    if (missing.length > 0) {
      diagnostics.push(diagnostic(
        'target_basis_unsupported',
        'blocked',
        'A normalised-earning-power range is a valuation claim, so it is refused unless the earning figure, the multiple range, how both were derived and the evidence they came from are all present. Without them the run has a price band and a valuation label',
        'earningPower',
        { missing },
      ))
      return { status: 'refused', diagnostics }
    }
    if (range.low > range.high) {
      diagnostics.push(diagnostic('target_multiple_range_inverted', 'blocked', 'The multiple range runs backwards', 'earningPower.multipleRange', { range }))
      return { status: 'refused', diagnostics }
    }
    low = round(eps * range.low)
    high = round(eps * range.high)
    mid = round((low + high) / 2)
    derivation = { statistic: 'normalised earning power × the stated multiple range', normalisedEps: eps, multipleRange: { low: range.low, high: range.high }, evidenceIds: power.evidenceIds, note: power.derivation }
  }

  /**
   * ⛔ **The old high is not a target.** #259 forbids assuming the price returns
   * to it, and the way that assumption actually arrives is not as a sentence but
   * as a band whose top happens to sit above the 252-bar high. So the reading is
   * made against the high itself rather than against the prose.
   */
  if (!finite(state.high252)) {
    /**
     * ⛔ **The guard was written `finite(state.high252) && …`, so an unreadable
     * high disabled it.** A rule that only applies when its input happens to be
     * there is a rule a caller can omit its way past — and the omission is
     * silent, because the answer looks exactly like one where the check ran.
     */
    diagnostics.push(diagnostic(
      'target_prior_high_unreadable',
      'blocked',
      'The 252-bar high could not be read, so the range could not be checked against it. This methodology makes no claim about the old high, and a check that did not run is not a check that passed',
      'state.high252',
      { high252: state.high252 ?? null },
    ))
    return { status: 'refused', diagnostics }
  }
  if (finite(high) && high > state.high252) {
    diagnostics.push(diagnostic(
      'target_assumes_prior_high_recovered',
      'blocked',
      'The top of the target range is above the highest price of the last 252 completed bars, so the range assumes the prior high is recovered. This methodology takes the return to a normal range and makes no claim about the high',
      'target.high',
      { high, high252: state.high252 },
    ))
    return { status: 'refused', diagnostics }
  }

  if (!finite(mid) || mid <= state.close) {
    diagnostics.push(diagnostic(
      'target_not_above_price',
      'blocked',
      'The middle of the target range is at or below the current close, so there is no reversion to take. That is a finding about the target, not a reason to widen it',
      'target.mid',
      { mid, close: state.close },
    ))
    return { status: 'refused', diagnostics }
  }

  return {
    status: 'ok',
    basis,
    /** ⚠️ Derived from `basis`. Never accepted from the caller. */
    kind,
    low,
    mid,
    high,
    close: state.close,
    upsideToMid: round(mid / state.close - 1),
    upsideToLow: round(low / state.close - 1),
    derivation,
    diagnostics,
  }
}
