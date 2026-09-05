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
export const METHODOLOGY = Object.freeze({
  /** Complete samples before a lens leaves `observing`. */
  minimumLensSamples: 10,
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
