import { result, diagnostic } from './diagnostics.mjs'
import { normalizeBars, indicatorPacket } from './indicators.mjs'
import { scanSymbol, relativeStrength } from './scanners.mjs'
import { sleeveNav, targetWeight, legacySizeSuggestion, concentration } from './sizing.mjs'
import { coverageState, validateWatch } from './coverage.mjs'
import { validateConsensus, researchGate, crossCheckPrice } from './evidence.mjs'
import { calibrationSummary, independentDateClusters, brierScore, benjaminiHochberg } from './calibration.mjs'
import { decomposition, timeWeightedReturn, moneyWeightedReturn, portfolioMetrics } from './attribution.mjs'
import { filterPointInTime, normalizeSecFacts, normalizeDartFilings, validateAdjustment } from './source-parsers.mjs'
import { zonedDateTimeToUtc, nextMarketReview, earningsCheckpoint, boundedRetry } from './schedule.mjs'

const operations = {
  indicators(input, asOf) {
    const normalized = normalizeBars(input?.bars, asOf)
    return { data: { bars: normalized.bars, indicators: indicatorPacket(normalized.bars) }, diagnostics: normalized.diagnostics }
  },
  scan(input, asOf) {
    const normalized = normalizeBars(input?.bars, asOf)
    const scanned = scanSymbol({ ...input, bars: normalized.bars })
    return { data: scanned.candidate, diagnostics: [...normalized.diagnostics, ...scanned.diagnostics] }
  },
  relativeStrength(input) { return { data: relativeStrength(input?.assetBars ?? [], input?.benchmarkBars ?? [], input?.periods), diagnostics: [] } },
  sleeveNav,
  targetWeight,
  legacySizeSuggestion,
  concentration,
  coverage: coverageState,
  validateWatch: (input, asOf) => validateWatch(input?.watch, input?.current, asOf),
  validateConsensus: (input, asOf) => validateConsensus(input, asOf),
  researchGate,
  crossCheckPrice,
  calibration: calibrationSummary,
  clusters: (input) => ({ data: { clusters: independentDateClusters(input?.dates, input?.gapDays) }, diagnostics: [] }),
  brier: (input) => ({ data: { score: brierScore(input?.probabilities, input?.outcomeIndex) }, diagnostics: [] }),
  bhFdr: (input) => ({ data: { rows: benjaminiHochberg(input?.rows ?? [], input?.alpha) }, diagnostics: [] }),
  attribution: decomposition,
  twr: (input) => ({ data: { return: timeWeightedReturn(input?.dailyValues, input?.flows) }, diagnostics: [] }),
  mwr: (input) => ({ data: { return: moneyWeightedReturn(input?.datedCashflows, input?.endingValue, input?.endingDate, input?.options) }, diagnostics: [] }),
  portfolioMetrics,
  filterPointInTime: (input, asOf) => filterPointInTime(input?.rows, { ...input, asOf }),
  normalizeSecFacts: (input, asOf) => normalizeSecFacts(input, asOf),
  normalizeDartFilings: (input, asOf) => normalizeDartFilings(input, asOf),
  validateAdjustment,
  zonedDateTimeToUtc: (input) => ({ data: { instant: zonedDateTimeToUtc(input?.date, input?.time, input?.timeZone) }, diagnostics: [] }),
  nextMarketReview: (input, asOf) => nextMarketReview({ ...input, asOf }),
  earningsCheckpoint,
  boundedRetry: (input, asOf) => boundedRetry({ ...input, asOf }, input?.config),
}

export function execute(request) {
  const diagnostics = []
  const operation = request?.operation
  const asOf = request?.asOf
  if (typeof operation !== 'string' || !(operation in operations)) {
    diagnostics.push(diagnostic('operation_unknown', 'blocked', 'A supported operation is required', 'operation', { supported: Object.keys(operations) }))
    return result(operation ?? null, asOf ?? null, null, diagnostics)
  }
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) {
    diagnostics.push(diagnostic('as_of_invalid', 'blocked', 'A valid asOf instant is required', 'asOf'))
    return result(operation, asOf ?? null, null, diagnostics)
  }
  try {
    const output = operations[operation](request.input ?? {}, asOf)
    return result(operation, asOf, output?.data ?? null, [...diagnostics, ...(output?.diagnostics ?? [])])
  } catch (error) {
    diagnostics.push(diagnostic('operation_failed', 'blocked', 'Deterministic operation failed', 'input', { name: error?.name, message: error?.message }))
    return result(operation, asOf, null, diagnostics)
  }
}
