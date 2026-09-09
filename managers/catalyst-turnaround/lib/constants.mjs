/**
 * Every number this methodology fixes, in one table, with its unit and the
 * argument for it.
 *
 * ⛔ **None of these was fitted to the reference case.** #256 says so in as many
 * words — the investor's reported result was never re-audited and is not an edge
 * — so a threshold here is derived from a *reporting cadence*, an *accounting
 * identity* or a *stated policy*, and every one of them says which below. A
 * number chosen because it made 한국가스공사 print BUY would be this package
 * measuring its own fixture.
 *
 * ⚠️ **Written twice on purpose.** Each value is also in `config.schema.json` and
 * in `PROMPT.md`, because an invocation may carry no `config` block at all and a
 * methodology that then invents a horizon per run is a different methodology
 * every month with one track record. This file is what the deterministic core
 * uses; `PROMPT.md` is what the model falls back to.
 */

export const METHODOLOGY = Object.freeze({
  /**
   * `catalystHorizonDays` — calendar days. A catalyst whose window neither opens
   * nor closes within this many days of `asOf` is research, not a position.
   *
   * 180 = two Korean quarterly reporting cycles. The hold is scoped to «the
   * catalyst window **and the earnings release that can confirm it**» (#258), so
   * the shortest defensible horizon is one that still contains a confirming
   * report after one slip. One cycle (90) does not; two does.
   */
  catalystHorizonDays: 180,

  /**
   * `priorYearStaleDays` — calendar days between a source's publication and
   * `asOf`, above which it is not a current catalyst.
   *
   * 365 = one full annual reporting cycle. An announcement a year old has had a
   * complete set of results to appear in; if it has not appeared, the thing to
   * record is that absence, not the announcement. This is the guard against «a
   * similar news item from an earlier year» being re-registered as today's.
   */
  priorYearStaleDays: 365,

  /**
   * `maxDelays` — a count. The third delay on one catalyst is refused.
   *
   * A first delay is information; a second is a pattern; a third is the failure
   * mode #258 names — the same threat recorded again and again while the
   * position is held indefinitely. Two delays already carry a 180-day horizon
   * past a full year, which is the arithmetic reason for 2 rather than 3, and
   * this is a **stated policy** rather than a measurement: no number here is
   * derivable from data, and pretending otherwise would be the dishonest part.
   */
  maxDelays: 2,

  /**
   * `minRunwayMonths` — months. `runway = liquidAssets / monthlyCashBurn`.
   *
   * 12 = twice `catalystHorizonDays`. The position is only survivable if the
   * company outlives the catalyst window with the same margin again for one
   * delay, and one delay is exactly what `maxDelays` says the methodology
   * tolerates. A company that is not funded through its own catalyst is a
   * refinancing bet wearing a turnaround's clothes.
   */
  minRunwayMonths: 12,

  /**
   * `debtCoverageFloor` — a ratio, dimensionless.
   * `coverage = (liquidAssets + securedRefinancing) / debtMaturingWithinYear`.
   *
   * 1.0 is the accounting identity and not a preference: below it the company
   * needs money nobody has promised it. There is no headroom in this one because
   * headroom here would be an opinion about a lender.
   */
  debtCoverageFloor: 1,

  /**
   * `minImprovingChannels` — a count of *distinct* recovery channels that must
   * be improving before a candidate is a position.
   *
   * 2. One improving indicator is a point; the methodology's claim is a **path**
   * — the leading indicator and the cash-flow link — and two is the smallest
   * number of distinct channels that can draw one. They must be distinct
   * channels precisely so that a receivable balance and the interest saving it
   * mechanically produces cannot be counted as two.
   */
  minImprovingChannels: 2,

  /**
   * `kellyFraction` — dimensionless multiplier on the Kelly risk budget.
   *
   * 0.25, quarter-Kelly, and it is inherited rather than chosen: the standard
   * fractional-Kelly haircut for parameter uncertainty, and the same fraction
   * `managers/evidence-gated/lib/sizing.mjs` uses. Full Kelly assumes the
   * probability estimate is correct, which for a catalyst date is exactly the
   * thing that is uncertain.
   */
  kellyFraction: 0.25,

  /**
   * `defaultSingleNameCap` — portfolio weight. The most any one name may reach
   * from this strategy when the Mandate declares nothing narrower.
   *
   * 0.20. It is a **ceiling and never a default order size**: `targetWeight`
   * takes the minimum of this, the Mandate's own cap, and what the loss to
   * invalidation actually funds.
   */
  defaultSingleNameCap: 0.2,

  /**
   * `trimPriceProgress` — dimensionless, on `(price − entry) / (target − entry)`.
   *
   * 0.7. «Trim once the recovery is in the price» needs a line, and this is the
   * one this package draws: the last 30% of the path to the target is the part
   * that is only earned if the assumption was exactly right, and a methodology
   * whose whole subject is *whether the estimate lands* should not be paid for
   * precision it did not claim. Stated policy; not fitted.
   */
  trimPriceProgress: 0.7,

  /**
   * `stabilisationWindowDays` — sessions of price used for the **secondary**
   * confirmation only.
   *
   * 60. Roughly a quarter of trading. ⛔ It confirms; it never qualifies. #258
   * forbids making price stabilisation, RSI or a low PER a universal entry
   * condition, so nothing in this package can turn this window into a gate.
   */
  stabilisationWindowDays: 60,
})

