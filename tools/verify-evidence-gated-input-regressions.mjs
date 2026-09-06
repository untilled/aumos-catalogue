import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated/lib/index.mjs'
import { handleMcpRequest } from '../managers/evidence-gated/lib/mcp-server.mjs'
import { METHODOLOGY } from '../managers/evidence-gated/lib/constants.mjs'

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
assert.deepEqual(contracts.keys.refutedMemoryRules, ['patterns'])

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
