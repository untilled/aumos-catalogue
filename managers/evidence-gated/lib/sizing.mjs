import { diagnostic, finite, round, MANAGER_ID, SLEEVE_FLOW_MARKETS, ALLOCATOR_FLOW } from './diagnostics.mjs'

/**
 * Lane ownership is keyed by flow, not by manager id.
 *
 * Keying it by manager id was what blocked every `specialistBudget` call made
 * with the id the manifest actually publishes. ⚠️ The table itself moved to
 * `diagnostics.mjs` (#87): `schedule.mjs` needs the same names to mint a wake
 * the orchestrator can answer, and a second copy of a vocabulary is how the two
 * halves come to disagree about what a flow is called.
 */

export function sleeveNav({ cash = [], positions = [], fx = {} }) {
  const diagnostics = []
  const totals = { KRW: 0, USD: 0 }
  for (const row of cash) {
    if (!['KRW', 'USD'].includes(row?.currency) || !finite(row?.amount)) {
      diagnostics.push(diagnostic('cash_row_unevaluated', 'unevaluated', 'Cash row needs currency and amount', 'cash'))
      continue
    }
    totals[row.currency] += row.amount
  }
  for (const row of positions) {
    if (!['KRW', 'USD'].includes(row?.currency) || !finite(row?.marketValue)) {
      diagnostics.push(diagnostic('position_value_unevaluated', 'unevaluated', 'Position needs currency and marketValue', 'positions'))
      continue
    }
    totals[row.currency] += row.marketValue
  }
  const sgov = positions
    .filter((row) => row?.symbol === 'SGOV' && row?.currency === 'USD' && finite(row.marketValue))
    .reduce((sum, row) => sum + row.marketValue, 0)
  const idleUsd = cash
    .filter((row) => row?.currency === 'USD' && finite(row.amount))
    .reduce((sum, row) => sum + row.amount, 0)
  const usdLiquidity = idleUsd + sgov
  const usdKrw = fx?.USDKRW
  const globalKrw = finite(usdKrw) && usdKrw > 0 ? totals.KRW + totals.USD * usdKrw : null
  if (globalKrw === null) diagnostics.push(diagnostic('fx_missing', 'unevaluated', 'USDKRW is required for global NAV', 'fx.USDKRW'))
  return {
    data: {
      krwSleeveNav: round(totals.KRW, 2),
      usdSleeveNav: round(totals.USD, 2),
      idleUsd: round(idleUsd, 2),
      sgovReserve: round(sgov, 2),
      usdLiquidity: round(usdLiquidity, 2),
      globalNavKrw: round(globalKrw, 2),
      units: { krwSleeveNav: 'KRW', usdSleeveNav: 'USD', usdLiquidity: 'USD', globalNavKrw: 'KRW' },
    },
    diagnostics,
  }
}

export function targetWeight(input) {
  const diagnostics = []
  const expected = input?.expectedActiveReturn
  const downside = input?.downsideReturn
  const conviction = input?.conviction
  if (![expected, downside, conviction].every(finite)) {
    diagnostics.push(diagnostic('sizing_inputs_missing', 'unevaluated', 'Expected active return, downside and conviction are required', 'input'))
    return { data: { targetWeight: null }, diagnostics }
  }
  if (downside >= 0 || conviction < 0 || conviction > 1) {
    diagnostics.push(diagnostic('sizing_inputs_invalid', 'blocked', 'Downside must be negative and conviction must be in [0,1]', 'input'))
    return { data: { targetWeight: null }, diagnostics }
  }
  const caps = [input.mandatePositionCap, input.configPositionCap, input.sectorHeadroom, input.themeHeadroom]
    .filter(finite)
  if (caps.length < 2) diagnostics.push(diagnostic('concentration_inputs_missing', 'unevaluated', 'Mandate and config caps are required', 'input'))
  const raw = Math.max(0, expected / Math.abs(downside)) * conviction
  const maturity = input.maturityStatus
  if (!['insufficient', 'observing', 'reviewable', 'promoted'].includes(maturity)) {
    diagnostics.push(diagnostic('maturity_status_invalid', 'unevaluated', 'Known maturityStatus is required', 'maturityStatus'))
  }
  if (input.researchGate !== 'passed' || input.challengeVerdict !== 'cleared') {
    diagnostics.push(diagnostic('research_or_challenge_blocked', 'blocked', 'Sizing cannot repair a failed research or challenge gate', 'researchGate'))
  }
  const experimentalCap = finite(input.experimentalPositionCeiling) ? input.experimentalPositionCeiling : 0
  if (['insufficient', 'observing', 'reviewable'].includes(maturity)) caps.push(experimentalCap)
  const cap = caps.length ? Math.max(0, Math.min(...caps)) : 0
  return {
    data: {
      rawWeight: round(raw),
      bindingCap: round(cap),
      targetWeight: diagnostics.some((item) => item.severity === 'blocked') ? null : round(Math.min(raw, cap)),
      maturityStatus: maturity,
      units: { rawWeight: 'portfolio-weight', bindingCap: 'portfolio-weight', targetWeight: 'portfolio-weight' },
    },
    diagnostics,
  }
}

