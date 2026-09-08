import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated/lib/index.mjs'
import { handleMcpRequest } from '../managers/evidence-gated/lib/mcp-server.mjs'
import { METHODOLOGY } from '../managers/evidence-gated/lib/constants.mjs'
import { marketReviewIntent } from '../managers/evidence-gated/lib/schedule.mjs'
import { MACRO_INDICATORS } from '../managers/evidence-gated/lib/evidence.mjs'
import { MANAGER_ID } from '../managers/evidence-gated/lib/diagnostics.mjs'
import { BAR_CLOSE_LAG_MS, unclosedNewestBar } from '../managers/evidence-gated/lib/indicators.mjs'

const configSchema = JSON.parse(await readFile(new URL('../managers/evidence-gated/config.schema.json', import.meta.url), 'utf8'))

const asOf = '2026-09-05T11:44:38.351Z'
const run = (operation, input = {}) => execute({ operation, asOf, input })
const has = (answer, code) => answer.diagnostics.some((row) => row.code === code)

// #145: permission, collection and failed responses must be distinguishable.
const sources = { toss: { status: 'fresh' }, 'sec-edgar': { status: 'available' }, web: { status: 'available' } }
const news = run('laneCoverage', { lane: 'us', intent: 'holding-news', sources, activity: { web: { attempts: 1, succeeded: true } } })
assert.equal(news.data.degradesTo, 'web')
assert.equal(news.data.action, 'CONTINUE')
const unused = run('laneCoverage', { lane: 'us', intent: 'holding-news', sources, activity: {} })
assert.ok(has(unused, 'lane_not_queried'))
assert.equal(unused.data.judgement, 'unevaluated')
assert.ok(has(run('laneCoverage', { lane: 'us', intent: 'news', sources, activity: { web: { attempts: 1, succeeded: false } } }), 'lane_query_failed'))
assert.ok(has(run('laneCoverage', { lane: 'us', intent: 'news', sources: {} }), 'lane_source_blocked'))
assert.equal(run('laneCoverage', { lane: 'us', intent: 'new-fundamental-buy', sources }).data.action, 'CONTINUE')
assert.equal(run('laneCoverage', { lane: 'kr', intent: 'new-fundamental-buy', sources }).data.action, 'WAIT')
assert.ok(has(run('harnessAudit'), 'audit_research_unverified'))
const allUnused = run('harnessAudit', { researchActivity: ['web', 'open-dart', 'sec-edgar'].map((source) => ({ source, granted: true, attempts: 0 })) })
assert.equal(allUnused.diagnostics.filter((row) => row.code === 'lane_not_queried').length, 3)

// #146: reproducible membership, point-in-time exclusion and a second-run carry.
const kr = run('researchUniverse', { market: 'kr' })
assert.equal(kr.data.symbols.length, 74)
assert.equal(run('researchUniverse', { market: 'us' }).data.symbols.length, 83)
for (const symbol of ['035420', '036460', '316140']) assert.ok(kr.data.symbols.some((row) => row.symbol === symbol))
const observation = { symbol: 'NEW', market: 'us', observedAt: '2026-09-04T00:00:00Z', evidenceIds: ['ev-new'], extension: true }
const first = run('researchState', { observations: [observation] })
assert.deepEqual(run('researchState', { previous: first.data.nextState }).data.nextState.rows, first.data.nextState.rows)
assert.equal(run('researchUniverse', { market: 'us', extensions: first.data.nextState.rows }).data.symbols.length, 84)
assert.equal(run('researchState', { previous: first.data.nextState, observations: [{ ...observation, observedAt: '2099-01-01' }] }).data.nextState, null)
assert.equal(run('researchState', { observations: Array.from({ length: 201 }, (_, i) => ({ ...observation, symbol: `S${i}` })) }).data.nextState, null)
assert.ok(has(execute({ operation: 'researchUniverse', asOf: '2025-01-01T00:00:00Z', input: { market: 'kr' } }), 'research_universe_post_as_of'))
assert.ok(has(run('upsideRadar', { candidates: [{ symbol: '036460' }] }), 'radar_lane_starved'))
assert.ok(has(run('upsideRadar', { candidates: [] }), 'radar_lane_starved'))

// #147: refuse the reported wrong shapes; never supply replacement memory on failure.
for (const [operation, input] of [
  ['thesisSentinel', { invalidationTriggers: [] }],
  ['thesisSentinel', { invalidations: [{ kind: 'price-below' }] }],
  ['thesisSentinel', { invalidations: [{ kind: 'metric', operator: 'typo' }] }],
  ['concentration', { positions: [{ symbol: 'DKS', weight: 0.01, theme: 'retail' }] }],
  ['exitCheck', { price: { last: 139.15, close: 139.15, asOf, evidenceId: 'ev-price' } }],
  ['entryQualityGate', { scanHistory: [] }],
  /* ⚠️ Still refused, and #204 is why the line is worth keeping: `openWindow` is outside the §1 envelope, so it reads as a misspelled member rather than as a carried record. */
  ['signalPaper', { state: { openWindow: [] } }],
  ['paperAdmission', { setup: 'thesis_call', symbol: 'DKS' }],
]) {
  const answer = run(operation, input)
  assert.equal(answer.status, 'blocked', `${operation} rejects wrong shape`)
  assert.ok(has(answer, 'input_shape_invalid'))
  assert.equal(answer.data, null)
}
assert.equal(run('thesisSentinel').data.verdict, 'unevaluated')
assert.equal(run('thesisSentinel', { invalidations: [{ kind: 'price_below', level: 90, evidenceId: 'ev' }], evidence: [{ id: 'ev', value: 100 }] }).data.verdict, 'intact')
assert.notEqual(run('thesisSentinel', { invalidations: [{ kind: 'time', at: 'invalid', evidenceId: 'ev' }], evidence: [{ id: 'ev', availableAt: asOf }] }).data.verdict, 'intact')

/**
 * ── #181: evidence is joined to an invalidation by key, never by position ──
 *
 * The four controls the issue filed, run against
 * `run_996380fbdd9a41a5bb3d74f3eca761a2`'s own numbers. Before the fix the
 * lookup key was `undefined` on both sides — an unnamed rule asked for
 * `undefined` and every id-less evidence row was filed under it — so each rule
 * silently borrowed the last id-less row and compared itself against it.
 *
 * ⛔ The direction is the point of pinning it: a price borrowed by an FX rule
 * clears an FX threshold by three orders of magnitude, so the fabricated state
 * is always `met`, `met` is `threatened`, and three of those owe a resize or a
 * liquidation. **The state an unjoined rule answers must be `unevaluated` —
 * not `met`, which invents a breach, and not `not-met`, which reports an
 * invalidation as checked and clear on evidence nobody supplied.**
 */
const sentinelRules = [
  { id: 'bok-base-rate', kind: 'metric', metric: 'policy-rate', operator: 'below', level: 2.5 },
  { id: 'usdkrw', kind: 'metric', metric: 'usdkrw', operator: 'above', level: 1543.4 },
  { id: 'carry-20bar', kind: 'metric', metric: 'carry-20bar-annualized-pct', operator: 'below', level: 0 },
  { id: 'hard-stop', kind: 'price_below', level: 104254.4 },
]
const sentinelEvidence = [
  { metric: 'policy-rate', value: 3.0 },
  { metric: 'usdkrw', value: 1344.1 },
  { metric: 'carry-20bar-annualized-pct', value: 2.5388 },
  { value: 113320 },
]
const stateOf = (answer, id) => answer.data.evaluations.find((row) => row.id === id)?.state
// (a) Four rules, four metric-bearing rows. Each metric rule reads its own metric.
const controlA = run('thesisSentinel', { invalidations: sentinelRules, evidence: sentinelEvidence })
assert.equal(stateOf(controlA, 'usdkrw'), 'not-met', '1344.1 is not above 1543.4, and the price row is not the USDKRW row')
assert.equal(stateOf(controlA, 'bok-base-rate'), 'not-met')
assert.equal(stateOf(controlA, 'carry-20bar'), 'not-met')
// The price row names no rule and no metric, so the price rule joins to nothing.
assert.equal(stateOf(controlA, 'hard-stop'), 'unevaluated', 'a price rule with no evidenceId joins to nothing and is unevaluated')
assert.equal(controlA.data.verdict, 'watch', 'one unjoined rule is a watch a person reads, never an intact thesis')
assert.ok(has(controlA, 'sentinel_evidence_missing'))
// (b) The operators were never the defect; all four answers stay correct.
for (const [operator, level, expected] of [['above', 1000, 'met'], ['above', 1543.4, 'not-met'], ['below', 1543.4, 'met'], ['below', 1000, 'not-met']]) {
  const isolated = run('thesisSentinel', {
    invalidations: [{ id: 'usdkrw', kind: 'metric', metric: 'usdkrw', operator, level }],
    evidence: [{ metric: 'usdkrw', value: 1344.1 }],
  })
  assert.equal(stateOf(isolated, 'usdkrw'), expected, `usdkrw ${operator} ${level}`)
}
// (c) Dropping the price rule while keeping the price row leaves usdkrw alone.
assert.equal(stateOf(run('thesisSentinel', { invalidations: sentinelRules.slice(0, 3), evidence: sentinelEvidence }), 'usdkrw'), 'not-met')
// (d) Dropping the price row must not move the wrong answer onto hard-stop.
const controlD = run('thesisSentinel', { invalidations: sentinelRules, evidence: sentinelEvidence.slice(0, 3) })
assert.equal(stateOf(controlD, 'usdkrw'), 'not-met')
assert.equal(stateOf(controlD, 'hard-stop'), 'unevaluated', '2.5388 is a carry reading, not this position\'s price')
// The three published keys each join, and the answer says which one stood.
const sentinelJoined = run('thesisSentinel', {
  invalidations: [
    { id: 'by-id', kind: 'price_below', level: 90, evidenceId: 'ev-price' },
    { id: 'by-reverse', kind: 'price_below', level: 90 },
    { id: 'by-metric', kind: 'metric', metric: 'usdkrw', operator: 'below', level: 1000 },
  ],
  evidence: [{ id: 'ev-price', value: 100 }, { invalidationId: 'by-reverse', value: 100 }, { metric: 'usdkrw', value: 1344.1 }],
})
assert.deepEqual(sentinelJoined.data.evaluations.map((row) => row.joinedBy), ['evidenceId', 'invalidationId', 'metric'])
assert.equal(sentinelJoined.data.verdict, 'intact')
// A named evidenceId that matches nothing is unevaluated, not the row beside it.
assert.equal(run('thesisSentinel', { invalidations: [{ id: 'r', kind: 'price_below', level: 90, evidenceId: 'absent' }], evidence: [{ id: 'ev', value: 10 }] }).data.verdict, 'watch')
// Two rows under one key is a tie, and a broken tie is the defect this replaces.
const ambiguous = run('thesisSentinel', {
  invalidations: [{ id: 'usdkrw', kind: 'metric', metric: 'usdkrw', operator: 'above', level: 1543.4 }],
  evidence: [{ metric: 'usdkrw', value: 1344.1 }, { metric: 'usdkrw', value: 1600 }],
})
assert.equal(stateOf(ambiguous, 'usdkrw'), 'unevaluated')
assert.ok(has(ambiguous, 'sentinel_evidence_ambiguous'))
// An unnamed rule is still named by position, and the substitution is reported.
const unnamed = run('thesisSentinel', { invalidations: [{ kind: 'price_below', level: 90, evidenceId: 'ev' }], evidence: [{ id: 'ev', value: 100 }] })
assert.equal(unnamed.data.evaluations[0].id, 'rule-0')
assert.ok(has(unnamed, 'sentinel_rule_unnamed'))
// The id a caller passes is never replaced by rule-N.
assert.equal(run('thesisSentinel', { invalidations: [{ id: 'usdkrw', kind: 'price_below', level: 90, evidenceId: 'ev' }], evidence: [{ id: 'ev', value: 100 }] }).data.evaluations[0].id, 'usdkrw')
// ⛔ Three unjoined rules must not accumulate toward a forced resize.
assert.equal(run('thesisSentinel', {
  invalidations: sentinelRules,
  evidence: [],
  priorVerdicts: [{ asOf: '2026-09-03T00:00:00Z', verdict: 'threatened' }, { asOf: '2026-09-04T00:00:00Z', verdict: 'threatened' }],
}).data.escalationRequired, false, 'evidence nobody supplied cannot be the third threatened verdict')
// The join keys are published, so the shape is documented rather than guessed.
assert.deepEqual(run('inputContracts').data.vocabulary.sentinelJoinKeys, ['evidenceId', 'invalidationId', 'metric'])
assert.ok(run('inputContracts').data.nested.thesisSentinel['evidence[]'].includes('invalidationId'))
const wrongTargets = run('globalAllocation', { targets: [{ symbol: 'DKS', market: 'XNYS', targetWeight: 0.01 }, { symbol: 'SGOV', market: 'XNYS', targetWeight: 0.02 }] })
assert.ok(has(wrongTargets, 'global_target_key_missing'))
assert.equal(has(wrongTargets, 'global_target_duplicate'), false)
assert.ok(has(run('globalAllocation', { targets: [{ key: 'us', weight: 0.1 }, { key: 'us', weight: 0.1 }] }), 'global_target_duplicate'))
const audit = run('harnessAudit', { positions: [{ symbol: 'DKS', quantity: 1 }], decisions: [{ asset: 'DKS', quantity: 99, targetWeight: 0.01 }] })
assert.equal(has(audit, 'audit_position_mismatch'), false)
assert.ok(has(audit, 'audit_decision_quantity_unsupported'))
const carried = { schemaVersion: 1, updatedAsOf: asOf, openWindows: [{ symbol: 'DKS', setup: 'mean_reversion', ruleVersion: 'v1', signalAt: asOf }], closed: {} }
assert.equal(run('signalPaper', { openWindows: carried.openWindows }).data.nextState, null)
const malformedRow = run('signalPaper', { state: carried, rows: [{ bars: [] }] })
assert.ok(has(malformedRow, 'paper_row_metadata_missing'))
assert.equal(malformedRow.data.nextState, null)
assert.equal(run('signalPaper', { state: carried }).data.nextState.openWindows.length, 1)
const rpc = handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'calculate', arguments: { operation: 'thesisSentinel', asOf, input: { invalidation: [] } } } })
assert.equal(rpc.result.structuredContent.status, 'blocked')

/**
 * ── #156: `decisions[].armed` is past tense, and #148 read it as a receipt ──
 *
 * The control observation is `dec_c914fc5caf644d74a72113a87c2562b3`: one
 * judgement armed four plans and only the one that had already **TRIGGERED**
 * appeared in its `armed[]`. The three ARMED ones were absent — by design, not
 * by failure — so a run that read the empty-for-them array as "the arm failed"
 * re-armed them, and did it twice: kr-sleeve 3 / us-sleeve 3 / allocate 2.
 */
const journalOfDecC914 = [
  // `pln_c446d3c1…` weight-drift, plans.status TRIGGERED — the only one carried.
  { planId: 'pln_c446d3c1', fate: 'fired', trigger: 'weight-drift' },
]
const standingPlansOfDecC914 = [
  { planId: 'pln_8e142b0f', flow: 'us-sleeve', at: '2026-09-08T20:45:00.000Z', status: 'ARMED' },
  { planId: 'pln_10c901bd', flow: 'kr-sleeve', at: '2026-09-07T07:00:00.000Z', status: 'ARMED' },
  { planId: 'pln_13e6da3e', flow: 'allocate', at: '2026-11-06T21:00:00.000Z', status: 'ARMED' },
]
assert.equal(journalOfDecC914.length, 1, 'one of four plans reached the journal, and it is the one that ended')
assert.equal(standingPlansOfDecC914.filter((row) => row.status === 'ARMED').length, 3, 'the three still standing are unreadable from any field AMP publishes')

const sequence = [{ flow: 'kr-sleeve', at: '2026-09-07T07:00:00Z' }]
const remembered = { schemaVersion: 2, updatedAsOf: asOf, armed: [{ flow: 'kr-sleeve', atEpochMs: Date.parse(sequence[0].at) }] }
// The empty journal is refused as a parameter, not read as "no confirmed arms".
const withJournal = run('reconcileArmedReviews', { previous: remembered, journalArmed: [], sequence })
assert.ok(has(withJournal, 'armed_journal_not_a_receipt'))
assert.equal(withJournal.status, 'blocked')
assert.equal(withJournal.data.nextState, null)
assert.equal(has(withJournal, 'armed_journal_mismatch'), false, 'the journal cannot win a question it does not answer')
assert.equal(has(withJournal, 'armed_journal_unverified'), false)
// A receipt-shaped journal is refused too: the shape was never the problem.
assert.ok(has(run('reconcileArmedReviews', { previous: remembered, journalArmed: sequence, sequence }), 'armed_journal_not_a_receipt'))
// Without it, the promise is re-armed rather than suppressed, and named.
const rearmed = run('reconcileArmedReviews', { previous: remembered, sequence })
assert.equal(has(rearmed, 'armed_journal_unverified'), false, 'nothing is unverified; there was never a verifier')
assert.deepEqual(rearmed.data.toArm, sequence)
assert.deepEqual(rearmed.data.duplicateFlows, ['kr-sleeve'])
assert.ok(has(rearmed, 'review_already_armed'))
assert.ok(has(rearmed, 'armed_state_unreadable'))
assert.equal(rearmed.data.standingArms, null)
assert.equal(rearmed.data.standingArmsAreUnreadable, true)
assert.equal(rearmed.status, 'ok', 'an unreadable standing count is a true statement about the contract, not a failed calculation')
assert.equal(has(rearmed, 'standing_arms_are_a_floor'), false, 'a call handed no standingPlans has no floor to report')

/**
 * ── #201: the floor is read, and the two absences stay two facts ───────────
 *
 * `standingArms` was hard-coded `null` while `standingPlans` shipped, and this
 * operation is `strict` — so a run that followed §4 and handed the field over
 * had the whole calculation refused as an unknown key, while one that did not
 * could report no floor at all. It is report-only: it reaches `standingArms`
 * and reaches nothing else.
 */
const standingRows = standingPlansOfDecC914.map((row) => ({ planId: row.planId, armedAt: asOf, expiresAt: row.at, intent: `market-review:${row.flow}`, trigger: { kind: 'at-time', at: row.at } }))
const withFloor = run('reconcileArmedReviews', { previous: remembered, sequence, standingPlans: standingRows })
assert.equal(withFloor.status, 'ok', 'the field a run is told to read is not an unknown key')
assert.equal(has(withFloor, 'input_shape_invalid'), false)
assert.deepEqual(withFloor.data.standingArms, { atLeast: 3, basis: 'invocation.standingPlans' }, 'the count arrives under a word that makes it a floor rather than a total')
assert.equal(withFloor.data.standingArmsAreUnreadable, false)
assert.ok(has(withFloor, 'standing_arms_are_a_floor'))
assert.equal(has(withFloor, 'armed_state_unreadable'), false, 'it is readable now, and the two codes are exclusive')
// ⛔ Report-only: reading what stands narrows nothing. Same inputs, same arming answer.
assert.deepEqual(withFloor.data.toArm, rearmed.data.toArm, 'toArm is the whole sequence whether or not the floor was read')
assert.deepEqual(withFloor.data.toArm, sequence)
assert.deepEqual(withFloor.data.duplicateFlows, rearmed.data.duplicateFlows)
assert.deepEqual(withFloor.data.superseded, rearmed.data.superseded)
assert.deepEqual(withFloor.data.previouslyProposed, rearmed.data.previouslyProposed)
assert.deepEqual(withFloor.data.nextState, rearmed.data.nextState, 'the state written back is built from memory and the sequence alone')
// Three standing rows for a sequence of one: a floor over the whole book never suppresses.
assert.equal(withFloor.data.toArm.length, 1)
// ⛔ Absent and empty are two facts. Empty is an answer; absent is not.
const emptyFloor = run('reconcileArmedReviews', { previous: remembered, sequence, standingPlans: [] })
assert.deepEqual(emptyFloor.data.standingArms, { atLeast: 0, basis: 'invocation.standingPlans' }, 'nothing stood that the host could date, and that zero is the answer')
assert.equal(emptyFloor.data.standingArmsAreUnreadable, false, 'an empty array is an answer, not a silence')
assert.ok(has(emptyFloor, 'standing_arms_are_a_floor'))
assert.equal(has(emptyFloor, 'armed_state_unreadable'), false)
// A host older than aumos#690 carries no such field, and a run may forward the null it read.
for (const absent of [{}, { standingPlans: null }]) {
  const answer = run('reconcileArmedReviews', { previous: remembered, sequence, ...absent })
  assert.equal(answer.data.standingArms, null, 'not handed the field is unreadable, never a floor of zero')
  assert.equal(answer.data.standingArmsAreUnreadable, true)
  assert.ok(has(answer, 'armed_state_unreadable'))
  assert.equal(has(answer, 'standing_arms_are_a_floor'), false)
}
// The floor is counted, never parsed into a narrower one.
assert.equal(run('reconcileArmedReviews', { previous: remembered, sequence, standingPlans: [{ planId: 'p1' }, { planId: 'p2' }] }).data.standingArms.atLeast, 2)
assert.equal(run('reconcileArmedReviews', { previous: remembered, sequence, standingPlans: 3 }).status, 'blocked', 'a count is not a list of promises')
// The promise survives the run that could not confirm it — #148 emptied it here.
assert.equal(rearmed.data.nextState.armed.length, 1)
assert.equal(run('reconcileArmedReviews', { previous: remembered, sequence: [] }).data.nextState.armed.length, 1, 'a run with nothing to arm still carries what it promised')
// The three duplicated intents: each re-arm is returned, and each is disclosed.
const duplicatedIntents = standingPlansOfDecC914.map((row) => ({ flow: row.flow, at: row.at }))
const thirdPass = run('reconcileArmedReviews', {
  previous: { schemaVersion: 2, updatedAsOf: asOf, armed: duplicatedIntents.map((row) => ({ flow: row.flow, atEpochMs: Date.parse(row.at) })) },
  sequence: duplicatedIntents,
})
assert.deepEqual(thirdPass.data.toArm, duplicatedIntents, 'every review is armed every judgement; the host folds the identical instant per instance (aumos#593)')
assert.deepEqual(thirdPass.data.duplicateFlows, ['us-sleeve', 'kr-sleeve', 'allocate'], 'and all three repeats are named rather than silently produced')
assert.deepEqual(thirdPass.data.superseded, [], 'none of them moved, so none of them is the duplicate the host does not fold')
// The duplicate folding does not cover: same flow, different instant.
const moved = run('reconcileArmedReviews', { previous: remembered, sequence: [{ flow: 'kr-sleeve', at: '2026-09-07T07:30:00Z' }] })
assert.ok(has(moved, 'review_superseded'))
assert.equal(moved.diagnostics.find((row) => row.code === 'review_superseded').severity, 'unevaluated')
const corrupt = run('reconcileArmedReviews', { previous: { ...remembered, armed: [{ flow: 'kr-sleeve', atEpochMs: 1757228400000, atLabel: '2026-09-07 07h00m00s UTC' }] }, sequence })
assert.ok(has(corrupt, 'armed_instant_mismatch'))
assert.equal(corrupt.data.nextState, null)

/**
 * ── #202: the orphan gets an address, and «nameless» stays two facts ────────
 *
 * `review_superseded` reported the one duplicate the host does not fold and
 * named no row. Since aumos#712 folded the identical re-arm at arming time
 * that is the **only** duplicate left standing — identity is bytes and
 * `expiresAt` is excluded, so the same promise at a different instant survives
 * both folds — and no verb withdraws it, so an anonymous report leaves the
 * reader nowhere to go.
 */
const movedSequence = [{ flow: 'kr-sleeve', at: '2026-09-07T07:30:00Z' }]
const addressed = run('reconcileArmedReviews', { previous: remembered, sequence: movedSequence, standingPlans: standingRows })
const orphan = addressed.diagnostics.find((row) => row.code === 'review_superseded')
assert.ok(orphan, 'the duplicate the host does not fold is still reported')
assert.deepEqual(orphan.details.planIds, ['pln_10c901bd'], 'the older promise is named by its row, matched on this package\'s own marker and the instant')
assert.deepEqual(orphan.details.unnamedFlows, [])
assert.equal(has(addressed, 'superseded_address_unreadable'), false)
assert.equal(has(addressed, 'superseded_address_unnamed'), false, 'every orphan was named, so neither silence is claimed')
// ⛔ Addressing is a report: the same inputs arm the same thing with and without the field.
const unaddressed = run('reconcileArmedReviews', { previous: remembered, sequence: movedSequence })
assert.deepEqual(addressed.data.toArm, unaddressed.data.toArm, 'toArm is the whole sequence whether or not the orphan could be named')
assert.deepEqual(addressed.data.toArm, movedSequence)
assert.deepEqual(addressed.data.duplicateFlows, unaddressed.data.duplicateFlows)
assert.deepEqual(addressed.data.superseded, unaddressed.data.superseded, 'the address rides in the diagnostic, never inside the returned orphan')
assert.deepEqual(addressed.data.nextState, unaddressed.data.nextState)
// ⛔ Not handed the field: nothing here could name a row, and that is the contract's silence.
assert.ok(has(unaddressed, 'superseded_address_unreadable'))
assert.equal(has(unaddressed, 'superseded_address_unnamed'), false, 'the two silences are exclusive')
const unreadableOrphan = unaddressed.diagnostics.find((row) => row.code === 'review_superseded')
assert.deepEqual(unreadableOrphan.details.planIds, [], 'an unnameable orphan carries no id rather than a guessed one')
assert.deepEqual(unreadableOrphan.details.unnamedFlows, ['kr-sleeve'])
// ⛔ Handed the field and matching nothing is the other fact: the floor left it out.
for (const plans of [[], [{ planId: 'pln_other', intent: 'market-review:us-sleeve', trigger: { kind: 'at-time', at: '2026-09-08T20:45:00.000Z' } }]]) {
  const unmatched = run('reconcileArmedReviews', { previous: remembered, sequence: movedSequence, standingPlans: plans })
  assert.ok(has(unmatched, 'superseded_address_unnamed'))
  assert.equal(has(unmatched, 'superseded_address_unreadable'), false)
  assert.deepEqual(unmatched.diagnostics.find((row) => row.code === 'review_superseded').details.planIds, [])
  assert.equal(unmatched.data.standingArmsAreUnreadable, false, 'a readable floor with no matching row is still a readable floor')
}
// The marker this package writes carries the instant, so an entry with no trigger is still matchable.
const markerOnly = run('reconcileArmedReviews', {
  previous: remembered,
  sequence: movedSequence,
  standingPlans: [{ planId: 'pln_from_marker', intent: marketReviewIntent('kr-sleeve', '2026-09-07T07:00:00.000Z') }],
})
assert.deepEqual(markerOnly.diagnostics.find((row) => row.code === 'review_superseded').details.planIds, ['pln_from_marker'])
// ⛔ `expiresAt` is the horizon, not the appointment — the field the host's identity check excludes.
const horizonOnly = run('reconcileArmedReviews', {
  previous: remembered,
  sequence: movedSequence,
  standingPlans: [{ planId: 'pln_horizon', intent: 'market-review:kr-sleeve', expiresAt: '2026-09-07T07:00:00.000Z', trigger: { kind: 'at-time', at: '2026-09-09T07:00:00.000Z' } }],
})
assert.deepEqual(horizonOnly.diagnostics.find((row) => row.code === 'review_superseded').details.planIds, [], 'a promise that merely expires at the orphan\'s instant is not the orphan')
assert.ok(has(horizonOnly, 'superseded_address_unnamed'))
// No orphan, no address diagnostics at all — this reports a supersede, it does not look for one.
for (const code of ['superseded_address_unreadable', 'superseded_address_unnamed']) {
  assert.equal(has(withFloor, code), false, 'nothing was superseded, so no silence about an address is claimed')
  assert.equal(has(rearmed, code), false)
}

// #156: the durable rule that caused the duplicates is retracted by the package, not by a run.
const confirmedWrongRule = {
  schemaVersion: 1,
  updatedAsOf: asOf,
  patterns: [
    { id: 'armed-reviews-memory-claims-arms-the-decision-never-made', state: 'CONFIRMED', severity: 'blocks-every-future-wake', rule: 'Cross-check `run/armed-reviews` against `history.recentDecisions[].armed`. When they disagree, the journal wins.' },
    { id: 'source-route-flaky', state: 'OBSERVED', rule: 'The Toss calendar route timed out twice.' },
  ],
}
const retraction = run('refutedMemoryRules', { patterns: confirmedWrongRule })
assert.ok(has(retraction, 'memory_rule_refuted'))
assert.equal(retraction.data.retractions.length, 1, 'only the refuted rule is named; an unrelated observed pattern is left alone')
assert.equal(retraction.data.retractions[0].writeAs.state, 'RETRACTED')
assert.equal(retraction.data.retractions[0].writeAs.retracts, 'armed-reviews-memory-claims-arms-the-decision-never-made')
assert.ok(/past tense/.test(retraction.data.retractions[0].correction), 'the retraction says why the observation was real and the inference wrong, so it cannot be re-derived')
// The wording matches even when another instance named the rule something else.
const renamed = run('refutedMemoryRules', { patterns: [{ id: 'my-own-name-for-it', rule: 'When they disagree, the journal wins.' }] })
assert.equal(renamed.data.retractions.length, 1)
assert.equal(renamed.data.retractions[0].matchedId, 'my-own-name-for-it')
assert.deepEqual(run('refutedMemoryRules', { patterns: [] }).data.retractions, [])
assert.ok(has(run('refutedMemoryRules'), 'memory_rules_unread'), 'a run that never read the key cannot correct it, and is told so')
assert.equal(run('refutedMemoryRules', { patterns: 'confirmed' }).status, 'blocked')
assert.ok(has(run('refutedMemoryRules', { patterns: 42 }), 'memory_rules_shape_invalid'))

/**
 * ── #156 ⑵: a holding explained by a decision outside the window ───────────
 *
 * `history.recentDecisions` is a window (aumos#688). `positions[].origin` reads
 * the earliest naming decision over the whole journal, and
 * `history.totalDecisions` says whether the window was cut — both optional, and
 * absent means the host did not say, never that no decision explains it.
 */
const windowed = { decisions: [{ asset: 'DKS', targetWeight: 0.01 }], managedSince: '2026-01-01T00:00:00Z' }
const withOrigin = run('harnessAudit', { ...windowed, totalDecisions: 7, positions: [{ symbol: 'DKS' }, { symbol: '069500', origin: { decisionId: 'dec_f0549343', asOf: '2026-07-02T00:00:00Z' } }] })
assert.deepEqual(withOrigin.data.unexplained, [], 'the journal names the decision even though the window did not carry it')
assert.deepEqual(withOrigin.data.blocksExpansionOf, [], 'so nothing is frozen against a decision that simply aged out')
assert.ok(has(withOrigin, 'audit_position_origin_outside_window'))
assert.equal(withOrigin.data.decisionWindowWhole, false)
const truncated = run('harnessAudit', { ...windowed, totalDecisions: 7, positions: [{ symbol: '069500' }] })
assert.deepEqual(truncated.data.unexplained, ['069500'], 'without an origin the holding is still carried the conservative way')
assert.ok(has(truncated, 'audit_decision_window_truncated'))
assert.equal(truncated.data.issues.find((row) => row.code === 'audit_position_untracked').explanationReadable, false, 'but the run no longer claims to have read that no decision explains it')
const unstated = run('harnessAudit', { ...windowed, positions: [{ symbol: '069500' }] })
assert.ok(has(unstated, 'audit_decision_window_unstated'), 'an absent totalDecisions is the host not saying, never a whole journal')
assert.equal(unstated.data.decisionWindowWhole, null)
assert.equal(unstated.data.issues.find((row) => row.code === 'audit_position_untracked').explanationReadable, false)
const whole = run('harnessAudit', { ...windowed, totalDecisions: 1, positions: [{ symbol: '069500' }] })
assert.equal(has(whole, 'audit_decision_window_unstated'), false)
assert.equal(has(whole, 'audit_decision_window_truncated'), false)
assert.equal(whole.data.issues.find((row) => row.code === 'audit_position_untracked').explanationReadable, true, 'the whole journal was supplied, so the finding is a fact this run read')

