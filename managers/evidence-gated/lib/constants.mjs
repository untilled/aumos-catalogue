/**
 * ── The numbers this methodology asserts (issue #133) ──────────────────────
 *
 * `config.schema.json` held eighteen settings and three different kinds of
 * thing were mixed into it: what the investor wants done with their money,
 * what this methodology claims about evidence, and what a venue or a data
 * vendor happens to be like. Only the first is a question an investor can
 * answer, and the second was being asked anyway — *"how many samples does a
 * lens need before it may be promoted"* is this package's claim, not a
 * preference, and putting it on the install screen widened the surface without
 * giving anybody a basis to move it.
 *
 * So the methodology's own numbers live here, in one place, and `lib/` reads
 * them. ⚠️ **One place rather than nine** — the same rule the rest of this
 * package already follows for `LENS_ENVELOPES`: a constant copied into the
 * function that needed it first is a constant that drifts from the document
 * describing it, and #588 in the Aumos repository is what that costs.
 *
 * ⛔ **This file is not a second configuration surface.** Changing one of
 * these is a package revision — a new `version`, a diff a reviewer reads, and
 * `policyLint`'s `immutable` reading applied by hand. That is the trade: the
 * investor loses a knob they had no way to set well, and gains a number that
 * is the same on every machine running this version.
 *
 * ⚠️ Where an operation still accepts one of these as an input, the input is
 * the **caller's** and defaults to the constant. That is how the branches stay
 * reachable from `tools/verify-evidence-gated-allocator.mjs`; it is not an
 * invitation for a run to pass one, and the flow skills do not name any.
 */
/**
 * ── The exit discipline, read by both lanes (issue #153) ──────────────────
 *
 * The source approved these on 2026-07-29 with the reason written beside them:
 * *"무기한 보유는 청산 증거를 만들지 못해 레인 목적과 충돌한다"* — an
 * indefinitely held position produces no closed outcome, and closed outcomes are
 * what every maturity axis in this package is waiting for. 40 trading days is
 * twice the paper track's own d20 maturation, chosen so a mean-reversion setup
 * has time to express itself and no longer than that.
 *
 * ⚠️ **`hardStopPct` is a *maximum* distance here, not the distance.** The
 * source computed −8% against a **1%** lane cell — *"종목당 1% × −8% = 계좌
 * −0.08%"* — and #153 opened a lane where a name may be 20% of the book, where
 * the same −8% is 1.6% of the account on one position. So the main lane derives
 * its stop from the Mandate's `maxDrawdown`, which is the declared limit on that
 * axis and the one `portfolioHeat` already reads, and this number is only ever
 * the ceiling on the answer. ⛔ The derivation can tighten it and can never widen
 * it: a value with an approval history is the widest thing this package will
 * propose.
 *
 * They live outside the object below so `controlArm` and `exitDiscipline` read
 * one copy rather than two — the drift this file's opening paragraph is about.
 */
const EXIT_DISCIPLINE = Object.freeze({
  timeStopTradingDays: 40,
  maximumHardStopPct: -0.08,
})

