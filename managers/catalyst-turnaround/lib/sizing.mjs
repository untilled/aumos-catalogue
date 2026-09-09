import { METHODOLOGY } from './constants.mjs'
import { cause, diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── What a wrong answer costs, and therefore how large the position is ─────
 *
 * #256: «무효화 가격까지의 손실과 유동성을 반영해 목표 비중을 계산한다. 상한을
 * 기본 주문 비중으로 사용하지 않는다.» The cap is a ceiling and never the order.
 * So the size is computed from the distance to the price at which this
 * methodology says it was wrong, and the cap is applied afterwards as a `min`.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/sizing.mjs`** — the
 * quarter-Kelly arithmetic (`edge = p − (1−p)/b`, `riskBudget = f·max(0,edge)`,
 * `raw = riskBudget / stopDistance`) and the `min(raw, caps…)` shape are that
 * file's `targetWeight`, taken because they are arithmetic. Left behind: its
 * lanes, its maturity attribution, its unlock-delta disclosure machinery and its
 * grandfathering policy — all of which are evidence-gated's policy about
 * evidence-gated's gates.
 */

/**
 * The distance to being wrong, as a fraction of the current price.
 *
 * `stopDistance = (price − invalidationPrice) / price`
 *
 * ⛔ It is the **price** invalidation and not the business one. #258 asks for
 * both, and only this one has a number in it; the business invalidation is a
 * condition the ledger and the recovery comparison judge, and it closes a
 * position outright rather than sizing it.
 */
export function lossToInvalidation({ price, invalidationPrice } = {}) {
  const diagnostics = []
  if (!finite(price) || price <= 0 || !finite(invalidationPrice) || invalidationPrice <= 0) {
    diagnostics.push(diagnostic('invalidation_inputs_missing', 'blocked', 'A positive current price and a positive price invalidation level are required before anything can be sized', 'invalidationPrice'))
    return { data: { stopDistance: null }, diagnostics }
  }
  if (invalidationPrice >= price) {
    diagnostics.push(
      diagnostic('invalidation_above_price', 'blocked', 'The price invalidation sits at or above the current price, so the position would open already wrong. This is usually a level copied from a stale plan', 'invalidationPrice', {
        price,
        invalidationPrice,
      }),
    )
    return { data: { stopDistance: null }, diagnostics }
  }
  return {
    data: { stopDistance: round((price - invalidationPrice) / price), price, invalidationPrice, units: { stopDistance: 'fraction-of-price' } },
    diagnostics,
  }
}

/**
 * The target weight, and the arithmetic that produced it, so a reader can see
 * that it is not the cap.
 */
export function targetWeight({
  expectedActiveReturn,
  stopDistance,
  conviction,
  mandatePositionCap = null,
  accountHeadroom = null,
  config = {},
} = {}) {
  const diagnostics = []
  const causes = []
  const kellyFraction = finite(config.kellyFraction) ? config.kellyFraction : METHODOLOGY.kellyFraction
  const houseCap = finite(config.defaultSingleNameCap) ? config.defaultSingleNameCap : METHODOLOGY.defaultSingleNameCap

  if (![expectedActiveReturn, stopDistance, conviction].every(finite)) {
    causes.push(cause('data_missing', 'Sizing needs the expected active return, the distance to invalidation and a stated conviction. Any one of them missing and the answer is a weight this run made up', 'sizing'))
    return { data: { targetWeight: null }, diagnostics, causes }
  }
  if (stopDistance <= 0 || conviction < 0 || conviction > 1) {
    diagnostics.push(diagnostic('sizing_inputs_invalid', 'blocked', 'stopDistance must be positive and conviction must lie in [0,1]', 'sizing'))
    return { data: { targetWeight: null }, diagnostics, causes }
  }

  const rewardRisk = expectedActiveReturn / stopDistance
  const edge = rewardRisk > 0 ? conviction - (1 - conviction) / rewardRisk : -1
  const riskBudget = kellyFraction * Math.max(0, edge)
  const raw = riskBudget / stopDistance

  if (edge <= 0) {
    diagnostics.push(
      diagnostic('position_edge_not_positive', 'note', 'At this reward-to-risk and this conviction the edge is not positive, so the arithmetic sizes the position at zero rather than at something small. The answer is that the bet is not worth taking at these odds, and it is reported rather than rounded up', 'conviction', {
        rewardRisk: round(rewardRisk),
        conviction,
        edge: round(edge),
      }),
    )
  }

  const caps = [houseCap, mandatePositionCap, accountHeadroom].filter(finite)
  const bindingCap = caps.length > 0 ? Math.max(0, Math.min(...caps)) : 0
  const sized = round(Math.min(raw, bindingCap))
  const capBinds = raw > bindingCap

  if (finite(accountHeadroom) && accountHeadroom <= 0) {
    causes.push(
      cause('risk_limit_exceeded', 'The whole-account concentration limit for this name is already taken by holdings and open proposals elsewhere, so there is no room for this one whatever the thesis says', 'accountHeadroom', {
        accountHeadroom,
      }),
    )
  }

  return {
    data: {
      targetWeight: sized,
      rawWeight: round(raw),
      bindingCap: round(bindingCap),
      capBinds,
      sizing: {
        mode: 'quarter-kelly',
        kellyFraction,
        rewardRisk: round(rewardRisk),
        conviction,
        edge: round(edge),
        riskBudget: round(riskBudget),
        stopDistance: round(stopDistance),
      },
      caps: { house: houseCap, mandate: mandatePositionCap, accountHeadroom },
      units: { targetWeight: 'portfolio-weight', rawWeight: 'portfolio-weight', bindingCap: 'portfolio-weight' },
    },
    diagnostics,
    causes,
  }
}

/**
 * ── One book, one position, however many theses ────────────────────────────
 *
 * #256 is explicit twice over and both halves are here:
 *
 *   «같은 펀드에서는 전체 실제 보유량과 **미결 제안**을 기준으로 중복 노출을
 *   계산한다» — so open proposals count as exposure before they are filled, and
 *
 *   «전략별 한도를 더해 계좌 한도를 늘릴 수 없다» — so a set of per-strategy caps
 *   that happens to add up to more than the account cap does not raise it. That
 *   is checked as its own finding rather than left to arithmetic: three
 *   strategies each allowed 0.10 of one name is not 0.30 of it, and the way that
 *   mistake reaches a book is that nobody ever adds the three numbers up.
 *
 * ⚠️ **A proposal restates the strategy's own holding; it does not stack on it.**
 * That is `managers/evidence-gated/lib/sizing.mjs`'s `concentration` rule and it
 * is derived from there: proposals are the target state for the names they
 * mention, so summing a 0.25 holding and a 0.15 trim proposal to 0.40 would
 * refuse the trim as if it were a purchase. What is *not* derived is the axis
 * set — evidence-gated folds sector, theme and factor as well, and this package
 * makes a single-name claim only.
 */
export function accountConcentration({ positions = [], proposals = [], caps = {}, strategy = null } = {}) {
  const diagnostics = []
  const causes = []
  const accountCap = finite(caps.accountSingleName) ? caps.accountSingleName : METHODOLOGY.defaultSingleNameCap
  const strategyCaps = caps.perStrategy ?? {}

  const strategyCapTotal = round(Object.values(strategyCaps).filter(finite).reduce((total, value) => total + value, 0))
  if (finite(strategyCapTotal) && strategyCapTotal > accountCap) {
    diagnostics.push(
      diagnostic('per_strategy_caps_exceed_account_cap', 'note', `The per-strategy single-name caps add to ${strategyCapTotal} and the account allows ${accountCap}. The account cap binds; the sum is not a larger limit and was never one`, 'caps.perStrategy', {
        strategyCapTotal,
        accountCap,
        perStrategy: strategyCaps,
      }),
    )
  }

  const key = (row) => `${row?.strategy ?? 'unattributed'}::${row?.symbol}`
  const restated = new Set(proposals.map(key))

  const bySymbol = new Map()
  const add = (row, source) => {
    if (typeof row?.symbol !== 'string' || !row.symbol) {
      diagnostics.push(diagnostic('exposure_row_unnamed', 'blocked', 'Every exposure row names the symbol it is exposure to', source))
      return
    }
    if (!finite(row?.weight) || row.weight < 0) {
      diagnostics.push(diagnostic('exposure_weight_invalid', 'blocked', 'Weights are non-negative numbers', `${source}[${row.symbol}]`))
      return
    }
    const entry = bySymbol.get(row.symbol) ?? { symbol: row.symbol, held: 0, proposed: 0, byStrategy: {}, otherStrategies: 0 }
    entry[source === 'positions' ? 'held' : 'proposed'] += row.weight
    entry.byStrategy[row.strategy ?? 'unattributed'] = round((entry.byStrategy[row.strategy ?? 'unattributed'] ?? 0) + row.weight)
    if ((row.strategy ?? 'unattributed') !== strategy) entry.otherStrategies = round(entry.otherStrategies + row.weight)
    bySymbol.set(row.symbol, entry)
  }

  for (const row of positions) {
    if (restated.has(key(row))) continue
    add(row, 'positions')
  }
  for (const row of proposals) add(row, 'proposals')

  const rows = []
  for (const entry of bySymbol.values()) {
    const total = round(entry.held + entry.proposed)
    const strategyCap = finite(strategyCaps[strategy]) ? strategyCaps[strategy] : accountCap
    /**
     * What is left for *this* strategy in *this* name. The binding limit is the
     * smaller of the account's and this strategy's, minus whatever every other
     * strategy is already holding or has already proposed — which is the line
     * that makes the per-strategy caps unable to sum.
     */
    const row = {
      symbol: entry.symbol,
      held: round(entry.held),
      proposed: round(entry.proposed),
      total,
      byStrategy: entry.byStrategy,
      accountCap,
      breach: total > accountCap,
      headroomForStrategy: round(Math.max(0, Math.min(accountCap, strategyCap) - entry.otherStrategies)),
    }
    if (row.breach) {
      causes.push(
        cause('risk_limit_exceeded', `${entry.symbol} reaches ${total} of the book across real holdings and open proposals, past the account limit of ${accountCap}. Holding one name under two theses is still one position`, `concentration[${entry.symbol}]`, {
          held: row.held,
          proposed: row.proposed,
          accountCap,
        }),
      )
    }
    rows.push(row)
  }
  rows.sort((left, right) => left.symbol.localeCompare(right.symbol))

  /**
   * A name nobody holds and nobody has proposed has no row above, and its
   * headroom is still a number this run needs. `unusedHeadroom` is that answer.
   */
  const unusedHeadroom = round(Math.min(accountCap, finite(strategyCaps[strategy]) ? strategyCaps[strategy] : accountCap))

  return {
    data: {
      rows,
      accountCap,
      strategyCapTotal,
      unusedHeadroom,
      headroom: Object.fromEntries(rows.map((row) => [row.symbol, row.headroomForStrategy])),
      breaches: rows.filter((row) => row.breach).map((row) => row.symbol),
      units: { held: 'portfolio-weight', proposed: 'portfolio-weight', total: 'portfolio-weight' },
    },
    diagnostics,
    causes,
  }
}
