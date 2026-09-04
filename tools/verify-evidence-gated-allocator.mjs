import nodeAssert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated/lib/index.mjs'
import { handleMcpRequest } from '../managers/evidence-gated/lib/mcp-server.mjs'
import { METHODOLOGY } from '../managers/evidence-gated/lib/constants.mjs'
import { GRANDFATHER_DEFAULTS } from '../managers/evidence-gated/lib/diagnostics.mjs'
import { loadParity, comparePort } from './legacy-parity.mjs'

/**
 * ── One package, and there is nothing left to compare it against (aumos #489) ─
 *
 * The methodology was three packages — `evidence-gated-kr`, `evidence-gated-us`,
 * `evidence-gated-global` — and the deterministic core was therefore committed
 * **three times**. `check:collection` existed for the failure that creates: a
 * fix landing in one copy and not the others, three packages sold as one
 * methodology quietly computing different numbers.
 *
 * They are one package with three market **flows** since 2026-08-27, so there is
 * one copy of the core and that check has no subject — it was deleted in the
 * same commit. This file is unchanged in what it does: it runs the core once,
 * against its fixtures.
 */
const fixtureRoot = new URL('../managers/evidence-gated/fixtures/', import.meta.url)
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

/**
 * ── Coverage names that have to be earned (issue #70 §4) ───────────────────
 *
 * `group-coverage.json` said which checks stand behind each migration group,
 * and this file checked two things about it: that the group names matched
 * `MIGRATION.md`, and that no list was empty. Neither asks whether the named
 * check *runs*. `blendedSectorStrength` was registered under `scanner` while
 * being touched by no test at all, and nothing could have noticed — the
 * registry was prose in a JSON file.
 *
 * So `covers()` marks the assertions that stand behind a case name, and two
 * checks at the end of this file make the registry earn itself:
 *
 *  1. every registered case is marked, and every marked case is registered —
 *     set equality, so a name cannot be added to either side alone;
 *  2. at least one assertion actually executed under each mark, counted by
 *     wrapping `assert` rather than trusted.
 *
 * ⚠️ **What it does not check** is that the assertion is about the right
 * thing. A marker over an unrelated assertion still passes. It bounds the
 * failure to "wrong check" and closes off "no check", which is the one that
 * was happening.
 */
let assertionsRun = 0
const assert = new Proxy(nodeAssert, {
  apply(target, thisArg, args) {
    assertionsRun += 1
    return Reflect.apply(target, thisArg, args)
  },
  get(target, property) {
    const value = target[property]
    if (typeof value !== 'function') return value
    return (...args) => {
      assertionsRun += 1
      return value.apply(target, args)
    }
  },
})

const marks = []
/**
 * Each argument is `group/case`. One call may name several — the manifest
 * boundary scan really does stand behind `audit/package-boundary-scan` and
 * `owner-cutover/no-order-code` at once — but **one call is one marker**, so
 * every marker still has to be followed by an assertion of its own. Writing
 * two calls back to back does not let the second one lend its assertions to
 * the first; that hole was found by deleting a case's assertions and watching
 * it stay green.
 */
function covers(...addresses) {
  marks.push({
    addresses: addresses.map((address) => {
      const [group, ...rest] = address.split('/')
      nodeAssert.equal(rest.length, 1, `covers() takes group/case, got ${address}`)
      return { group, case: rest[0] }
    }),
    assertionsBefore: assertionsRun,
  })
}

function assertCoverageWasEarned() {
  const registered = groupCoverage.groups
  const marked = {}
  for (const mark of marks) for (const entry of mark.addresses) (marked[entry.group] ??= new Set()).add(entry.case)
  for (const [group, cases] of Object.entries(registered)) {
    nodeAssert.deepEqual(
      [...(marked[group] ?? [])].sort(),
      [...cases].sort(),
      `${group} exercises exactly the cases it registers — a registered name with no covers() marker is a claim nothing stands behind`,
    )
  }
  for (const group of Object.keys(marked)) {
    nodeAssert.ok(registered[group], `covers() names a group that ${'`group-coverage.json`'} does not register: ${group}`)
  }
  for (const [index, mark] of marks.entries()) {
    const until = marks[index + 1]?.assertionsBefore ?? assertionsRun
    nodeAssert.ok(
      until > mark.assertionsBefore,
      `${mark.addresses.map((entry) => `${entry.group}/${entry.case}`).join(', ')} has a covers() marker with no assertion after it`,
    )
  }
}

function assertSubset(actual, expected, path = 'data') {
  for (const [key, value] of Object.entries(expected)) {
    const next = `${path}.${key}`
    if (value && typeof value === 'object' && !Array.isArray(value)) assertSubset(actual?.[key], value, next)
    else assert.deepEqual(actual?.[key], value, next)
  }
}

const visibleRevision = ({ instance, asOf }) =>
  memory.revisions
    .filter(
      (row) =>
        row.instance === instance &&
        Date.parse(row.writtenAsOf) <= Date.parse(asOf),
    )
    .sort((a, b) => b.revision - a.revision)[0]?.revision ?? null

covers('audit/memory-contract')
assert.equal(memory.runs[0].expectedReadRevision, null, 'run A starts with empty memory')
assert.equal(memory.runs[0].validWithoutPriorMemory, true, 'empty memory still permits a decision')
assert.equal(
  visibleRevision(memory.runs[1]),
  memory.runs[1].expectedReadRevision,
  'run B reads run A revision',
)
covers('learning/memory-revision')
assert.equal(memory.revisions.length, 2, 'same key keeps both revisions')
assert.notEqual(memory.revisions[0].revision, memory.revisions[1].revision, 'revisions are append-only')
assert.equal(visibleRevision(memory.replay), memory.replay.expectedRevision, 'replay excludes future revision')
assert.equal(visibleRevision(memory.isolation), null, 'another instance cannot read private memory')
assert.equal(
  visibleRevision(memory.modelContinuity),
  memory.modelContinuity.expectedRevision,
  'a model swap on the same instance still reads private memory',
)
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

covers('source-parsers/adjustment-conflict')
const bases = new Set(source.adjustmentCase.series.map((row) => row.adjustment))
const adjustmentBlocked = bases.size > 1 && !source.adjustmentCase.corporateActionReconciled
assert.equal(adjustmentBlocked, source.adjustmentCase.expectedBlocked, 'mixed price bases block returns')

for (const row of source.degradationCases) {
  if (row.expectedJudgement === 'unable') assert.equal(row.expectedAction, 'WAIT')
  else assert.equal(row.expectedAction, 'CONTINUE')
}

/**
 * The frozen numeric goldens. Each fixture case is registered under the group
 * whose `MIGRATION.md` row owns it, so a fixture that stops running takes its
 * coverage claim down with it.
 */
const GOLDEN_COVERAGE = {
  'attribution-additive-identity': 'attribution/attribution-additive-identity',
  'twr-with-start-of-day-flow': 'attribution/twr-with-start-of-day-flow',
  'annualized-money-weighted-return': 'attribution/annualized-money-weighted-return',
  'categorical-brier': 'calibration/categorical-brier',
  'independent-date-cluster-chain-link': 'calibration/independent-date-clusters',
  'legacy-heuristic-sizing': 'sizing/legacy-sizing',
  'kelly-is-gated-below-20-samples': 'sizing/legacy-sizing',
  'new-york-dst-spring': 'schedule/dst-holiday-early-close',
  'new-york-dst-fall': 'schedule/dst-holiday-early-close',
}
for (const fixture of golden.cases) {
  const registration = GOLDEN_COVERAGE[fixture.name]
  nodeAssert.ok(registration, `golden case ${fixture.name} names the coverage group it stands behind`)
  covers(registration)
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
covers('scanner/buy-radar')
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

covers('owner-cutover/single-manager-three-flows')
assert.equal(topology.managerId, manifest.id, 'topology names the one published manager id')
assert.equal(topology.flows.length, 3, 'package runs KR, US and allocator flows')
assert.deepEqual(topology.flows.map((row) => row.id), ['kr-sleeve', 'us-sleeve', 'allocate'], 'flow ids are the subagent names')
assert.equal(new Set(topology.flows.map((row) => row.privateMemoryScope)).size, 3, 'flow memory scopes are isolated')
assert.deepEqual(topology.emptyMemoryDecisions.map((row) => row.valid), [true, true, true], 'all flows decide from empty memory')
assert.equal(topology.flows.filter((row) => row.mayCrossMarketRebalance).length, 1, 'only the allocator flow may cross-market rebalance')
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
covers('promotion/cluster-bootstrap', 'promotion/walk-forward', 'promotion/bh-fdr')
assert.equal(promotionOutput.status, 'ok', 'promotion gate executes without prose or I/O')
assert.equal(promotionOutput.data.totalMaturePromote, promotion.expected.totalMaturePromote)
assert.equal(promotionOutput.data.versions[0].sampleCount, promotion.expected.sampleCount)
assert.equal(promotionOutput.data.versions[0].independentClusterCount, promotion.expected.independentClusterCount)
assert.equal(promotionOutput.data.versions[0].regimeCount, promotion.expected.regimeCount)
assert.equal(promotionOutput.data.versions[0].gate.reviewReady, promotion.expected.reviewReady)
assert.deepEqual(promotionOutput.data.costModelPct, promotion.expected.costModelPct)
assert.ok(promotionOutput.data.versions[0].bootstrapClusterCiCostAdjusted, 'cluster bootstrap CI is present')

const OUTCOME_COVERAGE = {
  'kr-complete-cost-round-trip': 'outcome/fill-net-return',
  'missing-us-fx-is-explicit': 'outcome/missing-cost-explicit',
}
for (const fixture of outcomes.cases) {
  const registration = OUTCOME_COVERAGE[fixture.name]
  nodeAssert.ok(registration, `outcome case ${fixture.name} names the coverage group it stands behind`)
  covers(registration)
  const output = execute(fixture.request)
  if (fixture.expected.status) {
    assert.equal(output.status, fixture.expected.status, fixture.name)
    assert.deepEqual(output.data.missingCostFields, fixture.expected.missing, fixture.name)
  } else assertSubset(output.data, fixture.expected, fixture.name)
}

covers('source-parsers/sec-dart-asof')
const dartOutput = execute({ operation: 'normalizeDartFilings', asOf: krSource.asOf, input: krSource.dart })
assert.deepEqual(dartOutput.data.rows.map((row) => row.receiptNumber), krSource.expected.retainedReceiptNumbers, 'future DART filing is excluded')
assert.equal(dartOutput.data.rows.filter((row) => row.isPreliminaryEarnings).length, krSource.expected.preliminaryCount)
assert.equal(dartOutput.data.rows.filter((row) => row.isPeriodicReport).length, krSource.expected.periodicCount)
assert.equal(dartOutput.data.rows.filter((row) => row.isCorrection).length, krSource.expected.correctionCount)

/**
 * OpenDART reports its own refusals on an HTTP 200. Each of these must be a
 * blocked read, never an empty list — the difference between *nothing was filed*
 * and *we were not allowed to look*.
 */
for (const vendorCase of krSource.vendorStatusCases) {
  const output = execute({ operation: 'normalizeDartFilings', asOf: krSource.asOf, input: vendorCase.payload })
  assert.equal(output.status, vendorCase.expectedStatus, `DART ${vendorCase.name} is not read as an answer`)
  assert.ok(output.diagnostics.some((row) => row.code === vendorCase.expectedCode), `DART ${vendorCase.name} names the vendor status`)
  assert.deepEqual(output.data.rows, [], `DART ${vendorCase.name} returns no rows`)
}
const corpCodes = execute({ operation: 'parseDartCorpCodes', asOf: krSource.asOf, input: { xml: krSource.corpCodeXml } })
assert.equal(corpCodes.data.rows[0].stockCode, '005930')
const dartFinancials = execute({ operation: 'normalizeDartFinancials', asOf: krSource.asOf, input: krSource.financials })
assert.equal(dartFinancials.data.rows.length, 1, 'future DART financial rows are excluded')
assert.equal(dartFinancials.data.rows[0].currentAmount, 123456)

covers('earnings/exact-bmo-amc-date-only')
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
covers('schedule/late-missing-duplicate-outage')
const drift = execute({ operation: 'scheduleDrift', asOf: '2026-08-20T00:00:00Z', input: { previous: { at: '2026-08-21T20:30:00Z', sourceUrl: 'https://ir.example.test/old', capturedAt: '2026-08-01T00:00:00Z' }, current: { at: '2026-08-22T20:30:00Z', sourceUrl: 'https://ir.example.test/new', capturedAt: '2026-08-19T00:00:00Z' } } })
assert.equal(drift.data.changed, true)
assert.equal(drift.data.staleWakeDisposition, 'verify-stale-then-rearm-without-trade')
covers('watch/bounded-retry')
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
covers('schedule/theme-radar-due')
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
covers('backtest/trend-gate-forward')
const gateBacktest = execute({ operation: 'trendGateForward', asOf: '2026-12-31T00:00:00Z', input: { series: backtestRows } })
assert.equal(gateBacktest.data.classifiableDays, backtest.expected.classifiableDays)
assert.equal(Object.keys(gateBacktest.data.stats).some((key) => key.endsWith(':d20')), backtest.expected.hasD20Bucket)
covers('backtest/dca-multiplier')
const dcaBacktest = execute({ operation: 'dcaMultiplierBacktest', asOf: '2026-12-31T00:00:00Z', input: { series: backtestRows } })
assert.equal(dcaBacktest.data.months > 0, backtest.expected.dcaHasMonths)
const benchmarkRows = backtestRows.map((row, index) => ({ ...row, close: 100 * 1.0005 ** index }))
covers('backtest/oversold-strata')
const strata = execute({ operation: 'oversoldStrata', asOf: '2026-12-31T00:00:00Z', input: { assets: [{ market: 'us', bars: backtestRows }], benchmarks: { us: benchmarkRows } } })
assert.equal(strata.data.symbolsUsed, backtest.expected.symbolsUsed)

covers('sizing/specialist-budget')
const krBudget = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.3, sleeveBudgetWeight: 0.35, requestedTargetWeight: 0.4 } })
assert.equal(krBudget.status, 'blocked', 'specialist cannot spend beyond its Brief sleeve')
const urgentExit = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { flow: 'us-sleeve', market: 'XNAS', currentSleeveWeight: 0.4, sleeveBudgetWeight: 0.4, requestedTargetWeight: 0.2, emergencyExit: true } })
assert.equal(urgentExit.data.allowed, true, 'urgent exit does not wait for Global')
covers('sizing/global-denominator')
const globalBudget = execute({ operation: 'globalAllocation', asOf: globalIntegration.asOf, input: { availableWeight: 1, targets: [{ key: 'kr-sleeve', weight: 0.4 }, { key: 'us-sleeve', weight: 0.5 }, { key: 'cash', weight: 0.1 }] } })
assert.equal(globalBudget.status, 'ok')
assert.equal(globalBudget.data.residualCashWeight, 0)
const doubleSpend = execute({ operation: 'globalAllocation', asOf: globalIntegration.asOf, input: { availableWeight: 1, targets: [{ key: 'kr-sleeve', weight: 0.6 }, { key: 'us-sleeve', weight: 0.6 }] } })
assert.equal(doubleSpend.status, 'blocked', 'one global denominator prevents cash double spend')

/**
 * ── The staged single-name entry (issue #120) ──────────────────────────────
 *
 * `candidate-research` required a tranche plan of `core-dca` only, and the row
 * that separated the two lanes — a cash deployment "does not count as a ready
 * single-name BUY" — is right and has to survive whatever closes the gap. So
 * these three cases are written as a pair of opposing pressures: the single
 * name gets the ladder the ported theses actually used, and the sample
 * arithmetic does not move in either direction.
 *
 * ⚠️ The one that would be easy to lose is the last assertion of the second
 * case. Three tranches counted as three samples is the same inflation the
 * classification row prevents, arriving from the other side.
 */
covers('research/single-name-tranche-plan')
const trancheAsOf = methodology.asOf
const naverPlan = {
  symbol: '035420',
  lens: 'mean-reversion',
  maturity: 'observing',
  price: 180_000,
  plannedTotalWeight: 0.03,
  tranches: [
    { label: 'T1', weight: 0.01, condition: { kind: 'immediate' }, filled: true },
    { label: 'T2', weight: 0.01, condition: { kind: 'price-below', threshold: 175_000 }, expiresAt: '2099-01-01T00:00:00Z' },
    { label: 'T3', weight: 0.01, condition: { kind: 'at-time', at: '2099-02-01T00:00:00Z' }, expiresAt: '2099-03-01T00:00:00Z' },
  ],
}
const staged = execute({ operation: 'entryTranchePlan', asOf: trancheAsOf, input: naverPlan })
assert.equal(staged.status, 'ok', 'a three-rung plan with sizes and conditions is a plan')
assert.equal(staged.data.staged, true)
assert.equal(staged.data.remainingWeight, 0.02, 'what is left of the plan is arithmetic, not prose')
assert.deepEqual(
  staged.data.findings.map((row) => `${row.label}:${row.kind}`),
  ['T2:tranche_approach', 'T3:tranche_pending'],
  'a rung within 5% is re-read before it fires — the entry-side counterpart of trim_approach',
)
const intention = execute({
  operation: 'entryTranchePlan',
  asOf: trancheAsOf,
  input: { ...naverPlan, tranches: [naverPlan.tranches[0], { label: 'T2', weight: 0.02, condition: null }] },
})
assert.ok(
  intention.diagnostics.some((row) => row.code === 'tranche_condition_missing' && row.severity === 'blocked'),
  '"we will add on weakness" is not a tranche on this side of the line either',
)
const unstaged = execute({ operation: 'entryTranchePlan', asOf: trancheAsOf, input: { ...naverPlan, tranches: [naverPlan.tranches[0]] } })
assert.ok(
  unstaged.diagnostics.some((row) => row.code === 'tranche_plan_required' && row.severity === 'blocked'),
  'an unpromoted lens enters in stages; the reason is the uncertainty, not the weight',
)
const promotedLens = execute({ operation: 'entryTranchePlan', asOf: trancheAsOf, input: { ...naverPlan, maturity: 'promoted', plannedTotalWeight: 0.01, tranches: [naverPlan.tranches[0]] } })
assert.ok(
  !promotedLens.diagnostics.some((row) => row.code === 'tranche_plan_required'),
  'a promoted lens may enter at once; the requirement follows the evidence',
)

covers('research/tranche-plan-not-cash-deployment')
const dcaLadder = execute({ operation: 'entryTranchePlan', asOf: trancheAsOf, input: { ...naverPlan, lens: 'core-dca' } })
assert.equal(dcaLadder.status, 'blocked', 'a Core DCA ladder is refused here rather than relabelled')
assert.ok(dcaLadder.diagnostics.some((row) => row.code === 'tranche_lane_mismatch'))
assert.equal(dcaLadder.data.countsAsSingleNameSample, false)
assert.equal(dcaLadder.data.sampleCount, 0, 'a cash deployment is not a single-name sample; the separation is code, not a label')
assert.equal(staged.data.countsAsCashDeployment, false, 'and the traffic does not flow the other way either')
assert.equal(staged.data.trancheCount, 3)
assert.equal(staged.data.sampleCount, 1, 'three tranches are one idea decided once; counting the rungs would manufacture evidence')
assert.equal(staged.data.sampleKind, 'one-single-name-sample-per-plan-never-one-per-tranche')
assert.ok(
  /staged entry is one sample/i.test(await readFile(new URL('../skills/evidence-gates/SKILL.md', fixtureRoot), 'utf8')),
  'the gate that owns sample independence says it, not only the function that returns it',
)

/**
 * ── The other half of an armed tranche: what happens when it does not fire ─
 *
 * A tranche armed as a bare `price-below` is indistinguishable from any other
 * revisit promise, so an expired T2 left half an entry plan standing with
 * nothing adjudicating it. The marker is the same bridge `run/armed-reviews`
 * uses for reviews — `intent` is the only field that survives the round trip —
 * and the expiry is a blocking diagnostic rather than a silence.
 */
covers('watch/tranche-intent-round-trip')
const armedRung = staged.data.intents.find((row) => row.label === 'T2')
const wake = execute({ operation: 'resolveTrancheWake', asOf: trancheAsOf, input: { summary: `Price fell below 175000 — watching for: ${armedRung.intent}` } })
assert.deepEqual(wake.data, { symbol: '035420', label: 'T2', entryPlanUnfinished: true }, 'the run that wakes is told it is standing in the middle of an entry plan')
assert.equal(
  execute({ operation: 'resolveWakeFlow', asOf: trancheAsOf, input: { summary: armedRung.intent } }).data,
  null,
  'the tranche marker is a different prefix, not a widening of the market-review one',
)
const lapsedPlan = execute({
  operation: 'entryTranchePlan',
  asOf: trancheAsOf,
  input: { ...naverPlan, tranches: [naverPlan.tranches[0], { ...naverPlan.tranches[1], expiresAt: '2000-01-01T00:00:00Z' }, naverPlan.tranches[2]] },
})
assert.ok(
  lapsedPlan.diagnostics.some((row) => row.code === 'tranche_plan_incomplete' && row.severity === 'blocked'),
  'a condition that expired with the plan unfinished is adjudicated, not left standing',
)
assert.deepEqual(lapsedPlan.data.lapsed, ['T2'])
assert.equal(lapsedPlan.data.action, 'REVIEW')

covers('research/thesis-metadata')
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
covers('owner-cutover/canonical-owner-map')
const mapped = execute({ operation: 'migrationMap', asOf: methodology.asOf, input: { records: methodology.migration, cutoverAt: methodology.asOf } })
assert.equal(mapped.status, 'ok')
assert.deepEqual(Object.values(mapped.data.destinations).map((rows) => rows.length), [1, 1, 1, 1, 1])
assert.equal(mapped.data.backfillForwardTrackRecord, false)
covers('learning/upside-radar', 'scanner/upside-radar')
const upside = execute({ operation: 'upsideRadar', asOf: methodology.asOf, input: { candidates: methodology.upside } })
assert.deepEqual(upside.data.ranked.map((row) => row.asset), ['SYNTH-A'])
assert.deepEqual(upside.data.unranked.map((row) => row.asset), ['SYNTH-MISSING'])
assert.equal(upside.data.ranked[0].axes.inflection.signFlip, true)
assert.equal(upside.data.unranked[0].axes.valuation.status, 'unknown', 'missing valuation is never zero-filled')

const executableMatrix = migrationText.split('## Executables')[1].split('## Shared helpers')[0]
const migrationRows = executableMatrix.split('\n').filter((line) => /^\| `[^`]+` \| (AR|PP|PX|RT) \|/.test(line))
covers('audit/migration-matrix-structure')
assert.equal(migrationRows.length, 65, 'migration matrix inventories exactly 65 Python entry points')
const migrationGroups = new Set(migrationRows.map((line) => line.split('|').at(-2).trim().replaceAll('`', '')))
assert.deepEqual([...migrationGroups].sort(), Object.keys(groupCoverage.groups).sort(), 'every migration fixture group is registered')
for (const [group, checks] of Object.entries(groupCoverage.groups)) assert.ok(checks.length, `${group} has a concrete verification basis`)
/**
 * ⚠️ Those two lines are the whole of what the registry used to be checked
 * for: the group name matches the matrix, and the list is not empty. Neither
 * asks whether the named check runs. `assertCoverageWasEarned()` at the end of
 * this file is what asks.
 */
