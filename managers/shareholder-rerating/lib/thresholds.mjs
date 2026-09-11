/**
 * Every number this package fixed, with its formula, its unit and why it is that
 * number — in one file, so that a reviewer can read the whole of the package's
 * discretion in one screen instead of finding it spread through five modules.
 *
 * ⛔ **None of these was fitted to the outcome of the reference case.** The
 * methodology this package ports was used on 우리금융지주 and the investor reported
 * a result that was never re-audited (#256); no threshold here was moved to make
 * that name pass, produce a `BUY`, or reach any particular return. Two of them are
 * properties of Korean disclosure practice, one is a sector-relative ratio, one is
 * an accounting materiality share, and one is a floating-point noise floor.
 *
 * ⚠️ **What is deliberately *not* here is as important as what is.** There is no
 * default position cap, no default sector cap and no default entry discount. Those
 * are the Mandate's to state, and a package that carried a fallback would be sizing
 * every silent invocation to a number the investor never approved. Their absence is
 * `unevaluated` — the run says it could not size — and never a pass.
 *
 * ⚠️ **The per-idea risk budget used to be on that list and it was wrong there
 * (`untilled/aumos#841`).** It was written as the Mandate's to state, and this host's
 * Mandate is a closed set of eight fields with no such axis in it — so the sentence
 * «there is no default risk budget, and without one the answer is WAIT» meant
 * *always* WAIT: measured on the committed fixtures, every one of the four cases that
 * does anything at all flipped to `data_missing` the moment the investor's own Mandate
 * was handed in verbatim. A refusal no investor can lift is not a discipline, it is a
 * package that does not run. So the budget is pre-registered below, where the two
 * control packages already keep theirs — `catalyst-turnaround`'s `kellyFraction` and
 * `fundamental-mean-reversion`'s `perThesisRiskBudget` — and `config` may narrow it.
 *
 * ⛔ **A run handed no Mandate at all still refuses.** The discriminator is #838's:
 * a Mandate that was *read* and declares no per-idea axis is an undeclared axis, and
 * an undeclared axis constrains nothing; a run carrying no Mandate is nobody having
 * looked, and that is still `unevaluated`.
 */

export const THRESHOLDS = {
  /**
   * `executionPaceFloor` — dimensionless.
   *
   *   executionRate  = executedAmount / announcedAmount
   *   elapsedShare   = elapsedDays / windowDays              (clamped to [0, 1])
   *   pace           = executionRate / elapsedShare
   *
   * A programme running at half of its own straight-line schedule is behind by more
   * than its mechanics can explain: Korean issuers buy treasury stock inside a
   * declared window under a daily volume limit, and straight-line pacing already
   * accommodates that limit and the blackout days around a results release. `pace`
   * is measured against the issuer's **own** window, so a twelve-month programme and
   * a three-month one are judged on the same scale.
   */
  executionPaceFloor: 0.5,

  /**
   * `executionObservableElapsed` — dimensionless share of the programme's window.
   *
   * Below this the pace is arithmetic noise: a Korean issuer reports treasury
   * acquisition progress on the quarterly cycle (자기주식 취득결과보고서 and the
   * quarterly report), so a quarter of the window is the shortest interval at which
   * the shortfall is a *disclosed* fact rather than an inference. Before it, an
   * unexecuted programme is `unevaluated`, not a refusal.
   */
  executionObservableElapsed: 0.25,

  /**
   * `relativeYieldTrap` — multiples of the sector's own median dividend yield.
   *
   *   relativeYield = dividendYield / sectorMedianDividendYield
   *
   * Twice the sector median is the point at which the yield is a statement about the
   * **price** rather than about the payout. It is sector-relative on purpose: an
   * absolute yield number compares a bank against a shipbuilder, which is exactly the
   * mistake this methodology's second rule forbids. On its own it classifies nothing —
   * it only opens the question that the payout ratio and the recurring-earnings check
   * then answer.
   */
  relativeYieldTrap: 2.0,

  /**
   * `nonRecurringShare` — share of pre-tax profit.
   *
   *   nonRecurringShare = |nonRecurringPretaxGain| / pretaxProfit
   *
   * Three tenths of pre-tax profit is a share large enough that the sustainability
   * question is decided by whether it recurs — at a payout ratio anywhere under 0.7,
   * removing it is what moves the payout on recurring earnings above 1. The check
   * that actually classifies is the **flip** (`recurringPayout > 1 ≥ reportedPayout`),
   * which needs no threshold at all; this share is the second, weaker reading, and it
   * is reported as `warn` when the flip does not happen.
   */
  nonRecurringShare: 0.3,

  /**
   * `weightTolerance` — portfolio weight.
   *
   * The staged ledger compares a stage's cumulative target against what is already
   * held plus what is already proposed, and those numbers arrive from three different
   * places having been through IEEE-754 arithmetic. One part in a million of the book
   * is below the smallest position any Korean venue can express, so a difference under
   * it is float noise and never an increment to propose.
   */
  weightTolerance: 1e-6,
}

