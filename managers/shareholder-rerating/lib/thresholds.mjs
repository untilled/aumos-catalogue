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
 * default risk budget, no default position cap, no default sector cap and no default
 * entry discount. Those are the Mandate's to state, and a package that carried a
 * fallback would be sizing every silent invocation to a number the investor never
 * approved. Their absence is `unevaluated` — the run says it could not size — and
 * never a pass.
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