covers('audit/package-boundary-scan', 'owner-cutover/no-order-code')
assert.equal(manifest.network.mode, 'deny', 'manager package cannot access the network directly')
assert.equal(manifest.engines.aumos, '>=0.3.18', 'runtime requires the current invocation and package-MCP contracts, and — since untilled/aumos#576 — an Aumos whose capability enum has `connection:passthrough` in it. ⚠️ The floor moved from `>=0.3.17` for the **same** reason it moved the time before, one field over: `capabilities[].kind` is a closed enum, so a value an older build does not know is not an unknown key that gets stripped — the **whole manifest** is refused and this package drops out of that build\'s catalogue with nobody told. It was `>=0.3.17` because of untilled/aumos#540 and an Aumos that reads `schedule` as a **list**. ⚠️ The floor moved from `>=0.3.15` for a sharper reason than the one it replaced: `schedule` is a key 0.3.16 already knows and reads as a single object, so a list is not an unknown key that gets stripped — it is a known key of the wrong shape, and the **whole manifest** is refused. An older build drops this package from its catalogue without the author being told (#233 measured that failure). The `rule` floor this line used to state is gone with the field: nothing reads a plan\'s `rule` any more, and AMP still accepts it precisely so an older-schema package is not refused')
assert.equal(manifest.capabilities.some((row) => /order|broker|database/i.test(row.kind)), false, 'manager package declares no order/broker/database capability')
/**
 * ⚠️ **Two assertions stood here and the collection split retired them.**
 * (aumos #447)
 *
 * They were `configSchema.required === ['managerId']` and *the selector's enum
 * matches the contributed managers* — the shape where one package carried three
 * managers and each installation chose its role in config. The owner reversed
 * that reading (*"매니저가 여러 매니저를 가진다는 게 어색하다"*): **one package is
 * one manager**, so there is no role to select and the enum has nothing to
 * agree with.
 *
 * What replaces them is the property the split has to keep, stated so the
 * selector cannot come back unnoticed: this package contributes exactly one
 * manager, that manager is the package, and `config` has no way to say
 * otherwise.
 */
assert.equal(manifest.contributes.managers.length, 1, 'one package is one manager')
assert.equal(manifest.contributes.managers[0].id, manifest.id, 'the contributed manager is the package')
assert.equal(configSchema.properties.managerId, undefined, 'no config field selects a role any more')
assert.equal(
  (configSchema.required ?? []).includes('managerId'),
  false,
  'nothing requires an instance to name a role',
)
/*
 * ⛔ `manifest.collection` was asserted here and the field is gone (aumos #489):
 * with one package there is no set to be one of, and its only consumer was the
 * install screen's *install the rest of them* offer. What replaced it is the
 * three flows, and what they are is not a manifest field — it is `agents/` and
 * the skills they name, which the CLI reads and Aumos does not parse.
 */
assert.equal(manifest.collection, undefined, 'a package that is one of nothing declares no collection')
for (const flow of ['kr-sleeve', 'us-sleeve', 'allocate']) {
  assert.ok(
    existsSync(new URL(`../managers/evidence-gated/agents/${flow}.md`, import.meta.url)),
    `the ${flow} flow ships the subagent that runs it`,
  )
  assert.ok(
    existsSync(new URL(`../managers/evidence-gated/skills/${flow}/SKILL.md`, import.meta.url)),
    `the ${flow} flow ships the skill that holds its rules`,
  )
}
assert.ok(
  existsSync(new URL('../managers/evidence-gated/hooks/guard-submit.mjs', import.meta.url)),
  'the submit guard ships with the package that states the rule',
)
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

covers('coverage/universe-union', 'coverage/uncovered-zero')
const completeCoverage = execute({ operation: 'coverage', asOf: methodology.asOf, input: { scannerUniverses: [['A', 'B'], ['A', 'B']], extensions: ['C'], holdings: ['A'], dispositions: [{ symbol: 'B' }, { symbol: 'C' }], asOf: methodology.asOf } })
assert.equal(completeCoverage.data.complete, true)
assert.deepEqual(completeCoverage.data.uncovered, [])
assert.equal(completeCoverage.data.screenedUniverseCount, 3, 'the declaration is the screen plus the extensions; A is held and also screened')

/**
 * ── A pass over the empty set is not a pass (issue #129) ───────────────────
 *
 * The discovery machinery was ported and the universe it sweeps was not, so a
 * real run called `coverage` with two empty lists and was told
 * `complete: true`, `uncovered: []`, no diagnostics — on a denominator made
 * entirely of its own holdings (`run_ba37a8f6907a49c3a805a4ce3ee10ec6`). The
 * three things asserted here are the three ways that result lied: it counted
 * the book as a declaration, it said complete, and it said nothing.
 */
covers('coverage/undeclared-universe')
const undeclared = execute({ operation: 'coverage', asOf: methodology.asOf, input: { scannerUniverses: [], extensions: [], holdings: ['069500', '153130', 'SGOV'], dispositions: [], asOf: methodology.asOf } })
assert.equal(undeclared.data.screenedUniverseCount, 0, 'holdings are the book, never a declaration')
assert.equal(undeclared.data.complete, null, 'complete is unanswerable, and `false` would claim the run looked')
assert.equal(undeclared.status, 'unevaluated', 'the run did not ask — the same answer `evaluateWatch` gives when it could not observe')
assert.ok(
  undeclared.diagnostics.some((row) => row.code === 'universe_undeclared' && row.severity === 'unevaluated'),
  'and it says so by name rather than by an empty uncovered list',
)
assert.deepEqual(undeclared.data.uncovered, [], 'uncovered stays empty, which is why it cannot be the thing that reports this')
const declaredOnce = execute({ operation: 'coverage', asOf: methodology.asOf, input: { scannerUniverses: [['069500']], extensions: [], holdings: ['069500'], dispositions: [], asOf: methodology.asOf } })
assert.ok(
  !declaredOnce.diagnostics.some((row) => row.code === 'universe_undeclared'),
  'a universe every one of whose names happens to be held is still a declared universe',
)
assert.equal(declaredOnce.data.complete, true)

covers('portfolio/krw-usd-sgov-nav')
const sleeve = execute({ operation: 'sleeveNav', asOf: methodology.asOf, input: { cash: [{ currency: 'KRW', amount: 1000000 }, { currency: 'USD', amount: 100 }], positions: [{ symbol: 'SGOV', currency: 'USD', marketValue: 200 }], fx: { USDKRW: 1300 } } })
assert.equal(sleeve.data.usdLiquidity, 300)
assert.equal(sleeve.data.globalNavKrw, 1390000)
covers('research/research-gate', 'research/challenge-block')
const researchGateRun = execute({ operation: 'researchGate', asOf: methodology.asOf, input: { lens: 'mean-reversion', priceDeclineReason: 'temporary', opportunityCase: 'recovery', trapRisks: ['structural-risk'], variantView: 'different', benchmarkAlternative: { expectedReturn: 0.03 }, scenarios: { bear: { probability: 0.2, return: -0.2 }, base: { probability: 0.5, return: 0.12 }, bull: { probability: 0.3, return: 0.3 } }, minimumExpectedActiveReturn: 0.02, challengeVerdict: 'cleared', sourceFresh: true, sourceConflict: false } })
assert.equal(researchGateRun.data.passed, true)
covers('watch/future-at-time')
const futureWatch = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'at-time', at: '2026-08-21T00:00:00Z' }, current: {} } })
assert.equal(futureWatch.data.valid, true)
covers('watch/producerless-event-rejected')
const eventWatch = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'event', event: 'earnings' }, current: {} } })
assert.equal(eventWatch.status, 'blocked')
covers('earnings/actual-anchor')
const actual = execute({ operation: 'earningsActual', asOf: methodology.asOf, input: { preview: { consensus: { operatingIncome: 100 } }, actual: { operatingIncome: 110 }, filing: { announcedAt: '2026-08-19T20:05:00Z', sourceUrl: 'https://ir.example.test/release', sourceType: 'press-release' } } })
assert.equal(actual.data.actualConfirmed, true)
assert.equal(actual.data.comparisons.operatingIncome.consensusSurprisePct, 10)
covers('outcome/failure-taxonomy')
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
 * One manager, three flows — the pre-2026-08-27 package ids are gone. (issue #70 §5)
 */
covers('owner-cutover/flow-lane-ownership')
const realIdBudget = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { managerId: manifest.id, flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.3, sleeveBudgetWeight: 0.35, requestedTargetWeight: 0.32 } })
assert.equal(realIdBudget.data.allowed, true, 'the published manager id is the one specialistBudget accepts')
const staleIdBudget = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { managerId: 'evidence-gated-kr', flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.3, sleeveBudgetWeight: 0.35, requestedTargetWeight: 0.32 } })
assert.ok(staleIdBudget.diagnostics.some((row) => row.code === 'manager_id_unknown'), 'a retired package id is rejected rather than silently owning a lane')
const wrongLane = execute({ operation: 'specialistBudget', asOf: globalIntegration.asOf, input: { flow: 'kr-sleeve', market: 'XNAS', currentSleeveWeight: 0.3, sleeveBudgetWeight: 0.35, requestedTargetWeight: 0.32 } })
assert.ok(wrongLane.diagnostics.some((row) => row.code === 'specialist_market_not_owned'), 'a sleeve flow still cannot allocate outside its market')
assert.equal(
  execute({ operation: 'globalAllocation', asOf: globalIntegration.asOf, input: { availableWeight: 1, targets: [{ key: 'cash', weight: 1 }] } }).data.owner,
  manifest.id,
  'the allocator result is owned by the published manager, not a retired package',
)
const reviewSequence = execute({
  operation: 'nextReviewSequence',
  asOf: globalIntegration.asOf,
  input: {
    krSessions: [{ date: '2026-09-01', openLocal: '09:00', closeLocal: '15:30', timeZone: 'Asia/Seoul', isOpen: true }],
    usSessions: [{ date: '2026-09-01', openLocal: '09:30', closeLocal: '16:00', timeZone: 'America/New_York', isOpen: true }],
    globalReview: { date: '2026-09-02', time: '09:00', timeZone: 'Asia/Seoul' },
  },
})
assert.deepEqual(new Set(reviewSequence.data.sequence.map((row) => row.owner)), new Set([manifest.id]), 'every scheduled review is owned by the one manager')
assert.deepEqual(reviewSequence.data.sequence.map((row) => row.flow).sort(), ['allocate', 'kr-sleeve', 'us-sleeve'], 'reviews are dispatched to the three flows')

/**
 * The scheduler mints a flow per wake, and something reads it back.
 *
 * ⚠️ **This is the check that was missing, and its absence is the whole of
 * #87.** `nextReviewSequence` carried `flow` from the day the three packages
 * became one, and `PROMPT.md` dispatched all three flows on every wake — so the
 * 05:45 KST US review also judged Korea on a bar that had already closed
 * yesterday, and the 16:00 KST Korean review judged the US before its market
 * opened. Every existing assertion passed throughout: they read the sequence the
 * scheduler produced and never asked whether anything consumed it.
 *
 * So the assertions below deliberately cross the boundary. Two of them read
 * prose, which this file does elsewhere for the same reason — a value the
 * deterministic core emits and the prompt never names is a value with no
 * reader, and that is not a state a fixture can see from one side.
 */
/**
 * A config key the investor can set actually sets something. (issue #91)
 *
 * `schedule.krCloseBufferMinutes` and `usCloseBufferMinutes` were declared in
 * `config.schema.json` from the day the three packages became one and read
 * nowhere: the two literals in `nextReviewSequence` were the only values that
 * ever ran, the schema's defaults (60/60) disagreed with them (30/45), and
 * `PROMPT.md` called the buffer "configured" throughout. A number on the
 * install screen that governs nothing is worse than an absent setting, because
 * the investor believes they made a choice.
 *
 * The second assertion is the general one, and it is the reason this is not
 * just two more fixtures: **every key the schedule block declares has to appear
 * in `lib/`.** Four of the six already did; the guard exists so the seventh
 * cannot arrive orphaned.
 */
/**
 * The two dispatch rows a run wrote before this document did, and the re-arm
 * that has no read path. (issues #96, #97)
 *
 * A real run arrived with a `harnessAudit` blocker and no flow. `PROMPT.md`
 * said to dispatch all three; the run declined, correctly, and recorded three
 * reasons in `uncertainty` that **no rule here sanctioned**. It waived a rule in
 * the safe direction and said so — which is the package working, and is also
 * exactly the failure mode it names everywhere else. So the rules are prose
 * now, and prose is what this block checks.
 *
 * The re-arm half is different: a manager can arm a WATCH and cannot read one
 * back, so `reconcileArmedReviews` is what stops a second review waking the same
 * sleeve twice in a day. That is machinery, and it is asserted as machinery.
 */
covers('schedule/dispatch-gaps-and-rearm-dedupe')
const dispatchProse = `${await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')}\n${await readFile(new URL('../skills/orchestrate/SKILL.md', fixtureRoot), 'utf8')}`
for (const [needle, why] of [
  ['pre-flight blocked', 'a blocked run must be told not to dispatch — a flow spends a subagent producing targets the run discards'],
  ['mid-session', 'a wake with no flow can land while a market is open, and a sleeve judged then is judged on a bar that has not closed'],
]) {
  assert.ok(dispatchProse.includes(needle), `the dispatch rules cover "${needle}": ${why}`)
}

const rearmSequence = [{ flow: 'kr-sleeve', at: '2026-08-31T07:00:00.000Z' }, { flow: 'us-sleeve', at: '2026-08-28T20:45:00.000Z' }]
const rearmAsOf = '2026-08-28T18:00:00.000Z'
const firstArm = execute({ operation: 'reconcileArmedReviews', asOf: rearmAsOf, input: { previous: null, sequence: rearmSequence } })
assert.deepEqual(firstArm.data.toArm.map((row) => row.flow), ['kr-sleeve', 'us-sleeve'], 'with nothing recorded, every review in the sequence is armed')

const secondArm = execute({ operation: 'reconcileArmedReviews', asOf: rearmAsOf, input: { previous: firstArm.data.nextState, sequence: rearmSequence } })
assert.deepEqual(secondArm.data.toArm, [], 'a review already armed for that flow and instant is not armed again — since #87 a duplicate wake dispatches the sleeve a second time and seals a second judgement on the same day')
assert.deepEqual(secondArm.data.duplicateFlows, ['kr-sleeve', 'us-sleeve'], 'and it names which ones')

const movedArm = execute({ operation: 'reconcileArmedReviews', asOf: rearmAsOf, input: { previous: firstArm.data.nextState, sequence: [{ flow: 'kr-sleeve', at: '2026-08-31T07:30:00.000Z' }] } })
assert.ok(movedArm.diagnostics.some((row) => row.code === 'review_superseded'), 'a review that moved leaves the old one out there — with no read path it cannot be withdrawn, and pretending it replaced itself is the assumption this key exists to refuse')
assert.deepEqual(movedArm.data.toArm.map((row) => row.at), ['2026-08-31T07:30:00.000Z'], 'the new instant is still armed')

const expiredArm = execute({ operation: 'reconcileArmedReviews', asOf: '2026-09-01T00:00:00.000Z', input: { previous: firstArm.data.nextState, sequence: rearmSequence } })
assert.deepEqual(expiredArm.data.toArm.map((row) => row.flow), ['kr-sleeve', 'us-sleeve'], 'a recorded review whose instant has passed no longer blocks a re-arm — it has already fired')

const memoryKeysSkill = await readFile(new URL('../skills/memory-contract/SKILL.md', fixtureRoot), 'utf8')
assert.ok(memoryKeysSkill.includes('`run/armed-reviews`'), 'the key is published rather than invented by a run')
assert.ok(dispatchProse.includes('run/armed-reviews'), 'and the run skeleton reads it before arming — a dedupe nothing consults is not one')

covers('schedule/configured-buffers-reach-the-calculation')
const sessionsForBuffers = {
  krSessions: [{ date: '2026-09-01', openLocal: '09:00', closeLocal: '15:30', timeZone: 'Asia/Seoul', isOpen: true }],
  usSessions: [{ date: '2026-09-01', openLocal: '09:30', closeLocal: '16:00', timeZone: 'America/New_York', isOpen: true }],
  globalReview: { date: '2026-09-02', time: '08:00', timeZone: 'Asia/Seoul' },
}
const reviewAt = (input, flow) => execute({ operation: 'nextReviewSequence', asOf: globalIntegration.asOf, input: { ...sessionsForBuffers, ...input } }).data.sequence.find((row) => row.flow === flow).at

const schemaSchedule = JSON.parse(await readFile(new URL('../config.schema.json', fixtureRoot), 'utf8')).properties.schedule.properties
const defaultKr = reviewAt({}, 'kr-sleeve')
const defaultUs = reviewAt({}, 'us-sleeve')
assert.equal(reviewAt({ config: { schedule: { krCloseBufferMinutes: schemaSchedule.krCloseBufferMinutes.default } } }, 'kr-sleeve'), defaultKr, "the schema's declared default is the one the code falls back to — two numbers for one setting is how the install screen comes to describe a run that never happened")
assert.equal(reviewAt({ config: { schedule: { usCloseBufferMinutes: schemaSchedule.usCloseBufferMinutes.default } } }, 'us-sleeve'), defaultUs, 'and the same on the US side, where the two disagreed by fifteen minutes')
assert.notEqual(reviewAt({ config: { schedule: { krCloseBufferMinutes: 90 } } }, 'kr-sleeve'), defaultKr, 'a configured buffer moves the review; before #91 it moved nothing')
assert.equal(reviewAt({ config: { schedule: { krCloseBufferMinutes: 90 } }, buffers: { kr: 30 } }, 'kr-sleeve'), defaultKr, 'and a directly passed buffer still overrides config, as it does for priceConflictTolerance')

const scheduleLib = await readFile(new URL('../lib/schedule.mjs', fixtureRoot), 'utf8')
for (const key of Object.keys(schemaSchedule)) {
  assert.ok(scheduleLib.includes(key), `config.schema.json declares schedule.${key} and something reads it — a setting the investor can move that moves nothing is a choice they did not really make`)
}

covers('schedule/stated-cadence-draws-the-calendar')
/**
 * The cadence the scheduler states beside the instant it armed.
 *
 * A run arms one review per flow, so PLANS held at most three future days and
 * the month after them was blank — and a calendar that is empty ahead of the
 * next judgement is read as a manager with nothing planned. Aumos takes an
 * optional `{ cron, timeZone }` on an `at-time` trigger to draw past the
 * appointment; this is the half that produces one.
 *
 * ⚠️ **The rule must never become the schedule.** It wakes nothing — `at` does
 * — and the assertions below are mostly about keeping the two apart: the rule
 * agrees with `at` on the hour, moves when the investor's buffer moves, and is
 * withheld rather than guessed when it cannot be derived. The reason the
 * agreement is asserted rather than assumed is that a rule hardcoded as a
 * literal would pass every other check here while silently ignoring a
 * configured buffer, which is exactly the shape #91 found.
 */
const ruleFor = (flow, input = {}) =>
  execute({ operation: 'nextReviewSequence', asOf: globalIntegration.asOf, input: { ...sessionsForBuffers, ...input } }).data.sequence.find((row) => row.flow === flow).rule

/** The wall-clock `HH:MM` an instant lands on in a zone — what cron writes. */
const localHourMinute = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const read = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${read.hour}:${read.minute}`
}

for (const flow of ['kr-sleeve', 'us-sleeve', 'allocate']) {
  const rule = ruleFor(flow)
  const at = reviewAt({}, flow)
  assert.ok(rule && typeof rule.cron === 'string' && typeof rule.timeZone === 'string', `${flow} states a cadence beside the instant it armed — without one the calendar is blank after the next appointment`)
  const [minute, hour, dayOfMonth, month, weekday] = rule.cron.split(' ')
  assert.equal(rule.cron.split(' ').length, 5, 'five fields, which is the whole of what Aumos parses')
  assert.equal(`${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, localHourMinute(at, rule.timeZone), `${flow}'s rule names the same wall-clock time its armed instant lands on — a rule that disagrees with the appointment beside it draws a forecast of a schedule this manager does not keep`)
  assert.equal(`${dayOfMonth} ${month}`, '* *', 'a market review recurs on a weekday rather than on a date')
  assert.equal(weekday, '1-5', 'weekends are dropped, which is the only holiday knowledge a cron field can honestly carry — about a hundred wrong marks a year removed without a calendar lookup')
}

assert.equal(ruleFor('kr-sleeve').timeZone, 'Asia/Seoul', 'the rule is written in the market\'s own zone, so a DST shift moves it and a fixed UTC hour cannot drift')
assert.equal(ruleFor('us-sleeve').timeZone, 'America/New_York', 'and the US review in New York, where the close actually is')

/**
 * A configured buffer moves the forecast too, which is #91's finding applied to
 * the second reader. A literal would have passed everything above.
 */
assert.notEqual(ruleFor('kr-sleeve', { config: { schedule: { krCloseBufferMinutes: 90 } } }).cron, ruleFor('kr-sleeve').cron, 'a configured buffer moves the drawn cadence, not only the armed instant — otherwise the calendar forecasts a schedule the investor has already changed')
assert.equal(ruleFor('kr-sleeve', { config: { schedule: { krCloseBufferMinutes: 90 } } }).cron, '0 17 * * 1-5', 'and it moves by the buffer it was given: a 15:30 close plus ninety minutes is 17:00 in Seoul')

/**
 * The one case a rule is withheld rather than guessed.
 *
 * Past local midnight the review lands on a different weekday, and no cron
 * field can say *the day after a weekday*. Drawing it a day early would put a
 * forecast on a day nothing happens; null loses the forecast and keeps the
 * armed instant, which is the trade this package makes everywhere it cannot
 * evaluate something.
 */
const midnightCrossing = ruleFor('kr-sleeve', { config: { schedule: { krCloseBufferMinutes: 600 } } })
assert.equal(midnightCrossing, null, 'a buffer that carries the review past local midnight yields no rule at all — a forecast on the wrong weekday is worse than no forecast')
assert.ok(reviewAt({ config: { schedule: { krCloseBufferMinutes: 600 } } }, 'kr-sleeve'), 'and the armed instant survives it, because the rule was never what woke anything')

covers('schedule/wake-flow-dispatch')
/**
 * The wake engine composes a fired plan's event summary as
 * `` `${verdict.reason} — watching for: ${plan.intent}` ``, so the round trip
 * this exercises is the real one rather than the field name this package would
 * have preferred: a plan carries no id the manager may choose, and the event it
 * raises carries no plan id at all.
 */
const marketReviewIntentFor = (flow, at) => reviewSequence.data.sequence.find((row) => row.flow === flow)?.intent ?? `market-review:${flow}:${at} — review`
const asFiredEvent = (intent) => `A session closed — watching for: ${intent}`
for (const row of reviewSequence.data.sequence) {
  const resolved = execute({ operation: 'resolveWakeFlow', asOf: globalIntegration.asOf, input: { summary: asFiredEvent(row.intent) } })
  assert.equal(resolved.data?.flow, row.flow, `the intent a ${row.flow} review is armed with survives into the event summary and resolves back to that flow`)
  assert.equal(resolved.data?.scheduledAt, row.at, 'and to the instant it was scheduled for, so a stale wake is distinguishable')
}
for (const row of reviewSequence.data.sequence) {
  assert.ok(row.intent.length > `market-review:${row.flow}:${row.at}`.length, 'the intent is a sentence a person reads on PLANS as well as a marker this package parses — the marker alone would take the field back to being a timer')
}

const unknownFlowWake = execute({ operation: 'resolveWakeFlow', asOf: globalIntegration.asOf, input: { summary: asFiredEvent('market-review:jp-sleeve:2026-09-01T00:00:00.000Z — a sleeve that does not exist') } })
assert.equal(unknownFlowWake.status, 'blocked', 'a market review naming a flow nothing dispatches is a wake nobody answers, not a silent null')
assert.ok(unknownFlowWake.diagnostics.some((row) => row.code === 'wake_flow_unknown'), 'and it says so by name')

const foreignWake = execute({ operation: 'resolveWakeFlow', asOf: globalIntegration.asOf, input: { summary: 'NVDA traded at $195.00, below the $196.00 line — watching for: revisit the stabilization thesis' } })
assert.equal(foreignWake.status, 'ok', 'a wake this manager did not arm is not an error')
assert.equal(foreignWake.data, null, 'it simply carries no flow, and the orchestrator runs everything')

const classified = execute({
  operation: 'classifyScheduledWake',
  asOf: '2026-09-01T07:01:00.000Z',
  input: { watchId: 'evt_01HQ', summary: asFiredEvent(marketReviewIntentFor('kr-sleeve', '2026-09-01T07:00:00.000Z')), scheduledAt: '2026-09-01T07:00:00.000Z', asOf: '2026-09-01T07:01:00.000Z' },
})
assert.equal(classified.data.flow, 'kr-sleeve', 'the call a run already makes to ask whether it is due also tells it what it was woken for')
assert.equal(
  execute({ operation: 'classifyScheduledWake', asOf: '2026-09-01T07:01:00.000Z', input: { watchId: 'evt_01HQ', consumedWatchIds: ['evt_01HQ'], scheduledAt: '2026-09-01T07:00:00.000Z', asOf: '2026-09-01T07:01:00.000Z' } }).data.disposition,
  'deduplicated',
  "dedupe stays on the wake's own id — Aumos's eventId is unique per firing, and the intent is deliberately not, because tomorrow's KR review says the same words",
)

