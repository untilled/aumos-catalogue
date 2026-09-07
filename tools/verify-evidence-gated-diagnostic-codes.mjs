import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated/lib/index.mjs'
import { CAUSE_CODE_REGISTRY, CAUSE_LANES, REGISTERED_CAUSE_CODES, causeCodesInLane } from '../managers/evidence-gated/lib/diagnostic-codes.mjs'
import { INPUT_PATH_INCOMPLETE_CODES, CAUSE_UNRESOLVED_CODES, CAUSE_GATE_RAN_CODES } from '../managers/evidence-gated/lib/sizing.mjs'

/**
 * ── The check the vocabulary never had (issue #171) ────────────────────────
 *
 * `mandateExecution` decides *«is this book empty because the methodology
 * worked, or because its gates never received their inputs?»* by intersecting
 * the codes a run reports with a vocabulary. The vocabulary was hand-written
 * beside the reader and the codes are emitted by five other modules, so the two
 * drifted — and drift is silent here, because a code that matches nothing
 * simply does not match. The 2026-09-07 run reported `corp_code_unmapped_symbol
 * s`, `radar_lane_starved` and `lane_query_failed`, matched **none** of the
 * thirteen entries, and was told the methodology was working.
 *
 * Three things are checked, and the third is the one that could not have been
 * faked by keeping two lists tidy:
 *
 *  1. **Every registered code is emitted by the module the row names.** A row
 *     whose spelling exists nowhere is a code no run can ever produce, which is
 *     exactly what `corp_code_mapping_pending` was for `mapCorporationCodes`.
 *  2. **Every registered operation is one `execute` dispatches**, and the
 *     projections in `sizing.mjs` are the registry and nothing else — there is
 *     no second list to fall out of step with.
 *  3. **The siblings' real output, piped in.** Operations are run for real, the
 *     diagnostics they return are handed to `mandateExecution` unedited, and the
 *     cause is asserted. Nothing in this step reads the registry, so a rename on
 *     either side fails here whatever the tables say.
 */

const libRoot = new URL('../managers/evidence-gated/lib/', import.meta.url)
const modules = [...new Set(CAUSE_CODE_REGISTRY.map((row) => row.module))]
const sources = new Map()
for (const module of modules) sources.set(module, await readFile(new URL(module, libRoot), 'utf8'))

/**
 * Codes written as a literal in module *code*, comments removed.
 *
 * ⚠️ Snake case with at least one underscore is the whole filter, deliberately:
 * a code arrives at its `diagnostic()` call as a bare literal, as a ternary
 * between two of them (`corp_code_unmapped_symbols` / `corp_code_mapping_empty`
 * share one call), and as an indented argument several lines down. Matching the
 * call shape missed the second of those. ⛔ Comments are stripped first, because
 * this file's whole subject is a code that lives in prose and nowhere else.
 */
function emittedCodes(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return new Set([...code.matchAll(/'([a-z0-9]+(?:_[a-z0-9]+)+)'/g)].map((match) => match[1]))
}

/* ── ⑴ every row names a code its module actually emits ──────────────────── */
for (const row of CAUSE_CODE_REGISTRY) {
  const emitted = emittedCodes(sources.get(row.module))
  assert.ok(
    emitted.has(row.code),
    `${row.code} is registered as coming from ${row.operation} in ${row.module}, and that module does not emit it — this is the #171 defect: a spelling only the reader knows`,
  )
  assert.ok(CAUSE_LANES.includes(row.lane), `${row.code} is filed under an unknown lane ${row.lane}`)
}

/* ── ⑵ no code twice, every operation real, no second list ───────────────── */
const seen = new Set()
for (const row of CAUSE_CODE_REGISTRY) {
  assert.equal(seen.has(row.code), false, `${row.code} is registered twice; a code in two lanes is two answers to one question`)
  seen.add(row.code)
  const dispatched = execute({ operation: row.operation, asOf: '2026-09-07T00:00:00.000Z', input: {} })
  assert.equal(
    dispatched.diagnostics.some((item) => item.code === 'operation_unknown'),
    false,
    `${row.code} is registered against ${row.operation}, which is not an operation this package dispatches`,
  )
}

assert.deepEqual(INPUT_PATH_INCOMPLETE_CODES, causeCodesInLane('input-path'), 'the input-path vocabulary is the registry projected, never a copy of it')
assert.deepEqual(CAUSE_UNRESOLVED_CODES, causeCodesInLane('unresolved'))
assert.deepEqual(CAUSE_GATE_RAN_CODES, causeCodesInLane('gate-ran'))
assert.deepEqual(
  REGISTERED_CAUSE_CODES,
  [...INPUT_PATH_INCOMPLETE_CODES, ...CAUSE_UNRESOLVED_CODES, ...CAUSE_GATE_RAN_CODES].sort(),
  'the three lanes partition the registry — a row readable by nobody is a row that decides nothing',
)
for (const code of ['corp_code_unmapped_symbols', 'corp_code_mapping_empty', 'radar_lane_starved', 'lane_query_failed']) {
  assert.ok(INPUT_PATH_INCOMPLETE_CODES.includes(code), `${code} is a stage that lost an input and the 2026-09-07 run reported it; it has to be readable`)
}