// #149: a USD 200-scale position cannot fund three whole-share rungs of a $139 name.
const minimumUsd = run('minimumExecutableWeight', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', minimumExecutablePosition: { USD: 200, KRW: 300000 }, positionCurrency: 'USD' })
const weight = minimumUsd.data.minimumWeight
assert.equal(weight, 0.01345312, 'USD 200 against a USD 14,866.44 book, the arithmetic #121 measured')
const plan = { symbol: 'DKS', lens: 'mean-reversion', maturity: 'insufficient', price: 139.15, plannedTotalWeight: weight, execution: { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'USD', lotSize: 1 }, tranches: [{ weight: weight / 3, condition: { kind: 'immediate' } }, { weight: weight / 3, condition: { kind: 'price-below', threshold: 130 } }, { weight: weight / 3, condition: { kind: 'price-below', threshold: 120 } }] }
assert.ok(has(run('entryTranchePlan', plan), 'experimental_ladder_unreachable'))
assert.equal(has(run('entryTranchePlan', { ...plan, price: 50 }), 'experimental_ladder_unreachable'), false)
assert.ok(has(run('entryTranchePlan', { ...plan, execution: null }), 'experimental_ladder_unevaluated'))
assert.equal(has(run('entryTranchePlan', { ...plan, execution: { ...plan.execution, lotSize: 0.01 } }), 'experimental_ladder_unreachable'), false)

/**
 * ── #226: the lane that made the position impossible, and what sizes now ────
 *
 * Every number here is `run_c7ad46eea03840bf84ae7a8822ed02c3`'s, asOf
 * 2026-09-08: NAV **USD 14,937.07**, USDKRW **1,340**, a USD 200 minimum
 * ticket, and a Mandate declaring `maxPositionWeight` 0.20, `cashFloor` 0.10
 * and `maxDrawdown` 0.06.
 *
 * ⛔ **The measured «before» is the chain the issue names**, and it is asserted
 * here as *arithmetic that this package can no longer produce*:
 *
 *     variantViewCheck 0/4 → forced control arm → flat 1% with no floor lift
 *     → USD 149.37 < the USD 200 minimum ticket → no single name at any price
 *
 * The «after» is below: the venue minimum is 1.338951% of this book, the
 * Mandate's cap is 20%, the risk budget under it is computed, and the weight
 * comes out of the quarter-Kelly arithmetic between them.
 */
const measuredBook = { portfolioNav: 14937.07, portfolioNavCurrency: 'USD', minimumExecutablePosition: { USD: 200, KRW: 300000 }, positionCurrency: 'USD', fx: { USDKRW: 1340 } }
const measuredMinimum = run('minimumExecutableWeight', measuredBook)
assert.equal(measuredMinimum.data.minimumWeight, 0.01338951, 'the USD 200 ticket as a weight of the measured book')
assert.equal(run('minimumExecutableWeight', { ...measuredBook, positionCurrency: 'KRW' }).data.minimumWeight, 0.01498825, 'and the KRW 300,000 ticket crossed at the book’s own USDKRW')
// ⛔ The 1% cell that refused it is not computable any more: there is no lane weight to read.
assert.equal(METHODOLOGY.controlArm.singleMaxWeight, undefined, 'the control arm has no single-name size cap since #226')
assert.equal(METHODOLOGY.controlArm.laneTotalMaxWeight, undefined, 'nor a lane total')
assert.equal(METHODOLOGY.experimentalPositionCeiling, undefined, 'nor a maturity ceiling')
assert.equal(METHODOLOGY.experimentalPositionCeilingMax, undefined, 'nor a bound the venue amount could lift one to')

/**
 * The variant view. It was a twentyfold size switch; it is a gate on whether a
 * position exists at all, and the four requirements are byte-for-byte the ones
 * #153 wrote.
 */
const consensusRef = { metric: 'consensusTargetPrice', value: 250000, sourceUrl: 'https://example.invalid/consensus', publishedAt: '2026-08-20T00:00:00Z', capturedAt: '2026-08-21T00:00:00Z' }
const mainLaneThesis = {
  thesisId: 'th-035420', asset: '035420', createdAt: '2026-08-21T00:00:00Z', coreClaim: 'search monetization inflection', horizonEnd: '2027-03-31T00:00:00Z',
  evidenceStatus: 'complete', variantView: 'the market prices the ad cycle and not the cloud contribution',
  consensusRefs: [consensusRef],
  catalysts: [{ event: 'Q3 result', windowStart: '2026-10-20T00:00:00Z', windowEnd: '2026-11-10T00:00:00Z' }],
  invalidationTriggers: [{ kind: 'price-below', level: 150000, checkBy: '2026-12-31T00:00:00Z' }],
  expectedUpsidePct: 32, fairValueRange: { low: 230000, high: 280000 },
}
const checked = { thesis: mainLaneThesis, challengeVerdict: 'cleared' }
const issueBook = { ...measuredBook }
const capOf = (extra = {}) => run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.2, maturityStatus: 'insufficient', ...checked, ...extra })

// An unchecked candidate is refused rather than sized small — the decision #226 left open, resolved.
const unchecked = run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.2, maturityStatus: 'insufficient' })
assert.ok(has(unchecked, 'variant_view_required_for_position'))
const laneRefusal = unchecked.diagnostics.find((row) => row.code === 'variant_view_required_for_position')
assert.equal(laneRefusal.severity, 'blocked', 'blocked, not a smaller weight: an evidence gate is not a dial')
assert.deepEqual(laneRefusal.details.missing, ['thesisComplete', 'variantView', 'consensusRefs', 'challengeCleared'])
assert.equal(laneRefusal.details.requirementReport.length, 4, 'and which one binds is nameable (#160)')
assert.ok(has(unchecked, 'variant_view_unverified'))
// ⛔ It is the fourth quarter of a gate that already blocked: `challengeCleared` alone was always fatal.
const onlyChallengeMissing = run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.2, thesis: mainLaneThesis, challengeVerdict: 'conditional_watch' })
assert.deepEqual(onlyChallengeMissing.diagnostics.find((row) => row.code === 'variant_view_required_for_position').details.missing, ['challengeCleared'])
// Every requirement is load-bearing, and every failure is the same refusal rather than a smaller lane.
for (const [label, extra] of [
  ['no variant view statement', { thesis: { ...mainLaneThesis, variantView: '' } }],
  ['no dated consensus citation', { thesis: { ...mainLaneThesis, consensusRefs: [] } }],
  ['a citation published after it was captured', { thesis: { ...mainLaneThesis, consensusRefs: [{ ...consensusRef, publishedAt: '2026-08-22T00:00:00Z' }] } }],
  ['a citation published after asOf', { thesis: { ...mainLaneThesis, consensusRefs: [{ ...consensusRef, publishedAt: '2027-01-01T00:00:00Z', capturedAt: '2027-01-02T00:00:00Z' }] } }],
  ['an incomplete thesis', { thesis: { ...mainLaneThesis, evidenceStatus: 'incomplete' } }],
  ['a conditional challenge verdict', { challengeVerdict: 'conditional_watch' }],
  ['no thesis at all', { thesis: undefined }],
]) {
  const fallen = capOf(extra)
  assert.equal(fallen.data.variantViewVerified, false, `${label} is not a variant view`)
  assert.equal(fallen.data.resolvedLane, 'control-arm', `${label} carries the control-arm lens tag`)
  assert.ok(has(fallen, 'variant_view_required_for_position'), `${label} refuses the position`)
  assert.equal(fallen.data.effectiveCap, 0.2, `${label} is not sized smaller — the cap is untouched and the position is refused`)
}
// The control arm's own record may not buy a position on a variant view.
const citingTheArm = capOf({ evidenceSamples: [{ setup: 'mean_reversion', cohort: 'mechanical-baseline' }] })
assert.ok(has(citingTheArm, 'control_arm_evidence_cited'))
assert.equal(citingTheArm.diagnostics.find((row) => row.code === 'control_arm_evidence_cited').severity, 'blocked')
assert.equal(citingTheArm.data.variantViewVerified, false)
// The research cohort's own record is not the control arm's.
assert.equal(capOf({ evidenceSamples: [{ setup: 'thesis_call' }] }).data.variantViewVerified, true)
// The promotion gate is not lowered by any of this — it simply gates nothing.
assert.deepEqual(METHODOLOGY.promotionGate, { samples: 30, regimes: 3, clusters: 10 })
assert.equal(capOf().data.promotion.gatesSize, false)

/**
 * The Mandate is the ceiling and the risk budget is what sits under it. ⛔ The
 * cap is never lowered for maturity, for a lens or for a lane.
 */
const mandateOnly = capOf()
assert.equal(mandateOnly.data.declaredCap, 0.2)
assert.equal(mandateOnly.data.effectiveCap, 0.2)
assert.equal(mandateOnly.data.binding, 'mandate')
assert.equal(mandateOnly.data.reduced, false)
assert.deepEqual(mandateOnly.data.limits.map((row) => row.source), ['mandate'])
assert.deepEqual(mandateOnly.data.effectiveConstraints, [], 'a cap that was not reduced draws no row')
assert.equal(mandateOnly.data.variantViewVerified, true)
assert.equal(mandateOnly.data.resolvedLane, 'main')
// ⛔ An undeclared risk budget is unevaluated, never a pass.
assert.ok(has(mandateOnly, 'position_risk_budget_unevaluated'))
assert.equal(mandateOnly.diagnostics.find((row) => row.code === 'position_risk_budget_unevaluated').severity, 'unevaluated')
assert.equal(mandateOnly.data.riskBudget.weight, null)
// Declared, and it binds: 0.06 of drawdown with 0.045 already held is 0.015 of headroom at a −8% stop.
const budgeted = capOf({ mandateMaxDrawdown: 0.06, heldPortfolioHeat: 0.045, stopLossPct: -0.08 })
assert.equal(budgeted.data.riskBudget.weight, 0.1875)
assert.equal(budgeted.data.effectiveCap, 0.1875)
assert.equal(budgeted.data.binding, 'risk-budget')
assert.equal(budgeted.data.reason, 'risk_budget')
assert.equal(budgeted.data.unlocksAt, 'portfolioHeat')
assert.equal(budgeted.data.reduced, true)
assert.equal(has(budgeted, 'position_risk_budget_unevaluated'), false)
// On an empty book the same stop leaves more headroom than the Mandate allows, so the Mandate binds.
const roomy = capOf({ mandateMaxDrawdown: 0.06, stopLossPct: -0.08 })
assert.equal(roomy.data.riskBudget.weight, 0.75)
assert.equal(roomy.data.effectiveCap, 0.2)
assert.equal(roomy.data.binding, 'mandate')
assert.equal(roomy.data.reduced, false)

/**
 * The disclosure. The row the fund-settings screen draws
 * (untilled/aumos#681, issue #679) — `effectiveConstraintSchema` is a
 * strictObject, so the field names are the host's and a methodology name would
 * be refused there. ⚠️ The code is `position_cap_reduced_below_declared` since
 * #226: maturity is not what reduces a cap any more, so the old token named a
 * rule that no longer exists.
 */
const declaredVersusEffective = budgeted
const constraints = declaredVersusEffective.data.effectiveConstraints
assert.ok(has(declaredVersusEffective, 'position_cap_reduced_below_declared'))
const reduction = declaredVersusEffective.diagnostics.find((row) => row.code === 'position_cap_reduced_below_declared')
assert.equal(reduction.severity, 'unevaluated')
assert.equal(reduction.details.reductionMultiple, 1.0667)
assert.deepEqual(reduction.details.limits.map((row) => row.source), ['mandate', 'risk-budget'])
assert.deepEqual(constraints, [{
  field: 'maxPositionWeight',
  declared: 0.2,
  effective: 0.1875,
  reason: 'risk_budget',
  unlocks: 'portfolioHeat: maxDrawdown 0.06 · held 0.045 · stop 0.08',
}])
assert.deepEqual(Object.keys(constraints[0]).sort(), ['declared', 'effective', 'field', 'reason', 'unlocks'], 'no key the host schema does not carry')
// `declared` is echoed from this run's mandate rather than pinned to one book.
assert.equal(capOf({ mandatePositionCap: 0.3, mandateMaxDrawdown: 0.06, heldPortfolioHeat: 0.045, stopLossPct: -0.08 }).data.effectiveConstraints[0].declared, 0.3)
// No inequality, no row.
assert.deepEqual(roomy.data.effectiveConstraints, [])
// Only the axis this methodology actually narrows is named.
assert.deepEqual([...new Set(constraints.map((row) => row.field))], ['maxPositionWeight'])
// ⛔ The retired token has no producer left anywhere in this package.
assert.equal(has(declaredVersusEffective, 'position_cap_reduced_by_maturity'), false)

/**
 * ── #212 ②: the calculation says what must be disclosed; another operation
 * says whether it was ─────────────────────────────────────────────────────
 */
/**
 * ⚠️ **Two rows since #230, and they are two different sentences to two
 * different readers.** The reduction says *this size is smaller than you
 * declared*; the unlock says *here is the control that would open it*. The
 * second is emitted here because the risk budget is what binds and the Mandate
 * cap sits measurably above it — see the `sizing/cap-raise-unlock` case in
 * `verify-evidence-gated-allocator.mjs` for the arithmetic and the silences.
 */
assert.deepEqual(declaredVersusEffective.data.disclosures.map((row) => row.code), ['position_cap_reduced_below_declared', 'cap_raise_would_unlock'])
const capDisclosure = declaredVersusEffective.data.disclosures[0]
assert.deepEqual(capDisclosure.fields, ['uncertainty', 'effectiveConstraints'], 'both halves, and they are different readers')
assert.equal(capDisclosure.undisclosedCode, 'position_cap_reduction_undisclosed', 'the refusal keeps the code it always had')
assert.deepEqual(capDisclosure.expect.effectiveConstraints, constraints, 'and it carries the row to copy, so the check has something exact to compare')
assert.deepEqual(capDisclosure.details, { declared: 0.2, effective: 0.1875 })
// A cap that was not reduced owes the proposal nothing.
assert.deepEqual(roomy.data.disclosures, [])

// ⛔ The arithmetic no longer reads any of the three prose fields, and says so.
for (const field of ['uncertainty', 'risks', 'effectiveConstraints']) {
  const answer = capOf({ [field]: [] })
  assert.equal(has(answer, 'position_cap_reduction_undisclosed'), false, `${field} raises nothing here — the calculator does not judge prose`)
  assert.ok(
    answer.diagnostics.some((row) => row.code === 'input_key_unread' && row.path === `input.${field}`),
    `${field} is reported unread rather than silently honoured, which is the true answer once nothing reads it`,
  )
}

// The disclosure round-trips exactly as `discovery_lane_dark` does, in both halves — one operation later.
const disclosureOf = (proposal) => run('proposalDisclosure', { disclosures: capDisclosure ? [capDisclosure] : [], ...(proposal === undefined ? {} : { proposal }) })
assert.equal(disclosureOf().data.disclosed, null, 'a call made before the proposal exists leaves the disclosure unjudged')
assert.equal(has(disclosureOf(), 'position_cap_reduction_undisclosed'), false)
assert.ok(has(disclosureOf({ uncertainty: ['the sweep found one candidate'] }), 'position_cap_reduction_undisclosed'))
assert.equal(has(disclosureOf({ uncertainty: ['position_cap_reduced_below_declared: 0.20 declared, 0.1875 operative'], effectiveConstraints: constraints }), 'position_cap_reduction_undisclosed'), false)
// Prose without the machine-readable row is still an undisclosed reduction.
const proseOnly = disclosureOf({ uncertainty: ['position_cap_reduced_below_declared'], effectiveConstraints: [] })
assert.ok(has(proseOnly, 'position_cap_reduction_undisclosed'))
assert.deepEqual(proseOnly.diagnostics.find((row) => row.code === 'position_cap_reduction_undisclosed').details.missing, ['effectiveConstraints'])
// And the row without the prose is the same silence from the other side.
assert.deepEqual(disclosureOf({ uncertainty: [], effectiveConstraints: constraints }).diagnostics.find((row) => row.code === 'position_cap_reduction_undisclosed').details.missing, ['uncertainty'])
// Both halves carried, and the run is clear.
const bothHalves = disclosureOf({ uncertainty: ['position_cap_reduced_below_declared'], effectiveConstraints: constraints })
assert.equal(has(bothHalves, 'position_cap_reduction_undisclosed'), false)
assert.equal(bothHalves.data.disclosed, true)
assert.deepEqual(bothHalves.data.required, ['position_cap_reduced_below_declared'])
// A row naming another number is not this reduction.
assert.ok(has(disclosureOf({ uncertainty: ['position_cap_reduced_below_declared'], effectiveConstraints: [{ ...constraints[0], effective: 0.2 }] }), 'position_cap_reduction_undisclosed'))
// An absent `disclosures` array is not an empty one: nothing was judged and nothing is claimed.
const noObligation = run('proposalDisclosure', { proposal: { uncertainty: [] } })
assert.equal(noObligation.data.disclosed, null)
assert.ok(has(noObligation, 'proposal_disclosure_inputs_missing'))
assert.equal(run('proposalDisclosure', { disclosures: [], proposal: { uncertainty: [] } }).data.disclosed, null, 'no obligation is not a pass either')

/**
 * ── The invariant this issue is about: prose cannot move a number (#212 ②) ──
 */
const proseShapes = [
  {},
  { uncertainty: [], risks: [], effectiveConstraints: [] },
  { uncertainty: ['the sweep found one candidate'], risks: ['idiosyncratic single-name risk'] },
  { uncertainty: ['position_cap_reduced_below_declared'], effectiveConstraints: constraints },
  { uncertainty: ['position_cap_reduced_below_declared'], effectiveConstraints: [{ ...constraints[0], effective: 0.2 }] },
  { risks: ['main_lane_rests_on_manager_attestation'], uncertainty: ['main_lane_rests_on_manager_attestation'] },
]
const numericKeys = ['declaredCap', 'effectiveCap', 'binding', 'reduced', 'reducedToFraction', 'reason', 'unlocksAt', 'resolvedLane', 'variantViewVerified', 'effectiveConstraints']
const riskInputs = { mandateMaxDrawdown: 0.06, heldPortfolioHeat: 0.045, stopLossPct: -0.08 }
const capBaseline = capOf(riskInputs)
const sizedInput = { ...issueBook, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, maturityStatus: 'insufficient', researchGate: 'passed', challengeVerdict: 'cleared', thesis: mainLaneThesis, ...riskInputs }
const weightBaseline = run('targetWeight', sizedInput)
for (const shape of proseShapes) {
  const label = JSON.stringify(shape)
  const capAnswer = capOf({ ...riskInputs, ...shape })
  for (const key of numericKeys) {
    assert.deepEqual(capAnswer.data[key], capBaseline.data[key], `effectivePositionCap.${key} is unmoved by ${label}`)
  }
  const weightAnswer = run('targetWeight', { ...sizedInput, ...shape })
  assert.equal(weightAnswer.data.targetWeight, weightBaseline.data.targetWeight, `targetWeight is unmoved by ${label} — this is the defect #212 ② names`)
  assert.equal(weightAnswer.data.bindingCap, weightBaseline.data.bindingCap, `bindingCap is unmoved by ${label}`)
  assert.notEqual(weightAnswer.data.targetWeight, null, `and it is a number rather than a refusal: ${label}`)
  assert.deepEqual(weightAnswer.data.disclosures, weightBaseline.data.disclosures, `the obligation it carries is unmoved by ${label}`)
}
// The baseline is a real reduction, so the loop above is testing something that could have failed.
assert.equal(capBaseline.data.reduced, true)
assert.equal(weightBaseline.data.positionCapReduced, true)

// An undeclared cap is reported under the code it always had.
const undeclared = run('effectivePositionCap', { ...issueBook, maturityStatus: 'insufficient', ...checked })
assert.ok(has(undeclared, 'concentration_inputs_missing'))
assert.equal(undeclared.data.reduced, false)

/**
 * ── The venue minimum refuses; it never lifts (#121, #226) ────────────────
 *
 * ⛔ `experimental_floor_exceeds_cap` compared the minimum against the control
 * arm's 1% cell and is deleted with the cell. What replaced it compares against
 * the cap that actually binds — and on the measured book USD 200 is 1.34% of a
 * 20% cap, so it does not fire at all. That is the fix: the position the
 * arithmetic asks for is above the minimum ticket, where before it was below.
 */
assert.equal(has(declaredVersusEffective, 'experimental_floor_exceeds_cap'), false, 'the code is gone with the cell it measured')
assert.equal(has(declaredVersusEffective, 'minimum_executable_exceeds_cap'), false, 'and the minimum sits far under the cap that replaced it')
assert.equal(declaredVersusEffective.data.minimumVersusCap.exceeds, false)
assert.equal(declaredVersusEffective.data.minimumVersusCap.capAmount, 2800.7, '18.75% of the measured book, against a USD 200 ticket')
// A book small enough for the minimum to exceed its own cap is still told so.
const tinyBook = run('effectivePositionCap', { ...issueBook, portfolioNav: 5000, mandatePositionCap: 0.02, maturityStatus: 'insufficient', ...checked })
assert.ok(has(tinyBook, 'minimum_executable_exceeds_cap'))
const tiny = tinyBook.diagnostics.find((row) => row.code === 'minimum_executable_exceeds_cap')
assert.equal(tiny.severity, 'unevaluated')
assert.equal(tiny.details.capAmount, 100)
assert.equal(tiny.details.minimumAmount, 200)
assert.equal(tiny.details.resolvesAtNav, 10000, 'the NAV that resolves it is stated, not rediscovered every run')
// #149's ladder code is a different question and does not answer this one.
assert.equal(has(declaredVersusEffective, 'experimental_ladder_unreachable'), false)
assert.equal(has(run('entryTranchePlan', plan), 'minimum_executable_exceeds_cap'), false)

/**
 * ── The weight comes out of the arithmetic, and 20% is above it (#226) ─────
 *
 * ⚠️ This is the assertion the issue asks for by name: *«never automatically
 * 20%».* The old `rawWeight` was `(expected / |downside|) × conviction`, which
 * exceeds 1.0 at any reward-risk of 2 above half conviction, so every candidate
 * that reached a cap was sized at it. The quarter-Kelly arithmetic answers a
 * weight instead, and the Mandate is the ceiling above it.
 */
const sizedShape = { ...issueBook, mandatePositionCap: 0.2, researchGate: 'passed', challengeVerdict: 'cleared', thesis: mainLaneThesis, maturityStatus: 'insufficient' }
const kogasLike = run('targetWeight', { ...sizedShape, expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.35 })
assert.equal(kogasLike.data.sizing.mode, 'quarter-kelly')
assert.equal(kogasLike.data.sizing.kellyFraction, 0.25)
assert.equal(kogasLike.data.sizing.rewardRisk, 2.08333333)
assert.equal(kogasLike.data.targetWeight, 0.07916667)
assert.equal(kogasLike.data.bindingCap, 0.2, 'the Mandate is the ceiling and it is not what answered')
assert.ok(kogasLike.data.targetWeight < kogasLike.data.bindingCap, '⛔ the cap is never the answer by default')
assert.ok(kogasLike.data.targetWeight > measuredMinimum.data.minimumWeight, 'and it is above the USD 200 minimum ticket — USD 1,182 against the USD 149.37 the lane produced')
// The same inputs at a lower conviction: the arithmetic shrinks the position rather than a lane doing it.
assert.equal(run('targetWeight', { ...sizedShape, expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.33 }).data.targetWeight, 0.0175)
// A non-positive edge is zero, not a token position.
const noEdge = run('targetWeight', { ...sizedShape, expectedActiveReturn: 0.1, downsideReturn: -0.12, conviction: 0.3 })
assert.ok(has(noEdge, 'position_edge_not_positive'))
assert.equal(noEdge.data.targetWeight, 0)
// A weight the arithmetic put under the venue minimum is refused, never rounded up to it.
const belowTicket = run('targetWeight', { ...sizedShape, expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.328 })
assert.ok(belowTicket.data.rawWeight > 0 && belowTicket.data.rawWeight < measuredMinimum.data.minimumWeight)
assert.ok(has(belowTicket, 'minimum_executable_not_met'))
assert.equal(belowTicket.diagnostics.find((row) => row.code === 'minimum_executable_not_met').severity, 'blocked')
assert.equal(belowTicket.data.targetWeight, null, '⛔ refused rather than lifted to the floor — the direction #226 insists on')
// An unchecked variant view produces no weight at all.
const uncheckedWeight = run('targetWeight', { ...issueBook, mandatePositionCap: 0.2, researchGate: 'passed', challengeVerdict: 'cleared', expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.35 })
assert.ok(has(uncheckedWeight, 'variant_view_required_for_position'))
assert.equal(uncheckedWeight.data.targetWeight, null)
// `maturityStatus` sizes nothing: the four values answer identically.
const byMaturity = ['insufficient', 'observing', 'reviewable', 'promoted'].map((maturityStatus) =>
  run('targetWeight', { ...sizedShape, maturityStatus, expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.35 }).data.targetWeight)
assert.deepEqual(byMaturity, [0.07916667, 0.07916667, 0.07916667, 0.07916667], '⛔ maturity is an attribution label and no longer a size multiplier')
// And its absence is no longer a diagnostic, because nothing reads it.
assert.equal(has(run('targetWeight', { ...sizedShape, maturityStatus: undefined, expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.35 }), 'maturity_status_invalid'), false)
assert.ok(has(run('targetWeight', { ...sizedShape, maturityStatus: 'graduated', expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.35 }), 'maturity_status_invalid'))
// Sector headroom still binds — nothing here is an exemption from concentration.
assert.equal(run('targetWeight', { ...sizedShape, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, sectorHeadroom: 0.04 }).data.targetWeight, 0.04)
// The risk budget binds through `targetWeight` too, and the disclosure travels with it.
const budgetedWeight = run('targetWeight', { ...sizedShape, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, ...riskInputs })
assert.equal(budgetedWeight.data.effectivePositionCap, 0.1875)
assert.equal(budgetedWeight.data.targetWeight, 0.1875)
assert.equal(budgetedWeight.data.positionCapUnlocksAt, 'portfolioHeat')
assert.deepEqual(budgetedWeight.data.disclosures.map((row) => row.code), ['position_cap_reduced_below_declared', 'cap_raise_would_unlock'])
/** ⚠️ And so does the recommendation, for the same reason: a run that only calls `targetWeight` still sees it (#230). */
assert.equal(budgetedWeight.data.unlockDelta.field, 'maxDrawdown')
assert.equal(budgetedWeight.data.unlockDelta.control, '포트폴리오 히트')

/**
 * ── The old config key still reads, and says it was renamed (#226) ─────────
 */
const oldKey = run('minimumExecutableWeight', { portfolioNav: 14937.07, portfolioNavCurrency: 'USD', experimentalPositionFloor: { USD: 200, KRW: 300000 }, positionCurrency: 'USD' })
assert.equal(oldKey.data.minimumWeight, 0.01338951, 'the same number under the pre-#226 spelling')
assert.equal(oldKey.data.keyRead, 'experimentalPositionFloor')
assert.ok(has(oldKey, 'minimum_executable_key_renamed'))
assert.equal(oldKey.diagnostics.find((row) => row.code === 'minimum_executable_key_renamed').severity, 'info', 'a rename is not a refusal')
assert.equal(has(measuredMinimum, 'minimum_executable_key_renamed'), false)
// An undeclared minimum is unjudged rather than absent, and there is no ratio left to fall back on.
assert.ok(has(run('minimumExecutableWeight', { portfolioNav: 14937.07, portfolioNavCurrency: 'USD', positionCurrency: 'USD' }), 'minimum_executable_unevaluated'))
assert.equal(run('minimumExecutableWeight', { portfolioNav: 14937.07, portfolioNavCurrency: 'USD', positionCurrency: 'USD' }).data.minimumWeight, null)
// A bare amount names no venue and is refused by the published contract.
assert.ok(has(run('minimumExecutableWeight', { portfolioNav: 14937.07, portfolioNavCurrency: 'USD', positionCurrency: 'KRW', minimumExecutablePosition: 300000 }), 'input_shape_invalid'))

/**
 * ── `policyLint` does not stand in the way of this revision (#226 ⚠️2) ─────
 *
 * It judges *configuration* changes a run proposes, and the removed values were
 * `METHODOLOGY` constants it never saw. The one config key involved was
 * renamed, not moved: same number, same venue. ⚠️ Its declared direction is
 * reversed, and that is the honest reading — the minimum refuses now instead of
 * lifting a ceiling, so a larger one is the stricter manager and lowering it is
 * the relaxation `policyLint` exists to refuse.
 */
const unchangedFloor = run('policyLint', {
  current: { minimumExecutablePosition: { KRW: 300000, USD: 200 } },
  proposed: { minimumExecutablePosition: { KRW: 300000, USD: 200 } },
})
assert.equal(unchangedFloor.data.changeCount, 0, 'a rename with the same value is not a threshold change')
assert.equal(unchangedFloor.data.accepted, true)
const loweredFloor = run('policyLint', {
  current: { minimumExecutablePosition: { KRW: 300000, USD: 200 } },
  proposed: { minimumExecutablePosition: { KRW: 300000, USD: 100 } },
  provenance: { 'minimumExecutablePosition.USD': { approvedBy: 'investor', approvedAt: '2026-09-08T00:00:00Z' } },
})
assert.ok(has(loweredFloor, 'policy_auto_relax'), 'lowering the minimum is a run relaxing its own refusal')
const raisedFloor = run('policyLint', {
  current: { minimumExecutablePosition: { KRW: 300000, USD: 200 } },
  proposed: { minimumExecutablePosition: { KRW: 300000, USD: 300 } },
  provenance: { 'minimumExecutablePosition.USD': { approvedBy: 'investor', approvedAt: '2026-09-08T00:00:00Z' } },
})
assert.equal(raisedFloor.data.accepted, true)
assert.equal(raisedFloor.data.changes[0].effect, 'stricter')

/**
 * The cash floor: the investor declared 0.10 in fund settings and the package
 * used to hold its own 0.15 under `coreDca.reserveFloorWeight`.
 */
