import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated-allocator/lib/index.mjs'
import { handleMcpRequest } from '../managers/evidence-gated-allocator/lib/mcp-server.mjs'

const fixtureRoot = new URL('../managers/evidence-gated-allocator/fixtures/', import.meta.url)
const memory = JSON.parse(await readFile(new URL('memory-contract.json', fixtureRoot), 'utf8'))
const source = JSON.parse(await readFile(new URL('source-contract.json', fixtureRoot), 'utf8'))
const golden = JSON.parse(await readFile(new URL('legacy-golden/core.json', fixtureRoot), 'utf8'))
const scannerGolden = JSON.parse(await readFile(new URL('legacy-golden/scanner.json', fixtureRoot), 'utf8'))
const topology = JSON.parse(await readFile(new URL('topology.json', fixtureRoot), 'utf8'))
const promotion = JSON.parse(await readFile(new URL('legacy-golden/promotion.json', fixtureRoot), 'utf8'))
const outcomes = JSON.parse(await readFile(new URL('legacy-golden/outcomes.json', fixtureRoot), 'utf8'))
const backtest = JSON.parse(await readFile(new URL('legacy-golden/backtest.json', fixtureRoot), 'utf8'))
const methodology = JSON.parse(await readFile(new URL('legacy-golden/methodology.json', fixtureRoot), 'utf8'))
const groupCoverage = JSON.parse(await readFile(new URL('legacy-golden/group-coverage.json', fixtureRoot), 'utf8'))
const migrationText = await readFile(new URL('../MIGRATION.md', fixtureRoot), 'utf8')
const manifest = JSON.parse(await readFile(new URL('../aumos.json', fixtureRoot), 'utf8'))
const configSchema = JSON.parse(await readFile(new URL('../config.schema.json', fixtureRoot), 'utf8'))
const mcpConfig = JSON.parse(await readFile(new URL('../.mcp.json', fixtureRoot), 'utf8'))
const ampProposals = JSON.parse(await readFile(new URL('amp-decision-proposals.json', fixtureRoot), 'utf8'))
const krSource = JSON.parse(await readFile(new URL('kr/source.json', fixtureRoot), 'utf8'))
const usSchedule = JSON.parse(await readFile(new URL('us/schedule.json', fixtureRoot), 'utf8'))
const globalIntegration = JSON.parse(await readFile(new URL('global/integration.json', fixtureRoot), 'utf8'))
const research = JSON.parse(await readFile(new URL('research-contract.json', fixtureRoot), 'utf8'))

function assertSubset(actual, expected, path = 'data') {
  for (const [key, value] of Object.entries(expected)) {
    const next = `${path}.${key}`
    if (value && typeof value === 'object' && !Array.isArray(value)) assertSubset(actual?.[key], value, next)
    else assert.deepEqual(actual?.[key], value, next)
  }
}

const visibleRevision = ({ instance, model, asOf }) =>
  memory.revisions
    .filter(
      (row) =>
        row.instance === instance &&
        row.model === model &&
        Date.parse(row.writtenAsOf) <= Date.parse(asOf),
    )
    .sort((a, b) => b.revision - a.revision)[0]?.revision ?? null

assert.equal(memory.runs[0].expectedReadRevision, null, 'run A starts with empty memory')
assert.equal(memory.runs[0].validWithoutPriorMemory, true, 'empty memory still permits a decision')
assert.equal(
  visibleRevision(memory.runs[1]),
  memory.runs[1].expectedReadRevision,
  'run B reads run A revision',
)
assert.equal(memory.revisions.length, 2, 'same key keeps both revisions')
assert.notEqual(memory.revisions[0].revision, memory.revisions[1].revision, 'revisions are append-only')
assert.equal(visibleRevision(memory.replay), memory.replay.expectedRevision, 'replay excludes future revision')
assert.equal(visibleRevision(memory.isolation), null, 'another instance cannot read private memory')
assert.equal(visibleRevision(memory.modelIsolation), null, 'another model cannot read private memory')
assert.equal(memory.sharedBrief.visible, true, 'Brief is shared within the book')
assert.equal(memory.sharedBrief.privateMemoryVisible, false, 'private memory is not shared with Brief reader')
for (const row of memory.revisions) {
  assert.ok(row.auditId, `revision ${row.revision} has an MCP audit id`)
  assert.ok(row.evidenceId, `revision ${row.revision} has an Evidence id`)
}

const statuses = new Set(['insufficient', 'observing', 'reviewable', 'promoted'])
const validMemoryValue = (value, asOf) =>
  typeof value === 'object' &&
  value !== null &&
  value.schemaVersion === 1 &&
  typeof value.updatedAsOf === 'string' &&
  Date.parse(value.updatedAsOf) <= Date.parse(asOf) &&
  (value.sampleCount === undefined || Number.isInteger(value.sampleCount)) &&
  statuses.has(value.status)