const orchestrateSkill = await readFile(new URL('../skills/orchestrate/SKILL.md', fixtureRoot), 'utf8')
const orchestrationProse = `${await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')}\n${orchestrateSkill}`
assert.ok(orchestrationProse.includes('resolveWakeFlow'), 'the prompt or its orchestration skill names the operation that reads the wake — otherwise the flow is minted and read by nobody, which is the #87 defect exactly')
for (const flow of reviewSequence.data.sequence.map((row) => row.flow)) {
  assert.ok(orchestrationProse.includes(flow), `orchestration names the flow ${flow} the scheduler can arm; a flow the scheduler mints and the prompt cannot dispatch is a wake with no answer`)
}
assert.ok(orchestrateSkill.includes('market'), 'the orchestration skill states what a single-sleeve run may propose; a sleeve that never saw the other one cannot claim the whole book')

/**
 * A risk-increasing RESIZE is the `existing-position` lens, and `evidence-gates`
 * sends it through this gate. (issue #70 §24)
 */
covers('research/resize-lens')
const resizeResearch = { lens: 'existing-position', priceDeclineReason: 'temporary', opportunityCase: 'recovery', trapRisks: ['structural-risk'], variantView: 'different', benchmarkAlternative: { expectedReturn: 0.03 }, scenarios: { bear: { probability: 0.2, return: -0.2 }, base: { probability: 0.5, return: 0.12 }, bull: { probability: 0.3, return: 0.3 } }, minimumExpectedActiveReturn: 0.02, challengeVerdict: 'cleared', sourceFresh: true, sourceConflict: false }
assert.equal(execute({ operation: 'researchGate', asOf: methodology.asOf, input: resizeResearch }).data.passed, true, 'the RESIZE lens the skills name has a passing path')
assert.equal(execute({ operation: 'researchGate', asOf: methodology.asOf, input: { ...resizeResearch, lens: 'vibes' } }).status, 'blocked', 'an unnamed lens is still rejected')
for (const lens of ['inflection', 'post-event-continuation']) {
  assert.equal(
    execute({ operation: 'researchGate', asOf: methodology.asOf, input: { ...resizeResearch, lens } }).data.passed,
    true,
    `the radar branch lens ${lens} has a passing research path; a lens the prompt names and the gate refuses is not a lens`,
  )
}

/**
 * A revisit promise expires, and a drift promise is checked for already-met.
 * (issue #70 §23)
 */
/**
 * A WATCH is evaluated on the observation a run actually has, and `near` and
 * `unevaluable` are their own answers. (issue #88)
 *
 * The original harness shipped two evaluators — `bin/gate-check` on completed
 * daily bars and `bin/night-gate-check` on live prices during the US session —
 * and `night-gate-check`'s own docstring drew the line between them: basing
 * gates need a bar that has closed, so the night path does not evaluate them.
 * The port kept one evaluator and lost four things with the second: `near`, the
 * hard-block downgrade that spares `not_met`, `unevaluable` as distinct from
 * not-met, and one-alert-per-session.
 *
 * The assertion that matters most is the third. A daily-close condition looked
 * at from an intraday run reporting `not-met` is a run claiming a check it
 * never ran, and nothing downstream can tell the difference afterwards.
 */
covers('watch/intraday-cadence-and-near')
const priceWatch = { id: 'nvda-entry', kind: 'price-below', threshold: 196 }
const intradayObservation = { kind: 'last-price', sessionDate: '2026-09-01' }
const scoreWatch = (input) => execute({ operation: 'evaluateWatch', asOf: methodology.asOf, input })

const touched = scoreWatch({ watch: priceWatch, observation: { ...intradayObservation, price: 195 } })
assert.equal(touched.data.status, 'met', 'a level touched on a live price is met — this is the condition the original evaluated intraday, and the only one it did')
assert.equal(touched.data.confirmationPending, true, 'and a met price WATCH is a reason to look, never a confirmed entry: basing and the MA200 state need a bar that has closed')
assert.equal(touched.data.alertRequired, true, 'the first touch in a session wakes somebody')
assert.equal(
  scoreWatch({ watch: priceWatch, observation: { ...intradayObservation, price: 195 }, alertedSessionKeys: [touched.data.sessionKey] }).data.alertRequired,
  false,
  'the same level brushed again in the same session is the same event',
)

assert.equal(scoreWatch({ watch: priceWatch, observation: { ...intradayObservation, price: 200 } }).data.status, 'near', 'a level approached is `near`, which is what makes an alert useful before it is too late')
assert.equal(scoreWatch({ watch: priceWatch, observation: { ...intradayObservation, price: 250 } }).data.status, 'not-met', 'and a price nowhere near it is not-met')

const blockedWatch = scoreWatch({ watch: priceWatch, observation: { ...intradayObservation, price: 195 }, blocks: ['earnings_block'] })
assert.equal(blockedWatch.data.status, 'blocked', 'a standing block lowers a met WATCH')
assert.equal(blockedWatch.data.alertRequired, false, 'and a blocked WATCH does not wake anybody')
assert.equal(
  scoreWatch({ watch: priceWatch, observation: { ...intradayObservation, price: 250 }, blocks: ['earnings_block'] }).data.status,
  'not-met',
  'but a block never lowers not-met — the report still has to say the level is not there, which is the original `active_block` rule verbatim',
)

/**
 * ⚠️ Drift is `intraday`, and this block asserted the opposite until the
 * runtime was read. Aumos's Wake Engine evaluates a `weight-drift` trigger on a
 * live quote, on the same tick as the price triggers — so an evaluator that
 * called that `unevaluable` would refuse to score every drift wake it was sent.
 */
const driftWatch = { id: 'kospi-drift', kind: 'weight-drift', threshold: 0.05, baselineWeight: 0.2 }
const driftIntraday = scoreWatch({ watch: driftWatch, observation: { kind: 'last-price', weight: 0.27, sessionDate: '2026-09-01' } })
assert.equal(driftIntraday.data.status, 'met', 'a drift read off a live quote is scored, because that is the reading the wake engine fired on')
assert.equal(driftIntraday.data.confirmationPending, true, 'and it is a reason to look rather than a weight to act on — it moves for the rest of the session')
assert.equal(
  scoreWatch({ watch: driftWatch, observation: { kind: 'last-price', weight: 0.242, sessionDate: '2026-09-01' } }).data.status,
  'near',
  'a drift inside the configured fraction of its threshold is near',
)

const driftBlind = scoreWatch({ watch: driftWatch, observation: { kind: 'clock' } })
assert.equal(driftBlind.data.status, 'unevaluable', 'with no quote at all the answer is unevaluable, not not-met — reporting the second is claiming a check that never ran, and the wake engine draws the same line by reporting `unevaluated` rather than `not fired` when a quote is missing')
assert.equal(driftBlind.data.needs, 'last-price', 'and it says what it would have needed')
assert.ok(driftBlind.diagnostics.some((row) => row.code === 'watch_cadence_unavailable'), 'by name, so a reader afterwards can tell a missed check from a failed one')

/**
 * The dedupe state has a home, and the home has a bound.
 *
 * `alertedSessionKeys` is an input, so before this it was a list the caller had
 * to keep somewhere and nothing said where. The original harness kept it in
 * `data/night_gate_state.json`, per night; `run/watch-alerts` is that file with
 * the state inside the memory contract, and the session bound is what keeps it
 * from becoming the ledger `memory-contract` forbids.
 */
const foldAlerts = (input) => execute({ operation: 'watchAlertState', asOf: methodology.asOf, input })
const firstAlert = foldAlerts({ previous: null, sessionDate: '2026-09-01', alerting: ['nvda-entry|2026-09-01'] })
assert.equal(firstAlert.data.changed, true, 'a first alert in a session moves the aggregate, so a revision is worth writing')
const sameSession = foldAlerts({ previous: firstAlert.data.nextState, sessionDate: '2026-09-01', alerting: ['nvda-entry|2026-09-01'] })
assert.equal(sameSession.data.changed, false, 'and the same level brushed again does not — a revision records that an aggregate moved, not that a run happened')
assert.deepEqual(sameSession.data.newlyAlerted, [], 'nothing new alerted')

const nextSession = foldAlerts({ previous: firstAlert.data.nextState, sessionDate: '2026-09-02', alerting: ['nvda-entry|2026-09-02'] })
assert.deepEqual(
  nextSession.data.nextState.alerted,
  ['nvda-entry|2026-09-02'],
  "a new session replaces the previous session's list rather than appending — a key that accumulated every alert ever raised would grow without bound for a fact that stops mattering at the closing bell",
)
assert.ok(nextSession.diagnostics.some((row) => row.code === 'watch_alert_session_rolled'), 'and the roll is stated rather than silent')
assert.equal(foldAlerts({ previous: null, alerting: [] }).status, 'unevaluated', 'without a session date the alerts of two days would merge, so there is no answer to give')

const memoryContractSkill = await readFile(new URL('../skills/memory-contract/SKILL.md', fixtureRoot), 'utf8')
assert.ok(memoryContractSkill.includes('`run/watch-alerts`'), 'the key is a published stable key, not one a run invents')
assert.ok(
  (await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')).includes('`run/watch-alerts`'),
  'and the run skeleton reads it — a stable key no run opens is a key that never accumulates',
)

const sizingSkillText = await readFile(new URL('../skills/sizing-and-concentration/SKILL.md', fixtureRoot), 'utf8')
for (const status of ['near', 'unevaluable', 'blocked']) {
  assert.ok(sizingSkillText.includes(`\`${status}\``), `the skill names the ${status} status; a status the core returns and no skill explains is one a run will not act on`)
}
assert.ok(
  (await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')).includes('evaluateWatch'),
  'the run skeleton reaches for the evaluator; an operation nothing calls is the #87 shape again',
)

covers('watch/expiry-forced-review')
const derivedExpiry = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'at-time', at: '2026-08-21T00:00:00Z' }, current: {} } })
assert.equal(derivedExpiry.data.expirySource, 'default', 'an undeclared expiry is derived from the package expiry rather than left absent')
assert.equal(
  derivedExpiry.data.expiresAt,
  new Date(Date.parse(methodology.asOf) + METHODOLOGY.watchExpiryDays * 86_400_000).toISOString(),
  'and the number it derives from is METHODOLOGY.watchExpiryDays — since #133 there is no config key for it, so a run that passes none still gets thirty days rather than a literal somebody edited into coverage.mjs',
)
assert.equal(derivedExpiry.data.expiresAt, '2026-09-19T00:00:00.000Z')
const expiredWatch = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'price-below', threshold: 50, expiresAt: '2026-08-01T00:00:00Z' }, current: { price: 90 } } })
assert.ok(expiredWatch.diagnostics.some((row) => row.code === 'watch_expired'), 'an expired WATCH forces review instead of renewing itself')
covers('watch/expiry-before-trigger')
const unreachableWatch = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'at-time', at: '2026-11-01T00:00:00Z', expiresAt: '2026-09-01T00:00:00Z' }, current: {} } })
assert.ok(unreachableWatch.diagnostics.some((row) => row.code === 'watch_expiry_before_trigger'), 'a trigger later than its own expiry can never fire')
covers('watch/already-met', 'watch/drift-already-met')
const driftMet = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'weight-drift', threshold: 0.02, baselineWeight: 0.06 }, current: { weight: 0.09 } } })
assert.ok(driftMet.diagnostics.some((row) => row.code === 'watch_already_met'), 'a drift condition already true is invalid, exactly like a price condition')
const driftOpen = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'weight-drift', threshold: 0.03, baselineWeight: 0.06 }, current: { weight: 0.07 } } })
assert.equal(driftOpen.data.valid, true, 'an unresolved drift condition is a valid promise')
const driftUnbaselined = execute({ operation: 'validateWatch', asOf: methodology.asOf, input: { watch: { kind: 'weight-drift', threshold: 0.03 }, current: { weight: 0.07 } } })
assert.ok(driftUnbaselined.diagnostics.some((row) => row.code === 'watch_baseline_missing'), 'a drift promise without its baseline is unevaluated, not assumed open')

/**
 * `factor` is a measured concentration axis, not prose in `allocate`. (issue #70 §22)
 */
const caps = { position: 0.1, sector: 0.2, theme: 0.15, factor: 0.15, portfolioHeat: 0.06 }
covers('sizing/factor-concentration')
const crossSector = execute({
  operation: 'concentration',
  asOf: methodology.asOf,
  input: {
    positions: [
      { symbol: 'AAA', weight: 0.06, sector: 'semiconductors', themes: ['ai'], factors: ['ai-capex'] },
      { symbol: 'BBB', weight: 0.06, sector: 'software', themes: ['cloud'], factors: ['ai-capex'] },
    ],
    proposed: [{ symbol: 'CCC', weight: 0.05, sector: 'utilities', themes: ['power'], factors: ['ai-capex'] }],
    caps,
  },
})
assert.equal(crossSector.data.exposures.factor['ai-capex'], 0.17)
assert.deepEqual(crossSector.data.breaches.map((row) => row.kind), ['factor'], 'a shared loss path across three sectors breaches only the factor cap')
assert.ok(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: [{ symbol: 'AAA', weight: 0.06, factors: ['ai-capex'] }], caps: { position: 0.1, sector: 0.2, theme: 0.15 } } })
    .diagnostics.some((row) => row.code === 'concentration_cap_missing' && row.path === 'caps.factor'),
  'an unconfigured factor cap comes back unevaluated, never as a pass',
)

/**
 * `priceConflictTolerance` is a configuration key the documents can honestly
 * call configured. (issue #70 §26)
 */
covers('policy/price-conflict-tolerance-configurable')
const schema = JSON.parse(await readFile(new URL('../config.schema.json', fixtureRoot), 'utf8'))
assert.equal(schema.properties.priceConflictTolerance.default, 0.05, 'the documented 5% default is in the schema')
assert.ok(schema.properties.concentration.properties.factor, 'the factor cap is configurable')
const strictTolerance = execute({ operation: 'crossCheckPrice', asOf: researchAsOf, input: { ...research.priceCrossCheck.agreeing, config: { priceConflictTolerance: 0.001 } } })
assert.ok(strictTolerance.diagnostics.some((row) => row.code === 'price_source_conflict'), 'a stricter configured tolerance actually tightens the check')

/**
 * The `unit` vocabulary the contract skill prints is the vocabulary the code
 * accepts. (issue #70 §27)
 */
covers('audit/skill-code-unit-vocabulary')
const contractSkill = await readFile(new URL('../skills/data-source-contract/SKILL.md', fixtureRoot), 'utf8')
for (const unit of ['percent', 'ratio', 'count', 'multiple', 'index-points', 'days', 'shares', 'basis-points']) {
  assert.ok(contractSkill.includes(`\`${unit}\``), `the contract skill names the ${unit} unit the code accepts`)
  const observation = { metric: 'x', value: 1, unit, period: 'FY2026', sourceUrl: 'https://example.test', publishedAt: '2026-08-01T00:00:00Z', capturedAt: '2026-08-02T00:00:00Z', type: 'actual' }
  assert.ok(
    !execute({ operation: 'validateConsensus', asOf: methodology.asOf, input: observation }).diagnostics.some((row) => row.code === 'consensus_currency_missing'),
    `${unit} names its own scale and is not treated as money`,
  )
}

/**
 * ── A vendor error is one call's status, not the vendor's state (issue #127) ─
 *
 * A run took two 400s and wrote *the route is down* into `failures/repeated-patterns`
 * and into a Brief conclusion, and the book stopped for two days for a wrong
 * `interval` string. Its own record listed three sibling routes as healthy.
 *
 * Nothing here is arithmetic, so what is checked is that the three documents
 * that had to say it do say it, and that each one says the half it owns: the
 * contract skill owns the triage, the memory contract owns the refusal to write
 * an unconfirmed one down, and `PROMPT.md` extends invariant 5 to reach them.
 * A rule stated in one place and enforced in another is how this went wrong the
 * first time.
 */
covers('audit/vendor-error-triage')
assert.ok(/sibling route/i.test(contractSkill), 'the contract skill names the sibling-route test')
assert.ok(/4xx/.test(contractSkill), 'and says what a 4xx is evidence of')
for (const outcome of ['`missingFields`', '`uncertainty`', '`failures/repeated-patterns`']) {
  assert.ok(contractSkill.includes(outcome), `the triage lands in ${outcome}, in this package's existing vocabulary`)
}
assert.ok(
  contractSkill.includes('`1d`') && contractSkill.includes('`interval`'),
  'the daily candle interval is written down — the string this whole issue was',
)
assert.ok(
  contractSkill.includes('`before`') && contractSkill.includes('`until`') && contractSkill.includes('`nextBefore`') && contractSkill.includes('`nextUntil`'),
  'both Toss time parameters are named, because neither shape is derivable from the other',
)
const memoryWriteSkill = await readFile(new URL('../skills/memory-contract/SKILL.md', fixtureRoot), 'utf8')
assert.ok(
  /unconfirmed diagnosis/i.test(memoryWriteSkill) && memoryWriteSkill.includes('skills/data-source-contract/SKILL.md'),
  'the memory contract refuses an unconfirmed diagnosis and points at the document that confirms one, rather than restating it',
)
const invariantsText = await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')
assert.ok(
  /Infrastructure evidence is evidence/.test(invariantsText),
  'invariant 5 reaches infrastructure evidence — that it did not is the whole of this failure',
)

/**
 * ── The web lane has to reach the flow that needs it (issue #130) ──────────
 *
 * Three documents were each right on their own and closed theme radar between
 * them. The canonical dispatch block named no web tool; `agents/*.md` told a
 * flow that a name it was not given is an absence to **report, never find**;
 * and `skills/theme-radar/SKILL.md` forbids a silent fallback. A flow following
 * all three returns "no web lane" forever — measured 2026-09-04, in a session
 * that held both `WebSearch` and `WebFetch`.
 *
 * There is no arithmetic here and there deliberately is none in `lib/` either:
 * the web tools are the CLI's, so nothing this package can execute observes
 * whether a session holds them. What is checked is that the documents stopped
 * contradicting each other — the block may name them, the discovery ban no
 * longer does, and the orchestrator is told to settle the lane before dispatch.
 * `laneCoverage` is the one part that is arithmetic, and it already was: it is
 * asserted here only to hold the verdict the prose now promises.
 */
covers('audit/web-lane-reaches-the-flow')
const dispatchBlock = /```\n(Your tools are the Aumos gateway's[\s\S]*?)```/.exec(orchestrateSkill)?.[1]
assert.ok(dispatchBlock, 'the canonical dispatch block is still a fenced literal a run copies')
for (const tool of ['WebSearch', 'WebFetch']) {
  assert.ok(dispatchBlock.includes(tool), `the block names ${tool} — a tool left off it is one the flow reports as absent`)
}
assert.ok(
  /only when this session actually holds it/.test(dispatchBlock),
  'and says it is conditional in the block itself, the same shape `source_request` and `connection_request` already use — the block is copied, so a condition stated only in prose beside it does not travel',
)
const discoveryBan = dispatchBlock.split('\n').find((line) => /Do not go looking for others/.test(line))
assert.ok(discoveryBan, 'the block still bans discovery — #87 is why it is there')
for (const tool of ['Bash', 'ToolSearch']) {
  assert.ok(discoveryBan.includes(tool), `${tool} stays named in the discovery ban; narrowing it is not removing it`)
}
for (const tool of ['WebFetch', 'WebSearch']) {
  assert.ok(!discoveryBan.includes(tool), `${tool} is out of the discovery ban — naming a research instrument there reaches the flow as a blanket prohibition`)
}
for (const flow of ['kr-sleeve', 'us-sleeve', 'allocate']) {
  const agentFile = await readFile(new URL(`../agents/${flow}.md`, fixtureRoot), 'utf8')
  const ban = agentFile.split('\n\n').find((paragraph) => /do not use `Bash`/.test(paragraph))
  assert.ok(ban, `${flow} still forbids going to look for tools`)
  assert.ok(ban.includes('`ToolSearch`'), `${flow} keeps ToolSearch out of a flow's hands`)
  assert.ok(
    !ban.includes('`WebFetch`') && !ban.includes('`WebSearch`'),
    `${flow} no longer names the web tools in that sentence — it is the sentence a flow reads as "you may not", and it is why one reported a lane it was holding`,
  )
  assert.ok(
    /research instrument/.test(agentFile) && agentFile.includes('`WebSearch`'),
    `${flow} says instead what a web tool is for, and that it is the orchestrator's prompt that grants it`,
  )
  const sleeveSkill = await readFile(new URL(`../skills/${flow}/SKILL.md`, fixtureRoot), 'utf8')
  const grantSentence = sleeveSkill.split('\n\n').find((paragraph) => /not in this run's grant/.test(paragraph))
  assert.ok(grantSentence, `skills/${flow} still states what is outside the grant`)
  assert.ok(
    !grantSentence.includes('`WebFetch`') && !grantSentence.includes('`WebSearch`'),
    `skills/${flow} no longer asserts the web tools are ungranted — a skill is loaded after the prompt, so it would overrule the list that just named them`,
  )
}
assert.ok(
  orchestrateSkill.includes('laneCoverage') && orchestrateSkill.includes("intent: 'theme-radar'"),
  'the orchestration skill names the call that settles the lane, so the absence is a fact before the dispatch prompt is written rather than a flow\'s answer an hour later',
)
assert.ok(
  invariantsText.includes('laneCoverage') && /settled before dispatch/.test(invariantsText),
  'and the run skeleton says the same at the point theme radar is reached',
)
assert.ok(
  /A silent fallback is forbidden/.test(await readFile(new URL('../skills/theme-radar/SKILL.md', fixtureRoot), 'utf8')),
  'theme radar still refuses the quiet substitute — this issue was never a case for softening it, only for handing the flow the lane it asks for',
)
const webBlocked = execute({
  operation: 'laneCoverage',
  asOf: globalIntegration.asOf,
  input: { lane: 'kr', intent: 'theme-radar', sources: { toss: { status: 'fresh' } } },
})
assert.equal(webBlocked.data.judgement, 'unable', 'with no web lane the forward research intent is still unable to be judged')
assert.ok(webBlocked.diagnostics.some((row) => row.code === 'lane_source_blocked' && row.details.unavailable.includes('web')), 'and it names the web lane as the one that closed it')
assert.equal(
  execute({ operation: 'laneCoverage', asOf: globalIntegration.asOf, input: { lane: 'kr', intent: 'theme-radar', sources: { toss: { status: 'fresh' }, web: { status: 'available' } } } }).data.judgement,
  'reviewable',
  'and a session that holds the web tools reaches a reviewable lane — the outcome the missing block line was denying',
)

/**
 * ── The universe is declared each run, and by a named owner (issue #129) ───
 *
 * `lib/coverage.mjs` now refuses to call an empty sweep complete, which is the
 * half a fixture can measure. The other half is that somebody is told to go and
 * declare one — and the reason it was missing for so long is that the word
 * `universe` appeared four times in this package and every occurrence assumed
 * the thing already existed. So the check is that each document says the half
 * it owns and no document restates another's: the procedure is
 * `candidate-research`'s, the route is `data-source-contract`'s, and `PROMPT.md`
 * says only that the denominator is this run's to declare.
 */
covers('audit/universe-is-declared-each-run')
const universeSkill = await readFile(new URL('../skills/candidate-research/SKILL.md', fixtureRoot), 'utf8')
const universeProcedure = universeSkill.slice(universeSkill.indexOf('## Declaring the universe'), universeSkill.indexOf('## Coverage'))
assert.ok(universeProcedure.length > 0, 'candidate-research owns a procedure for declaring the universe')
assert.ok(/every run/i.test(universeProcedure), 'and it is per run rather than once')
assert.ok(
  universeProcedure.includes('`scannerUniverses`') && universeProcedure.includes('`extensions`') && universeProcedure.includes('`coverage/universe-state`'),
  'it names the two arguments the operation takes and the key the state is kept under, in this package’s existing vocabulary',
)
assert.ok(
  universeProcedure.includes('skills/data-source-contract/SKILL.md') && !universeProcedure.includes('/api/v1/stocks/all'),
  'and it points at the route rather than copying it — a rule written twice is how #127 happened',
)
assert.ok(
  contractSkill.includes('/api/v1/stocks/all'),
  'the contract skill carries the listing route, because endpoints are its half',
)
for (const filter of ['`market`', '`status`', '`securityType`', '`commonShare`']) {
  assert.ok(contractSkill.includes(filter), `the listing route names its ${filter} filter`)
}
assert.ok(
  /not point-in-time|no time parameter/i.test(contractSkill),
  'and states that the roster is read at call time, so a universe declared from it is survivorship-shaped',
)
assert.ok(
  /universe_undeclared/.test(invariantsText) && /complete: null/.test(invariantsText),
  'PROMPT.md names the answer a run gets when it declared nothing, so a run reads it before a tool returns it',
)
assert.equal(
  execute({ operation: 'coverage', asOf: methodology.asOf, input: { scannerUniverses: [], extensions: [], holdings: ['A'], dispositions: [], asOf: methodology.asOf } }).data.complete,
  null,
  'and the documents and the code agree on that value',
)

/**
 * ── The one crossing of the universe boundary (issue #129 §3) ──────────────
 *
 * The ported decision (2026-07-24, option B) was that the mechanical scanners
 * see inside the declared universe and the theme radar is the only way anything
 * else gets in — therefore every radar run examines at least one axis outside
 * it. The port kept the machinery and dropped the obligation: `outside`,
 * `beyond` and `at least one` appeared nowhere in the skill, and
 * `candidate-research` had turned the requirement into *"a theme radar **may**
 * add candidates"*, which a run satisfies by doing nothing.
 */
covers('audit/theme-radar-leaves-the-universe')
const radarSkill = await readFile(new URL('../skills/theme-radar/SKILL.md', fixtureRoot), 'utf8')
/** Whitespace-collapsed, for the reason the prompt prose above is: a check that depends on where a paragraph was reflowed measures the formatter. */
const radarProse = radarSkill.replace(/\s+/g, ' ')
assert.ok(/at least one axis outside the universe/i.test(radarProse), 'the radar states the obligation in the words the decision was made in')
assert.ok(/every run/i.test(radarProse), 'and that it is owed every run rather than when something looks promising')
assert.ok(
  /only way anything else gets in|only crossing/i.test(radarProse),
  'with the reason: the scanners cannot see past the boundary, so nothing else can bring a name across',
)
assert.ok(
  /obligation is to look, never to find/i.test(radarProse),
  'and the counterweight, because a mandatory search that also demanded a result would be the quota-filling this package forbids',
)
const universeProse = universeSkill.replace(/\s+/g, ' ')
assert.ok(
  !/A theme radar \*?\*?may\*?\*? add candidates/.test(universeProse),
  'candidate-research no longer states the obligation as a permission',
)
assert.ok(
  /must add candidates from outside the universe/.test(universeProse) && universeSkill.includes('skills/theme-radar/SKILL.md'),
  'it states the requirement and defers the count of axes to the skill that owns it',)

/**
 * The approved entry-quality gate, in code rather than in prose. (issue #70 §2)
 *
 * Series are built so each case isolates one branch: a knife still cutting
 * lows, the eq-v1 window artifact eq-v2 demotes, and an intraday spike low
 * masking closes that are still setting fresh lows.
 */
const bar = (date, close, { low = close, high = close, open = close } = {}) => ({ date, open, high, low, close })
const series = (values, start = Date.parse('2026-01-01T00:00:00Z')) =>
  values.map((value, index) => bar(new Date(start + index * 86_400_000).toISOString().slice(0, 10), ...(Array.isArray(value) ? [value[0], value[1]] : [value])))

const stillFalling = series(Array.from({ length: 220 }, (_, index) => 200 - index * 0.5))
covers('scanner/entry-quality-gate')
const knife = execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: stillFalling, lenses: ['mean-reversion'] } })
assert.equal(knife.data.state, 'falling_knife')
assert.equal(knife.status, 'blocked', 'a falling knife is refused by the gate, not merely described by it')
assert.ok(knife.diagnostics.some((row) => row.code === 'entry_quality_falling_knife'))