assert.equal(Object.hasOwn(configSchema.properties.coreDca.properties, 'reserveFloorWeight'), false, 'the package holds no second copy of the cash axis')
const floor = (input) => run('effectiveCashFloor', input)
const declaredFloor = floor({ mandateCashFloor: 0.1, cashWeight: 0.57, projectedCashWeight: 0.42 })
assert.equal(declaredFloor.data.declaredFloor, 0.1)
assert.equal(declaredFloor.data.effectiveFloor, 0.1)
assert.equal(declaredFloor.data.binding, 'mandate')
assert.equal(declaredFloor.data.headroomWeight, 0.32)
assert.equal(declaredFloor.data.breached, false)
assert.deepEqual(declaredFloor.data.effectiveConstraints, [])
// A plan that lands under the floor is refused; the Kernel refuses the same proposal.
const breaching = floor({ mandateCashFloor: 0.1, cashWeight: 0.57, projectedCashWeight: 0.08 })
assert.ok(has(breaching, 'cash_floor_breach'))
assert.equal(breaching.diagnostics.find((row) => row.code === 'cash_floor_breach').severity, 'blocked')
assert.equal(breaching.diagnostics.find((row) => row.code === 'cash_floor_breach').details.shortfall, 0.02)
// An undeclared floor is "nobody said", exactly as a missing concentration cap is.
const undeclaredFloor = floor({ cashWeight: 0.57, projectedCashWeight: 0.05 })
assert.ok(has(undeclaredFloor, 'cash_floor_unevaluated'))
assert.equal(undeclaredFloor.diagnostics.find((row) => row.code === 'cash_floor_unevaluated').severity, 'unevaluated')
assert.equal(undeclaredFloor.data.effectiveFloor, null)
assert.equal(undeclaredFloor.data.breached, null, 'an undeclared floor is unjudged, never passed')
// The floor is checked after the plan, not before it: the current weight cannot answer it.
assert.ok(has(floor({ mandateCashFloor: 0.1, cashWeight: 0.57 }), 'cash_floor_projection_missing'))
// A methodology floor above the declared one is disclosed on the host's own field.
const raised = floor({ mandateCashFloor: 0.1, projectedCashWeight: 0.2, methodologyCashFloors: [{ source: 'core-dca-reserve', weight: 0.15 }] })
assert.equal(raised.data.effectiveFloor, 0.15)
assert.deepEqual(raised.data.effectiveConstraints, [{ field: 'cashFloor', declared: 0.1, effective: 0.15, reason: 'methodology_floor_core-dca-reserve' }])
assert.ok(has(raised, 'cash_floor_raised_by_methodology'))
assert.ok(has(floor({ mandateCashFloor: 0.1, projectedCashWeight: 0.2, methodologyCashFloors: [{ source: 'core-dca-reserve', weight: 0.15 }], effectiveConstraints: [] }), 'cash_floor_raise_undisclosed'))
assert.equal(has(floor({ mandateCashFloor: 0.1, projectedCashWeight: 0.2, methodologyCashFloors: [{ source: 'core-dca-reserve', weight: 0.15 }], effectiveConstraints: raised.data.effectiveConstraints }), 'cash_floor_raise_undisclosed'), false)
// And this methodology declares no such floor today, so the row is empty rather than silent.
assert.deepEqual(METHODOLOGY.methodologyCashFloors, [])

/**
 * #153 §3: the total the investor's own numbers leave, and the discipline that
 * makes the samples arrive.
 *
 * Same book, same declarations — NAV USD 14,866.44, 57% cash, `cashFloor` 0.10,
 * `maxPositionWeight` 0.20, **`maxDrawdown` undeclared** — plus the source's
 * approved exit rule: 40 trading days and −8%, the second of which was computed
 * against the control arm's 1% cell and is not carried anywhere else unchanged.
 */
const budget = (extra = {}) => run('singleNameBudget', { mandateCashFloor: 0.1, mandatePositionCap: 0.2, ...extra })

// The total is what the Mandate's own cash floor leaves, and nothing else.
const emptyBook = budget()
assert.equal(emptyBook.data.deployableWeight, 0.9)
assert.equal(emptyBook.data.perNameCap, 0.2)
assert.equal(emptyBook.data.source, 'mandate-derived')
assert.equal(emptyBook.data.portedTotalCap, null, "the source's 28% is not ported and its absence is a decision")
assert.equal(has(emptyBook, 'single_name_budget_unevaluated'), false)
// A tighter floor is a smaller lane, with no package constant in the way.
assert.equal(budget({ mandateCashFloor: 0.5 }).data.deployableWeight, 0.5)
// Either Mandate number missing is "nobody said", never an unlimited lane.
for (const missing of [{ mandateCashFloor: undefined }, { mandatePositionCap: undefined }]) {
  const undeclared = run('singleNameBudget', { mandateCashFloor: 0.1, mandatePositionCap: 0.2, ...missing })
  assert.ok(has(undeclared, 'single_name_budget_unevaluated'))
  assert.equal(undeclared.diagnostics.find((row) => row.code === 'single_name_budget_unevaluated').severity, 'unevaluated')
}
// The 57% cash book: held singles against the deployable range, and what is left.
const deployed = budget({ positions: [{ symbol: '035420', weight: 0.2 }, { symbol: '036460', weight: 0.13 }, { symbol: 'SGOV', weight: 0.1, parkedLiquidity: true }, { symbol: '069500', weight: 0.1, core: true }] })
assert.equal(deployed.data.heldSingleNameWeight, 0.33, 'core and parked rows are not single names')
assert.equal(deployed.data.remainingWeight, 0.57)
// Over the range and adding is refused; over it and standing still is carried.
const over = budget({ positions: [{ symbol: 'A', weight: 0.9 }], proposed: [{ symbol: 'B', weight: 0.1 }] })
assert.ok(has(over, 'single_name_budget_exceeded'))
assert.equal(over.diagnostics.find((row) => row.code === 'single_name_budget_exceeded').severity, 'blocked')
const carriedOver = budget({ positions: [{ symbol: 'A', weight: 0.95 }] })
assert.ok(has(carriedOver, 'single_name_budget_carried'))
assert.equal(has(carriedOver, 'single_name_budget_exceeded'), false, 'a trim is never the thing refused')
// ⛔ The control arm has no budget of its own since #226: every single name spends inside this one.
assert.equal(budget({}).data.controlArmRemainingWeight, undefined)
assert.equal(budget({}).data.controlArmLaneTotalMaxWeight, undefined)
assert.ok(has(budget({ controlArmWeight: 0.02 }), 'input_key_unread'), 'and a run that still declares the lane weight is told nothing reads it')

/**
 * The exit discipline. `time_stop_reached` reads the entry date and nothing
 * else — no `reviewBy`, no catalyst, no benchmark.
 */
const entered = (extra = {}) => run('exitDiscipline', { symbol: 'DKS', lane: 'control-arm', entryDate: '2026-07-01', entryPrice: 100, price: 99, ...extra })
const held47 = entered()
assert.equal(held47.data.timeStop.timeStopTradingDays, 40, "the source's approved holding period")
assert.equal(held47.data.timeStop.tradingDaysHeld, 47)
assert.equal(held47.data.timeStop.reached, true)
assert.ok(has(held47, 'time_stop_reached'))
assert.equal(held47.data.action, 'SELL')
// Nothing about the thesis is consulted: no review date is passed anywhere above.
assert.equal(has(entered({ entryDate: '2026-08-25' }), 'time_stop_reached'), false)
// A position with no entry date is unjudged, never "not reached".
const noEntry = run('exitDiscipline', { symbol: 'DKS', lane: 'control-arm', entryPrice: 100, price: 99 })
assert.ok(has(noEntry, 'exit_discipline_unevaluated'))
assert.equal(noEntry.data.timeStop.reached, null)
// A caller with a real session calendar overrides the weekday approximation.
assert.equal(entered({ tradingDaysHeld: 12 }).data.timeStop.basis, 'caller-trading-calendar')
assert.equal(has(entered({ tradingDaysHeld: 12 }), 'time_stop_basis_approximated'), false)

// The control arm keeps the source's −8%, because that is the cell it was computed for.
assert.equal(METHODOLOGY.exitDiscipline.timeStopTradingDays, 40)
assert.equal(METHODOLOGY.exitDiscipline.maximumHardStopPct, -0.08)
assert.equal(METHODOLOGY.controlArm.hardStopPct, METHODOLOGY.exitDiscipline.maximumHardStopPct, 'one copy, two readers')
const armStop = entered({ price: 91 })
assert.equal(armStop.data.hardStop.stopPct, -0.08)
assert.equal(armStop.data.hardStop.stopLevel, 92)
assert.equal(armStop.data.hardStop.source, 'control-arm-approved')
assert.ok(has(armStop, 'hard_stop_breached'))

/**
 * ⛔ The main lane does not inherit −8%: `maxDrawdown` is undeclared on this
 * book, so there is nothing to derive from and nothing is invented.
 */
const mainLaneStop = run('exitDiscipline', { symbol: '035420', lane: 'main', entryDate: '2026-08-25', entryPrice: 100, price: 99, positionWeight: 0.2 })
assert.equal(mainLaneStop.data.hardStop.stopPct, null)
assert.equal(mainLaneStop.data.hardStop.breached, null, 'unjudged on this axis, not unstopped')
assert.ok(has(mainLaneStop, 'hard_stop_unevaluated'))
const unevaluatedStop = mainLaneStop.diagnostics.find((row) => row.code === 'hard_stop_unevaluated')
assert.equal(unevaluatedStop.severity, 'unevaluated')
assert.equal(unevaluatedStop.details.unlocksWith, 'mandate.constraints.maxDrawdown', 'the diagnostic names what resolves it')
// Declared, it is derived from the heat budget left for this position's weight.
const derived = run('exitDiscipline', { symbol: '035420', lane: 'main', entryDate: '2026-08-25', entryPrice: 100, price: 99, positionWeight: 0.2, mandateMaxDrawdown: 0.06, heldPortfolioHeat: 0.05 })
assert.equal(derived.data.hardStop.stopPct, -0.05, '(0.06 − 0.05) / 0.20')
assert.equal(derived.data.hardStop.source, 'mandate-max-drawdown')
assert.equal(derived.data.hardStop.stopLevel, 95)
// ⛔ The derivation only tightens: −8% stays the ceiling on the answer.
assert.equal(run('exitDiscipline', { symbol: '035420', lane: 'main', entryDate: '2026-08-25', entryPrice: 100, price: 99, positionWeight: 0.2, mandateMaxDrawdown: 0.5 }).data.hardStop.stopPct, -0.08)
// A registered stop wider than the derived bound is refused before it can fire.
const tooWide = run('exitDiscipline', { symbol: '035420', lane: 'main', entryDate: '2026-08-25', entryPrice: 100, price: 99, positionWeight: 0.2, mandateMaxDrawdown: 0.06, heldPortfolioHeat: 0.05, registration: { stopPct: 0.08, reviewBy: '2026-10-20' } })
assert.ok(has(tooWide, 'hard_stop_exceeds_budget'))
assert.equal(tooWide.diagnostics.find((row) => row.code === 'hard_stop_exceeds_budget').severity, 'blocked')

// Registration happens at entry or the entry is refused, and it is two WATCH rows.
const unregistered = entered({ entryDate: '2026-08-25', registration: { reviewBy: '2026-10-20' } })
assert.ok(has(unregistered, 'exit_rules_unregistered'))
assert.deepEqual(unregistered.diagnostics.find((row) => row.code === 'exit_rules_unregistered').details.missing, ['stop'])
assert.equal(has(entered({ entryDate: '2026-08-25', registration: { stopPct: 0.08, reviewBy: '2026-10-20' } }), 'exit_rules_unregistered'), false)
const freshEntry = entered({ entryDate: '2026-08-25' })
assert.deepEqual(freshEntry.data.watchesToRegister.map((row) => row.kind), ['price-below', 'at-time'])
assert.equal(freshEntry.data.watchesToRegister[1].at, freshEntry.data.timeStop.dueAt, 'the dated row is the time stop itself')
for (const watch of freshEntry.data.watchesToRegister) {
  assert.equal(run('validateWatch', { watch: { ...watch, symbol: 'DKS' }, current: { price: 99 } }).status, 'ok', 'the rows an entry copies are rows validateWatch accepts')
}
// A due stop the proposal does not act on is the prose this replaced.
assert.equal(entered().data.exitProposed, null, 'unjudged before the proposal exists')
assert.equal(has(entered(), 'exit_due_unactioned'), false)
assert.ok(has(entered({ proposedExits: [] }), 'exit_due_unactioned'))
assert.equal(entered({ proposedExits: [] }).diagnostics.find((row) => row.code === 'exit_due_unactioned').severity, 'blocked')
assert.equal(has(entered({ proposedExits: ['DKS'] }), 'exit_due_unactioned'), false)
assert.equal(has(entered({ proposedExits: [{ symbol: 'DKS' }] }), 'exit_due_unactioned'), false)

/**
 * And where the closed outcome lands once the discipline produces one.
 */
const closed = run('closedOutcomeSamples', {
  outcomes: [
    { decisionId: 'dec-1', lens: 'mean-reversion', closedAt: '2026-08-03', activeReturnPct: -3.2 },
    { decisionId: 'dec-2', lens: 'mean-reversion', closedAt: '2026-08-20', grossReturnPct: 2, benchmarkReturnPct: 1 },
    { decisionId: 'dec-3', lens: 'mean-reversion', closedAt: '2026-08-24' },
    { decisionId: 'dec-4', closedAt: '2026-08-25', activeReturnPct: 1 },
    { decisionId: 'dec-5', lens: 'mean-reversion', activeReturnPct: 1 },
  ],
})
assert.equal(closed.data.accepted, 2)
assert.deepEqual(closed.data.samples.map((row) => row.activeReturn), [-0.032, 0.01], 'percent in, fraction out')
assert.equal(closed.diagnostics.filter((row) => row.code === 'closed_outcome_sample_incomplete').length, 3)
assert.deepEqual([...closed.data.rejected.map((row) => row.reason)].sort(), ['no-active-return', 'no-close-date', 'no-lens'])
assert.equal(closed.data.maturityStatus, 'insufficient', 'two samples is not a lens')
// ⛔ The axis boundary is stated every run, because pooling is silent when it happens.
assert.ok(has(closed, 'closed_outcome_not_a_paper_sample'))
assert.deepEqual(closed.data.reaches, ['calibrationSummary', 'learning/evidence-maturity'])
assert.deepEqual(closed.data.doesNotReach, ['promotionGate'])
assert.equal(closed.data.memoryKey, 'learning/evidence-maturity')
assert.equal(run('closedOutcomeSamples', { outcomes: [], lens: 'mean-reversion' }).data.memoryKey, 'calibration/mean-reversion')
// A future close is refused rather than counted.
assert.ok(has(run('closedOutcomeSamples', { outcomes: [{ decisionId: 'dec-6', lens: 'mean-reversion', closedAt: '2099-01-01', activeReturnPct: 1 }] }), 'closed_outcome_post_as_of'))
// The samples it produces are the ones calibrationSummary counts.
assert.equal(run('calibration', { samples: closed.data.samples }).data.sampleCount, 2)
// And promotionGate still counts only matured paper windows, which these are not.
assert.equal(run('promotionGate', { rows: closed.data.samples }).data.byRuleVersion?.length ?? 0, 0)

console.log('evidence-gated issues #145–153 regression tests passed')

/**
 * ── #158: the shape is published, and a guess is refused (2026-09-06) ──────
 *
 * Every malformed call below is one a real flow actually sent. Fixing them as
 * cases is the point: the dominant pattern in this package's memory is *"a
 * wrong input is not refused and comes back looking like a pass"*, and the only
 * defence against it that does not decay is a published contract with a test
 * that the wrong shape is refused rather than answered.
 */
const contracts = run('inputContracts').data
const supported = execute({ operation: null, asOf }).diagnostics[0].details.supported
assert.deepEqual(
  Object.keys(contracts.contracts).sort(),
  [...supported].sort(),
  'every registered operation publishes its input shape — the eleven were the ones #147 reached, not a principle',
)
assert.equal(contracts.operationCount, supported.length)
for (const [operation, contract] of Object.entries(contracts.contracts)) {
  assert.ok(['strict', 'named', 'open'].includes(contract.mode), `${operation} declares what an unknown key costs`)
  assert.deepEqual(Object.keys(contract.keys), contracts.keys[operation], 'the published key list is the contract it came from')
}
for (const operation of ['nextReviewSequence', 'coverage', 'specialistBudget', 'minimumExecutableWeight', 'exitDiscipline', 'laneCoverage', 'harnessAudit']) {
  assert.ok(contracts.guarded.includes(operation), `${operation} is a gate and refuses a key it does not read`)
}
// The nested shapes a key list cannot show are published too — both of the two that cost a run.
assert.deepEqual(Object.keys(contracts.nested.nextReviewSequence['config.schedule']), ['krCloseBufferMinutes', 'usCloseBufferMinutes'])
assert.deepEqual(Object.keys(contracts.nested.harnessAudit['researchActivity[]']), ['source', 'granted', 'attempts', 'succeeded'])
/**
 * #156 changed two signatures, so the published contract had to move with them
 * — a contract that still advertised `journalArmed: ARRAY` would keep sending
 * runs at the reading this version refuses.
 */
assert.deepEqual(Object.keys(contracts.nested.harnessAudit['positions[].origin']), ['decisionId', 'asOf'])
assert.equal(contracts.contracts.harnessAudit.keys.totalDecisions, 'number')
assert.ok(/never a statement that the window is whole/.test(contracts.nested.harnessAudit.totalDecisions), 'and the published contract says what an absent face means, which is the half a type cannot carry')
assert.equal(contracts.contracts.reconcileArmedReviews.keys.journalArmed, 'any', 'the refused parameter stays published so it can be named rather than silently dropped')
// #201: and the report-only one is published, because a strict operation refuses what it does not declare.
assert.equal(contracts.contracts.reconcileArmedReviews.keys.standingPlans, 'array')
assert.ok(contracts.keys.reconcileArmedReviews.includes('standingPlans'))
assert.ok(contracts.guarded.includes('refutedMemoryRules'))
// ⚠️ `memory` joined it in #160: the second refuted rule is filed under `run/theme-radar-last`.
assert.deepEqual(contracts.keys.refutedMemoryRules, ['patterns', 'memory'])

/**
 * The five shapes the 2026-09-06 orchestrator sent to `nextReviewSequence`.
 * Each was answered `next_market_session_missing` at a `path` of `sessions` —
 * a key the operation does not have — so the diagnostic sent the caller looking
 * for a shape that could not exist, five times.
 */
const guessedSequences = [
  { sessions: [{ market: 'kr', date: '2026-09-08', close: '15:30' }] },
  { market: 'kr', closeAt: '2026-09-08T06:30:00Z' },
  { krSession: { date: '2026-09-08' }, usSession: { date: '2026-09-08' } },
  { calendar: { XKRX: [{ session_date: '2026-09-08', close_time: '15:30' }] } },
  { sessions: { kr: { date: '2026-09-08' }, us: { date: '2026-09-08' } } },
]
for (const input of guessedSequences) {
  const answer = run('nextReviewSequence', input)
  assert.equal(answer.status, 'blocked', 'a guessed shape is refused rather than answered from defaults')
  assert.ok(has(answer, 'input_shape_invalid'))
  assert.equal(answer.data, null)
  assert.equal(has(answer, 'next_market_session_missing'), false, 'and never with a diagnostic pointing at a key the operation has not got')
}
// The true shape, and a diagnostic that names the key it is actually about.
const krOnly = run('nextReviewSequence', { krSessions: [{ isOpen: true, date: '2026-09-08', closeLocal: '15:30', timeZone: 'Asia/Seoul' }] })
assert.equal(krOnly.data.sequence[0].flow, 'kr-sleeve')
assert.deepEqual(
  krOnly.diagnostics.filter((row) => row.code === 'next_market_session_missing').map((row) => row.path),
  ['usSessions'],
  'the empty side is named by the key that would fill it',
)
// ⛔ #91 from the caller's side: the buffers live under config.schedule.
const misplacedBuffers = run('nextReviewSequence', {
  krSessions: [{ isOpen: true, date: '2026-09-08', closeLocal: '15:30', timeZone: 'Asia/Seoul' }],
  config: { krCloseBufferMinutes: 30, usCloseBufferMinutes: 45 },
})
assert.equal(misplacedBuffers.status, 'blocked', 'the package must not answer with its own 30/45 while the investor believes theirs ran')
assert.deepEqual(misplacedBuffers.diagnostics.find((row) => row.code === 'input_shape_invalid').details.misplaced, ['krCloseBufferMinutes', 'usCloseBufferMinutes'])
// Nested correctly, the investor's numbers run and the answer says whose they were.
const configured = run('nextReviewSequence', {
  krSessions: [{ isOpen: true, date: '2026-09-08', closeLocal: '15:30', timeZone: 'Asia/Seoul' }],
  usSessions: [{ isOpen: true, date: '2026-09-08', closeLocal: '16:00', timeZone: 'America/New_York' }],
  config: { schedule: { krCloseBufferMinutes: 20, usCloseBufferMinutes: 50 } },
})
assert.deepEqual(configured.data.buffers, { kr: 20, us: 50 })
assert.deepEqual(configured.data.bufferSource, { kr: 'config.schedule.krCloseBufferMinutes', us: 'config.schedule.usCloseBufferMinutes' })
assert.equal(has(configured, 'schedule_buffer_defaulted'), false)
// Declared nowhere, the package default still runs — and stops being silent about it.
const defaulted = run('nextReviewSequence', { krSessions: [{ isOpen: true, date: '2026-09-08', closeLocal: '15:30', timeZone: 'Asia/Seoul' }] })
const defaultNote = defaulted.diagnostics.find((row) => row.code === 'schedule_buffer_defaulted')
assert.equal(defaultNote.severity, 'info', 'a default that ran is a report, never a stop')
assert.deepEqual(defaultNote.details.applied, { kr: 30, us: 45 })

/**
 * `coverage`: an array of objects used to leak a raw `TypeError` as the
 * diagnostic, and two markets in two elements used to raise a `universe_drift`
 * that was never drift. The second is the likely origin of the standing
 * "US universe_drift unresolved" item Brief v6 has been carrying.
 */
const objectRows = run('coverage', { scannerUniverses: [{ scanner: 'kr-momentum', symbols: ['005930', '000660'] }] })
assert.equal(objectRows.status, 'blocked')
assert.ok(has(objectRows, 'input_shape_invalid'))
assert.equal(has(objectRows, 'operation_failed'), false, 'a shape mismatch is refused by name, never by whatever the arithmetic threw')
assert.match(objectRows.diagnostics[0].message, /one array of symbols per scanner over the same market/)
const twoMarkets = run('coverage', { scannerUniverses: [['005930', '000660'], ['DKS', 'AAPL']], holdings: ['005930'] })
assert.ok(has(twoMarkets, 'universe_markets_mixed'), 'two markets are two calls, and this is not drift')
assert.equal(has(twoMarkets, 'universe_drift'), false)
assert.deepEqual(twoMarkets.diagnostics.find((row) => row.code === 'universe_markets_mixed').details.overlap, [0])
// Real drift — same market, one scanner short a name — still fires under its own code.
const realDrift = run('coverage', { scannerUniverses: [['005930', '000660'], ['005930']], holdings: ['005930'] })
assert.ok(has(realDrift, 'universe_drift'))
assert.equal(has(realDrift, 'universe_markets_mixed'), false)
// And `asOf` reaches the operation now, so a disposition whose revisit date has passed is uncovered.
assert.deepEqual(
  run('coverage', { scannerUniverses: [['005930']], dispositions: [{ symbol: '005930', revisitAt: '2026-08-01' }] }).data.uncovered,
  ['005930'],
  'a revisit date in the past is a disposition that has expired, and the operation never saw asOf to notice',
)

/**
 * `specialistBudget`: three spellings of the budget key, all answered
 * `sleeve_budget_missing` at a path of `input`, and `withinBriefBudget` left
 * `null` — so the sleeve's compliance with its own budget went unchecked.
 */
for (const key of ['sleeveBudget', 'briefBudgetWeight', 'budgetWeight']) {
  const answer = run('specialistBudget', { flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.18, [key]: 0.3, requestedTargetWeight: 0.02 })
  assert.equal(answer.status, 'blocked', `${key} is refused rather than defaulted away`)
  assert.match(answer.diagnostics[0].message, /sleeveBudgetWeight/)
}
const budgetShort = run('specialistBudget', { flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.18, requestedTargetWeight: 0.02 })
assert.ok(has(budgetShort, 'sleeve_budget_missing'))
const budgetDiagnostic = budgetShort.diagnostics.find((row) => row.code === 'sleeve_budget_missing')
assert.deepEqual(budgetDiagnostic.details.missing, ['sleeveBudgetWeight'])
assert.equal(budgetDiagnostic.path, 'sleeveBudgetWeight', 'the path names the key, not the whole input')
assert.equal(run('specialistBudget', { flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.18, sleeveBudgetWeight: 0.3, requestedTargetWeight: 0.02 }).data.withinBriefBudget, true)

/**
 * #158: the KRW leg, which returned `floorAmount: null`, `binding: 'ratio'`,
 * status `ok` and no diagnostic at all. The minimum is declared **per venue
 * currency** and the leg had passed a bare amount; the arithmetic it wanted was
 * KRW 300,000 → 0.0149. ⚠️ The operation is `minimumExecutableWeight` since
 * #226 and there is no ratio left to fall back to, which makes the silent-pass
 * shape this issue is about structurally unreachable — the case is kept because
 * the per-venue shape is what it was really about.
 */
const bareFloor = run('minimumExecutableWeight', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'KRW', minimumExecutablePosition: 300000, usdKrw: 1352.5 })
assert.equal(bareFloor.status, 'blocked', 'a bare amount names no venue, and answering it with a number computed from defaults is the silent pass this issue is about')
assert.deepEqual(
  bareFloor.diagnostics.filter((row) => row.code === 'input_shape_invalid').map((row) => row.path).sort(),
  ['input.minimumExecutablePosition', 'input.usdKrw'],
  'both halves of the KRW leg are named: the minimum is a per-currency map and the rate is fx.USDKRW',
)
// Declared per venue, with the rate where the contract says it is, the leg answers.
const krwLeg = run('minimumExecutableWeight', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'KRW', minimumExecutablePosition: { USD: 200, KRW: 300000 }, fx: { USDKRW: 1352.5 } })
assert.equal(krwLeg.data.minimumAmount, 300000)
assert.equal(krwLeg.data.minimumWeight, 0.01492028, '300,000 / 1352.5 / 14,866.44')
// The USD leg is unchanged, and it is the one that always worked.
const usdLeg = run('minimumExecutableWeight', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'USD', minimumExecutablePosition: { USD: 200, KRW: 300000 } })
assert.equal(usdLeg.data.minimumWeight, 0.01345312)
// No minimum declared at all is unjudged, said out loud rather than implied.
const ratioOnly = run('minimumExecutableWeight', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'USD' })
assert.equal(ratioOnly.data.minimumWeight, null)
assert.ok(has(ratioOnly, 'minimum_executable_unevaluated'))

/**
 * ── #158 ⑷: the block the documents promised, fired where entries are ──────
 *
 * `skills/deterministic-metrics` and `PROMPT.md` §1b both say an entry with no
 * registered stop and review date is refused, and omitting `registration`
 * returned `given: false` and nothing else. #155's "omission is unadjudicated"
 * is right for the call this makes every run — the sweep over holdings, whose
 * registration this manager cannot read back at all (#97) — so the two calls
 * are separated by saying which one is being made, and the unstated case is
 * reported instead of passing.
 */
const holdingReview = run('exitDiscipline', { symbol: 'DKS', lane: 'control-arm', entryDate: '2026-08-25', entryPrice: 100, price: 99, entryProposed: false })
assert.equal(has(holdingReview, 'exit_rules_unregistered'), false, 'a holding review is not refused for a registration nothing can hand back')
assert.equal(has(holdingReview, 'exit_registration_unjudged'), false)
assert.equal(holdingReview.data.registration.judged, null)
const newEntry = run('exitDiscipline', { symbol: 'DKS', lane: 'control-arm', entryDate: '2026-08-25', entryPrice: 100, price: 99, entryProposed: true })
assert.equal(newEntry.status, 'blocked', 'an entry registers its stop and review date or it is not an entry')
assert.ok(has(newEntry, 'exit_rules_unregistered'))
assert.equal(newEntry.data.registration.judged, false)
const unstatedEntry = run('exitDiscipline', { symbol: 'DKS', lane: 'control-arm', entryDate: '2026-08-25', entryPrice: 100, price: 99 })
assert.ok(has(unstatedEntry, 'exit_registration_unjudged'), 'the rule not being applied is itself in the answer')
assert.equal(unstatedEntry.diagnostics.find((row) => row.code === 'exit_registration_unjudged').severity, 'unevaluated')
assert.equal(unstatedEntry.data.registration.judged, null)
// A complete registration is judged whether or not the caller said which call this is.
assert.equal(run('exitDiscipline', { symbol: 'DKS', lane: 'control-arm', entryDate: '2026-08-25', entryPrice: 100, price: 99, entryProposed: true, registration: { stopPct: 0.08, reviewBy: '2026-10-20' } }).data.registration.judged, true)

/**
 * ── #157: `succeeded` reads as a count and was a boolean ───────────────────
 *
 * The controlled `kr-sleeve` run: integers gave three `lane_query_failed` and
 * a `warningCount` of 6, booleans gave none and 3, and every other byte was
 * identical — three routes that all answered, reported as three that had not.
 */
const threeRoutes = (mode) => [
  { source: 'web', granted: true, attempts: 10, succeeded: mode === 'count' ? 3 : true },
  { source: 'open-dart', granted: true, attempts: 4, succeeded: mode === 'count' ? 4 : true },
  { source: 'toss-market', granted: true, attempts: 2, succeeded: mode === 'count' ? 2 : true },
]
const counted = run('harnessAudit', { researchActivity: threeRoutes('count') })
const flagged = run('harnessAudit', { researchActivity: threeRoutes('flag') })
assert.equal(counted.diagnostics.filter((row) => row.code === 'lane_query_failed').length, 0, 'a route that answered three of ten queries did not fail')
assert.equal(counted.data.warningCount, flagged.data.warningCount, 'the integer and the boolean describe the same run and must report the same one')
// ⚠️ And the count is kept, because "3 of 10" is worth reporting.
const partialLane = counted.diagnostics.find((row) => row.code === 'lane_query_partial')
assert.equal(partialLane.severity, 'info', 'a partial lane is a note and never a warning')
assert.deepEqual([partialLane.details.attempts, partialLane.details.successCount], [10, 3])
assert.equal(counted.data.noteCount, 1)
// ⛔ The pair §2b asks to be kept apart: no attempt, against attempted and empty.
const notQueried = run('harnessAudit', { researchActivity: [{ source: 'web', granted: true, attempts: 0, succeeded: 0 }] })
assert.ok(has(notQueried, 'lane_not_queried'))
assert.equal(has(notQueried, 'lane_query_failed'), false, 'zero attempts is not a failed query')
const emptyAnswer = run('harnessAudit', { researchActivity: [{ source: 'web', granted: true, attempts: 3, succeeded: 0 }] })
assert.ok(has(emptyAnswer, 'lane_query_failed'), 'zero successes over three attempts is a failed lane, and the integer zero says so')
assert.equal(has(emptyAnswer, 'lane_not_queried'), false)
assert.equal(
  run('harnessAudit', { researchActivity: [{ source: 'web', granted: true, attempts: 3, succeeded: false }] }).diagnostics.filter((row) => row.code === 'lane_query_failed').length,
  1,
  'the boolean false is the same fact and reads the same way',
)
// A count above the attempts that produced it is refused rather than clamped into a reading.
const incoherent = run('harnessAudit', { researchActivity: [{ source: 'web', granted: true, attempts: 2, succeeded: 5 }] })
assert.equal(incoherent.status, 'blocked')
assert.ok(has(incoherent, 'input_shape_invalid'))
// `laneCoverage` reads the same field and had the same defect.
const laneSources = { toss: { status: 'fresh' }, web: { status: 'available' } }
const laneCounted = run('laneCoverage', { lane: 'kr', intent: 'holding-news', sources: laneSources, activity: { web: { attempts: 10, succeeded: 3 } } })
assert.deepEqual(laneCounted.data.failed, [], 'three usable responses out of ten is not a failed lane here either')
assert.deepEqual(laneCounted.data.partial, ['web'])
assert.equal(laneCounted.data.action, 'CONTINUE')
assert.deepEqual(run('laneCoverage', { lane: 'kr', intent: 'holding-news', sources: laneSources, activity: { web: { attempts: 10, succeeded: 0 } } }).data.failed, ['web'])

/**
 * ── The class, rather than the instances (#158 ⑵) ──────────────────────────
 *
 * A raw exception reaching the caller as `operation_failed` is a shape mismatch
 * nobody wrote a sentence for. These are the ones that were leaking.
 */