export function legacySizeSuggestion(input) {
  const diagnostics = []
  const rr = input?.riskRewardRatio
  const cap = input?.capWeight
  if (!finite(rr) || rr <= 0 || !finite(cap) || cap < 0) {
    diagnostics.push(diagnostic('legacy_sizing_input_invalid', 'blocked', 'Positive riskRewardRatio and non-negative capWeight are required', 'input'))
    return { data: { suggestedWeight: null }, diagnostics }
  }
  const minimumCalibrationSamples = input.minimumCalibrationSamples ?? 20
  const calibrationSamples = input.calibrationSamples ?? 0
  const winProbability = input.winProbability
  const kellyGated = finite(winProbability) && calibrationSamples < minimumCalibrationSamples
  let raw
  let mode
  if (finite(winProbability) && !kellyGated) {
    if (winProbability < 0 || winProbability > 1) {
      diagnostics.push(diagnostic('win_probability_invalid', 'blocked', 'winProbability must be in [0,1]', 'winProbability'))
      return { data: { suggestedWeight: null }, diagnostics }
    }
    const fullKellyRisk = winProbability - (1 - winProbability) / rr
    const riskBudget = Math.max(0, (input.kellyFraction ?? 0.25) * fullKellyRisk)
    raw = finite(input.stopDistance) && input.stopDistance > 0 ? riskBudget / input.stopDistance : riskBudget
    mode = 'kelly'
  } else {
    const fullCapAt = input.fullCapAtRiskReward ?? 2
    const conviction = Math.min(Math.max((rr - 1) / Math.max(fullCapAt - 1, Number.EPSILON), 0), 1)
    raw = input.expectedValue === undefined || input.expectedValue > 0 ? cap * conviction : 0
    mode = kellyGated ? 'heuristic-fallback-insufficient-calibration' : 'heuristic'
  }
  return {
    data: {
      rawWeight: round(raw),
      suggestedWeight: round(Math.max(0, Math.min(raw, cap))),
      capWeight: cap,
      mode,
      calibrationSamples,
      units: 'portfolio-weight',
    },
    diagnostics,
  }
}

/**
 * Total risk if every stop fired at once — the axis a weight cap cannot see.
 *
 * `concentration()` measures how much of the book one name, sector, theme or
 * factor is. None of those answers "how much do I lose if all of this goes
 * wrong at the same time", which is what the investor capped at 6% of the
 * account on 2026-07-10 (`risk_gates.portfolio_heat_max_pct_account`). Two
 * books with identical weights have different heat when their stops sit in
 * different places.
 *
 * Core DCA and parked liquidity are excluded: they carry no stop and so are not
 * a source of heat. A row that declares no `stopLossPct` is unevaluated rather
 * than zero — reading a missing stop as "no risk" is exactly the direction this
 * gate exists to refuse.
 *
 * Above the cap, a run that also proposes new non-core risk is blocked; a book
 * that is already over on its holdings alone warns instead, on the same
 * grandfathering logic the concentration gates use.
 */
