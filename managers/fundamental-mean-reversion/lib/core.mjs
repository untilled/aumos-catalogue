/**
 * The numbers this methodology is fixed at, and the three helpers everything
 * else in `lib/` is built from.
 *
 * ── Why the thresholds live in one frozen object ──────────────────────────
 *
 * Every one of them is a **pre-registered** condition: #259 says the concrete
 * period, RSI and price conditions are fixed in the pull request that adds this
 * package and are not adjusted to make the reference case pass. A constant that
 * is written in three files is a constant that is tuned in one of them — so it
 * is written here, `PROMPT.md` quotes this table, and
 * `tools/verify-fundamental-mean-reversion.mjs` asserts against this object
 * rather than against a number retyped into a fixture.
 *
 * ⚠️ **`config` may narrow these and may never loosen them.** An investor's risk
 * budget is theirs; the entry gate is the methodology. `narrowingOnly` below is
 * the one function that decides which is which, and it is used by
 * `positionSizing` alone — nothing in the entry gate reads `config` at all.
 *
 * ── The unit of every field, because two of them look alike ───────────────
 *
 * `*Bars` and `*Sessions` are **completed daily bars** — never calendar days.
 * `*Days` is calendar days. Fractions are fractions of price (`-0.30` is a 30%
 * fall), never percentage points, and `rsi*` is the 0–100 Wilder reading.
 */