/**
 * ── The sizing policy, pre-registered rather than fitted (`untilled/aumos#841`) ──
 *
 * ⛔ **These two are not thresholds that classify.** Nothing above decides how large
 * a position is and nothing here decides what a case *is*; they are in one file
 * because this file's claim is that every number this package fixed is readable in
 * one screen, and a fixed number kept somewhere else breaks that claim rather than
 * honouring the distinction.
 *
 * ⚠️ **`config` may narrow the budget and may never widen it.** A wider value is
 * refused, reported, and the number below governs — `fundamental-mean-reversion`'s
 * rule, for the same quantity in the same units.
 */
export const SIZING_POLICY = Object.freeze({
  /**
   * `riskBudgetWeight` — share of the whole book this methodology is willing to lose
   * on **one** idea reaching the price at which its thesis is no longer true.
   *
   * 0.01, and it is derived from a number this package already published for an
   * unrelated reason rather than chosen for an outcome: `maxActiveTheses` is 6, so a
   * fully committed instance of this methodology puts 6 × 0.01 = **6% of the book**
   * at risk if every open thesis reaches its invalidation on the same day. That is
   * the aggregate `fundamental-mean-reversion` arrives at independently — 0.0075 on
   * eight theses, «roughly 6% of the book at risk» in its own words — from a
   * different methodology and a different loss profile, which is what makes it an
   * inherited number and not a fitted one.
   *
   * ⛔ **It was not moved to make any fixture pass.** Every case in `fixtures/` states
   * its own budget and `stated wins`, so no committed expectation depends on this
   * constant at all; the differential in `tools/verify-shareholder-rerating.mjs`
   * asserts exactly that.
   *
   * ⚠️ **It is a numerator and never a size.** `targetWeight` still takes the minimum
   * of what it funds and every cap that applies, and on a loss to invalidation in this
   * methodology's ordinary 15–20% range it funds 5–6.7% of the book — a number the
   * investor's own `maxPositionWeight` is then free to cut and routinely does.
   */
  riskBudgetWeight: 0.01,

  /**
   * `minimumExecutablePosition` — in won. The smallest position worth opening in this
   * venue, and the default behind `config.minimumExecutablePosition`.
   *
   * 500000, the number `config.schema.json` and `PROMPT.md` have both published since
   * this package shipped. ⚠️ **It was a knob with no reader until #841**: the
   * arithmetic wanted `minimumExecutableWeight`, a weight, and nothing turned won into
   * a weight — so the published setting governed nothing and the absent weight refused
   * every run whose Mandate did not state one, which is no Mandate this host sends.
   *
   * ⚠️ **The conversion needs the size of the book and there is no way around that.**
   * `weight = minimumExecutablePosition / book.totalValue`, and `book.totalValue` is
   * `portfolio.totalValue` from the invocation (`packages/amp/src/snapshots.ts`), in
   * major units of the account's base currency. ⛔ A run that states no account value
   * is refused exactly as before: skipping the floor because the book size is unknown
   * is the «an absent input is not an input that passed» defect wearing a third name.
   */
  minimumExecutablePosition: 500000,
})