for (const value of memory.corruptValues) {
  assert.equal(
    validMemoryValue(value, '2026-08-23T00:00:00Z'),
    false,
    'malformed/future memory is ignored',
  )
}

const retained = source.rows.filter((row) => Date.parse(row.availableAt) <= Date.parse(source.asOf))
const dropped = source.rows.filter((row) => Date.parse(row.availableAt) > Date.parse(source.asOf))
assert.deepEqual(retained.map((row) => row.id), source.expectedRetainedIds, 'future rows are excluded')
assert.deepEqual(dropped.map((row) => row.id), source.expectedDroppedIds, 'future rows are diagnosed')

const staleAge =
  (Date.parse(source.staleCase.asOf) - Date.parse(source.staleCase.newestAvailableAt)) / 3_600_000
assert.equal(staleAge <= source.staleCase.freshnessHours, source.staleCase.expectedFresh, 'stale source blocks')

const primary = source.conflictCase.sources.find((row) => row.primaryForClaim)
assert.equal(primary.id, source.conflictCase.expectedResolution, 'primary source resolves claim conflict')
assert.equal(source.conflictCase.mustNotAverage, true, 'conflicting categorical facts are not averaged')

const bases = new Set(source.adjustmentCase.series.map((row) => row.adjustment))
const adjustmentBlocked = bases.size > 1 && !source.adjustmentCase.corporateActionReconciled
assert.equal(adjustmentBlocked, source.adjustmentCase.expectedBlocked, 'mixed price bases block returns')

for (const row of source.degradationCases) {
  if (row.expectedJudgement === 'unable') assert.equal(row.expectedAction, 'WAIT')
  else assert.equal(row.expectedAction, 'CONTINUE')
}

for (const fixture of golden.cases) {
  const output = execute(fixture.request)
  assert.notEqual(output.status, 'blocked', `${fixture.name} is executable`)
  assertSubset(output.data, fixture.expected, fixture.name)
}

const generator = scannerGolden.generator
const start = Date.parse(generator.start)
const bars = Array.from({ length: generator.count }, (_, index) => {
  const close = index < generator.declineStartIndex
    ? generator.baseClose
    : generator.baseClose - (index - generator.declineStartIndex + 1) * generator.declinePerDay
  return {
    timestamp: new Date(start + index * 86_400_000).toISOString(),
    open: close,
    high: close + generator.highOffset,
    low: close + generator.lowOffset,
    close,
    volume: generator.volume,
  }
})
const scannerOutput = execute({
  ...scannerGolden.request,
  input: { ...scannerGolden.request.input, bars },
})
assert.equal(scannerOutput.status, 'ok', 'legacy scanner fixture executes')
assert.deepEqual(scannerOutput.data.lenses, scannerGolden.expected.lenses)
assert.equal(scannerOutput.data.indicators.close, scannerGolden.expected.close)
assert.equal(scannerOutput.data.indicators.rsi14, scannerGolden.expected.rsi14)
assert.equal(scannerOutput.data.indicators.offHigh200, scannerGolden.expected.offHigh200)
assert.equal(scannerOutput.data.indicators.aboveLow200, scannerGolden.expected.aboveLow200)
assert.equal(scannerOutput.data.indicators.ma200Distance, scannerGolden.expected.ma200Distance)
assert.deepEqual(
  Object.entries(scannerOutput.data.signals.meanReversion).filter(([, fired]) => fired).map(([name]) => name),
  scannerGolden.expected.meanSignals,
)

assert.equal(topology.managers.length, 3, 'package has KR, US and Global managers')
assert.equal(new Set(topology.managers.map((row) => row.privateMemoryScope)).size, 3, 'manager memory scopes are isolated')
assert.deepEqual(topology.emptyMemoryDecisions.map((row) => row.valid), [true, true, true], 'all managers decide from empty memory')
assert.equal(topology.managers.filter((row) => row.mayCrossMarketRebalance).length, 1, 'only Global may cross-market rebalance')
assert.equal(
  topology.simultaneousCandidates.specialistMaximumCombinedWeight,
  topology.simultaneousCandidates.krBriefBudgetRemaining + topology.simultaneousCandidates.usBriefBudgetRemaining,
  'specialists cannot double-spend global cash beyond sleeve budgets',
)

