import { result, diagnostic } from './diagnostics.mjs'
import { normalizeBars, indicatorPacket } from './indicators.mjs'
import { scanSymbol, relativeStrength, opportunityMetrics, opportunityUniverse, trendState, blendedSectorStrength, entryQualityGate, sectorStrength } from './scanners.mjs'
import { sleeveNav, targetWeight, legacySizeSuggestion, concentration, specialistBudget, globalAllocation, newSinglePacing } from './sizing.mjs'
import { coverageState, validateWatch } from './coverage.mjs'
import { validateConsensus, researchGate, crossCheckPrice, validateMacroObservations } from './evidence.mjs'
import { calibrationSummary, independentDateClusters, brierScore, benjaminiHochberg, promotionGate, quintileSpread, bootstrapClusterCi } from './calibration.mjs'
import { decomposition, timeWeightedReturn, moneyWeightedReturn, portfolioMetrics } from './attribution.mjs'
import { netReturnBreakdown, outcomeClassification, forwardOutcome, earningsActual } from './outcomes.mjs'
import { trendGateForward, dcaMultiplierBacktest, oversoldStrata } from './backtest.mjs'
import { validateThesis, thesisSentinel, upsideRadar, validateMemory, visibleMemoryRevision, migrationMap, exitCheck } from './methodology.mjs'
import { filterPointInTime, normalizeSecFacts, normalizeDartFilings, parseDartCorpCodes, normalizeDartFinancials, normalizeSecSubmissions, laneCoverage, validateAdjustment } from './source-parsers.mjs'
import { signalPaper, paperAdmission, shadowTrack, baselineTrack, verdictReport } from './learning.mjs'
import { zonedDateTimeToUtc, nextMarketReview, earningsCheckpoint, boundedRetry, classifyScheduledWake, scheduleDrift, deduplicateObservations, themeRadarDue, nextReviewSequence } from './schedule.mjs'

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
  opportunityMetrics,
  opportunityUniverse,
  trendState,
  blendedSectorStrength: (input) => blendedSectorStrength(input?.assetBars ?? [], input?.benchmarkBars ?? [], input?.weights),
  sectorStrength,
  sleeveNav,
  targetWeight,
  legacySizeSuggestion,
  concentration,
  entryQualityGate,
  newSinglePacing: (input, asOf) => newSinglePacing({ ...input, asOf }),
  specialistBudget,
  globalAllocation,
  coverage: coverageState,
  validateWatch: (input, asOf) => validateWatch(input?.watch, input?.current, asOf, input?.config),
  validateConsensus: (input, asOf) => validateConsensus(input, asOf),
  researchGate,
  crossCheckPrice,
  validateMacro: (input, asOf) => validateMacroObservations({ ...input, asOf }),
  calibration: calibrationSummary,
  clusters: (input) => ({ data: { clusters: independentDateClusters(input?.dates, input?.gapDays) }, diagnostics: [] }),
  brier: (input) => ({ data: { score: brierScore(input?.probabilities, input?.outcomeIndex) }, diagnostics: [] }),
  bhFdr: (input) => ({ data: { rows: benjaminiHochberg(input?.rows ?? [], input?.alpha) }, diagnostics: [] }),
  quintileSpread: (input) => ({ data: { summary: quintileSpread(input?.values) }, diagnostics: [] }),
  bootstrapClusterCi: (input) => ({ data: { interval: bootstrapClusterCi(input?.clusterValues, input?.options) }, diagnostics: [] }),
  promotionGate,
  attribution: decomposition,
  twr: (input) => ({ data: { return: timeWeightedReturn(input?.dailyValues, input?.flows) }, diagnostics: [] }),
  mwr: (input) => ({ data: { return: moneyWeightedReturn(input?.datedCashflows, input?.endingValue, input?.endingDate, input?.options) }, diagnostics: [] }),
  portfolioMetrics,
  netReturnBreakdown,
  outcomeClassification,
  forwardOutcome,
  earningsActual,
  trendGateForward,
  dcaMultiplierBacktest,
  oversoldStrata,
  signalPaper: (input, asOf) => signalPaper({ ...input, asOf }),
  paperAdmission: (input, asOf) => paperAdmission({ ...input, asOf }),
  shadowTrack,
  baselineTrack,
  verdictReport: (input, asOf) => verdictReport({ ...input, asOf }),
  validateThesis,
  thesisSentinel,
  exitCheck: (input, asOf) => exitCheck({ ...input, asOf }),
  upsideRadar: (input, asOf) => upsideRadar({ ...input, asOf }),
  validateMemory: (input, asOf) => validateMemory({ ...input, asOf }),
  visibleMemoryRevision: (input, asOf) => visibleMemoryRevision({ ...input, asOf }),
  migrationMap,
  filterPointInTime: (input, asOf) => filterPointInTime(input?.rows, { ...input, asOf }),
  normalizeSecFacts: (input, asOf) => normalizeSecFacts(input, asOf),
  normalizeDartFilings: (input, asOf) => normalizeDartFilings(input, asOf),
  parseDartCorpCodes: (input) => parseDartCorpCodes(input?.xml),
  normalizeDartFinancials: (input, asOf) => normalizeDartFinancials(input, asOf),
  normalizeSecSubmissions: (input, asOf) => normalizeSecSubmissions(input, asOf),
  laneCoverage,
  validateAdjustment,
  zonedDateTimeToUtc: (input) => ({ data: { instant: zonedDateTimeToUtc(input?.date, input?.time, input?.timeZone) }, diagnostics: [] }),
  nextMarketReview: (input, asOf) => nextMarketReview({ ...input, asOf }),
  earningsCheckpoint: (input, asOf) => earningsCheckpoint(input?.observation, input?.marketSession, { ...input?.config, asOf }),
  boundedRetry: (input, asOf) => boundedRetry({ ...input, asOf }, input?.config),
  classifyScheduledWake,
  scheduleDrift: (input, asOf) => scheduleDrift({ ...input, asOf }),
  deduplicateObservations,
  themeRadarDue: (input, asOf) => themeRadarDue({ ...input, asOf }),
  nextReviewSequence: (input, asOf) => nextReviewSequence({ ...input, asOf }),
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
