import { result, diagnostic } from './diagnostics.mjs'
import { validateInput, INPUT_KEYS, INPUT_CONTRACTS, NESTED_CONTRACTS, GUARDED_OPERATIONS, INPUT_VOCABULARY } from './input-contracts.mjs'
import { researchUniverse, researchState } from './research-state.mjs'
import { normalizeBars, indicatorPacket } from './indicators.mjs'
import { scanSymbol, relativeStrength, opportunityMetrics, opportunityUniverse, trendState, blendedSectorStrength, entryQualityGate, sectorStrength, regimeTag } from './scanners.mjs'
import { sleeveNav, targetWeight, experimentalCeiling, effectivePositionCap, effectiveCashFloor, singleNameBudget, legacySizeSuggestion, concentration, specialistBudget, globalAllocation, newSinglePacing, entryTranchePlan } from './sizing.mjs'
import { coverageState, discoveryCapacity, validateWatch, evaluateWatch, watchAlertState } from './coverage.mjs'
import { validateConsensus, researchGate, crossCheckPrice, validateMacroObservations } from './evidence.mjs'
import { calibrationSummary, closedOutcomeSamples, independentDateClusters, brierScore, benjaminiHochberg, promotionGate, quintileSpread, bootstrapClusterCi } from './calibration.mjs'
import { decomposition, timeWeightedReturn, moneyWeightedReturn, portfolioMetrics } from './attribution.mjs'
import { netReturnBreakdown, outcomeClassification, forwardOutcome, earningsActual } from './outcomes.mjs'
import { trendGateForward, dcaMultiplierBacktest, oversoldStrata } from './backtest.mjs'
import { validateThesis, variantViewCheck, thesisSentinel, upsideRadar, validateMemory, visibleMemoryRevision, migrationMap, exitCheck } from './methodology.mjs'
import { filterPointInTime, normalizeSecFacts, normalizeDartFilings, parseDartCorpCodes, normalizeDartFinancials, normalizeSecSubmissions, laneCoverage, validateAdjustment } from './source-parsers.mjs'
import { fundamentalsPlan, mapCorporationCodes, dartVendorStatus, radarCandidates, radarFeedDiagnosis } from './fundamentals-feed.mjs'
import { harnessAudit, lessonAudit } from './audit.mjs'
import { lensEnvelope, clusterBlock, timeStopPolicy, exitDiscipline, ruleVersions, policyLint } from './envelopes.mjs'
import { signalPaper, paperAdmission, shadowTrack, baselineTrack, verdictReport, controlArmLane } from './learning.mjs'
import { refutedMemoryRules } from './memory-rules.mjs'
import { zonedDateTimeToUtc, nextMarketReview, earningsCheckpoint, boundedRetry, classifyScheduledWake, scheduleDrift, deduplicateObservations, themeRadarDue, nextReviewSequence, resolveWakeFlow, resolveTrancheWake, reconcileArmedReviews } from './schedule.mjs'

