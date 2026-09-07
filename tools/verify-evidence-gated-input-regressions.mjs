import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated/lib/index.mjs'
import { handleMcpRequest } from '../managers/evidence-gated/lib/mcp-server.mjs'
import { METHODOLOGY } from '../managers/evidence-gated/lib/constants.mjs'
import { MACRO_INDICATORS } from '../managers/evidence-gated/lib/evidence.mjs'
import { MANAGER_ID } from '../managers/evidence-gated/lib/diagnostics.mjs'

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

// #149: DKS's capped USD 200 cannot fund three whole-share rungs.
const ceiling = run('experimentalCeiling', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', experimentalPositionFloor: { USD: 200, KRW: 300000 }, positionCurrency: 'USD' })
const weight = ceiling.data.experimentalCeiling
const plan = { symbol: 'DKS', lens: 'mean-reversion', maturity: 'insufficient', price: 139.15, plannedTotalWeight: weight, execution: { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'USD', lotSize: 1 }, tranches: [{ weight: weight / 3, condition: { kind: 'immediate' } }, { weight: weight / 3, condition: { kind: 'price-below', threshold: 130 } }, { weight: weight / 3, condition: { kind: 'price-below', threshold: 120 } }] }
assert.ok(has(run('entryTranchePlan', plan), 'experimental_ladder_unreachable'))
assert.equal(has(run('entryTranchePlan', { ...plan, price: 50 }), 'experimental_ladder_unreachable'), false)
assert.ok(has(run('entryTranchePlan', { ...plan, execution: null }), 'experimental_ladder_unevaluated'))
assert.equal(has(run('entryTranchePlan', { ...plan, execution: { ...plan.execution, lotSize: 0.01 } }), 'experimental_ladder_unreachable'), false)
/**
 * #151: the declared cap and the operative cap, on the book that reported it.
 *
 * Every number here is the reported run's: NAV USD 14,866.44, a USD 200 venue
 * floor, `experimentalCeiling` 0.01345312 binding on that floor, a control arm
 * that then holds a single name to 0.01, and a Mandate that declared 0.20.
 */
const issueBook = { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', experimentalPositionFloor: { USD: 200, KRW: 300000 }, positionCurrency: 'USD' }
const capOf = (extra = {}) => run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.2, maturityStatus: 'insufficient', lane: 'control-arm', ...extra })
const declaredVersusEffective = capOf({ promotion: { samples: 0, regimes: 0, clusters: 0 } })
assert.equal(declaredVersusEffective.data.declaredCap, 0.2)
assert.equal(declaredVersusEffective.data.effectiveCap, 0.01)
assert.equal(declaredVersusEffective.data.reducedToFraction, 0.05)
assert.equal(declaredVersusEffective.data.binding, 'control-arm-lane')
assert.equal(declaredVersusEffective.data.reason, 'lens_insufficient')
assert.equal(declaredVersusEffective.data.unlocksAt, 'promotionGate')
assert.deepEqual(declaredVersusEffective.data.promotion.required, { samples: 30, regimes: 3, clusters: 10 })
assert.deepEqual(declaredVersusEffective.data.promotion.observed, { samples: 0, regimes: 0, clusters: 0 })
assert.ok(has(declaredVersusEffective, 'position_cap_reduced_by_maturity'))
const reduction = declaredVersusEffective.diagnostics.find((row) => row.code === 'position_cap_reduced_by_maturity')
assert.equal(reduction.severity, 'unevaluated')
assert.equal(reduction.details.reductionMultiple, 20)
assert.deepEqual(reduction.details.limits.map((row) => row.source), ['mandate', 'lens-maturity', 'control-arm-lane'])
// The ceiling alone is not the whole reduction; the lane cap is the part that binds.
assert.ok(reduction.details.limits.some((row) => row.source === 'lens-maturity' && row.weight === 0.01345312))

const promotedAgainstMandate = run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.2, maturityStatus: 'promoted', uncertainty: [] })

/**
 * The row the fund-settings screen draws (untilled/aumos#681, issue #679).
 * `effectiveConstraintSchema` is a strictObject, so the field names are the
 * host's and a methodology name would be refused there.
 */