const uptrend = series(Array.from({ length: 220 }, (_, index) => 100 + index * 0.5))
const healthy = execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: uptrend, lenses: ['trend-pullback'] } })
assert.equal(healthy.data.state, 'pullback_in_uptrend')
assert.equal(healthy.data.passed, true)

/**
 * eq-v2: a nine-month-old window low used to force `basing` no matter how the
 * name had traded since. The last 60 bars now decide.
 */
const oldLowThenFalling = series([
  ...Array.from({ length: 160 }, (_, index) => 100 + index * 0.5625),
  ...Array.from({ length: 60 }, (_, index) => 190 - index),
])
covers('scanner/eq-v2-window-artifact')
const demoted = execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: oldLowThenFalling, lenses: [] } })
assert.ok(demoted.data.sessionsSinceNewLow >= 5, 'the full window reading is the one eq-v1 would have passed on')
assert.equal(demoted.data.sessionsSinceNewLow60, 0, 'the last 60 bars are still setting new lows')
assert.equal(demoted.data.state, 'falling_knife', 'eq-v2 takes the stricter of the two readings')
assert.equal(demoted.data.eqV1WouldPassBasing, true, 'the demotion says why a name that used to pass no longer does')

/**
 * The no_new_low dual lens: the verdict stays on the intraday-low lens and the
 * disagreement is surfaced rather than resolved in favour of basing.
 */
const spikeLow = series(Array.from({ length: 220 }, (_, index) => 200 - index * 0.4))
  .map((row, index) => (index === 210 ? { ...row, low: row.low - 40 } : row))
covers('watch/no-new-low-dual-lens')
const disagree = execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: spikeLow, lenses: [], noNewLow: { sessions: 3, lookback: 20 } } })
assert.equal(disagree.data.noNewLow.met, true, 'the verdict still comes from the intraday-low lens, unchanged')
assert.equal(disagree.data.noNewLow.verdictLens, 'intraday-low')
assert.ok(disagree.data.noNewLow.closeLensNewLowDays.length > 0, 'closes are still setting fresh lows behind the spike')
assert.equal(disagree.data.noNewLow.lensDisagreement, true)
assert.ok(disagree.diagnostics.some((row) => row.code === 'no_new_low_lens_disagreement' && row.severity === 'info'), 'the disagreement is surfaced loudly, not silently resolved')

/**
 * A mean-reversion signal alone needs a confirmed pass state. (approved 2026-07-13)
 */
const neutralBars = series([
  ...Array.from({ length: 190 }, (_, index) => 200 - index * 0.5),
  ...Array.from({ length: 30 }, (_, index) => 105 + index * 3),
])
covers('scanner/mean-reversion-unconfirmed')
const neutral = execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: neutralBars, lenses: ['mean-reversion'] } })
assert.equal(neutral.data.aboveMa200, true)
assert.equal(neutral.data.ma50AboveMa200, false, 'a name that has only just recovered over its MA200 has no golden cross yet')
assert.equal(neutral.data.state, 'neutral', 'above MA200 without the golden cross is neither pullback nor basing')
assert.ok(neutral.diagnostics.some((row) => row.code === 'mean_reversion_unconfirmed'), 'an unconfirmed state is not a pass for a mean-reversion-only candidate')
assert.equal(
  execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: neutralBars, lenses: ['mean-reversion', 'trend-pullback'] } })
    .diagnostics.some((row) => row.code === 'mean_reversion_unconfirmed'),
  false,
  'the restriction is on mean-reversion alone, not on a candidate two lenses agree about',
)

assert.equal(
  execute({ operation: 'entryQualityGate', asOf: methodology.asOf, input: { bars: stillFalling.slice(0, 10) } }).status,
  'unevaluated',
  'absent scan history warns rather than blocks; over-constraint is not caution',
)

/**
 * Lens C — the 5pp band the other two lenses drop. (approved 2026-07-29,
 * implementation anchored to 2026-08-24)
 */
const qualityRise = Array.from({ length: 180 }, (_, index) => 60 + index * 0.9)
const qualityBars = series([
  ...qualityRise,
  // A choppy markdown, not a straight line: a monotone decline puts RSI at zero
  // and would land in `mean-reversion` instead of the band under test.
  ...Array.from({ length: 40 }, (_, index) => qualityRise.at(-1) - 1.5 * (index + 1) + (index % 2 ? 3 : -3)),
])
covers('scanner/quality-pullback-lens')
const scanned = execute({ operation: 'scan', asOf: methodology.asOf, input: { symbol: 'GAP', market: 'us', bars: qualityBars } })
assert.ok(scanned.data.indicators.offHigh200 <= -0.15 && scanned.data.indicators.offHigh200 >= -0.35, 'the fixture sits in the band both other lenses drop')
assert.equal(scanned.data.signals.trendPullback.pullback, false, 'trend-pullback stops at -20% off high')
assert.equal(scanned.data.signals.meanReversion.ma200Discount, false, 'a name above its MA200 does not carry the mean-reversion signals')
assert.deepEqual(scanned.data.lenses, ['quality-pullback'], 'the gap band is covered by its own lens and by no other')
assert.equal(execute({ operation: 'scan', asOf: methodology.asOf, input: { symbol: 'UP', market: 'us', bars: uptrend } }).data.lenses.includes('quality-pullback'), false, 'a name at its high is not a quality pullback')
assert.equal(
  execute({ operation: 'researchGate', asOf: methodology.asOf, input: { ...resizeResearch, lens: 'quality-pullback' } }).data.passed,
  true,
  'the new lens has a passing research path',
)

/**
 * Portfolio heat — total loss if every stop fired, which no weight cap
 * measures. (approved 2026-07-10, P4)
 */
const heatCaps = { position: 0.3, sector: 0.5, theme: 0.5, factor: 0.5, portfolioHeat: 0.06 }
const hotPositions = [
  { symbol: 'AAA', weight: 0.2, stopLossPct: 0.2 },
  { symbol: 'BBB', weight: 0.2, stopLossPct: 0.15 },
  { symbol: 'CORE', weight: 0.4, core: true },
]
covers('audit/portfolio-heat')
const heatOnly = execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: hotPositions, caps: heatCaps } })
assert.equal(heatOnly.data.heat.holdingsOnly, 0.07, 'core DCA carries no stop and contributes no heat')
assert.ok(heatOnly.diagnostics.some((row) => row.code === 'portfolio_heat_above_cap' && row.severity === 'unevaluated'), 'a book already over on its holdings warns; existing risk is grandfathered')
const heatAdding = execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: hotPositions, proposed: [{ symbol: 'CCC', weight: 0.05, stopLossPct: 0.2 }], caps: heatCaps } })
assert.equal(heatAdding.status, 'blocked', 'adding new non-core risk above the cap is refused, not warned')
assert.ok(heatAdding.diagnostics.some((row) => row.code === 'portfolio_heat_breach'))
const heatCool = execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: [{ symbol: 'AAA', weight: 0.1, stopLossPct: 0.2 }], proposed: [{ symbol: 'CCC', weight: 0.05, stopLossPct: 0.2 }], caps: heatCaps } })
assert.equal(heatCool.data.heat.withProposed, 0.03)
assert.equal(heatCool.status, 'ok', 'heat under the cap is not an obstacle')
assert.ok(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: [{ symbol: 'AAA', weight: 0.1 }], caps: heatCaps } })
    .diagnostics.some((row) => row.code === 'portfolio_heat_stop_missing'),
  'a non-core row with no declared stop is unevaluated, never zero risk',
)
const heatTrim = execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: hotPositions, proposed: [{ symbol: 'AAA', weight: 0.05, stopLossPct: 0.2 }], caps: heatCaps } })
assert.equal(heatTrim.data.heat.withProposed, 0.04, 'heat reads a proposed row for a held symbol as that holding restated, so a trim lowers measured heat')
assert.notEqual(heatTrim.status, 'blocked', 'and reducing heat on a book already over the cap is never the thing refused')

/**
 * ── `config.grandfather`, read (issue #109) ────────────────────────────────
 *
 * The key was declared in the schema, shown on the install screen and recorded
 * as ported in `MIGRATION.md`, and nothing read it. The reading it asks for is
 * the one that was missing everywhere: a cap breach the book arrived with is
 * carried, and only what this run adds is refused — including, until now, the
 * **trim** that would have resolved the breach being complained about.
 */
covers('sizing/grandfathered-caps')
const overCap = [
  { symbol: 'AAA', weight: 0.09, sector: 'semiconductors' },
  { symbol: 'BBB', weight: 0.09, sector: 'semiconductors' },
  { symbol: 'CCC', weight: 0.05, sector: 'semiconductors' },
]
const carriedBreach = execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: overCap, caps } })
assert.deepEqual(carriedBreach.data.breaches.map((row) => [row.kind, row.grandfathered]), [['sector', true]], 'a sector the holdings alone are over is a breach the book carries')
assert.notEqual(carriedBreach.status, 'blocked', 'and carrying it does not refuse the run — the reduction that fixes it is planned by a run that is allowed to plan')
assert.ok(carriedBreach.diagnostics.some((row) => row.code === 'concentration_grandfathered' && row.severity === 'unevaluated'))
assert.equal(carriedBreach.data.riskReducingAlwaysAllowed, true)
/**
 * The shape a reduction actually has: a `proposed` row for a symbol the book
 * already holds. Every case here used a symbol that was not held until the
 * review of #109 pointed out that this is precisely the input the fix claims
 * to have unblocked, and precisely the one nothing exercised.
 */
const trimmingTheBreach = execute({
  operation: 'concentration',
  asOf: methodology.asOf,
  input: { positions: overCap, proposed: [{ symbol: 'AAA', weight: 0.02, sector: 'semiconductors' }], caps },
})
assert.equal(trimmingTheBreach.data.exposures.sector.semiconductors, 0.16, 'a proposed row for a held symbol restates that holding; it does not stack on top of it')
assert.notEqual(trimmingTheBreach.status, 'blocked', 'and the trim that resolves the breach is the one thing this gate must never refuse')
assert.deepEqual(trimmingTheBreach.data.breaches, [], 'a trim that lands under the cap leaves no breach to carry')
const stillOverAfterTrim = execute({
  operation: 'concentration',
  asOf: methodology.asOf,
  input: { positions: overCap, proposed: [{ symbol: 'AAA', weight: 0.02, sector: 'semiconductors' }], caps: { ...caps, sector: 0.15 } },
})
assert.equal(stillOverAfterTrim.data.breaches[0].addedNonCoreWeight, -0.07, 'the direction is measured, not assumed')
assert.notEqual(stillOverAfterTrim.status, 'blocked', 'a trim that does not fully resolve the breach is still a trim')
assert.equal(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: overCap, proposed: [{ symbol: 'AAA', weight: 0.1, sector: 'semiconductors' }], caps } }).status,
  'blocked',
  'and a RESIZE **up** on the same axis is refused, so restating a holding is not a way around the cap',
)
const addingToBreach = execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: overCap, proposed: [{ symbol: 'MORE', weight: 0.03, sector: 'semiconductors' }], caps } })
assert.equal(addingToBreach.status, 'blocked', 'existing exposure above a cap is tolerated and new exposure is not')
assert.ok(addingToBreach.diagnostics.some((row) => row.code === 'concentration_breach_expanded'))
assert.deepEqual(carriedBreach.data.blocksExpansionOf, [{ kind: 'sector', key: 'semiconductors' }], 'and what is held back is named per axis, not as a freeze on the book')
assert.equal(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: overCap, proposed: [{ symbol: 'MORE', weight: 0.03, sector: 'semiconductors' }], caps, config: { grandfather: { blocksNewNonCoreWhenBreached: false } } } }).status,
  'unevaluated',
  'and the investor can say otherwise through the key the schema publishes for it',
)
assert.equal(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: overCap, caps, config: { grandfather: { enabled: false } } } }).status,
  'blocked',
  'turning the tolerance off restores the blunt reading in which any breach refuses',
)

/**
 * ── `enabled: false` still may not refuse the reduction (review of #110) ───
 *
 * Turning the tolerance off is a request not to **tolerate** a breach. It was
 * being read as a request to refuse the **trim that resolves** one: with the
 * tolerance off nothing was grandfathered, so every breach fell through to
 * `concentration_breach` — including a reduction of an axis the book was
 * already over, in a response carrying `riskReducingAlwaysAllowed: true`. That
 * is the inversion #109 is named after, reached through the config instead of
 * through the input contract.
 *
 * The direction is now read before the tolerance, and the two cases below are
 * the pair that pins it: a reduction passes, and standing still does not.
 */
const bluntTrim = execute({
  operation: 'concentration',
  asOf: methodology.asOf,
  input: { positions: overCap, proposed: [{ symbol: 'AAA', weight: 0.07, sector: 'semiconductors' }], caps, config: { grandfather: { enabled: false } } },
})
assert.equal(bluntTrim.data.breaches[0].grandfathered, false, 'with the tolerance off nothing is carried as grandfathered')
assert.equal(bluntTrim.data.breaches[0].addedNonCoreWeight, -0.02, 'and the axis is still over the cap after the trim')
assert.notEqual(bluntTrim.status, 'blocked', 'but a reduction is never what a safety gate refuses, whatever the tolerance says')
assert.ok(bluntTrim.diagnostics.some((row) => row.code === 'concentration_grandfathered'))
assert.equal(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: overCap, proposed: [{ symbol: 'MORE', weight: 0.03, sector: 'semiconductors' }], caps, config: { grandfather: { enabled: false } } } }).status,
  'blocked',
  'and an addition to that same axis still refuses: inaction and expansion are not reductions',
)

const bluntHeatTrim = execute({
  operation: 'concentration',
  asOf: methodology.asOf,
  input: { positions: hotPositions, proposed: [{ symbol: 'AAA', weight: 0.175, stopLossPct: 0.2 }], caps: { ...heatCaps, position: 0.5 }, config: { grandfather: { enabled: false } } },
})
assert.equal(bluntHeatTrim.data.heat.withProposed, 0.065, 'the trim lowers measured heat and leaves it above the cap')
assert.equal(bluntHeatTrim.data.heat.holdingsOnly, 0.07)
assert.notEqual(bluntHeatTrim.status, 'blocked', 'heat reads the direction the same way the weight caps do')
assert.equal(
  execute({ operation: 'concentration', asOf: methodology.asOf, input: { positions: hotPositions, caps: { ...heatCaps, position: 0.5 }, config: { grandfather: { enabled: false } } } }).status,
  'blocked',
  'and a book left standing above the heat cap with the tolerance off still refuses',
)

/**
 * Pacing warns and never blocks. (approved 2026-07-10, P5)
 */
covers('audit/new-single-pacing')
const pacing = execute({
  operation: 'newSinglePacing',
  asOf: methodology.asOf,
  input: {
    proposedNewSingles: [{ symbol: 'AAA' }, { symbol: 'BBB' }],
    priorNewSingles: [{ symbol: 'ZZZ', verified: false }],
    sizingPolicyUpdatedAt: methodology.asOf,
    closedOutcomeCount: 0,
  },
})
assert.deepEqual(pacing.data.warnings.map((row) => row.code).sort(), ['multiple-new-singles-one-session', 'prior-single-unverified', 'sizing-policy-changed-today'])
assert.equal(pacing.status, 'unevaluated', 'pacing warns; it is never blocked')
assert.equal(pacing.diagnostics.some((row) => row.severity === 'blocked'), false)
const pacedRelaxed = execute({ operation: 'newSinglePacing', asOf: methodology.asOf, input: { proposedNewSingles: [{ symbol: 'AAA' }, { symbol: 'BBB' }], closedOutcomeCount: 12 } })
assert.equal(pacedRelaxed.data.relaxed, true)
assert.equal(pacedRelaxed.status, 'ok', 'a book with closed outcomes to learn from relaxes to advisory')
assert.equal(execute({ operation: 'newSinglePacing', asOf: methodology.asOf, input: { proposedNewSingles: [{ symbol: 'AAA' }] } }).data.warnings.length, 0)

/**
 * L1 — attention, not signals. (issue #70 §1)
 *
 * A blended RS score with nothing to rank it against decides nothing, which is
 * all this package carried before. The lane ranking, the move since the last
 * run, the regime and the research queue are what the research layer consumes.
 */
const lane = (rate, count = 220) => series(Array.from({ length: count }, (_, index) => 100 * (1 + rate) ** index))
const sectorLane = execute({
  operation: 'sectorStrength',
  asOf: methodology.asOf,
  input: {
    lane: 'us',
    benchmarkBars: lane(0.0004),
    previousRanks: { Semis: 4, Staples: 1 },
    sectors: [
      { name: 'Semis', etf: 'SOXX', risk: 'on', bars: lane(0.0016), leaders: [{ symbol: 'LEAD', bars: lane(0.0018) }] },
      { name: 'Software', etf: 'IGV', risk: 'on', bars: lane(0.0011) },
      { name: 'Energy', etf: 'XLE', risk: 'on', bars: lane(0.0008) },
      { name: 'Staples', etf: 'XLP', risk: 'off', bars: lane(-0.0002) },
      { name: 'Unread', etf: 'XXX', bars: [] },
    ],
  },
})
covers('scanner/sector-rank-and-regime')
assert.deepEqual(sectorLane.data.sectors.filter((row) => row.rank).map((row) => row.name), ['Semis', 'Software', 'Energy', 'Staples'], 'the lane is ranked, not merely scored')
assert.equal(sectorLane.data.sectors.find((row) => row.name === 'Semis').rankChange, 3, 'the move since the previous run is what makes a rank a trigger')
assert.equal(sectorLane.data.regime.leadershipCharacter, 'risk-on', 'the regime reads the character of who is leading, in the published vocabulary')
assert.equal(sectorLane.data.regime.benchmarkAboveMa200, true)
assert.equal(sectorLane.data.regime.isJudgementInput, true, 'the regime is an input to a Brief judgement, never a score this package holds')
covers('scanner/research-queue')
assert.deepEqual(
  sectorLane.data.researchQueue.map((row) => row.sector).sort(),
  ['Energy', 'Semis', 'Software'],
  'the top ranks that actually outperform are where the research layer is sent',
)
assert.ok(sectorLane.data.researchQueue.find((row) => row.sector === 'Semis').reasons.some((row) => row.code === 'rank-jump'))
assert.equal(sectorLane.data.meaning, 'research-priority-only')
covers('scanner/bot-baseline-never-traded')
assert.ok(sectorLane.data.baselineSignals.every((row) => row.tradeable === false), 'the bot baseline is a measuring stick and says so in the data')
assert.equal(sectorLane.data.baselineSignals[0].setup, 'rs_breakout')

covers('scanner/baseline-signals-are-admissible')
/**
 * "Logged for measurement" was an adjective. Every baseline row was missing the
 * two fields `paperAdmission` requires, so the control arm the research cohort
 * is measured against could not be loaded by any published path — and a run
 * that supplied a version would have been inventing one for code it did not
 * write. The rule lives in `baselineSetup`, so the version travels with the row.
 */
for (const row of sectorLane.data.baselineSignals) {
  assert.equal(row.ruleVersion, 'rs-v1', 'the version of the bot travels with the signal; it is not a run\'s to choose')
  assert.equal(row.signalAt, methodology.asOf, 'a forward record is measured from an instant, and this run is it')
}
const baselineAdmitted = execute({
  operation: 'paperAdmission',
  asOf: methodology.asOf,
  input: { setup: sectorLane.data.baselineSignals[0].setup, thesis: sectorLane.data.baselineSignals[0] },
})
assert.equal(baselineAdmitted.status, 'ok', 'a baseline signal is admissible verbatim, with no field a run had to supply itself')
assert.equal(baselineAdmitted.data.cohort, 'mechanical-baseline')
assert.equal(baselineAdmitted.data.openWindow.symbol, 'LEAD')
assert.equal(baselineAdmitted.data.tradeable, false)
assert.ok(sectorLane.diagnostics.some((row) => row.code === 'sector_series_unverified'), 'a sector that could not be read is named unread, never dropped')

/**
 * A negative-RS sector can still rank third in a narrow lane. Rank alone is not
 * leadership, so it does not earn attention.
 */