export const METHODOLOGY = Object.freeze({
  /**
   * ── What is left here, and why none of it is the investor's question (#153) ─
   *
   * The investor's three sizing axes are declared in the Mandate and read from
   * it: `maxPositionWeight` (#133), `maxDrawdown` (#133) and `cashFloor` (#153).
   * The single-name **total** was the last candidate for a package constant —
   * the source's `experiment_total_max_pct_account`, 28% — and it is deliberately
   * not ported: that number was one piece of an allocation that also held a 50%
   * core ETF target, and in an account without that lane it does not mean the
   * same thing. `singleNameBudget` derives the total from `cashFloor` and
   * `maxPositionWeight` instead, so the investor's own two numbers decide it and
   * a change on the fund-settings screen moves the manager.
   *
   * ⛔ **So nothing below answers a question the investor is asked.** Each
   * remaining value is a claim this methodology makes about *evidence* — how
   * many samples a lens needs, how large an unproven claim may be, how long a
   * control-arm position is held before it must produce an outcome — and the
   * argument for each is beside it. Changing one is a package revision with a
   * reviewer, which is a stronger gate than a config field, not a weaker one.
   */
  /** Complete samples before a lens leaves `observing`. */
  minimumLensSamples: 10,
  /**
   * What `promotionGate` requires before a lens may be promoted.
   *
   * ⚠️ **These were three literals inside `promotionGate` and are read from
   * here since #151.** The reason is not tidiness: `effectivePositionCap` has
   * to name the gate a reduced cap unlocks at, and a second copy of the
   * thresholds is a second answer to *"how far away is promotion?"* — the
   * failure this file's opening paragraph is about.
   *
   * ⛔ **`regimes` is the one that cannot be hurried.** Samples and clusters
   * respond to a higher candidate rate; a market regime turns on the calendar,
   * so three of them is years rather than months. That is a fact about this
   * gate the investor is owed before installing, and `README.md` says it — it
   * is not an argument for lowering the number, which `policyLint` would
   * refuse and is right to.
   */
  promotionGate: Object.freeze({ samples: 30, regimes: 3, clusters: 10 }),
  /** Independent date clusters before the same. Samples from one week are one event. */
  minimumIndependentDateClusters: 4,
  /** Closed outcomes after which new-single pacing relaxes from unevaluated to advisory. */
  reviewReadyClosedOutcomes: 10,
  /**
   * Ratio side of the maximum target weight while a lens is insufficient,
   * observing or reviewable. `experimentalCeiling` joins it to
   * `experimentalPositionFloor`, which stays configured because it is a fact
   * about a venue rather than a claim of this methodology.
   */
  experimentalPositionCeiling: 0.01,
  /**
   * The most the floor may lift that ceiling to. 3% sits just above the source
   * methodology's own Experiment-stage size for the name it was ported with
   * (2.6%), so the floor can reproduce what that methodology did and never
   * exceed it.
   */
  experimentalPositionCeilingMax: 0.03,
  /**
   * The control arm's limits — 1% a name, 6% across the lane, six concurrent,
   * and the exit discipline it registers before entry.
   *
   * ⚠️ **These lived in `learning.mjs` and are read from here since #151**, for
   * the same reason `promotionGate`'s thresholds moved: `singleMaxWeight` is
   * the number that actually binds a new single name on an unpromoted book, so
   * `effectivePositionCap` in `sizing.mjs` has to be able to say so, and a
   * lane cap copied into the operation that needed it second is how the two
   * come to disagree. The argument for each value is in `controlArmLane`,
   * which is still the only thing that enforces them.
   */
  controlArm: Object.freeze({
    singleMaxWeight: 0.01,
    laneTotalMaxWeight: 0.06,
    maxConcurrentPositions: 6,
    timeStopTradingDays: EXIT_DISCIPLINE.timeStopTradingDays,
    hardStopPct: EXIT_DISCIPLINE.maximumHardStopPct,
  }),
  /**
   * The exit rule both lanes are held to, and the ceiling on the stop distance.
   * `exitDiscipline` in `lib/envelopes.mjs` is what enforces it; the control arm
   * reads the same two numbers above, because there is one copy of each.
   */
  exitDiscipline: EXIT_DISCIPLINE,
  /**
   * Cash floors this methodology adds on top of the Mandate's `cashFloor`.
   *
   * ⚠️ **Empty since #153, and that is the whole point.** `coreDca.reserveFloorWeight`
   * stood at 0.15 while the investor had declared `cashFloor` 0.10 in «펀드 설정 >
   * 투자 원칙», and this package read only its own copy — the same defect #151 is
   * about, one axis said twice in two numbers, except that this one was not even
   * disclosed. The Kernel enforces the Mandate's (`kernel.ts:1043`, a proposal
   * whose cash target sits under the floor is refused), so the private copy could
   * only ever be the quieter of the two and was silently the one that bound.
   * #133 moved `concentration.position` → `maxPositionWeight` and
   * `concentration.portfolioHeat` → `maxDrawdown` for the same reason; the cash
   * axis was the one left behind.
   *
   * The list stays because `effectiveCashFloor` has to be able to *say* that a
   * methodology floor sits above the declared one — `effectiveConstraints` with
   * `field: 'cashFloor'` — the moment one is ever added again. An empty list is a
   * complete answer, not an absent one: the row is emitted from an inequality
   * that is computed every run rather than from a rule nobody re-reads.
   */
  methodologyCashFloors: Object.freeze([]),
  /**
   * Existing exposure above a cap is carried and new exposure is not. Read by
   * `concentration`, `portfolioHeat` and `harnessAudit` from one place, so the
   * three cannot come to disagree about what the tolerance is.
   */
  grandfather: Object.freeze({ enabled: true, blocksNewNonCoreWhenBreached: true }),
  /**
   * The multiple of its own cap at which a single factor label stops being a
   * measurement and becomes a question about the label. (#141)
   *
   * This package ships no factor taxonomy, for the same reason it ships no
   * universe: what counts as one shared loss path is a judgement about the
   * book, and a list frozen here would be this methodology asserting one. The
   * cost is that a string a run invented becomes a permanent allocation cap,
   * carried forward in Brief prose, and nothing ever looks at it again —
   * `krw-currency` was one, and it stood at 2.08× its cap.
   *
   * ⚠️ **2 is chosen because a lower number would fire on a book that is
   * merely concentrated, and that is already said.** An axis at 1.2× its cap
   * is a breach, and `concentration_breach` reports it as one; asking *"is
   * this label real"* there would put a doubt about the taxonomy on top of
   * every ordinary breach and be tuned out within a run or two. At twice the
   * budget the arithmetic no longer reads as a book that drifted over a limit
   * — a cap nobody could have been operating under is far more often a label
   * that catches more than a loss path does.
   */
  factorLabelReviewMultiple: 2,
  /** Days after `asOf` an undeclared WATCH expiry is derived at. */
  watchExpiryDays: 30,
  /**
   * How close a WATCH has to be before it reports `near` rather than not-met.
   * The original harness's own near bands.
   */
  watchNear: Object.freeze({ priceRatio: 0.03, driftFraction: 0.8, timeDays: 7 }),
})
