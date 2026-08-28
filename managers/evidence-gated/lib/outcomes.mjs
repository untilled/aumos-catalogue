import { diagnostic, finite, round } from './diagnostics.mjs'

export function netReturnBreakdown({ entry = {}, exit = {}, currency = 'KRW' }) {
  const diagnostics = []
  const required = currency === 'KRW' ? ['feeKrw', 'taxKrw'] : ['feeKrw', 'taxKrw', 'fxRate']
  const missing = []
  for (const [name, leg] of [['entry', entry], ['exit', exit]]) {
    for (const field of required) if (!finite(leg?.[field])) missing.push(`${name}.${field}`)
  }
  if (missing.length) diagnostics.push(diagnostic('cost_data_incomplete', 'unevaluated', 'Missing costs block net-profitability claims', 'input', { missing }))
  if (![entry?.quantity, entry?.price, exit?.price].every(finite) || entry.quantity <= 0 || entry.price <= 0 || exit.price < 0) {
    diagnostics.push(diagnostic('round_trip_leg_invalid', 'blocked', 'Entry quantity/price and exit price are required', 'input'))
    return { data: null, diagnostics }
  }
  const quantity = finite(exit.quantity) ? Math.min(entry.quantity, exit.quantity) : entry.quantity
  if (quantity <= 0) {
    diagnostics.push(diagnostic('matched_quantity_invalid', 'blocked', 'Matched round-trip quantity must be positive', 'exit.quantity'))
    return { data: null, diagnostics }
  }
  const entryFx = finite(entry.fxRate) && entry.fxRate > 0 ? entry.fxRate : 1
  const exitFx = finite(exit.fxRate) && exit.fxRate > 0 ? exit.fxRate : 1
  const entryCosts = (finite(entry.feeKrw) ? entry.feeKrw : 0) + (finite(entry.taxKrw) ? entry.taxKrw : 0)
  const exitCosts = (finite(exit.feeKrw) ? exit.feeKrw : 0) + (finite(exit.taxKrw) ? exit.taxKrw : 0)
  const entryLocal = quantity * entry.price + entryCosts / entryFx
  const exitLocal = quantity * exit.price - exitCosts / exitFx
  const entryKrw = quantity * entry.price * entryFx + entryCosts
  const exitKrw = quantity * exit.price * exitFx - exitCosts
  return {
    data: {
      matchedQuantity: quantity,
      grossReturnPct: round((exit.price / entry.price - 1) * 100, 4),
      netLocalReturnPct: entryLocal > 0 ? round((exitLocal / entryLocal - 1) * 100, 4) : null,
      netKrwReturnPct: entryKrw > 0 ? round((exitKrw / entryKrw - 1) * 100, 4) : null,
      costDataStatus: missing.length ? 'incomplete' : 'complete',
      missingCostFields: missing,
      units: { returns: 'percent', matchedQuantity: 'shares' },
    },
    diagnostics,
  }
}

/**
 * Execution readings that raise no question about how the trade was worked.
 */
const EXECUTION_CLEAN = new Set(['good', 'unknown'])

/**
 * The judged axis: reasons a person or a run assigns after reading the
 * decision, which no compliance flag computes. They are a controlled
 * vocabulary rather than free text so `failures/repeated-patterns` can count
 * the same thing twice, and they are validated here so a typo becomes a
 * refusal instead of a new category with a sample size of one.
 */
const JUDGED_FAILURES = new Set([
  'entry_quality_failure',
  'trap_missed',
  'variant_view_failure',
  'timing_failure',
  'source_freshness_failure',
  'coverage_failure',
])