const narrow = execute({
  operation: 'sectorStrength',
  asOf: methodology.asOf,
  input: { lane: 'kr', benchmarkBars: lane(0.0016), sectors: [{ name: 'A', bars: lane(-0.0002) }, { name: 'B', bars: lane(-0.0003) }, { name: 'C', bars: lane(-0.0004) }] },
})
assert.deepEqual(narrow.data.researchQueue, [], 'in a lane where everything trails the benchmark, third place is not a research trigger')
assert.equal(
  execute({ operation: 'sectorStrength', asOf: methodology.asOf, input: { lane: 'us', sectors: [{ name: 'A', bars: lane(0.001) }] } }).status,
  'unevaluated',
  'without the benchmark the lane is unread rather than neutral',
)

/**
 * L2.5 — the sell-side watch, which had been replaced by post-hoc attribution.
 * (issue #70 §3)
 */
covers('exit/exit-check-sell-trim-review')
const held = { symbol: 'HELD', rules: { stop: 80, target: 150, entry: 100, reviewBy: '2027-01-01', trims: [{ price: 120, sellPct: 30 }] } }
assert.equal(execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { ...held, price: 100 } }).data.action, 'NONE', 'an intact position raises nothing')
assert.equal(execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { ...held, price: 79 } }).data.action, 'SELL')
assert.equal(execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { ...held, price: 121 } }).data.action, 'TRIM')
const approaching = execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { ...held, price: 115 } })
assert.equal(approaching.data.action, 'REVIEW')
assert.ok(approaching.data.findings.some((row) => row.kind === 'trim_approach'), 'a ladder rung within 5% is re-validated before it fires, not after')
const trailing = execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { symbol: 'HELD', price: 88, rules: { trailPct: 0.2, peak: 120 } } })
assert.equal(trailing.data.action, 'SELL')
assert.equal(trailing.data.findings[0].kind, 'trailing_stop')

/**
 * The fundamental lane runs whether or not the price lane says anything — the
 * case a price-only watch was missing entirely.
 */
covers('exit/exit-price-and-fundamental-lanes')
const brokenThesis = execute({
  operation: 'exitCheck',
  asOf: methodology.asOf,
  input: {
    symbol: 'HELD',
    price: 100,
    rules: { stop: 80 },
    thesis: { horizonEnd: '2026-08-01', catalysts: [{ event: 'earnings', windowEnd: '2026-07-31' }], invalidationTriggers: [{ id: 'inv-1', kind: 'metric', checkBy: '2026-08-10' }] },
    sentinel: { verdict: 'threatened' },
  },
})
assert.equal(brokenThesis.data.action, 'REVIEW', 'a thesis breaking on fundamentals is found while price is still above its stop')
assert.deepEqual(
  [...new Set(brokenThesis.data.findings.map((row) => row.kind))],
  ['thesis_review'],
  'horizon end, an unscored catalyst window, a passed check-by and a threatened sentinel all reach the same lane',
)
assert.equal(brokenThesis.data.findings.length, 4)
const priceInvalidation = execute({
  operation: 'exitCheck',
  asOf: methodology.asOf,
  input: { symbol: 'HELD', price: 70, rules: {}, thesis: { invalidationTriggers: [{ id: 'inv-1', kind: 'price_below', level: 75 }] } },
})
assert.equal(priceInvalidation.data.action, 'SELL', 'a met invalidation trigger is a full-exit candidate even with no stop configured')
assert.equal(
  execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { symbol: 'HELD', rules: { stop: 80 }, thesis: { horizonEnd: '2026-08-01' } } }).data.priceLaneRead,
  false,
  'a missing price unreads the price lane; the fundamental lane still runs',
)
assert.ok(
  execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { ...held, price: 100, sentinel: { verdict: 'threatened', escalationRequired: true } } })
    .diagnostics.some((row) => row.code === 'sentinel_escalation_pending' && row.severity === 'blocked'),
  'a third consecutive threatened verdict forces an explicit decision in this run',
)
covers('exit/exit-candidate-never-order')
assert.ok(
  [execute({ operation: 'exitCheck', asOf: methodology.asOf, input: { ...held, price: 79 } }), priceInvalidation]
    .every((row) => row.data.candidateOnly === true),
  'every exit verdict is a candidate for a proposal, never an order',
)

/**
 * The two research layers are skills, not schedule keys. (issue #70 §1)
 */
covers('schedule/theme-radar-workflow-wired')
const prompt = await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')
for (const skill of ['theme-radar', 'position-research']) {
  const text = await readFile(new URL(`../skills/${skill}/SKILL.md`, fixtureRoot), 'utf8')
  assert.ok(text.startsWith(`---\nname: ${skill}\n`), `${skill} declares its own name`)
  assert.ok(prompt.includes(`skills/${skill}/SKILL.md`), `the run skeleton names ${skill}; a skill nothing loads is not a layer`)
}
assert.ok(prompt.includes('themeRadarDue'), 'the schedule key is wired to the workflow it wakes')
assert.ok(prompt.includes('exitCheck') && prompt.includes('thesisSentinel'), 'the sell-side watch has a named call site')

/**
 * The failure taxonomy the skill prints is the one the code produces and
 * accepts. (issue #70 §16, §21)
 *
 * This is the check that would have caught the contradiction: the skill named
 * eleven categories, `outcomeClassification` produced eight, four overlapped,
 * and one of the skill's own rules — execution is an observation, not a
 * methodology failure — was contradicted by the code it described.
 */
covers('outcome/skill-code-taxonomy-agreement')
const calibrationSkill = await readFile(new URL('../skills/outcome-calibration/SKILL.md', fixtureRoot), 'utf8')
/**
 * ⚠️ Each list is checked against **its own section**, not against the whole
 * document. Searching the file caught a planted regression that removed a
 * bucket from the computed table and missed nothing, because the judged
 * section's worked example names the same value in prose — the guard was
 * measuring the document's own commentary. Same class of mistake
 * `tools/check-docs.mjs` documents, caught the same way: by planting it.
 */
const section = (heading, next) => calibrationSkill.slice(calibrationSkill.indexOf(heading), calibrationSkill.indexOf(next))
const computedSection = section('### Computed', '### Judged')
const judgedSection = section('### Judged', '### Execution')
const outcomesSource = await readFile(new URL('../lib/outcomes.mjs', fixtureRoot), 'utf8')
const computedBuckets = [...new Set([...outcomesSource.matchAll(/\[failureType, grade\] = \['([a-z_]+)'/g)].map((match) => match[1]))]
assert.equal(computedBuckets.length, 8, 'the computed axis has eight mutually exclusive buckets')
for (const bucket of computedBuckets) {
  assert.ok(computedSection.includes(`\`${bucket}\``), `the computed table names the bucket ${bucket} the code can return`)
}
const judgedVocabulary = outcomesSource.slice(outcomesSource.indexOf('const JUDGED_FAILURES'), outcomesSource.indexOf('])', outcomesSource.indexOf('const JUDGED_FAILURES')))
const judged = [...judgedVocabulary.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
assert.equal(judged.length, 6)
for (const tag of judged) assert.ok(judgedSection.includes(`\`${tag}\``), `the judged list names the reason ${tag} the code accepts`)
for (const named of [...calibrationSkill.matchAll(/`([a-z_]+_(?:failure|outcome|only))`/g)].map((match) => match[1])) {
  assert.ok(
    computedBuckets.includes(named) || judged.includes(named) || named === 'execution_observation_only',
    `the skill only names taxonomy values the code knows: ${named}`,
  )
}
assert.ok(outcomesSource.includes("'execution_observation_only'"), 'the reading the skill mandates exists in the code')

/**
 * And the rule itself, not only the vocabulary.
 */
covers('outcome/computed-vs-judged-axes', 'outcome/execution-observation-only')
const brokerSlippage = { grossReturnPct: 8, activeReturnPct: 2, thesisCompliance: 'followed', riskCompliance: 'followed', executionQuality: 'poor' }
const observed = execute({ operation: 'outcomeClassification', asOf: methodology.asOf, input: brokerSlippage })
assert.equal(observed.data.failureType, 'good_process_good_outcome', 'a broker fill this manager cannot place does not make the methodology fail')
assert.equal(observed.data.executionObservation.classified, 'execution_observation_only')
assert.equal(observed.data.processGood, true, 'the process reading survives an execution observation')
assert.ok(observed.diagnostics.some((row) => row.code === 'execution_observation_only' && row.severity === 'info'), 'the observation is still recorded rather than disappearing with the grade')
const decisionCaused = execute({ operation: 'outcomeClassification', asOf: methodology.asOf, input: { ...brokerSlippage, executionAttributableToDecision: true } })
assert.equal(decisionCaused.data.failureType, 'execution_failure', 'a mismatch the Decision caused is the exception the skill carves out')
assert.equal(decisionCaused.data.grade, 'Mixed')
assert.equal(
  execute({ operation: 'outcomeClassification', asOf: methodology.asOf, input: { grossReturnPct: 9, thesisCompliance: 'broken', riskCompliance: 'followed', executionQuality: 'good' } }).data.failureType,
  'thesis_failure',
  'a broken thesis that made money is still a broken thesis',
)
const judgedRun = execute({ operation: 'outcomeClassification', asOf: methodology.asOf, input: { ...brokerSlippage, judgedFailures: ['trap_missed'] } })
assert.deepEqual(judgedRun.data.judgedFailures, ['trap_missed'], 'a judged reason travels beside the computed bucket rather than replacing it')
assert.equal(
  execute({ operation: 'outcomeClassification', asOf: methodology.asOf, input: { ...brokerSlippage, judgedFailures: ['vibes_failure'] } }).status,
  'blocked',
  'an unrecognised reason is refused rather than becoming a category with a sample size of one',
)

/**
 * The manifest names what this package reaches, and **which of two kinds each one
 * is**. (aumos #384; split by aumos #576)
 *
 * The split is not cosmetic and is the whole of why this file asserts both halves:
 * a vendor moves between them when the credential does. 토스 and Alpaca are logins
 * the investor connected — the manager is handed no key and the host signs — while
 * SEC EDGAR and 금융감독원 are documents this machine files a key for. Asserting only
 * the total would let a vendor slide from the second list to the first without
 * anybody noticing that a key stopped being asked for.
 */
const passthrough = manifest.capabilities.find((row) => row.kind === 'source:passthrough')
assert.deepEqual(passthrough.sources, ['sec-edgar', 'open-dart'], 'the passthrough capability names the documents this package requires')
const connections = manifest.capabilities.find((row) => row.kind === 'connection:passthrough')
assert.deepEqual(connections.connectors, ['toss', 'alpaca'], 'the connection capability names the logins this package requires')
assert.ok(
  passthrough.sources.every((id) => existsSync(new URL(`../sources/${id}/source.json`, import.meta.url))),
  'every named source is a document in this catalogue, not an id nobody publishes',
)
assert.ok(
  manifest.capabilities.every((row) => row.kind === 'source:passthrough' || row.sources === undefined),
  'no other capability carries a sources list',
)
assert.ok(
  manifest.capabilities.every(
    (row) => row.kind === 'connection:passthrough' || row.connectors === undefined,
  ),
  'no other capability carries a connectors list',
)

/**
 * Legacy parity, against numbers measured from the Python core rather than asserted.
 *
 * `tools/legacy-parity.mjs --freeze <legacy-root>` writes them; this runs the
 * comparison with no Python and no private checkout, which is the only form the
 * catalogue can keep.
 */
const parity = await loadParity()
const parityFailures = comparePort(parity)
for (const failure of parityFailures) console.error(`  FAIL ${failure}`)
assert.equal(parityFailures.length, 0, 'the port still matches the frozen legacy numeric core')
assert.ok(parity.cases.every((row) => row.legacyMeasured !== undefined), 'every parity case carries a measured legacy output')

/**
 * ── Cases the registry claimed and nothing checked (issue #70 §4) ──────────
 *
 * `assertCoverageWasEarned()` was added before these existed and named them
 * one at a time: `calibration-maturity`, `opportunity-five-axis`, `trend`,
 * `fx-missing`, `forward-outcome`, `mfe-mae`, `config-schema-lint`,
 * `no-auto-relax` and `no-auto-method-change` were all registered under a
 * group while being touched by no assertion at all. That is the failure the
 * issue reported about `blendedSectorStrength`, and it was nine wide.
 */
covers('calibration/calibration-maturity')
const maturitySamples = (count) => Array.from({ length: count }, (_, index) => ({
  date: new Date(Date.parse('2026-01-01') + index * 30 * 86_400_000).toISOString().slice(0, 10),
  activeReturn: index % 2 ? 0.03 : -0.01,
}))
assert.equal(execute({ operation: 'calibration', asOf: methodology.asOf, input: { samples: maturitySamples(3) } }).data.status, 'insufficient')
assert.equal(execute({ operation: 'calibration', asOf: methodology.asOf, input: { samples: maturitySamples(6) } }).data.status, 'observing')
const reviewable = execute({ operation: 'calibration', asOf: methodology.asOf, input: { samples: maturitySamples(12) } })
assert.equal(reviewable.data.status, 'reviewable')
assert.ok(
  ['insufficient', 'observing', 'reviewable'].includes(reviewable.data.status),
  'maturity tops out at reviewable — the calculation cannot hand itself a promotion',
)
assert.ok(
  execute({ operation: 'calibration', asOf: methodology.asOf, input: { samples: [...maturitySamples(12), { date: '2026-06-01' }] } })
    .diagnostics.some((row) => row.code === 'calibration_incomplete_samples'),
  'an incomplete row does not pad the sample count toward a threshold',
)

covers('learning/no-auto-method-change')
/**
 * The maturity ladder stops one rung below `promoted`, in the code and not
 * only in prose: no sample count reaches it, because promotion is a reviewed
 * package/config change and this core cannot make one.
 */
for (const count of [12, 40, 200]) {
  assert.notEqual(
    execute({ operation: 'calibration', asOf: methodology.asOf, input: { samples: maturitySamples(count) } }).data.status,
    'promoted',
    'no sample count promotes a lens; promotion needs an approved package/config revision',
  )
}
assert.equal(promotionOutput.data.versions[0].gate.promoted, undefined, 'the promotion gate reports readiness, never a promotion')
assert.ok('reviewReady' in promotionOutput.data.versions[0].gate, 'what it reports is that a human review may now happen')

covers('scanner/opportunity-five-axis')
const oversoldBars = Array.from({ length: 220 }, (_, index) => {
  const close = index < 160 ? 200 : 200 - (index - 159) * 1.4
  return { timestamp: new Date(Date.parse('2026-01-01') + index * 86_400_000).toISOString(), open: close, high: close + 1, low: close - 1, close, volume: index > 210 ? 900_000 : 100_000 }
})
const fiveAxis = execute({ operation: 'opportunityMetrics', asOf: methodology.asOf, input: { symbol: 'DEEP', market: 'us', sector: 'semis', bars: oversoldBars } })
assert.ok(fiveAxis.data.technicalSignals.includes('rsi-below-30'))
assert.ok(fiveAxis.data.volumeSignals.includes('volume-at-least-2x'))
/**
 * Two of the five axes score mechanically and three do not, which is the
 * ported rule rather than an omission: earnings, valuation and sentiment are
 * verified by hand, and the original refuses to hand them automatic points.
 * The scores cap at 30 and 25, so the remaining 45 are never granted here.
 */
assert.ok(fiveAxis.data.technicalScore <= 30 && fiveAxis.data.volumeScore <= 25)
for (const forbidden of ['earningsScore', 'valuationScore', 'sentimentScore']) {
  assert.equal(fiveAxis.data[forbidden], undefined, `${forbidden} is verified by hand; the scanner grants it no automatic points`)
}
assert.equal(
  execute({ operation: 'opportunityMetrics', asOf: methodology.asOf, input: { symbol: 'SHORT', market: 'us', bars: oversoldBars.slice(0, 10) } }).status,
  'unevaluated',
  'too little history is unevaluated, never a zero score',
)

covers('scanner/trend')
const trendBars = (values) => values.map((close, index) => ({ timestamp: new Date(Date.parse('2026-01-01') + index * 86_400_000).toISOString(), open: close, high: close, low: close, close, volume: 1000 }))
const uptrendSeries = trendBars(Array.from({ length: 220 }, (_, index) => 100 + index * 0.5))
const brokenSeries = trendBars(Array.from({ length: 220 }, (_, index) => 200 - index * 0.5))
const extendedUptrend = execute({ operation: 'trendState', asOf: methodology.asOf, input: { symbol: 'UP', bars: uptrendSeries } })
assert.equal(extendedUptrend.data.state, 'UPTREND')
assert.equal(extendedUptrend.data.extended, true, 'a name 31% over its MA200 is extended')
assert.equal(extendedUptrend.data.trancheGuidance, 'small_or_wait', 'extension caps the tranche even while the trend is intact')
assert.equal(
  extendedUptrend.data.meaning,
  'drawdown-control-not-return-edge',
  'the gate says what it is for — the multiplier controls drawdown and is not a return edge',
)
const brokenTrend = execute({ operation: 'trendState', asOf: methodology.asOf, input: { symbol: 'DOWN', bars: brokenSeries } })
assert.equal(brokenTrend.data.state, 'BROKEN')
assert.equal(brokenTrend.data.trancheGuidance, 'stop', 'a broken trend stops the tranche rather than sizing it smaller')
assert.equal(
  execute({ operation: 'trendState', asOf: methodology.asOf, input: { symbol: 'SHORT', bars: uptrendSeries.slice(0, 50) } }).data.state,
  'insufficient_data',
  'without 200 bars the gate says so instead of guessing a state',
)

covers('portfolio/fx-missing')
const missingFx = execute({ operation: 'sleeveNav', asOf: methodology.asOf, input: { cash: [{ currency: 'KRW', amount: 1_000_000 }, { currency: 'USD', amount: 100 }], positions: [] } })
assert.equal(missingFx.data.globalNavKrw, null, 'without FX the two sleeves have no common denominator and none is invented')
assert.equal(missingFx.status, 'unevaluated')
assert.ok(missingFx.diagnostics.some((row) => row.code.includes('fx')), 'the missing rate is named rather than defaulted to 1')

covers('exit/forward-outcome', 'exit/mfe-mae')
const forwardBars = trendBars(Array.from({ length: 70 }, (_, index) => (index < 10 ? 100 : 100 + (index - 10) * 0.5)))
const forwardBenchmark = trendBars(Array.from({ length: 70 }, () => 100))
const forward = execute({
  operation: 'forwardOutcome',
  asOf: methodology.asOf,
  input: { bars: forwardBars, benchmarkBars: forwardBenchmark, signalAt: forwardBars[10].timestamp, horizons: [5, 20, 60] },
})
assert.deepEqual(Object.keys(forward.data.forward), ['d5', 'd20', 'd60'], 'the three declared horizons are all reported')
assert.ok(forward.data.forward.d20.returnPct > 0)
assert.ok(forward.data.forward.d20.benchmarkExcessPct > 0, 'excess is measured against the benchmark, not assumed')
assert.equal(forward.data.forward.d20.sectorExcessPct, null, 'no sector series means no sector excess, never a zero')
assert.ok(forward.data.excursion.mfePct >= 0 && forward.data.excursion.maePct <= 0, 'MFE and MAE bracket the path')
assert.ok(
  execute({ operation: 'forwardOutcome', asOf: methodology.asOf, input: { bars: forwardBars.slice(0, 40), signalAt: forwardBars[10].timestamp } })
    .diagnostics.some((row) => row.code === 'forward_window_immature'),
  'an unmatured window is named immature rather than scored short',
)
assert.equal(
  execute({ operation: 'forwardOutcome', asOf: methodology.asOf, input: { bars: forwardBars, signalAt: forwardBars[0].timestamp } }).status,
  'unevaluated',
  'a signal with no bar before it has no base to measure from',
)

covers('policy/config-schema-lint', 'policy/no-auto-relax')
/**
 * Configuration may make this manager stricter and cannot waive a gate. That
 * is a claim about the schema, so it is checked against the schema: every
 * threshold is bounded on both sides, and nothing unknown may be added.
 */
assert.equal(configSchema.additionalProperties, false, 'an unknown config key is refused, not absorbed')
const boundedNumbers = (node, path = 'config') => {
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    const here = `${path}.${name}`
    if (['number', 'integer'].includes(property.type)) {
      assert.ok(Number.isFinite(property.minimum), `${here} has a floor a config cannot go under`)
      assert.ok(Number.isFinite(property.maximum), `${here} has a ceiling a config cannot go over`)
      assert.ok(property.minimum < property.maximum, `${here} has a usable range`)
      assert.ok(property.default >= property.minimum && property.default <= property.maximum, `${here} defaults inside its own bounds`)
    }
    if (property.type === 'object') {
      assert.equal(property.additionalProperties, false, `${here} refuses unknown keys too`)
      boundedNumbers(property, here)
    }
  }
}
boundedNumbers(configSchema)
for (const gate of ['minimumExpectedActiveReturn']) {
  assert.ok(configSchema.properties[gate].minimum > 0, `${gate} cannot be configured down to nothing`)
}
/**
 * ── A parent default is not an empty object (issue #133) ───────────────────
 *
 * Every object here declared `"default": {}` beside children that declared
 * real numbers, and that is a schema contradicting itself: Aumos's resolver
 * takes a declared `default` **verbatim and does not descend**, so the group's
 * own `{}` won and every number underneath it was dropped. The run then got no
 * concentration caps at all — `unevaluated`, which is not a pass — and a
 * schedule computed from the package's fallbacks rather than the numbers the
 * settings dialog showed (untilled/aumos#652, measured on
 * `run_f1560197652549e18bf7c1420f83983b`).
 *
 * ⛔ The fix is not to write the parent out in full. Two copies of one number
 * is the drift this package refuses everywhere else; the group declares no
 * default and the resolver composes one from the leaves.
 */
const parentDefaults = (node, path = 'config') => {
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    if (property.type !== 'object') continue
    assert.ok(!('default' in property), `${path}.${name} declares no default of its own — a parent default is taken verbatim and its children's are never read`)
    parentDefaults(property, `${path}.${name}`)
  }
}
parentDefaults(configSchema)
/**
 * ── One axis, one place (issue #133) ───────────────────────────────────────
 *
 * `concentration.position` (0.10) stood beside `mandate.constraints`'
 * `maxPositionWeight` (0.20) and said the same thing in a different number,
 * and the Mandate's is the one the Kernel refuses a proposal over. Portfolio
 * heat is the same shape: it is the planned maximum drawdown, and the investor
 * already declares that in the Mandate.
 */
for (const gone of ['position', 'portfolioHeat']) {
  assert.equal(configSchema.properties.concentration.properties[gone], undefined, `${gone} is the Mandate's axis; a second copy under another name only tells a run two numbers for one limit`)
}
for (const gone of ['reserveLiquiditySymbols', 'reviewReadyClosedOutcomes', 'grandfather', 'minimumLensSamples', 'minimumIndependentDateClusters', 'watchNear', 'watchExpiryDays', 'experimentalPositionCeiling', 'experimentalPositionCeilingMax']) {
  assert.equal(configSchema.properties[gone], undefined, `${gone} is a claim this methodology makes, not a preference an investor can answer — it is a constant in lib/constants.mjs`)
}
assert.ok(configSchema.properties.experimentalPositionFloor, 'the floor stays configured: what makes an order unexecutable is a fact about a venue, and venues differ')
assert.ok(
  /stricter/i.test(configSchema.description) && /cannot waive/i.test(configSchema.description),
  'the schema states the rule its bounds enforce',
)

/**
 * ── Every operation has a published name (issue #70 §18) ───────────────────
 *
 * 44 of the 64 appeared in no skill and no prompt. The only way to learn one
 * was to call a wrong name and read the `operation_unknown` diagnostic, while
 * all three flow skills instruct the run not to go looking. So the table in
 * `deterministic-metrics` is checked in both directions: an operation missing
 * from it is unreachable, and a name in it that no longer exists is a call
 * that will fail at runtime.
 */
const supportedOperations = execute({ operation: null, asOf: methodology.asOf }).diagnostics[0].details.supported
const metricsSkill = await readFile(new URL('../skills/deterministic-metrics/SKILL.md', fixtureRoot), 'utf8')
/**
 * ⚠️ Read from the operations section only. Searching the file matched the
 * "inputs that are not guessable" table too, which repeats ten names in the
 * same row shape — 74 rows for 64 operations, with no set difference to show
 * for it. Scope the read; the same mistake, a third time.
 */