for (const [operation, wrongShape] of [
  ['coverage', { scannerUniverses: [{ scanner: 'kr' }] }],
  /**
   * ⚠️ **This was `{ cash: { KRW: 1000 } }` until #212 ⑥.** The object is the
   * internal type now — per-currency cash arrives as it or as the
   * `{ currency, amount }` rows `portfolio.cashByCurrency` carries, and the two
   * are folded at the one input boundary — so it is read rather than refused.
   * What is still refused, and refused by name, is the shape that cannot be
   * either: a bare amount naming no currency, which is #174's aggregate.
   */
  ['sleeveNav', { cash: 5 }],
  ['opportunityUniverse', { rows: {} }],
  ['promotionGate', { rows: {} }],
  ['lensEnvelope', { lens: 'mean-reversion', triggers: {} }],
  ['validateAdjustment', { series: {} }],
  ['harnessAudit', { positions: {} }],
  ['concentration', { positions: {} }],
]) {
  const answer = run(operation, wrongShape)
  assert.equal(answer.status, 'blocked', `${operation} refuses the shape`)
  assert.ok(has(answer, 'input_shape_invalid'), `${operation} refuses it by name`)
  assert.equal(has(answer, 'operation_failed'), false, `${operation} does not hand a raw exception back as the explanation`)
}
// `validateAdjustment` was reading the whole input object as the series; it now reads its key.
const mixedBases = run('validateAdjustment', { series: [{ adjustment: 'split' }, { adjustment: 'none' }] })
assert.deepEqual([...mixedBases.data.bases].sort(), ['none', 'split'])
assert.ok(has(mixedBases, 'adjustment_basis_conflict'))

// A key the operation does not read is reported, not absorbed.
const unread = run('themeRadarDue', { lastThesisCallAt: '2026-09-01T00:00:00Z', expectedDue: true })
assert.ok(has(unread, 'input_key_unread'))
assert.equal(unread.diagnostics.find((row) => row.code === 'input_key_unread').path, 'input.expectedDue')
assert.equal(unread.status, 'unevaluated')
assert.equal(unread.data.due, true, 'the answer it did compute still stands; the caller is told which part of the call was not read')
// ⛔ And the invocation's asOf is not silently overruled by a second copy inside the input.
assert.ok(has(execute({ operation: 'themeRadarDue', asOf, input: { lastThesisCallAt: '2026-09-01T00:00:00Z', asOf: '2020-01-01T00:00:00Z' } }), 'input_shape_invalid'))
assert.equal(execute({ operation: 'themeRadarDue', asOf, input: { lastThesisCallAt: '2026-09-01T00:00:00Z', asOf } }).status, 'ok', 'a copy that agrees costs nothing')

console.log('evidence-gated issues #157-158 input-contract regression tests passed')

/**
 * ── #146: the fundamental branch has a feeding path, and it names its failures ──
 *
 * ⚠️ **Every vendor number below is a fixture, and none of it has been observed
 * against a live vendor.** No OpenDART or SEC key exists in the environment
 * this was written in. The shapes come from the vendors' own documentation and
 * from the 2026-09-06 run's recorded responses; ⛔ a vendor continuing to
 * answer the way its documentation says is not something these tests establish,
 * and #146 stays open until a run with keys reports a fed lane.
 *
 * The measured facts these pin, from `inst_6efcc6a0486a42478702a1c247e6d921`:
 * `researchUniverse` 74 KR / 83 US at `snapshotDate 2026-07-24`; `corp_code
 * 00126380` → `stock_code 005930`; three lanes 0 included / 13 excluded on
 * `no-valid-point-in-time-filing` and `no-event-in-the-last-30-days`.
 */
const feedAsOf = '2026-09-06T07:00:00Z'
const feedRun = (operation, input = {}) => execute({ operation, asOf: feedAsOf, input })
const feedHas = (answer, code) => answer.diagnostics.some((row) => row.code === code)

// The roster is here, and its argument is the sleeve rather than the MIC.
const krRoster = feedRun('researchUniverse', { market: 'kr' })
const usRoster = feedRun('researchUniverse', { market: 'us' })
assert.equal(krRoster.data.symbols.length, 74)
assert.equal(usRoster.data.symbols.length, 83)
assert.equal(krRoster.data.snapshotDate, '2026-07-24')
/**
 * ⚠️ **This asserted `blocked` until #212 ⑥.** The MIC was refused by four
 * leaves with the same sentence written four times, so a caller who reached for
 * the wrong one of the two published vocabularies had its whole calculation
 * refused. The MIC is the host's own spelling (aumos#571 made `MarketCode`
 * always an exchange), so the two are one fact and the conversion is total in
 * that direction: it is folded to the sleeve at the one input boundary and the
 * answer is the same answer, byte for byte, with an `info` naming the internal
 * spelling. ⛔ A value that is neither is still refused by the leaf.
 */
const micRoster = feedRun('researchUniverse', { market: 'XKRX' })
assert.equal(micRoster.status, 'ok', 'the MIC is read and converted rather than refused')
assert.deepEqual(micRoster.data, krRoster.data, 'and it is the same answer as the sleeve spelling, field for field')
assert.ok(micRoster.diagnostics.some((row) => row.code === 'market_spelling_alias' && row.severity === 'info' && row.path === 'market'), 'it says which spelling is internal rather than converting silently')
assert.equal(feedRun('researchUniverse', { market: 'KOSPI' }).status, 'blocked', 'a value that is neither spelling is still refused, by the leaf that owns the vocabulary')
const vocabulary = feedRun('inputContracts').data.vocabulary
assert.deepEqual(vocabulary.researchMarkets, ['kr', 'us'], 'the sleeve vocabulary is published beside the MIC list, which is what made the wrong one the obvious guess')
assert.deepEqual(vocabulary.markets, ['XKRX', 'XNAS', 'XNYS'])
assert.equal(vocabulary.marketToResearchMarket.XKRX, 'kr')

// The join that was missing: 005930 → 00126380, off the registry the run never requested.
const registry = feedRun('parseDartCorpCodes', { xml: '<result><list><corp_code>00126380</corp_code><corp_name>합성전자</corp_name><stock_code>005930</stock_code><modify_date>20260801</modify_date></list></result>' })
assert.equal(registry.data.rows[0].stockCode, '005930')
const mapped = feedRun('mapCorporationCodes', { market: 'kr', symbols: ['005930', '036460'], registryRows: registry.data.rows })
assert.equal(mapped.data.mapped[0].corporationCode, '00126380')
assert.equal(mapped.data.mapped[0].vendorId, '00126380', 'the host cache is keyed by the same id')
assert.deepEqual(mapped.data.unmapped, ['036460'])
assert.ok(feedHas(mapped, 'corp_code_unmapped_symbols'), 'a name the registry did not carry is reported, not dropped')
// ⛔ No registry at all is a different finding from a registry that matched nothing.
assert.ok(feedHas(feedRun('mapCorporationCodes', { market: 'kr', symbols: ['005930'] }), 'corp_code_registry_absent'))
assert.ok(feedHas(feedRun('mapCorporationCodes', { market: 'kr', symbols: ['005930'], registryRows: [{ stockCode: '000660', corporationCode: '00164779' }] }), 'corp_code_mapping_empty'))
// The `list.json` fallback carries the same pair when the ZIP cannot be decompressed.
assert.equal(feedRun('mapCorporationCodes', { market: 'kr', symbols: ['005930'], filingRows: [{ stockCode: '005930', corporationCode: '00126380' }] }).data.mapped.length, 1)
// US maps ticker → CIK, padded, off company_tickers.json's index-keyed object.
const usMapped = feedRun('mapCorporationCodes', { market: 'us', symbols: ['AAPL', 'DKS'], tickerRows: { 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } } })
assert.equal(usMapped.data.mapped[0].cik, '0000320193')
assert.deepEqual(usMapped.data.unmapped, ['DKS'])

/**
 * The plan reads the host cache's `state` — the field is `state`, not `status`
 * — and the four values are four findings rather than one empty payload.
 */
const planned = { symbol: '005930', corporationCode: '00126380' }
const cacheFor = (financials, filings) => ({ 'open-dart:financials:005930': financials, 'open-dart:filings:005930': filings })
const planInput = { market: 'kr', symbols: ['005930'], corporationCodes: [planned], businessYear: 2026, reportCode: 11012 }
const feedPlan = feedRun('fundamentalsPlan', { ...planInput, cache: cacheFor({ state: 'fresh', documents: [{}] }, { state: 'never-fetched' }) })
assert.equal(feedPlan.data.requests[0].step, 'corp-code-registry', 'the registry is planned first, because nothing below it can be addressed without it')
assert.equal(feedPlan.data.requests[0].tool, 'source_request', 'there is no cache document for the registry, so it stays a vendor request')
assert.equal(feedPlan.data.requests.find((row) => row.step === 'financials').action, 'read-cache')
assert.equal(feedPlan.data.requests.find((row) => row.step === 'financials').vendorId, '00126380')
assert.equal(feedPlan.data.requests.find((row) => row.step === 'filings').action, 'refresh-then-read')
assert.ok(feedHas(feedPlan, 'source_cache_never_fetched'), 'never-fetched is blind rather than empty and says so')
assert.equal(feedPlan.data.freshForSeconds, 604800)
assert.equal(feedRun('fundamentalsPlan', { ...planInput, freshForSeconds: 0 }).status, 'blocked', 'freshFor has no default here either')
assert.ok(feedHas(feedRun('fundamentalsPlan', planInput), 'source_cache_unreported'), 'an unreported cache state cannot be read as an empty one')
const failedRefresh = feedRun('fundamentalsPlan', { ...planInput, cache: cacheFor({ state: 'refresh-failed', cached: [{}] }, { state: 'refresh-failed', cached: [] }) })
assert.ok(feedHas(failedRefresh, 'source_cache_refresh_failed'))
assert.equal(failedRefresh.status, 'blocked')
// A fresh cache holding nothing is the vendor's answer, and is neither of the two above.
assert.ok(feedHas(feedRun('fundamentalsPlan', { ...planInput, cache: cacheFor({ state: 'fresh', documents: [] }, { state: 'fresh', documents: [] }) }), 'source_cache_fresh_and_empty'))
/**
 * ── `companyfacts` is keyed by the CIK, not the ticker (#179) ──────────────
 *
 * ⛔ **The assertion this replaces asserted the defect.** It read
 * `path === '/api/xbrl/companyfacts/DKS'` and passed, because the plan really
 * did paste the roster ticker into the vendor address. Measured 2026-09-07:
 * `/api/xbrl/companyfacts/INTC` → 404 `NoSuchKey`;
 * `/api/xbrl/companyfacts/CIK0000050863.json` → 200, 4,311,809 bytes. So the
 * US branch has the same shape as the KR one — registry first, then the names
 * whose filer id it supplied — and a name with no CIK is reported rather than
 * addressed with a ticker.
 */
const usUnmapped = feedRun('fundamentalsPlan', { market: 'us', symbols: ['DKS'] })
assert.equal(usUnmapped.data.requests[0].step, 'ticker-registry')
assert.equal(usUnmapped.data.requests.find((row) => row.step === 'facts'), undefined, 'a name with no CIK has no address, so no call is planned for it')
assert.ok(feedHas(usUnmapped, 'corp_code_mapping_pending'), 'and it is named rather than dropped')
const usFeedPlan = feedRun('fundamentalsPlan', { market: 'us', symbols: ['DKS'], corporationCodes: [{ symbol: 'DKS', cik: 1089063 }], cache: { 'sec-edgar:companyfacts:DKS': { state: 'fresh', documents: [{}] } } })
const usFacts = usFeedPlan.data.requests.find((row) => row.step === 'facts')
assert.equal(usFacts.vendorPath, '/api/xbrl/companyfacts/CIK0001089063.json', 'the CIK file name, prefixed, ten-digit zero-padded and .json — never the ticker')
assert.equal(usFacts.vendorId, '0001089063', 'an unpadded cik_str straight off company_tickers.json is padded here too')
assert.equal(usFacts.tool, 'source_cache_read')
assert.ok(!JSON.stringify(usFeedPlan.data.requests).includes('companyfacts/DKS'), 'no planned address carries a ticker')
// An id that is not a CIK at all is left unmapped and named, never pasted into an address.
assert.ok(feedHas(feedRun('fundamentalsPlan', { market: 'us', symbols: ['DKS'], corporationCodes: [{ symbol: 'DKS', vendorId: 'DKS' }] }), 'corp_code_mapping_pending'))
/**
 * ⚠️ And the diagnosis names the *registry* stage on this side too. It was
 * gated on `market === 'kr'`, so a US run that never joined its roster reported
 * `no-fundamental-request-was-planned` — true, and the wrong stage.
 */
const usDiagnosis = feedRun('radarFeedDiagnosis', { market: 'us', symbols: ['DKS'], plan: usUnmapped.data, mapping: null })
assert.equal(usDiagnosis.data.stage, 'registry')
assert.equal(usDiagnosis.data.cause, 'registry-planned-but-never-read')

/**
 * ⛔ OpenDART reports its own refusals on an HTTP 200, and `013` and `020` are
 * not the same finding. Mixing them makes the starvation diagnosis worthless:
 * a quota outage would read as a fact about a company.
 */
assert.equal(feedRun('dartVendorStatus', { payload: { status: '013', message: '조회된 데이터가 없습니다.' } }).data.feedFailure, 'vendor-holds-no-row')
assert.equal(feedRun('dartVendorStatus', { payload: { status: '020', message: '요청 제한을 초과하였습니다.' } }).data.feedFailure, 'quota-exhausted')
assert.notEqual(
  feedRun('dartVendorStatus', { payload: { status: '013' } }).data.feedFailure,
  feedRun('dartVendorStatus', { payload: { status: '020' } }).data.feedFailure,
  'we looked and found nothing is never the same answer as we were not allowed to look',
)
assert.ok(feedHas(feedRun('dartVendorStatus', { payload: { status: '020' } }), 'dart_quota_exhausted'))
assert.ok(feedHas(feedRun('dartVendorStatus', { payload: { status: '013' } }), 'dart_query_matched_nothing'))
assert.equal(feedRun('dartVendorStatus', { payload: { status: '020' } }).data.retryable, true)
assert.equal(feedRun('dartVendorStatus', { payload: { status: '013' } }).data.retryable, false)
assert.equal(feedRun('dartVendorStatus', { payload: { status: '000' } }).data.usable, true)
assert.ok(feedHas(feedRun('dartVendorStatus', { payload: {} }), 'dart_status_missing'))
assert.ok(feedHas(feedRun('dartVendorStatus', { payload: { status: '777' } }), 'dart_status_unknown'), 'an unmeasured status is recorded rather than guessed at')

/**
 * The prior comparable travels inside the same OpenDART filing (`frmtrm_amount`)
 * and was being dropped, which is one reason `inflection` reported
 * `no-valid-point-in-time-filing` on rows it had been handed.
 */
const statements = feedRun('normalizeDartFinancials', {
  status: '000',
  list: [
    { rcept_no: '20260814000001', corp_code: '00126380', bsns_year: '2026', reprt_code: '11012', fs_div: 'CFS', sj_div: 'IS', account_id: 'ifrs-full_Revenue', account_nm: '매출액', thstrm_amount: '1,000', frmtrm_amount: '900' },
    { rcept_no: '20260814000001', corp_code: '00126380', bsns_year: '2026', reprt_code: '11012', fs_div: 'CFS', sj_div: 'IS', account_id: 'dart_OperatingIncomeLoss', account_nm: '영업이익', thstrm_amount: '120', frmtrm_amount: '-30' },
  ],
})
assert.equal(statements.data.rows[1].priorAmount, -30, 'the previous term is carried rather than thrown away')
const built = feedRun('radarCandidates', { market: 'kr', symbols: ['005930', '036460'], financials: { '005930': statements.data.rows }, prices: { '005930': { status: 'confirmed', close: 100, ma50: 110, ma200: 90, offHigh200: -0.18 } } })
assert.equal(built.data.candidates.length, 2, 'a name with no response still comes back — dropping it is how never fetched becomes did not qualify')
assert.deepEqual(built.data.unfed.map((row) => row.symbol), ['036460'])
assert.equal(built.data.unfed[0].reason, 'no-response-supplied-for-this-symbol')
const filing = built.data.candidates[0].filings[0]
assert.equal(filing.periodEnd, '2026-06-30')
assert.equal(filing.operatingIncomeYoy, 500, 'a sign flip from -30 to 120 is a +500% reading against the absolute prior')
assert.equal(built.data.fedCount, 1)
assert.equal(built.data.comparableCount, 1)
// The host cache hands back its own normalized shape, and that path is read too.
const fromCache = feedRun('radarCandidates', {
  market: 'us',
  symbols: ['DKS'],
  documents: {
    DKS: [
      { publishedAt: '2025-09-01T00:00:00Z', version: 1, normalized: { period: { start: '2025-05-01', end: '2025-08-02', fiscalPeriod: 'Q2' }, currency: 'USD', metrics: { operatingIncome: 100, revenue: 1000 } } },
      { publishedAt: '2026-09-01T00:00:00Z', version: 1, normalized: { period: { start: '2026-05-01', end: '2026-08-01', fiscalPeriod: 'Q2' }, currency: 'USD', metrics: { operatingIncome: 150, revenue: 1200 } } },
    ],
  },
})
assert.equal(fromCache.data.candidates[0].filings.at(-1).operatingIncomeYoy, 50)
assert.equal(fromCache.data.candidates[0].filings.at(-1).sourceType, 'host-source-cache')

/**
 * ── Ask 4: a starved lane must say what starved it ─────────────────────────
 *
 * The 2026-09-06 numbers, reproduced: thirteen candidates, three lanes, 0/13
 * each, and the two dominant reasons the run recorded.
 */
const thirteen = Array.from({ length: 13 }, (_, index) => ({ asset: `K${index}`, market: 'kr' }))
const bare = execute({ operation: 'upsideRadar', asOf: feedAsOf, input: { candidates: thirteen } })
for (const lane of ['inflection', 'quality-pullback', 'post-event-continuation']) {
  assert.equal(bare.data.lanes[lane].included, 0, `${lane} included 0`)
  assert.equal(bare.data.lanes[lane].excluded, 13, `${lane} excluded 13`)
  assert.equal(bare.data.lanes[lane].starved, true)
}
assert.equal(bare.data.lanes.inflection.reasons['no-valid-point-in-time-filing'], 13)
assert.equal(bare.data.lanes['quality-pullback'].reasons['no-valid-point-in-time-filing'], 13)
assert.equal(bare.data.lanes['post-event-continuation'].reasons['no-event-in-the-last-30-days'], 13)
assert.equal(bare.data.lanes.inflection.ruleVersion, 'uri-v1')
// ⛔ Unfed with no reading is itself reported: this run cannot say what starved it.
assert.ok(feedHas(bare, 'radar_starvation_cause_unreported'))

// The reading, on the run that actually happened: the registry was never requested.
const neverFed = feedRun('radarFeedDiagnosis', { market: 'kr', symbols: thirteen.map((row) => row.asset), plan: { requests: [] }, lanes: bare.data.lanes })
assert.equal(neverFed.data.stage, 'registry')
assert.equal(neverFed.data.cause, 'registry-never-requested')
/**
 * ⚠️ **`never-fed` split in #228 and this run is on the near side of the
 * split.** `post-event-continuation` starved on `no-event-in-the-last-30-days`
 * and no register was passed, so the reading now says *which* never-fed this
 * is: nobody produced the catalyst axis. ⛔ The stage and the cause did not
 * move — they are about the filing path, which really did lose its input at the
 * registry, and the two facts stay two.
 */
assert.equal(neverFed.data.verdict, 'never-fed-no-catalyst-producer')
assert.equal(neverFed.data.catalystAxis.producer, 'absent')
assert.ok(feedHas(neverFed, 'catalyst_producer_absent'))
assert.ok(feedHas(neverFed, 'radar_feed_broken'))
const named = execute({ operation: 'upsideRadar', asOf: feedAsOf, input: { candidates: thirteen, feed: neverFed.data } })
assert.equal(named.data.lanes.inflection.feedCause, 'registry-never-requested')
assert.equal(named.data.lanes.inflection.feedStage, 'registry')
assert.ok(named.diagnostics.find((row) => row.code === 'radar_lane_starved').message.includes('registry-never-requested'), 'the sentence names the cause instead of repeating "unfed"')
assert.equal(feedHas(named, 'radar_starvation_cause_unreported'), false)

// Each stage is a separate cause, and the first one that failed is the answer.
const joined = { registrySize: 3800, mapped: [{ symbol: '005930' }], unmapped: [] }
const stageOf = (input) => feedRun('radarFeedDiagnosis', { market: 'kr', symbols: ['005930'], lanes: bare.data.lanes, ...input }).data
assert.equal(stageOf({ plan: feedPlan.data, mapping: { registrySize: 0, mapped: [], unmapped: ['005930'] } }).cause, 'registry-received-but-empty')
assert.equal(stageOf({ plan: feedPlan.data, mapping: { registrySize: 3800, mapped: [], unmapped: ['005930'] } }).stage, 'mapping')
assert.equal(stageOf({ plan: { requests: [{ step: 'corp-code-registry' }] }, mapping: joined }).cause, 'no-fundamental-request-was-planned')
const quota = stageOf({ plan: feedPlan.data, mapping: joined, responses: [{ step: 'financials', ...feedRun('dartVendorStatus', { payload: { status: '020' } }).data }] })
assert.equal(quota.cause, 'vendor-quota-exhausted-we-were-not-allowed-to-look')
const noRow = stageOf({ plan: feedPlan.data, mapping: joined, responses: [{ step: 'financials', ...feedRun('dartVendorStatus', { payload: { status: '013' } }).data }], candidates: { fedCount: 0, comparableCount: 0 } })
assert.equal(noRow.cause, 'vendor-holds-no-row-for-these-filers')
assert.notEqual(quota.cause, noRow.cause, 'the two OpenDART 200s stay two causes all the way to the diagnosis')
assert.equal(stageOf({ plan: failedRefresh.data, mapping: joined }).cause, 'source-cache-refresh-failed')
assert.equal(stageOf({ plan: feedPlan.data, mapping: joined }).cause, 'source-cache-never-fetched-and-no-refresh-was-made')
assert.notEqual(
  stageOf({ plan: failedRefresh.data, mapping: joined }).cause,
  stageOf({ plan: feedPlan.data, mapping: joined }).cause,
  'a failed refresh and a cache nobody has filled are two causes, which is the distinction the host tool exists to make',
)

/**
 * ⛔ And the worst outcome available here is mixing *fed and empty* with
 * *never fed*: both produce an empty candidate list and they mean opposite
 * things. The verdict says which, on the same object.
 */
const freshPlan = feedRun('fundamentalsPlan', { ...planInput, cache: cacheFor({ state: 'fresh', documents: [{}] }, { state: 'fresh', documents: [{}] }) })
const emptyDiagnosis = (catalystsIn) => feedRun('radarFeedDiagnosis', { market: 'kr', symbols: ['005930'], plan: freshPlan.data, mapping: joined, candidates: { fedCount: 1, comparableCount: 1 }, lanes: bare.data.lanes, ...(catalystsIn === undefined ? {} : { catalysts: catalystsIn }) })
/**
 * ── #228: and `fed-and-genuinely-empty` was itself a mixture ───────────────
 *
 * These lanes starve on `no-event-in-the-last-30-days`, which is the catalyst
 * axis and not the filing path — so the run that said *the branch was fed and
 * the market is empty* was describing an axis nothing had ever produced. The
 * three answers are asserted against each other here, because the middle one
 * only exists once the axis has a producer at all.
 */
const noProducer = emptyDiagnosis(undefined)
assert.equal(noProducer.data.fed, true, 'the filing path really was fed; the catalyst axis is the one that was not')
assert.equal(noProducer.data.verdict, 'never-fed-no-catalyst-producer')
assert.ok(feedHas(noProducer, 'catalyst_producer_absent'))

const registerCoverage = (row) => ({ coverage: { rosterCount: 1, researched: 0, derived: 0, eventsResearched: 0, withCatalystInHorizon: 0, ...row } })
const producerEmpty = emptyDiagnosis(registerCoverage({}))
assert.equal(producerEmpty.data.verdict, 'never-fed-catalyst-producer-empty', 'a register that ran and registered nothing is a different fact from no register at all')
assert.equal(producerEmpty.data.catalystAxis.producer, 'ran')
assert.equal(feedHas(producerEmpty, 'catalyst_producer_absent'), false, '⛔ and the producer is not reported absent when it answered')
assert.notEqual(producerEmpty.data.verdict, noProducer.data.verdict, 'two words, because they have two fixes')

/** ⚠️ A register that did register windows leaves the verdict alone: the axis was fed and the emptiness is then an answer about the horizon. */
const fedButEmpty = emptyDiagnosis(registerCoverage({ researched: 1, withCatalystInHorizon: 1 }))
assert.equal(fedButEmpty.data.fed, true)
assert.equal(fedButEmpty.data.verdict, 'fed-and-genuinely-empty')
assert.ok(feedHas(fedButEmpty, 'radar_lane_empty_not_starved'))
assert.equal(feedHas(fedButEmpty, 'radar_feed_broken'), false)
assert.notEqual(fedButEmpty.data.verdict, neverFed.data.verdict)
/** ⚠️ And a derived window counts as produced too — the split is about the producer, not about how the window was arrived at, which `catalystAxis` reports separately. */
assert.equal(emptyDiagnosis(registerCoverage({ derived: 1, withCatalystInHorizon: 1 })).data.verdict, 'fed-and-genuinely-empty')

/**
 * ── #178: one fed name out of eighty-three is not «fed» ─────────────────────
 *
 * The measured run: roster 83, `fedCount: 1`, every lane starved, 82 exclusions
 * of `no-valid-point-in-time-filing` — and the header said `fed` /
 * `the-branch-was-fed`, which reads as *the market was reviewed and rejected*.
 * ⛔ The correction must not be the mirror error either: one fed name is not
 * `never-fed`, so all three states are asserted here against each other, and
 * the counts are asserted with them — a stage word with no denominator behind
 * it is the same silent promotion in a different spelling.
 */
const eightyThree = Array.from({ length: 83 }, (_, index) => ({ asset: `US${index}`, market: 'us', filings: [] }))
eightyThree[0].filings = [{ periodEnd: '2026-06-30', operatingIncomeYoy: 0.2 }]
const partialLanes = execute({ operation: 'upsideRadar', asOf: feedAsOf, input: { candidates: eightyThree.map((row) => ({ symbol: row.asset })) } }).data.lanes
/**
 * ⚠️ **The register is passed on purpose, and #228 is why.** These lanes starve
 * on `no-event-in-the-last-30-days` too, so without a catalyst reading every
 * verdict below would be the catalyst axis's `never-fed-no-catalyst-producer`
 * rather than the filing-path answer this block is about. Handing it a register
 * that registered a window keeps the subject where #178 put it.
 */
const feedOf = (rows, lanesIn = partialLanes) => feedRun('radarFeedDiagnosis', {
  catalysts: { coverage: { rosterCount: 83, researched: 83, derived: 0, eventsResearched: 83, withCatalystInHorizon: 83 } },
  market: 'us',
  symbols: eightyThree.map((row) => row.asset),
  plan: { requests: [{ step: 'ticker-registry' }, { step: 'facts', cacheState: 'fresh' }] },
  mapping: { registrySize: 12000, mapped: eightyThree.map((row) => ({ symbol: row.asset })), unmapped: [] },
  responses: [{ step: 'facts', usable: true }],
  candidates: { candidates: rows, fedCount: rows.filter((row) => row.filings.length).length, comparableCount: rows.filter((row) => row.filings.length).length },
  lanes: lanesIn,
}).data

const oneOfEightyThree = feedOf(eightyThree)
assert.equal(oneOfEightyThree.fedCount, 1)
assert.equal(oneOfEightyThree.candidateCount, 83)
assert.equal(oneOfEightyThree.stage, 'partially-fed', 'one candidate fed out of 83 is not the fed stage')
assert.equal(oneOfEightyThree.cause, 'some-candidates-were-fed-and-the-rest-were-never-fed')
assert.equal(oneOfEightyThree.fed, false)
assert.equal(oneOfEightyThree.verdict, 'partially-fed')
assert.notEqual(oneOfEightyThree.verdict, 'fed-and-genuinely-empty', 'the 82 that never arrived must not read as an answered market')
assert.notEqual(oneOfEightyThree.verdict, 'never-fed', '⛔ and the one that did arrive must not be demoted away either')
assert.deepEqual(oneOfEightyThree.coverage, { fed: 1, of: 83, unfed: 82 })
assert.ok(oneOfEightyThree.stageOrder.indexOf('partially-fed') > oneOfEightyThree.stageOrder.indexOf('normalization'), 'partial feeding is the last stage before fed')

// The absence is named with counts, on the diagnostic and on the lane header both.
const partialAnswer = feedRun('radarFeedDiagnosis', {
  market: 'us',
  symbols: eightyThree.map((row) => row.asset),
  plan: { requests: [{ step: 'ticker-registry' }, { step: 'facts', cacheState: 'fresh' }] },
  mapping: { registrySize: 12000, mapped: eightyThree.map((row) => ({ symbol: row.asset })), unmapped: [] },
  responses: [{ step: 'facts', usable: true }],
  candidates: { candidates: eightyThree, fedCount: 1, comparableCount: 1 },
  lanes: partialLanes,
})
assert.ok(feedHas(partialAnswer, 'radar_feed_broken'), 'a branch fed for one of 83 is an input-path finding')
assert.equal(feedHas(partialAnswer, 'radar_lane_empty_not_starved'), false, '⛔ and it is emphatically not "the lanes answered"')
const partialBroken = partialAnswer.diagnostics.find((row) => row.code === 'radar_feed_broken')
assert.deepEqual(partialBroken.details.coverage, { fed: 1, of: 83, unfed: 82 })
assert.ok(/1 of 83/.test(partialBroken.message) && /82/.test(partialBroken.message), 'the sentence carries the two counts')
assert.equal(partialBroken.details.coverage.of, 83)
assert.ok(!JSON.stringify(partialBroken.details).includes('US7'), '⛔ counts, never the symbols themselves')
const partialRadar = execute({ operation: 'upsideRadar', asOf: feedAsOf, input: { candidates: eightyThree.map((row) => ({ symbol: row.asset })), feed: partialAnswer.data } })
const partialHeader = partialRadar.data
assert.equal(partialHeader.lanes.inflection.feedStage, 'partially-fed', 'the header a later run reads is where this has to be true')
assert.deepEqual(partialHeader.lanes.inflection.feedCoverage, { fed: 1, of: 83, unfed: 82 })
assert.deepEqual(partialHeader.feed.coverage, { fed: 1, of: 83, unfed: 82 })
assert.ok(partialRadar.diagnostics.find((row) => row.code === 'radar_lane_starved').message.includes('82 of 83'), 'the starvation sentence says how much of the lane was never fed')

// All 83 fed and the lanes still empty is the other state, and it keeps its word.
const allFed = feedOf(eightyThree.map((row) => ({ ...row, filings: [{ periodEnd: '2026-06-30', operatingIncomeYoy: 0.2 }] })))
assert.equal(allFed.fedCount, 83)
assert.equal(allFed.candidateCount, 83)
assert.equal(allFed.stage, 'fed')
assert.equal(allFed.verdict, 'fed-and-genuinely-empty')
assert.deepEqual(allFed.coverage, { fed: 83, of: 83, unfed: 0 })
// …and with a lane that included something, it is the evaluated one.
assert.equal(feedOf(eightyThree.map((row) => ({ ...row, filings: [{ periodEnd: '2026-06-30', operatingIncomeYoy: 0.2 }] })), { inflection: { starved: false, included: 4 } }).verdict, 'fed-and-evaluated')
// Nothing fed at all stays never-fed, at its own stage.
const noneFed = feedOf(eightyThree.map((row) => ({ ...row, filings: [] })))
assert.equal(noneFed.fedCount, 0)
assert.equal(noneFed.verdict, 'never-fed')
assert.equal(noneFed.stage, 'normalization')
assert.equal(new Set([noneFed.verdict, oneOfEightyThree.verdict, allFed.verdict]).size, 3, 'none, some and all are three answers')

