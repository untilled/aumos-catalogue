/**
 * ── Two legs, and they are not the same money ──────────────────────────────
 *
 * The whole reason this module exists as code rather than as a sentence in the
 * prompt is that the mistake it prevents is an **addition**, and a model asked to
 * add three yields will add three yields. This methodology's expected total return
 * has exactly two legs:
 *
 *   re-rating   (fairValue / price) − 1        what closing the discount is worth
 *   dividend     dividendPerShare / price      cash that arrives in the investor's account
 *
 * and a company's buyback is in **neither** of them. A buyback is the issuer
 * spending its own cash to retire its own shares: the investor receives nothing, and
 * whatever the programme is worth to them is already inside the re-rating leg,
 * because it arrives as a higher per-share figure against which the fair value was
 * struck. Adding `executedBuyback / marketCap` to a dividend yield is counting the
 * same won twice and calling the second count income.
 *
 * ⛔ So `buybackYield` is computed, reported, and **never summed into
 * `totalReturn`**. `investorCashReturn` is the dividend leg alone. A caller that
 * hands this module a buyback in `addedReturnItems` is refused rather than corrected,
 * because silently dropping it would leave a run believing its number was accepted.
 *
 * ⚠️ **The buyback yield is measured on what was executed, never on what was
 * announced.** An announcement is a sentence; a treasury acquisition report is a
 * transaction. `classify.mjs` is where the gap between the two becomes a case label.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/valuation.mjs`** in one respect only:
 * the habit of returning `{ data, diagnostics }` with a `units` block beside every
 * number, so that a scenario in percent and a scenario in basis points cannot be
 * compared by accident. None of that module's valuation policy was taken.
 */

import { diagnostic, finite, isBlocked, round } from './numbers.mjs'

/** Kinds of return a caller may hand in that are already counted somewhere else. */
const NEVER_ADDED = new Map([
  [
    'buyback',
    'A buyback pays the investor nothing. What it is worth to them is inside the re-rating leg already, through the per-share figures the fair value was struck on, so adding a buyback yield to a cash yield counts the same won twice.',
  ],
  [
    'cancellation',
    'A cancellation is a buyback that cannot be resold. It moves the per-share figures the fair value is struck on, which is the re-rating leg; it is not cash the investor receives.',
  ],
])

/**
 * The composition of expected total return, per scenario.
 *
 * @param {object} input
 * @param {number} input.price                  the last trade, in the asset's own currency
 * @param {{bear:number, base:number, bull:number}} input.fairValue  the conservative range
 * @param {object} [input.fairValueBasis]       `{ method, includesCancellationUplift }`
 * @param {object} [input.cashDividend]         `{ perShare, receivableWithinHorizon, withholdingTaxRate }`
 * @param {object} [input.buyback]              `{ executedAmount, cancelledAmount, marketCap }`
 * @param {Array}  [input.addedReturnItems]     anything the caller tried to add on top
 */
