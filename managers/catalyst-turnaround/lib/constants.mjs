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

  /**
   * `discoveryBudgetFilings` — a count of OpenDART receipts one run may read
   * while **looking for** something, as opposed to while reviewing what is held.
   *
   * 100, and the number is read off the vendor rather than chosen. The host's
   * filings index requests a fixed `page_count=100`, newest-first, over a
   * five-year window (`skills/ct-event-sweep/SKILL.md` carries the measured
   * contract), so one page is the natural unit of a sweep and this budget is one
   * page. ⚠️ It is a **cost ceiling and never a correctness rule**: exceeding it
   * is a `note`, and what is refused is spending the whole budget on held names
   * and then reporting that nothing new qualified — that run is
   * `discovery_not_run` (`aumos-catalogue#305`).
   */
  discoveryBudgetFilings: 100,

  /**
   * `researchCompletionFloor` — how many shortlisted candidates one run must
   * take **all the way** before it ends.
   *
   * 1. #305's own initial operating value, and the argument for it is the one
   * this whole package is built on: «한 번에 여러 종목을 얕게 읽고 종료하는 행동은
   * 허용하지 않는다». Three names read shallowly produce three research
   * candidates and no finding; one name read to the end produces a traced path, a
   * survivability answer and an invalidation condition, which is a complete run
   * whether or not it ends in a purchase. Stated policy; not fitted.
   */
  researchCompletionFloor: 1,
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
 *
 * ⚠️ **`reduction-not-this-desks` is the thirteenth, and it is a reduction that
 * did not happen (`untilled/aumos#821`).** A rung reached one of the four above
 * over a position **none of which is this desk's** — every share of it another
 * manager's, or assigned to nobody at all. The review still stands and is still
 * armed; what is withdrawn is the word that moves money, because there is
 * nothing here for this desk to reduce. It is the sibling of
 * `fundamental-mean-reversion`'s `["WATCH"]` and `shareholder-rerating`'s
 * `WAIT` (`aumos-catalogue#278`), said in this package's vocabulary.
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
  'reduction-not-this-desks',
  'research-watch',
  'blocked-by-account-limit',
  'wait-for-data',
])

/**
 * ── What each intent asks the **position** to become (`untilled/aumos#821`) ──
 *
 * ⛔ **This table is the one that decides `hostTargetWeight`, and before #821
 * there was no table.** Every intent but `close-out` handed the host
 * `otherHeldWeight + cumulativeTargetWeight` — the weight a *purchase* would
 * target — whatever the judgement above it had decided. Over a 6% holding
 * assigned to nobody that turned `trim-into-realisation` into `buy:16`,
 * `reduce-on-invalidation` into `buy:39` and `resize-to-risk-limit` into
 * `buy:60`; `hold-through-delay` bought on a wholly-own position, and
 * `exit-review` — a rung whose entire content is «adjudicate before deciding
 * anything else» — handed over a `0` and liquidated the name.
 *
 * | role | `hostTargetWeight` is | why |
 * |---|---|---|
 * | `increase` | `otherHeldWeight + max(cumulativeTargetWeight, ownHeldWeight)` | #817's addition, with #825's floor: a purchase moves this desk's share **up** and never down. A due stage on a plan targeting less than is already held handed the host that target and sold 30 shares on a run whose word is «add» |
 * | `reduce` | `otherHeldWeight + min(cumulativeTargetWeight, ownHeldWeight)` | a reduction happens **inside this desk's own share**. It may take that share down; it may never take it up, and it may never touch anybody else's |
 * | `close` | `otherHeldWeight` | this desk's share to zero and no further (#817) |
 * | `standstill` | `otherHeldWeight + ownHeldWeight` — what the account holds now | the rung's own prose is «nothing is added and nothing is closed». The number now says the same thing |
 *
 * ⚠️ **The two clamps are one sentence in two signs (#825).** A judgement moves this desk's own
 * share in the direction it says and no further: `min` on the way down, `max` on the way up.
 * Neither is ever the other — `min` cannot turn a real reduction into a no-op and `max` cannot turn
 * a real purchase into a larger one — and #821 wrote only the first half.
 *
 * ⚠️ **`standstill` is not «no answer».** The weight is stated rather than left
 * `null`, because `null` already means «the book was not read» and one word may
 * not carry two states. A target equal to the holding is what «unchanged» is in
 * the only language the host speaks.
 */
export const INTENT_WEIGHT_ROLES = Object.freeze({
  'enter-staged': 'increase',
  'add-next-stage': 'increase',
  hold: 'standstill',
  'hold-through-delay': 'standstill',
  'trim-into-realisation': 'reduce',
  'reduce-on-invalidation': 'reduce',
  'resize-to-risk-limit': 'reduce',
  'exit-review': 'standstill',
  'close-out': 'close',
  'reduction-not-this-desks': 'standstill',
  'research-watch': 'standstill',
  'blocked-by-account-limit': 'standstill',
  'wait-for-data': 'standstill',
})

/** The roles above, as a closed set — a fourteenth intent with no role is a defect a check catches. */
export const INTENT_WEIGHT_ROLE_NAMES = Object.freeze(['increase', 'reduce', 'close', 'standstill'])