/**
 * ⛔ And a reading that cannot count answers `null` rather than assuming the
 * plate was whole — a caller that passed counts without the rows and without a
 * roster has no denominator, and inventing one is how the promotion returns.
 */
const uncountable = feedRun('radarFeedDiagnosis', { market: 'kr', plan: freshPlan.data, mapping: joined, candidates: { fedCount: 1, comparableCount: 1 }, lanes: bare.data.lanes }).data
assert.equal(uncountable.candidateCount, null)
assert.equal(uncountable.coverage, null)
assert.equal(uncountable.stage, 'fed', 'an unknown denominator is not evidence of a shortfall either')

// Every new operation publishes its contract, and refuses a key it does not read.
const published = feedRun('inputContracts').data
for (const operation of ['fundamentalsPlan', 'mapCorporationCodes', 'dartVendorStatus', 'radarCandidates', 'radarFeedDiagnosis']) {
  assert.ok(published.contracts[operation], `${operation} publishes its shape`)
  assert.ok(published.keys[operation].length, `${operation} publishes its keys`)
}
assert.equal(feedRun('fundamentalsPlan', { market: 'kr', symbols: ['005930'], corpCodes: [] }).status, 'blocked', 'a guessed key name is refused rather than absorbed')
/** ⚠️ The MIC is read on this operation too (#212 ⑥), and one table says so for all five. */
assert.deepEqual(
  feedRun('radarCandidates', { market: 'XKRX', symbols: [] }).data,
  feedRun('radarCandidates', { market: 'kr', symbols: [] }).data,
  'the MIC and the sleeve are one fact on every operation that takes a market',
)
assert.equal(feedRun('radarCandidates', { market: 'KOSPI', symbols: [] }).status, 'blocked')

console.log('evidence-gated issue #146 fundamental-feed regression tests passed')

/**
 * ── #160: the valuation end of the same wiring ─────────────────────────────
 *
 * ⚠️ **Every vendor number below is a fixture and none of it has been observed
 * against a live vendor.** No OpenDART `crtfc_key` and no SEC user-agent exists
 * in this environment, so the statements these tests derive a fair value from
 * are the shapes #164 pinned, not a response anyone received. ⛔ A vendor
 * continuing to answer the way its documentation says is not established here,
 * and #160 stays open until a run holding keys reports an open main lane.
 *
 * The measured facts these pin, from the 2026-09-06 sizing measurement:
 * `variantViewCheck` satisfied three of four — `variantView`, `consensusRefs`,
 * `challengeCleared` — `missing: ["thesisComplete"]`, gaps `catalysts`,
 * `invalidationTriggers`, `expectedUpsidePct`, `fairValueRange`; and
 * `effectivePositionCap` `declaredCap 0.2` → `effectiveCap 0.01`,
 * `reductionMultiple 20`, `mainLaneOpen false`.
 */
const valAsOf = '2026-09-06T07:00:00Z'
const valRun = (operation, input = {}) => execute({ operation, asOf: valAsOf, input })
const valHas = (answer, code) => answer.diagnostics.some((row) => row.code === code)

/** The thesis the run actually sent: complete but for the four gaps. */
const measuredThesis = {
  thesisId: 'th-316140',
  asset: '316140',
  createdAt: '2026-09-01T00:00:00Z',
  coreClaim: 'Capital return is being underwritten by a CET1 the market is discounting',
  horizonEnd: '2027-03-31T00:00:00Z',
  evidenceStatus: 'incomplete',
  variantView: 'Consensus reads the buyback as a one-off; the CET1 path makes it a run rate',
  consensusRefs: [{ metric: 'net-income-2026', value: 965700000000, sourceUrl: 'https://example.invalid/consensus', publishedAt: '2026-08-20T00:00:00Z', capturedAt: '2026-09-01T00:00:00Z' }],
}
const measured = valRun('variantViewCheck', { thesis: measuredThesis, challengeVerdict: 'cleared' })
assert.equal(measured.data.verified, false)
assert.deepEqual(measured.data.satisfied, ['variantView', 'consensusRefs', 'challengeCleared'])
assert.deepEqual(measured.data.missing, ['thesisComplete'])
assert.deepEqual(measured.data.gaps, ['catalysts', 'invalidationTriggers', 'expectedUpsidePct', 'fairValueRange'])
assert.equal(measured.data.lane, 'control-arm')

/**
 * Ask 4: `missing: ["thesisComplete"]` is one word covering three met
 * requirements and one unmet one. The report says which, and what is
 * outstanding on it — ⛔ without changing `verified` or the four requirements.
 */
assert.equal(measured.data.satisfiedCount, 3)
assert.equal(measured.data.requirementCount, 4)
assert.deepEqual(measured.data.requirements, ['thesisComplete', 'variantView', 'consensusRefs', 'challengeCleared'])
const byRequirement = Object.fromEntries(measured.data.requirementReport.map((row) => [row.requirement, row]))
assert.equal(byRequirement.thesisComplete.satisfied, false)
assert.deepEqual(byRequirement.thesisComplete.gaps, ['catalysts', 'invalidationTriggers', 'expectedUpsidePct', 'fairValueRange'])
assert.ok(/expectedUpsidePct/.test(byRequirement.thesisComplete.outstanding), 'the binding requirement names what is still open on it')
for (const requirement of ['variantView', 'consensusRefs', 'challengeCleared']) {
  assert.equal(byRequirement[requirement].satisfied, true)
  assert.equal(byRequirement[requirement].outstanding, null)
}
assert.ok(measured.data.requirementReport.every((row) => typeof row.checkedBy === 'string' && row.checkedBy.length))

/**
 * The same candidate at the sizing door. ⚠️ **#226 changed what one missing
 * requirement costs, and it is no longer a cap.** Three of four met used to buy
 * a twentyfold reduction, sized and submitted; it now refuses the position and
 * names the one that binds — `blocked`, so `targetWeight` returns `null` and
 * nothing is proposed at 1% instead.
 */
const cap = valRun('effectivePositionCap', {
  mandatePositionCap: 0.2,
  maturityStatus: 'insufficient',
  lane: 'main',
  nav: { amount: 14866.44, currency: 'USD' },
  thesis: measuredThesis,
  challengeVerdict: 'cleared',
})
assert.equal(cap.data.effectiveCap, 0.2, '⛔ the declared cap is not lowered — the position is refused instead')
assert.equal(cap.data.variantViewVerified, false)
assert.equal(cap.data.resolvedLane, 'control-arm')
assert.equal(valHas(cap, 'position_cap_reduced_by_maturity'), false, 'the retired token has no producer')
const capRefusal = cap.diagnostics.find((row) => row.code === 'variant_view_required_for_position')
assert.equal(capRefusal.severity, 'blocked')
// ⛔ Which requirement binds is readable one requirement at a time, exactly as #160 asked.
assert.deepEqual(capRefusal.details.missing, ['thesisComplete'])
assert.deepEqual(capRefusal.details.satisfied, ['variantView', 'consensusRefs', 'challengeCleared'])
assert.equal(capRefusal.details.requirementReport.find((row) => row.requirement === 'thesisComplete').gaps.length, 4)

/**
 * ── The derivation, and where it comes from ────────────────────────────────
 *
 * ⛔ Not a multiple this package chose. `candidate-research` §Candidate record 5
 * asks for bear/base/bull with a target, a return and factual drivers, and
 * `researchGate` already computes `Σ p·return`; `validateThesis` was refusing a
 * thesis for not carrying a number the same methodology was already computing
 * one operation away.
 */
const krFilings = [{
  periodEnd: '2026-06-30',
  availableAt: '2026-08-14T00:00:00Z',
  revenue: 1000,
  operatingIncome: 120,
  operatingIncomeYoy: 500,
  marginDeltaYoy: 8.6,
  currency: 'KRW',
  sourceType: 'opendart-full-financial-statements',
}]
const scenarios = {
  bear: { probability: 0.25, target: 80, drivers: [{ metric: 'operatingIncomeYoy', evidenceId: 'ev-dart-1' }] },
  base: { probability: 0.5, target: 120, drivers: [{ metric: 'revenue', evidenceId: 'ev-dart-1' }] },
  bull: { probability: 0.25, target: 160, drivers: [{ metric: 'marginDeltaYoy', evidenceId: 'ev-dart-1' }] },
}
const valued = valRun('thesisValuation', { asset: '316140', market: 'kr', price: 100, scenarios, filings: krFilings })
assert.equal(valued.data.basis, 'scenario-targets')
assert.ok(/candidate-research/.test(valued.data.basisSource), 'the basis names the methodology sentence it was read out of')
assert.deepEqual(valued.data.fairValueRange, { low: 80, high: 160, currency: 'KRW' })
assert.equal(valued.data.expectedUpsidePct, 20)
assert.equal(valued.data.grounded, true)
assert.equal(valued.data.groundedCases, 3)
assert.equal(valued.data.latestPeriodEnd, '2026-06-30')
assert.deepEqual(valued.data.thesisFields, { expectedUpsidePct: 20, fairValueRange: { low: 80, high: 160 } })

/** And the derived fields close the two gaps they were blocking. */
const completed = valRun('validateThesis', {
  ...measuredThesis,
  evidenceStatus: 'complete',
  catalysts: [{ event: 'Q3 disclosure', windowStart: '2026-11-01T00:00:00Z', windowEnd: '2026-11-20T00:00:00Z' }],
  invalidationTriggers: [{ kind: 'price-below', level: 70, checkBy: '2026-12-31T00:00:00Z' }],
  ...valued.data.thesisFields,
})
assert.equal(completed.data.complete, true)
assert.deepEqual(completed.data.gaps, [])
const opened = valRun('variantViewCheck', {
  thesis: {
    ...measuredThesis,
    evidenceStatus: 'complete',
    catalysts: [{ event: 'Q3 disclosure', windowStart: '2026-11-01T00:00:00Z', windowEnd: '2026-11-20T00:00:00Z' }],
    invalidationTriggers: [{ kind: 'price-below', level: 70, checkBy: '2026-12-31T00:00:00Z' }],
    ...valued.data.thesisFields,
  },
  challengeVerdict: 'cleared',
})
assert.equal(opened.data.verified, true, 'the lane opens on the requirements it always had, filled from the statements')
assert.equal(opened.data.lane, 'main')
assert.equal(opened.data.satisfiedCount, 4)

/**
 * ⛔ **The gate is not loosened anywhere.** Every requirement still binds on its
 * own, with the derived fields present.
 */
const withFields = { ...measuredThesis, evidenceStatus: 'complete', catalysts: [{ event: 'Q3', windowStart: '2026-11-01T00:00:00Z', windowEnd: '2026-11-20T00:00:00Z' }], invalidationTriggers: [{ kind: 'price-below', level: 70, checkBy: '2026-12-31T00:00:00Z' }], ...valued.data.thesisFields }
assert.equal(valRun('variantViewCheck', { thesis: withFields, challengeVerdict: 'conditional' }).data.verified, false)
assert.equal(valRun('variantViewCheck', { thesis: { ...withFields, variantView: '' }, challengeVerdict: 'cleared' }).data.verified, false)
assert.equal(valRun('variantViewCheck', { thesis: { ...withFields, consensusRefs: [] }, challengeVerdict: 'cleared' }).data.verified, false)
assert.equal(valRun('variantViewCheck', { thesis: { ...withFields, expectedUpsidePct: undefined }, challengeVerdict: 'cleared' }).data.verified, false)
assert.equal(
  valRun('variantViewCheck', { thesis: withFields, challengeVerdict: 'cleared', evidenceSamples: [{ cohort: 'mechanical' }] }).data.verified,
  false,
  'and the control-arm leak guard still refuses its own cohort as the argument for size',
)

/** A target with nothing under it still answers — and says it is standing on nothing. */
const ungrounded = valRun('thesisValuation', { asset: '316140', market: 'kr', price: 100, scenarios: { bear: { probability: 0.25, target: 80 }, base: { probability: 0.5, target: 120 }, bull: { probability: 0.25, target: 160 } }, filings: [] })
assert.equal(ungrounded.data.expectedUpsidePct, 20, 'the arithmetic is the same; what changed is what stands under it')
assert.equal(ungrounded.data.grounded, false)
assert.ok(valHas(ungrounded, 'scenario_driver_ungrounded'))
assert.ok(valHas(ungrounded, 'valuation_filings_absent'))
// ⛔ And a missing target is never replaced by a multiple this package picked.
const noTarget = valRun('thesisValuation', { asset: '316140', market: 'kr', price: 100, scenarios: { bear: { probability: 0.25, return: -0.2 }, base: { probability: 0.5, return: 0.2 }, bull: { probability: 0.25, return: 0.6 } }, filings: krFilings })
assert.equal(noTarget.data.fairValueRange, null)
assert.equal(noTarget.data.thesisFields, null)
assert.equal(noTarget.data.expectedUpsidePct, 20, 'the weighted return still computes from the returns that were given')
assert.ok(valHas(noTarget, 'fair_value_target_absent'))
// A stated return and a target that do not describe the same price are two readings, never one average.
const disagreeing = valRun('thesisValuation', { asset: '316140', market: 'kr', price: 100, scenarios: { ...scenarios, base: { probability: 0.5, target: 120, return: 0.05, drivers: ['revenue'] } }, filings: krFilings })
assert.ok(valHas(disagreeing, 'scenario_target_return_disagree'))
const disagreedCase = disagreeing.data.scenarios.find((row) => row.case === 'base')
assert.equal(disagreedCase.statedReturn, 0.05)
assert.equal(disagreedCase.impliedByTarget, 0.2)
assert.equal(valRun('thesisValuation', { asset: 'X', market: 'kr', scenarios, filings: krFilings }).status, 'blocked', 'a fair value with no price to compare it against is not an upside')

/**
 * ── Ask 3: an ETF and a single name do not get the same diagnosis ──────────
 *
 * ⛔ *No source can fill this* and *the source was never called* produce the
 * same four-item `gaps` list and mean opposite things — the same swap
 * `radarCandidates` refuses one layer down. The class is **computed** off the
 * registry rather than asserted.
 */
const gaps = ['catalysts', 'invalidationTriggers', 'expectedUpsidePct', 'fairValueRange']
const filerMapping = { registrySize: 3800, mapped: [{ symbol: '316140', corporationCode: '00254045' }], unmapped: ['069500'] }
const singleName = valRun('thesisGapSources', { asset: '316140', market: 'kr', gaps, mapping: filerMapping })
assert.equal(singleName.data.instrumentClass, 'single-name-filer')
assert.equal(singleName.data.unfetchedCount, 2)
assert.equal(singleName.data.unfillableCount, 0)
assert.equal(singleName.data.gaps.find((row) => row.gap === 'fairValueRange').state, 'source-exists-and-was-never-called')
assert.ok(valHas(singleName, 'valuation_gap_is_unfetched_not_unfillable'))

const etf = valRun('thesisGapSources', { asset: '069500', market: 'kr', gaps, mapping: filerMapping })
assert.equal(etf.data.instrumentClass, 'non-filer-instrument')
assert.equal(etf.data.unfillableCount, 2)
assert.equal(etf.data.unfetchedCount, 0)
assert.equal(etf.data.gaps.find((row) => row.gap === 'fairValueRange').state, 'no-source-exists-for-this-instrument')
assert.ok(valHas(etf, 'valuation_gap_has_no_source_for_this_instrument'))
assert.notEqual(
  singleName.data.gaps.find((row) => row.gap === 'expectedUpsidePct').state,
  etf.data.gaps.find((row) => row.gap === 'expectedUpsidePct').state,
  'the same gaps list on two instruments is two findings, and collapsing them is what kept the lane shut',
)

// ⛔ With no registry read, the instrument is left unclassified rather than guessed at.
const unclassified = valRun('thesisGapSources', { asset: '316140', market: 'kr', gaps })
assert.equal(unclassified.data.instrumentClass, 'unknown')
assert.equal(unclassified.data.classBasis, 'registry-never-read')
assert.ok(valHas(unclassified, 'instrument_class_unknown'))
assert.equal(unclassified.data.unfetchedCount, 0)
assert.equal(unclassified.data.unfillableCount, 0)
// A declaration answers where the registry was not read, and disputes are reported rather than reconciled.
assert.equal(valRun('thesisGapSources', { asset: '069500', market: 'kr', gaps, instrumentType: 'etf' }).data.instrumentClass, 'non-filer-instrument')
assert.ok(valHas(valRun('thesisGapSources', { asset: '316140', market: 'kr', gaps, mapping: filerMapping, instrumentType: 'etf' }), 'instrument_class_disputed'))
// Once the statements are read, the gap is neither unfillable nor unfetched: it is underived.
const answered = valRun('thesisGapSources', { asset: '316140', market: 'kr', gaps, mapping: filerMapping, feed: { fedCount: 1 }, filings: krFilings })
assert.equal(answered.data.gaps.find((row) => row.gap === 'fairValueRange').state, 'source-answered-and-the-value-was-not-derived')
// The gaps that no source fills for anybody stay the run's own work either way.
assert.equal(singleName.data.gaps.find((row) => row.gap === 'invalidationTriggers').state, 'run-authored-and-unwritten')

/**
 * ── Ask 2: the instance's own generalization is retracted, not deleted ─────
 *
 * `run/theme-radar-last`, 2026-09-04. ⚠️ It is filed under a key that is not
 * `failures/repeated-patterns`, which is why the valRetraction registry had to
 * learn that the key belongs to the rule.
 */
const themeRadarLast = {
  ranAt: '2026-09-04T11:00:00Z',
  note: 'validateThesis returned complete:false with gaps expectedUpsidePct and fairValueRange that no granted source can fill',
}
const retracted = valRun('refutedMemoryRules', { patterns: [], memory: { 'run/theme-radar-last': themeRadarLast } })
assert.equal(retracted.data.retractions.length, 1)
const valRetraction = retracted.data.retractions[0]
assert.equal(valRetraction.key, 'run/theme-radar-last')
assert.equal(valRetraction.refutedRuleId, 'valuation-gaps-have-no-granted-source')
assert.equal(valRetraction.refutedIn, '#160')
assert.equal(valRetraction.writeAs.state, 'RETRACTED')
assert.ok(/ETF/.test(valRetraction.correction) && /fnlttSinglAcntAll/.test(valRetraction.correction), 'the correction is the distinction, not the opposite blanket claim')
assert.ok(valHas(retracted, 'memory_rule_refuted'))
// ⛔ It retracts and does not delete: the original value is untouched and the row is additive.
assert.equal(themeRadarLast.note, 'validateThesis returned complete:false with gaps expectedUpsidePct and fairValueRange that no granted source can fill')
// The #156 rule is still matched under its own key, and neither key claims the other's rules.
assert.deepEqual(retracted.data.appliesTo, ['failures/repeated-patterns', 'run/theme-radar-last'])
const bothKeys = valRun('refutedMemoryRules', {
  patterns: [{ id: 'armed-reviews-memory-claims-arms-the-decision-never-made', note: 'When they disagree, the journal wins.' }],
  memory: { 'run/theme-radar-last': themeRadarLast },
})
assert.deepEqual(bothKeys.data.retractions.map((row) => row.refutedRuleId).sort(), ['armed-reviews-memory-claims-arms-the-decision-never-made', 'valuation-gaps-have-no-granted-source'])
assert.equal(bothKeys.data.keysUnread.length, 0)
// A key that was not read is named, because an unread rule still decides how this run is called.
assert.deepEqual(valRun('refutedMemoryRules', { patterns: [] }).data.keysUnread, ['run/theme-radar-last'])
assert.ok(valHas(valRun('refutedMemoryRules', {}), 'memory_rules_unread'))
assert.equal(valRun('refutedMemoryRules', { memory: [] }).status, 'blocked', 'a value with no key beside it cannot be matched against the rules filed under that key')

/** Every new operation publishes its contract, and refuses a key it does not read. */
const valContracts = valRun('inputContracts').data
for (const operation of ['thesisValuation', 'thesisGapSources']) {
  assert.ok(valContracts.contracts[operation], `${operation} publishes its shape`)
  assert.ok(valContracts.keys[operation].length, `${operation} publishes its keys`)
  assert.ok(valContracts.guarded.includes(operation), `${operation} refuses a key it does not read`)
  assert.ok(valContracts.nested[operation], `${operation} publishes the shapes a key list cannot show`)
}
assert.deepEqual(valContracts.vocabulary.scenarioCases, ['bear', 'base', 'bull'])
assert.deepEqual(valContracts.vocabulary.instrumentClasses, ['single-name-filer', 'non-filer-instrument', 'unknown'])
assert.deepEqual(valContracts.vocabulary.memoryRuleKeys, ['failures/repeated-patterns', 'run/theme-radar-last'])
assert.equal(valRun('thesisValuation', { asset: 'X', price: 100, multiple: 12 }).status, 'blocked', 'a multiple is not a key this package reads, and is refused rather than absorbed')

console.log('evidence-gated issue #160 valuation-wiring regression tests passed')

/**
 * ── #180: the core tranche gate answered off bars it never parsed ──────────
 *
 * The measured call: 200 Toss candle rows, unchanged — `closePrice` and
 * friends, every value a string — into `trendState`. It answered `status: ok`,
 * `state: "DOWNTREND"`, `trancheGuidance: "stop"`, **`diagnostics: []`**, with
 * `ma20`/`ma50`/`ma200` all `null`. `bars.length` reads 200 whatever the rows
 * hold, so nothing said the history was short; the state fell out of
 * `undefined > null` comparisons that are all false, and `DOWNTREND` halts
 * core deployment.
 *
 * The control that made it a defect rather than a guess: the sibling operation
 * `indicators`, over the byte-identical rows, refuses **every one** of them.
 * The validator was in the package; this gate did not call it.
 */
const trendAsOf = '2026-09-05T00:00:00Z'
const trendDay = (index) => new Date(Date.parse('2025-10-01T00:00:00Z') + index * 86_400_000).toISOString()
const trendCloses = Array.from({ length: 200 }, (_, index) => 100 + index * 0.5)
const numericBars = trendCloses.map((close, index) => ({ date: trendDay(index), open: close, high: close + 1, low: close - 1, close, volume: 1000 }))
/** The vendor's own shape, which is what `connection_request` hands a run. */
const vendorBars = trendCloses.map((close, index) => ({
  timestamp: trendDay(index),
  openPrice: String(close), highPrice: String(close + 1), lowPrice: String(close - 1), closePrice: String(close),
  volume: '1000',
}))
const trendRun = (input) => execute({ operation: 'trendState', asOf: trendAsOf, input })
const trendHas = (answer, code) => answer.diagnostics.some((row) => row.code === code)

/** ⑴ Vendor-shaped bars are refused, and the two operations now agree they are unreadable. */
const vendorTrend = trendRun({ symbol: '069500', bars: vendorBars })
assert.equal(vendorTrend.data.state, 'insufficient_data', 'a state read off unparsed bars is not a state')
assert.equal(vendorTrend.data.trancheGuidance, undefined, 'and a hard stop is never issued on a reading that was not taken')
assert.notEqual(vendorTrend.status, 'ok', 'the run is told, rather than handed a confident verdict')
assert.ok(trendHas(vendorTrend, 'bar_value_invalid'), 'the same code its sibling raises on the same rows')
assert.ok(trendHas(vendorTrend, 'trend_bars_unreadable'))
assert.equal(vendorTrend.data.barsRejected, 200)
assert.equal(
  execute({ operation: 'indicators', asOf: trendAsOf, input: { bars: vendorBars } }).diagnostics.filter((row) => row.code === 'bar_value_invalid').length,
  vendorTrend.data.barsRejected,
  'the control: `indicators` and `trendState` refuse exactly the same rows',
)

/** ⑵ The same series in the published numeric shape answers, and the averages compute. */
const numericTrend = trendRun({ symbol: '069500', bars: numericBars })
assert.equal(numericTrend.status, 'ok')
assert.equal(numericTrend.data.state, 'UPTREND')
assert.equal(numericTrend.data.trancheGuidance, 'small_or_wait')
for (const key of ['close', 'ma20', 'ma50', 'ma200']) {
  assert.ok(Number.isFinite(numericTrend.data[key]), `${key} computed; the null that made the wrong answer look arithmetic is gone`)
}
assert.equal(numericTrend.data.goldenCross, true)

/** ⑶ One bad row in two hundred is enough: this gate does not average over what it could read. */
const oneBadRow = trendRun({ symbol: '069500', bars: [...numericBars.slice(0, 199), { ...numericBars[199], close: 'x' }] })
assert.equal(oneBadRow.data.state, 'insufficient_data')
assert.equal(oneBadRow.data.barsRejected, 1)
assert.ok(trendHas(oneBadRow, 'trend_bars_unreadable'))

/** ⑷ The second belt: no computed MA200, no state and no guidance — whatever left it null. */
const shortHistory = trendRun({ symbol: '069500', bars: numericBars.slice(0, 50) })
assert.equal(shortHistory.data.state, 'insufficient_data')
assert.equal(shortHistory.data.trancheGuidance, undefined)
assert.ok(trendHas(shortHistory, 'trend_history_insufficient'))

/** ⑸ And the row shape is published, so the next caller does not have to guess it. */
const trendContract = execute({ operation: 'inputContracts', asOf: trendAsOf, input: {} }).data
assert.ok(trendContract.nested.trendState, 'trendState publishes the shape its key list cannot show')
assert.deepEqual(
  trendContract.nested.trendState['bars[]'],
  { date: 'string', open: 'number', high: 'number', low: 'number', close: 'number', volume: 'number' },
)
assert.ok(/closePrice/.test(trendContract.nested.trendState.barShape), 'the vendor shape is named as the one that is refused')

console.log('evidence-gated issue #180 trend-gate bar-validation regression tests passed')

/**
 * ── #173: the sector axis accumulated empty and the answer said `ok` ────────
 *
 * `concentration` reads the sector axis as a **singular string** and the theme
 * and factor axes as **arrays**. The singular `theme` had been refused since
 * #147; the plural `sectors` was read by nothing and refused by nothing. The
 * measured call (run `run_73a3e6c41c204f468ee8be8d2923d898`, asOf
 * 2026-09-07T01:10:07.572Z) passed `sectors: ["kr-broad-equity"]` beside
 * `themes` and `factors` that were read, and came back `exposures.sector: {}`,
 * **no diagnostic**, `status: ok` — a declared sector cap compared against
 * nothing at all.
 *
 * ⛔ The control that makes it a defect rather than a preference: changing that
 * **one field** to the singular and nothing else fills the axis. The two calls
 * differ by a spelling, and one of them silently drops a cap.
 *
 * That run held a single labelled core ETF and was harmless. The direction is
 * not: the axis a cap is not applied to is the axis a breach passes on, and a
 * sector cap only binds a book that holds several single names — the book this
 * methodology exists to build.
 */
const concAsOf = '2026-09-07T01:10:07.572Z'
const concCaps = { position: 0.2, sector: 0.35, theme: 0.4, factor: 0.15, portfolioHeat: 0.06 }
const concRun = (input) => execute({ operation: 'concentration', asOf: concAsOf, input })
const concHas = (answer, code) => answer.diagnostics.some((row) => row.code === code)
const measuredRow = { symbol: '069500', weight: 0.04352020131413393, core: true, themes: ['kr-market-beta'], factors: ['kr-large-cap-blend'] }

/** ⑴ Control A, verbatim: the plural is refused now instead of being dropped. */
const pluralSectors = concRun({ positions: [{ ...measuredRow, sectors: ['kr-broad-equity'] }], proposed: [], caps: concCaps, config: {} })
assert.equal(pluralSectors.status, 'blocked', 'a spelling the operation does not read is refused, never absorbed into an empty axis')
assert.ok(concHas(pluralSectors, 'input_shape_invalid'))
assert.equal(pluralSectors.diagnostics.find((row) => row.code === 'input_shape_invalid').path, 'input.positions[0].sectors')
assert.equal(pluralSectors.data, null, '⛔ and no exposures map is returned at all: an answer computed off a shape that was refused is the defect, not the report of it')

/** ⑵ Control B, verbatim: the singular is what fills the axis, one field apart. */
const singularSector = concRun({ positions: [{ ...measuredRow, sector: 'kr-broad-equity' }], proposed: [], caps: concCaps, config: {} })
assert.equal(singularSector.status, 'ok')
assert.deepEqual(singularSector.data.exposures.sector, { 'kr-broad-equity': 0.0435202 })
assert.equal(singularSector.diagnostics.length, 0, 'a fully labelled row against declared caps says nothing, which is what a clean axis is allowed to look like')

/** ⑶ The three axes are one rule now; each wrong spelling is named on its own path. */
for (const [field, value, path] of [
  ['sectors', ['a'], 'input.positions[0].sectors'],
  ['theme', 'a', 'input.positions[0].theme'],
  ['factor', 'a', 'input.positions[0].factor'],
  ['sector', ['a'], 'input.positions[0].sector'],
  ['themes', 'a', 'input.positions[0].themes'],
  ['factors', 'a', 'input.positions[0].factors'],
]) {
  const wrong = concRun({ positions: [{ symbol: 'AAA', weight: 0.05, [field]: value }], caps: concCaps })
  assert.equal(wrong.status, 'blocked', `${field} is refused`)
  assert.ok(wrong.diagnostics.some((row) => row.code === 'input_shape_invalid' && row.path === path), `${field} is named at ${path}`)
}
/** `proposed` is the same shape and is guarded by the same rule. */
assert.equal(concRun({ positions: [], proposed: [{ symbol: 'AAA', weight: 0.05, sectors: ['a'] }], caps: concCaps }).status, 'blocked')

/**
 * ⑷ A breach the plural would have hidden. Three names at 0.15 each on one
 * sector is 0.45 against a 0.35 cap; spelled `sectors` before this fix it was
 * `status: ok` with an empty sector map and no diagnostic.
 */
const breachRows = ['AAA', 'BBB', 'CCC'].map((symbol) => ({ symbol, weight: 0.15, sector: 'semiconductors', themes: ['ai'], factors: ['ai-capex'], stopLossPct: 0.05 }))
const wideCaps = { ...concCaps, position: 0.5, theme: 0.9, factor: 0.9 }
const realBreach = concRun({ positions: [breachRows[0]], proposed: breachRows.slice(1), caps: wideCaps })
assert.deepEqual(realBreach.data.breaches.map((row) => row.kind), ['sector'], 'the sector cap binds')
assert.equal(realBreach.status, 'blocked')
assert.equal(concRun({ positions: breachRows.map(({ sector, ...rest }) => ({ ...rest, sectors: [sector] })), caps: wideCaps }).status, 'blocked', 'and the plural spelling of the same book is refused rather than passed')

/**
 * ⑸ The other half: a cap the investor **did** declare, over rows that carry no
 * label on that axis. `concentration_cap_missing` said *nobody declared a cap*
 * and there was no sentence for this, so both produced the same empty map.
 * ⛔ `unevaluated`, never `blocked` — this package declares no labels of its
 * own and refusing a book for the absence of one would be inventing the
 * classification. What it may not do is stay silent.
 */