const constraints = declaredVersusEffective.data.effectiveConstraints
assert.deepEqual(constraints, [{
  field: 'maxPositionWeight',
  declared: 0.2,
  effective: 0.01,
  reason: 'lens_insufficient',
  unlocks: 'promotionGate: samples 0/30 \u00b7 regimes 0/3 \u00b7 clusters 0/10',
}])
assert.deepEqual(Object.keys(constraints[0]).sort(), ['declared', 'effective', 'field', 'reason', 'unlocks'], 'no key the host schema does not carry')
// `declared` is echoed from this run's mandate rather than pinned to one book.
assert.equal(capOf({ mandatePositionCap: 0.1 }).data.effectiveConstraints[0].declared, 0.1)
// No inequality, no row — and an unpromoted lens whose ceiling clears the Mandate emits nothing.
assert.deepEqual(run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.005, maturityStatus: 'insufficient', lane: 'control-arm' }).data.effectiveConstraints, [])
assert.deepEqual(promotedAgainstMandate.data.effectiveConstraints, [])
// Only the axis this methodology actually narrows is named.
assert.deepEqual([...new Set(constraints.map((row) => row.field))], ['maxPositionWeight'])

// The disclosure round-trips exactly as `discovery_lane_dark` does, in both halves.
assert.equal(capOf().data.disclosed, null, 'a call made before the proposal exists leaves the disclosure unjudged')
assert.equal(has(capOf(), 'position_cap_reduction_undisclosed'), false)
assert.ok(has(capOf({ uncertainty: ['the sweep found one candidate'] }), 'position_cap_reduction_undisclosed'))
assert.equal(has(capOf({ uncertainty: ['position_cap_reduced_by_maturity: 0.20 declared, 0.01 operative'] }), 'position_cap_reduction_undisclosed'), false)
// Prose without the machine-readable row is still an undisclosed reduction.
const proseOnly = capOf({ uncertainty: ['position_cap_reduced_by_maturity'], effectiveConstraints: [] })
assert.ok(has(proseOnly, 'position_cap_reduction_undisclosed'))
assert.deepEqual(proseOnly.diagnostics.find((row) => row.code === 'position_cap_reduction_undisclosed').details.missing, ['effectiveConstraints'])
// And the row without the prose is the same silence from the other side.
assert.deepEqual(capOf({ uncertainty: [], effectiveConstraints: constraints }).diagnostics.find((row) => row.code === 'position_cap_reduction_undisclosed').details.missing, ['uncertainty'])
// Both halves carried, and the run is clear.
const bothHalves = capOf({ uncertainty: ['position_cap_reduced_by_maturity'], effectiveConstraints: constraints })
assert.equal(has(bothHalves, 'position_cap_reduction_undisclosed'), false)
assert.equal(bothHalves.data.disclosed, true)
// A row naming another number is not this reduction.
assert.ok(has(capOf({ uncertainty: ['position_cap_reduced_by_maturity'], effectiveConstraints: [{ ...constraints[0], effective: 0.2 }] }), 'position_cap_reduction_undisclosed'))

// A promoted lens is held to the Mandate alone, so there is nothing to disclose.
const promoted = promotedAgainstMandate
assert.equal(promoted.data.effectiveCap, 0.2)
assert.equal(promoted.data.reduced, false)
assert.equal(has(promoted, 'position_cap_reduced_by_maturity'), false)
assert.equal(has(promoted, 'experimental_floor_exceeds_cap'), false)
// An undeclared cap is reported under the code it always had, and no ratio is invented.
const undeclared = run('effectivePositionCap', { ...issueBook, maturityStatus: 'insufficient' })
assert.ok(has(undeclared, 'concentration_inputs_missing'))
assert.equal(undeclared.data.reduced, false)

// The floor sits above the control arm's single-name cell: no US name enters at any price.
assert.ok(has(declaredVersusEffective, 'experimental_floor_exceeds_cap'))
const conflict = declaredVersusEffective.diagnostics.find((row) => row.code === 'experimental_floor_exceeds_cap')
assert.equal(conflict.severity, 'unevaluated')
assert.equal(conflict.details.laneCellAmount, 148.66)
assert.equal(conflict.details.floorAmount, 200)
assert.equal(conflict.details.resolvesAtNav, 20000, 'the NAV that resolves it is stated, not rediscovered every run')
// At that NAV the floor is exactly the cell and the conflict is gone.
assert.equal(has(capOf({ portfolioNav: 20000 }), 'experimental_floor_exceeds_cap'), false)
// #149's ladder code is a different question and does not answer this one.
assert.equal(has(declaredVersusEffective, 'experimental_ladder_unreachable'), false)
assert.equal(has(run('entryTranchePlan', plan), 'experimental_floor_exceeds_cap'), false)