const promotionRows = []
const promotionStart = Date.parse('2026-01-01T00:00:00Z')
for (let cluster = 0; cluster < promotion.generator.clusterCount; cluster += 1) {
  for (let index = 0; index < promotion.generator.rowsPerCluster; index += 1) {
    promotionRows.push({
      cohort: 'promote',
      signalDate: new Date(promotionStart + cluster * promotion.generator.clusterGapDays * 86_400_000).toISOString().slice(0, 10),
      market: promotion.generator.markets[(cluster + index) % promotion.generator.markets.length],
      regime: promotion.generator.regimes[(cluster + index) % promotion.generator.regimes.length],
      ruleVersion: 'lens-v1',
      forward: { d20: { returnPct: promotion.generator.returnsPct[index] } },
    })
  }
}
const promotionOutput = execute({ ...promotion.request, input: { ...promotion.request.input, rows: promotionRows } })
assert.equal(promotionOutput.status, 'ok', 'promotion gate executes without prose or I/O')
assert.equal(promotionOutput.data.totalMaturePromote, promotion.expected.totalMaturePromote)
assert.equal(promotionOutput.data.versions[0].sampleCount, promotion.expected.sampleCount)
assert.equal(promotionOutput.data.versions[0].independentClusterCount, promotion.expected.independentClusterCount)
assert.equal(promotionOutput.data.versions[0].regimeCount, promotion.expected.regimeCount)
assert.equal(promotionOutput.data.versions[0].gate.reviewReady, promotion.expected.reviewReady)
assert.deepEqual(promotionOutput.data.costModelPct, promotion.expected.costModelPct)
assert.ok(promotionOutput.data.versions[0].bootstrapClusterCiCostAdjusted, 'cluster bootstrap CI is present')

for (const fixture of outcomes.cases) {
  const output = execute(fixture.request)
  if (fixture.expected.status) {
    assert.equal(output.status, fixture.expected.status, fixture.name)
    assert.deepEqual(output.data.missingCostFields, fixture.expected.missing, fixture.name)
  } else assertSubset(output.data, fixture.expected, fixture.name)
}

const dartOutput = execute({ operation: 'normalizeDartFilings', asOf: krSource.asOf, input: krSource.dart })
assert.deepEqual(dartOutput.data.rows.map((row) => row.receiptNumber), krSource.expected.retainedReceiptNumbers, 'future DART filing is excluded')
assert.equal(dartOutput.data.rows.filter((row) => row.isPreliminaryEarnings).length, krSource.expected.preliminaryCount)
assert.equal(dartOutput.data.rows.filter((row) => row.isPeriodicReport).length, krSource.expected.periodicCount)
assert.equal(dartOutput.data.rows.filter((row) => row.isCorrection).length, krSource.expected.correctionCount)
const corpCodes = execute({ operation: 'parseDartCorpCodes', asOf: krSource.asOf, input: { xml: krSource.corpCodeXml } })
assert.equal(corpCodes.data.rows[0].stockCode, '005930')
const dartFinancials = execute({ operation: 'normalizeDartFinancials', asOf: krSource.asOf, input: krSource.financials })
assert.equal(dartFinancials.data.rows.length, 1, 'future DART financial rows are excluded')
assert.equal(dartFinancials.data.rows[0].currentAmount, 123456)

for (const fixture of usSchedule.cases) {
  const output = execute({ operation: 'earningsCheckpoint', asOf: fixture.observation.capturedAt, input: { observation: fixture.observation, marketSession: fixture.session, config: fixture.config } })
  assert.equal(output.data.at, fixture.expectedAt, fixture.name)
}
const holidayReview = execute({
  operation: 'nextMarketReview',
  asOf: '2026-12-24T22:00:00Z',
  input: { sessions: [usSchedule.closedSession, usSchedule.nextOpenSession], bufferMinutes: 45 },
})
assert.equal(holidayReview.data.next.reviewAt, usSchedule.expectedNextReviewAt, 'closed session is skipped')
const drift = execute({ operation: 'scheduleDrift', asOf: '2026-08-20T00:00:00Z', input: { previous: { at: '2026-08-21T20:30:00Z', sourceUrl: 'https://ir.example.test/old', capturedAt: '2026-08-01T00:00:00Z' }, current: { at: '2026-08-22T20:30:00Z', sourceUrl: 'https://ir.example.test/new', capturedAt: '2026-08-19T00:00:00Z' } } })
assert.equal(drift.data.changed, true)
assert.equal(drift.data.staleWakeDisposition, 'verify-stale-then-rearm-without-trade')
const retry = execute({ operation: 'boundedRetry', asOf: '2026-08-20T00:00:00Z', input: { checkpointAt: '2026-08-19T23:50:00Z', attempt: 0, config: { retryMinutes: 45, maxRetries: 2 } } })
assert.equal(retry.data.at, '2026-08-20T00:45:00.000Z')
assert.equal(retry.data.attempt, 1)
const exhaustedRetry = execute({ operation: 'boundedRetry', asOf: '2026-08-20T00:00:00Z', input: { checkpointAt: '2026-08-19T23:50:00Z', attempt: 2, config: { retryMinutes: 45, maxRetries: 2 } } })
assert.equal(exhaustedRetry.data.at, null)
assert.equal(exhaustedRetry.status, 'unevaluated')
const submissions = execute({ operation: 'normalizeSecSubmissions', asOf: '2026-08-20T00:00:00Z', input: usSchedule.secSubmissions })
assert.deepEqual(submissions.data.rows.map((row) => row.accession), ['0000000000-26-000001'])
assert.equal(submissions.data.rows[0].isEarningsFiling, true)