const unlabelled = concRun({ positions: [{ symbol: 'AAA', weight: 0.5, stopLossPct: 0.1 }], caps: concCaps })
assert.equal(unlabelled.status, 'unevaluated', '«nobody said what this is» is not «measured and under the cap»')
const stated = unlabelled.diagnostics.filter((row) => row.code === 'concentration_labels_unstated')
assert.deepEqual(stated.map((row) => row.details.axis), ['sector', 'theme', 'factor'])
assert.ok(stated.every((row) => row.severity === 'unevaluated' && row.details.symbols.includes('AAA') && row.details.unlabelledWeight === 0.5))
assert.deepEqual(unlabelled.data.unlabelled.sector, { symbols: ['AAA'], weight: 0.5 })
/** An axis with no cap is already answered by `concentration_cap_missing`; it is not said twice. */
const noSectorCap = concRun({ positions: [{ symbol: 'AAA', weight: 0.5, themes: ['ai'], factors: ['ai-capex'] }], caps: { ...concCaps, sector: undefined } })
assert.ok(concHas(noSectorCap, 'concentration_cap_missing'))
assert.equal(noSectorCap.diagnostics.some((row) => row.code === 'concentration_labels_unstated'), false)
/** Parked liquidity is off these axes (#141), so it has no label to be missing. */
const parked = concRun({ positions: [{ symbol: '153130', weight: 0.27052, parkedLiquidity: true }, { symbol: 'AAA', weight: 0.05, sector: 'index', themes: ['beta'], factors: ['kr-equity-beta'] }], caps: { ...concCaps, position: 0.5 } })
assert.equal(parked.diagnostics.some((row) => row.code === 'concentration_labels_unstated'), false, 'a cash equivalent is on no shared loss path and is not an unstated label')
assert.deepEqual(parked.data.unlabelled.sector.symbols, [])

/** ⑹ And the row shape is published, so the plural is not a guess the next caller has to make. */
const concContract = execute({ operation: 'inputContracts', asOf: concAsOf, input: {} }).data
assert.ok(concContract.nested.concentration['positions[]'], 'concentration publishes the row shape its key list cannot show')
assert.equal(concContract.nested.concentration['positions[]'].sector, 'string')
assert.equal(concContract.nested.concentration['positions[]'].themes, 'array')
assert.equal(concContract.nested.concentration['positions[]'].factors, 'array')
assert.ok(/sectors \(plural\)/.test(concContract.nested.concentration.rowShape), 'the refused spelling is named')
assert.ok(/concentration_labels_unstated/.test(concContract.nested.concentration.rowShape))

console.log('evidence-gated issue #173 concentration label-axis regression tests passed')

/**
 * ── #174: a sleeve budget nobody could pay for, reported as «within budget» ──
 *
 * The measured call, byte for byte (run `run_73a3e6c41c204f468ee8be8d2923d898`,
 * asOf 2026-09-07T01:10:07.572Z). Before this fix it answered `status: ok`,
 * `withinBriefBudget: true` and **no diagnostic** over a us-sleeve budget of
 * ~USD 3,979 on a book holding USD 294.02 in idle dollars: `portfolio_read`'s
 * aggregate `cash` read USD 8,596.10 and 96.6% of it was won.
 */
const budgetAsOf = '2026-09-07T01:10:07.572Z'
const sleeveBudget = (input) => execute({ operation: 'specialistBudget', asOf: budgetAsOf, input })
const theBook = { managerId: 'evidence-gated', flow: 'us-sleeve', market: 'XNYS', currentSleeveWeight: 0.11370454, sleeveBudgetWeight: 0.26488897, requestedTargetWeight: 0 }
const procurement = { sleeveCashByCurrency: { KRW: 11_115_231, USD: 294.02 }, portfolioNav: 20_111_198.88, portfolioNavCurrency: 'KRW', fx: { USDKRW: 1352.6 } }

/** ⑴ Silence is no longer a pass: the same call names the key it is waiting for. */
const unsaid = sleeveBudget(theBook)
assert.equal(unsaid.status, 'unevaluated', 'a budget whose procurement nobody stated is not «within budget»')
const waiting = unsaid.diagnostics.find((row) => row.code === 'sleeve_budget_fundability_unevaluated')
assert.deepEqual(waiting.details.missing, ['sleeveCashByCurrency', 'portfolioNav', 'portfolioNavCurrency'], 'each key is named, because they fail independently')
assert.equal(unsaid.data.budgetFundableInSleeveCurrency, null, 'null beside withinBriefBudget: true — two different questions, and only one was answered')
assert.equal(unsaid.data.withinBriefBudget, true, '⛔ the ratio comparison itself is unchanged')
assert.equal(unsaid.data.sleeveCurrency, 'USD', 'and the currency is derived from the market even when nothing else was supplied')

/** ⑵ The book as it actually stood: the budget is not procurable in USD. */
const measuredBudget = sleeveBudget({ ...theBook, ...procurement })
assert.equal(measuredBudget.data.fundableAmount, 294.02, 'the sleeve is paid in USD and this is what the book holds of it')
assert.equal(measuredBudget.data.budgetFundableInSleeveCurrency, false)
assert.equal(measuredBudget.data.requestFundableInSleeveCurrency, true, 'this particular request was a decrease and needed nothing')
assert.equal(measuredBudget.data.fxBasis, 'input.fx.USDKRW', 'the rate is the invocation\'s and the answer says so')
assert.equal(measuredBudget.data.fxUsed, 1352.6)
const shortfall = measuredBudget.diagnostics.find((row) => row.code === 'sleeve_budget_not_fundable_in_currency')
assert.equal(shortfall.severity, 'unevaluated', '⛔ a warning and never a block: converting currency is a legitimate move')
assert.equal(shortfall.details.subject, 'sleeveBudget')
assert.equal(shortfall.details.sleeveCurrency, 'USD')
assert.equal(shortfall.details.requiredAmount, 2247.89, 'the budget headroom priced in the currency it settles in')
assert.equal(shortfall.details.shortfallAmount, 1953.87, 'and what a sale in the other currency, or an FX conversion, would have to produce')
assert.equal(measuredBudget.data.allowed, true, 'the operation still allows: this is the investor\'s decision and the allocate flow\'s')

/** ⑶ The binding case the issue names: the first USD buy that reaches past the dollars. */
const firstBuy = sleeveBudget({ ...theBook, ...procurement, requestedTargetWeight: 0.26 })
assert.deepEqual(
  firstBuy.diagnostics.filter((row) => row.code === 'sleeve_budget_not_fundable_in_currency').map((row) => row.details.subject),
  ['sleeveBudget', 'requestedTarget'],
  'the budget and the order fail on different days and are reported separately',
)
assert.equal(firstBuy.data.requestFundableInSleeveCurrency, false)
assert.equal(firstBuy.data.withinBriefBudget, true, '⚠️ this is the sentence #174 is about: inside the Brief budget, and not payable')

/** ⑷ A book that does hold the dollars says nothing. */
const funded = sleeveBudget({ ...theBook, ...procurement, sleeveCashByCurrency: { KRW: 11_115_231, USD: 4000 }, requestedTargetWeight: 0.2 })
assert.equal(funded.status, 'ok')
assert.equal(funded.diagnostics.length, 0, 'a procurable budget is not a warning')
assert.equal(funded.data.budgetFundableInSleeveCurrency, true)

/** ⑸ The KR sleeve is paid in won, and needs no rate at all. */
const krLeg = sleeveBudget({ ...theBook, flow: 'kr-sleeve', market: 'XKRX', currentSleeveWeight: 0.8667, sleeveBudgetWeight: 0.4205039, requestedTargetWeight: 0.4, sleeveCashByCurrency: { KRW: 11_115_231, USD: 294.02 }, portfolioNav: 20_111_198.88, portfolioNavCurrency: 'KRW' })
assert.equal(krLeg.data.sleeveCurrency, 'KRW')
assert.equal(krLeg.data.fxBasis, 'not-required', 'no conversion, so no rate is missing')
assert.equal(krLeg.diagnostics.some((row) => row.code === 'sleeve_budget_fundability_unevaluated'), false)

/** ⑹ An emergency exit is not funded — it produces cash — and is not warned about. */
const urgent = sleeveBudget({ ...theBook, currentSleeveWeight: 0.26, requestedTargetWeight: 0.1, emergencyExit: true })
assert.equal(urgent.diagnostics.length, 0, 'an exit is asked for no procurement')
assert.equal(urgent.data.allowed, true)

/** ⑺ The aggregate is refused by name: it is the shape that hid this. */
const aggregate = sleeveBudget({ ...theBook, ...procurement, sleeveCashByCurrency: 8596.1 })
assert.equal(aggregate.status, 'blocked')
assert.ok(aggregate.diagnostics.some((row) => row.code === 'input_shape_invalid' && row.path === 'input.sleeveCashByCurrency'))
/** ⚠️ And the rows the invocation actually carries are read, not only the object form. */
const cashRows = sleeveBudget({ ...theBook, ...procurement, sleeveCashByCurrency: [{ currency: 'KRW', amount: 11_115_231 }, { currency: 'USD', amount: 294.02 }] })
assert.equal(cashRows.data.fundableAmount, 294.02)
/** A currency with no row is zero of it, which is the finding rather than a gap in it. */
assert.equal(sleeveBudget({ ...theBook, ...procurement, sleeveCashByCurrency: { KRW: 11_115_231 } }).data.fundableAmount, 0)

/** ⑻ The shape is published, so the next caller does not have to guess it. */
const budgetContract = execute({ operation: 'inputContracts', asOf: budgetAsOf, input: {} }).data
assert.equal(budgetContract.contracts.specialistBudget.keys.portfolioNav, 'number')
assert.ok(/cashByCurrency/.test(budgetContract.nested.specialistBudget.sleeveCashByCurrency))
assert.ok(/never declared/.test(budgetContract.nested.specialistBudget.sleeveCurrency), 'the currency is derived from the market and the contract says so')
assert.ok(/carries no currency/.test(budgetContract.nested.specialistBudget.budget), 'and the budget itself stays a ratio — aumos#689')

console.log('evidence-gated issue #174 sleeve-budget procurement regression tests passed')

/**
 * ── Issue #177: four more shapes that came back looking like answers ────────
 *
 * The pattern this file is named after, measured four more times on
 * `run_73a3e6c41c204f468ee8be8d2923d898`. Each of the four was answered — a
 * NAV, a macro verdict, a refusal, a sentinel verdict — and each answer was
 * about a call the operation had not read.
 */
const shapeAsOf = '2026-09-07T01:10:07.572Z'
const shape = (operation, input) => execute({ operation, asOf: shapeAsOf, input })
const contract = shape('inputContracts', {}).data

/* ── ⑫ a position's value carries its own currency ────────────────────────── */

/**
 * The book as `portfolio_read` hands it over: a USD-based book holding two KRW
 * listings, every `marketValue` marked in the book's base currency with
 * `valueCurrency` beside it. Before this, `valueCurrency` sat in a row of a
 * `named` operation — where an unknown key at the top is reported and one
 * inside a row is not seen at all — and the dollars were added to the won
 * bucket at face value.
 */
const USDKRW = 1338.848
const navCash = [{ currency: 'KRW', amount: 11_115_231 }, { currency: 'USD', amount: 294.02 }]
const markedInUsd = [
  { symbol: '069500', currency: 'KRW', marketValue: 653.73, valueCurrency: 'USD' },
  { symbol: '153130', currency: 'KRW', marketValue: 4063.43, valueCurrency: 'USD' },
  { symbol: 'SGOV', currency: 'USD', marketValue: 785.93, valueCurrency: 'USD' },
]
const marked = shape('sleeveNav', { cash: navCash, positions: markedInUsd, fx: { USDKRW } })
assert.equal(marked.status, 'ok')
assert.equal(marked.data.krwSleeveNav, 17_430_791.23, 'the KRW sleeve is the won the dollars convert to, not the dollars themselves')
assert.notEqual(marked.data.krwSleeveNav, 11_119_948.16, '⚠️ this is the number the measured run got back with status ok and no diagnostic')
assert.equal(marked.data.marketValueBasis, 'stated', 'every counted row said what unit it was in')
assert.equal(marked.data.fxUsed, USDKRW)
assert.equal(marked.data.fxBasis, 'input.fx.USDKRW', 'the rate is the invocation\'s and the answer says where it came from')

/** ⚠️ Converted by hand and passed in won: the same NAV, which is the cross-check. */
const converted = shape('sleeveNav', {
  cash: navCash,
  positions: markedInUsd.map((row) => ({ symbol: row.symbol, currency: row.currency, marketValue: row.currency === 'KRW' ? row.marketValue * USDKRW : row.marketValue })),
  fx: { USDKRW },
})
assert.equal(converted.data.krwSleeveNav, marked.data.krwSleeveNav, 'stating the unit and converting by hand are the same book')
assert.equal(converted.data.marketValueBasis, 'assumed-position-currency', 'and the answer says which reading it took')
assert.equal(converted.data.usdSleeveNav, marked.data.usdSleeveNav)

/** ⛔ A value that cannot be put in its sleeve's currency is dropped and named, never added at face value. */
const rateless = shape('sleeveNav', { cash: navCash, positions: markedInUsd })
assert.equal(rateless.data.krwSleeveNav, 11_115_231, 'the two dollar-marked KRW rows are left out rather than counted as won')
assert.equal(rateless.data.valuedPositionCount, 1)
assert.equal(rateless.data.fxBasis, null)
assert.ok(rateless.diagnostics.some((row) => row.code === 'position_value_unevaluated' && row.path === 'fx.USDKRW'))
const unreadableUnit = shape('sleeveNav', { positions: [{ symbol: '069500', currency: 'KRW', marketValue: 653.73, valueCurrency: 'JPY' }], fx: { USDKRW } })
assert.equal(unreadableUnit.data.krwSleeveNav, 0)
assert.ok(unreadableUnit.diagnostics.some((row) => row.code === 'position_value_unevaluated' && row.path === 'positions[0].valueCurrency'))

/** ⛔ Any other currency-named key on the row is refused: an unread unit is a number added at face value. */
const strayUnit = shape('sleeveNav', { positions: [{ symbol: '069500', currency: 'KRW', marketValue: 653.73, baseCurrency: 'USD' }], fx: { USDKRW } })
assert.equal(strayUnit.status, 'blocked')
assert.ok(strayUnit.diagnostics.some((row) => row.code === 'input_shape_invalid' && row.path === 'input.positions[0].baseCurrency'))
assert.equal(strayUnit.data, null)

/** And the shape is published, so the next caller does not have to guess it. */
assert.equal(contract.nested.sleeveNav['positions[]'].valueCurrency, 'string')
assert.ok(/1,338\.848/.test(contract.nested.sleeveNav.valueCurrency), 'the contract names what the assumption cost')

/* ── ⑬ the macro vocabulary, and the field it is keyed by ─────────────────── */

const macroRow = { value: 3, observedAt: '2026-09-01T00:00:00.000Z', sourceUrl: 'https://www.bok.or.kr/', sourceTier: 'official' }
const misspelled = shape('validateMacro', { observations: [{ ...macroRow, metric: 'policyRate' }], webAvailable: true })
assert.equal(misspelled.status, 'blocked', '⚠️ `officialCount: 0` / `macroLaneAvailable: false` is a verdict about the world; this call could not be read')
assert.ok(misspelled.diagnostics.some((row) => row.code === 'input_shape_invalid' && row.path === 'input.observations[0].metric'))
assert.equal(misspelled.data, null)
const spelled = shape('validateMacro', { observations: [{ ...macroRow, indicator: 'policy-rate' }], webAvailable: true })
assert.equal(spelled.status, 'ok')
assert.equal(spelled.data.officialCount, 1)
assert.equal(spelled.data.macroLaneAvailable, true)

/** An indicator outside the closed list is still `unevaluated` — and now says what the list is. */
const unknownIndicator = shape('validateMacro', { observations: [{ ...macroRow, indicator: 'policyRate' }], webAvailable: true })
assert.equal(unknownIndicator.status, 'unevaluated')
const refusal = unknownIndicator.diagnostics.find((row) => row.code === 'macro_indicator_unknown')
assert.deepEqual(refusal.details.supported, MACRO_INDICATORS, 'the vocabulary travels with the refusal')

/** ⚠️ The list is published, projected from the module that owns it rather than copied. */
assert.deepEqual(contract.vocabulary.macroIndicators, [...MACRO_INDICATORS])
assert.ok(contract.vocabulary.macroIndicators.includes('policy-rate'))
assert.equal(contract.nested.validateMacro['observations[]'].indicator, 'string')

/* ── ⑭ the manager id is a literal, not an instance id ────────────────────── */

const withInstanceId = shape('specialistBudget', {
  managerId: 'inst_6efcc6a0486a42478702a1c247e6d921',
  flow: 'us-sleeve', market: 'XNAS', currentSleeveWeight: 0.15, sleeveBudgetWeight: 0.2, requestedTargetWeight: 0.18,
})
assert.equal(withInstanceId.status, 'blocked')
const idRefusal = withInstanceId.diagnostics.find((row) => row.code === 'manager_id_unknown')
assert.deepEqual(idRefusal.details.supported, [MANAGER_ID], 'the accepted value travels with the refusal')
assert.ok(/not the instance id/.test(idRefusal.message))
assert.deepEqual(contract.vocabulary.managerIds, [MANAGER_ID], '⚠️ published, because `managerId: "string"` was the whole contract')
assert.ok(/instance id/.test(contract.nested.specialistBudget.managerId))
/** ⚠️ Omitting it is the safe call, and stays so. */
assert.equal(shape('specialistBudget', { flow: 'us-sleeve', market: 'XNAS', currentSleeveWeight: 0.15, sleeveBudgetWeight: 0.2, requestedTargetWeight: 0.18 }).data.managerId, MANAGER_ID)

/* ── ⑮ the threshold is `level` and the reading is `value` ────────────────── */

/**
 * A price 20% through a registered invalidation. Written under the near-miss
 * spellings the rule joined its evidence and came back `unevaluated` — *"Rule
 * and evidence are not comparable"* — and the sentinel verdict was `watch`.
 */
const nearMiss = shape('thesisSentinel', {
  invalidations: [{ id: 'inv-1', kind: 'price_below', threshold: 100, evidenceId: 'ev-1' }],
  evidence: [{ id: 'ev-1', observed: 80, observedAt: '2026-09-06T00:00:00.000Z' }],
})
assert.equal(nearMiss.status, 'blocked')
assert.equal(nearMiss.data, null, '⛔ never `watch` over a breach nobody could read')
assert.deepEqual(
  nearMiss.diagnostics.filter((row) => row.code === 'input_shape_invalid').map((row) => row.path),
  ['input.invalidations[0].threshold', 'input.evidence[0].observed', 'input.evidence[0].observedAt'],
  'each near-miss named where it sits',
)
const readable = shape('thesisSentinel', {
  invalidations: [{ id: 'inv-1', kind: 'price_below', level: 100, evidenceId: 'ev-1' }],
  evidence: [{ id: 'ev-1', value: 80, availableAt: '2026-09-06T00:00:00.000Z' }],
})
assert.equal(readable.status, 'ok')
assert.equal(readable.data.verdict, 'threatened', 'the same breach, spelled in the fields this operation reads')
assert.ok(/`level`/.test(contract.nested.thesisSentinel.fieldNames))
assert.ok(/availableAt/.test(contract.nested.thesisSentinel.fieldNames))

console.log('evidence-gated issue #177 input-shape regression tests passed')

/**
 * ── Issue #176: the grade travels from the receipt to the claim ────────────
 *
 * The same run again, and the same shape of failure one level down. The
 * markers that grade a web reading — `evidenceKind`, `evidenceSource` — are on
 * the **receipt** `observation_file` returned; a claim carries the id and the
 * value. Graded off its own fields, every ordinarily written claim came back
 * `ungraded`, `strongestClaimAttestation: "ungraded"`, `status: "ok"`,
 * `diagnostics: []` — and that grade is the input to the main lane's
 * `main_lane_rests_on_manager_attestation` disclosure, which `PROMPT.md` §2
 * says holds *only while the grade reaches the approval screen*.
 *
 * ⚠️ Filling in `contentHash` changed nothing: the hash was a second finding
 * and the issue measured both arms to establish that.
 */
const ledgerFixture = JSON.parse(await readFile(new URL('../managers/evidence-gated/fixtures/observation-contract.json', import.meta.url), 'utf8')).bokRateCase
const ledger = (input) => execute({ operation: 'observationLedger', asOf: ledgerFixture.asOf, input })
const receipt = ledgerFixture.observation
const claimOf = (extra = {}) => ({ ...ledgerFixture.claim, ...extra })

/* ── ⑯ a claim citing a filed receipt is graded by that receipt ───────────── */

const propagated = ledger({
  observations: [receipt],
  citedEvidenceIds: [receipt.evidenceId],
  claims: [claimOf({ evidenceId: receipt.evidenceId })],
})
assert.equal(propagated.data.filed[0].grade, 'manager')
assert.equal(propagated.data.claims[0].grade, 'manager', 'the measured defect: the receipt is the manager’s word and so is the claim standing on it')
assert.equal(propagated.data.claims[0].gradeFrom, 'observation')
assert.equal(propagated.data.claims[0].statedGrade, 'ungraded', 'what the claim itself said is kept — the resolution is visible rather than assumed')
assert.equal(propagated.data.strongestClaimAttestation, 'manager')
assert.deepEqual(propagated.data.claimAttestation, { aumos: 0, manager: 1, ungraded: 0, uncited: 0 })
assert.deepEqual(propagated.data.claimsGradedFromFiling, ['bokBaseRatePct'])
assert.deepEqual(propagated.data.claimsGradeUnstated, [])
assert.equal(propagated.status, 'ok')

/** ⛔ Nothing is upgraded on the way: a vendor row cited by a claim stays vendor evidence. */
const vendorReceipt = { ...receipt, evidenceId: 'ev_dart_filing', evidenceKind: 'fundamentals', evidenceSource: 'open-dart' }
const vendorClaim = ledger({
  observations: [vendorReceipt],
  citedEvidenceIds: [vendorReceipt.evidenceId],
  claims: [claimOf({ evidenceId: vendorReceipt.evidenceId })],
})
assert.equal(vendorClaim.data.claims[0].grade, 'aumos')

/**
 * ⚠️ **The absence is named, and there are two of them.** A quiet `ungraded`
 * for both would have rebuilt the defect one level down: *this run filed no
 * receipt under that id* and *the receipt carries no markers* are different
 * facts, and only the first one is unanswerable here.
 */
const unfiledId = ledger({
  observations: [receipt],
  citedEvidenceIds: [receipt.evidenceId, 'ev_vendor_row'],
  claims: [claimOf({ evidenceId: 'ev_vendor_row' })],
})
assert.equal(unfiledId.data.claims[0].grade, 'ungraded')
assert.equal(unfiledId.data.claims[0].gradeFrom, null, 'nothing in this call answered the question')
assert.deepEqual(unfiledId.data.claimsGradeUnstated, ['bokBaseRatePct'])
assert.ok(has(unfiledId, 'claim_grade_unstated'))
assert.equal(unfiledId.status, 'unevaluated', '⛔ and «nobody said» is not a pass')
assert.equal(unfiledId.data.claims[0].carried, true, 'the id was submitted — this finding is about the grade and nothing else')

const ungradedReceipt = { evidenceId: receipt.evidenceId, url: receipt.url, title: receipt.title, publishedAt: receipt.publishedAt, contentHash: receipt.contentHash, excerptChars: receipt.excerptChars }
const receiptLostMarkers = ledger({
  observations: [ungradedReceipt],
  citedEvidenceIds: [receipt.evidenceId],
  claims: [claimOf({ evidenceId: receipt.evidenceId })],
})
assert.equal(receiptLostMarkers.data.claims[0].grade, 'ungraded')
assert.equal(receiptLostMarkers.data.claims[0].gradeFrom, 'observation', 'the ledger did answer; the answer is that the receipt says nothing')
assert.deepEqual(receiptLostMarkers.data.claimsGradeUnstated, [], '⛔ not this absence — the fault is at the receipt and it is reported there')
assert.ok(has(receiptLostMarkers, 'observation_grade_unexpected'))
assert.equal(has(receiptLostMarkers, 'claim_grade_unstated'), false)

/** A claim that carries the markers itself is still read off them — the receipt is one route, not the only one. */
const statedOnClaim = ledger({
  observations: [],
  citedEvidenceIds: [receipt.evidenceId],
  claims: [claimOf({ evidenceId: receipt.evidenceId, evidenceKind: 'observation', evidenceSource: 'manager:web-research' })],
})
assert.equal(statedOnClaim.data.claims[0].grade, 'manager')
assert.equal(statedOnClaim.data.claims[0].gradeFrom, 'claim')
assert.equal(has(statedOnClaim, 'claim_grade_unstated'), false)

/**
 * ⛔ **And a receipt that lost its markers does not pull the claim down with
 * it.** `ungraded` is not a low grade, it is the question unanswered; letting
 * it outrank a stated one would be this defect again with the arrows reversed.
 */
const claimOverUngradedReceipt = ledger({
  observations: [ungradedReceipt],
  citedEvidenceIds: [receipt.evidenceId],
  claims: [claimOf({ evidenceId: receipt.evidenceId, evidenceKind: 'observation', evidenceSource: 'manager:web-research' })],
})
assert.equal(claimOverUngradedReceipt.data.filed[0].grade, 'ungraded')
assert.equal(claimOverUngradedReceipt.data.claims[0].grade, 'manager', 'the claim answered and the receipt did not; the answer stands')
assert.equal(claimOverUngradedReceipt.data.claims[0].gradeFrom, 'claim')
assert.equal(has(claimOverUngradedReceipt, 'claim_grade_conflicts_with_filing'), false, 'silence is not a disagreement')

/**
 * ⛔ One id is one row and has one grade. A claim calling a filed observation
 * vendor evidence is malformed, and the safe reading is the one that does not
 * promote the manager's own testimony into something Aumos obtained.
 */
const conflicting = ledger({
  observations: [receipt],
  citedEvidenceIds: [receipt.evidenceId],
  claims: [claimOf({ evidenceId: receipt.evidenceId, evidenceKind: 'fundamentals', evidenceSource: 'open-dart' })],
})
assert.equal(conflicting.data.claims[0].statedGrade, 'aumos')
assert.equal(conflicting.data.claims[0].grade, 'manager', 'the weaker of the two answering grades')
assert.equal(conflicting.data.claims[0].gradeFrom, 'observation')
const gradeConflict = conflicting.diagnostics.find((row) => row.code === 'claim_grade_conflicts_with_filing')
assert.equal(gradeConflict.details.statedGrade, 'aumos')
assert.equal(gradeConflict.details.filedGrade, 'manager')

/** ⚠️ Published, because the receipt is what the caller has to keep and `claims: "array"` said none of it. */
const ledgerContract = shape('inputContracts', {}).data.nested.observationLedger
assert.equal(ledgerContract['observations[]'].contentHash, 'string')
assert.equal(ledgerContract['claims[]'].evidenceId, 'string')
assert.ok(/passed back here/.test(ledgerContract.receipt), 'the hash cannot be recomputed here, so the contract says to keep it')
assert.ok(/claim_grade_unstated/.test(ledgerContract.grade))

console.log('evidence-gated issue #176 attestation-propagation regression tests passed')

/**
 * #170: the radar's `valuation` axis is reported and gates nothing, and the
 * answer says so.
 *
 * It was computed on every candidate and read by no lane, no `eligible` and no
 * rank — the same shape as #141's `parkedLiquidity`, which arrived on every row
 * and was read by nothing, from the other side: there a value nobody read was
 * silently spending a budget, here a value nobody reads is silently read by the
 * *reader* as a verdict. The property below is what keeps the two halves honest
 * at once: the numbers move by eight orders of magnitude and every verdict on
 * the answer is byte-identical, and the axis declares that rather than leaving
 * it to be noticed.
 *
 * ⚠️ The invariance assertion is the one that has to survive a lane being added
 * later. If a `value-rerating` lane is ever pre-registered, this case is what
 * says so out loud — it fails, and the declaration below has to change with it.
 */
const radarValuationCandidate = (valuation) => ({
  asset: 'VAL', market: 'us', sector: 'tech',
  filings: [
    { periodEnd: '2026-03-31', availableAt: '2026-05-01T00:00:00Z', operatingIncomeYoy: -0.1, marginDeltaYoy: 0.01 },
    { periodEnd: '2026-06-30', availableAt: '2026-08-01T00:00:00Z', operatingIncomeYoy: 0.4, marginDeltaYoy: 0.02 },
  ],
  price: { status: 'confirmed', close: 100, ma50: 110, ma200: 90, offHigh200: -0.1, rs20VsBenchmarkPct: 3 },
  catalysts: [{ windowStart: '2026-09-01', windowEnd: '2026-10-01' }],
  valuation,
})
const radarValuation = (valuation) => execute({ operation: 'upsideRadar', asOf: '2026-09-05T00:00:00Z', input: { candidates: [radarValuationCandidate(valuation)] } })
const cheapRadar = radarValuation({ shares: 1, equity: 1_000_000, debt: 0 })
const dearRadar = radarValuation({ shares: 1_000_000, equity: 1, debt: 900_000 })
assert.ok(cheapRadar.data.ranked[0].axes.valuation.priceToBook < 1, 'the cheap candidate is priced under book')
assert.ok(dearRadar.data.ranked[0].axes.valuation.priceToBook > 1_000_000, 'the dear one is priced at a million times it')
const withoutValuationAxis = (answer) => JSON.stringify(answer.data.ranked.concat(answer.data.unranked).map(({ axes, ...row }) => {
  const { valuation, ...gatingAxes } = axes
  return { ...row, gatingAxes }
}))
assert.equal(
  withoutValuationAxis(cheapRadar),
  withoutValuationAxis(dearRadar),
  'valuation gates nothing: eligibility, every lane verdict and the rank are identical at book and at a million times book',
)
for (const answer of [cheapRadar, dearRadar, radarValuation(undefined)]) {
  const axis = answer.data.ranked.concat(answer.data.unranked)[0].axes.valuation
  assert.equal(axis.gates, false, 'the axis declares that it decides nothing — on the unknown branch too, where a silent axis reads as an unmeasured gate')
  assert.equal(axis.role, 'reported-not-gated')
  assert.deepEqual(answer.data.reportedNotGatedAxes, ['valuation'], 'and the answer repeats it once for a reader holding the whole answer')
}
assert.equal(radarValuation(undefined).data.ranked[0].axes.valuation.status, 'unknown', 'a missing valuation is still never zero-filled')
assert.ok(
  /reported and gates nothing/.test(valContracts.nested.radarCandidates['valuations.<symbol>']),
  'the published input contract says what supplying valuations does and does not do',
)

console.log('evidence-gated issue #170 reported-not-gated valuation axis regression tests passed')

/**
 * ── #183: the paper row's shape is published, and the refusal names the field ──
 *
 * `signalPaper: { rows: "array", state: "object", … }` was the whole published
 * shape of the **only** path to the 30-sample promotion gate, and it is called
 * on every wake. The measured cost on `run_996380fbdd9a41a5bb3d74f3eca761a2`
 * was three round trips of guessing — `{symbol, date, close}`, then `signalAt`,
 * then `setup`/`ruleVersion` — every one of them a `blocked` answer, which is
 * why this is a documentation defect rather than a silent one.
 *
 * ⚠️ **The property is that the published row and the refused row are the same
 * row.** This file's dominant failure is a shape that is enforced and not said
 * or said and not enforced, so the loop below drops each published field from a
 * complete row and requires the two lists to agree: the four the code refuses
 * are exactly the four published as required, and nothing that is merely
 * carried is published as though it were.
 */
const paperAsOf = '2026-03-01T00:00:00Z'
const paperBars = (offset = 0) => Array.from({ length: 8 }, (_, index) => ({
  timestamp: `2026-01-${String(index + 5).padStart(2, '0')}T00:00:00Z`,
  close: 100 + index + offset,
  high: 101 + index + offset,
  low: 99 + index + offset,
}))
const paperRow = () => ({
  symbol: '139260',
  signalAt: '2026-01-06T00:00:00Z',
  setup: 'thesis_call',
  ruleVersion: 'ega-1.0.0',
  bars: paperBars(),
  benchmarkBars: paperBars(1),
})
const paper = (input) => execute({ operation: 'signalPaper', asOf: paperAsOf, input: { horizons: [5], ...input } })
const paperContract = execute({ operation: 'inputContracts', asOf: paperAsOf, input: {} }).data.nested.signalPaper