/** The states a catalyst may hold. The order is the ledger's column order. */
export const CATALYST_STATES = Object.freeze(['scheduled', 'in-progress', 'realised', 'delayed', 'failed'])

/**
 * ⛔ **`realised` and `failed` are terminal.** Not because a catalyst cannot be
 * revisited but because a *record* of one may not be rewritten: #258 asks that
 * contrary evidence cannot be overwritten after the fact, and a state machine
 * that lets `failed → in-progress` through is the mechanism by which it would
 * be. A genuinely new catalyst is a **new row with its own source**, which costs
 * one line and leaves the old finding readable.
 */
export const TERMINAL_STATES = Object.freeze(['realised', 'failed'])

export const CATALYST_TRANSITIONS = Object.freeze({
  scheduled: ['in-progress', 'realised', 'delayed', 'failed'],
  'in-progress': ['realised', 'delayed', 'failed'],
  delayed: ['in-progress', 'realised', 'delayed', 'failed'],
  realised: [],
  failed: [],
})

/**
 * The channels a policy-dependent recovery is decomposed into, and the whole
 * point is that they are separate.
 *
 * In a 가스공사-shaped case the receivable balance, the tariff, the import cost
 * and the overseas result move against each other; counting the receivable
 * drawdown and the interest it stops accruing as two independent improvements
 * is double-counting one fact. `recovery.mjs` refuses two indicators that name
 * the same channel as two channels.
 */
export const RECOVERY_CHANNELS = Object.freeze([
  'receivable-balance',
  'inventory-and-working-capital',
  'regulated-price',
  'input-cost',
  'overseas-result',
  'financing-cost',
  'operating-margin',
  'cash-flow',
])

/** What the case is, once the run has read enough to say. */
export const CASE_CLASSES = Object.freeze([
  'policy-financial-turnaround',
  'operational-turnaround',
  'research-candidate',
  'not-a-turnaround',
])

/**
 * What this run wants to happen, in this package's own vocabulary. `PROMPT.md`
 * maps each one to a host action; the host's own envelope is not copied here.
 *
 * ⚠️ **Four of these are the exit family and they are deliberately not one
 * word.** #258 sends 촉매 실패, 재무 악화 and 논거 반증 all to 「청산 검토」, and
 * the completion criteria then ask that those cases reach *different* judgements.
 * Both are satisfied by keeping the family and splitting it by which fact
 * triggered it, because they genuinely differ in what is left to decide:
 *
 *   `close-out`              the event will not happen. There is nothing to wait for
 *   `reduce-on-invalidation` a declared business invalidation condition fired
 *   `resize-to-risk-limit`   the thesis stands; the balance sheet no longer funds it
 *   `exit-review`            the deadline arrived — adjudicate against the benchmark
 */
export const INTENTS = Object.freeze([
  'enter-staged',
  'add-next-stage',
  'hold',
  'hold-through-delay',
  'trim-into-realisation',
  'reduce-on-invalidation',
  'resize-to-risk-limit',
  'exit-review',
  'close-out',
  'research-watch',
  'blocked-by-account-limit',
  'wait-for-data',
])
