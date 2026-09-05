import assert from 'node:assert/strict'
import { execute } from '../managers/evidence-gated/lib/index.mjs'
import { handleMcpRequest } from '../managers/evidence-gated/lib/mcp-server.mjs'

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
console.log('evidence-gated issues #145–149 regression tests passed')