for (const [name, fixture] of Object.entries(globalIntegration.wakes)) {
  const output = execute({ operation: 'classifyScheduledWake', asOf: globalIntegration.asOf, input: { ...fixture, asOf: globalIntegration.asOf } })
  if (name === 'duplicate') assert.equal(output.data.submitDecision, false, 'duplicate wake cannot submit')
  else assert.equal(output.data.submitDecision, true, `${name} wake remains observable through one Decision`)
}
for (const fixture of Object.values(globalIntegration.themeRadar)) {
  const output = execute({ operation: 'themeRadarDue', asOf: globalIntegration.asOf, input: fixture })
  assert.equal(output.data.due, fixture.expectedDue)
}
const dedupe = execute({ operation: 'deduplicateObservations', asOf: globalIntegration.asOf, input: { rows: globalIntegration.dedupe } })
assert.equal(dedupe.data.duplicateCount, 1, 'duplicate articles/filings are collapsed')
assert.equal(dedupe.data.retained.length, 2, 'unique observations remain')

const backtestRows = Array.from({ length: backtest.generator.count }, (_, index) => ({
  date: new Date(Date.parse(backtest.generator.start) + index * 86_400_000).toISOString().slice(0, 10),
  close: backtest.generator.baseClose * (1 + backtest.generator.dailyReturn) ** index,
}))
const gateBacktest = execute({ operation: 'trendGateForward', asOf: '2026-12-31T00:00:00Z', input: { series: backtestRows } })
assert.equal(gateBacktest.data.classifiableDays, backtest.expected.classifiableDays)
assert.equal(Object.keys(gateBacktest.data.stats).some((key) => key.endsWith(':d20')), backtest.expected.hasD20Bucket)
const dcaBacktest = execute({ operation: 'dcaMultiplierBacktest', asOf: '2026-12-31T00:00:00Z', input: { series: backtestRows } })
assert.equal(dcaBacktest.data.months > 0, backtest.expected.dcaHasMonths)
const benchmarkRows = backtestRows.map((row, index) => ({ ...row, close: 100 * 1.0005 ** index }))
const strata = execute({ operation: 'oversoldStrata', asOf: '2026-12-31T00:00:00Z', input: { assets: [{ market: 'us', bars: backtestRows }], benchmarks: { us: benchmarkRows } } })
assert.equal(strata.data.symbolsUsed, backtest.expected.symbolsUsed)

const krBudget = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { managerId: 'evidence-gated-kr', market: 'XKRX', currentSleeveWeight: 0.3, sleeveBudgetWeight: 0.35, requestedTargetWeight: 0.4 } })
assert.equal(krBudget.status, 'blocked', 'specialist cannot spend beyond its Brief sleeve')
const urgentExit = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { managerId: 'evidence-gated-us', market: 'XNAS', currentSleeveWeight: 0.4, sleeveBudgetWeight: 0.4, requestedTargetWeight: 0.2, emergencyExit: true } })
assert.equal(urgentExit.data.allowed, true, 'urgent exit does not wait for Global')
const globalBudget = execute({ operation: 'globalAllocation', asOf: globalIntegration.asOf, input: { availableWeight: 1, targets: [{ key: 'kr-sleeve', weight: 0.4 }, { key: 'us-sleeve', weight: 0.5 }, { key: 'cash', weight: 0.1 }] } })
assert.equal(globalBudget.status, 'ok')
assert.equal(globalBudget.data.residualCashWeight, 0)
const doubleSpend = execute({ operation: 'globalAllocation', asOf: globalIntegration.asOf, input: { availableWeight: 1, targets: [{ key: 'kr-sleeve', weight: 0.6 }, { key: 'us-sleeve', weight: 0.6 }] } })
assert.equal(doubleSpend.status, 'blocked', 'one global denominator prevents cash double spend')

