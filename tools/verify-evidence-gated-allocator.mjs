import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated-allocator/lib/index.mjs'

const fixtureRoot = new URL('../managers/evidence-gated-allocator/fixtures/', import.meta.url)
const memory = JSON.parse(await readFile(new URL('memory-contract.json', fixtureRoot), 'utf8'))
const source = JSON.parse(await readFile(new URL('source-contract.json', fixtureRoot), 'utf8'))
const golden = JSON.parse(await readFile(new URL('legacy-golden/core.json', fixtureRoot), 'utf8'))
const scannerGolden = JSON.parse(await readFile(new URL('legacy-golden/scanner.json', fixtureRoot), 'utf8'))
const topology = JSON.parse(await readFile(new URL('topology.json', fixtureRoot), 'utf8'))

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

console.log('evidence-gated-allocator contract fixtures passed')
