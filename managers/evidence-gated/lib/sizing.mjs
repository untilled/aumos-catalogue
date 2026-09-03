import { diagnostic, finite, round, grandfatherPolicy, MANAGER_ID, SLEEVE_FLOW_MARKETS, ALLOCATOR_FLOW } from './diagnostics.mjs'
import { normalizeTriggerKind } from './methodology.mjs'
import { trancheIntent } from './schedule.mjs'

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

/**
 * ── A ceiling that can be executed (issue #121) ────────────────────────────
 *
 * `experimentalPositionCeiling` was a ratio and nothing else, and a ratio
 * alone says nothing about whether the order it permits can be placed. On the
 * book that found this, 1% of 10,095,751 KRW is 100,958 KRW, and the name the
 * methodology was ported with — KOGAS at 33,050 — is **three shares**. The
 * smallest expressible change in a three-share position is a third of it: it
 * cannot be scaled into, trimmed, or made to express conviction, and after the
 * tick and the round-trip fee there is no result left to measure. The ceiling
 * was reading as *do not start* rather than *start small*. The source
 * methodology's own Experiment-stage size for that same name was ten shares —
 * 2.6% of its book — so the port was 60% below the discipline it claims.
 *
 * ⛔ This is not a licence to size up, and it is deliberately not a runtime
 * config change: `policyLint` refuses a loosened threshold, and it is right to.
 * The floor raises the ceiling only until the position is executable, and
 * `experimentalPositionCeilingMax` is what stops it there.
 *
 * ⚠️ **The floor is denominated per venue, not in the book's base currency.**
 * What makes an order unexecutable — tick size, lot size, the price a share
 * trades at, the fee and tax schedule — is a fact about the exchange; the base
 * currency is only where the investor keeps score. One USD number would buy a
 * granular position in a market quoting $0.01 ticks and a three-share position
 * in one quoting 50원 ticks on a 33,050원 share. The conversion into the
 * book's denominator uses the same USDKRW `sleeveNav` already requires.
 *
 * ⚠️ It is an approximation and stays one: exact granularity is a fact about
 * the *name*, and this operation is given no price. The currency is the
 * coarsest partition that is still correct.
 *
 * ⚠️ **Below roughly 10,000,000 KRW of NAV the floor stops fitting inside the
 * band, and the run is told so rather than quietly sized at the cap.** A book
 * that small cannot run this lane on real money at all, and the honest sample
 * there is the paper cohort — not a position that has been rounded up until it
 * looks like one.
 */