/* ── ⑶ the siblings' own output, piped in unedited ───────────────────────── */
const asOf = '2026-09-07T00:00:00.000Z'
const book = [
  { symbol: '153130', weight: 0.27052, parkedLiquidity: true, sector: 'fixed-income' },
  { symbol: 'SGOV', weight: 0.1149, parkedLiquidity: true, sector: 'fixed-income' },
  { symbol: '069500', weight: 0.04206, core: true, sector: 'index' },
]
const cause = (reportedDiagnostics) => execute({
  operation: 'mandateExecution',
  asOf,
  input: { mandateObjective: 'Buy what the market has mispriced.', positions: book, cashWeight: 0.5725, reportedDiagnostics },
})

/** `mapCorporationCodes`: the registry answered and missed a roster name. */
const mapping = execute({
  operation: 'mapCorporationCodes',
  asOf,
  input: { market: 'kr', symbols: ['005930', '036460'], registryRows: [{ stockCode: '005930', corporationCode: '00126380', corporationName: '삼성전자' }] },
})
assert.ok(mapping.diagnostics.some((row) => row.code === 'corp_code_unmapped_symbols'))
const fromMapping = cause(mapping.diagnostics)
assert.equal(
  fromMapping.data.cause,
  'input-path-incomplete',
  "the join's own diagnostics, handed over unedited, say the lane is empty for want of an addressable name — this is the assertion the 2026-09-07 run failed",
)
assert.deepEqual(fromMapping.data.inputPathCodes, ['corp_code_unmapped_symbols'])
assert.equal(fromMapping.status, 'unevaluated', 'and «nobody said» is not a pass')

/** `upsideRadar`: a lane that was never fed. */
const radar = execute({ operation: 'upsideRadar', asOf, input: { candidates: [] } })
assert.ok(radar.diagnostics.some((row) => row.code === 'radar_lane_starved'))
assert.equal(cause(radar.diagnostics).data.cause, 'input-path-incomplete', '«unfed rather than empty» is the radar\'s own sentence and this operation now reads it')

/** `laneCoverage`: the lane was queried and answered nothing usable. */
const lanes = execute({
  operation: 'laneCoverage',
  asOf,
  input: {
    lane: 'kr',
    intent: 'review',
    sources: { toss: { status: 'fresh' } },
    activity: { toss: { attempts: 3, succeeded: false } },
  },
})
assert.ok(lanes.diagnostics.some((row) => row.code === 'lane_query_failed'), 'the preflight reports a queried lane that yielded nothing')
assert.equal(cause(lanes.diagnostics).data.cause, 'input-path-incomplete')

/** `thesisGapSources`: unknown class still refuses both readings. */
const unknownClass = cause([{ code: 'instrument_class_unknown' }, { code: 'active_return_below_gate' }])
assert.equal(unknownClass.data.cause, 'unreported', '⛔ unknown is not incomplete, and it is not «the gates ran» either')

/**
 * ── The run itself (run_73a3e6c41c204f468ee8be8d2923d898) ─────────────────
 *
 * The codes that run reported, in the order it reported them. Before #171 this
 * set intersected the vocabulary at **zero** and the operation answered
 * `no-candidate-cleared-the-gates` / `info` — *the methodology is working* —
 * over a book whose corp-code join had missed names, whose radar lane was
 * never fed and whose research lane had been queried and answered nothing.
 */
const theRun = cause([
  'coverage_incomplete',
  'discovery_lane_single',
  'lane_query_failed',
  'audit_position_untracked',
  'corp_code_unmapped_symbols',
  'exit_discipline_unevaluated',
])
assert.equal(theRun.data.cause, 'input-path-incomplete', 'the measured run, read with the codes it actually emitted')
assert.deepEqual(theRun.data.inputPathCodes, ['corp_code_unmapped_symbols', 'lane_query_failed'])
assert.equal(theRun.diagnostics.find((row) => row.code === 'mandate_objective_unexecuted').severity, 'unevaluated')

/* ── the default that flipped the verdict, closed ─────────────────────────── */
const unreadable = cause(['discovery_lane_single', 'audit_position_untracked', 'exit_discipline_unevaluated'])
assert.equal(
  unreadable.data.cause,
  'unreported',
  '⚠️ codes reported and none of them readable is this operation saying so, not «the methodology is working» — the #171 default',
)
assert.equal(unreadable.data.recognisedCodes.length, 0)
assert.equal(unreadable.data.reportedDiagnosticCount, 3, 'and the two numbers stay distinguishable: three reported, none recognised')
assert.equal(
  unreadable.diagnostics.find((row) => row.code === 'mandate_objective_unexecuted').severity,
  'unevaluated',
)

const gateRan = cause(['active_return_below_gate'])
assert.equal(gateRan.data.cause, 'no-candidate-cleared-the-gates', 'a gate that ran and refused is what earns the `info` answer')
assert.deepEqual(gateRan.data.gateRanCodes, ['active_return_below_gate'])
assert.equal(gateRan.diagnostics.find((row) => row.code === 'mandate_objective_unexecuted').severity, 'info')

const none = cause([])
assert.equal(none.data.cause, 'unreported', 'and a run that reported nothing is unchanged')

console.log(`evidence-gated diagnostic codes: ${CAUSE_CODE_REGISTRY.length} registered across ${CAUSE_LANES.length} lanes, every one emitted by the module that owns it`)
