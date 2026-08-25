import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * Units that name their own scale. Everything else is money. (issue #50 consensus contract)
 */
const NON_MONETARY_UNITS = new Set(['percent', 'ratio', 'count', 'multiple', 'index-points', 'days', 'shares', 'basis-points'])

/**
 * Indicators the macro layer may read, with the tier its claim needs.
 *
 * `official` means the publisher of record — a central bank release, an exchange
 * or index publisher, a regulator. An aggregator restatement is usable evidence
 * but never upgrades to the official reading; it is kept with its gap named.
 */
const MACRO_INDICATORS = new Set([
  'vix',
  'put-call-ratio',
  'sentiment-index',
  'market-breadth',
  'index-level',
  'index-ma50',
  'index-ma200',
  'policy-rate',
  'policy-statement',
  'industry-policy',
])

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
  /**
   * A monetary figure without its currency is not a point-in-time observation.
   *
   * `unit` names the dimension, so it also decides whether a currency is owed.
   * A ratio, a percentage or a count carries its own scale; anything else is an
   * amount of money and two vendors quoting the same metric in KRW and USD are
   * not a conflict to average, they are two different numbers.
   */
  if (typeof observation?.unit === 'string' && !NON_MONETARY_UNITS.has(observation.unit) && !observation?.currency) {
    diagnostics.push(diagnostic('consensus_currency_missing', 'blocked', `A ${observation.unit} value requires its currency`, 'currency'))
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

/**
 * The macro and policy layer, which is where an undated number does the most damage.
 *
 * A VIX print, a put/call ratio or a Fear & Greed reading is only an observation
 * if it says *when* it was observed. Without that it is a number that silently
 * means "now" — and "now" is wrong twice: once for a historical replay, whose
 * `asOf` is in the past, and once for this run, which cannot tell a live quote
 * from a figure a page has been serving since last quarter. So an undated row is
 * refused rather than defaulted, and a row published after `asOf` is dropped the
 * way every other source row is.
 *
 * ⛔ There is no aggregate macro score in the returned data. A regime call is a
 * mixed quantitative/qualitative judgement at one `asOf` and belongs in Brief with
 * its Evidence ids; a number here would be read as a database this package does
 * not have. `scoreIsJudgement` says so in the output rather than in prose only.
 */
export function validateMacroObservations({ observations = [], asOf, webAvailable = true } = {}) {
  const diagnostics = []
  const asOfInstant = Date.parse(asOf)
  const retained = []
  const dropped = []
  const unusable = []
  for (const [index, row] of observations.entries()) {
    const at = `observations[${index}]`
    if (!MACRO_INDICATORS.has(row?.indicator)) {
      unusable.push({ indicator: row?.indicator ?? null, reason: 'indicator-unknown' })
      diagnostics.push(diagnostic('macro_indicator_unknown', 'unevaluated', 'Indicator is outside the declared macro vocabulary', `${at}.indicator`))
      continue
    }
    const observedAt = Date.parse(row?.observedAt)
    if (!Number.isFinite(observedAt)) {
      unusable.push({ indicator: row.indicator, reason: 'undated' })
      diagnostics.push(diagnostic('macro_observation_undated', 'blocked', 'An undated macro observation is never used as a current or replay value', `${at}.observedAt`))
      continue
    }
    if (!finite(row?.value)) {
      unusable.push({ indicator: row.indicator, reason: 'value-missing' })
      diagnostics.push(diagnostic('macro_value_missing', 'blocked', 'A macro observation needs a numeric value', `${at}.value`))
      continue
    }
    if (!row?.sourceUrl) {
      unusable.push({ indicator: row.indicator, reason: 'source-missing' })
      diagnostics.push(diagnostic('macro_source_missing', 'blocked', 'A macro observation needs its source', `${at}.sourceUrl`))
      continue
    }
    if (Number.isFinite(asOfInstant) && observedAt > asOfInstant) {
      dropped.push({ indicator: row.indicator, observedAt: row.observedAt })
      diagnostics.push(diagnostic('post_as_of_macro', 'blocked', 'Macro observation was not public at asOf', `${at}.observedAt`))
      continue
    }
    if (row?.sourceTier !== 'official') {
      diagnostics.push(diagnostic('macro_source_not_official', 'unevaluated', 'Aggregator restatement is retained with its provenance gap named', `${at}.sourceTier`))
    }
    retained.push({ indicator: row.indicator, value: row.value, observedAt: row.observedAt, sourceTier: row.sourceTier ?? 'aggregator', sourceUrl: row.sourceUrl })
  }
  if (!webAvailable) {
    diagnostics.push(diagnostic('macro_lane_unavailable', 'blocked', 'Without web research the policy/macro lane is blocked rather than assumed neutral', 'webAvailable'))
  }
  return {
    data: {
      retained,
      dropped,
      unusable,
      officialCount: retained.filter((row) => row.sourceTier === 'official').length,
      macroLaneAvailable: webAvailable && retained.length > 0,
      score: null,
      scoreIsJudgement: true,
    },
    diagnostics,
  }
}
