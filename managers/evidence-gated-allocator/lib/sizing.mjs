import { diagnostic, finite, round } from './diagnostics.mjs'

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

export function concentration({ positions = [], proposed = [], caps = {} }) {
  const diagnostics = []
  const rows = [...positions, ...proposed]
  const totals = { position: new Map(), sector: new Map(), theme: new Map() }
  for (const row of rows) {
    if (!finite(row?.weight) || row.weight < 0) {
      diagnostics.push(diagnostic('weight_invalid', 'blocked', 'All weights must be non-negative', 'positions'))
      continue
    }
    totals.position.set(row.symbol, (totals.position.get(row.symbol) ?? 0) + row.weight)
    if (row.sector) totals.sector.set(row.sector, (totals.sector.get(row.sector) ?? 0) + row.weight)
    for (const theme of row.themes ?? []) totals.theme.set(theme, (totals.theme.get(theme) ?? 0) + row.weight)
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
  return { data: { breaches, exposures: Object.fromEntries(Object.entries(totals).map(([kind, map]) => [kind, Object.fromEntries(map)])) }, diagnostics }
}

export function specialistBudget({ managerId, market, currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight, emergencyExit = false }) {
  const diagnostics = []
  const owners = { 'evidence-gated-kr': ['XKRX'], 'evidence-gated-us': ['XNAS', 'XNYS'] }
  if (!owners[managerId]?.includes(market)) diagnostics.push(diagnostic('specialist_market_not_owned', 'blocked', 'Specialist cannot allocate outside its market lane', 'market', { managerId, market }))
  if (![currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight].every(finite)) diagnostics.push(diagnostic('sleeve_budget_missing', 'unevaluated', 'Current sleeve, Brief budget and requested target are required', 'input'))
  if ([currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight].filter(finite).some((value) => value < 0)) diagnostics.push(diagnostic('sleeve_weight_negative', 'blocked', 'Sleeve weights cannot be negative', 'input'))
  const increase = finite(requestedTargetWeight) && finite(currentSleeveWeight) ? requestedTargetWeight - currentSleeveWeight : null
  if (!emergencyExit && finite(requestedTargetWeight) && finite(sleeveBudgetWeight) && requestedTargetWeight > sleeveBudgetWeight) diagnostics.push(diagnostic('specialist_sleeve_budget_exceeded', 'blocked', 'Specialist must ask Global for cross-market budget', 'requestedTargetWeight', { sleeveBudgetWeight }))
  if (emergencyExit && finite(increase) && increase > 0) diagnostics.push(diagnostic('emergency_exit_cannot_increase', 'blocked', 'Emergency invalidation bypass only permits SELL/RESIZE down', 'requestedTargetWeight'))
  return { data: { managerId, market, allowed: !diagnostics.some((row) => row.severity === 'blocked'), increaseWeight: round(increase), withinBriefBudget: finite(requestedTargetWeight) && finite(sleeveBudgetWeight) ? requestedTargetWeight <= sleeveBudgetWeight : null, emergencyExit }, diagnostics }
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
  return { data: { targets, allocatedWeight: round(allocated), residualCashWeight: finite(availableWeight) ? round(availableWeight - allocated) : null, deltas, owner: 'evidence-gated-global', proposalAction: 'REBALANCE' }, diagnostics }
}