/** Derived from `managers/evidence-gated/lib/diagnostics.mjs` (`finite`, `round`, `diagnostic`). */
export function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function round(value, digits = 8) {
  if (!finite(value)) return null
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

export function diagnostic(code, severity, message, path, details = {}) {
  return { code, severity, message, ...(path ? { path } : {}), details }
}

/** Severities, in the order that decides whether a stage may proceed. */
export const SEVERITIES = Object.freeze(['info', 'unevaluated', 'blocked'])

export function isBlocked(diagnostics) {
  return (diagnostics ?? []).some((row) => row.severity === 'blocked')
}

/**
 * ── The pre-registered thresholds ─────────────────────────────────────────
 *
 * Rationales are in `README.md` and in the pull request; what is here is the
 * formula and the unit, so that a reader of the code never has to guess which
 * window a number belongs to.
 */
export const THRESHOLDS = Object.freeze({
  /**
   * Discovery — *research priority only*. Passing this is never a buy case;
   * #259 is explicit that the technical state sets the order of work and is not
   * the whole of the entry.
   */
  discovery: Object.freeze({
    /** `drawdown = close / max(high over the last 252 completed bars) − 1`. */
    drawdownWindowBars: 252,
    /** Research opens at a fall of 30% or more. Fraction of price, negative. */
    drawdownFloor: -0.3,
    /** Wilder RSI period, in completed bars. */
    rsiPeriod: 14,
    /** RSI at or below this is one of the two corroborating readings. 0–100. */
    rsiCeiling: 35,
    /** `close / ma200 − 1` at or below this is the other. Fraction of price. */
    ma200DistanceCeiling: -0.15,
  }),

  /**
   * The entry gate. Nothing here is configurable and nothing here is read
   * before the discovery gate has been met.
   */
  stabilisation: Object.freeze({
    /** The base window: the low this test is measured against is the lowest low in it. */
    baseWindowBars: 120,
    /** A low printed this recently is a falling knife rather than an unconfirmed base. */
    knifeWindowBars: 5,
    /** Completed bars that must have passed since the base low without it being undercut. */
    minSessionsSinceLow: 15,
    /** `close / baseLow − 1` must be at least this. Fraction of price. */
    minReclaimAboveBaseLow: 0.05,
    /** The RSI floor at the decision bar. 0–100. */
    minRsi: 35,
  }),

  /**
   * The series-integrity readings, derived from `evidence-gated`'s
   * `priceSeriesDiscontinuity` (#248) with its bounds unchanged.
   */
  integrity: Object.freeze({
    windowBars: 200,
    closeToMa200: Object.freeze({ min: 0.1, max: 10 }),
    high200ToLow200: Object.freeze({ min: 1, max: 20 }),
    adjacentLogReturn: 0.5,
  }),

  /** The shortest history from which every reading above can be computed. */
  history: Object.freeze({ minBars: 250 }),

  /** Sizing. `config` may narrow each of these and may not loosen any of them. */
  sizing: Object.freeze({
    /** Fraction of NAV this methodology is willing to lose on one thesis reaching its invalidation. */
    perThesisRiskBudget: 0.0075,
    /** The floor on the gap-and-halt haircut. Fraction of price. */
    gapHaircutFloor: 0.03,
    /** The ceiling on it, so one crash session does not size every later position to nothing. */
    gapHaircutCap: 0.15,
    /** Added when the name was halted, or its venue has a daily price limit, in the window. */
    haltHaircut: 0.02,
    /** Sessions of average traded value a full position may be worth. */
    participationDays: 3,
    /** Share of one session's traded value this methodology is willing to be. */
    participationRate: 0.1,
    /** Bars behind the average daily traded value and behind the worst-session reading. */
    liquidityWindowBars: 20,
    /** Bars searched for the worst single-session downside move. */
    gapWindowBars: 250,
  }),

  /** The ceiling on how long a thesis may wait, when the thesis names no shorter one. */
  wait: Object.freeze({ maxWaitDaysDefault: 120 }),
})

/**
 * A configured value, accepted only when it is at least as strict as the
 * pre-registered one. `direction` is which way strictness runs.
 *
 * ⛔ A loosened value is not clamped silently — the caller is handed the
 * pre-registered number **and** a diagnostic, because a run that believed it had
 * a larger budget and got a smaller one has to be able to say so.
 */
export function narrowingOnly(name, configured, registered, direction, diagnostics) {
  if (configured === undefined || configured === null) return registered
  if (!finite(configured)) {
    diagnostics.push(diagnostic('config_value_unreadable', 'info', `config.${name} is not a number and was ignored`, `config.${name}`, { configured, registered }))
    return registered
  }
  const stricter = direction === 'lower' ? configured <= registered : configured >= registered
  if (stricter) return configured
  diagnostics.push(diagnostic(
    'config_loosens_preregistered_threshold',
    'info',
    `config.${name} is looser than the pre-registered value and was refused; the pre-registered value governs. A setting may narrow this methodology and may never widen it`,
    `config.${name}`,
    { configured, registered, direction },
  ))
  return registered
}

/**
 * The distinctions #256 requires this package to keep apart, and #254 owns.
 *
 * ⛔ Absence is never refutation. `data_missing` and `research_incomplete` say
 * that a judgement could not be made; `thesis_refuted` says one was made and
 * came out against the thesis; `risk_limit_exceeded` says the judgement was
 * made, was positive, and the book has no room for it. Four states, four codes,
 * and nothing here maps two of them onto one verdict.
 */
export const DIAGNOSIS_CODES = Object.freeze(['data_missing', 'research_incomplete', 'thesis_refuted', 'risk_limit_exceeded'])

/** This package's own outcome vocabulary. `classifyCase` returns exactly one. */
export const OUTCOMES = Object.freeze([
  'mean-reversion-candidate',
  'falling-knife',
  'stabilization-unconfirmed',
  'structural-earnings-damage',
  'research-incomplete',
  'risk-limit-exceeded',
  'data-missing',
  'price-artifact-suspected',
  'uptrend-pullback-not-this-strategy',
  'out-of-scope',
  'target-reached-trim',
  'invalidated-re-adjudicate',
  'deadline-elapsed-re-adjudicate',
])

/**
 * The package's verdict, and the AMP actions each verdict leaves open.
 *
 * ⚠️ **`RE_ADJUDICATE` is this package's word and not AMP's.** AMP has no such
 * action, and that is the point: what the outcome fixes is that the run may not
 * answer `WAIT` or `WATCH` — a broken low, business damage or an elapsed
 * deadline has to be answered with a position change or with an explicit,
 * written re-judgement of the thesis. Which of `RESIZE` and `SELL` that becomes
 * is the run's, on the evidence.
 */
export const VERDICT_ACTIONS = Object.freeze({
  BUY: Object.freeze(['BUY']),
  WAIT: Object.freeze(['WAIT']),
  WATCH: Object.freeze(['WATCH']),
  TRIM: Object.freeze(['RESIZE', 'SELL']),
  RE_ADJUDICATE: Object.freeze(['RESIZE', 'SELL']),
})