const operationsSection = metricsSkill.slice(metricsSkill.indexOf('## The operations'), metricsSkill.indexOf('## Inputs that are not guessable'))
const tabledOperations = [...operationsSection.matchAll(/^\| `([a-zA-Z]+)` \| /gm)].map((match) => match[1])
assert.equal(supportedOperations.length, 85)
assert.deepEqual(
  [...tabledOperations].sort(),
  [...supportedOperations].sort(),
  'the operation table and the registered operations agree in both directions',
)
assert.equal(new Set(tabledOperations).size, tabledOperations.length, 'no operation is listed twice')

/**
 * ── Which groups have a frozen fixture, and which do not (issue #70 §4) ────
 *
 * `MIGRATION.md`'s last column names a coverage **group**, and seven of the
 * nineteen have a file of frozen numbers behind them in `legacy-golden/`. The
 * matrix read as though each name were a file, so twelve looked missing. They
 * are not missing; they are verified by cases built in this file, which is
 * why every one of them is registered in `group-coverage.json` and now has to
 * be earned. The distinction is stated here so neither reading is available:
 * a frozen file is a number measured from the Python core, an in-file case is
 * a contract this port has to keep.
 */
const frozenGroups = ['scanner', 'promotion', 'outcome', 'backtest', 'attribution', 'calibration', 'sizing']
for (const group of frozenGroups) {
  assert.ok(groupCoverage.groups[group], `${group} is a registered group`)
}
const fixtureFiles = ['core', 'scanner', 'promotion', 'outcomes', 'backtest', 'methodology', 'parity']
for (const file of fixtureFiles) {
  assert.ok(existsSync(new URL(`legacy-golden/${file}.json`, fixtureRoot)), `legacy-golden/${file}.json is the frozen source for its group`)
}
assert.equal(
  Object.keys(groupCoverage.groups).length - frozenGroups.length,
  12,
  'twelve groups are verified by in-file contract cases rather than by a frozen numeric file, and every one of them is registered and earned above',
)

/**
 * ── The learning loop (issue #70 §6, §10) ──────────────────────────────────
 *
 * `MIGRATION.md` mapped `signal-paper` and `paper-log` to the `learning`
 * group and `shadow-track` and `baseline-track` to `attribution`, and neither
 * group's case list mentioned a paper registration, a shadow comparison or a
 * passive baseline. The ninth instance of the same substitution.
 */
covers('learning/paper-admission')
const callThesis = { evidenceStatus: 'complete' }
const admit = (input) => execute({ operation: 'paperAdmission', asOf: '2026-08-20T00:00:00Z', input })
const promoted = admit({ setup: 'thesis_call', challengeVerdict: 'cleared', thesis: callThesis, priceHistoryLatestDate: '2026-08-19' })
assert.equal(promoted.data.disposition, 'promote')
assert.equal(promoted.data.cohort, 'llm-research')
assert.equal(promoted.data.tradeable, false, 'a paper row is never tradeable, whatever it is admitted as')
assert.equal(admit({ setup: 'thesis_watch', challengeVerdict: 'conditional_watch' }).data.disposition, 'watch', 'the control group stays cheap to log')
assert.equal(admit({ setup: 'thesis_rejected', challengeVerdict: 'high_risk_unresolved' }).data.disposition, 'rejected')
assert.ok(
  admit({ setup: 'thesis_call', challengeVerdict: 'conditional_watch', thesis: callThesis, priceHistoryLatestDate: '2026-08-19' })
    .diagnostics.some((row) => row.code === 'paper_setup_mismatch'),
  'a conditional verdict cannot be logged as a call — that is the one substitution the contract refuses',
)
assert.ok(
  admit({ setup: 'thesis_call', challengeVerdict: 'cleared', thesis: { evidenceStatus: 'incomplete' }, priceHistoryLatestDate: '2026-08-19' })
    .diagnostics.some((row) => row.code === 'call_thesis_incomplete'),
  'only the cohort that can unlock sizing pays the full evidence cost',
)
assert.ok(
  admit({ setup: 'thesis_call', challengeVerdict: 'cleared', thesis: callThesis, priceHistoryLatestDate: '2026-08-10' })
    .diagnostics.some((row) => row.code === 'data_pipeline_stale'),
  'a forward record started from stale prices would measure the pipeline, not the idea',
)
assert.equal(admit({ setup: 'vibes', challengeVerdict: 'cleared' }).status, 'blocked')

covers('learning/paper-track-persists')
/**
 * The track has a home, and it is bounded. Before this, `signalPaper` scored
 * whatever a run handed it and nothing said where a registered row lived
 * between runs — so the sample never accumulated and the promotion gate stayed
 * shut for a second reason.
 */
const memorySkill = await readFile(new URL('../skills/memory-contract/SKILL.md', fixtureRoot), 'utf8')
assert.ok(memorySkill.includes('`learning/paper-cohorts`'), 'the key is a published stable key, not one a run invents')
assert.ok(prompt.includes('learning/paper-cohorts'), 'and the run skeleton reads and writes it')
const priorState = {
  closed: { 'cohort:llm-research': { d60: { samples: 5, sumExcess: 10, sumReturn: 8, wins: 4, absoluteWins: 4, absoluteSamples: 5 } } },
  openWindows: [{ symbol: 'STILL-OPEN', setup: 'thesis_call', ruleVersion: 'tc-v1' }, { symbol: 'MATURING', setup: 'thesis_call', ruleVersion: 'tc-v1' }],
}
const paperBarsFor = (rate, count = 70) => Array.from({ length: count }, (_, index) => {
  const close = 100 * (1 + rate) ** index
  return { timestamp: new Date(Date.parse('2026-01-01') + index * 86_400_000).toISOString(), open: close, high: close, low: close, close, volume: 1000 }
})
const carried = execute({
  operation: 'signalPaper',
  asOf: '2026-08-20T00:00:00Z',
  input: { state: priorState, rows: [{ symbol: 'MATURING', setup: 'thesis_call', ruleVersion: 'tc-v1', signalAt: paperBarsFor(0)[10].timestamp, bars: paperBarsFor(0.004), benchmarkBars: paperBarsFor(0) }] },
})
assert.equal(carried.data.byCohort['llm-research'].d60.samples, 6, 'the aggregate is what closed before plus what this run could read')
assert.deepEqual(carried.data.maturedThisRun, ['MATURING'])
assert.deepEqual(carried.data.nextState.openWindows.map((row) => row.symbol), ['STILL-OPEN'], 'a matured window folds into the sums and stops being carried, which is what bounds the key')
assert.equal(carried.data.nextState.closed['cohort:llm-research'].d60.samples, 6)
/**
 * The key is an index of what is being measured, not a copy of it. If a field
 * would let you reconstruct the book from this key, it does not belong here.
 */
const windowFields = new Set(Object.keys(execute({
  operation: 'paperAdmission',
  asOf: '2026-08-20T00:00:00Z',
  input: { setup: 'thesis_call', challengeVerdict: 'cleared', thesis: { evidenceStatus: 'complete', asset: 'AAA', ruleVersion: 'tc-v1' }, priceHistoryLatestDate: '2026-08-19' },
}).data.openWindow))
assert.deepEqual([...windowFields].sort(), ['benchmark', 'cohort', 'ruleVersion', 'setup', 'signalAt', 'symbol'])
for (const forbidden of ['price', 'close', 'quantity', 'weight', 'cash', 'reasoning']) {
  assert.equal(windowFields.has(forbidden), false, `an open window carries no ${forbidden}; the observations stay in Evidence`)
}
assert.ok(
  execute({ operation: 'paperAdmission', asOf: '2026-08-20T00:00:00Z', input: { setup: 'thesis_call', challengeVerdict: 'cleared', thesis: { evidenceStatus: 'complete', asset: 'AAA' }, priceHistoryLatestDate: '2026-08-19' } })
    .diagnostics.some((row) => row.code === 'paper_rule_version_missing'),
  'a registered window carries the version it will be scored under, or it cannot be pooled or excluded later',
)
assert.ok(/instance/i.test(memorySkill.slice(memorySkill.indexOf('What it costs'))), 'the cost of this home — instance-scoped, invisible to another manager — is stated where the key is')

covers('learning/paper-registration-is-mechanical')
/**
 * ── Registration was a sentence, and sentences do not append (issue #118) ───
 *
 * `paperAdmission` returned an `openWindow`; `theme-radar/SKILL.md` said to
 * append it. `nextState.openWindows` was computed as *prior minus matured*, so
 * nothing carried an admitted window across the two calls and the track held
 * zero rows on every run measured. The merge is inside `signalPaper` now, and
 * these assertions are what stops it going back to prose.
 */
const registerAsOf = '2026-08-20T00:00:00Z'
const admittedWindow = execute({
  operation: 'paperAdmission',
  asOf: registerAsOf,
  input: { setup: 'thesis_call', challengeVerdict: 'cleared', thesis: { evidenceStatus: 'complete', asset: 'NEW', ruleVersion: 'tc-v1', benchmark: 'KOSPI200' }, priceHistoryLatestDate: '2026-08-19' },
}).data.openWindow
const registered = execute({ operation: 'signalPaper', asOf: registerAsOf, input: { rows: [], state: {}, admissions: [admittedWindow] } })
assert.deepEqual(registered.data.nextState.openWindows.map((row) => row.symbol), ['NEW'], 'what admission produced is in the state this run writes back, without a run assembling it')
assert.deepEqual(registered.data.registeredThisRun.map((row) => row.symbol), ['NEW'])
assert.equal(registered.data.nextState.closed['cohort:llm-research'], undefined, 'a window has no bars at the instant it opens; folding one into the sums would manufacture a sample')
assert.deepEqual(registered.data.unscoredWindows, [], 'a window registered in this run is not one nobody looked at')
const reRegistered = execute({ operation: 'signalPaper', asOf: registerAsOf, input: { rows: [], state: registered.data.nextState, admissions: [admittedWindow] } })
assert.equal(reRegistered.data.nextState.openWindows.length, 1, 'the same symbol and setup does not open twice; one idea counted twice is a manufactured sample')
assert.ok(reRegistered.diagnostics.some((row) => row.code === 'paper_window_already_open'))
assert.equal(
  execute({ operation: 'signalPaper', asOf: registerAsOf, input: { rows: [], state: {}, admissions: [{ symbol: 'X', setup: 'thesis_call', signalAt: '2026-12-01T00:00:00Z', ruleVersion: 'tc-v1' }] } }).status,
  'blocked',
  'a window registered after asOf would be measured from a moment this run cannot see',
)
assert.ok(
  execute({ operation: 'signalPaper', asOf: registerAsOf, input: { rows: [], state: {}, admissions: [{ symbol: 'X', setup: 'thesis_call', signalAt: registerAsOf }] } })
    .diagnostics.some((row) => row.code === 'paper_rule_version_missing'),
  'the merge applies the same version rule the scorer does; a run cannot slip a row in around it',
)
const baselineRegistered = execute({
  operation: 'signalPaper',
  asOf: registerAsOf,
  input: { rows: [], state: {}, admissions: [admittedWindow, { symbol: 'BOT', setup: 'rs_breakout', ruleVersion: 'rs-v1', signalAt: registerAsOf }] },
})
assert.deepEqual(
  baselineRegistered.data.nextState.openWindows.map((row) => row.cohort),
  ['llm-research', 'mechanical-baseline'],
  'both arms register through one call and each row keeps the cohort its setup assigns; the merge never pools them',
)
assert.ok(prompt.includes('admissions'), 'and the run skeleton hands the admissions in rather than describing an append')

covers('learning/empty-paper-track-is-observable')
/**
 * Two entirely different failures had one clean output. `signalPaper` with no
 * rows and no state returned `ok` and no diagnostic — and so did a run holding
 * five live windows that fetched a bar for none of them. The second is the one
 * that was happening, and nothing in the run could have said so.
 */
const emptyTrack = execute({ operation: 'signalPaper', asOf: registerAsOf, input: { rows: [], state: {} } })
assert.equal(emptyTrack.data.trackStatus, 'empty')
assert.ok(emptyTrack.diagnostics.some((row) => row.code === 'paper_track_empty'), 'an empty track is the only path to the promotion gate holding nothing, and it says so')
assert.equal(emptyTrack.status, 'unevaluated', 'a cold start is reported, never blocked — the run still has a proposal to make')
const skipped = execute({ operation: 'signalPaper', asOf: registerAsOf, input: { rows: [], state: registered.data.nextState } })
assert.equal(skipped.data.trackStatus, 'accruing')
assert.deepEqual(skipped.data.unscoredWindows, ['NEW'])
assert.ok(skipped.diagnostics.some((row) => row.code === 'paper_windows_unscored'), 'a carried window nobody fetched bars for is a skipped loop, not an unchanged track')
assert.ok(prompt.includes('paper_windows_unscored') && prompt.includes('paper_track_empty'), 'and the run skeleton says to report them in uncertainty')
assert.ok(
  /trackStatus/.test(await readFile(new URL('../skills/evidence-gates/SKILL.md', fixtureRoot), 'utf8')),
  'the gate that the track exists to make reachable says how to read an empty column',
)

covers('learning/signal-paper-cohorts')
const paperBars = (rate, count = 70) => Array.from({ length: count }, (_, index) => {
  const close = 100 * (1 + rate) ** index
  return { timestamp: new Date(Date.parse('2026-01-01') + index * 86_400_000).toISOString(), open: close, high: close, low: close, close, volume: 1000 }
})
const flatBenchmark = paperBars(0)
const paperRun = execute({
  operation: 'signalPaper',
  asOf: '2026-08-20T00:00:00Z',
  input: {
    rows: [
      { symbol: 'CALL1', setup: 'thesis_call', ruleVersion: 'tc-v1', signalAt: paperBars(0)[10].timestamp, bars: paperBars(0.004), benchmarkBars: flatBenchmark },
      { symbol: 'CALL2', setup: 'thesis_call', ruleVersion: 'tc-v1', signalAt: paperBars(0)[10].timestamp, bars: paperBars(0.002), benchmarkBars: flatBenchmark },
      { symbol: 'BOT1', setup: 'rs_breakout', ruleVersion: 'rs-v1', signalAt: paperBars(0)[10].timestamp, bars: paperBars(-0.001), benchmarkBars: flatBenchmark },
    ],
  },
})
assert.deepEqual(Object.keys(paperRun.data.byCohort).sort(), ['llm-research', 'mechanical-baseline'], 'the team and the bot are counted apart')
assert.equal(paperRun.data.byCohort['llm-research'].d60.samples, 2)
assert.equal(paperRun.data.byCohort['llm-research'].d60.winRatePct, 100)
assert.ok(paperRun.data.byCohort['mechanical-baseline'].d60.avgExcessPct < 0, 'the baseline is scored on the same terms, not assumed to lose')
assert.equal(paperRun.data.cohortsAreSeparate, true)
assert.equal(paperRun.data.sampleKind, 'paper-only-never-mixed-with-closed-decisions', 'the output says which kind of sample it is holding')
assert.ok(paperRun.data.rows.every((row) => row.tradeable === false))
assert.ok(
  paperRun.diagnostics.some((row) => row.code === 'paper_rule_versions_mixed'),
  'rows judged under different rule versions are reported together and flagged, never silently pooled',
)
assert.equal(
  execute({ operation: 'signalPaper', asOf: '2026-08-20T00:00:00Z', input: { rows: [{ symbol: 'X', setup: 'thesis_call', signalAt: paperBars(0)[10].timestamp, bars: paperBars(0.004) }] } }).status,
  'blocked',
  'a row without its rule version cannot be scored; re-tagging is how a sample gets manufactured',
)
/**
 * The relative-only trap: beat the benchmark by falling less.
 */
const relativeOnly = execute({
  operation: 'signalPaper',
  asOf: '2026-08-20T00:00:00Z',
  input: { rows: [{ symbol: 'DOWN', setup: 'thesis_call', ruleVersion: 'tc-v1', signalAt: paperBars(0)[10].timestamp, bars: paperBars(-0.001), benchmarkBars: paperBars(-0.004) }] },
})
assert.equal(relativeOnly.data.byCohort['llm-research'].d60.relativeOnly, true, 'positive excess with a negative absolute return is marked, not counted as a win')

covers('attribution/shadow-sizing-bottleneck')
const bottleneck = execute({ operation: 'shadowTrack', asOf: '2026-08-20T00:00:00Z', input: { shadowReturnPct: 12, realReturnPct: 8, windowDays: 90 } })
assert.equal(bottleneck.data.excessPp, 4)
assert.equal(bottleneck.data.sizingBottleneck, true, 'same decisions, larger size, materially ahead over a full window')
const immature = execute({ operation: 'shadowTrack', asOf: '2026-08-20T00:00:00Z', input: { shadowReturnPct: 12, realReturnPct: 8, windowDays: 20 } })
assert.equal(immature.data.sizingBottleneck, false, 'a good fortnight is not an argument for size')
assert.ok(immature.diagnostics.some((row) => row.code === 'shadow_window_immature'))
assert.equal(
  execute({ operation: 'shadowTrack', asOf: '2026-08-20T00:00:00Z', input: { shadowReturnPct: 12, realReturnPct: 8, windowDays: 90, thresholds: { minExcessVsRealPp: 1 } } }).data.thresholds.minExcessVsRealPp,
  3,
  'a pre-registered threshold cannot be loosened at call time',
)

covers('attribution/passive-baseline')
const passive = execute({ operation: 'baselineTrack', asOf: '2026-08-20T00:00:00Z', input: { portfolioReturnPct: 6, baselines: [{ key: 'kospi200', returnPct: 4 }, { key: 'sp500', returnPct: 9 }] } })
assert.deepEqual(passive.data.comparisons.map((row) => row.ahead), [true, false])
assert.equal(passive.data.beatsEveryBaseline, false)
assert.ok(passive.diagnostics.some((row) => row.code === 'baseline_not_beaten'), 'a baseline ahead of the book is something the methodology has to answer for')
assert.ok(
  execute({ operation: 'baselineTrack', asOf: '2026-08-20T00:00:00Z', input: { portfolioReturnPct: 6, baselines: [{ key: 'unknown' }] } })
    .diagnostics.some((row) => row.code === 'baseline_return_unevaluated'),
  'a baseline with no return is unread, never assumed to be behind',
)

covers('promotion/prereg-verdict', 'promotion/threshold-reached-proposal')
const verdict = (paper, extra = {}) => execute({ operation: 'verdictReport', asOf: '2026-08-20T00:00:00Z', input: { paper, ...extra } })
assert.equal(verdict({ d60: { samples: 8, winRatePct: 80, avgExcessPct: 6 } }).data.verdict, 'insufficient_sample', 'a small sample is not a GO however good it looks')
assert.equal(verdict({ d60: { samples: 24, winRatePct: 60, avgExcessPct: 3 } }).data.verdict, 'GO')
assert.equal(verdict({ d60: { samples: 24, winRatePct: 44, avgExcessPct: -1 } }).data.verdict, 'NO_GO')
const borderline = verdict({ d60: { samples: 24, winRatePct: 52, avgExcessPct: 1 } })
assert.equal(borderline.data.verdict, 'borderline', 'some criteria met is not a GO, and the rest are not relaxed to reach one')
assert.deepEqual(borderline.data.proposals, [])
assert.ok(
  verdict({ d60: { samples: 24, winRatePct: 60, avgExcessPct: 3 } }, { thresholds: { go: { minWinRatePct: 50 } } })
    .diagnostics.some((row) => row.code === 'prereg_relaxed'),
  'a criterion loosened after the data exists is refused; that is what pre-registration is for',
)
assert.equal(
  verdict({ d60: { samples: 24, winRatePct: 60, avgExcessPct: 3 } }, { thresholds: { go: { minWinRatePct: 70 } } }).data.verdict,
  'borderline',
  'a stricter threshold is honoured — the only direction that moves',
)
/**
 * §10 — the run proposes the increase without being asked. Before this,
 * failure produced rule proposals and success produced nothing.
 */
const goRun = verdict({ d60: { samples: 24, winRatePct: 60, avgExcessPct: 3 } }, { shadow: bottleneck.data, closedOutcomeCount: 12, baseline: passive.data })
assert.deepEqual(
  [...new Set(goRun.data.proposals.map((row) => row.kind))].sort(),
  ['answer-the-baseline', 'cap-increase-review', 'cap-review-session'],
  'evidence that reached a threshold surfaces its proposal unasked',
)
assert.ok(goRun.data.proposals.every((row) => row.requiresApproval === true), 'every proposal still requires the investor')
assert.equal(goRun.data.changesNothingAutomatically, true)
assert.ok(goRun.diagnostics.some((row) => row.code === 'threshold_reached_proposal' && row.severity === 'info'))
assert.deepEqual(
  verdict({ d60: { samples: 24, winRatePct: 44, avgExcessPct: -1 } }).data.proposals.map((row) => row.kind),
  ['freeze-new-experiments'],
  'a NO-GO is a correct outcome with its own proposal, not a silence',
)
assert.ok(
  verdict({ d60: { samples: 24, winRatePct: 60, avgExcessPct: 3, avgReturnPct: -2, relativeOnly: true } })
    .diagnostics.some((row) => row.code === 'go_is_relative_only'),
  'a GO earned by falling less than the benchmark carries that caveat',
)

covers('audit/paper-sample-status-stated')
const gatesSkill = await readFile(new URL('../skills/evidence-gates/SKILL.md', fixtureRoot), 'utf8')
assert.ok(gatesSkill.includes('cohortsAreSeparate'), 'the skill names the field that states the separation')
assert.ok(/paper/i.test(gatesSkill) && /closed Decision/.test(gatesSkill), 'the skill says what a paper sample is and is not')
assert.ok(/without being asked/.test(gatesSkill), 'the skill carries the directive that a met threshold is proposed unasked')

/**
 * ── The second discovery branch (issue #70 §8) ─────────────────────────────
 *
 * `upsideRadar` computed five axes and named no lens, so the fundamental and
 * event branch had no way into the lens-naming step. The three lanes are
 * pre-registered (`ur-v1`, 2026-07-18) and each carries its own rule version,
 * and every lane is evaluated for every candidate so an exclusion is explained
 * as mechanically as an inclusion.
 */
covers('scanner/radar-lanes', 'scanner/radar-lane-starvation')
const radarAsOf = '2026-08-20T00:00:00Z'
const radarCandidate = (overrides) => ({
  asset: 'R1',
  market: 'us',
  filings: [
    { periodEnd: '2026-03-31', availableAt: '2026-04-15T00:00:00Z', operatingIncomeYoy: -5, marginDeltaYoy: -1 },
    { periodEnd: '2026-06-30', availableAt: '2026-07-20T00:00:00Z', operatingIncomeYoy: 12, marginDeltaYoy: 2 },
  ],
  price: { status: 'confirmed', close: 120, ma50: 130, ma200: 100, offHigh200: -0.12, rs20VsBenchmarkPct: 4 },
  catalysts: [{ windowStart: '2026-08-25', windowEnd: '2026-09-15' }],
  valuation: { shares: 10, equity: 1000, debt: 200 },
  ...overrides,
})
const radar = execute({ operation: 'upsideRadar', asOf: radarAsOf, input: { candidates: [radarCandidate({})] } })
const laneRow = radar.data.ranked[0]
assert.deepEqual(Object.keys(laneRow.lanes).sort(), ['inflection', 'post-event-continuation', 'quality-pullback'], 'all three pre-registered lanes are evaluated')
assert.deepEqual(
  Object.values(laneRow.lanes).map((verdict) => verdict.ruleVersion),
  ['uri-v1', 'urq-v1', 'urp-v1'],
  'each lane carries its own rule version so one revision does not invalidate another lane sample',
)
assert.deepEqual(laneRow.lensesEntered.sort(), ['inflection', 'quality-pullback'])
assert.equal(laneRow.lanes['post-event-continuation'].included, false)
assert.equal(laneRow.lanes['post-event-continuation'].reason, 'no-event-in-the-last-30-days', 'an exclusion is explained, not merely absent')
assert.equal(radar.data.branch, 'fundamental-and-event')