const thesis = execute({ operation: 'validateThesis', asOf: methodology.asOf, input: methodology.thesis })
assert.equal(thesis.status, 'ok', 'complete thesis metadata is machine-valid')
assert.equal(thesis.data.complete, true)
const producerless = execute({ operation: 'validateThesis', asOf: methodology.asOf, input: { ...methodology.thesis, invalidationTriggers: [{ kind: 'event', event: 'earnings', checkBy: '2026-11-15' }] } })
assert.equal(producerless.status, 'blocked', 'producer-less event invalidation is rejected')
const sentinel = execute({ operation: 'thesisSentinel', asOf: methodology.asOf, input: { invalidations: methodology.thesis.invalidationTriggers.map((row) => ({ ...row, evidenceId: 'metric-1' })), evidence: [{ id: 'metric-1', value: 80 }], priorVerdicts: [{ verdict: 'threatened', asOf: '2026-08-19T00:00:00Z' }, { verdict: 'threatened', asOf: '2026-08-18T00:00:00Z' }] } })
assert.equal(sentinel.data.verdict, 'threatened')
assert.equal(sentinel.data.escalationRequired, true, 'third consecutive threatened verdict forces an explicit decision')
const validMemory = execute({ operation: 'validateMemory', asOf: methodology.asOf, input: { value: methodology.memory.valid } })
assert.equal(validMemory.data.accepted, true)
const futureMemory = execute({ operation: 'validateMemory', asOf: methodology.asOf, input: { value: methodology.memory.future } })
assert.equal(futureMemory.data.accepted, false, 'future memory is ignored')
const mapped = execute({ operation: 'migrationMap', asOf: methodology.asOf, input: { records: methodology.migration, cutoverAt: methodology.asOf } })
assert.equal(mapped.status, 'ok')
assert.deepEqual(Object.values(mapped.data.destinations).map((rows) => rows.length), [1, 1, 1, 1, 1])
assert.equal(mapped.data.backfillForwardTrackRecord, false)
const upside = execute({ operation: 'upsideRadar', asOf: methodology.asOf, input: { candidates: methodology.upside } })
assert.deepEqual(upside.data.ranked.map((row) => row.asset), ['SYNTH-A'])
assert.deepEqual(upside.data.unranked.map((row) => row.asset), ['SYNTH-MISSING'])
assert.equal(upside.data.ranked[0].axes.inflection.signFlip, true)
assert.equal(upside.data.unranked[0].axes.valuation.status, 'unknown', 'missing valuation is never zero-filled')

const executableMatrix = migrationText.split('## Executables')[1].split('## Shared helpers')[0]
const migrationRows = executableMatrix.split('\n').filter((line) => /^\| `[^`]+` \| (AR|PP|PX|RT) \|/.test(line))
assert.equal(migrationRows.length, 65, 'migration matrix inventories exactly 65 Python entry points')
const migrationGroups = new Set(migrationRows.map((line) => line.split('|').at(-2).trim().replaceAll('`', '')))
assert.deepEqual([...migrationGroups].sort(), Object.keys(groupCoverage.groups).sort(), 'every migration fixture group is registered')
for (const [group, checks] of Object.entries(groupCoverage.groups)) assert.ok(checks.length, `${group} has a concrete verification basis`)
assert.equal(manifest.network.mode, 'deny', 'manager package cannot access the network directly')
assert.equal(manifest.engines.aumos, '>=0.3.0', 'runtime requires the current invocation and package-MCP contracts')
assert.equal(manifest.capabilities.some((row) => /order|broker|database/i.test(row.kind)), false, 'manager package declares no order/broker/database capability')
assert.deepEqual(configSchema.required, ['managerId'], 'every installed instance must select one manager role')
assert.deepEqual(
  configSchema.properties.managerId.enum,
  manifest.contributes.managers.map((row) => row.id),
  'config manager ids match contributed managers in manifest order',
)
assert.deepEqual(configSchema.properties.reserveLiquiditySymbols.default, [], 'reserve liquidity is opt-in')
assert.equal(
  mcpConfig.mcpServers['evidence-gated-metrics'].args[0],
  '${AUMOS_MANAGER_PACKAGE}/bin/evidence-gated-metrics-mcp',
  'runtime calculations use the shipped MCP wrapper',
)

const mcpList = handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
assert.deepEqual(mcpList.result.tools.map((tool) => tool.name), ['calculate'])
const mcpCalculation = handleMcpRequest({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'calculate',
    arguments: {
      operation: 'clusters',
      asOf: methodology.asOf,
      input: { dates: ['2026-01-01', '2026-01-10'] },
    },
  },
})
assert.equal(mcpCalculation.result.structuredContent.status, 'ok', 'MCP wrapper executes the core')
assert.deepEqual(
  JSON.parse(mcpCalculation.result.content[0].text),
  mcpCalculation.result.structuredContent,
  'MCP text and structured outputs are identical',
)