/**
 * The mechanical axis: one bucket per closed decision, computed.
 *
 * ⚠️ **Execution is where this function and `outcome-calibration` used to
 * contradict each other.** The skill says execution belongs to the Kernel and
 * the broker and is recorded as an observation, *not* a methodology failure —
 * "unless the Decision itself caused the mismatch" — and named that reading
 * `execution_observation_only`. This function ignored the exception clause and
 * graded every poor fill `Bad` or `Mixed` as `execution_failure`, which is the
 * one classification the skill forbids. A run following the skill and a run
 * reading the output disagreed about whether the methodology had failed.
 *
 * The skill's rule wins, because it is the one that matches what this package
 * owns: a manager that cannot place an order cannot be at fault for how the
 * order filled. So the exception is now implemented rather than described.
 * `executionAttributableToDecision` is what separates the two — an unreachable
 * limit price the Decision itself set is the methodology's failure; slippage
 * the broker took is an observation that leaves the process reading intact.
 *
 * The default is the safer of the two readings for a manager judging itself:
 * absent the flag, a poor fill is *not* charged to the methodology, so the
 * grade is not quietly improved by an unset field either — the observation is
 * still returned and still diagnosed.
 */
export function outcomeClassification(input) {
  const diagnostics = []
  const thesisOk = input?.thesisCompliance === 'followed'
  const riskOk = input?.riskCompliance === 'followed'
  const executionClean = EXECUTION_CLEAN.has(input?.executionQuality)
  const decisionCausedMismatch = input?.executionAttributableToDecision === true
  const executionObservation = executionClean
    ? null
    : {
      quality: input?.executionQuality ?? null,
      attributableToDecision: decisionCausedMismatch,
      classified: decisionCausedMismatch ? 'execution_failure' : 'execution_observation_only',
    }
  if (executionObservation?.classified === 'execution_observation_only') {
    diagnostics.push(diagnostic('execution_observation_only', 'info', 'The fill differed from the plan without the Decision causing it; recorded as an observation, not a methodology failure', 'executionQuality', executionObservation))
  }
  const executionOk = executionClean || !decisionCausedMismatch

  const judgedFailures = []
  for (const tag of input?.judgedFailures ?? []) {
    if (JUDGED_FAILURES.has(tag)) judgedFailures.push(tag)
    else diagnostics.push(diagnostic('judged_failure_unknown', 'blocked', 'A judged failure reason must come from the published vocabulary', 'judgedFailures', { tag, supported: [...JUDGED_FAILURES] }))
  }

  const outcomeGood = finite(input?.grossReturnPct) && input.grossReturnPct >= 0 && (!finite(input?.activeReturnPct) || input.activeReturnPct >= 0)
  let failureType
  let grade
  if (!riskOk) [failureType, grade] = ['risk_rule_failure', 'Bad']
  else if (!executionOk) [failureType, grade] = ['execution_failure', outcomeGood ? 'Mixed' : 'Bad']
  else if (input.thesisCompliance === 'broken') [failureType, grade] = ['thesis_failure', outcomeGood ? 'Mixed' : 'Bad']
  else if (finite(input.activeReturnPct) && finite(input.benchmarkReturnPct) && input.activeReturnPct < 0 && input.grossReturnPct >= 0) [failureType, grade] = ['benchmark_failure', 'Mixed']
  else if (thesisOk && riskOk && executionOk && outcomeGood) [failureType, grade] = ['good_process_good_outcome', 'Good']
  else if (thesisOk && riskOk && executionOk) [failureType, grade] = ['good_process_bad_outcome', 'Mixed']
  else if (outcomeGood) [failureType, grade] = ['bad_process_good_outcome', 'Mixed']
  else [failureType, grade] = ['bad_process_bad_outcome', 'Bad']
  return { data: { failureType, grade, processGood: thesisOk && riskOk && executionOk, outcomeGood, executionObservation, judgedFailures }, diagnostics }
}

