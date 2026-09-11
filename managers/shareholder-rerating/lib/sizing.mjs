/**
 * ── How large, and the two numbers it is a function of ─────────────────────
 *
 * A position's size here is not a function of how good the idea is. It is a function
 * of what the idea costs when it is wrong and how much of the book the Mandate says
 * may be spent finding that out:
 *
 *   lossFraction = (entryPrice − invalidationPrice − dividendAlreadyReceived) / entryPrice
 *   rawWeight    = riskBudgetWeight / lossFraction
 *   targetWeight = min(rawWeight, every cap that applies)
 *
 * `riskBudgetWeight` is the share of the whole book that may be lost on this one idea,
 * and `lossFraction` is the share of the position that is lost if the price reaches
 * the level at which this thesis is no longer true. Their ratio is the weight at which
 * those two statements are the same statement.
 *
 * ⚠️ **The line above used to say «the investor's Mandate permits», and on this host
 * that was false** (`untilled/aumos#841`). The Mandate is a closed set of eight fields
 * with no per-idea risk axis in it, so there is no Mandate any investor can write that
 * carries this number — the sentence named a field with no producer anywhere. Where it
 * comes from now is `policy.mjs`: stated wins, a Mandate that was read falls back to
 * the pre-registered `SIZING_POLICY.riskBudgetWeight`, and a run carrying no Mandate at
 * all still refuses. ⛔ This function did not change: it is still handed a number and
 * still refuses without one.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/sizing.mjs`** — the min-of-caps fold,
 * the venue-minimum refusal (`minimum_executable_not_met`, which refuses rather than
 * rounding up), and the rule that an absent cap is `unevaluated` and never a pass.
 * What was left behind is that package's whole policy layer: quarter-Kelly and its
 * conviction term, `effectivePositionCap`'s variant-view gate and unlock arithmetic,
 * the KRW/USD sleeve budget and the maturity lane. This methodology sizes from a
 * declared risk budget and a stated invalidation price, and it has no conviction
 * input — a number a model writes about its own confidence, multiplied into a weight,
 * is a size the model chose.
 *
 * ⛔ **There is no default cap.** An invocation whose Mandate states none is one this
 * package cannot size, and it says so: a ceiling the investor did not answer is not a
 * ceiling a run may choose. ⚠️ The risk **budget** was on that sentence until #841 and
 * had to come off it — the investor is never asked for one, so «no default» meant no
 * run, ever. Its pre-registration lives in `thresholds.mjs` with its derivation.
 */

import { mandateCeilings } from './mandate.mjs'
import { diagnostic, finite, isBlocked, round } from './numbers.mjs'

/**
 * What one share loses on the way to the price that ends the thesis.
 *
 * ⚠️ **A dividend is subtracted from the loss only if the investor would actually be
 * on the register for it before the invalidation review.** An ex-date after that
 * review is a payment to whoever holds the share then, and counting it here would be
 * the same double count `return-composition.mjs` refuses, wearing a cushion's
 * clothes.
 */
export function lossToInvalidation(input = {}) {
  const diagnostics = []
  const { entryPrice, invalidationPrice } = input
  if (!finite(entryPrice) || entryPrice <= 0 || !finite(invalidationPrice)) {
    diagnostics.push(
      diagnostic(
        'invalidation_price_missing',
        'unevaluated',
        'The loss to invalidation needs an entry price and the price at which this thesis stops being true. Without the second there is no size, because there is nothing to divide the risk budget by.',
        'invalidationPrice',
      ),
    )
    return { data: { lossFraction: null }, diagnostics }
  }
  /**
   * ⛔ **A stated invalidation price that is zero or negative is not a price** (#271
   * finding ③.5). Until this check existed, `invalidationPrice: -100` on a ₩16,000 name
   * gave `lossFraction = 1.00625` and **sized a BUY** of 0.99% — the arithmetic was
   * conservative and the input was garbage, and a size computed from garbage is a size
   * the run chose. The value *arrived*, so this is not `data_missing`; the thesis has an
   * invalidation level nobody has actually written, which is `research_incomplete`.
   */
  if (invalidationPrice <= 0) {
    diagnostics.push(
      diagnostic(
        'invalidation_price_not_positive',
        'blocked',
        'The invalidation price is zero or negative, which is not a price a share can trade at. State the level below the entry at which the thesis is wrong; a placeholder here would size a position on a loss that cannot happen.',
        'invalidationPrice',
        { entryPrice: round(entryPrice, 4), invalidationPrice: round(invalidationPrice, 4) },
      ),
    )
    return { data: { lossFraction: null }, diagnostics }
  }
  if (invalidationPrice >= entryPrice) {
    diagnostics.push(
      diagnostic(
        'invalidation_above_entry',
        'blocked',
        'The invalidation price is at or above the entry price, which sizes a position on a loss that has already happened. State the level below the entry at which the thesis is wrong.',
        'invalidationPrice',
        { entryPrice: round(entryPrice, 4), invalidationPrice: round(invalidationPrice, 4) },
      ),
    )
    return { data: { lossFraction: null }, diagnostics }
  }

  let credited = 0
  const dividend = input.dividendBeforeInvalidation
  if (finite(dividend?.perShare) && dividend.perShare > 0) {
    if (dividend.exDateBeforeInvalidation === true) {
      credited = dividend.perShare
      diagnostics.push(
        diagnostic(
          'dividend_credited_against_loss',
          'info',
          'A dividend whose ex-date falls before the invalidation review reduces what the position loses on the way there, and it is the only kind that does.',
          'dividendBeforeInvalidation.perShare',
          { perShare: round(dividend.perShare, 4) },
        ),
      )
    } else {
      diagnostics.push(
        diagnostic(
          'dividend_not_receivable_before_invalidation',
          'warn',
          'This dividend does not go ex before the invalidation review, so the investor is not on the register for it on this path. It is not netted off the loss.',
          'dividendBeforeInvalidation.exDateBeforeInvalidation',
        ),
      )
    }
  }

  const lossFraction = (entryPrice - invalidationPrice - credited) / entryPrice
  return {
    data: {
      lossFraction: round(lossFraction),
      dividendCredited: round(credited, 4),
      units: { lossFraction: 'share-of-position', dividendCredited: 'currency-major-units-per-share' },
    },
    diagnostics,
  }
}