const completeCoverage = execute({ operation: 'coverage', asOf: methodology.asOf, input: { scannerUniverses: [['A', 'B'], ['A', 'B']], extensions: ['C'], holdings: ['A'], dispositions: [{ symbol: 'B' }, { symbol: 'C' }], asOf: methodology.asOf } })
assert.equal(completeCoverage.data.complete, true)
assert.deepEqual(completeCoverage.data.uncovered, [])
const sleeve = execute({ operation: 'sleeveNav', asOf: methodology.asOf, input: { cash: [{ currency: 'KRW', amount: 1000000 }, { currency: 'USD', amount: 100 }], positions: [{ symbol: 'SGOV', currency: 'USD', marketValue: 200 }], fx: { USDKRW: 1300 } } })
assert.equal(sleeve.data.usdLiquidity, 300)
assert.equal(sleeve.data.globalNavKrw, 1390000)
const researchGateRun = execute({ operation: 'researchGate', asOf: methodology.asOf, input: { lens: 'mean-reversion', priceDeclineReason: 'temporary', opportunityCase: 'recovery', trapRisks: ['structural-risk'], variantView: 'different', benchmarkAlternative: { expectedReturn: 0.03 }, scenarios: { bear: { probability: 0.2, return: -0.2 }, base: { probability: 0.5, return: 0.12 }, bull: { probability: 0.3, return: 0.3 } }, minimumExpectedActiveReturn: 0.02, challengeVerdict: 'cleared', sourceFresh: true, sourceConflict: false } })
assert.equal(researchGateRun.data.passed, true)
const futureWatch = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'at-time', at: '2026-08-21T00:00:00Z' }, current: {} } })
assert.equal(futureWatch.data.valid, true)
const eventWatch = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'event', event: 'earnings' }, current: {} } })
assert.equal(eventWatch.status, 'blocked')
const actual = execute({ operation: 'earningsActual', asOf: methodology.asOf, input: { preview: { consensus: { operatingIncome: 100 } }, actual: { operatingIncome: 110 }, filing: { announcedAt: '2026-08-19T20:05:00Z', sourceUrl: 'https://ir.example.test/release', sourceType: 'press-release' } } })
assert.equal(actual.data.actualConfirmed, true)
assert.equal(actual.data.comparisons.operatingIncome.consensusSurprisePct, 10)
const classification = execute({ operation: 'outcomeClassification', asOf: methodology.asOf, input: { grossReturnPct: 5, activeReturnPct: -1, benchmarkReturnPct: 6, thesisCompliance: 'followed', riskCompliance: 'followed', executionQuality: 'good' } })
assert.equal(classification.data.failureType, 'benchmark_failure')
const krBlockedLane = execute({ operation: 'laneCoverage', asOf: methodology.asOf, input: { lane: 'kr', intent: 'new-fundamental-buy', sources: { toss: { status: 'fresh' }, 'open-dart': { status: 'missing' } } } })
assert.equal(krBlockedLane.status, 'blocked')
assert.equal(krBlockedLane.data.action, 'WAIT')
const usBlockedLane = execute({ operation: 'laneCoverage', asOf: methodology.asOf, input: { lane: 'us', intent: 'new-fundamental-buy', sources: { toss: { status: 'fresh' }, 'sec-edgar': { status: 'stale' }, alpaca: { status: 'fresh' } } } })
assert.equal(usBlockedLane.status, 'blocked')
assert.deepEqual(usBlockedLane.data.unavailable, ['sec-edgar'])

const movingActions = new Set(['BUY', 'SELL', 'RESIZE', 'HEDGE', 'REBALANCE'])
const assetValid = (asset) => asset && ['equity', 'etf', 'crypto', 'cash'].includes(asset.class) && typeof asset.symbol === 'string' && asset.symbol.length > 0 && (asset.market === undefined || /^[A-Z0-9]{1,12}$/.test(asset.market)) && (asset.currency === undefined || /^[A-Z]{3}$/.test(asset.currency))
const targetValid = (target) => target?.type === 'cash-weight'
  ? target.targetWeight >= 0 && target.targetWeight <= 1
  : target?.type === 'exit'
    ? assetValid(target.asset)
    : target?.type === 'position-weight' && assetValid(target.asset) && target.targetWeight >= 0 && target.targetWeight <= 1