export function experimentalCeiling(input = {}) {
  const diagnostics = []
  const ratio = finite(input.experimentalPositionCeiling) ? Math.max(0, input.experimentalPositionCeiling) : 0
  const ceilingMax = finite(input.experimentalPositionCeilingMax) ? Math.max(0, input.experimentalPositionCeilingMax) : null
  const floors = input.experimentalPositionFloor
  const currency = input.positionCurrency
  const data = {
    ratioCeiling: round(ratio),
    floorAmount: null,
    floorCurrency: currency ?? null,
    floorWeight: null,
    ceilingMax: ceilingMax === null ? null : round(ceilingMax),
    experimentalCeiling: round(ratio),
    binding: 'ratio',
    units: { floorAmount: 'currency-major-units', ratioCeiling: 'portfolio-weight', floorWeight: 'portfolio-weight', experimentalCeiling: 'portfolio-weight' },
  }
  if (!floors || typeof floors !== 'object') return { data, diagnostics }
  const amount = finite(floors[currency]) ? floors[currency] : null
  if (amount === null) {
    diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'A minimum executable amount is declared per venue currency, so the currency of the position being sized is required and has to be one the floor names', 'positionCurrency', { currency: currency ?? null, declared: Object.keys(floors) }))
    return { data, diagnostics }
  }
  data.floorAmount = round(amount, 2)
  const nav = input.portfolioNav
  const navCurrency = input.portfolioNavCurrency
  const usdKrw = input.fx?.USDKRW
  if (!finite(nav) || nav <= 0 || !['KRW', 'USD'].includes(navCurrency)) {
    diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'An amount becomes a weight only against the book it is a weight of; portfolioNav and portfolioNavCurrency are required', 'portfolioNav'))
    return { data, diagnostics }
  }
  let amountInNav = amount
  if (currency !== navCurrency) {
    if (!finite(usdKrw) || usdKrw <= 0) {
      diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'The floor is quoted in the venue currency and the book is denominated in another, so USDKRW is required to compare them', 'fx.USDKRW'))
      return { data, diagnostics }
    }
    amountInNav = currency === 'USD' ? amount * usdKrw : amount / usdKrw
  }
  const floorWeight = amountInNav / nav
  data.floorWeight = round(floorWeight)
  const lifted = Math.max(ratio, floorWeight)
  const capped = ceilingMax === null ? lifted : Math.min(lifted, ceilingMax)
  data.experimentalCeiling = round(capped)
  data.binding = capped === ratio && floorWeight <= ratio ? 'ratio' : ceilingMax !== null && lifted > ceilingMax ? 'ceilingMax' : 'floor'
  if (ceilingMax !== null && floorWeight > ceilingMax) {
    diagnostics.push(diagnostic('experimental_floor_unreachable', 'unevaluated', 'The smallest executable position in this venue is larger than the experimental band allows, so this book cannot run a real-money controlled experiment here; the paper cohort is the sample that is available, and a position rounded up to the cap would not be the one this floor was asked for', 'experimentalPositionFloor', { floorWeight: round(floorWeight), ceilingMax: round(ceilingMax) }))
  }
  return { data, diagnostics }
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
  /**
   * One rule, called here. The ceiling an unpromoted lens is held to is
   * `experimentalCeiling()`'s answer and never a second copy of the arithmetic
   * — a floor computed in one place and a ratio read in another is how the two
   * come to disagree about what the ceiling is.
   */
  const unpromoted = ['insufficient', 'observing', 'reviewable'].includes(maturity)
  const ceiling = experimentalCeiling(input)
  if (unpromoted) {
    diagnostics.push(...ceiling.diagnostics)
    caps.push(finite(ceiling.data.experimentalCeiling) ? ceiling.data.experimentalCeiling : 0)
  }
  const cap = caps.length ? Math.max(0, Math.min(...caps)) : 0
  return {
    data: {
      rawWeight: round(raw),
      bindingCap: round(cap),
      targetWeight: diagnostics.some((item) => item.severity === 'blocked') ? null : round(Math.min(raw, cap)),
      maturityStatus: maturity,
      experimentalCeiling: ceiling.data.experimentalCeiling,
      experimentalCeilingBinding: ceiling.data.binding,
      units: { rawWeight: 'portfolio-weight', bindingCap: 'portfolio-weight', targetWeight: 'portfolio-weight', experimentalCeiling: 'portfolio-weight' },
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
 * that is already over on its holdings alone warns instead. ⚠️ That rule used
 * to be written here in literals, which is why `config.grandfather` could be
 * declared and read by nothing — the concept had a second, private copy. It now
 * comes from the same `grandfatherPolicy` the weight caps read, and `proposed`
 * restates a holding here for the same reason it does there: a trim has to be
 * able to lower measured heat, or the gate refuses the thing that fixes it.
 * (#109)
 *
 * ⚠️ `enabled: false` is **stricter** than the literal it replaced, on purpose:
 * a book over the cap on its holdings alone is then refused rather than warned.
 * Turning the tolerance off is a request not to tolerate the breach, and a
 * setting that changed only the wording would be another one that governs
 * nothing.
 */
function portfolioHeat({ positions, proposed, cap, grandfather, diagnostics }) {
  const contribution = (rows, label, report = true) => {
    let total = 0
    for (const row of rows) {
      if (row?.core) continue
      if (!finite(row?.weight)) continue
      if (!finite(row?.stopLossPct)) {
        if (report) diagnostics.push(diagnostic('portfolio_heat_stop_missing', 'unevaluated', 'A non-core row without a stop distance cannot contribute measured heat; it is not zero risk', `${label}.stopLossPct`, { symbol: row?.symbol ?? null }))
        continue
      }
      total += row.weight * row.stopLossPct
    }
    return total
  }
  const restated = new Set(proposed.map((row) => row?.symbol).filter((symbol) => symbol !== undefined && symbol !== null))
  const heldWeight = new Map(positions.filter((row) => finite(row?.weight)).map((row) => [row.symbol, row.weight]))
  const held = contribution(positions, 'positions')
  const withProposed = contribution(positions.filter((row) => !restated.has(row?.symbol)), 'positions', false) + contribution(proposed, 'proposed')
  if (!finite(cap)) {
    diagnostics.push(diagnostic('portfolio_heat_cap_missing', 'unevaluated', 'Missing portfolio heat cap', 'caps.portfolioHeat'))
    return { holdingsOnly: round(held), withProposed: round(withProposed), cap: null, breached: null }
  }
  /**
   * A row with no stop contributes no measured heat, so a purchase of one
   * cannot be caught by comparing the two totals — it is caught by asking
   * whether the run is raising that symbol's weight at all.
   */
  const addsNonCoreRisk =
    withProposed > held ||
    proposed.some((row) => !row?.core && finite(row?.weight) && !finite(row?.stopLossPct) && row.weight > (heldWeight.get(row?.symbol) ?? 0))
  const carried = grandfather.enabled && held > cap
  /**
   * ⛔ The same ordering the weight caps use: a run that lowers measured heat
   * and adds no risk is never the thing refused, whatever the tolerance says.
   * `addsNonCoreRisk` still has to be false — trimming a stopped name while
   * buying a stop-less one lowers *measured* heat and raises the real thing.
   */
  const reducesRisk = withProposed < held && !addsNonCoreRisk
  if (withProposed > cap && !reducesRisk && (!carried || (addsNonCoreRisk && grandfather.blocksNewNonCoreWhenBreached))) {
    diagnostics.push(diagnostic('portfolio_heat_breach', 'blocked', 'Total loss if every stop fired is above the cap, and this run adds more of it', 'proposed', { withProposed: round(withProposed), cap }))
  } else if (held > cap) {
    diagnostics.push(diagnostic('portfolio_heat_above_cap', 'unevaluated', 'Held positions alone are above the heat cap; existing risk is grandfathered but new risk is not', 'positions', { holdingsOnly: round(held), cap }))
  }
  return { holdingsOnly: round(held), withProposed: round(withProposed), cap, breached: withProposed > cap }
}

/**
 * The weight caps, and which side of them a proposal is moving.
 *
 * Exposure is accumulated twice — once from the holdings alone and once with
 * what this run proposes — because a breach the book already carries and a
 * breach this run creates are different findings and only one of them is a
 * reason to refuse. A single total could not tell them apart, so every breach
 * was blocked, including one that a **trim** would resolve: the run was told
 * not to plan the reduction that fixes the thing being complained about.
 *
 * `config.grandfather` is the setting that says so, and this is where it is
 * read. Existing exposure is carried; new non-core exposure on a breached axis
 * is refused while `blocksNewNonCoreWhenBreached` holds. Turning `enabled` off
 * restores the older, blunter reading in which any breach refuses — including
 * one the book arrived with. (#109)
 */
export function concentration({ positions = [], proposed = [], caps = {}, config = {} }) {
  const diagnostics = []
  const grandfather = grandfatherPolicy(config)
  const axes = () => ({ position: new Map(), sector: new Map(), theme: new Map(), factor: new Map() })
  for (const [rows, path] of [[positions, 'positions'], [proposed, 'proposed']]) {
    for (const row of rows) {
      if (!finite(row?.weight) || row.weight < 0) diagnostics.push(diagnostic('weight_invalid', 'blocked', 'All weights must be non-negative', path))
    }
  }
  const accumulate = (rows, { nonCoreOnly = false } = {}) => {
    const totals = axes()
    for (const row of rows) {
      if (!finite(row?.weight) || row.weight < 0) continue
      if (nonCoreOnly && row?.core) continue
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
    return totals
  }
  /**
   * ⚠️ **A `proposed` row for a symbol the book already holds replaces that
   * holding; it does not stack on top of it.** `proposed` is the target state
   * for the names it mentions, which is the vocabulary the rest of this
   * package speaks — `targetWeight`, and a `DecisionProposal` carrying target
   * weights. Summing the two would read the one shape a reduction has —
   * `{ held: 0.25 } → { proposed: 0.15 }` — as 0.40, and refuse the trim as if
   * it were a purchase. That is the inversion #109 is about, arriving through
   * the input contract instead of through the gate.
   */
  const restated = new Set(proposed.map((row) => row?.symbol).filter((symbol) => symbol !== undefined && symbol !== null))
  const standing = positions.filter((row) => !restated.has(row?.symbol))
  const held = accumulate(positions)
  const heldNonCore = accumulate(positions, { nonCoreOnly: true })
  const totals = accumulate([...standing, ...proposed])
  const finalNonCore = accumulate([...standing, ...proposed], { nonCoreOnly: true })

  const breaches = []
  for (const [kind, map] of Object.entries(totals)) {
    const cap = caps[kind]
    if (!finite(cap)) {
      diagnostics.push(diagnostic('concentration_cap_missing', 'unevaluated', `Missing ${kind} cap`, `caps.${kind}`))
      continue
    }
    for (const [key, weight] of map.entries()) {
      if (weight <= cap) continue
      const heldWeight = held[kind].get(key) ?? 0
      const grandfathered = grandfather.enabled && heldWeight > cap
      breaches.push({
        kind,
        key,
        weight: round(weight),
        heldWeight: round(heldWeight),
        addedWeight: round(weight - heldWeight),
        addedNonCoreWeight: round((finalNonCore[kind].get(key) ?? 0) - (heldNonCore[kind].get(key) ?? 0)),
        cap,
        grandfathered,
      })
    }
  }
  /**
   * ⚠️ **The direction is read before the tolerance.** `enabled: false` is a
   * request not to tolerate a breach; it is never a request to refuse the trim
   * that resolves one. Reading the tolerance first put the inversion #109 is
   * named after straight back into the gate — a reduction of an over-cap axis
   * came out `concentration_breach: blocked`, in a response that carried
   * `riskReducingAlwaysAllowed: true` beside it.
   *
   * ⛔ Inaction is not a reduction, and neither is a swap. The axis total has
   * to fall **strictly**, so a standing breach nobody is touching still refuses
   * once the investor switches the tolerance off — which is what switching it
   * off asks for — and non-core exposure must not rise, so trimming a core
   * holding while buying a non-core one on the same over-cap axis is not a
   * reduction either. It is the shape `portfolioHeat` reads one line down.
   */
  const reducing = (row) => row.addedWeight < 0 && row.addedNonCoreWeight <= 0
  const created = breaches.filter((row) => !row.grandfathered && !reducing(row))
  const expanded = breaches.filter((row) => row.grandfathered && row.addedNonCoreWeight > 0)
  const carried = breaches.filter((row) => reducing(row) || (row.grandfathered && row.addedNonCoreWeight <= 0))
  if (created.length) diagnostics.push(diagnostic('concentration_breach', 'blocked', 'Proposed portfolio breaches concentration', 'proposed', { breaches: created }))
  if (expanded.length && grandfather.blocksNewNonCoreWhenBreached) {
    diagnostics.push(diagnostic('concentration_breach_expanded', 'blocked', 'An axis the book already carries above its cap is being added to; existing exposure is tolerated and new exposure is not', 'proposed', { breaches: expanded }))
  }
  if (carried.length || (expanded.length && !grandfather.blocksNewNonCoreWhenBreached)) {
    diagnostics.push(diagnostic('concentration_grandfathered', 'unevaluated', 'The book carries exposure above a cap; forcing an immediate sale is a trade the cap never asked for, and a trim or exit of it is never blocked', 'positions', { breaches: [...carried, ...(grandfather.blocksNewNonCoreWhenBreached ? [] : expanded)] }))
  }
  const heat = portfolioHeat({ positions, proposed, cap: caps.portfolioHeat, grandfather, diagnostics })
  return {
    data: {
      breaches,
      grandfatheredBreaches: breaches.filter((row) => row.grandfathered),
      blocksExpansionOf: grandfather.blocksNewNonCoreWhenBreached ? breaches.filter((row) => row.grandfathered).map((row) => ({ kind: row.kind, key: row.key })) : [],
      riskReducingAlwaysAllowed: true,
      heat,
      exposures: Object.fromEntries(Object.entries(totals).map(([kind, map]) => [kind, Object.fromEntries([...map].map(([key, weight]) => [key, round(weight)]))])),
    },
    diagnostics,
  }
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

/**
 * ── The staged entry, on the single-name side (#120) ───────────────────────
 *
 * `candidate-research` already required a tranche plan — "T1/T2/T3 each with
 * its size and its date-or-price condition. *We will add on weakness* is not a
 * tranche" — and required it **only of `core-dca`**. That row's last line is
 * right and stays: a cash deployment is not a ready single-name BUY, and
 * pooling the two makes the single-name sample look larger than it is.
 *
 * What the split lost is that the original harness staged single names too, and
 * ⚠️ **not because they were large — because the conviction was low.** The NAVER
 * thesis wrote its own reason down: technically oversold was confirmed, the
 * earnings/multiple case was not, so it was "제한 분할매수 후보" — a limited,
 * staged candidate — on a three-tranche plan. Not going in at once is what that
 * methodology *did* about an unverified claim, and after the port that device
 * survived on the ETF side only.
 *
 * So this is the same five-condition shape, addressed to a single name, and the
 * two lanes are kept apart **in code**: a `core-dca` lens is refused here, and
 * what this returns says in its own data that a plan is one sample no matter how
 * many tranches it has. Three tranches counted as three samples would be the
 * "repeated runs on one still-open idea" `evidence-gates` forbids — the same
 * inflation, arriving from the other direction.
 *
 * ⚠️ **The plan is one document, and the document is the Thesis.** A tranche
 * ladder in private memory would be a second copy of a fact the Thesis already
 * owns, and invariant 7 says which copy is authoritative. Nothing here writes a
 * new memory key.
 *
 * ⛔ Nothing here sizes or orders. Like every `exitCheck` verdict, a `tranche_due`
 * is a *candidate* for the one proposal the investor still approves.
 */
export const SINGLE_NAME_TRANCHES = {
  /** T1/T2/T3, the number the ported theses actually wrote. */
  planned: 3,
  /**
   * The same 5% band `exitCheck` raises `trim_approach` in, for the same
   * reason: a rung set weeks ago can be stale by the time price reaches it, and
   * the premise is re-read *before* it fires rather than after.
   */
  approachPct: 0.05,
  /** Unpromoted evidence is precisely the state the staging exists for. */
  stagingRequiredMaturities: ['insufficient', 'observing'],
}

/** A tranche waits on a date or on a price. `immediate` is the one that does not wait. */
const TRANCHE_CONDITION_KINDS = new Set(['immediate', 'at-time', 'price-below', 'price-above'])

export function entryTranchePlan({ symbol = null, lens = null, maturity = null, price, plannedTotalWeight = null, tranches = [], asOf } = {}) {
  const diagnostics = []
  const findings = []
  const add = (kind, label, message, detail = {}) => findings.push({ kind, symbol, label, message, ...detail })
  const asOfInstant = Date.parse(asOf)

  /**
   * The lane separation, as a refusal rather than a sentence. A cash
   * deployment's tranches are the `core-dca` conditions and they are counted in
   * the other column; asking this function to hold them is the pooling the
   * classification row exists to prevent.
   */
  if (lens === 'core-dca') {
    diagnostics.push(diagnostic('tranche_lane_mismatch', 'blocked', 'Core DCA tranches are a cash deployment and are recorded under the core-dca conditions; they never become a single-name sample', 'lens', { lens }))
    return {
      data: {
        symbol, lens, classification: 'cash-deployment', countsAsSingleNameSample: false, sampleCount: 0,
        sampleKind: 'cash-deployment-never-a-single-name-sample', staged: null, action: 'NONE',
        findings, intents: [], candidateOnly: true,
      },
      diagnostics,
    }
  }

  const rows = tranches.map((row, index) => ({
    label: typeof row?.label === 'string' && row.label ? row.label : `T${index + 1}`,
    weight: row?.weight,
    condition: row?.condition ?? null,
    filled: row?.filled === true,
    expiresAt: row?.expiresAt ?? null,
    index,
  }))

  if (!rows.length) {
    diagnostics.push(diagnostic('tranche_plan_missing', 'blocked', 'A staged entry is a plan or it is not staged; T1/T2/T3 each carry a size and a date-or-price condition', 'tranches'))
  }

  let plannedSum = 0
  let filledWeight = 0
  for (const row of rows) {
    const where = `tranches[${row.index}]`
    if (!finite(row.weight) || row.weight <= 0) {
      diagnostics.push(diagnostic('tranche_weight_missing', 'blocked', 'A tranche states the weight it puts to work; a share of the plan nobody wrote down is not a tranche', `${where}.weight`, { label: row.label }))
    } else {
      plannedSum += row.weight
      if (row.filled) filledWeight += row.weight
    }
    const kind = normalizeTriggerKind(row.condition?.kind)
    if (!TRANCHE_CONDITION_KINDS.has(kind)) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', '"We will add on weakness" is not a tranche; each one carries a date-or-price condition', `${where}.condition`, { label: row.label, supported: [...TRANCHE_CONDITION_KINDS] }))
      continue
    }
    if (kind === 'immediate' && row.index !== 0) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', 'Only the first tranche executes on the run that plans it; a later one waits on a stated condition', `${where}.condition`, { label: row.label }))
      continue
    }
    if ((kind === 'price-below' || kind === 'price-above') && !finite(row.condition?.threshold)) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', 'A price tranche states the level it waits for', `${where}.condition.threshold`, { label: row.label }))
    }
    if (kind === 'at-time' && !Number.isFinite(Date.parse(row.condition?.at))) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', 'A dated tranche states the instant it waits for', `${where}.condition.at`, { label: row.label }))
    }
  }

  if (finite(plannedTotalWeight) && rows.length && Math.abs(plannedSum - plannedTotalWeight) > 1e-9) {
    diagnostics.push(diagnostic('tranche_sizes_do_not_sum', 'blocked', 'The tranches add up to the position the plan says it is building, or the plan is describing two different positions', 'tranches', { plannedTotalWeight, trancheSum: round(plannedSum) }))
  }

  /**
   * Whether staging is *required* is a maturity question, because the reason
   * for staging was never size. An unstated maturity is unevaluated rather than
   * waved through: the requirement is not judged, and the run is told so.
   */
  const staged = rows.length >= SINGLE_NAME_TRANCHES.planned
  if (maturity === null || maturity === undefined) {
    diagnostics.push(diagnostic('tranche_maturity_unstated', 'unevaluated', 'Whether this entry has to be staged is decided by the lens maturity; without it the requirement is not judged', 'maturity', { planned: SINGLE_NAME_TRANCHES.planned }))
  } else if (SINGLE_NAME_TRANCHES.stagingRequiredMaturities.includes(maturity) && !staged) {
    diagnostics.push(diagnostic('tranche_plan_required', 'blocked', 'An unpromoted lens enters in stages; the split is what an unverified claim does about its own uncertainty, not a way of being small', 'tranches', { maturity, planned: SINGLE_NAME_TRANCHES.planned, given: rows.length }))
  }

  const priceRead = finite(price)
  if (!priceRead) {
    diagnostics.push(diagnostic('tranche_price_unread', 'unevaluated', 'Without a current price the price tranches are unread; dated and lapsed tranches are still judged', 'price'))
  }

  const lapsed = []
  const intents = []
  for (const row of rows) {
    if (row.filled) continue
    const kind = normalizeTriggerKind(row.condition?.kind)
    const expiry = Date.parse(row.expiresAt)
    if (Number.isFinite(expiry) && Number.isFinite(asOfInstant) && expiry <= asOfInstant) {
      lapsed.push(row.label)
      add('tranche_lapsed', row.label, 'A tranche condition expired with the plan unfinished; the remainder is re-armed, resized or abandoned in this run', { expiresAt: row.expiresAt, weight: row.weight ?? null })
      continue
    }
    if (kind === 'immediate') {
      add('tranche_due', row.label, 'The first tranche executes on the run that plans it', { weight: row.weight ?? null })
      continue
    }
    if (kind === 'at-time') {
      const at = Date.parse(row.condition?.at)
      if (Number.isFinite(at) && Number.isFinite(asOfInstant) && at <= asOfInstant) add('tranche_due', row.label, 'A dated tranche reached its instant', { at: row.condition.at, weight: row.weight ?? null })
      else add('tranche_pending', row.label, 'A dated tranche is still waiting', { at: row.condition?.at ?? null, weight: row.weight ?? null })
      intents.push({ label: row.label, at: row.condition?.at ?? null, intent: trancheIntent(symbol, row.label) })
      continue
    }
    if (kind === 'price-below' || kind === 'price-above') {
      intents.push({ label: row.label, threshold: row.condition?.threshold ?? null, intent: trancheIntent(symbol, row.label) })
      if (!priceRead || !finite(row.condition?.threshold)) continue
      const level = row.condition.threshold
      const met = kind === 'price-below' ? price <= level : price >= level
      const near = kind === 'price-below'
        ? price <= level * (1 + SINGLE_NAME_TRANCHES.approachPct)
        : price >= level * (1 - SINGLE_NAME_TRANCHES.approachPct)
      if (met) add('tranche_due', row.label, 'A price tranche reached its level', { level, price, weight: row.weight ?? null })
      else if (near) add('tranche_approach', row.label, 'Price is within 5% of a tranche rung; re-read the premise before it fires', { level, price, weight: row.weight ?? null })
      else add('tranche_pending', row.label, 'A price tranche is still waiting', { level, price, weight: row.weight ?? null })
    }
  }

  const complete = rows.length > 0 && rows.every((row) => row.filled)
  if (lapsed.length && !complete) {
    diagnostics.push(diagnostic('tranche_plan_incomplete', 'blocked', 'Half an entry plan is a position nobody decided the size of; state the remainder as re-armed, resized or abandoned', 'tranches', { lapsed, filledWeight: round(filledWeight), plannedTotalWeight: finite(plannedTotalWeight) ? plannedTotalWeight : round(plannedSum) }))
  }
  const kinds = new Set(findings.map((row) => row.kind))
  const action = kinds.has('tranche_lapsed') || kinds.has('tranche_approach')
    ? 'REVIEW'
    : kinds.has('tranche_due')
      ? 'ENTER'
      : 'NONE'

  return {
    data: {
      symbol, lens, maturity,
      classification: 'single-name',
      /**
       * ⛔ The number that must not move. A staged entry is one idea decided
       * once; counting a tranche as a sample would manufacture evidence out of
       * the risk control that exists because the evidence is thin.
       */
      countsAsSingleNameSample: true,
      sampleCount: 1,
      sampleKind: 'one-single-name-sample-per-plan-never-one-per-tranche',
      countsAsCashDeployment: false,
      staged,
      trancheCount: rows.length,
      plannedTotalWeight: finite(plannedTotalWeight) ? plannedTotalWeight : round(plannedSum),
      filledWeight: round(filledWeight),
      remainingWeight: round(plannedSum - filledWeight),
      complete,
      lapsed,
      action,
      findings,
      intents,
      priceLaneRead: priceRead,
      candidateOnly: true,
    },
    diagnostics,
  }
}