assert.ok(paperContract, 'signalPaper publishes the shapes its key list cannot show')
assert.deepEqual(
  Object.keys(paperContract['rows[]']),
  ['symbol', 'signalAt', 'setup', 'ruleVersion', 'bars', 'benchmarkBars', 'sectorBars'],
  'the row is published field by field, not as "array"',
)
assert.notEqual(paper({ rows: [paperRow()] }).status, 'blocked', 'the published row is the row this operation accepts')

/** Published-as-required and refused-when-absent are the same four fields. */
const requiredByCode = Object.keys(paperContract['rows[]']).filter((field) => {
  const { [field]: _dropped, ...row } = paperRow()
  return paper({ rows: [row] }).status === 'blocked'
})
assert.deepEqual(requiredByCode, ['symbol', 'signalAt', 'setup', 'ruleVersion'])
for (const field of requiredByCode) assert.ok(new RegExp(`\`${field}\``).test(paperContract.rowShape), `rowShape names ${field}`)

/**
 * ⛔ And the two fields the guessing run added on its third attempt are read by
 * nothing on a row: publishing them as required because a passing call happened
 * to carry them is this file's own defect with the arrows reversed. `cohort` is
 * derived from `setup` and `benchmark` is a series named `benchmarkBars`.
 */
for (const carried of [{ cohort: 'llm-research' }, { benchmark: 'KOSPI' }, { date: '2026-01-06', close: 100 }]) {
  assert.equal(
    JSON.stringify(paper({ rows: [{ ...paperRow(), ...carried }] })),
    JSON.stringify(paper({ rows: [paperRow()] })),
    `${Object.keys(carried).join('/')} on a row changes nothing, and the contract says so rather than requiring it`,
  )
}
assert.ok(/read by nothing here/.test(paperContract.rowShape))

/**
 * ── The refusal names the field, and carries no value (#183) ───────────────
 *
 * `paper_row_metadata_missing` answered at a path of `rows[<i>]` with a
 * sentence about both fields, so a caller who wrote one of the two could not
 * tell which half was the complaint. The sibling check on `admissions` already
 * answered at `admissions[<i>].symbol`.
 */
for (const [dropped, expected] of [['symbol', ['symbol']], ['signalAt', ['signalAt']]]) {
  const { [dropped]: _gone, ...row } = paperRow()
  const refusal = paper({ rows: [row] }).diagnostics.find((entry) => entry.code === 'paper_row_metadata_missing')
  assert.equal(refusal.path, `rows[0].${dropped}`, 'the path names the field that is missing')
  assert.deepEqual(refusal.details.missing, expected)
  assert.ok(new RegExp(dropped).test(refusal.message))
}
const bothMissing = paper({ rows: [{ setup: 'thesis_call', ruleVersion: 'ega-1.0.0', date: '2026-01-06', close: 100 }] })
const bothRefusal = bothMissing.diagnostics.find((entry) => entry.code === 'paper_row_metadata_missing')
assert.deepEqual(bothRefusal.details.missing, ['symbol', 'signalAt'])
assert.deepEqual(Object.keys(bothRefusal.details), ['missing'], 'field names, never the row\'s own values')
assert.equal(bothMissing.status, 'blocked')
assert.deepEqual(
  paper({ rows: [{ ...paperRow(), setup: 'momentum' }] }).diagnostics.find((entry) => entry.code === 'paper_setup_unknown').details.supported,
  execute({ operation: 'inputContracts', asOf: paperAsOf, input: {} }).data.vocabulary.paperSetups,
  'and an unknown setup is answered with the closed list it had to match',
)

/**
 * ── A bar written under `date` is not a bar this operation can read (#183) ──
 *
 * `indicators` and `trendState` accept `date`/`time`/`timestamp`; `forwardOutcome`
 * — which is what scores a paper row — accepts `timestamp` alone. A whole series
 * written under `date` scores nothing and the answer is `forward_base_missing`,
 * *"a last close before signalAt and later bars are required"*, which reads as a
 * window the calendar has not reached rather than a series nobody could parse.
 */
const datedBars = paperBars().map(({ timestamp, ...bar }) => ({ date: timestamp, ...bar }))
const datedRow = paper({ rows: [{ ...paperRow(), bars: datedBars, benchmarkBars: datedBars }] })
assert.ok(has(datedRow, 'forward_base_missing'), 'the divergence is real and this is the shape it takes')
assert.equal(has(paper({ rows: [paperRow()] }), 'forward_base_missing'), false, 'the same bars under `timestamp` score')
assert.ok(/`timestamp`/.test(paperContract.barShape) && /forward_base_missing/.test(paperContract.barShape))

/**
 * ── `state` ignores the §1 envelope, and stores none of it (#204) ───────────
 *
 * Two published readings answered *«pass back what you read from memory»* in
 * opposite directions: `signalPaper`'s `state` refused every field outside its
 * five members, one `input_shape_invalid` / `blocked` per key, while
 * `reconcileArmedReviews`' `previous`, `refutedMemoryRules`' `patterns` and
 * `watchAlertState`' `previous` took the stored record whole. #199 measured the
 * cost — a run that satisfied §1 got `blocked`, `data: null`, seven named paths,
 * no `nextState`, and §5 step 4 then held the prior revision, so the only path
 * to the 30-sample gate stood still once per wake — and wrote the asymmetry into
 * two documents rather than choosing. The owner chose the loose side.
 *
 * ⚠️ **Two properties, and the second is the one #199 was right to worry
 * about.** Accepting the wrapper is only safe if the wrapper cannot be stored
 * again: «write `nextState` back verbatim» and «the stored value carries an
 * envelope» cannot both be rules. `signalPaper` builds `nextState` as a literal
 * of its five members, so the ignoring lives on the reading side alone — and
 * that is asserted here rather than assumed.
 *
 * ⛔ **Ignored is not silent, and it is not blanket.** Each carried field is
 * named back at `info` — «this record never had that field» and «this operation
 * did not read it» are different facts — and every field *outside* the envelope
 * is still refused, because there an unknown key reads as a misspelled member
 * and a misspelled `openWindows` is the #137 erasure.
 */
const envelopeWindow = { symbol: '139260', signalAt: '2026-02-01T00:00:00Z', setup: 'thesis_call', ruleVersion: 'ega-1.0.0' }
const ENVELOPE_FIELDS = ['decisionIds', 'evidenceIds', 'sampleCount', 'independentDateClusterCount', 'computableMetrics', 'missingFields', 'status']
const envelopedState = {
  schemaVersion: 2,
  updatedAsOf: '2026-02-20T00:00:00Z',
  closed: {},
  openWindows: [envelopeWindow],
  maturedThisRun: [],
  decisionIds: ['dec-1'], evidenceIds: ['ev-1'], sampleCount: 1, independentDateClusterCount: 1,
  computableMetrics: {}, missingFields: [], status: 'insufficient',
}
const enveloped = paper({ state: envelopedState })

/* ⑴ the call the run skeleton's own §1 produces now answers. */
assert.notEqual(enveloped.status, 'blocked', 'the §1 envelope is ignored rather than refused')
assert.ok(enveloped.data?.nextState, 'so the wake advances the track instead of holding the prior revision')
assert.equal(enveloped.diagnostics.filter((row) => row.code === 'input_shape_invalid').length, 0)
assert.deepEqual(enveloped.data.nextState.openWindows, [envelopeWindow], 'and the carried window survives the wrapping')

/* ⑵ and nothing of the envelope reaches the value step 4 writes back verbatim. */
assert.deepEqual(
  Object.keys(enveloped.data.nextState).sort(),
  ['closed', 'maturedThisRun', 'openWindows', 'schemaVersion', 'updatedAsOf'],
  'nextState is the five published members: not one envelope field is carried back, so a revision stored wrapped is stored unwrapped from here on',
)
for (const field of ENVELOPE_FIELDS) {
  assert.equal(enveloped.data.nextState[field], undefined, `nextState.${field} would be the wrapper surviving its own reading`)
}
assert.equal(enveloped.data.nextState.schemaVersion, 1, 'and the version is the operation\'s own, not the wrapper\'s 2')

/* ⑶ ignored is said, by name, at a severity that claims nothing about the verdict. */
assert.deepEqual(
  enveloped.diagnostics.filter((row) => row.code === 'input_state_envelope_ignored').map((row) => row.path).sort(),
  ENVELOPE_FIELDS.map((field) => `input.state.${field}`).sort(),
  'each carried field is named — the two the paper record shares, schemaVersion and updatedAsOf, are read and so are not among them',
)
for (const row of enveloped.diagnostics.filter((entry) => entry.code === 'input_state_envelope_ignored')) {
  assert.equal(row.severity, 'info', 'none of the seven takes part in the verdict, so ignoring one is not an answer this run could not reach')
  assert.equal(JSON.stringify(row).includes('dec-1'), false, 'key names, never the values the record carried')
}

/* ⑷ the loosening stops at the envelope. */
const misspelledMember = paper({ state: { openWindow: [envelopeWindow] } })
assert.equal(misspelledMember.status, 'blocked', 'a member misspelled outside the envelope is still refused')
assert.equal(misspelledMember.data, null)
assert.deepEqual(
  misspelledMember.diagnostics.filter((row) => row.code === 'input_shape_invalid').map((row) => row.path),
  ['input.state.openWindow'],
)

/* ⑸ and the published contract says both halves, so a caller need not find them by being refused. */
assert.ok(/input_state_envelope_ignored/.test(paperContract.state), 'the published `state` description names the code the ignoring reports under')
assert.ok(/input_shape_invalid/.test(paperContract.state), 'and says that everything outside the envelope is still refused')

/* ⑹ the reading now generalises: the three sibling keys already answered this way. */
assert.notEqual(
  execute({ operation: 'reconcileArmedReviews', asOf: paperAsOf, input: { previous: { armed: [], schemaVersion: 1, status: 'insufficient', decisionIds: [] } } }).status,
  'blocked',
  'reconcileArmedReviews.previous was already loose — that is the majority this change joins',
)

console.log('evidence-gated issue #183 paper-row shape regression tests passed')
console.log('evidence-gated issue #204 paper-state envelope regression tests passed')

/**
 * ── ④ Execution state is a count, and prose cannot move it (#212 ④) ────────
 *
 * `mandateExecution` decided *«why does this book hold no single name?»* by
 * intersecting `reportedDiagnostics` with a classification table. Three of its
 * four answers came from that intersection, and the positive one —
 * `no-candidate-cleared-the-gates`, *the gates ran, on their inputs, and nothing
 * was worth owning* — was granted by the presence of one `gate-ran` code.
 *
 * ⚠️ **No input to that table counted anything.** So a roster nobody had
 * collected a price series for, plus one gate refusing one name, came back as
 * *the methodology is working* — `untilled/aumos-catalogue#209`'s own error,
 * blindness reported as an absence of opportunity, reached through the check
 * #171 added to stop a different one.
 *
 * What is asserted below is the invariant, in the shape the sibling section
 * above asserts #212 ②'s: **the verdict does not move when only the wording
 * moves.** A diagnostic row carries a `message`, a `path`, a `details` map and a
 * `severity`, all four of them prose or presentation, and a code from outside
 * this operation's vocabulary carries no state either. ⛔ If any of these ever
 * change the answer again, the operation is reading sentences for state.
 */
const executionAsOf = '2026-09-07T00:00:00.000Z'
const executionBook = [
  { symbol: '153130', weight: 0.27052, parkedLiquidity: true, sector: 'fixed-income' },
  { symbol: 'SGOV', weight: 0.1149, parkedLiquidity: true, sector: 'fixed-income' },
  { symbol: '069500', weight: 0.04206, core: true, sector: 'index' },
]
const executionObjective = 'Grow capital by understanding a few companies deeply and buying what the market has mispriced.'
const recordOf = (input) => execute({ operation: 'executionRecord', asOf: executionAsOf, input })
const executionOf = (input) => execute({
  operation: 'mandateExecution',
  asOf: executionAsOf,
  input: { mandateObjective: executionObjective, positions: executionBook, cashWeight: 0.5725, ...input },
})
/**
 * ── The two halves of a settled roster (`untilled/aumos#743` §B) ────────────
 *
 * The host counts **items** — total, pending, done, failed — and stopped
 * counting how many had anything to read, which was always a judgement about
 * documents. So a fixture now needs both: a task run, and the recipe answers
 * this run read back out of its folder with `files_read`, each carrying the
 * `sourced` that `recipes/request.mjs` writes.
 *
 * ⛔ Deliberately two arguments rather than one convenience object: the whole
 * point of the slice is that the two are counted by two different parties, and a
 * helper that derived one from the other would fake the join under test.
 */
const taskRun = (counts, extra = {}) => ({ taskRunId: 'trun_regression', state: 'completed', outputPath: 'scans/2026-09-07/roster-scan', pendingItems: [], outputs: [], failures: [], counts, ...extra })
const answers = (count, row, names = []) => Array.from({ length: count }, (_, index) => ({ itemId: `XKRX:${names[index] ?? `sym${index}`}`, symbol: names[index] ?? `sym${index}`, ...row }))
const answerRead = { sourced: true, data: { scored: true } }
const answerBlind = { sourced: false, data: null }

/* ⑴ The record the whole section rests on: a prepared roster with nothing eligible. */
const fullyPrepared = recordOf({ run: taskRun({ total: 74, pending: 0, done: 74, failed: 0 }), rows: answers(74, answerRead), eligibleSymbols: [] })
assert.equal(fullyPrepared.data.basis, 'rows')
assert.equal(fullyPrepared.data.dataPreparation, 'prepared')
assert.equal(fullyPrepared.data.candidateEvaluation, 'evaluated')
assert.equal(fullyPrepared.data.eligibleCount, 0)
assert.equal(fullyPrepared.data.inferredFromDiagnostics, false, 'the record reads no diagnostic — that is what makes it a record')

/**
 * ⑵ The prose shapes. Every row says the same thing about the same stage and
 * says it differently: renamed, retranslated, re-pathed, re-detailed, and — the
 * last two — spelled as codes this operation's vocabulary does not contain.
 *
 * ⛔ An `input-path` or `unresolved` code is **not** in this list, and must not
 * be: those still withdraw the positive answer, which is the safe direction and
 * is the half of the diagnostic reading that #212 ④ keeps.
 */
const executionProseShapes = [
  [],
  ['active_return_below_gate'],
  [{ code: 'active_return_below_gate' }],
  [{ code: 'active_return_below_gate', severity: 'blocked', message: 'Expected active return under the gate', path: 'expectedActiveReturn', details: { symbol: '005930', gate: 0.15 } }],
  [{ code: 'active_return_below_gate', severity: 'info', message: '게이트 아래의 기대 초과수익', path: 'candidate', details: {} }],
  [{ code: 'challenge_not_cleared', message: 'the challenge was not cleared' }, { code: 'thesis_incomplete', message: 'a different sentence entirely' }],
  [{ code: 'valuation_gap_has_no_source_for_this_instrument', message: 'an index ETF publishes no statements' }],
  ['a_code_no_operation_in_this_package_emits'],
  [{ code: 'research_gate_active_return_short', message: "#171's invented spelling, still invented" }],
]
/** ⛔ Every field of the verdict, not only the cause: a moved count is a moved answer. */
const verdictKeys = [
  'cause', 'dataPreparation', 'candidateEvaluation', 'eligibleCount', 'executionRecordRead', 'executionBasis',
  'singleNameLaneEmpty', 'singleNameWeight', 'riskBearingWeight', 'parkedLiquidityWeight', 'cashLikeWeight',
  'objective', 'objectiveDeclared', 'causeInferredFromDiagnostics',
]
const executionBaseline = executionOf({ reportedDiagnostics: executionProseShapes[1], executionRecord: fullyPrepared.data })
assert.equal(executionBaseline.data.cause, 'no-candidate-cleared-the-gates', 'the baseline is the positive answer, so the loop below is testing something that could fail')
assert.equal(executionBaseline.diagnostics.find((row) => row.code === 'mandate_objective_unexecuted').severity, 'info')
for (const reportedDiagnostics of executionProseShapes) {
  const label = JSON.stringify(reportedDiagnostics)
  const answer = executionOf({ reportedDiagnostics, executionRecord: fullyPrepared.data })
  for (const key of verdictKeys) {
    assert.deepEqual(answer.data[key], executionBaseline.data[key], `mandateExecution.${key} is unmoved by ${label} — this is the defect #212 ④ names`)
  }
  assert.equal(
    answer.diagnostics.find((row) => row.code === 'mandate_objective_unexecuted').severity,
    'info',
    `and the severity the investor reads is unmoved by ${label}`,
  )
}

/**
 * ⑶ …and the same nine shapes over a roster nobody prepared all answer
 * `input-path-incomplete`. This is the pair that matters: the wording is
 * irrelevant in **both** directions, and what separates the two verdicts is the
 * count. ⛔ `unprepared` is blindness and never an absence of opportunity.
 */
const blindRoster = recordOf({ run: taskRun({ total: 74, pending: 0, done: 74, failed: 0 }), rows: answers(74, answerBlind, ['005930', '000660']), eligibleSymbols: [] })
assert.equal(blindRoster.data.dataPreparation, 'unprepared')
for (const reportedDiagnostics of executionProseShapes) {
  const answer = executionOf({ reportedDiagnostics, executionRecord: blindRoster.data })
  assert.equal(answer.data.cause, 'input-path-incomplete', `a blind roster answers the same however ${JSON.stringify(reportedDiagnostics)} is worded`)
  assert.equal(answer.diagnostics.find((row) => row.code === 'mandate_objective_unexecuted').severity, 'unevaluated', '⛔ and «nobody said» is never a pass')
}

/**
 * ⑷ `unevaluated`, `not reached` and `0` are three reports and are told apart.
 *
 * ⚠️ This is the assertion #209's completion criterion asks for in one line: a
 * `WAIT` whose data was never prepared and a `WAIT` where the gates ran and
 * nothing qualified are different answers.
 */
const noRecord = executionOf({ reportedDiagnostics: ['active_return_below_gate'] })
assert.equal(noRecord.data.dataPreparation, 'unevaluated', 'no record: nobody counted anything')
assert.equal(noRecord.data.eligibleCount, null)
assert.equal(noRecord.data.executionRecordRead, false)
assert.equal(noRecord.data.cause, 'unreported')

const notReached = executionOf({ reportedDiagnostics: ['active_return_below_gate'], executionRecord: blindRoster.data })
assert.equal(notReached.data.dataPreparation, 'unprepared', 'not reached: the machine looked and nothing was readable at the pin')
assert.equal(notReached.data.cause, 'input-path-incomplete')

const measuredZero = executionOf({ reportedDiagnostics: ['active_return_below_gate'], executionRecord: fullyPrepared.data })
assert.equal(measuredZero.data.dataPreparation, 'prepared', 'zero: a measurement')
assert.equal(measuredZero.data.eligibleCount, 0)
assert.equal(measuredZero.data.cause, 'no-candidate-cleared-the-gates')

assert.equal(new Set([noRecord.data.cause, notReached.data.cause, measuredZero.data.cause]).size, 3, 'the three are three answers and never collapse into one')

/** ⛔ An absent fold is `null` and an empty one is `0`; only the second is a measurement. */
const unfolded = recordOf({ run: taskRun({ total: 74, pending: 0, done: 74, failed: 0 }), rows: answers(74, answerRead) })
assert.equal(unfolded.data.eligibleCount, null)
assert.equal(unfolded.data.eligibleBasis, 'unreported')
assert.ok(unfolded.diagnostics.some((row) => row.code === 'research_eligibility_unreported' && row.severity === 'unevaluated'))
assert.equal(executionOf({ executionRecord: unfolded.data }).data.cause, 'unreported', 'a prepared roster nobody folded has not established that nothing cleared')

/** ⚠️ And names that did clear over an empty lane is its own fact, not a silence. */
const clearedButUnbought = recordOf({ run: taskRun({ total: 74, pending: 0, done: 74, failed: 0 }), rows: answers(74, answerRead), eligibleSymbols: ['005930', '000660'] })
assert.equal(clearedButUnbought.data.eligibleCount, 2, 'derived from the names, never typed')
assert.equal(executionOf({ executionRecord: clearedButUnbought.data }).data.cause, 'candidates-cleared-not-proposed')

/**
 * ⑸ A record nobody counted is refused rather than read.
 *
 * ⛔ Without this the change is cosmetic: an object the run assembles itself,
 * asserting `dataPreparation: 'prepared'`, is the same inference under a new
 * field's name.
 */
for (const forged of [
  { dataPreparation: 'prepared', candidateEvaluation: 'evaluated', eligibleCount: 0 },
  { recordVersion: 2, dataPreparation: 'prepared', candidateEvaluation: 'evaluated', eligibleCount: 0 },
  { recordVersion: 1, dataPreparation: 'complete', candidateEvaluation: 'evaluated', eligibleCount: 0 },
  { recordVersion: 1, dataPreparation: 'prepared', candidateEvaluation: 'evaluated', eligibleCount: '0' },
  { ...fullyPrepared.data, dataPreparation: 'everything-is-fine' },
]) {
  const answer = executionOf({ reportedDiagnostics: ['active_return_below_gate'], executionRecord: forged })
  assert.equal(answer.data.cause, 'unreported', `a hand-made record earns nothing: ${JSON.stringify(forged)}`)
  assert.equal(answer.data.executionRecordRead, false)
  assert.ok(answer.diagnostics.some((row) => row.code === 'execution_record_unreadable' && row.severity === 'unevaluated'))
}

/** ⛔ An unsettled run is not an answer, and `sourced` is absent from it on purpose. */
const inFlight = recordOf({ run: taskRun({ total: 74, pending: 30, done: 44, failed: 0 }, { state: 'running', pendingItems: ['XKRX:005930'] }) })
assert.equal(inFlight.data.basis, 'run')
assert.equal(inFlight.data.dataPreparation, 'unsettled')
assert.equal(inFlight.data.counts.sourced, null, 'deriving it mid-flight counts a name nobody has reached yet as one this fund can read')
assert.equal(executionOf({ executionRecord: inFlight.data }).data.cause, 'input-path-incomplete')

/** ⚠️ A cache hit answers on `task_start` itself, and polling only the run would miss it. */
const cacheHit = recordOf({ started: { cached: true, status: 'completed', outputPath: 'scans/2026-09-07/roster-scan', counts: { total: 74, pending: 0, done: 74, failed: 0 } }, rows: answers(74, answerRead), eligibleSymbols: [] })
assert.equal(cacheHit.data.basis, 'rows')
assert.equal(cacheHit.data.dataPreparation, 'prepared')
assert.equal(cacheHit.data.outputPath, 'scans/2026-09-07/roster-scan')

/**
 * ⛔ **A settled run whose files nobody read is `unsettled`, not `prepared`.**
 *
 * ⚠️ This is the one state #743 §B adds, and it is the slice's whole hinge: the
 * host can now say a run finished and still know nothing about whether this fund
 * held anything readable. A record that read «finished» as «prepared» would be
 * asserting the state nobody counted — the defect #212 ④ removed, arriving back
 * through the new tool.
 */
const unreadAnswers = recordOf({ run: taskRun({ total: 74, pending: 0, done: 74, failed: 0 }), eligibleSymbols: [] })
assert.equal(unreadAnswers.data.basis, 'run')
assert.equal(unreadAnswers.data.dataPreparation, 'unsettled')
assert.equal(unreadAnswers.data.counts.sourced, null, 'the count is derived from the answers, and the answers were not read')
assert.equal(executionOf({ executionRecord: unreadAnswers.data }).data.cause, 'input-path-incomplete')

/** ⚠️ And `sourced` is about documents, never about bars — the recipe says so and this reads it. */
const filedButUnpriced = recordOf({ run: taskRun({ total: 2, pending: 0, done: 2, failed: 0 }), rows: answers(2, { sourced: true, data: null }), eligibleSymbols: [] })
assert.equal(filedButUnpriced.data.counts.sourced, 2, 'documents arrived for both names')
assert.equal(filedButUnpriced.data.counts.evaluated, 0, 'and the recipe computed nothing from them')
assert.equal(filedButUnpriced.data.dataPreparation, 'prepared')
assert.equal(filedButUnpriced.data.candidateEvaluation, 'none', '⛔ «read and nothing came of it» is not «never fed»')

/** ⛔ The input-path lane still outranks the record — the corp-code join is not the price sweep. */
const stillWithdrawn = executionOf({ reportedDiagnostics: ['corp_code_unmapped_symbols'], executionRecord: fullyPrepared.data })
assert.equal(stillWithdrawn.data.cause, 'input-path-incomplete', 'a stage that lost an input the research job cannot see is established whatever the record says')
assert.deepEqual(stillWithdrawn.data.inputPathCodes, ['corp_code_unmapped_symbols'])

/** ⛔ And an unresolved code still forbids the positive answer without blaming the wiring. */
const unknownInstrument = executionOf({ reportedDiagnostics: ['instrument_class_unknown'], executionRecord: fullyPrepared.data })
assert.equal(unknownInstrument.data.cause, 'unreported', 'unknown is not incomplete, and it is not «the gates ran» either')
assert.deepEqual(unknownInstrument.data.inputPathCodes, [])

/** ⚠️ Codes reported and none of them readable is said out loud rather than ignored — #171's surviving half. */
assert.ok(
  executionOf({ reportedDiagnostics: ['a_code_no_operation_in_this_package_emits'], executionRecord: fullyPrepared.data })
    .diagnostics.some((row) => row.code === 'mandate_execution_codes_unrecognised' && row.severity === 'info'),
)

/** ⛔ A held single name is still the end of the question, whatever anything reports. */
for (const reportedDiagnostics of executionProseShapes) {
  const executing = execute({
    operation: 'mandateExecution',
    asOf: executionAsOf,
    input: { mandateObjective: executionObjective, positions: executionBook, proposed: [{ symbol: '035420', weight: 0.02 }], cashWeight: 0.5725, reportedDiagnostics, executionRecord: blindRoster.data },
  })
  assert.equal(executing.data.cause, 'executing', 'a single name in the plan leaves nothing to explain')
  assert.equal(executing.diagnostics.some((row) => row.code === 'mandate_objective_unexecuted'), false)
}

console.log('evidence-gated issue #212 ④ execution-state regression tests passed')

/**
 * ── #222: the key `researchState` writes is the key it can read back ───────
 *
 * `coverage/research-index` was **self-locked**. `researchState` is its only
 * writer, and the validator required an array `rows` on `previous` — while
 * every run up to 0.4.60 hand-wrote the key with descriptive fields and no
 * `rows`. So the first malformed write made the key permanently unreadable by
 * its own owner, and the checkpoint `hooks/guard-budget.mjs` and `PROMPT.md`
 * §Orchestration prescribe for a run that stopped at a limit — *«persist the
 * roster you did review with `researchState` to `coverage/research-index`»* —
 * could not be produced. Four calls in the reporting run, four refusals.
 *
 * The two halves are asserted separately below, because they are different
 * claims: a **missing shape** now degrades, and a **point-in-time violation**
 * still refuses. The negative controls are the ones that would catch a fix that
 * simply deleted the validator.
 */
const researchAsOf = '2026-09-08T03:01:37.490Z'
const researchRun = (input) => execute({ operation: 'researchState', asOf: researchAsOf, input })
const researchRow = { symbol: 'DKS', market: 'us', observedAt: '2026-09-04T00:00:00Z', evidenceIds: ['ev-dks'] }

/** The value that was actually stored — descriptive siblings, no `rows`. It is an empty index now. */
const legacyStored = { extensions: [], universeProvenance: 'bundled-74-kr', usMapping: {}, laneStateThisRun: 'kr-sleeve', blockingDefectsFound: [], note: 'hand-written' }
const fromLegacy = researchRun({ previous: legacyStored, observations: [researchRow] })
assert.equal(fromLegacy.status, 'ok', 'a stored value with no rows must not refuse the operation that wrote it')
assert.equal(fromLegacy.data.previousRead, 'no-rows')
assert.deepEqual(fromLegacy.data.nextState.rows.map((row) => row.symbol), ['DKS'], 'the run\'s own observations are the whole index when nothing was carried')
assert.equal(fromLegacy.data.nextState.schemaVersion, 1)
assert.equal(fromLegacy.data.nextState.updatedAsOf, researchAsOf)
assert.deepEqual(fromLegacy.data.previousExtraKeys, ['blockingDefectsFound', 'extensions', 'laneStateThisRun', 'note', 'universeProvenance', 'usMapping'], 'the siblings are reported by name, not dropped in silence')
assert.equal(fromLegacy.data.nextState.extensions, undefined, '⛔ and never copied into nextState — the 60 KB budget measures rows')

/** The empty object the reporting run also tried, and the absent case, read the same way. */
assert.equal(researchRun({ previous: {}, observations: [researchRow] }).data.previousRead, 'no-rows')
assert.equal(researchRun({ observations: [researchRow] }).data.previousRead, 'absent')

/** A value **with** rows round-trips, and the descriptive siblings may sit beside them. */
const canonical = researchRun({ observations: [researchRow] }).data.nextState
const roundTrip = researchRun({ previous: { ...canonical, universeProvenance: 'bundled-83-us' } })
assert.equal(roundTrip.data.previousRead, 'rows')
assert.deepEqual(roundTrip.data.nextState.rows, canonical.rows, 'the roster carried forward unchanged')
assert.deepEqual(roundTrip.data.previousExtraKeys, ['universeProvenance'])

/** ⛔ Negative control: `updatedAsOf` after `asOf` is still refused — the per-row check cannot see it. */
const fromFuture = researchRun({ previous: { schemaVersion: 1, updatedAsOf: '2099-01-01T00:00:00Z', rows: [researchRow] } })
assert.equal(fromFuture.status, 'blocked', 'an index written by a later run may hold only past-dated rows and still leak that run\'s judgement backwards')
assert.equal(fromFuture.data, null)
assert.ok(has(fromFuture, 'research_state_invalid'))

/** ⛔ Negative control: a `schemaVersion` this code does not know is still refused; an absent one is not. */
assert.equal(researchRun({ previous: { schemaVersion: 2, updatedAsOf: researchAsOf, rows: [] } }).status, 'blocked')
assert.ok(has(researchRun({ previous: { schemaVersion: 2, updatedAsOf: researchAsOf, rows: [] } }), 'research_state_invalid'))
assert.equal(researchRun({ previous: { updatedAsOf: researchAsOf, rows: [researchRow] } }).data.previousRead, 'rows', 'no schemaVersion is a pre-#222 write, not an unknown writer')
assert.equal(researchRun({ previous: { schemaVersion: 1, rows: [researchRow] } }).data.previousRead, 'rows', 'nothing reads updatedAsOf — every row is dated and checked one by one')

/** ⛔ Negative control: each of the four required row fields, dropped one at a time. */
for (const field of ['symbol', 'market', 'observedAt', 'evidenceIds']) {
  const { [field]: _dropped, ...incomplete } = researchRow
  const answer = researchRun({ observations: [incomplete] })
  assert.equal(answer.status, 'blocked', `a row without ${field} is refused`)
  assert.ok(answer.diagnostics.some((row) => row.code === 'research_observation_invalid'), `${field} is reported as research_observation_invalid`)
  assert.equal(answer.data.nextState, null)
}
/** ⚠️ And an **empty** `evidenceIds` is the same refusal — a row citing nothing is not a reviewed name. */
assert.ok(has(researchRun({ observations: [{ ...researchRow, evidenceIds: [] }] }), 'research_observation_invalid'))

