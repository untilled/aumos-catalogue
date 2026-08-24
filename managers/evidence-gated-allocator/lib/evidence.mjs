import { diagnostic, finite, round } from './diagnostics.mjs'

export function validateConsensus(observation, asOf) {
  const diagnostics = []
  const required = ['metric', 'value', 'unit', 'period', 'sourceUrl', 'publishedAt', 'capturedAt', 'type']
  for (const key of required) {
    if (observation?.[key] === undefined || observation?.[key] === null || observation?.[key] === '') {
      diagnostics.push(diagnostic('consensus_field_missing', 'blocked', `Consensus field ${key} is required`, key))
    }
  }
  if (!['consensus', 'company-guidance', 'actual'].includes(observation?.type)) {
    diagnostics.push(diagnostic('evidence_type_invalid', 'blocked', 'type must separate consensus, company guidance and actual', 'type'))
  }
  const published = Date.parse(observation?.publishedAt)
  const captured = Date.parse(observation?.capturedAt)
  if (!Number.isFinite(published) || !Number.isFinite(captured)) {
    diagnostics.push(diagnostic('consensus_timestamp_invalid', 'blocked', 'publishedAt and capturedAt must be valid instants', 'publishedAt'))
  } else {
    if (published > captured) diagnostics.push(diagnostic('published_after_capture', 'blocked', 'Evidence cannot be published after it was captured', 'publishedAt'))
    if (published > Date.parse(asOf)) diagnostics.push(diagnostic('post_as_of_evidence', 'blocked', 'Evidence was not public at asOf', 'publishedAt'))
  }
  return { data: { complete: diagnostics.length === 0, normalized: diagnostics.length ? null : observation }, diagnostics }
}

export function researchGate(input) {
  const diagnostics = []
  const required = ['lens', 'priceDeclineReason', 'opportunityCase', 'trapRisks', 'variantView', 'benchmarkAlternative', 'scenarios']
  for (const key of required) {
    if (input?.[key] === undefined || input?.[key] === null || input?.[key] === '' || (Array.isArray(input?.[key]) && input[key].length === 0)) {
      diagnostics.push(diagnostic('research_field_missing', 'blocked', `Research field ${key} is required`, key))
    }
  }
  if (!['mean-reversion', 'trend-pullback', 'core-dca'].includes(input?.lens)) {
    diagnostics.push(diagnostic('lens_invalid', 'blocked', 'Candidate discovery lens is required', 'lens'))
  }
  const scenarios = input?.scenarios ?? {}
  const cases = ['bear', 'base', 'bull'].map((name) => scenarios[name])
  if (!cases.every((row) => finite(row?.probability) && finite(row?.return))) {
    diagnostics.push(diagnostic('scenario_incomplete', 'blocked', 'Bear/base/bull probability and return are required', 'scenarios'))
  }
  const probabilitySum = cases.every((row) => finite(row?.probability)) ? cases.reduce((sum, row) => sum + row.probability, 0) : null
  if (probabilitySum !== null && Math.abs(probabilitySum - 1) > 1e-9) diagnostics.push(diagnostic('scenario_probability_sum', 'blocked', 'Scenario probabilities must sum to 1', 'scenarios', { probabilitySum }))
  const expectedReturn = cases.every((row) => finite(row?.probability) && finite(row?.return))
    ? cases.reduce((sum, row) => sum + row.probability * row.return, 0)
    : null
  const benchmarkReturn = input?.benchmarkAlternative?.expectedReturn
  const activeReturn = finite(expectedReturn) && finite(benchmarkReturn) ? expectedReturn - benchmarkReturn : null
  if (activeReturn === null) diagnostics.push(diagnostic('active_return_unevaluated', 'blocked', 'Expected and benchmark returns are required', 'benchmarkAlternative.expectedReturn'))
  else if (activeReturn < input.minimumExpectedActiveReturn) diagnostics.push(diagnostic('active_return_below_gate', 'blocked', 'Expected active return is below the configured gate', 'minimumExpectedActiveReturn', { activeReturn }))
  if (input?.challengeVerdict !== 'cleared') diagnostics.push(diagnostic('challenge_not_cleared', 'blocked', 'Thesis challenge must be cleared', 'challengeVerdict'))
  if (input?.sourceFresh === false || input?.sourceConflict === true) diagnostics.push(diagnostic('source_quality_blocked', 'blocked', 'Stale or unresolved conflicting evidence blocks promotion', 'sourceFresh'))
  return { data: { passed: diagnostics.every((item) => item.severity !== 'blocked'), expectedReturn: round(expectedReturn), activeReturn: round(activeReturn) }, diagnostics }
}

export function crossCheckPrice({ tossPrice, webPrice, tolerance = 0.05 }) {
  const diagnostics = []
  if (!finite(tossPrice) || !finite(webPrice) || tossPrice <= 0 || webPrice <= 0) {
    diagnostics.push(diagnostic('price_crosscheck_missing', 'unevaluated', 'Both positive Toss and web prices are required', 'prices'))
    return { data: { selected: null }, diagnostics }
  }
  const difference = Math.abs(webPrice / tossPrice - 1)
  if (difference > tolerance) diagnostics.push(diagnostic('price_source_conflict', 'unevaluated', 'Web price differs materially; Toss is selected and conflict retained', 'webPrice', { difference, tolerance }))
  return { data: { selected: tossPrice, selectedSource: 'toss', relativeDifference: round(difference) }, diagnostics }
}