const withEvent = execute({
  operation: 'upsideRadar',
  asOf: radarAsOf,
  input: { candidates: [radarCandidate({ events: [{ announcedAt: '2026-08-05T00:00:00Z', sue: 1.4, preAnnouncementClose: 110 }] })] },
})
assert.equal(withEvent.data.ranked[0].lanes['post-event-continuation'].included, true, 'a positive surprise whose price held enters the lane')
const surpriseFaded = execute({
  operation: 'upsideRadar',
  asOf: radarAsOf,
  input: { candidates: [radarCandidate({ events: [{ announcedAt: '2026-08-05T00:00:00Z', sue: 1.4, preAnnouncementClose: 130 }] })] },
})
assert.equal(surpriseFaded.data.ranked[0].lanes['post-event-continuation'].reason, 'price-has-not-held-the-pre-announcement-level')
const brokenDown = execute({
  operation: 'upsideRadar',
  asOf: radarAsOf,
  input: { candidates: [radarCandidate({ price: { status: 'confirmed', close: 120, ma50: 130, ma200: 100, offHigh200: -0.4 } })] },
})
assert.equal(brokenDown.data.ranked[0].lanes['quality-pullback'].reason, 'drawdown-past-25-percent-is-a-breakdown-not-a-pullback', 'a collapse is not a pullback')

/**
 * Starvation is a finding: a lane that excluded almost everything for one
 * missing input was never fed, and reporting only its hits would hide that.
 */
const starved = execute({
  operation: 'upsideRadar',
  asOf: radarAsOf,
  input: { candidates: Array.from({ length: 5 }, (_, index) => radarCandidate({ asset: `S${index}` })) },
})
assert.equal(starved.data.lanes['post-event-continuation'].starved, true)
assert.equal(starved.data.lanes['post-event-continuation'].reasons['no-event-in-the-last-30-days'], 5)
assert.ok(starved.diagnostics.some((row) => row.code === 'radar_lane_starved'), 'an unfed lane says so rather than reading as no opportunity')
assert.equal(starved.data.lanes.inflection.starved, false, 'a lane that is being fed is not flagged')

/**
 * ── A ceiling that can be executed (issue #121) ────────────────────────────
 *
 * The ratio was the whole ceiling, and a ratio cannot say whether the order it
 * permits is placeable. The numbers below are the ones from the issue — a
 * 10,095,751 KRW book and a 33,050 KRW name — so the case fails if the rule
 * ever stops reproducing the size the source methodology actually took.
 *
 * ⚠️ The third assertion is the one that matters most: **the floor may not
 * inflate the weight without limit.** "Larger of a ratio and an amount" is
 * unbounded as the book shrinks, and on a 3,000,000 KRW book the floor alone
 * would ask for 10%.
 */
covers('sizing/executable-experimental-ceiling')
const ceilingConfig = { experimentalPositionCeiling: 0.01, experimentalPositionFloor: { KRW: 300000, USD: 200 }, experimentalPositionCeilingMax: 0.03 }
const issueBook = { portfolioNav: 10095751, portfolioNavCurrency: 'KRW', fx: { USDKRW: 1359.14 } }
const ceilingOf = (input) => execute({ operation: 'experimentalCeiling', asOf: radarAsOf, input })
const krCeiling = ceilingOf({ ...ceilingConfig, ...issueBook, positionCurrency: 'KRW' })
assert.equal(krCeiling.status, 'ok')
assert.equal(krCeiling.data.binding, 'floor', 'on this book the executable minimum binds, not the ratio')
assert.ok(krCeiling.data.experimentalCeiling > 0.025 && krCeiling.data.experimentalCeiling <= 0.03, 'and it lands on the Experiment-stage size the port came from, not a third of it')
assert.ok(
  Math.floor((krCeiling.data.experimentalCeiling * 10095751) / 33050) >= 9,
  'nine whole shares of the name the issue measured, against three under the ratio alone',
)
const usCeiling = ceilingOf({ ...ceilingConfig, ...issueBook, positionCurrency: 'USD' })
assert.equal(usCeiling.data.binding, 'floor')
assert.ok(usCeiling.data.floorWeight > 0.026 && usCeiling.data.floorWeight < 0.028, 'the USD floor crosses into the KRW denominator at the NAV rate and not by a second FX rule')
const smallBook = ceilingOf({ ...ceilingConfig, portfolioNav: 3000000, portfolioNavCurrency: 'KRW', fx: { USDKRW: 1359.14 }, positionCurrency: 'KRW' })
assert.equal(smallBook.data.floorWeight, 0.1)
assert.equal(smallBook.data.experimentalCeiling, 0.03, 'the floor never carries the ceiling past experimentalPositionCeilingMax')
assert.equal(smallBook.data.binding, 'ceilingMax')
assert.ok(
  smallBook.diagnostics.some((row) => row.code === 'experimental_floor_unreachable'),
  'a book that cannot hold an executable experiment inside the band is told so; a position rounded up to the cap is not the one the floor asked for',
)
const bigBook = ceilingOf({ ...ceilingConfig, portfolioNav: 100000000, portfolioNavCurrency: 'KRW', fx: { USDKRW: 1359.14 }, positionCurrency: 'KRW' })
assert.equal(bigBook.data.experimentalCeiling, 0.01, 'where the ratio is already executable it is still the ceiling — this floor lifts nothing on a large book')
assert.equal(ceilingOf({ experimentalPositionCeiling: 0.01 }).data.experimentalCeiling, 0.01, 'a caller that declares no floor gets the ratio it always got')
assert.equal(ceilingOf({}).data.experimentalCeiling, METHODOLOGY.experimentalPositionCeiling, 'and a caller that declares no ratio either gets the package constant — an absent one used to read as 0, which refuses every experiment rather than sizing one small')
assert.equal(ceilingOf({ portfolioNav: 1000000, portfolioNavCurrency: 'KRW', positionCurrency: 'KRW', experimentalPositionFloor: { KRW: 300000 } }).data.ceilingMax, METHODOLOGY.experimentalPositionCeilingMax, 'and the bound the floor may lift it to is the same constant')
assert.ok(
  ceilingOf({ ...ceilingConfig, ...issueBook }).diagnostics.some((row) => row.code === 'experimental_floor_unevaluated'),
  'a floor quoted per venue needs the venue named; guessing the currency would be inventing the number',
)
const sizedUnderFloor = execute({
  operation: 'targetWeight',
  asOf: radarAsOf,
  input: { expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, maturityStatus: 'observing', researchGate: 'passed', challengeVerdict: 'cleared', ...ceilingConfig, ...issueBook, positionCurrency: 'KRW' },
})
assert.equal(sizedUnderFloor.data.experimentalCeiling, krCeiling.data.experimentalCeiling, 'targetWeight applies the same rule rather than a second copy of the arithmetic')
assert.equal(sizedUnderFloor.data.bindingCap, krCeiling.data.experimentalCeiling)
assert.equal(
  execute({ operation: 'targetWeight', asOf: radarAsOf, input: { expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, maturityStatus: 'promoted', researchGate: 'passed', challengeVerdict: 'cleared', ...ceilingConfig, ...issueBook, positionCurrency: 'KRW' } }).data.bindingCap,
  0.2,
  "a promoted lens is not held to the experimental ceiling at all, floor or no floor — what binds is the Mandate's maxPositionWeight, which since #133 is the only position cap there is",
)
assert.ok(
  execute({ operation: 'targetWeight', asOf: radarAsOf, input: { expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, sectorHeadroom: 0.2, themeHeadroom: 0.15, maturityStatus: 'promoted', researchGate: 'passed', challengeVerdict: 'cleared', ...ceilingConfig, ...issueBook, positionCurrency: 'KRW' } })
    .diagnostics.some((row) => row.code === 'concentration_inputs_missing' && row.path === 'mandatePositionCap'),
  'and a run with sector and theme headroom but no Mandate position cap is unevaluated rather than sized to a sector limit',
)

/**
 * ── The control arm, and the prohibition on expanding it (issue #70 §9) ────
 */
covers('sizing/control-arm-limits')
const armRow = (weight) => ({ symbol: 'M1', weight, exitRegistered: true })
const arm = execute({ operation: 'controlArmLane', asOf: radarAsOf, input: { proposed: [armRow(0.01), { ...armRow(0.01), symbol: 'M2' }] } })
assert.equal(arm.data.admitted, true)
assert.equal(arm.data.role, 'control-arm')
assert.equal(arm.data.purpose, 'produce-closed-outcomes-not-returns')
assert.equal(arm.data.expansionProhibited, true)
assert.equal(arm.data.countsAgainstExperimentTotal, true)
assert.equal(arm.data.variantViewRequired, false, 'the variant view is waived because the size is bounded, not because the bar was lowered')
assert.deepEqual(arm.data.limits, { singleMaxWeight: 0.01, laneTotalMaxWeight: 0.06, maxConcurrentPositions: 6, timeStopTradingDays: 40, hardStopPct: -0.08 })
assert.ok(
  execute({ operation: 'controlArmLane', asOf: radarAsOf, input: { proposed: [armRow(0.03)] } })
    .diagnostics.some((row) => row.code === 'control_arm_single_cap'),
  'a bigger position is the main lane and owes a variant view',
)
assert.ok(
  execute({ operation: 'controlArmLane', asOf: radarAsOf, input: { proposed: [{ symbol: 'M1', weight: 0.01 }] } })
    .diagnostics.some((row) => row.code === 'control_arm_exit_unregistered'),
  'the exit discipline is this lane product; an unregistered entry is refused rather than promised',
)
assert.ok(
  execute({ operation: 'controlArmLane', asOf: radarAsOf, input: { proposed: Array.from({ length: 7 }, () => armRow(0.005)) } })
    .diagnostics.some((row) => row.code === 'control_arm_concurrency'),
  'the lane holds a bounded number of positions at once',
)
assert.ok(
  execute({ operation: 'controlArmLane', asOf: radarAsOf, input: { proposed: [armRow(0.01)], experimentTotalRemainingWeight: 0.005 } })
    .diagnostics.some((row) => row.code === 'control_arm_exceeds_experiment_total'),
  'the lane spends inside the experimental total, not beside it',
)

covers('promotion/expansion-prohibition')
const controlVerdict = execute({
  operation: 'verdictReport',
  asOf: radarAsOf,
  input: { cohort: 'mechanical-baseline', paper: { d60: { samples: 40, winRatePct: 80, avgExcessPct: 9 } } },
})
assert.equal(controlVerdict.status, 'blocked', 'a control arm is measured, never promoted — however well it did')
assert.equal(controlVerdict.data.verdict, 'not-applicable')
assert.deepEqual(controlVerdict.data.proposals, [], 'no proposal is raised on control-arm evidence')
assert.ok(controlVerdict.diagnostics.some((row) => row.code === 'control_arm_expansion_prohibited'))
assert.equal(
  execute({ operation: 'verdictReport', asOf: radarAsOf, input: { paper: { d60: { samples: 24, winRatePct: 60, avgExcessPct: 3 } } } }).data.cohort,
  'llm-research',
  'the judged cohort defaults to the one the verdict is about and is stated in the output',
)

covers('audit/two-discovery-branches-stated', 'audit/structural-advantage-stated')
const promptText = await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')
/**
 * ⚠️ Matched against a whitespace-collapsed copy. The first version tested the
 * raw text and failed on a phrase that happened to wrap across two lines —
 * a check that depends on where a paragraph was reflowed is measuring the
 * formatter, not the claim.
 */
const promptProse = promptText.replace(/\s+/g, ' ')
assert.ok(/two discovery branches/i.test(promptProse), 'the prompt states there are two branches')
assert.ok(/does not replace the other/i.test(promptProse), 'and that one does not replace the other')
for (const lens of ['inflection', 'quality-pullback', 'post-event-continuation']) {
  assert.ok(promptText.includes(`\`${lens}\``), `the prompt names the ${lens} lens the radar produces`)
}
assert.ok(/control arm, not the strategy/i.test(promptProse), 'the price branch is named as the control arm where lenses are chosen')
assert.ok(/redemptions|capacity constraint/i.test(promptProse), 'the account structural advantage is stated as the reason WAIT is a position')
assert.ok(/no source for that yet/i.test(promptProse), 'and the honest limit beside it — no branch actually uses that advantage')

/**
 * ── Pre-flight (issue #70 §7) ──────────────────────────────────────────────
 *
 * Three of the seven checks the original runs before planning had no operation
 * here, and the run skeleton had no step to hold them: the package could
 * compute the answers and was never asked the questions.
 */
covers('audit/harness-audit-blockers')
const auditAsOf = '2026-08-20T00:00:00Z'
const cleanBook = {
  positions: [{ symbol: 'AAA', quantity: 10 }],
  decisions: [{ asset: 'AAA', quantity: 10, orderReady: true, exitRegistered: true }],
  theses: [{ asset: 'AAA' }],
  watches: [{ subject: 'AAA', registeredAt: '2026-08-15T00:00:00Z' }],
}
const clean = execute({ operation: 'harnessAudit', asOf: auditAsOf, input: cleanBook })
assert.equal(clean.data.clearToPlan, true)
assert.equal(clean.status, 'ok')
const orphaned = execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...cleanBook, watches: [{ subject: 'GONE', registeredAt: '2026-08-15T00:00:00Z' }] } })
assert.ok(orphaned.data.issues.some((row) => row.code === 'audit_watch_orphan'), 'a WATCH on something the book neither holds nor claims keeps firing with nothing behind it')
assert.equal(orphaned.data.clearToPlan, false)
assert.ok(
  execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...cleanBook, decisions: [{ asset: 'AAA', quantity: 4, orderReady: true, exitRegistered: true }] } })
    .data.issues.some((row) => row.code === 'audit_position_mismatch'),
  'a size disagreement makes the denominator every weight uses wrong',
)
const untracked = execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...cleanBook, decisions: [] } })
assert.ok(untracked.data.issues.some((row) => row.code === 'audit_position_untracked'), 'a held position no decision explains is still reported')
assert.equal(untracked.data.clearToPlan, true, 'and it does not stop planning: a book connected to a broker satisfies this by definition on day one')
assert.ok(
  execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...cleanBook, decisions: [{ asset: 'AAA', quantity: 10, orderReady: true }] } })
    .data.issues.some((row) => row.code === 'audit_unregistered_ready'),
  'order-ready with no registered exit is the leak the original measured at two of seven orders',
)
const staleGate = execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...cleanBook, watches: [{ subject: 'AAA', registeredAt: '2026-06-01T00:00:00Z' }] } })
assert.ok(staleGate.data.issues.some((row) => row.code === 'audit_watch_stale' && row.severity === 'warn'), 'a month-old WATCH that never fired and cannot expire has stopped being a promise')
assert.equal(staleGate.data.clearToPlan, true, 'a stale gate is a warning; it does not stop planning')

/**
 * ── The book the manager inherited (issue #109) ────────────────────────────
 *
 * `audit_position_untracked` was a blocker, and every book that connects a
 * broker satisfies it by definition: nothing bought before this manager
 * existed can have a decision explaining it. The observed book had nine of ten
 * holdings blocked this way, on every run it ever made, and #96 had wired a
 * blocker to dispatch — so the manager had never evaluated a candidate at all.
 *
 * The distinction the check could not draw is the one the invocation was
 * already carrying: `mandate.effectiveFrom`, dropped on the floor by a
 * signature that never took it.
 */
covers('audit/inherited-positions-carried')
const coldStart = {
  positions: [{ symbol: 'OLD', quantity: 10, acquiredAt: '2026-01-05T00:00:00Z' }, { symbol: 'NEW', quantity: 5, acquiredAt: '2026-08-18T00:00:00Z' }],
  decisions: [],
  theses: [],
  watches: [],
  managedSince: '2026-06-01T00:00:00Z',
}
const inherited = execute({ operation: 'harnessAudit', asOf: auditAsOf, input: coldStart })
assert.equal(inherited.data.clearToPlan, true, 'a book bought before the manager existed is the initial condition of every install, not a consistency failure')
assert.deepEqual(inherited.data.grandfathered, ['OLD'], 'what predates the mandate is carried')
assert.deepEqual(inherited.data.unexplained, ['OLD', 'NEW'], 'and both kinds are still reported — the finding survives, the paralysis does not')
assert.deepEqual(inherited.data.blocksExpansionOf, ['OLD', 'NEW'], 'carrying is not licence to expand: adding to an unexplained holding waits for the explanation')
assert.equal(inherited.data.riskReducingAlwaysAllowed, true, 'and the direction that reduces risk is never the one a safety gate refuses')
assert.ok(
  inherited.data.issues.every((row) => row.subject === null || inherited.data.blocksExpansionOf.includes(row.subject)),
  'the hold names the symbols it holds back — a book-wide freeze keyed off a permanently non-empty set is the soft version of the deadlock this issue is about',
)
assert.ok(
  inherited.data.issues.every((row) => row.code !== 'audit_position_untracked' || row.severity === 'warn'),
  'the finding is a warn: what is missing is the explanation, not the denominator — `portfolio_read` supplies that from the broker',
)
assert.ok(
  execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...coldStart, managedSince: null } })
    .diagnostics.some((row) => row.code === 'audit_managed_since_missing'),
  'without the mandate date the two states cannot be told apart, and the run is told so rather than guessing',
)
assert.deepEqual(
  execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...coldStart, managedSince: null } }).data.grandfathered,
  ['OLD', 'NEW'],
  'and the safe direction is to carry both: Aumos exposes no acquisition date, so an unknown one is not expanded',
)
assert.ok(
  execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...cleanBook, decisions: [{ asset: 'AAA', quantity: 4, orderReady: true, exitRegistered: true }] } })
    .data.clearToPlan === false,
  'the check beside it is untouched: a recorded size that disagrees with the book is still a blocker',
)
const disabledGrandfather = execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...coldStart, config: { grandfather: { enabled: false } } } })
assert.deepEqual(disabledGrandfather.data.grandfathered, [], 'the investor can turn the tolerance off, and then nothing is carried as inherited')
assert.deepEqual(disabledGrandfather.data.blocksExpansionOf, ['OLD', 'NEW'], 'turning it off never loosens the run: an unexplained holding is still not expanded')
assert.ok(
  disabledGrandfather.data.issues.find((row) => row.subject === 'OLD').inherited,
  'and the record still says when the position arrived: that is a fact about the book, not a consequence of a setting the investor changed',
)
assert.deepEqual(
  execute({ operation: 'harnessAudit', asOf: auditAsOf, input: { ...coldStart, config: { grandfather: { blocksNewNonCoreWhenBreached: false } } } }).data.blocksExpansionOf,
  [],
  'the key that governs new exposure is the one the schema says governs it',
)

covers('learning/lesson-audit')
const lessons = execute({
  operation: 'lessonAudit',
  asOf: auditAsOf,
  input: { proposals: [
    { id: 'p1', raisedAt: '2026-08-18T00:00:00Z' },
    { id: 'p2', raisedAt: '2026-05-01T00:00:00Z', status: 'pending_user_review' },
    { id: 'p3', status: 'accepted' },
  ] },
})
assert.equal(lessons.data.pendingCount, 2, 'a proposal with no status is awaiting review, not resolved')
assert.equal(lessons.data.counts.accepted, 1)
assert.equal(lessons.data.canApply, false, 'this run reads proposals and cannot apply one')
assert.ok(lessons.diagnostics.some((row) => row.code === 'proposal_pending_stale'), 'a long-waiting proposal is more likely to be repeated than acted on')
assert.equal(
  execute({ operation: 'lessonAudit', asOf: auditAsOf, input: { proposals: [{ id: 'p4', status: 'pending-review' }] } }).status,
  'blocked',
  'an unrecognised status is refused: a typo silently decides a proposal nobody decided',
)

covers('audit/preflight-order-stated')
const preflightProse = (await readFile(new URL('../PROMPT.md', fixtureRoot), 'utf8')).replace(/\s+/g, ' ')
assert.ok(/Pre-flight, before planning any trade/i.test(preflightProse), 'the run skeleton has a step for the checks, not only the operations')
for (const named of ['lessonAudit', 'harnessAudit', 'exitCheck', 'trendState', 'verdictReport']) {
  assert.ok(preflightProse.includes(named), `pre-flight names ${named}; an operation with no call site is not a check`)
}
assert.ok(/before any new buy is considered/i.test(preflightProse), 'exits are reported before purchases are considered — the ordering is the rule')
assert.ok(/stops planning, never reporting/i.test(preflightProse), 'a blocker stops the plan and not the report')

/**
 * ── Declared thresholds (issue #70 §12–§15) ────────────────────────────────
 *
 * The numbers lived in `data/*.json`, which the matrix never inventoried.
 */
covers('scanner/lens-envelope-reachability', 'scanner/lens-envelope-is-the-scanner-source')
const envelopeAsOf = '2026-08-20T00:00:00Z'
const reachable = execute({ operation: 'lensEnvelope', asOf: envelopeAsOf, input: { lens: 'trend-pullback', triggers: [{ metric: 'offHigh200', level: -0.12 }] } })
assert.equal(reachable.data.triggers[0].reachable, true)
const unreachable = execute({ operation: 'lensEnvelope', asOf: envelopeAsOf, input: { lens: 'trend-pullback', triggers: [{ metric: 'offHigh200', level: -0.25 }] } })
assert.equal(unreachable.status, 'blocked', 'a trigger where the lens stops producing candidates is one the book never comes back through')
assert.equal(unreachable.data.triggers[0].reason, 'outside-the-lens-that-created-it')
assert.equal(
  execute({ operation: 'lensEnvelope', asOf: envelopeAsOf, input: { lens: 'mean-reversion', triggers: [{ metric: 'offHigh200', level: -0.6 }] } }).data.triggers[0].reachable,
  true,
  'deep dislocation has no floor, so a drawdown trigger is always reachable there',
)
assert.ok(
  execute({ operation: 'lensEnvelope', asOf: envelopeAsOf, input: { lens: 'trend-pullback', triggers: [{ metric: 'bookValue', level: 1 }] } })
    .diagnostics.some((row) => row.code === 'trigger_metric_undeclared'),
  'an undeclared metric is unknown, never assumed reachable',
)

/**
 * The property the original's copy-and-check-drift idiom protected: the
 * scanner behaves at the declared boundaries. A constant edited into the code
 * without the declaration moving fails here.
 */
const envelopes = JSON.parse(JSON.stringify((await import('../managers/evidence-gated/lib/envelopes.mjs')).LENS_ENVELOPES))
const boundaryBars = (offHigh, rsiTarget) => {
  const rise = Array.from({ length: 180 }, (_, index) => 60 + index * 0.9)
  const peak = rise.at(-1)
  const target = peak * (1 + offHigh)
  const drop = (peak - target) / 40
  return series([...rise, ...Array.from({ length: 40 }, (_, index) => peak - drop * (index + 1) + (index % 2 ? rsiTarget : -rsiTarget))])
}
const justInside = execute({ operation: 'scan', asOf: methodology.asOf, input: { symbol: 'EDGE', market: 'us', bars: boundaryBars(-0.18, 3) } })
assert.ok(justInside.data.indicators.offHigh200 >= envelopes['trend-pullback'].checks.pullback.min, 'the fixture sits inside the declared band')
assert.equal(justInside.data.signals.trendPullback.pullback, true, 'the scanner fires where the declaration says it fires')
const justOutside = execute({ operation: 'scan', asOf: methodology.asOf, input: { symbol: 'PAST', market: 'us', bars: boundaryBars(-0.26, 3) } })
assert.ok(justOutside.data.indicators.offHigh200 < envelopes['trend-pullback'].checks.pullback.min)
assert.equal(justOutside.data.signals.trendPullback.pullback, false, 'and stops where the declaration says it stops')

covers('watch/cluster-block')
const cluster = { name: 'hyperscaler-capex', prints: [{ at: '2026-08-29' }, { at: '2026-08-30' }] }
const blocked = execute({ operation: 'clusterBlock', asOf: envelopeAsOf, input: { clusters: [cluster], intent: 'promote-to-ready' } })
assert.equal(blocked.data.blocked, true, 'a binary event that decides the thesis is waited out, not sized around')
assert.equal(blocked.data.clearAfter, '2026-08-31', 'the block ends the day after the last print, not the day of it')
const scoped = execute({ operation: 'clusterBlock', asOf: envelopeAsOf, input: { clusters: [cluster], intent: 'register-paper' } })
assert.equal(scoped.data.blocked, false, 'research, WATCH and paper registration continue through a cluster')
assert.ok(scoped.diagnostics.some((row) => row.code === 'cluster_block_scope' && row.severity === 'info'))
assert.ok(
  execute({ operation: 'clusterBlock', asOf: envelopeAsOf, input: { clusters: [{ ...cluster, blockUntil: '2026-08-30' }] } })
    .diagnostics.some((row) => row.code === 'cluster_block_until_mismatch'),
  'a window copied from a sibling cluster ends before its own last print, and is refused',
)
assert.equal(
  execute({ operation: 'clusterBlock', asOf: '2026-09-05T00:00:00Z', input: { clusters: [cluster] } }).data.blocked,
  false,
  'once the cluster has passed it stops blocking',
)

