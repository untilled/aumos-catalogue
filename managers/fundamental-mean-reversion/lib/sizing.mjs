/**
 * How large the position may be, and what it costs when the thesis is wrong.
 *
 * ── The two things this file refuses to let a run forget ───────────────────
 *
 * ⑴ **A stop price is not a fill.** #259 says so and this is where it becomes a
 * number: the loss the sizing is done against is the distance to invalidation
 * **plus** a haircut for the session that opens through it. On KRX the ±30%
 * daily limit is not protection, it is the mechanism — a limit-down day is a day
 * on which the stop is a wish, and a halt is a day on which it is not even that.
 * A sizing that used the nominal distance would be sizing against a fill the
 * venue does not promise.
 *
 * ⑵ **The account's limit is the account's.** Exposure is counted over every
 * real holding **and** every open proposal on the same fund, whichever manager
 * or thesis produced it, because #256 fixes that per-strategy limits may never
 * sum into a larger account limit. A name held by another manager is held; a
 * proposal awaiting approval is exposure that has already been asked for.
 *
 * ⚠️ **The cap is not the order.** `mandate.singleNameCap` is the ceiling and
 * never the default weight — the weight comes from the risk budget divided by
 * the effective loss, and the cap only ever makes it smaller.
 */
import { THRESHOLDS, diagnostic, finite, narrowingOnly, round } from './core.mjs'

/**
 * The worst single-session downside move in the recent series, as the fraction
 * of price a gap can cost between one close and the next open.
 *
 * ⚠️ **Measured, floored and capped.** Measured, because a name that has already
 * gapped 12% is a name that gaps; floored at 3%, because a quiet history is not
 * a promise; capped at 15%, because one crash session would otherwise size every
 * position after it to nothing and that is a different methodology.
 */
export function gapHaircut(bars, { halted = false, dailyPriceLimit = false } = {}) {
  const rules = THRESHOLDS.sizing
  const window = (Array.isArray(bars) ? bars : []).slice(-rules.gapWindowBars)
  let worst = 0
  for (let index = 1; index < window.length; index += 1) {
    const previous = window[index - 1].close
    const current = window[index].close
    if (!finite(previous) || !finite(current) || previous <= 0) continue
    const move = current / previous - 1
    if (move < worst) worst = move
  }
  const measured = Math.abs(worst)
  const bounded = Math.min(Math.max(measured, rules.gapHaircutFloor), rules.gapHaircutCap)
  const executionRisk = halted || dailyPriceLimit ? rules.haltHaircut : 0
  return {
    measuredWorstSession: round(measured),
    bounded: round(bounded),
    executionRisk,
    total: round(bounded + executionRisk),
    floor: rules.gapHaircutFloor,
    cap: rules.gapHaircutCap,
    halted,
    dailyPriceLimit,
  }
}

/**
 * Exposure to one name across the whole fund — real holdings and open proposals
 * together, with the per-strategy split carried but never used as a limit.
 */
export function concentration(book, symbol) {
  const holdings = Array.isArray(book?.holdings) ? book.holdings : []
  const proposals = Array.isArray(book?.openProposals) ? book.openProposals : []
  const held = holdings.filter((row) => row.symbol === symbol)
  const proposed = proposals.filter((row) => row.symbol === symbol)
  const sum = (rows, key) => round(rows.reduce((total, row) => total + (finite(row[key]) ? row[key] : 0), 0))
  const heldWeight = sum(held, 'weight')
  const proposedWeight = sum(proposed, 'targetWeight')
  const byStrategy = {}
  for (const row of held) byStrategy[row.strategy ?? 'unattributed'] = round((byStrategy[row.strategy ?? 'unattributed'] ?? 0) + (finite(row.weight) ? row.weight : 0))
  for (const row of proposed) byStrategy[row.strategy ?? 'unattributed'] = round((byStrategy[row.strategy ?? 'unattributed'] ?? 0) + (finite(row.targetWeight) ? row.targetWeight : 0))
  return {
    symbol,
    heldWeight,
    proposedWeight,
    /** The number every cap below is measured against. One position, one quantity. */
    existingWeight: round(heldWeight + proposedWeight),
    byStrategy,
    grossHeld: sum(holdings, 'weight'),
    grossProposed: sum(proposals, 'targetWeight'),
    grossExisting: round(sum(holdings, 'weight') + sum(proposals, 'targetWeight')),
  }
}

/**
 * The target weight, the cumulative staged target, and the loss the book takes
 * if the thesis reaches its invalidation.
 */
