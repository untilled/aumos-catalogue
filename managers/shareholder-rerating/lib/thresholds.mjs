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
   * `minimumExecutablePosition` — an amount of money, and `minimumExecutablePositionCurrency`
   * is the currency it is an amount of. The smallest position worth opening in the venue
   * this methodology was written against, and the defaults behind the two settings of the
   * same names.
   *
   * 500000 **KRW**, the number `config.schema.json` and `PROMPT.md` have both published
   * since this package shipped. ⚠️ **It was a knob with no reader until #841**, and the
   * reader #841 gave it read the amount and not its unit (`untilled/aumos#845`):
   *
   *   weight = minimumExecutablePosition / book.totalValue
   *
   * On the book this package was written for that is right. On **a dollar book of
   * $100,000 it is 500000 / 100000 = 5.0**, a floor of five hundred per cent of the
   * account, which no position can clear — so every case sized and then refused, and
   * the package was structurally `WAIT` on any account not denominated in won.
   * Measured on the fifteen committed fixtures under the host's own Mandate: eight
   * acting on a won book, **three** on a dollar one, six of them refused by this floor.
   *
   * ⚠️ **And the wrong reading of `totalValue` was the one that looked green.** The host
   * sends `portfolio.totalValue` as a `Money` — `{ currency, minorUnits, exponent? }`,
   * an integer count of minor units — so a reader that hands `minorUnits` straight in
   * passes 10,000,000 for a $100,000 book and this floor lands back in its ordinary
   * range. Seven of the fifteen act on that reading and three on the correct one. A
   * unit that is only in the prose is a unit the arithmetic cannot check, which is why
   * the currency is a value here now rather than the word «won» in a comment.
   *
   * ── What the amount says, and to which book ───────────────────────────────
   *
   * ⚠️ **A venue minimum is money and cannot be restated as a weight.** 500,000 won is
   * «a KOSPI share in the ordinary 10,000–100,000 won range, in a quantity that can be
   * staged into and trimmed»; the same statement as a share of the book is 0.1 of a
   * five-million-won account and 0.00001 of a fifty-billion-won one. So this package
   * does **not** pre-register a weight: there is no non-fitted number to pre-register,
   * and `thresholds.mjs` opens by saying none of its numbers was fitted.
   *
   * ⛔ **So the amount governs the book it was declared for and no other.** Where the
   * account's `baseCurrency` is this currency the arithmetic above is unchanged to the
   * byte. Where it differs, this package has published no minimum for that venue: the
   * axis is **undeclared**, and #838 settled that an undeclared axis constrains nothing
   * rather than withholding everything — said out loud, with the setting that fixes it
   * named. An investor whose venue is a dollar venue states
   * `minimumExecutablePosition` in `USD`, or states `minimumExecutableWeight` outright
   * and skips currency altogether.
   *
   * ⛔ **An account whose currency is unknown still refuses**, as one whose size is
   * unknown always has. A currency the run never read and a currency it read and found
   * different are not the same fact: the first is nobody having looked.
   */
  minimumExecutablePosition: 500000,
  minimumExecutablePositionCurrency: 'KRW',
})