covers('exit/time-stop-policy')
const timeStop = (overrides) => execute({ operation: 'timeStopPolicy', asOf: envelopeAsOf, input: { positions: [{ symbol: 'T1', reviewBy: '2026-08-01', ...overrides }] } })
assert.equal(timeStop({ catalystRealized: false, returnSinceEntryPct: -4, benchmarkReturnSinceEntryPct: 6 }).data.verdicts[0].verdict, 'exit-candidate')
assert.equal(
  timeStop({ catalystRealized: true, returnSinceEntryPct: -4, benchmarkReturnSinceEntryPct: 6 }).data.verdicts[0].reason,
  'catalyst-happened-so-the-thesis-was-tested',
  'a catalyst that fired tested the thesis; that is a review, not a time stop',
)
assert.equal(
  timeStop({ catalystRealized: false, returnSinceEntryPct: 9, benchmarkReturnSinceEntryPct: 6 }).data.verdicts[0].reason,
  'still-ahead-of-the-benchmark',
  'a thesis still ahead of its benchmark has not had its window wasted',
)
assert.equal(timeStop({ reviewBy: '2027-01-01', catalystRealized: false, returnSinceEntryPct: -4, benchmarkReturnSinceEntryPct: 6 }).data.verdicts[0].verdict, 'not-due')
assert.equal(
  execute({ operation: 'timeStopPolicy', asOf: envelopeAsOf, input: { positions: [{ symbol: 'CORE', core: true, reviewBy: '2026-08-01' }] } }).data.verdicts[0].verdict,
  'out-of-scope',
  'an allocation holding claimed no catalyst, so no catalyst can go unrealized',
)
assert.ok(
  timeStop({ catalystRealized: false }).diagnostics.some((row) => row.code === 'time_stop_unevaluated'),
  'a missing half leaves the promotion unresolved rather than declined',
)

covers('audit/rule-version-registry')
const registry = { signal_paper: { version: 'sp-v2', since: '2026-07-18' }, entry_quality: { version: 'eq-v2' } }
const versions = execute({ operation: 'ruleVersions', asOf: envelopeAsOf, input: { registry, axis: 'entry_quality', rows: [{ ruleVersion: 'eq-v2' }, { ruleVersion: 'eq-v2' }] } })
assert.equal(versions.data.declared.entry_quality.version, 'eq-v2')
assert.equal(versions.data.poolable, true)
assert.deepEqual(versions.data.axes.length, 11, 'the eleven versioned axes are declared, not inferred from whatever rows arrived')
assert.ok(versions.diagnostics.some((row) => row.code === 'rule_axis_undeclared'), 'an axis with no current version cannot say what a comparison is comparing')
assert.equal(
  execute({ operation: 'ruleVersions', asOf: envelopeAsOf, input: { registry, axis: 'entry_quality', rows: [{ ruleVersion: 'eq-v1' }, { ruleVersion: 'eq-v2' }] } }).status,
  'blocked',
  'rows judged under two versions of one axis cannot be pooled; a definition change increments the axis rather than re-tagging what is recorded',
)
assert.ok(
  execute({ operation: 'ruleVersions', asOf: envelopeAsOf, input: { registry: { ...registry, vibes: { version: 'v1' } } } })
    .diagnostics.some((row) => row.code === 'rule_axis_unknown'),
  'an axis outside the published set would version something nothing reads',
)
assert.ok(
  execute({ operation: 'ruleVersions', asOf: envelopeAsOf, input: { registry, axis: 'entry_quality', rows: [{ ruleVersion: 'eq-v1' }] } })
    .diagnostics.some((row) => row.code === 'rule_version_superseded'),
  'superseded rows stay valid on their own terms and are counted separately',
)

covers('policy/declared-thresholds', 'policy/benchmark-fixed')
for (const [path, value] of [['benchmarkHurdleAnnualPct', 7.67], ['coreDca.minimumCashWeightForFirstTranche', 0.5], ['coreDca.reserveFloorWeight', 0.15], ['coreDca.catchUpMonthlyMaxWeight', 0.125]]) {
  const node = path.split('.').reduce((acc, key) => acc.properties[key], { properties: configSchema.properties })
  assert.equal(node.default, value, `${path} is declared with its approved value rather than left to each run`)
}
assert.deepEqual(
  Object.keys(configSchema.properties.benchmarks.properties),
  ['koreanEquity', 'usEquity', 'cashLike'],
  'the benchmark is fixed per kind of holding; a denominator that changes between runs makes every active return incomparable',
)
assert.equal(GRANDFATHER_DEFAULTS.blocksNewNonCoreWhenBreached, true, 'existing exposure is tolerated and new exposure is not — a package rule since #133, not a setting')
const dcaSkill = await readFile(new URL('../skills/candidate-research/SKILL.md', fixtureRoot), 'utf8')
for (const condition of ['minimumCashWeightForFirstTranche', 'reserveFloorWeight', 'catchUpMonthlyMaxWeight']) {
  assert.ok(dcaSkill.includes(condition), `the Core DCA gate names ${condition} rather than describing it`)
}
assert.ok(/does not count as a ready single-name BUY/i.test(dcaSkill), 'a cash deployment is not counted as a single-name sample')
assert.ok(/\*\*benchmarks\*\*/.test(calibrationSkill) || /benchmarks/.test(calibrationSkill), 'the benchmark is on the non-mixing list it was missing from')

covers('audit/data-file-inventory')
assert.ok(/The contract files the executables read/.test(migrationText), 'the data files every executable reads have an inventory rather than being out of scope')
for (const file of ['lens_definitions.json', 'entry_gates.json', 'exit_rules.json', 'sizing_policy.json', 'workspace_policy.json', 'rule_versions.json', 'triage.py']) {
  assert.ok(migrationText.includes(file), `${file} has a recorded disposition; an absence with no entry is the failure this document prevents`)
}

/**
 * ── The rest of the skill↔code vocabulary check (issue #70 §25–§27, §18) ───
 *
 * #73 wired the failure taxonomy. These are the other three enumerations and
 * the config references — each one a place where a run could follow a skill
 * and be refused by the code.
 */
covers('research/thesis-field-contract')
const researchSkill = await readFile(new URL('../skills/candidate-research/SKILL.md', fixtureRoot), 'utf8')
/**
 * The contract `validateThesis` enforces is published where a run reads before
 * it is refused, and the two lists are checked against the code rather than
 * transcribed once and left.
 */
const thesisContract = researchSkill.slice(researchSkill.indexOf('## What a thesis has to carry'), researchSkill.indexOf('## Trigger vocabulary'))
for (const field of ['thesisId', 'asset', 'createdAt', 'coreClaim', 'horizonEnd', 'evidenceStatus']) {
  assert.ok(thesisContract.includes(`\`${field}\``), `the contract names the required field ${field}`)
  const withoutIt = { ...methodology.thesis }
  delete withoutIt[field]
  assert.ok(
    execute({ operation: 'validateThesis', asOf: methodology.asOf, input: withoutIt })
      .diagnostics.some((row) => row.code === 'thesis_field_missing' || row.code === 'thesis_evidence_status_invalid'),
    `${field} is required in code, not only in the table`,
  )
}
const falseComplete = execute({ operation: 'validateThesis', asOf: methodology.asOf, input: { ...methodology.thesis, expectedUpsidePct: null } })
assert.ok(falseComplete.diagnostics.some((row) => row.code === 'thesis_false_complete'), 'claiming complete with a gap open is the one state that would let unfinished work be counted as finished')
assert.deepEqual(falseComplete.data.gaps, ['expectedUpsidePct'])
const honestlyIncomplete = execute({ operation: 'validateThesis', asOf: methodology.asOf, input: { ...methodology.thesis, evidenceStatus: 'incomplete', expectedUpsidePct: null } })
assert.equal(honestlyIncomplete.status, 'unevaluated', 'gaps declared as gaps are normal and stay visible')
assert.equal(honestlyIncomplete.data.valid, true)
for (const gap of ['variantView', 'consensusRefs', 'catalysts', 'invalidationTriggers', 'expectedUpsidePct', 'fairValueRange']) {
  assert.ok(thesisContract.includes(`\`${gap}\``), `the contract names the gap field ${gap}`)
}
assert.ok(
  execute({ operation: 'validateThesis', asOf: methodology.asOf, input: { ...methodology.thesis, invalidationTriggers: [{ id: 'inv-1', kind: 'price-below', checkBy: '2026-11-15' }] } })
    .diagnostics.some((row) => row.code === 'invalidation_price_missing'),
  'a price invalidation needs its level under the canonical spelling too, not only the retired one',
)

covers('audit/skill-code-enum-agreement', 'audit/configured-x-exists')
const methodologySource = await readFile(new URL('../lib/methodology.mjs', fixtureRoot), 'utf8')
const evidenceSource = await readFile(new URL('../lib/evidence.mjs', fixtureRoot), 'utf8')
const setLiteral = (source, name) => {
  const start = source.indexOf(`${name} = new Set([`)
  nodeAssert.ok(start >= 0, `${name} is declared as a set literal`)
  return [...source.slice(start, source.indexOf('])', start)).matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1])
}
const vocabularySection = researchSkill.slice(researchSkill.indexOf('## Trigger vocabulary'), researchSkill.indexOf('## Lens-specific reading'))
for (const [name, section] of [['THESIS_TRIGGER_KINDS', vocabularySection], ['WATCH_TRIGGER_KINDS', vocabularySection]]) {
  for (const kind of setLiteral(methodologySource, name)) {
    assert.ok(section.includes(`\`${kind}\``), `the trigger vocabulary publishes ${kind}, which ${name} accepts`)
  }
}
assert.deepEqual(
  setLiteral(methodologySource, 'THESIS_TRIGGER_KINDS').filter((kind) => !setLiteral(methodologySource, 'WATCH_TRIGGER_KINDS').includes(kind)),
  ['metric'],
  'the one thesis-only kind is metric, and the skill says why',
)
assert.deepEqual(
  setLiteral(methodologySource, 'WATCH_TRIGGER_KINDS').filter((kind) => !setLiteral(methodologySource, 'THESIS_TRIGGER_KINDS').includes(kind)),
  ['weight-drift'],
  'and the one watch-only kind is the portfolio one',
)
assert.ok(
  setLiteral(methodologySource, 'THESIS_TRIGGER_KINDS').includes('at-time') && setLiteral(methodologySource, 'WATCH_TRIGGER_KINDS').includes('at-time'),
  'the schedule anchor is one kind under one name; it used to be `time` on one side and `at-time` on the other',
)
assert.equal(
  execute({ operation: 'validateThesis', asOf: methodology.asOf, input: { ...methodology.thesis, invalidationTriggers: [{ id: 'inv-1', kind: 'time', checkBy: '2026-11-15' }] } })
    .diagnostics.some((row) => row.code === 'invalidation_kind_invalid'),
  false,
  'the retired spelling is normalized, so no recorded thesis becomes unreadable',
)
assert.ok(
  execute({ operation: 'validateThesis', asOf: methodology.asOf, input: { ...methodology.thesis, invalidationTriggers: [{ id: 'inv-1', kind: 'price_below', level: 90, checkBy: '2026-11-15' }] } })
    .diagnostics.some((row) => row.code === 'trigger_kind_alias' && row.severity === 'info'),
  'and it says which name is canonical rather than accepting it silently',
)
for (const lens of setLiteral(evidenceSource, 'LENSES')) {
  assert.ok(promptText.includes(`\`${lens}\``), `PROMPT names the ${lens} lens that researchGate accepts`)
}
for (const unit of setLiteral(evidenceSource, 'NON_MONETARY_UNITS')) {
  assert.ok(contractSkill.includes(`\`${unit}\``), `the contract skill names the ${unit} unit`)
}

/**
 * "The configured X" has to be a key an investor can actually set. This is the
 * check that would have caught `priceConflictTolerance`, which three documents
 * called configured while the schema refused it.
 */
const configurablePaths = new Set()
const walkSchema = (node, prefix = '') => {
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name
    configurablePaths.add(name)
    configurablePaths.add(path)
    if (property.type === 'object') walkSchema(property, path)
  }
}
walkSchema(configSchema)
const documents = { 'PROMPT.md': promptText, 'README.md': await readFile(new URL('../README.md', fixtureRoot), 'utf8') }
for (const name of ['data-source-contract', 'sizing-and-concentration', 'evidence-gates', 'candidate-research', 'deterministic-metrics', 'outcome-calibration']) {
  documents[name] = await readFile(new URL(`../skills/${name}/SKILL.md`, fixtureRoot), 'utf8')
}
for (const [where, text] of Object.entries(documents)) {
  for (const match of text.matchAll(/configured `([A-Za-z.]+)`|`([A-Za-z]+(?:\.[A-Za-z]+)*)`[^.\n]{0,40}\bis configured\b/g)) {
    const key = (match[1] ?? match[2]).replace(/^config\./, '')
    assert.ok(configurablePaths.has(key) || configurablePaths.has(key.split('.').at(-1)), `${where} calls ${key} configured, so config.schema.json has it`)
  }
}
/**
 * ⚠️ **The list shrank in #133 and that is the point.** Six of the eight named
 * here were the methodology's own numbers; they are constants now, and a
 * document that still called one "configured" would be describing a control
 * that no longer exists. The loop above catches that in the other direction.
 */
for (const key of ['priceConflictTolerance', 'experimentalPositionFloor', 'minimumExpectedActiveReturn', 'benchmarkHurdleAnnualPct']) {
  assert.ok(configurablePaths.has(key), `${key} is a real configuration key`)
  assert.ok(
    Object.values(documents).some((text) => text.includes(key)),
    `${key} is named in a document, not only in the schema — an unmentioned key is one nobody sets`,
  )
}

/**
 * ── A declared key nothing reads (issue #109) ──────────────────────────────
 *
 * Three times now the same hole: `flow` (#87), the close buffers (#91) and
 * `grandfather` (#109) were each declared, documented, and read by no code —
 * and the verifier was green through all three, because the check above asks
 * whether a *documented* key is declared and never whether a *declared* key is
 * read. A setting on the install screen that governs nothing is worse than a
 * missing one: the investor set it and believes it took.
 *
 * The exemptions are the keys the **run** reads out of the invocation rather
 * than any operation — each is named here with who reads it, and each is
 * asserted absent from the library, so a key that is later wired up has to be
 * taken off this list instead of quietly outliving its reason.
 */
covers('audit/declared-config-keys-are-read')
const librarySource = (await Promise.all(
  ['audit', 'backtest', 'calibration', 'coverage', 'diagnostics', 'envelopes', 'evidence', 'indicators', 'learning', 'methodology', 'outcomes', 'scanners', 'schedule', 'sizing', 'source-parsers']
    .map((name) => readFile(new URL(`../lib/${name}.mjs`, fixtureRoot), 'utf8')),
)).join('\n')
const readByTheRunNotTheCode = {
  'benchmarks.koreanEquity': 'the run reads the symbol and passes bars, not the ticker',
  'benchmarks.usEquity': 'the run reads the symbol and passes bars, not the ticker',
  'benchmarks.cashLike': 'the run reads the symbol and passes bars, not the ticker',
  'freshnessHours.marketPrice': 'the run picks the lane limit and passes it to filterPointInTime as freshnessHours',
  'freshnessHours.corporateAction': 'the run picks the lane limit and passes it to filterPointInTime as freshnessHours',
}
const declaredKeys = []
const walkDeclared = (node, prefix = '') => {
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name
    if (property.type === 'object') walkDeclared(property, path)
    else declaredKeys.push({ name, path })
  }
}
walkDeclared(configSchema)
for (const { name, path } of declaredKeys) {
  const read = new RegExp(`\\b${name}\\b`).test(librarySource)
  const exempt = path in readByTheRunNotTheCode
  assert.ok(read || exempt, `config.schema.json declares ${path} and no operation reads it — declaring a setting that governs nothing is how #87, #91 and #109 each arrived`)
  assert.ok(!(read && exempt), `${path} is read by an operation now, so it does not belong on the run-reads-it list`)
}
assert.ok(/\bgrandfather\b/.test(librarySource), 'grandfather is the concept this check was written for, and it is read')
assert.equal(configSchema.properties.grandfather, undefined, 'and since #133 it is read from lib/constants.mjs rather than asked for on an install screen')

covers('policy/policy-lint-provenance')
const policyBase ={ concentration: { sector: 0.2 }, minimumExpectedActiveReturn: 0.05 }
const stricter = execute({ operation: 'policyLint', asOf: envelopeAsOf, input: { current: policyBase, proposed: { ...policyBase, concentration: { sector: 0.18 } }, provenance: { 'concentration.sector': { approvedBy: 'investor', approvedAt: '2026-08-01' } } } })
assert.equal(stricter.data.changes[0].effect, 'stricter')
assert.equal(stricter.status, 'ok', 'a tightening with attribution is accepted')
const looser = execute({ operation: 'policyLint', asOf: envelopeAsOf, input: { current: policyBase, proposed: { ...policyBase, minimumExpectedActiveReturn: 0.03 } } })
assert.equal(looser.status, 'blocked')
assert.ok(looser.diagnostics.some((row) => row.code === 'policy_auto_relax'), 'the moment to argue about a threshold is before it binds, not while it is refusing a trade')
assert.ok(
  execute({ operation: 'policyLint', asOf: envelopeAsOf, input: { current: policyBase, proposed: { ...policyBase, concentration: { sector: 0.18 } }, provenance: { 'concentration.sector': { immutable: true } } } })
    .diagnostics.some((row) => row.code === 'policy_immutable_changed'),
  'an immutable value moves by package revision, never by configuration',
)
assert.ok(
  execute({ operation: 'policyLint', asOf: envelopeAsOf, input: { current: policyBase, proposed: { ...policyBase, concentration: { sector: 0.18 } } } })
    .diagnostics.some((row) => row.code === 'policy_requires_approval'),
  'an unattributed change is unresolved rather than applied',
)
assert.equal(execute({ operation: 'policyLint', asOf: envelopeAsOf, input: { current: policyBase, proposed: policyBase } }).data.changeCount, 0)
assert.ok(/rule DSL is deliberately not ported/.test(migrationText), 'the matrix states which half of the policy engine came across and which did not')
assert.ok(/legacy and not shipped/.test(migrationText), 'and that the source tree workflow document describes a pipeline this port replaced')

/**
 * ── The regime a sample was gathered in (issue #81) ────────────────────────
 *
 * `promotionGate` counted distinct **strings**, so one market state written
 * three ways satisfied the three-regime requirement and opened `reviewReady`
 * on a sample gathered entirely in one regime — the exact bias the requirement
 * exists to reveal, hidden by the thing meant to reveal it.
 */
covers('promotion/regime-vocabulary-closed')
const regimeRows = (regimes) => {
  const rows = []
  const start = Date.parse('2026-01-01')
  for (let cluster = 0; cluster < promotion.generator.clusterCount; cluster += 1) {
    for (let index = 0; index < promotion.generator.rowsPerCluster; index += 1) {
      rows.push({
        cohort: 'promote',
        signalDate: new Date(start + cluster * promotion.generator.clusterGapDays * 86_400_000).toISOString().slice(0, 10),
        market: promotion.generator.markets[(cluster + index) % promotion.generator.markets.length],
        regime: regimes[(cluster + index) % regimes.length],
        ruleVersion: 'v1',
        forward: { d20: { returnPct: 2.5, excessReturnPct: 1.5 } },
      })
    }
  }
  return rows
}
const spelledThreeWays = execute({ ...promotion.request, input: { ...promotion.request.input, rows: regimeRows(['risk-on', 'risk_on', 'Risk On']) } })
assert.deepEqual(spelledThreeWays.data.versions[0].regimes, ['risk-on'], 'three spellings of one market state are one regime')
assert.equal(spelledThreeWays.data.versions[0].gate.regimesOk, false, 'and a sample gathered in one regime does not pass the requirement that exists to catch it')
const genuinelyThree = execute({ ...promotion.request, input: { ...promotion.request.input, rows: regimeRows(['risk-on', 'mixed', 'risk-off']) } })
assert.equal(genuinelyThree.data.versions[0].gate.regimesOk, true, 'three actual regimes still pass')
const inventedRegime = execute({ ...promotion.request, input: { ...promotion.request.input, rows: regimeRows(['risk-on', 'mixed', 'euphoria']) } })
assert.equal(inventedRegime.status, 'blocked', 'a tag outside the vocabulary is refused, not counted as a regime of its own')
assert.ok(inventedRegime.diagnostics.some((row) => row.code === 'regime_outside_vocabulary'))
assert.ok(
  execute({ ...promotion.request, input: { ...promotion.request.input, rows: regimeRows(['risk-on', 'mixed', 'risk-off']).map((row, index) => (index % 4 ? row : { ...row, regime: undefined })) } })
    .diagnostics.some((code) => code.code === 'regime_untagged_samples'),
  'untagged samples cannot show the bias the requirement exists to reveal, and say so',
)

covers('scanner/regime-tag-provenance')
const tagged = execute({ operation: 'regimeTag', asOf: '2026-08-20T00:00:00Z', input: { asserted: 'risk_on', briefRevisionId: 'brief-7', mechanical: { leadershipCharacter: 'risk-on', benchmarkAboveMa200: true } } })
assert.equal(tagged.data.regime, 'risk-on', 'the port spelling normalizes to the published one')
assert.equal(tagged.data.agreesWithReading, true)
assert.equal(tagged.data.judgementOwner, 'brief', 'the call belongs to Brief; this canonicalizes it and does not make it')
assert.ok(tagged.diagnostics.some((row) => row.code === 'regime_spelling_normalized' && row.severity === 'info'))
const disagreeing = execute({ operation: 'regimeTag', asOf: '2026-08-20T00:00:00Z', input: { asserted: 'risk-off', briefRevisionId: 'brief-7', mechanical: { leadershipCharacter: 'risk-on', benchmarkAboveMa200: true } } })
assert.equal(disagreeing.data.valid, true, 'Brief may call a regime the sector reading does not see — a policy statement can be right where a moving average is wrong')
assert.equal(disagreeing.data.agreesWithReading, false)
assert.ok(disagreeing.diagnostics.some((row) => row.code === 'regime_disagrees_with_reading' && row.severity === 'info'), 'and the disagreement travels with the sample rather than disappearing')
assert.equal(
  execute({ operation: 'regimeTag', asOf: '2026-08-20T00:00:00Z', input: { asserted: 'euphoria', briefRevisionId: 'brief-7' } }).status,
  'blocked',
  'free text makes one market state look like several',
)
assert.ok(
  execute({ operation: 'regimeTag', asOf: '2026-08-20T00:00:00Z', input: { asserted: 'risk-on' } })
    .diagnostics.some((row) => row.code === 'regime_unattributed'),
  'a regime call is a Brief judgement, so it names the revision that made it',
)
assert.ok(
  execute({ operation: 'regimeTag', asOf: '2026-08-20T00:00:00Z', input: { asserted: 'risk-off', briefRevisionId: 'brief-9', recorded: 'risk-on' } })
    .diagnostics.some((row) => row.code === 'regime_retagged'),
  'a sample keeps the regime the decision was made under; changing it reshapes the sample after the fact',
)
const calibrationRegime = calibrationSkill.slice(calibrationSkill.indexOf('## The regime a sample was gathered in'), calibrationSkill.indexOf('## Metrics'))
for (const regime of ['risk-on', 'risk-off', 'mixed']) {
  assert.ok(calibrationRegime.includes(`\`${regime}\``), `the skill publishes the ${regime} tag the code accepts`)
}
assert.ok(/not re-tagged/i.test(calibrationRegime), 'and states that a recorded regime is not re-tagged')

assertCoverageWasEarned()

console.log(`evidence-gated contract fixtures passed (${parity.cases.length} legacy-parity cases)`)