for (const fixture of ampProposals.cases) {
  const proposal = fixture.proposal
  assert.ok(['WAIT', 'WATCH', 'BUY', 'SELL', 'RESIZE', 'HEDGE', 'REBALANCE'].includes(proposal.action), fixture.name)
  assert.ok(Array.isArray(proposal.thesisRefs), `${fixture.name} has thesisRefs`)
  assert.ok(proposal.rationale?.conclusion && Array.isArray(proposal.rationale.keyReasons) && Array.isArray(proposal.rationale.risks), `${fixture.name} has AMP rationale`)
  const targets = [...(proposal.target ? [proposal.target] : []), ...(proposal.targets ?? [])]
  assert.equal(movingActions.has(proposal.action), targets.length > 0, `${fixture.name} action/target consistency`)
  assert.ok(targets.every(targetValid), `${fixture.name} has valid portfolio targets`)
  if (proposal.action === 'SELL') assert.equal(proposal.target.type, 'exit', 'SELL uses the AMP exit target')
  if (proposal.action === 'REBALANCE') assert.ok((proposal.targets ?? []).length >= 2, 'REBALANCE is one multi-target thought')
  for (const watch of proposal.watches ?? []) {
    assert.ok(watch.intent && watch.trigger, `${fixture.name} WATCH has intent and trigger`)
    assert.notEqual(watch.trigger.kind, 'event', 'earnings scheduling never depends on a producer-less event trigger')
  }
}

/**
 * Web-research contract — consensus provenance, the macro layer and the IR cycle.
 *
 * These are the checks issue #50's research-layer comment asks for by name. They
 * live here rather than in a prompt sentence because each one is a refusal: a
 * rule the model cannot talk its way past is a rule this file can fail on.
 */
const researchAsOf = research.asOf
const consensusOf = (observation) => execute({ operation: 'validateConsensus', asOf: researchAsOf, input: observation })

assert.equal(consensusOf(research.consensus.complete).data.complete, true, 'a fully provenanced consensus observation is usable')

const incompleteConsensus = consensusOf(research.consensus.missingFields)
assert.equal(incompleteConsensus.status, 'blocked', 'missing consensus provenance blocks the gate')
assert.equal(incompleteConsensus.data.complete, false)
assert.equal(incompleteConsensus.data.normalized, null, 'an incomplete observation is never normalized into evidence')
for (const code of research.consensus.expectedMissingCodes) {
  assert.ok(incompleteConsensus.diagnostics.some((row) => row.code === code), `missing-field consensus reports ${code}`)
}
const missingKeys = new Set(incompleteConsensus.diagnostics.filter((row) => row.code === 'consensus_field_missing').map((row) => row.path))
for (const key of ['sourceUrl', 'publishedAt', 'capturedAt', 'period']) {
  assert.ok(missingKeys.has(key), `consensus gate names the missing ${key}`)
}

assert.equal(consensusOf(research.consensus.undatedSnippet).status, 'blocked', 'an undated search snippet is not point-in-time consensus')
const noCurrency = consensusOf(research.consensus.monetaryWithoutCurrency)
assert.equal(noCurrency.status, 'blocked', 'a monetary consensus value needs its currency')
assert.ok(noCurrency.diagnostics.some((row) => row.code === 'consensus_currency_missing'))
assert.equal(consensusOf(research.consensus.postAsOf).status, 'blocked', 'a release published after asOf is not evidence for this run')

/**
 * Guidance, consensus and actual stay three types, never one averaged number.
 */
const preserved = ['guidance', 'actual', 'complete'].map((key) => consensusOf(research.consensus[key]))
assert.ok(preserved.every((row) => row.status === 'ok'), 'each observation type is independently valid')
assert.deepEqual(
  preserved.map((row) => row.data.normalized.type),
  ['company-guidance', 'actual', 'consensus'],
  'company guidance, actual and consensus are preserved as distinct evidence types',
)

const macro = execute({ operation: 'validateMacro', asOf: researchAsOf, input: { observations: research.macro.observations } })
assert.equal(macro.status, 'blocked', 'an undated or future macro observation blocks the reading')
assert.deepEqual(macro.data.retained.map((row) => row.indicator), research.macro.expectedRetained, 'only dated, sourced, past macro observations are retained')
assert.deepEqual(macro.data.unusable.filter((row) => row.reason === 'undated').map((row) => row.indicator), research.macro.expectedUndated, 'a dateless put/call reading is refused, not defaulted to now')
assert.deepEqual(macro.data.dropped.map((row) => row.indicator), research.macro.expectedDropped, 'a policy release after asOf is dropped')
assert.deepEqual(macro.data.unusable.filter((row) => row.reason === 'indicator-unknown').map((row) => row.indicator), research.macro.expectedUnknown)
assert.equal(macro.data.officialCount, research.macro.expectedOfficialCount, 'official and aggregator tiers are counted apart')
assert.ok(macro.diagnostics.some((row) => row.code === 'macro_source_not_official'), 'an aggregator restatement keeps its provenance gap')
assert.equal(macro.data.score, null, 'no aggregate macro score is produced')
assert.equal(macro.data.scoreIsJudgement, true, 'a regime call is named as a judgement, not a database')
assert.equal(
  execute({ operation: 'validateMacro', asOf: researchAsOf, input: { observations: [research.macro.observations[0]], webAvailable: false } }).status,
  'blocked',
  'without web research the macro lane blocks instead of falling back silently',
)