/**
 * The weight this name should **be**, and every cap it had to pass under.
 *
 * ⛔ **This is a total, not an increment, and that distinction is the whole of
 * finding ③.** The risk budget and every cap apply to the final holding; what to
 * propose is that total minus what the account already holds and has already
 * proposed, and the subtraction happens in `index.mjs` where the account is known.
 * The earlier version passed a single-name *headroom* in as a cap, so the answer was
 * a total on a fresh name and an increment on a held one, under one field name — and
 * a host reading it as either was wrong on the other.
 *
 * @param {object} input
 * @param {number} input.riskBudgetWeight        the loss budget for this idea as a share of the book, from `policy.mjs`
 * @param {number} input.lossFraction            from `lossToInvalidation`
 * @param {number} [input.mandatePositionCap] the Mandate's single-name ceiling
 * @param {object} [input.mandate]           the invocation's Mandate, read where the cap above is not stated (#838)
 * @param {number} input.accountNameLimit        `maxTotalWeightForName` from `concentration` — every account axis, folded
 * @param {number} [input.accountNameLimitForReduction] `reductionNameLimit` from `concentration` — the axes that name
 *   *this position*, without the account's leftover room after other names (#833). Absent means the same fold twice
 * @param {number} input.minimumExecutableWeight the smallest position this venue can express, from `policy.mjs`
 */
