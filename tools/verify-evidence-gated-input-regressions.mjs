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

// #148: calculated arms are pending; only actual host receipts deduplicate.
const sequence = [{ flow: 'kr-sleeve', at: '2026-09-07T07:00:00Z' }]
const remembered = { schemaVersion: 2, updatedAsOf: asOf, armed: [{ flow: 'kr-sleeve', atEpochMs: Date.parse(sequence[0].at) }] }
const phantom = run('reconcileArmedReviews', { previous: remembered, journalArmed: [], sequence })
assert.ok(has(phantom, 'armed_journal_mismatch'))
assert.deepEqual(phantom.data.toArm, sequence)
assert.deepEqual(phantom.data.nextState.armed, [])
const confirmed = run('reconcileArmedReviews', { previous: remembered, journalArmed: sequence, sequence })
assert.deepEqual(confirmed.data.toArm, [])
assert.equal(confirmed.data.nextState.armed.length, 1)
const missingJournal = run('reconcileArmedReviews', { previous: remembered, sequence })
assert.ok(has(missingJournal, 'armed_journal_unverified'))
assert.deepEqual(missingJournal.data.toArm, sequence)
const corrupt = run('reconcileArmedReviews', { previous: { ...remembered, armed: [{ flow: 'kr-sleeve', atEpochMs: 1757228400000, atLabel: '2026-09-07 07h00m00s UTC' }] }, journalArmed: sequence, sequence })
assert.ok(has(corrupt, 'armed_instant_mismatch'))
assert.equal(corrupt.data.nextState, null)
assert.equal(run('reconcileArmedReviews', { previous: remembered, journalArmed: sequence, sequence: [] }).data.nextState.armed.length, 1)

// #149: DKS's capped USD 200 cannot fund three whole-share rungs.
const ceiling = run('experimentalCeiling', { portfolioNav: 14866.44, portfolioNavCurrency: 'USD', experimentalPositionFloor: { USD: 200, KRW: 300000 }, positionCurrency: 'USD', maturity: 'insufficient' })
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
