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
 * `riskBudgetWeight` is the share of the whole book the investor's Mandate permits to
 * be lost on this one idea, and `lossFraction` is the share of the position that is
 * lost if the price reaches the level at which this thesis is no longer true. Their
 * ratio is the weight at which those two statements are the same statement.
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
 * ⛔ **There is no default risk budget and no default cap.** An invocation whose
 * Mandate states neither is one this package cannot size, and it says so. A fallback
 * here would be a position the investor never approved the size of.
 */

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
 * The weight, and every cap it had to pass under.
 *
 * @param {object} input
 * @param {number} input.riskBudgetWeight        the Mandate's loss budget for this idea, as a share of the book
 * @param {number} input.lossFraction            from `lossToInvalidation`
 * @param {number} input.mandatePositionCap      the Mandate's single-name ceiling
 * @param {number} [input.sectorHeadroom]        what is left under the sector ceiling
 * @param {number} [input.accountHeadroom]       what is left under the whole-account ceiling
 * @param {number} [input.minimumExecutableWeight] the smallest position this venue can express
 */
export function targetWeight(input = {}) {
  const diagnostics = []
  const { riskBudgetWeight, lossFraction } = input

  if (!finite(riskBudgetWeight) || riskBudgetWeight <= 0) {
    diagnostics.push(
      diagnostic(
        'risk_budget_not_stated',
        'unevaluated',
        'The Mandate states how much of the book may be lost on one idea, and this invocation did not carry it. This package has no default: a size chosen here is a size the investor never approved.',
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
  if (!finite(input.mandatePositionCap)) {
    diagnostics.push(
      diagnostic(
        'position_cap_not_stated',
        'unevaluated',
        'No single-name cap was stated. An absent cap is nobody having said, not permission — and sizing to a sector or account ceiling instead would be deriving a position limit from a limit on something else.',
        'mandatePositionCap',
      ),
    )
  }
  if (diagnostics.length > 0) {
    return { data: emptyWeight(), diagnostics }
  }

  const caps = [
    ['mandatePositionCap', input.mandatePositionCap],
    ['sectorHeadroom', input.sectorHeadroom],
    ['accountHeadroom', input.accountHeadroom],
  ].filter(([, value]) => finite(value))
  const binding = caps.reduce(
    (lowest, [name, value]) => (value < lowest.value ? { name, value } : lowest),
    { name: caps[0][0], value: caps[0][1] },
  )

  const raw = riskBudgetWeight / lossFraction
  const sized = round(Math.min(raw, Math.max(0, binding.value)))

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
  return {
    data: {
      rawWeight: round(raw),
      bindingCap: round(binding.value),
      bindingCapName: binding.name,
      targetWeight: blocked ? null : sized,
      riskAtTarget: blocked ? null : round(sized * lossFraction),
      sizing: { mode: 'risk-budget-over-loss-to-invalidation', riskBudgetWeight: round(riskBudgetWeight), lossFraction: round(lossFraction) },
      units: {
        rawWeight: 'portfolio-weight',
        bindingCap: 'portfolio-weight',
        targetWeight: 'portfolio-weight',
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
    targetWeight: null,
    riskAtTarget: null,
    units: { targetWeight: 'portfolio-weight' },
  }
}