export function targetWeight(input = {}) {
  /**
   * ── The Mandate, under the host's names (`untilled/aumos#838`) ────────────
   *
   * ⚠️ `input.mandate` is the invocation's Mandate verbatim; `maxPositionWeight`
   * is what this file calls `mandatePositionCap`. ⛔ Stated wins: a caller that
   * names the cap gets its own number, and one that passes no Mandate is
   * unchanged.
   */
  const mandatePositionCap = finite(input.mandatePositionCap)
    ? input.mandatePositionCap
    : mandateCeilings(input.mandate).accountPositionCap
  const diagnostics = []
  const { riskBudgetWeight, lossFraction } = input

  if (!finite(riskBudgetWeight) || riskBudgetWeight <= 0) {
    diagnostics.push(
      diagnostic(
        'risk_budget_not_stated',
        'unevaluated',
        'No risk budget reached this arithmetic. The Mandate has no per-idea risk axis, so this is resolved from the methodology\'s pre-registered budget once a Mandate has been read at all — and a run that carried no Mandate has read nothing and sizes nothing.',
        'riskBudgetWeight',
      ),
    )
  }
  if (!finite(lossFraction) || lossFraction <= 0) {
    diagnostics.push(
      diagnostic(
        'loss_fraction_not_available',
        'unevaluated',
        'Without a loss to invalidation there is nothing to divide the risk budget by.',
        'lossFraction',
      ),
    )
  }
  if (!finite(mandatePositionCap)) {
    diagnostics.push(
      diagnostic(
        'position_cap_not_stated',
        'unevaluated',
        'No single-name cap was stated. An absent cap is nobody having said, not permission — and sizing to a sector or account ceiling instead would be deriving a position limit from a limit on something else.',
        'mandatePositionCap',
      ),
    )
  }
  /**
   * ⛔ **The venue minimum is a refusal gate, so an absent one is not a pass.** Without
   * it this function cannot say whether the weight it computed is a position that can
   * be scaled into and trimmed, or a handful of shares whose result is round-trip cost.
   * It used to be optional and the check was simply skipped, which is the same defect
   * class as findings ①, ② and ④ wearing a different field name.
   */
  if (!finite(input.minimumExecutableWeight)) {
    diagnostics.push(
      diagnostic(
        'minimum_executable_not_stated',
        'unevaluated',
        'The smallest position this venue can express was not stated and could not be derived, so whether the computed weight is executable at all is unknown. It is not assumed to be: it is published as an amount of money in one named currency, and becomes a weight only against a `book.totalValue` denominated in that same currency. State `config.minimumExecutableWeight` to give it as a share of the book instead.',
        'minimumExecutableWeight',
      ),
    )
  }
  if (diagnostics.length > 0) {
    return { data: emptyWeight(), diagnostics }
  }

  /**
   * ── One list of caps, folded twice, and a residual is what separates them (#833) ──
   *
   * ⛔ **`accountNameLimit` folds the account's leftover room after other names
   * into the ceiling on this one, and that is right for «how much may this desk
   * buy» and wrong for «how much should this desk sell».** `concentration`
   * publishes the second fold — the ceilings that name *this position* — and
   * `index.mjs`'s reduction branch is the only thing that reads what comes back
   * from it. With no other name in the bucket the two folds are one number,
   * which is why an ordinary account is byte-for-byte unchanged.
   */
  const capsAgainst = (accountLimit) =>
    [
      ['mandatePositionCap', mandatePositionCap],
      ['accountNameLimit', accountLimit],
    ].filter(([, value]) => finite(value))
  const foldCaps = (rows) =>
    rows.reduce(
      (lowest, [name, value]) => (value < lowest.value ? { name, value } : lowest),
      { name: rows[0][0], value: rows[0][1] },
    )
  const caps = capsAgainst(input.accountNameLimit)
  const binding = foldCaps(caps)
  const reduceBinding = foldCaps(
    capsAgainst(finite(input.accountNameLimitForReduction) ? input.accountNameLimitForReduction : input.accountNameLimit),
  )

  const raw = riskBudgetWeight / lossFraction
  const sized = round(Math.min(raw, Math.max(0, binding.value)))
  const reduceSized = round(Math.min(raw, Math.max(0, reduceBinding.value)))

  if (raw > binding.value) {
    diagnostics.push(
      diagnostic(
        'cap_is_binding',
        'info',
        `The risk arithmetic asks for ${round(raw)} of the book and ${binding.name} allows ${round(binding.value)}. The cap is what this position is sized by, and the proposal says so rather than presenting the ceiling as a calculation.`,
        binding.name,
        { rawWeight: round(raw), bindingCap: round(binding.value), bindingCapName: binding.name },
      ),
    )
  }

  const minimum = input.minimumExecutableWeight
  if (finite(minimum) && sized > 0 && sized + 1e-12 < minimum) {
    diagnostics.push(
      diagnostic(
        'minimum_executable_not_met',
        'blocked',
        'The weight this arithmetic asks for is below the smallest position this venue can express, so there would be no result to measure. It is refused rather than rounded up — a position the calculation did not ask for measures the rounding.',
        'minimumExecutableWeight',
        { targetWeight: sized, minimumExecutableWeight: round(minimum) },
      ),
    )
  }

  const blocked = isBlocked(diagnostics)
  /**
   * ⚠️ **The venue minimum applies to the reduction fold on its own terms.** A
   * target below the smallest position this venue can express is refused
   * whichever fold produced it — and because the reduction fold is never the
   * smaller of the two, this is only ever reached when the entry fold was
   * refused for the same reason. What it stops is the entry fold's refusal
   * travelling to a number it was not measured against.
   */
  const reduceUnexecutable = finite(minimum) && reduceSized > 0 && reduceSized + 1e-12 < minimum
  return {
    data: {
      rawWeight: round(raw),
      bindingCap: round(binding.value),
      bindingCapName: binding.name,
      /**
       * ── The same fold with the account's leftover room left out (#833) ────
       *
       * ⛔ **`index.mjs`'s reduction branch is the only consumer and the entry
       * path does not read this.** A ceiling constrains additions rather than
       * reductions — this package's own sentence since #269 — so a sale is
       * sized by what the arithmetic says this position should be and by the
       * ceilings that name it, never by what is left of a sector or of the
       * whole book after somebody else's names.
       */
      reduceTargetTotalWeight: reduceUnexecutable ? null : reduceSized,
      reduceBindingCapName: reduceBinding.name,
      /** ⚠️ A **total**. What to propose is this minus what the account already carries. */
      targetTotalWeight: blocked ? null : sized,
      riskAtTarget: blocked ? null : round(sized * lossFraction),
      sizing: { mode: 'risk-budget-over-loss-to-invalidation', riskBudgetWeight: round(riskBudgetWeight), lossFraction: round(lossFraction) },
      units: {
        rawWeight: 'portfolio-weight',
        bindingCap: 'portfolio-weight',
        targetTotalWeight: 'portfolio-weight',
        riskAtTarget: 'share-of-book-at-risk',
      },
    },
    diagnostics,
  }
}

function emptyWeight() {
  return {
    rawWeight: null,
    bindingCap: null,
    bindingCapName: null,
    reduceTargetTotalWeight: null,
    reduceBindingCapName: null,
    targetTotalWeight: null,
    riskAtTarget: null,
    units: { targetTotalWeight: 'portfolio-weight' },
  }
}