export function positionSizing(input = {}) {
  const diagnostics = []
  const rules = THRESHOLDS.sizing
  const { symbol, entryPrice, invalidationPrice, nav, bars = [], mandate = {}, book = {}, config = {}, execution = {} } = input

  if (!finite(entryPrice) || entryPrice <= 0 || !finite(invalidationPrice) || invalidationPrice <= 0) {
    diagnostics.push(diagnostic('sizing_prices_unreadable', 'blocked', 'A sizing needs a positive entry price and a positive invalidation price', 'input', { entryPrice, invalidationPrice }))
    return { status: 'refused', code: 'data_missing', diagnostics }
  }
  if (invalidationPrice >= entryPrice) {
    diagnostics.push(diagnostic('invalidation_not_below_entry', 'blocked', 'The invalidation price is at or above the entry price, so there is no measurable loss to size against', 'invalidationPrice', { entryPrice, invalidationPrice }))
    return { status: 'refused', code: 'research_incomplete', diagnostics }
  }
  if (!finite(nav) || nav <= 0) {
    diagnostics.push(diagnostic('nav_unreadable', 'blocked', 'The fund\'s net asset value is the denominator of every weight here and it is missing', 'nav', { nav }))
    return { status: 'refused', code: 'data_missing', diagnostics }
  }

  const riskBudget = narrowingOnly('perThesisRiskBudget', config.perThesisRiskBudget, rules.perThesisRiskBudget, 'lower', diagnostics)
  const lossToInvalidation = round((entryPrice - invalidationPrice) / entryPrice)
  const haircut = gapHaircut(bars, { halted: execution.halted === true, dailyPriceLimit: execution.dailyPriceLimit === true })
  const effectiveLoss = round(Math.min(lossToInvalidation + haircut.total, 1))
  const riskWeight = round(riskBudget / effectiveLoss)

  /** What a full position would be worth against what this name actually trades. */
  const liquidityWindow = bars.slice(-rules.liquidityWindowBars)
  const tradedValues = liquidityWindow.map((bar) => (finite(bar.close) && finite(bar.volume) ? bar.close * bar.volume : null)).filter(finite)
  const averageTradedValue = tradedValues.length ? round(tradedValues.reduce((total, value) => total + value, 0) / tradedValues.length) : null
  let liquidityCap = null
  if (finite(averageTradedValue) && averageTradedValue > 0) {
    liquidityCap = round((averageTradedValue * rules.participationRate * rules.participationDays) / nav)
  } else {
    diagnostics.push(diagnostic('liquidity_unreadable', 'info', 'No traded value could be computed from the series, so the liquidity ceiling was not applied. That is an unmeasured constraint and not an absent one', 'bars'))
  }

  const exposure = concentration(book, symbol)
  const singleNameCap = finite(mandate.singleNameCap) ? mandate.singleNameCap : null
  const grossCap = finite(mandate.grossCap) ? mandate.grossCap : null
  if (singleNameCap === null) {
    diagnostics.push(diagnostic('mandate_single_name_cap_missing', 'blocked', 'The mandate\'s single-name ceiling is what this weight is measured against and it is missing. A run that sized without it would be choosing its own limit', 'mandate.singleNameCap'))
    return { status: 'refused', code: 'data_missing', diagnostics }
  }
  /**
   * ⛔ **A per-strategy allowance never raises the account's ceiling.** It is
   * read only to make the smaller of the two bind, and a caller handing in one
   * that is larger is told so rather than obeyed.
   */
  let strategyCap = finite(mandate.strategyCap) ? mandate.strategyCap : null
  if (strategyCap !== null && strategyCap > singleNameCap) {
    diagnostics.push(diagnostic(
      'strategy_cap_exceeds_account_cap',
      'info',
      'The per-strategy allowance handed in is larger than the account\'s single-name ceiling and was ignored. Per-strategy limits constrain a strategy; they never sum into a larger account limit',
      'mandate.strategyCap',
      { strategyCap, singleNameCap },
    ))
    strategyCap = singleNameCap
  }

  const headroomSingleName = round(singleNameCap - exposure.existingWeight)
  const headroomStrategy = strategyCap === null ? null : round(strategyCap - exposure.existingWeight)
  const headroomGross = grossCap === null ? null : round(grossCap - exposure.grossExisting)

  const ceilings = [
    { name: 'risk-budget', value: riskWeight },
    { name: 'liquidity', value: liquidityCap },
    { name: 'single-name-headroom', value: headroomSingleName },
    { name: 'strategy-headroom', value: headroomStrategy },
    { name: 'gross-headroom', value: headroomGross },
  ].filter((row) => finite(row.value))

  const binding = ceilings.reduce((lowest, row) => (lowest === null || row.value < lowest.value ? row : lowest), null)
  const targetWeight = binding ? round(Math.max(binding.value, 0)) : 0

  const result = {
    status: 'ok',
    symbol,
    riskBudget,
    lossToInvalidation,
    haircut,
    /** `lossToInvalidation + gap + halt`, and the number every weight below divides into. */
    effectiveLoss,
    riskWeight,
    liquidityCap,
    averageTradedValue,
    exposure,
    ceilings,
    bindingConstraint: binding?.name ?? null,
    targetWeight,
    /** The cumulative staged target: the whole position, not the first rung. */
    plannedTotalWeight: targetWeight,
    /** What the book loses if the position fills in full and reaches invalidation. */
    downsideFraction: round(targetWeight * effectiveLoss),
    downsideValue: round(targetWeight * effectiveLoss * nav),
    diagnostics,
  }

  if (targetWeight <= 0) {
    diagnostics.push(diagnostic(
      'risk_limit_exceeded',
      'blocked',
      `There is no room for this position: the binding constraint is ${binding?.name ?? 'unknown'}. That is a finding about the book and not about the thesis — the thesis is neither refuted nor incomplete`,
      'targetWeight',
      { binding: binding?.name ?? null, ceilings },
    ))
    return { ...result, status: 'refused', code: 'risk_limit_exceeded' }
  }
  return result
}
