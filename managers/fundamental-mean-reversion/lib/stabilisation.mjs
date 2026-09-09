/**
 * The entry gate: has the fall stopped falling?
 *
 * ── Why this is arithmetic and not a judgement ─────────────────────────────
 *
 * #259 requires that entry never rests on oversold alone and that the concrete
 * period, RSI and price conditions be **fixed in this pull request and not
 * adjusted to make the reference case pass**. A condition a model re-derives
 * every run is a condition that moves when the answer is uncomfortable, and a
 * threshold tuned against a known outcome is a backtest wearing a rule's
 * clothes. So the three conditions are constants in `core.mjs`, the readings
 * below are pure functions of the bars, and the reference case is allowed to
 * come out `WATCH`.
 *
 * ── Three outcomes, kept apart on purpose ──────────────────────────────────
 *
 * | outcome | what it means | what it is not |
 * |---|---|---|
 * | `falling-knife` | the base low was printed within the last 5 completed bars | not a refutation of the business thesis |
 * | `stabilization-unconfirmed` | a low exists and the reclaim, the wait or the RSI floor is not met yet | not a knife, and not an entry |
 * | `data-missing` | the readings could not be computed | not either of the above, and never a refutation (#254) |
 *
 * ⚠️ The fourth outcome — `confirmed` — is the only one that opens an entry, and
 * even then it opens one: the business half of the thesis is judged separately
 * and `classifyCase` requires both.
 */
import { THRESHOLDS, diagnostic, finite, round } from './core.mjs'

/**
 * The base low, when it printed, and how the price has behaved since.
 *
 * ⚠️ **The low is a low, and the reclaim is a close.** The base is the lowest
 * *intraday* low in the window because that is the price the market actually
 * found; the reclaim is measured on the *close* because a wick through a level
 * is not the market accepting it. Mixing the two — a close-based base — makes a
 * long lower shadow look like a completed base, which is the shape a capitulation
 * session has.
 */
export function baseState(bars) {
  const { baseWindowBars } = THRESHOLDS.stabilisation
  const window = (Array.isArray(bars) ? bars : []).slice(-baseWindowBars)
  if (window.length === 0) return null
  let baseLow = Infinity
  let baseIndex = -1
  for (const [index, bar] of window.entries()) {
    if (finite(bar.low) && bar.low < baseLow) {
      baseLow = bar.low
      baseIndex = index
    }
  }
  if (baseIndex < 0) return null
  const latest = window.at(-1)
  const sessionsSinceLow = window.length - 1 - baseIndex
  /**
   * The lowest low printed *after* the base, which is what says a higher low
   * exists rather than one long slide. `null` when the base is the last bar.
   */
  const after = window.slice(baseIndex + 1)
  let higherLow = null
  if (after.length >= 5) {
    higherLow = Math.min(...after.slice(0, Math.max(after.length - 2, 1)).map((bar) => bar.low).filter(finite))
  }
  return {
    windowBars: window.length,
    baseLow: round(baseLow),
    baseLowAt: window[baseIndex].timestamp,
    sessionsSinceLow,
    close: latest.close,
    reclaimAboveBaseLow: baseLow > 0 ? round(latest.close / baseLow - 1) : null,
    higherLow: finite(higherLow) ? round(higherLow) : null,
    higherLowHolds: finite(higherLow) ? higherLow >= baseLow : null,
  }
}

/**
 * The pre-registered stabilisation test.
 *
 * `state` is `technicalState`'s answer; `bars` is the same series it was taken
 * over. Returns one of `confirmed`, `falling-knife`, `stabilization-unconfirmed`
 * or `data-missing`, and always the readings behind it — an outcome without its
 * numbers is a verdict a reviewer cannot recompute.
 */
export function stabilisation(bars, state) {
  const diagnostics = []
  const rules = THRESHOLDS.stabilisation
  const base = baseState(bars)
  if (!base || !state) {
    diagnostics.push(diagnostic('stabilisation_unreadable', 'blocked', 'There is no base window to read a low from', 'bars'))
    return { outcome: 'data-missing', base: null, checks: null, diagnostics, thresholds: rules }
  }
  if (!finite(state.rsi14)) {
    diagnostics.push(diagnostic(
      'stabilisation_rsi_unavailable',
      'blocked',
      `RSI(${THRESHOLDS.discovery.rsiPeriod}) could not be computed, so one of the three pre-registered conditions is unevaluated. An unevaluated condition is missing data and never a met one`,
      'bars',
    ))
    return { outcome: 'data-missing', base, checks: null, diagnostics, thresholds: rules }
  }

  const checks = {
    /** ⑴ The base low has to be old enough that the market has had time to retest it. */
    sessionsSinceLow: { value: base.sessionsSinceLow, required: rules.minSessionsSinceLow, met: base.sessionsSinceLow >= rules.minSessionsSinceLow },
    /** ⑵ The close has to be far enough above it that the low is support and not the current price. */
    reclaimAboveBaseLow: { value: base.reclaimAboveBaseLow, required: rules.minReclaimAboveBaseLow, met: finite(base.reclaimAboveBaseLow) && base.reclaimAboveBaseLow >= rules.minReclaimAboveBaseLow },
    /** ⑶ The RSI floor. Oversold is what opened the research; leaving oversold is what opens the entry. */
    rsi: { value: state.rsi14, required: rules.minRsi, met: state.rsi14 >= rules.minRsi },
  }

  if (base.sessionsSinceLow <= rules.knifeWindowBars) {
    return {
      outcome: 'falling-knife',
      base,
      checks,
      diagnostics,
      thresholds: rules,
      reason: `the base low printed ${base.sessionsSinceLow} completed bar(s) ago, inside the ${rules.knifeWindowBars}-bar window in which a new low is still being made`,
    }
  }

  const unmet = Object.entries(checks).filter(([, check]) => !check.met).map(([name]) => name)
  if (unmet.length > 0) {
    return { outcome: 'stabilization-unconfirmed', base, checks, diagnostics, thresholds: rules, unmet }
  }
  return { outcome: 'confirmed', base, checks, diagnostics, thresholds: rules, unmet: [] }
}