const operations = {
  researchUniverse: (input, asOf) => researchUniverse({ ...input, asOf }),
  researchState: (input, asOf) => researchState({ ...input, asOf }),
  /**
   * ⚠️ Every registered operation is published, not the eleven a past issue
   * happened to reach (#158). `keys` stays what it was — the name a run may
   * already be reading — and `contracts` adds the type of each key and the mode
   * that governs an unknown one, `nested` the shapes a key list cannot show
   * (`config.schedule`, `researchActivity[]`), `guarded` the operations that
   * refuse an unknown key outright.
   */
  inputContracts: () => ({
    data: {
      keys: INPUT_KEYS,
      contracts: INPUT_CONTRACTS,
      nested: NESTED_CONTRACTS,
      guarded: GUARDED_OPERATIONS,
      operationCount: Object.keys(INPUT_CONTRACTS).length,
      vocabulary: INPUT_VOCABULARY,
    },
    diagnostics: [],
  }),
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
  sectorStrength: (input, asOf) => sectorStrength({ ...input, asOf }),
  regimeTag: (input, asOf) => regimeTag({ ...input, asOf }),
  sleeveNav,
  targetWeight: (input, asOf) => targetWeight({ ...input, asOf }),
  experimentalCeiling,
  effectivePositionCap: (input, asOf) => effectivePositionCap({ ...input, asOf }),
  effectiveCashFloor,
  singleNameBudget,
  legacySizeSuggestion,
  concentration,
  entryQualityGate,
  newSinglePacing: (input, asOf) => newSinglePacing({ ...input, asOf }),
  entryTranchePlan: (input, asOf) => entryTranchePlan({ ...input, asOf }),
  specialistBudget,
  globalAllocation,
  coverage: (input, asOf) => coverageState({ ...input, asOf }),
  discoveryCapacity,
  validateWatch: (input, asOf) => validateWatch(input?.watch, input?.current, asOf, input?.config),
  evaluateWatch: (input, asOf) => evaluateWatch({ ...input, asOf }),
  watchAlertState: (input, asOf) => watchAlertState({ ...input, asOf }),
  validateConsensus: (input, asOf) => validateConsensus(input, asOf),
  researchGate,
  crossCheckPrice,
  validateMacro: (input, asOf) => validateMacroObservations({ ...input, asOf }),
  calibration: calibrationSummary,
  closedOutcomeSamples: (input, asOf) => closedOutcomeSamples({ ...input, asOf }),
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
  controlArmLane,
  lensEnvelope,
  clusterBlock: (input, asOf) => clusterBlock({ ...input, asOf }),
  timeStopPolicy: (input, asOf) => timeStopPolicy({ ...input, asOf }),
  exitDiscipline: (input, asOf) => exitDiscipline({ ...input, asOf }),
  ruleVersions,
  policyLint,
  harnessAudit: (input, asOf) => harnessAudit({ ...input, asOf }),
  lessonAudit: (input, asOf) => lessonAudit({ ...input, asOf }),
  verdictReport: (input, asOf) => verdictReport({ ...input, asOf }),
  validateThesis,
  variantViewCheck: (input, asOf) => variantViewCheck({ ...input, asOf }),
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
  validateAdjustment: (input) => validateAdjustment(input?.series, input?.corporateActions),

  /**
   * ── The feeding path (issue #146) ────────────────────────────────────────
   *
   * In order, and the order is the fix: the registry that supplies the vendor's
   * own filer id, the join onto the curated roster, the vendor status read off
   * an HTTP 200, the candidates the radar eats, and the reading that says which
   * of those stages lost the input when a lane comes back starved.
   */
  fundamentalsPlan: (input, asOf) => fundamentalsPlan({ ...input, asOf }),
  mapCorporationCodes: (input, asOf) => mapCorporationCodes({ ...input, asOf }),
  dartVendorStatus: (input) => dartVendorStatus(input),
  radarCandidates: (input, asOf) => radarCandidates({ ...input, asOf }),
  radarFeedDiagnosis: (input, asOf) => radarFeedDiagnosis({ ...input, asOf }),

  zonedDateTimeToUtc: (input) => ({ data: { instant: zonedDateTimeToUtc(input?.date, input?.time, input?.timeZone) }, diagnostics: [] }),
  nextMarketReview: (input, asOf) => nextMarketReview({ ...input, asOf }),
  earningsCheckpoint: (input, asOf) => earningsCheckpoint(input?.observation, input?.marketSession, { ...input?.config, asOf }),
  boundedRetry: (input, asOf) => boundedRetry({ ...input, asOf }, input?.config),
  classifyScheduledWake,
  scheduleDrift: (input, asOf) => scheduleDrift({ ...input, asOf }),
  deduplicateObservations,
  themeRadarDue: (input, asOf) => themeRadarDue({ ...input, asOf }),
  nextReviewSequence: (input, asOf) => nextReviewSequence({ ...input, asOf }),
  resolveWakeFlow,
  resolveTrancheWake,
  reconcileArmedReviews: (input, asOf) => reconcileArmedReviews({ ...input, asOf }),
  refutedMemoryRules: (input, asOf) => refutedMemoryRules({ ...input, asOf }),
}

export function execute(request) {
  const diagnostics = []
  const operation = request?.operation
  const asOf = request?.asOf
  if (typeof operation !== 'string' || !Object.hasOwn(operations, operation)) {
    diagnostics.push(diagnostic('operation_unknown', 'blocked', 'A supported operation is required', 'operation', { supported: Object.keys(operations) }))
    return result(operation ?? null, asOf ?? null, null, diagnostics)
  }
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) {
    diagnostics.push(diagnostic('as_of_invalid', 'blocked', 'A valid asOf instant is required', 'asOf'))
    return result(operation, asOf ?? null, null, diagnostics)
  }
  try {
    /**
     * ⚠️ A refused shape returns no data; a **reported** one still answers.
     * `input_key_unread` says which part of the call was not read (#158) and
     * the answer it did compute is still the answer — withholding it would
     * turn a published contract into a stricter gate than the operation is.
     */
    const shapeDiagnostics = validateInput(operation, request.input ?? {}, asOf)
    if (shapeDiagnostics.some((row) => row.severity === 'blocked')) return result(operation, asOf, null, shapeDiagnostics)
    diagnostics.push(...shapeDiagnostics)
    const output = operations[operation](request.input ?? {}, asOf)
    // A rejected calculation must never offer a replacement for durable memory.
    if (output?.data?.nextState && output.diagnostics?.some((row) => row.severity === 'blocked')) output.data.nextState = null
    return result(operation, asOf, output?.data ?? null, [...diagnostics, ...(output?.diagnostics ?? [])])
  } catch (error) {
    diagnostics.push(diagnostic('operation_failed', 'blocked', 'Deterministic operation failed', 'input', { name: error?.name, message: error?.message }))
    return result(operation, asOf, null, diagnostics)
  }
}
