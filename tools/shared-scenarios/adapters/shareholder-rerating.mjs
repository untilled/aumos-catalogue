/**
 * `shareholder-rerating`'s side of the shared scenario suite.
 *
 * ⚠️ **An adapter is where a scenario can be quietly translated into something
 * the package finds easy**, which is the risk the survey named when it proposed
 * this shape. The mitigations are that it lives beside the scenarios, that it
 * adds nothing to the situation that the situation does not state, and that it
 * wires the same two functions in the same order `lib/index.mjs` does on its buy
 * path — `concentration` for the account, then `targetWeight` for the size, with
 * the increment taken against what the account already carries.
 *
 * ⛔ **It stops at the exposure-and-sizing boundary and does not run
 * `evaluateCase`.** The four contracts live here; what sits above them is this
 * package's own classification of a shareholder-return case, and #256 assigns
 * that to the package. Reaching for the verdict would mean writing a
 * shareholder-return thesis into a scenario the other two would have to be
 * handed as a catalyst and as a mean reversion — three different situations
 * wearing one id, which is the failure this suite exists to avoid.
 */

import { concentration, lossToInvalidation, sizingPolicy, targetWeight } from '../../../managers/shareholder-rerating/lib/index.mjs'
import { SECTOR, SYMBOL, THIS_DESK } from '../scenarios.mjs'

export const PACKAGE = 'shareholder-rerating'

/**
 * ⚠️ **A won book, large enough that this package's venue minimum is not the
 * subject.** The floor is money (`untilled/aumos#845`) and it has to be
 * expressible before anything sizes; the scenarios are about the account and the
 * caps, so the book is stated in the currency the Mandate declares and at a size
 * where 500,000 KRW is 1e-7 of it.
 */
const BOOK_TOTAL_VALUE = 5_000_000_000

const rows = (list, field) =>
  list === 'unread'
    ? undefined
    : list.map((row) => ({ symbol: SYMBOL, sector: SECTOR, [field]: row[field], ...(row.strategy === undefined ? {} : { strategy: row.strategy }) }))

export function run(scenario) {
  const { holdings, pending, mandate: declared } = scenario.situation
  const mandate = declared === 'unread' ? {} : { ...declared }

  const account = {
    holdings: rows(holdings, 'weight'),
    openProposals: rows(pending, 'targetWeight'),
    caps: { mandate },
    strategy: THIS_DESK,
  }
  const exposure = concentration({ proposed: { symbol: SYMBOL, sector: SECTOR, weight: 0 }, ...account })
  const policy = sizingPolicy({ mandate, book: { totalValue: BOOK_TOTAL_VALUE } })
  const loss = lossToInvalidation({ entryPrice: scenario.thesis.entryPrice, invalidationPrice: scenario.thesis.invalidationPrice })
  const sized = targetWeight({
    riskBudgetWeight: policy.riskBudgetWeight ?? undefined,
    lossFraction: loss.data.lossFraction,
    mandate,
    accountNameLimit: exposure.data.maxTotalWeightForName ?? undefined,
    accountNameLimitForReduction: exposure.data.reductionNameLimit ?? undefined,
    minimumExecutableWeight: policy.minimumExecutableWeight ?? undefined,
  })

  /** `withinLimits === true` or there is no increase — `null` is not a pass and `false` is a full book. */
  const withinLimits = exposure.data.withinLimits
  const total = sized.data.targetTotalWeight
  const base = exposure.data.existingExposure
  const increment = withinLimits === true && typeof total === 'number' && typeof base === 'number'
    ? Math.max(0, round8(total - base))
    : null

  let cause = null
  if (withinLimits !== true) {
    cause = exposure.data.outcomeCode
  } else if (total === null) {
    cause = 'data_missing'
  } else if (total <= 0) {
    cause = 'risk_limit_exceeded'
  }

  return {
    package: PACKAGE,
    approvesIncrease: increment !== null && increment > 0,
    cause,
    exposure: base,
    cap: exposure.data.maxTotalWeightForName,
    total,
    increment,
    /** What the total is measured from, so the runner can check `increment = max(0, total − base)`. */
    incrementBase: base,
  }
}

const round8 = (value) => Number(value.toFixed(8))