/** The published contract now says all of that — the round trip the reporting run could not read. */
const researchContract = execute({ operation: 'inputContracts', asOf: researchAsOf, input: {} }).data.nested.researchState
assert.ok(researchContract, 'researchState publishes nested shapes')
assert.deepEqual(researchContract['observations[]'], { symbol: 'string', market: 'string', observedAt: 'string', evidenceIds: 'array', sector: 'string', extension: 'boolean' })
for (const field of ['symbol', 'market', 'observedAt', 'evidenceIds']) assert.ok(researchContract.observationRow.includes(field), `${field} is named in the published row sentence`)
assert.ok(researchContract.previous.includes('previousRead'), 'the published sentence says how a value with no rows is read')

console.log('evidence-gated issue #222 research-index regression tests passed')

/**
 * ── #224: the bar whose shape was valid and whose data was wrong ────────────
 *
 * `/api/v1/candles`'s `before` is **inclusive**, and a Toss daily bar is
 * stamped at the venue's local midnight — so *«pass today's midnight to
 * exclude today»*, which this book carried in `failures/repeated-patterns` as
 * `CONFIRMED`, returns exactly today's incomplete bar. Measured 2026-09-08 on
 * 069500 during the XKRX session: `before=2026-09-08T00:00:00+09:00` and an
 * omitted `before` answered with the same 2026-09-08 first row, two calls
 * seconds apart disagreed about it (close 113,470 → 113,485, volume 11,452,779
 * → 11,466,966), and its close sat 2,665 above the real 2026-09-07 close of
 * 110,820.
 *
 * ⛔ **#180's defence cannot reach it.** That one asks whether the row parsed,
 * and a partial bar's OHLCV is complete, finite and numeric — every moving
 * average computes and `trendState` returns a confident `trancheGuidance` off a
 * price no session ever printed. So the assertions below are in two halves: the
 * row fires on a newest bar younger than the 24 hours that make a daily bar
 * readable, and it is **silent** otherwise — because a diagnostic that fires on
 * a series a run collected correctly is one people learn to ignore.
 *
 * ⚠️ **`info`, and it must stay `info`.** This package holds no market-hours
 * table (the sleeves take the close from the market-calendar source for exactly
 * that reason), so it cannot tell a partial bar from a same-day bar collected
 * after the close. The last assertion here is that the verdict is untouched.
 */
const partialAsOf = '2026-09-08T03:01:37.490Z'
/** Sessions stamped at XKRX local midnight, which is the stamp the vendor sends. */
const seoulMidnight = (daysBack) => new Date(Date.parse('2026-09-08T00:00:00+09:00') - daysBack * 86_400_000).toISOString()
const partialSeries = Array.from({ length: 240 }, (_, index) => {
  const close = 100 + index * 0.05
  return { date: seoulMidnight(239 - index), open: close, high: close + 1, low: close - 1, close, volume: 1000 }
})
/** ⚠️ The same series with the newest row dropped — the corrected prescription's answer. */
const closedSeries = partialSeries.slice(0, -1)
const barOperations = ['indicators', 'scan', 'opportunityMetrics', 'trendState']
/** ⚠️ Only the keys each operation declares — `input_key_unread` is `unevaluated` and would mask the assertions below. */
const barInput = (operation, bars) => (
  operation === 'indicators' ? { bars }
    : operation === 'trendState' ? { symbol: '069500', bars }
      : { symbol: '069500', market: 'kr', bars }
)
const barRun = (operation, bars) => execute({ operation, asOf: partialAsOf, input: barInput(operation, bars) })
const unclosedRow = (answer) => answer.diagnostics.find((row) => row.code === 'newest_bar_may_be_unclosed') ?? null

/* ── ⑴ it fires, on every operation that reads a bar array ────────────────── */
for (const operation of barOperations) {
  const row = unclosedRow(barRun(operation, partialSeries))
  assert.ok(row, `${operation} reports a newest bar that has not been closed for 24 hours — this is the gap #224 measured`)
  assert.equal(row.severity, 'info', `${operation}: the newest-bar age is a report, because this package cannot honestly decide whether the venue is mid-session`)
  assert.equal(row.path, 'bars')
  assert.equal(row.details.timestamp, partialSeries.at(-1).date, 'and it names the bar, so a run can check the row it was handed')
  assert.ok(row.details.ageMs < 86_400_000 && row.details.ageMs >= 0, `${operation}: the age it reports is the age it measured`)
}

/* ── ⑵ and it is silent on a series the run collected correctly ───────────── */
for (const operation of barOperations) {
  assert.equal(
    unclosedRow(barRun(operation, closedSeries)),
    null,
    `${operation} says nothing about a newest bar that closed more than 24 hours before asOf — a diagnostic that fires on a correct collection is one nobody reads`,
  )
}

/**
 * ⚠️ The boundary itself, asserted rather than inferred from a series: exactly
 * 24 hours old is closed, one millisecond younger is not.
 */
assert.equal(unclosedNewestBar([{ timestamp: '2026-09-07T03:01:37.490Z' }], partialAsOf), null, '24 hours after its own stamp is readable')
assert.ok(unclosedNewestBar([{ timestamp: '2026-09-07T03:01:37.491Z' }], partialAsOf), 'and a millisecond younger than that is not')
assert.equal(unclosedNewestBar([], partialAsOf), null, 'no bars is not an unclosed bar')
assert.equal(unclosedNewestBar([{ timestamp: 'not-a-date' }], partialAsOf), null, 'an unreadable stamp is #180\'s finding and not this one')
assert.equal(BAR_CLOSE_LAG_MS, 86_400_000, 'the lag is the host\'s own rule — a daily bar becomes readable 24 hours after its opening stamp (aumos#732)')

/**
 * ⛔ **The verdict is untouched, and that is the point of the severity.** The
 * partial series still answers with a state and a guidance; what changed is
 * that the run is told which session the newest bar is.
 */
const partialTrend = barRun('trendState', partialSeries)
assert.equal(partialTrend.status, 'ok', 'an `info` row does not demote the answer')
assert.ok(typeof partialTrend.data.state === 'string' && partialTrend.data.state !== 'insufficient_data')
assert.deepEqual(
  { state: partialTrend.data.state, trancheGuidance: partialTrend.data.trancheGuidance },
  { state: 'UPTREND', trancheGuidance: 'small_or_wait' },
  'the gate still answers — refusing here would turn a correct post-close reading into no reading at all',
)
assert.equal(barRun('scan', partialSeries).status, 'ok')
assert.equal(barRun('opportunityMetrics', partialSeries).status, 'ok')

/**
 * ⚠️ **And the partial bar is why the row is worth having at all**: the same
 * series with the newest close 2,665 higher — the measured distortion — parses
 * without a single complaint from #180's defence.
 */
const distorted = [...closedSeries, { ...partialSeries.at(-1), close: partialSeries.at(-1).close + 2_665, high: partialSeries.at(-1).close + 2_665 }]
const distortedTrend = barRun('trendState', distorted)
assert.equal(distortedTrend.data.state === 'insufficient_data', false, 'the shape is valid: no parse check sees this')
assert.equal(distortedTrend.diagnostics.some((row) => ['bar_value_invalid', 'trend_bars_unreadable', 'trend_moving_average_unavailable'].includes(row.code)), false)
assert.ok(unclosedRow(distortedTrend), 'and the only thing that reports it is the newest bar\'s age')

/**
 * ── The durable rule, retracted rather than left to a prompt (#156's mechanism)
 *
 * ⛔ A wrong prescription filed `CONFIRMED` in `failures/repeated-patterns` is
 * the one defect a new package version cannot fix by itself: the key is
 * instance-private, append-only and read on every wake. So the correction is
 * computed and handed to the run.
 */
const beforeRuleRow = {
  id: 'candles-before-instant-excludes-partial-bar',
  state: 'CONFIRMED',
  severity: 'blocks-every-future-wake',
  note: '`before` accepts an instant and is how you exclude a mid-session partial bar.',
}
const beforeRetraction = execute({
  operation: 'refutedMemoryRules',
  asOf: partialAsOf,
  input: { patterns: [beforeRuleRow], memory: { 'run/theme-radar-last': {} } },
})
const beforeRetracted = beforeRetraction.data.retractions.find((row) => row.refutedRuleId === 'candles-before-excludes-the-partial-bar')
assert.ok(beforeRetracted, 'the wrong prescription is matched on its wording, because another instance filed it under another id')
assert.equal(beforeRetracted.key, 'failures/repeated-patterns')
assert.equal(beforeRetracted.writeAs.state, 'RETRACTED', 'retract, never delete — the key is append-only and a vanished rule is re-derived')
assert.equal(beforeRetracted.writeAs.retracts, beforeRuleRow.id)
for (const fragment of ['inclusive', 'inside the previous day', 'first row', '113,485', 'newest_bar_may_be_unclosed']) {
  assert.ok(beforeRetracted.correction.includes(fragment), `the correction carries «${fragment}» — the measurement and both halves of the prescription`)
}
assert.ok(
  beforeRetraction.diagnostics.some((row) => row.code === 'memory_rule_refuted'),
  'and the run is told to write the retraction in this run rather than noticing it later',
)

/** ⛔ And a run carrying no such rule is not handed a retraction it has nothing to retract. */
assert.equal(
  execute({ operation: 'refutedMemoryRules', asOf: partialAsOf, input: { patterns: [], memory: { 'run/theme-radar-last': {} } } })
    .data.retractions.some((row) => row.refutedRuleId === 'candles-before-excludes-the-partial-bar'),
  false,
)

console.log('evidence-gated issue #224 partial-bar regression tests passed')

/**
 * ── #227: the radar's clock, its override's producer, and the boundary ─────
 *
 * `themeRadarDue` measured staleness from `run/theme-radar-last.lastRunAt` —
 * *the last time the radar ran* — where the methodology it was ported from
 * measures from *the last `thesis_call`*. The two clocks agree on every run
 * except the one that matters: **a run that looked and found nothing**, which
 * under the run clock reset the interval and locked the next three days.
 *
 * Measured on this book (`run_c7ad46eea03840bf84ae7a8822ed02c3`, asOf
 * 2026-09-08): the radar ran **2 times across 10 runs** — the second only
 * because `ageDays` had drifted past the interval, 3.5218 against 3 — and
 * `coverage/research-index.extensions` was `[]` in all ten. `PROMPT.md` §3
 * names this branch as the **only** path across the declared universe
 * boundary, so the boundary never moved.
 *
 * Four things are checked, and the first is the whole issue:
 *
 *  1. a run that produced no `thesis_call` is **due on the next run**;
 *  2. a record written before this version is due and **says which clock it
 *     is missing** rather than reading as due-forever in silence;
 *  3. `dislocation` has a producer, and an unasked macro lane is not a calm
 *     one;
 *  4. the empty-extension streak is counted, carried and reported.
 */
const radarAsOf = '2026-09-08T03:01:37.490Z'
const radarRun = (input) => execute({ operation: 'themeRadarDue', asOf: radarAsOf, input })

/* ── ⑴ finding nothing keeps the pressure on ─────────────────────────────── */

const ranYesterday = '2026-09-07T03:00:00.000Z'
const foundNothing = radarRun({ lastThesisCallAt: null, lastRunAt: ranYesterday })
assert.equal(foundNothing.data.due, true, 'a run that produced no thesis_call leaves the radar due on the next run')
assert.equal(foundNothing.data.reason, 'no-thesis-call-yet')
assert.equal(foundNothing.diagnostics.length, 0, 'and that is the ordinary state, not a diagnosis')
assert.equal(foundNothing.data.runAgeDays < 3, true, 'the run clock would have called this not-due — it is kept as an observation and decides nothing')
assert.equal(foundNothing.data.clock, 'thesis-call')

/* A call four days old is due on the same record; one from yesterday is not. */
assert.equal(radarRun({ lastThesisCallAt: '2026-09-04T03:00:00.000Z', lastRunAt: ranYesterday }).data.reason, 'interval-elapsed')
assert.equal(radarRun({ lastThesisCallAt: ranYesterday, lastRunAt: ranYesterday }).data.due, false)
/** ⛔ And `lastRunAt` cannot make a stale clock fresh: the radar running is not the radar producing. */
assert.equal(radarRun({ lastThesisCallAt: '2026-09-04T03:00:00.000Z', lastRunAt: radarAsOf }).data.due, true)

/* ── ⑵ the record that predates the clock says so ────────────────────────── */

const legacyRecord = radarRun({ lastRunAt: ranYesterday })
assert.equal(legacyRecord.data.due, true, 'a pre-0.6.0 record is due rather than silently not-due')
assert.equal(legacyRecord.data.reason, 'thesis-call-clock-unstated')
assert.ok(has(legacyRecord, 'theme_radar_clock_unstated'), 'and the absence is named rather than read as due-forever in silence')
assert.equal(legacyRecord.diagnostics.find((row) => row.code === 'theme_radar_clock_unstated').path, 'lastThesisCallAt')
/** ⚠️ An empty folder is a first run and is not diagnosed — «never written» and «written without this field» are two facts. */
assert.equal(radarRun({}).data.reason, 'never-run')
assert.equal(radarRun({}).diagnostics.length, 0)
/** ⛔ And nothing invents the clock from the run instant: `null` is a value, omission is not. */
assert.notEqual(legacyRecord.data.reason, foundNothing.data.reason)

/* ── ⑶ the override that had no producer ─────────────────────────────────── */

const dislocationRow = (indicator, value, observedAt) => ({ indicator, value, observedAt, sourceTier: 'official', sourceUrl: 'https://example.test/macro' })
const dislocationRun = (input) => execute({ operation: 'dislocationSignal', asOf: radarAsOf, input })
const fell = dislocationRun({ macro: { retained: [dislocationRow('index-level', 2700, '2026-09-02T00:00:00Z'), dislocationRow('index-level', 2540, '2026-09-07T00:00:00Z')] } })
assert.equal(fell.data.dislocated, true, 'an index 5%+ off the window high is a dislocation week')
assert.deepEqual(fell.data.reasons, ['index-drawdown'])
assert.ok(fell.diagnostics.some((row) => row.code === 'dislocation_window_open' && row.severity === 'info'))
const spiked = dislocationRun({ macro: { retained: [dislocationRow('vix', 13.4, '2026-09-02T00:00:00Z'), dislocationRow('vix', 21.5, '2026-09-07T00:00:00Z')] } })
assert.deepEqual(spiked.data.reasons, ['vix-ratio'], 'a spike that has not reached the level is still a spike against the window low')
/** ⛔ A single dated print carries no move, and reading it as calm would answer a question nobody asked. */
const onePrint = dislocationRun({ macro: { retained: [dislocationRow('index-level', 2540, '2026-09-07T00:00:00Z')] } })
assert.equal(onePrint.data.dislocated, false)
assert.ok(has(onePrint, 'dislocation_index_move_unreadable'))
/** ⛔ A regime tag never decides it — `risk-off` can stand for months and this question is about weeks. */
assert.equal(dislocationRun({ macro: { retained: [] }, regime: { regime: 'risk-off' } }).data.dislocated, false)
assert.equal(dislocationRun({ macro: { retained: [] }, regime: { regime: 'risk-off' } }).data.regime, 'risk-off')
/** ⚠️ And the override only ever adds a run: `dislocation: true` beats a fresh call, and `false` changes nothing. */
assert.equal(radarRun({ lastThesisCallAt: ranYesterday, dislocation: true }).data.reason, 'dislocation-override')
assert.equal(radarRun({ lastThesisCallAt: ranYesterday, dislocation: false }).data.due, false)

/* ── ⑷ the boundary that stood still for ten runs ────────────────────────── */

const capacity = (input) => execute({ operation: 'discoveryCapacity', asOf: radarAsOf, input })
const openRadar = { due: true, reason: 'no-thesis-call-yet' }
const sweptNothingNew = { screenedUniverseCount: 74, extensionsCount: 0 }
let boundary = null
for (let run = 1; run <= 3; run += 1) {
  const answer = capacity({ radar: openRadar, coverage: sweptNothingNew, boundary })
  assert.equal(answer.data.boundary.emptyExtensionRuns, run, 'the streak is this operation’s arithmetic, never a number the run keeps by hand')
  assert.equal(answer.data.boundary.radarOpenRunsInStreak, run, 'and it counts how many of those runs the forward branch was actually open in')
  assert.equal(answer.data.boundary.hardened, run >= 3)
  assert.equal(answer.data.nextBoundary.updatedAsOf, radarAsOf)
  boundary = answer.data.nextBoundary
}
const hardened = capacity({ radar: openRadar, coverage: sweptNothingNew, boundary })
assert.ok(hardened.diagnostics.some((row) => row.code === 'discovery_boundary_hardened' && row.severity === 'info'), 'a hardened boundary is stated rather than inferred')
/** ⛔ It reports and never blocks: zero extensions is a valid outcome of an honest radar. */
assert.equal(hardened.diagnostics.some((row) => row.severity === 'blocked'), false)
assert.equal(hardened.data.capacity, 'full', 'and it is not a lane verdict — both lanes were open on every one of those runs')
/** ⚠️ A boundary that moved resets the streak, because the branch did what it exists to do. */
const boundaryMoved = capacity({ radar: openRadar, coverage: { screenedUniverseCount: 75, extensionsCount: 1 }, boundary })
assert.equal(boundaryMoved.data.boundary.emptyExtensionRuns, 0)
assert.equal(boundaryMoved.data.boundary.streakSince, null)
assert.equal(boundaryMoved.diagnostics.some((row) => row.code === 'discovery_boundary_hardened'), false)
/** ⛔ And a run nobody counted is not a run that found nothing: an unread count does not advance the streak. */
const uncounted = capacity({ radar: openRadar, coverage: { screenedUniverseCount: 74 }, boundary })
assert.equal(uncounted.data.boundary.emptyExtensionRuns, null)
assert.equal(uncounted.data.nextBoundary, null)
assert.ok(uncounted.diagnostics.some((row) => row.code === 'discovery_boundary_uncounted'))
/** ⚠️ The distinction the second count exists for: a streak in which the radar was never open reads differently. */
const clockBound = capacity({ radar: { due: false, reason: 'not-due' }, coverage: sweptNothingNew, boundary: { emptyExtensionRuns: 4, radarOpenRunsInStreak: 0, streakSince: '2026-09-01T00:00:00Z' } })
assert.equal(clockBound.data.boundary.emptyExtensionRuns, 5)
assert.equal(clockBound.data.boundary.radarOpenRunsInStreak, 0, 'five runs that moved nothing and a radar that was due in none of them is a clock finding, not a market one')

console.log('evidence-gated issue #227 theme-radar clock regression tests passed')

/**
 * ── #229: the consensus source existed and the procedure did not ────────────
 *
 * `variantViewCheck` has four requirements and exactly one of them takes an
 * input that is **in no filing and on no exchange feed**: `consensusRefs`. The
 * session running this manager holds `WebSearch`, `WebFetch` and
 * `observation_file`, so the input was reachable — and no numbered step of the
 * spine, and no section of `candidate-research`, said to go and get it. The
 * previous run reported that as *"there is no consensus source"*; ⚠️ that was
 * **overstated**, and correcting it is half of what this block pins.
 *
 * ⛔ **#226 changed what the gap costs.** It removed the maturity-sized lane and
 * resolved the open decision the other way from *shrink*: a candidate short of
 * any requirement is now `variant_view_required_for_position` / `blocked` with
 * `targetWeight: null`. So the measured state is not «every candidate falls to
 * the control arm and gets 1%» any more — it is **no single name can be proposed
 * at all**. Measured on the fixtures below, at conviction 0.35 / reward-risk
 * 2.083 / Mandate cap 0.2:
 *
 * | | 0 of 4 (no thesis) | 4 of 4 (thesis + a filed consensus row) |
 * |---|---|---|
 * | `satisfiedCount` | 0 | 4 |
 * | `lane` | `control-arm` | `main` |
 * | `effectiveCap` | 0.2 (`mandate`) | 0.2 (`mandate`) |
 * | `variantViewVerified` | false | true |
 * | `targetWeight` | **`null`**, `variant_view_required_for_position` | **0.07916667** |
 * | owed disclosures | none | `main_lane_rests_on_manager_attestation` |
 *
 * ⚠️ The cap is the same on both sides on purpose: since #226 this gate decides
 * **whether** a position may be proposed and never how large it is.
 */
const consensusAsOf = JSON.parse(await readFile(new URL('../managers/evidence-gated/fixtures/observation-contract.json', import.meta.url), 'utf8'))
const consensusFixture = consensusAsOf.consensusRefs
const consensusGolden = JSON.parse(await readFile(new URL('../managers/evidence-gated/fixtures/legacy-golden/methodology.json', import.meta.url), 'utf8'))
const conRun = (operation, input = {}) => execute({ operation, asOf: consensusAsOf.asOf, input })
const conThesis = { ...consensusGolden.thesis, consensusRefs: [consensusFixture.managerAttested] }
const sizingInput = { mandatePositionCap: 0.2, maturityStatus: 'observing', lane: 'main', expectedActiveReturn: 0.25, downsideReturn: -0.12, conviction: 0.35, researchGate: 'passed' }

/* ── ⑴ the step is on the spine, not only in prose ─────────────────────────── */

const { FLOWS: consensusFlows, numberedSteps: consensusSteps, stepOf: consensusStepOf } = await import('../managers/evidence-gated/lib/flows.mjs')
for (const flow of Object.keys(consensusFlows)) {
  const retrieval = consensusStepOf(flow, 'WebSearch')
  assert.ok(retrieval, `${flow} declares the consensus retrieval step — #229's defect is that the flow filed a reading nobody was told to fetch`)
  assert.equal(retrieval.kind, 'tool', '⚠️ it is the CLI\'s tool and not this package\'s operation, and the spine says so')
  assert.deepEqual(retrieval.calls, ['WebSearch', 'WebFetch'])
  assert.ok(
    consensusStepOf(flow, 'thesisGapSources').n < retrieval.n && retrieval.n < consensusStepOf(flow, 'observation_file').n,
    'it comes after the step that prices a thesis and before the filing that turns the reading into a row — file-then-fetch is the order that produced 0 of 4',
  )
  assert.ok(retrieval.n < consensusStepOf(flow, 'observationLedger').n)
}
/** ⛔ Non-vacuity: a spine without that step has to fail the lookup, not fall through it. */
assert.equal(consensusSteps('kr-sleeve').filter((step) => step.call === 'WebSearch').length, 1, 'exactly one step claims it, so the assertions above cannot be satisfied twice')

const consensusSkills = Object.fromEntries(await Promise.all(
  ['kr-sleeve', 'us-sleeve', 'candidate-research'].map(async (name) => [name, await readFile(new URL(`../managers/evidence-gated/skills/${name}/SKILL.md`, import.meta.url), 'utf8')]),
))
for (const sleeve of ['kr-sleeve', 'us-sleeve']) {
  const text = consensusSkills[sleeve]
  const marker = text.match(/^(\d+)\. \*\*`WebSearch`\/`WebFetch` the consensus/m)
  assert.ok(marker, `${sleeve} carries the retrieval as a numbered step of its checklist, in the register the file already uses`)
  assert.ok(Number(marker[1]) < Number(text.match(/^(\d+)\. \*\*`observation_file` on every consensus/m)[1]))
  for (const fragment of ['analyst target price', 'buy/hold/sell', 'never a dependency', 'model knowledge']) {
    assert.ok(text.includes(fragment), `${sleeve}'s step names «${fragment}» — the two figures, the refusal to sign a vendor, and the refusal to invent one`)
  }
}
/** ⚠️ One worked path each, and they are different paths: a KR sentence copied into the US file answers nothing. */
assert.ok(consensusSkills['kr-sleeve'].includes('broker consensus aggregation'))
assert.ok(consensusSkills['us-sleeve'].includes('broker price-target aggregation'))
assert.equal(consensusSkills['us-sleeve'].includes('broker consensus aggregation'), false, 'the US sleeve names a US path rather than inheriting the Korean one')
assert.ok(consensusSkills['candidate-research'].includes('## Consensus, before the thesis'), 'and the procedure has one home the two sleeves point at')

/* ── ⑵ the driver the contract already allowed, and what it still does not do ── */

const targetDrivers = (metric) => [{ metric, evidenceId: consensusFixture.managerAttested.evidenceId }]
const consensusValued = conRun('thesisValuation', {
  asset: '036460',
  market: 'kr',
  price: 33_100,
  currency: 'KRW',
  scenarios: {
    bear: { probability: 0.25, target: 26_000, drivers: targetDrivers('analystTargetLow') },
    base: { probability: 0.5, target: 36_400, drivers: targetDrivers('analystTargetMean') },
    bull: { probability: 0.25, target: 59_000, drivers: targetDrivers('analystTargetHigh') },
  },
  filings: [],
})
assert.notEqual(consensusValued.status, 'blocked', 'a filed analyst target is a legal driver — this is what the contract already allowed, and #229 widened nothing to say so')
assert.deepEqual(consensusValued.data.fairValueRange, { low: 26_000, high: 59_000, currency: 'KRW' })
assert.equal(consensusValued.data.expectedUpsidePct, 19.18429)
assert.deepEqual(consensusValued.data.thesisFields, { expectedUpsidePct: 19.18429, fairValueRange: { low: 26_000, high: 59_000 } })
assert.deepEqual(
  consensusValued.data.scenarios.map((row) => row.drivers[0].evidenceId),
  Array(3).fill(consensusFixture.managerAttested.evidenceId),
  'and the id travels onto every returned row, which is the whole of what makes the number traceable',
)
/**
 * ⛔ **And it is still not `grounded`, which is the honest answer.** `grounded`
 * means a fact this run could read off a statement; an analyst target is a third
 * party's opinion. Reporting it is the point — loosening it would delete the one
 * distinction the field carries.
 */
assert.equal(consensusValued.data.grounded, false)
assert.equal(consensusValued.data.groundedCases, 0)
const ungroundedRow = consensusValued.diagnostics.find((row) => row.code === 'scenario_driver_ungrounded')
assert.equal(ungroundedRow.severity, 'unevaluated', 'reported, never refused — the target the size was computed from stays visible')
assert.equal(consensusValued.diagnostics.filter((row) => row.code === 'scenario_driver_ungrounded').length, 3)
/** ⚠️ The pin on «nothing was loosened»: none of the four readable facts is an analyst target. */
const { FILING_FACTS: consensusFacts } = await import('../managers/evidence-gated/lib/valuation.mjs')
assert.deepEqual(Object.keys(consensusFacts), ['revenue', 'operatingIncome', 'operatingIncomeYoy', 'marginDeltaYoy'])
assert.equal(Object.keys(consensusFacts).some((name) => /analyst|target|consensus/i.test(name)), false, '⛔ no analyst-target fact was added to make the case pass; the case is meant to say what it says')
/** ⚠️ And the manager reads the published schema rather than this source (#618), so the sentence is there. */
const driversContract = conRun('inputContracts').data.nested.thesisValuation['scenarios.<case>.drivers[]']
for (const fragment of ['{ metric, evidenceId }', 'observation_file', 'scenario_driver_ungrounded', 'does not have to be a DCF']) {
  assert.ok(driversContract.includes(fragment), `the published driver contract says «${fragment}»`)
}

/* ── ⑶ 0 of 4 → 4 of 4, and the position that was impossible ───────────────── */

const zeroOfFour = conRun('variantViewCheck', {})
assert.equal(zeroOfFour.data.satisfiedCount, 0)
assert.deepEqual(
  zeroOfFour.data.requirementReport.find((row) => row.requirement === 'consensusRefs').outstanding,
  'no consensus row was given, so there is nothing the view differs from',
  'the measured sentence, verbatim — it is the one the run mistook for «no source exists»',
)
const fourOfFour = conRun('variantViewCheck', { thesis: conThesis, challengeVerdict: 'cleared' })
assert.equal(fourOfFour.data.satisfiedCount, 4)
assert.equal(fourOfFour.data.verified, true)
assert.equal(fourOfFour.data.lane, 'main')
assert.equal(conRun('targetWeight', sizingInput).data.targetWeight, null, 'before: the candidate is refused outright since #226, not sized down')
assert.ok(conRun('targetWeight', sizingInput).diagnostics.some((row) => row.code === 'variant_view_required_for_position' && row.severity === 'blocked'))
const sizedOnConsensus = conRun('targetWeight', { ...sizingInput, thesis: conThesis, challengeVerdict: 'cleared' })
assert.equal(sizedOnConsensus.data.targetWeight, 0.07916667, 'after: one filed consensus row is the difference between a proposal and none')
assert.equal(sizedOnConsensus.data.effectivePositionCap, 0.2, '⚠️ and the cap is unchanged on both sides — this gate decides whether, never how large')

/* ── ⑷ the grade reaches the approval screen, or the sizing is refused ──────── */

/**
 * `main_lane_rests_on_manager_attestation` already existed. What was not pinned
 * is the whole path: `variantViewCheck` grades the row, **`targetWeight`** — the
 * operation a run actually calls to size — has to carry the obligation up, and
 * `proposalDisclosure` has to refuse the proposal that drops it from
 * `rationale.risks`. ⚠️ Measured on the host: `Approvals.tsx` renders
 * `rationale.keyReasons` and `rationale.risks` and nothing else, so `risks` is
 * the only slot on that screen and `uncertainty` is not on it at all.
 */
assert.equal(sizedOnConsensus.data.mainLaneAttestation.disclosureCode, 'main_lane_rests_on_manager_attestation')
assert.equal(sizedOnConsensus.data.mainLaneAttestation.grade, 'manager')
assert.deepEqual(sizedOnConsensus.data.mainLaneAttestation.disclosureFields, ['risks', 'uncertainty'])
assert.deepEqual(sizedOnConsensus.data.disclosures.map((row) => row.code), ['main_lane_rests_on_manager_attestation'], '⛔ dropped here and the investor is never told; the sizing has to hand it on')
assert.equal(sizedOnConsensus.data.mainLaneAttestation.refs[0].evidenceId, consensusFixture.managerAttested.evidenceId)

const judgeConsensus = (proposal) => conRun('proposalDisclosure', { disclosures: sizedOnConsensus.data.disclosures, proposal })
/**
 * ⚠️ **The case #229 asked for, and the one nothing covered.** A proposal that
 * discloses in `uncertainty` and not in `risks` has told the run's later readers
 * and told the approving investor nothing — the grade is dropped exactly on the
 * way to the screen that matters, and it is refused there.
 */
const screenSilent = judgeConsensus({ rationale: { risks: ['A KRW book carries FX risk.'] }, uncertainty: ['main_lane_rests_on_manager_attestation: manager-attested consensus.'] })
assert.equal(screenSilent.status, 'blocked')
assert.deepEqual(screenSilent.data.missing, [{ code: 'main_lane_rests_on_manager_attestation', field: 'risks' }], 'and the one slot that is silent is named — «disclosed somewhere» is not the obligation')
assert.ok(has(screenSilent, 'main_lane_attestation_undisclosed'))
const bothSilent = judgeConsensus({ rationale: { risks: [] }, uncertainty: [] })
assert.deepEqual(bothSilent.data.missing.map((row) => row.field), ['risks', 'uncertainty'])
const bothCarried = judgeConsensus({ rationale: { risks: consensusAsOf.disclosure.risks }, uncertainty: consensusAsOf.disclosure.uncertainty })
assert.equal(bothCarried.data.disclosed, true)
assert.notEqual(bothCarried.status, 'blocked')
/** ⛔ And no wording moved the weight: the sizing is a function of the numbers alone since #212 ②. */
assert.equal(sizedOnConsensus.data.targetWeight, 0.07916667)
/** ⛔ A lane opened on vendor evidence owes nothing — an obligation that fired on the ordinary case is noise. */
const vendorSized = conRun('targetWeight', { ...sizingInput, thesis: { ...conThesis, consensusRefs: [consensusFixture.vendorAttested] }, challengeVerdict: 'cleared' })
assert.equal(vendorSized.data.mainLaneAttestation, null)
assert.deepEqual(vendorSized.data.disclosures, [])
assert.equal(vendorSized.data.targetWeight, 0.07916667, 'and it sizes identically — the grade is a disclosure and never a discount')

console.log('evidence-gated issue #229 consensus-procedure regression tests passed')
