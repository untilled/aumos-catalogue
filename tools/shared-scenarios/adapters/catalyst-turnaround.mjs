/**
 * `catalyst-turnaround`'s side of the shared scenario suite.
 *
 * ⛔ **It wires `accountConcentration` and `targetWeight` and does not run
 * `runVerdict`.** The verdict is a catalyst state machine over a ledger, a
 * recovery comparison and a survivability reading — this package's methodology,
 * which #256 assigns to it and which the other two do not have. What it does
 * reproduce is the three lines `runVerdict` puts between those two functions and
 * the answer: the headroom it passes to the sizing, `mayIncrease` (a run holding
 * any `data_missing` may not increase an exposure), and the increment as
 * `cumulative − this desk's own holding`.
 *
 * ⚠️ **`readDeclared`'s three-state reading is this package's alone**, and the
 * adapter must not invent the third state on the scenario's behalf: a Mandate the
 * situation says was read is passed verbatim, and a Mandate it says was never read
 * is passed as nothing at all. Passing `'not-declared'` here where the situation
 * states an unread Mandate would be the adapter answering the scenario's question.
 */

import { accountConcentration, lossToInvalidation, targetWeight } from '../../../managers/catalyst-turnaround/lib/index.mjs'
import { SECTOR, SYMBOL, THIS_DESK } from '../scenarios.mjs'

export const PACKAGE = 'catalyst-turnaround'

const rows = (list, field) =>
  list === 'unread'
    ? undefined
    : list.map((row) => ({ symbol: SYMBOL, sector: SECTOR, [field]: row[field], ...(row.strategy === undefined ? {} : { strategy: row.strategy }) }))

/** The four codes #256 keeps apart, in the order a reader needs them: an absence before a limit. */
const CAUSE_ORDER = ['data_missing', 'research_incomplete', 'thesis_refuted', 'risk_limit_exceeded']
const firstCause = (causes) => CAUSE_ORDER.find((code) => causes.some((entry) => entry.code === code)) ?? null

export function run(scenario) {
  const { holdings, pending, mandate: declared } = scenario.situation
  const mandate = declared === 'unread' ? undefined : { ...declared }

  const concentration = accountConcentration({
    positions: rows(holdings, 'weight'),
    proposals: rows(pending, 'targetWeight'),
    caps: mandate === undefined ? {} : { mandate },
    strategy: THIS_DESK,
    candidate: { symbol: SYMBOL, sector: SECTOR },
  })
  const readable = concentration.data.readable === true
  const headroom = readable ? (concentration.data.headroom[SYMBOL] ?? concentration.data.unusedHeadroom) : undefined
  const heldOnlyHeadroom = readable ? (concentration.data.heldOnlyHeadroom?.[SYMBOL] ?? concentration.data.unusedHeadroom) : undefined
  const invalidation = lossToInvalidation({ price: scenario.thesis.entryPrice, invalidationPrice: scenario.thesis.invalidationPrice })
  const sizing = targetWeight({
    expectedActiveReturn: scenario.thesis.expectedActiveReturn,
    stopDistance: invalidation.data.stopDistance,
    conviction: scenario.thesis.conviction,
    mandate,
    accountHeadroom: headroom,
    heldOnlyAccountHeadroom: heldOnlyHeadroom,
  })

  const causes = [...concentration.causes, ...sizing.causes]
  /** `runVerdict`'s structural gate, verbatim: any unread input and no exposure may be increased. */
  const mayIncrease = !causes.some((entry) => entry.code === 'data_missing')
  const ownHeld = readable ? (concentration.data.ownHeld?.[SYMBOL] ?? 0) : null
  const total = sizing.data.targetWeight
  const increment = mayIncrease && typeof total === 'number' && typeof ownHeld === 'number'
    ? Math.max(0, Number((total - ownHeld).toFixed(8)))
    : null

  const exposure = readable
    ? (concentration.data.rows.find((row) => row.symbol === SYMBOL)?.total ?? 0)
    : null

  let cause = firstCause(causes)
  if (cause === null && increment !== null && increment <= 0 && total === 0) cause = 'risk_limit_exceeded'

  return {
    package: PACKAGE,
    approvesIncrease: increment !== null && increment > 0,
    cause,
    exposure,
    cap: readable ? concentration.data.accountCap : null,
    total,
    increment,
    /**
     * ⚠️ **This package's total is *this desk's share* of the position**, so the
     * increment is taken against what this desk holds rather than against the
     * whole name. The runner checks the relation and not the number.
     */
    incrementBase: ownHeld,
  }
}