function portfolioHeat({ positions, proposed, cap, diagnostics }) {
  const contribution = (rows, label) => {
    let total = 0
    for (const row of rows) {
      if (row?.core) continue
      if (!finite(row?.weight)) continue
      if (!finite(row?.stopLossPct)) {
        diagnostics.push(diagnostic('portfolio_heat_stop_missing', 'unevaluated', 'A non-core row without a stop distance cannot contribute measured heat; it is not zero risk', `${label}.stopLossPct`, { symbol: row?.symbol ?? null }))
        continue
      }
      total += row.weight * row.stopLossPct
    }
    return total
  }
  const held = contribution(positions, 'positions')
  const withProposed = held + contribution(proposed, 'proposed')
  if (!finite(cap)) {
    diagnostics.push(diagnostic('portfolio_heat_cap_missing', 'unevaluated', 'Missing portfolio heat cap', 'caps.portfolioHeat'))
    return { holdingsOnly: round(held), withProposed: round(withProposed), cap: null, breached: null }
  }
  const addsNonCoreRisk = proposed.some((row) => !row?.core && finite(row?.weight) && row.weight > 0)
  if (withProposed > cap && addsNonCoreRisk) {
    diagnostics.push(diagnostic('portfolio_heat_breach', 'blocked', 'Total loss if every stop fired is above the cap, and this run adds more of it', 'proposed', { withProposed: round(withProposed), cap }))
  } else if (held > cap) {
    diagnostics.push(diagnostic('portfolio_heat_above_cap', 'unevaluated', 'Held positions alone are above the heat cap; existing risk is grandfathered but new risk is not', 'positions', { holdingsOnly: round(held), cap }))
  }
  return { holdingsOnly: round(held), withProposed: round(withProposed), cap, breached: withProposed > cap }
}

export function concentration({ positions = [], proposed = [], caps = {} }) {
  const diagnostics = []
  const rows = [...positions, ...proposed]
  const totals = { position: new Map(), sector: new Map(), theme: new Map(), factor: new Map() }
  for (const row of rows) {
    if (!finite(row?.weight) || row.weight < 0) {
      diagnostics.push(diagnostic('weight_invalid', 'blocked', 'All weights must be non-negative', 'positions'))
      continue
    }
    totals.position.set(row.symbol, (totals.position.get(row.symbol) ?? 0) + row.weight)
    if (row.sector) totals.sector.set(row.sector, (totals.sector.get(row.sector) ?? 0) + row.weight)
    for (const theme of row.themes ?? []) totals.theme.set(theme, (totals.theme.get(theme) ?? 0) + row.weight)
    /**
     * A factor is a shared loss path that cuts across sectors — the AI-capex
     * complex the harness capped separately because a sector cap never sees it.
     * `allocate` and `thesis-challenge` both name this axis; without it the
     * question "does an existing holding create the same loss path?" has no
     * measured answer.
     */
    for (const factor of row.factors ?? []) totals.factor.set(factor, (totals.factor.get(factor) ?? 0) + row.weight)
  }
  const breaches = []
  for (const [kind, map] of Object.entries(totals)) {
    const cap = caps[kind]
    if (!finite(cap)) {
      diagnostics.push(diagnostic('concentration_cap_missing', 'unevaluated', `Missing ${kind} cap`, `caps.${kind}`))
      continue
    }
    for (const [key, weight] of map.entries()) {
      if (weight > cap) breaches.push({ kind, key, weight: round(weight), cap })
    }
  }
  if (breaches.length) diagnostics.push(diagnostic('concentration_breach', 'blocked', 'Proposed portfolio breaches concentration', 'proposed', { breaches }))
  const heat = portfolioHeat({ positions, proposed, cap: caps.portfolioHeat, diagnostics })
  return { data: { breaches, heat, exposures: Object.fromEntries(Object.entries(totals).map(([kind, map]) => [kind, Object.fromEntries([...map].map(([key, weight]) => [key, round(weight)]))])) }, diagnostics }
}

export function specialistBudget({ managerId = MANAGER_ID, flow, market, currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight, emergencyExit = false }) {
  const diagnostics = []
  if (managerId !== MANAGER_ID) diagnostics.push(diagnostic('manager_id_unknown', 'blocked', 'This package publishes one manager id', 'managerId', { managerId, expected: MANAGER_ID }))
  if (!SLEEVE_FLOW_MARKETS[flow]) diagnostics.push(diagnostic('flow_unknown', 'blocked', 'A sleeve flow is required; the allocator flow does not take a sleeve budget', 'flow', { flow, supported: Object.keys(SLEEVE_FLOW_MARKETS) }))
  else if (!SLEEVE_FLOW_MARKETS[flow].includes(market)) diagnostics.push(diagnostic('specialist_market_not_owned', 'blocked', 'Sleeve flow cannot allocate outside its market lane', 'market', { flow, market }))
  if (![currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight].every(finite)) diagnostics.push(diagnostic('sleeve_budget_missing', 'unevaluated', 'Current sleeve, Brief budget and requested target are required', 'input'))
  if ([currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight].filter(finite).some((value) => value < 0)) diagnostics.push(diagnostic('sleeve_weight_negative', 'blocked', 'Sleeve weights cannot be negative', 'input'))
  const increase = finite(requestedTargetWeight) && finite(currentSleeveWeight) ? requestedTargetWeight - currentSleeveWeight : null
  if (!emergencyExit && finite(requestedTargetWeight) && finite(sleeveBudgetWeight) && requestedTargetWeight > sleeveBudgetWeight) diagnostics.push(diagnostic('specialist_sleeve_budget_exceeded', 'blocked', 'Specialist must ask Global for cross-market budget', 'requestedTargetWeight', { sleeveBudgetWeight }))
  if (emergencyExit && finite(increase) && increase > 0) diagnostics.push(diagnostic('emergency_exit_cannot_increase', 'blocked', 'Emergency invalidation bypass only permits SELL/RESIZE down', 'requestedTargetWeight'))
  return { data: { managerId, flow: flow ?? null, market, allowed: !diagnostics.some((row) => row.severity === 'blocked'), increaseWeight: round(increase), withinBriefBudget: finite(requestedTargetWeight) && finite(sleeveBudgetWeight) ? requestedTargetWeight <= sleeveBudgetWeight : null, emergencyExit }, diagnostics }
}