const agreeing = execute({ operation: 'crossCheckPrice', asOf: researchAsOf, input: research.priceCrossCheck.agreeing })
assert.equal(agreeing.status, 'ok', 'a web price within tolerance raises no conflict')
const conflicting = execute({ operation: 'crossCheckPrice', asOf: researchAsOf, input: research.priceCrossCheck.conflicting })
assert.ok(conflicting.diagnostics.some((row) => row.code === 'price_source_conflict'), 'a materially different web price is recorded as a conflict')
assert.equal(conflicting.data.selectedSource, research.priceCrossCheck.expectedSelectedSource, 'Toss is the selected price and the choice is stated')
assert.equal(conflicting.data.selected, research.priceCrossCheck.conflicting.tossPrice)

/**
 * The IR cycle: schedule → checkpoint → not-yet-released retry → actual → sentinel.
 */
const irSchedule = execute({
  operation: 'earningsCheckpoint',
  asOf: researchAsOf,
  input: { observation: research.irCycle.schedule, marketSession: research.irCycle.scheduleSession, config: research.irCycle.scheduleConfig },
})
assert.equal(irSchedule.status, 'ok', 'a date-only Korean schedule is schedulable')
assert.equal(irSchedule.data.at, research.irCycle.expectedCheckpointAt, 'a date-only Korean schedule resolves to that date closing plus buffer, not a fixed UTC hour')
assert.equal(irSchedule.data.timing, 'unknown', 'the unknown BMO/AMC state is carried, not guessed')
assert.equal(irSchedule.data.purpose, 'verify-earnings-release', 'the checkpoint asks whether it was released')

const notReleased = execute({ operation: 'earningsActual', asOf: researchAsOf, input: research.irCycle.notReleasedYet })
assert.equal(notReleased.status, 'blocked', 'an at-time wake without a public release confirms nothing')
assert.equal(notReleased.data.actualConfirmed, false)

const releasedReview = execute({ operation: 'earningsActual', asOf: researchAsOf, input: research.irCycle.released })
assert.equal(releasedReview.data.actualConfirmed, true, 'a sourced release with its announcement time is confirmable')
assert.equal(releasedReview.data.comparisons.operatingIncome.consensusSurprisePct, research.irCycle.expectedConsensusSurprisePct)
assert.equal(releasedReview.data.comparisons.operatingIncome.guidanceSurprisePct, research.irCycle.expectedGuidanceSurprisePct)

const sentinelAfter = execute({ operation: 'thesisSentinel', asOf: researchAsOf, input: research.irCycle.sentinelAfterRelease })
assert.equal(sentinelAfter.data.verdict, research.irCycle.sentinelAfterRelease.expectedVerdict, 'the actual result updates the fundamental sentinel')
const sentinelUnverified = execute({ operation: 'thesisSentinel', asOf: researchAsOf, input: research.irCycle.sentinelWhenUnverified })
assert.equal(sentinelUnverified.data.verdict, research.irCycle.sentinelWhenUnverified.expectedVerdict, 'an unevaluable invalidation is watch, never intact')

for (const lane of research.webAbsentLanes) {
  const output = execute({ operation: 'laneCoverage', asOf: researchAsOf, input: { lane: lane.lane, intent: lane.intent, sources: { toss: { status: 'fresh' }, 'sec-edgar': { status: 'fresh' }, alpaca: { status: 'fresh' } } } })
  assert.equal(output.status === 'blocked', lane.expectedBlocked, `web-absent ${lane.intent} degradation`)
  if (lane.expectedBlocked) assert.deepEqual(output.data.unavailable, ['web'], `${lane.intent} names the missing web lane`)
}

const copiedMemory = execute({ operation: 'validateMemory', asOf: researchAsOf, input: { value: research.memoryRawCopy } })
assert.equal(copiedMemory.status, 'blocked', 'private memory may not carry copied source prose')
assert.equal(copiedMemory.data.accepted, false)
assert.ok(copiedMemory.diagnostics.some((row) => row.code === 'memory_raw_source_copied'))

/**
 * The manifest names the sources this package requires. (aumos #384)
 */
const passthrough = manifest.capabilities.find((row) => row.kind === 'source:passthrough')
assert.deepEqual(passthrough.sources, ['toss', 'sec-edgar', 'alpaca'], 'the passthrough capability names its required sources')
assert.ok(
  manifest.capabilities.every((row) => row.kind === 'source:passthrough' || row.sources === undefined),
  'no other capability carries a sources list',
)

console.log('evidence-gated-allocator contract fixtures passed')