// targetWeight carries the same two numbers rather than a second copy of the arithmetic.
const sized = run('targetWeight', { ...issueBook, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, maturityStatus: 'insufficient', researchGate: 'passed', challengeVerdict: 'cleared' })
assert.equal(sized.data.declaredPositionCap, 0.2)
assert.equal(sized.data.effectivePositionCap, 0.01345312)
assert.equal(sized.data.positionCapReduced, true)
assert.equal(sized.data.positionCapUnlocksAt, 'promotionGate')
assert.ok(has(sized, 'position_cap_reduced_by_maturity'))
assert.equal(sized.data.targetWeight, 0.01345312)
assert.deepEqual(sized.data.effectiveConstraints, [{ field: 'maxPositionWeight', declared: 0.2, effective: 0.01345312, reason: 'lens_insufficient', unlocks: 'promotionGate: samples 30 \u00b7 regimes 3 \u00b7 clusters 10' }])

/**
 * #153: the main lane, the control arm, and the floor the investor declared.
 *
 * The same book as #151 — NAV USD 14,866.44, 57% of it cash, a USD 200 venue
 * floor, a Mandate declaring `maxPositionWeight` 0.20 and `cashFloor` 0.10 —
 * and the source methodology's own approved control-arm numbers, 1% a name and
 * 6% a lane, which nothing below moves.
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
const laneOf = (extra = {}) => run('effectivePositionCap', { ...issueBook, mandatePositionCap: 0.2, maturityStatus: 'insufficient', ...extra })

// A checked variant view is sized by the Mandate, not by the maturity ceiling.
const mainLane = laneOf({ lane: 'main', thesis: mainLaneThesis, challengeVerdict: 'cleared' })
assert.equal(mainLane.data.variantView.verified, true)
assert.deepEqual(mainLane.data.variantView.missing, [])
assert.equal(mainLane.data.resolvedLane, 'main')
assert.equal(mainLane.data.ceilingApplies, false)
assert.equal(mainLane.data.effectiveCap, 0.2)
assert.equal(mainLane.data.reduced, false)
assert.equal(mainLane.data.reason, null)
assert.deepEqual(mainLane.data.effectiveConstraints, [], 'a cap that was not reduced draws no row')
assert.equal(has(mainLane, 'position_cap_reduced_by_maturity'), false)
assert.equal(has(mainLane, 'experimental_floor_exceeds_cap'), false, 'the control arm cell is not this candidate cell')
// The Mandate still governs the lane it opened.
assert.equal(laneOf({ lane: 'main', thesis: mainLaneThesis, challengeVerdict: 'cleared', mandatePositionCap: 0.05 }).data.effectiveCap, 0.05)

// Every requirement is load-bearing, and each failure falls to the control arm rather than through.
for (const [label, extra] of [
  ['no variant view statement', { thesis: { ...mainLaneThesis, variantView: '' } }],
  ['no dated consensus citation', { thesis: { ...mainLaneThesis, consensusRefs: [] } }],
  ['a citation published after it was captured', { thesis: { ...mainLaneThesis, consensusRefs: [{ ...consensusRef, publishedAt: '2026-08-22T00:00:00Z' }] } }],
  ['a citation published after asOf', { thesis: { ...mainLaneThesis, consensusRefs: [{ ...consensusRef, publishedAt: '2027-01-01T00:00:00Z', capturedAt: '2027-01-02T00:00:00Z' }] } }],
  ['an incomplete thesis', { thesis: { ...mainLaneThesis, evidenceStatus: 'incomplete' } }],
  ['a conditional challenge verdict', { challengeVerdict: 'conditional_watch' }],
  ['no thesis at all', { thesis: undefined }],
]) {
  const fallen = laneOf({ lane: 'main', thesis: mainLaneThesis, challengeVerdict: 'cleared', ...extra })
  assert.equal(fallen.data.variantView.verified, false, `${label} is not a variant view`)
  assert.equal(fallen.data.resolvedLane, 'control-arm', `${label} falls to the control arm`)
  assert.equal(fallen.data.effectiveCap, 0.01345312, `${label} is held to the experimental ceiling`)
  assert.ok(has(fallen, 'variant_view_unverified'))
  assert.ok(has(fallen, 'main_lane_requires_variant_view'), 'asking for the lane is not a way into it')
}

// The control arm's approved numbers are untouched, and an explicit request for it is honoured.
assert.equal(METHODOLOGY.controlArm.singleMaxWeight, 0.01)
assert.equal(METHODOLOGY.controlArm.laneTotalMaxWeight, 0.06)
const armWithView = laneOf({ lane: 'control-arm', thesis: mainLaneThesis, challengeVerdict: 'cleared' })
assert.equal(armWithView.data.effectiveCap, 0.01, 'a request for the bounded lane is never overridden into a larger one')
assert.equal(armWithView.data.resolvedLane, 'control-arm')
assert.deepEqual(run('controlArmLane', { proposed: [{ symbol: 'M1', weight: 0.02, exitRegistered: true }] }).data.limits.singleMaxWeight, 0.01)

// The promotion gate is not lowered by any of this.
assert.deepEqual(METHODOLOGY.promotionGate, { samples: 30, regimes: 3, clusters: 10 })

// The control arm's own record may not buy size in the main lane.
const citingTheArm = laneOf({ lane: 'main', thesis: mainLaneThesis, challengeVerdict: 'cleared', evidenceSamples: [{ setup: 'mean_reversion', cohort: 'mechanical-baseline' }] })
assert.ok(has(citingTheArm, 'control_arm_evidence_cited'))
assert.equal(citingTheArm.diagnostics.find((row) => row.code === 'control_arm_evidence_cited').severity, 'blocked')
assert.equal(citingTheArm.data.variantView.verified, false)
assert.equal(citingTheArm.data.effectiveCap, 0.01345312)
// The research cohort's own record is not the control arm's.
assert.equal(laneOf({ lane: 'main', thesis: mainLaneThesis, challengeVerdict: 'cleared', evidenceSamples: [{ setup: 'thesis_call' }] }).data.variantView.verified, true)

// Nothing about an unverified candidate changed: #151's numbers still stand exactly.
assert.equal(capOf({ promotion: { samples: 0, regimes: 0, clusters: 0 } }).data.effectiveCap, 0.01)
assert.equal(run('targetWeight', { ...issueBook, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, maturityStatus: 'insufficient', researchGate: 'passed', challengeVerdict: 'cleared' }).data.targetWeight, 0.01345312)
// and a verified one is sized by the Mandate all the way through `targetWeight`.
const sizedOnMainLane = run('targetWeight', { ...issueBook, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, maturityStatus: 'insufficient', researchGate: 'passed', challengeVerdict: 'cleared', lane: 'main', thesis: mainLaneThesis })
assert.equal(sizedOnMainLane.data.variantViewVerified, true)
assert.equal(sizedOnMainLane.data.experimentalCeilingApplies, false)
assert.equal(sizedOnMainLane.data.targetWeight, 0.2)
assert.deepEqual(sizedOnMainLane.data.effectiveConstraints, [])
// Sector headroom still binds it — the lane is not an exemption from concentration.
assert.equal(run('targetWeight', { ...issueBook, expectedActiveReturn: 0.2, downsideReturn: -0.1, conviction: 1, mandatePositionCap: 0.2, sectorHeadroom: 0.04, maturityStatus: 'insufficient', researchGate: 'passed', challengeVerdict: 'cleared', lane: 'main', thesis: mainLaneThesis }).data.targetWeight, 0.04)

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
// The control arm spends inside the budget rather than beside it.
assert.equal(budget({ controlArmWeight: 0.02 }).data.controlArmRemainingWeight, 0.04)
assert.equal(budget({ controlArmWeight: 0.02 }).data.controlArmLaneTotalMaxWeight, 0.06)

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
for (const operation of ['nextReviewSequence', 'coverage', 'specialistBudget', 'experimentalCeiling', 'exitDiscipline', 'laneCoverage', 'harnessAudit']) {
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
 * `experimentalCeiling`'s KRW leg, which returned `floorAmount: null`,
 * `binding: 'ratio'`, status `ok` and no diagnostic at all. The floor is
 * declared **per venue currency** and the leg had passed a bare amount; the
 * arithmetic it wanted was KRW 300,000 → 0.0149, a floor binding.
 */