export function globalAllocation({ targets = [], availableWeight = 1, currentWeights = {} }) {
  const diagnostics = []
  if (!finite(availableWeight) || availableWeight < 0 || availableWeight > 1) diagnostics.push(diagnostic('global_available_weight_invalid', 'blocked', 'availableWeight must be in [0,1]', 'availableWeight'))
  const keys = new Set()
  let allocated = 0
  for (const [index, target] of targets.entries()) {
    if (!target?.key || keys.has(target.key)) diagnostics.push(diagnostic('global_target_duplicate', 'blocked', 'Each sleeve/cash target must be unique', `targets[${index}].key`))
    else keys.add(target.key)
    if (!finite(target?.weight) || target.weight < 0) diagnostics.push(diagnostic('global_target_invalid', 'blocked', 'Target weight must be non-negative', `targets[${index}].weight`))
    else allocated += target.weight
  }
  if (allocated > availableWeight + 1e-9) diagnostics.push(diagnostic('global_cash_double_spend', 'blocked', 'Combined targets exceed the one global budget denominator', 'targets', { allocated, availableWeight }))
  const deltas = Object.fromEntries(targets.map((target) => [target.key, finite(target.weight) ? round(target.weight - (currentWeights[target.key] ?? 0)) : null]))
  return { data: { targets, allocatedWeight: round(allocated), residualCashWeight: finite(availableWeight) ? round(availableWeight - allocated) : null, deltas, owner: MANAGER_ID, flow: ALLOCATOR_FLOW, proposalAction: 'REBALANCE' }, diagnostics }
}

/**
 * Pacing, which is a warning and stays one.
 *
 * The approved rule (2026-07-10, P5) is soft on purpose: three patterns say the
 * book is adding single names faster than it is learning from them — two or
 * more new non-core singles in one session, another new single while the last
 * one is still unverified, and a new single on the day the sizing policy
 * changed. None of them is evidence that this particular candidate is wrong, so
 * none of them blocks; they are the observation that the run should say out
 * loud before the investor approves it. The harness relaxes them once the book
 * has ten closed outcomes to learn from.
 */
export function newSinglePacing({ proposedNewSingles = [], priorNewSingles = [], sizingPolicyUpdatedAt = null, closedOutcomeCount = 0, asOf, reviewReadyClosedOutcomes = 10 }) {
  const diagnostics = []
  const warnings = []
  const relaxed = closedOutcomeCount >= reviewReadyClosedOutcomes
  const newCount = proposedNewSingles.filter((row) => !row?.core).length
  if (newCount >= 2) warnings.push({ code: 'multiple-new-singles-one-session', count: newCount })
  const unverified = priorNewSingles.filter((row) => row?.verified === false)
  if (newCount > 0 && unverified.length) warnings.push({ code: 'prior-single-unverified', symbols: unverified.map((row) => row?.symbol ?? null) })
  if (newCount > 0 && sizingPolicyUpdatedAt && typeof asOf === 'string' && sizingPolicyUpdatedAt.slice(0, 10) === asOf.slice(0, 10)) {
    warnings.push({ code: 'sizing-policy-changed-today', sizingPolicyUpdatedAt })
  }
  for (const warning of warnings) {
    diagnostics.push(diagnostic('new_single_pacing_warn', relaxed ? 'info' : 'unevaluated', 'New single-name exposure is being added faster than it is being learned from; say so before approval', 'proposedNewSingles', warning))
  }
  return { data: { warnings, newSingleCount: newCount, relaxed, closedOutcomeCount }, diagnostics }
}