function orderedBars(bars) {
  return (bars ?? []).filter((row) => typeof row?.timestamp === 'string' && finite(row.close)).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

export function forwardOutcome({ bars = [], benchmarkBars = [], sectorBars = [], signalAt, horizons = [5, 20, 60] }) {
  const diagnostics = []
  const asset = orderedBars(bars)
  const benchmark = orderedBars(benchmarkBars)
  const sector = orderedBars(sectorBars)
  const prior = asset.filter((row) => Date.parse(row.timestamp) < Date.parse(signalAt)).at(-1)
  const after = asset.filter((row) => Date.parse(row.timestamp) >= Date.parse(signalAt))
  if (!prior || !after.length) {
    diagnostics.push(diagnostic('forward_base_missing', 'unevaluated', 'A last close before signalAt and later bars are required', 'bars'))
    return { data: { base: null, forward: {}, excursion: null }, diagnostics }
  }
  const seriesReturn = (series, at, horizon) => {
    const before = series.filter((row) => Date.parse(row.timestamp) < Date.parse(at)).at(-1)
    const future = series.filter((row) => Date.parse(row.timestamp) >= Date.parse(at))[horizon - 1]
    return before && future && before.close !== 0 ? (future.close / before.close - 1) * 100 : null
  }
  const forward = {}
  for (const horizon of horizons) {
    const future = after[horizon - 1]
    if (!future) {
      forward[`d${horizon}`] = null
      continue
    }
    const returnPct = (future.close / prior.close - 1) * 100
    const benchmarkReturnPct = seriesReturn(benchmark, signalAt, horizon)
    const sectorReturnPct = seriesReturn(sector, signalAt, horizon)
    forward[`d${horizon}`] = {
      date: future.timestamp,
      returnPct: round(returnPct, 3),
      benchmarkReturnPct: round(benchmarkReturnPct, 3),
      benchmarkExcessPct: finite(benchmarkReturnPct) ? round(returnPct - benchmarkReturnPct, 3) : null,
      sectorReturnPct: round(sectorReturnPct, 3),
      sectorExcessPct: finite(sectorReturnPct) ? round(returnPct - sectorReturnPct, 3) : null,
    }
  }
  const longest = Math.max(...horizons)
  const window = after.slice(0, longest)
  const highs = window.map((row) => finite(row.high) ? row.high : row.close)
  const lows = window.map((row) => finite(row.low) ? row.low : row.close)
  const excursion = window.length >= longest ? {
    mfePct: round((Math.max(...highs) / prior.close - 1) * 100, 3),
    maePct: round((Math.min(...lows) / prior.close - 1) * 100, 3),
  } : null
  if (!excursion) diagnostics.push(diagnostic('forward_window_immature', 'unevaluated', 'Longest forward window has not matured', 'bars', { required: longest, available: window.length }))
  return { data: { base: { timestamp: prior.timestamp, close: prior.close }, forward, excursion }, diagnostics }
}

export function earningsActual({ preview = {}, actual = {}, filing = {} }) {
  const diagnostics = []
  if (!filing?.announcedAt || !filing?.sourceUrl || !filing?.sourceType) {
    diagnostics.push(diagnostic('earnings_actual_unverified', 'blocked', 'Actual review requires public announcement time, URL and source type', 'filing'))
  }
  if (filing?.sourceType === 'periodic-filing' && !filing?.firstPublicDisclosureAt) {
    diagnostics.push(diagnostic('periodic_filing_not_event_anchor', 'blocked', 'A periodic filing cannot replace the first public earnings disclosure', 'filing.sourceType'))
  }
  const comparisons = {}
  for (const [metric, value] of Object.entries(actual ?? {})) {
    const expected = preview?.consensus?.[metric]
    const guidance = preview?.guidance?.[metric]
    comparisons[metric] = {
      actual: finite(value) ? value : null,
      consensus: finite(expected) ? expected : null,
      consensusSurprisePct: finite(value) && finite(expected) && expected !== 0 ? round((value - expected) / Math.abs(expected) * 100, 3) : null,
      guidanceMid: finite(guidance?.low) && finite(guidance?.high) ? (guidance.low + guidance.high) / 2 : finite(guidance?.value) ? guidance.value : null,
    }
    const midpoint = comparisons[metric].guidanceMid
    comparisons[metric].guidanceSurprisePct = finite(value) && finite(midpoint) && midpoint !== 0 ? round((value - midpoint) / Math.abs(midpoint) * 100, 3) : null
  }
  if (!Object.keys(comparisons).length) diagnostics.push(diagnostic('earnings_actuals_missing', 'unevaluated', 'No actual metrics can be compared', 'actual'))
  return { data: { comparisons, actualConfirmed: !diagnostics.some((row) => row.severity === 'blocked') }, diagnostics }
}