export function returnComposition(input = {}) {
  const diagnostics = []
  const price = input.price
  const fairValue = input.fairValue ?? {}
  const scenarios = ['bear', 'base', 'bull']

  if (!finite(price) || price <= 0) {
    diagnostics.push(
      diagnostic('price_missing', 'unevaluated', 'A total return is a fraction of a price and there is no usable price here. This is an absence, not a finding about the company.', 'price'),
    )
  }
  const missingScenarios = scenarios.filter((name) => !finite(fairValue[name]))
  if (missingScenarios.length > 0) {
    diagnostics.push(
      diagnostic(
        'fair_value_range_incomplete',
        'unevaluated',
        `The conservative range needs all three legs and ${missingScenarios.join(', ')} ${missingScenarios.length === 1 ? 'is' : 'are'} absent. A range with a hole in it is not a bear case; it is a missing input.`,
        'fairValue',
        { missing: missingScenarios },
      ),
    )
  }

  // ── the additions that are refused ───────────────────────────────────────
  for (const [index, item] of (input.addedReturnItems ?? []).entries()) {
    const reason = NEVER_ADDED.get(item?.kind)
    if (reason !== undefined) {
      diagnostics.push(
        diagnostic('shareholder_return_double_counted', 'blocked', reason, `addedReturnItems[${index}]`, {
          kind: item.kind,
          value: item?.value ?? null,
        }),
      )
      continue
    }
    if (item?.kind === 'dividend' && finite(input.cashDividend?.perShare)) {
      diagnostics.push(
        diagnostic(
          'shareholder_return_double_counted',
          'blocked',
          'The cash dividend is already the second leg of this composition. Adding it again as a return item counts one payment twice.',
          `addedReturnItems[${index}]`,
          { kind: item.kind, value: item?.value ?? null },
        ),
      )
      continue
    }
    diagnostics.push(
      diagnostic(
        'added_return_item_unread',
        'warn',
        'This methodology composes a total return out of two legs and reads no third one. The item is reported and it is not in any number below.',
        `addedReturnItems[${index}]`,
        { kind: item?.kind ?? null },
      ),
    )
  }

  // ── the dividend leg, which is the only cash ─────────────────────────────
  const dividend = input.cashDividend ?? {}
  let grossYield = null
  let netYield = null
  let taxRate = null
  if (finite(price) && price > 0 && finite(dividend.perShare)) {
    if (dividend.receivableWithinHorizon === false) {
      diagnostics.push(
        diagnostic(
          'dividend_not_receivable',
          'warn',
          'The declared dividend is not receivable on this holding period — the ex-date sits outside it — so it is not in the total return. A dividend the investor cannot be on the register for is the issuer\'s payment to somebody else.',
          'cashDividend.receivableWithinHorizon',
        ),
      )
      grossYield = 0
      netYield = 0
    } else {
      grossYield = dividend.perShare / price
      if (finite(dividend.withholdingTaxRate)) {
        taxRate = dividend.withholdingTaxRate
        netYield = grossYield * (1 - taxRate)
      } else {
        netYield = grossYield
        diagnostics.push(
          diagnostic(
            'dividend_tax_not_stated',
            'warn',
            'No withholding rate was stated, so the dividend leg below is pre-tax and the total return is therefore an upper bound on what the investor keeps. Say so wherever this figure is quoted.',
            'cashDividend.withholdingTaxRate',
          ),
        )
      }
    }
  } else if (finite(price)) {
    diagnostics.push(
      diagnostic(
        'dividend_not_stated',
        'unevaluated',
        'No cash dividend was stated for the holding period. The re-rating leg stands on its own; the total return below is missing whatever cash there turns out to be.',
        'cashDividend.perShare',
      ),
    )
    grossYield = 0
    netYield = 0
  }

  // ── the programme, reported beside the return and never inside it ────────
  const buyback = input.buyback ?? {}
  const marketCap = buyback.marketCap
  const yieldOf = (amount) =>
    finite(amount) && finite(marketCap) && marketCap > 0 ? round(amount / marketCap) : null
  const buybackYield = yieldOf(buyback.executedAmount)
  const cancellationYield = yieldOf(buyback.cancelledAmount)
  if (input.fairValueBasis?.includesCancellationUplift === true) {
    diagnostics.push(
      diagnostic(
        'cancellation_inside_fair_value',
        'info',
        'The fair value was struck on per-share figures that already carry the cancellation, so the programme is inside the re-rating leg. Quoting the cancellation yield again anywhere in the expected return is the double count this module refuses.',
        'fairValueBasis.includesCancellationUplift',
      ),
    )
  }

  const blocked = isBlocked(diagnostics)
  const computable = finite(price) && price > 0 && missingScenarios.length === 0 && finite(netYield) && !blocked

  const rerating = {}
  const totalReturn = {}
  for (const name of scenarios) {
    rerating[name] = computable ? round(fairValue[name] / price - 1) : null
    totalReturn[name] = computable ? round(fairValue[name] / price - 1 + netYield) : null
  }

  return {
    data: {
      rerating,
      /** The investor's cash leg. Nothing the company does to its own share count is in here. */
      investorCashReturn: computable ? round(netYield) : null,
      dividendYieldGross: finite(grossYield) ? round(grossYield) : null,
      withholdingTaxRateUsed: taxRate,
      totalReturn,
      /** Reported. Never summed. See this file's opening note. */
      buybackYield,
      cancellationYield,
      buybackIncludedInInvestorReturn: false,
      /** How far below the base case the price is — the entry's headroom, before any cap. */
      discountToBase: computable ? round(fairValue.base / price - 1) : null,
      units: {
        rerating: 'holding-period-return',
        investorCashReturn: 'holding-period-return',
        totalReturn: 'holding-period-return',
        buybackYield: 'programme-value-over-market-cap',
        cancellationYield: 'programme-value-over-market-cap',
        discountToBase: 'holding-period-return',
      },
    },
    diagnostics,
  }
}
