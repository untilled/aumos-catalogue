/**
 * `fundamental-mean-reversion`'s side of the shared scenario suite.
 *
 * ⛔ **It runs `positionSizing` and does not run `classifyCase`.** The
 * classification is a technical-and-damage state machine over fourteen outcomes —
 * this package's methodology — and the four contracts are all underneath it:
 * `positionSizing` is where the book is read, where every ceiling is folded and
 * where the (total, increment) pair is published.
 *
 * ── The one thing this adapter adds, said out loud ─────────────────────────
 *
 * ⚠️ **A price series.** Alone of the three, this package measures a gap haircut
 * and a liquidity ceiling off bars, and it refuses — correctly — when it cannot.
 * The scenarios are about the *account*, so the adapter hands it a flat synthetic
 * series long enough to be measurable, with a volume large enough that liquidity
 * is never the binding ceiling. That is a translation and it is the adapter's
 * only one: it makes the tape a non-subject so that the account is the subject.
 * ⛔ It is not allowed to make an account question easier, and it does not — no
 * holding, no proposal, no cap and no attribution comes from here.
 */

import { positionSizing } from '../../../managers/fundamental-mean-reversion/lib/index.mjs'
import { SECTOR, SYMBOL, THIS_DESK } from '../scenarios.mjs'

export const PACKAGE = 'fundamental-mean-reversion'

/** The fund, in the same units the bars are priced in. */
const NAV = 5_000_000_000

/**
 * A flat series: 40 bars, one price, a volume that puts the liquidity ceiling far
 * above every cap in these scenarios. Flat means the measured worst session is 0
 * and the haircut is this package's own floor — a stated bound, reached by
 * measurement rather than by the absence of one.
 */
const BARS = Array.from({ length: 40 }, (unused, index) => ({
  t: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  close: 100,
  volume: 10_000_000,
}))

const rows = (list, field) =>
  list === 'unread'
    ? undefined
    : list.map((row) => ({ symbol: SYMBOL, sector: SECTOR, [field]: row[field], ...(row.strategy === undefined ? {} : { strategy: row.strategy }) }))

export function run(scenario) {
  const { holdings, pending, mandate: declared } = scenario.situation
  const mandate = declared === 'unread' ? {} : { ...declared }

  const answer = positionSizing({
    symbol: SYMBOL,
    sector: SECTOR,
    strategyId: THIS_DESK,
    entryPrice: scenario.thesis.entryPrice,
    invalidationPrice: scenario.thesis.invalidationPrice,
    nav: NAV,
    bars: BARS,
    execution: { halted: false, dailyPriceLimit: false },
    mandate,
    book: { holdings: rows(holdings, 'weight'), openProposals: rows(pending, 'targetWeight') },
  })

  const refused = answer.status !== 'ok'
  const exposure = answer.exposure?.existingWeight ?? null
  const total = refused ? null : answer.targetTotalWeight
  const increment = refused ? null : answer.incrementalWeight

  return {
    package: PACKAGE,
    approvesIncrease: increment !== null && increment > 0,
    cause: refused ? (answer.code ?? null) : null,
    exposure,
    cap: refused ? null : answer.targetTotalWeight,
    total,
    increment,
    /**
     * ⚠️ **Every ceiling here is measured against what *others* hold**, so the
     * total is this desk's share and the increment is taken against this desk's
     * own weight. Same relation as the other two, a different base.
     */
    incrementBase: refused ? null : (answer.exposure?.ownWeight ?? null),
  }
}