const bareFloor = run('experimentalCeiling', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'KRW', experimentalPositionFloor: 300000, usdKrw: 1352.5 })
assert.equal(bareFloor.status, 'blocked', 'a bare amount names no venue, and answering it with the ratio is the silent pass this issue is about')
assert.deepEqual(
  bareFloor.diagnostics.filter((row) => row.code === 'input_shape_invalid').map((row) => row.path).sort(),
  ['input.experimentalPositionFloor', 'input.usdKrw'],
  'both halves of the KRW leg are named: the floor is a per-currency map and the rate is fx.USDKRW',
)
// Declared per venue, with the rate where the contract says it is, the leg binds on the floor.
const krwLeg = run('experimentalCeiling', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'KRW', experimentalPositionFloor: { USD: 200, KRW: 300000 }, fx: { USDKRW: 1352.5 } })
assert.equal(krwLeg.data.binding, 'floor')
assert.equal(krwLeg.data.floorAmount, 300000)
assert.equal(krwLeg.data.floorWeight, 0.01492028, '300,000 / 1352.5 / 14,866.44')
// The USD leg is unchanged, and it is the one that always worked.
const usdLeg = run('experimentalCeiling', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'USD', experimentalPositionFloor: { USD: 200, KRW: 300000 } })
assert.equal(usdLeg.data.binding, 'floor')
assert.equal(usdLeg.data.floorWeight, 0.01345312)
// No floor declared at all is the ratio alone, said out loud rather than implied.
const ratioOnly = run('experimentalCeiling', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', positionCurrency: 'USD' })
assert.equal(ratioOnly.data.binding, 'ratio')
assert.ok(has(ratioOnly, 'experimental_floor_unevaluated'))

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
  ['sleeveNav', { cash: { KRW: 1000 } }],
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
const unread = run('themeRadarDue', { lastRunAt: '2026-09-01T00:00:00Z', expectedDue: true })
assert.ok(has(unread, 'input_key_unread'))
assert.equal(unread.diagnostics.find((row) => row.code === 'input_key_unread').path, 'input.expectedDue')
assert.equal(unread.status, 'unevaluated')
assert.equal(unread.data.due, true, 'the answer it did compute still stands; the caller is told which part of the call was not read')
// ⛔ And the invocation's asOf is not silently overruled by a second copy inside the input.
assert.ok(has(execute({ operation: 'themeRadarDue', asOf, input: { lastRunAt: '2026-09-01T00:00:00Z', asOf: '2020-01-01T00:00:00Z' } }), 'input_shape_invalid'))
assert.equal(execute({ operation: 'themeRadarDue', asOf, input: { lastRunAt: '2026-09-01T00:00:00Z', asOf } }).status, 'ok', 'a copy that agrees costs nothing')

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
assert.equal(feedRun('researchUniverse', { market: 'XKRX' }).status, 'blocked', 'the MIC is refused rather than answered')
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
assert.equal(neverFed.data.verdict, 'never-fed')
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
const fedButEmpty = feedRun('radarFeedDiagnosis', { market: 'kr', symbols: ['005930'], plan: freshPlan.data, mapping: joined, candidates: { fedCount: 1, comparableCount: 1 }, lanes: bare.data.lanes })
assert.equal(fedButEmpty.data.fed, true)
assert.equal(fedButEmpty.data.verdict, 'fed-and-genuinely-empty')
assert.ok(feedHas(fedButEmpty, 'radar_lane_empty_not_starved'))
assert.equal(feedHas(fedButEmpty, 'radar_feed_broken'), false)
assert.notEqual(fedButEmpty.data.verdict, neverFed.data.verdict)

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
const feedOf = (rows, lanesIn = partialLanes) => feedRun('radarFeedDiagnosis', {
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
assert.equal(feedRun('radarCandidates', { market: 'XKRX', symbols: [] }).status, 'blocked')

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

/** The cap arithmetic the issue measured, unchanged, and now saying why. */
const cap = valRun('effectivePositionCap', {
  mandatePositionCap: 0.2,
  maturityStatus: 'insufficient',
  lane: 'main',
  nav: { amount: 14866.44, currency: 'USD' },
  thesis: measuredThesis,
  challengeVerdict: 'cleared',
})
assert.equal(cap.data.effectiveCap, 0.01)
assert.equal(cap.data.mainLaneOpen, false)
assert.equal(cap.data.resolvedLane, 'control-arm')
const capReduction = cap.diagnostics.find((row) => row.code === 'position_cap_reduced_by_maturity')
assert.equal(capReduction.details.declared, 0.2)
assert.equal(capReduction.details.effective, 0.01)
assert.equal(capReduction.details.reductionMultiple, 20)
assert.equal(capReduction.details.reason, 'lens_insufficient')
// ⛔ The reason a twentyfold reduction binds is now readable one requirement at a time.
assert.equal(capReduction.details.mainLane.satisfiedCount, 3)
assert.equal(capReduction.details.mainLane.requirementCount, 4)
assert.deepEqual(capReduction.details.mainLane.missing, ['thesisComplete'])
assert.equal(capReduction.details.mainLane.requirementReport.find((row) => row.requirement === 'thesisComplete').gaps.length, 4)
assert.ok(valHas(cap, 'main_lane_requires_variant_view'))
assert.ok(cap.diagnostics.find((row) => row.code === 'main_lane_requires_variant_view').details.requirementReport)

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
