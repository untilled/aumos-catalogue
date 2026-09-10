/**
 * `catalyst-turnaround`'s deterministic core, against its committed fixtures.
 *
 *   node tools/verify-catalyst-turnaround.mjs
 *
 * ── Why this package has code at all, and why only this much ───────────────
 *
 * The catalogue's default is prose, and it should be: a methodology written as
 * instructions is readable by the person whose money it judges, and most of what
 * this manager does is judgement a table would only pretend to make. What is in
 * `managers/catalyst-turnaround/lib/` is the part #258's and #256's completion
 * criteria ask to be **checkably** right rather than model-judged — and each of
 * those is a rule whose failure is *silent*:
 *
 *   ⑴ a catalyst ledger whose states and delays are counted the same way every
 *      run. A model asked «has this slipped before?» reads its own notes;
 *   ⑵ a comparison between two points in time that cannot quietly include a
 *      figure published after `asOf`;
 *   ⑶ sizing from the distance to invalidation, so the cap is never the order;
 *   ⑷ a staged plan that does not add the same stage twice on a re-run;
 *   ⑸ a classification a fixture can assert, including the two things #258 asks
 *      for by name: the reference case classifies, and a valuation multiple
 *      does not exclude it.
 *
 * ── What a green tick here does and does not establish ────────────────────
 *
 * ✅ It establishes that the arithmetic and the ladder do what the fixtures say,
 * that the same inputs give the same answer, and — the assertion this file exists
 * for — that **six different catalyst outcomes reach six different judgements**.
 * #256 refuses an implementation where every case ends in WAIT, and that failure
 * is invisible in a test suite that only checks each case in isolation, so the
 * distinctness is asserted across cases rather than within them.
 *
 * ⛔ It establishes nothing about whether the methodology makes money, nothing
 * about the reference case's actual history, and nothing about the host: the
 * proposal envelope, `decision_submit`'s schema and the WATCH machinery belong to
 * Aumos and are not reimplemented here to be tested against themselves.
 *
 * Plain Node over committed JSON, in this repository's idiom: no install, no
 * network, no test framework — there is none here and this file does not add one.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CAUSE_CODES,
  CATALYST_TRANSITIONS,
  INTENTS,
  INTENT_WEIGHT_ROLES,
  INTENT_WEIGHT_ROLE_NAMES,
  METHODOLOGY,
  TERMINAL_STATES,
  accountConcentration,
  catalystLedger,
  cause,
  round,
  runVerdict,
  scoreboards,
  stagedPlan,
} from '../managers/catalyst-turnaround/lib/index.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = join(ROOT, 'managers/catalyst-turnaround')
const read = (path) => JSON.parse(readFileSync(join(PACKAGE, path), 'utf8'))

const codes = (rows) => rows.map((row) => row.code)
const has = (rows, code) => codes(rows).includes(code)

let checks = 0
const check = (message, run) => {
  run()
  checks += 1
  void message
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The ladder, one case per rung.
// ─────────────────────────────────────────────────────────────────────────────

const cases = read('fixtures/cases.json')
const reached = new Map()

for (const item of cases.cases) {
  const result = runVerdict(item.input)
  const where = `cases.json → ${item.name}`

  check(`${where} reaches its intent`, () => {
    assert.equal(result.data.intent, item.expect.intent, `${where}: expected ${item.expect.intent}, got ${result.data.intent}`)
    assert.equal(result.data.review.name, item.expect.review, `${where}: review`)
    assert.equal(result.data.review.benchmarkComparisonRequired, item.expect.benchmarkComparisonRequired === true, `${where}: benchmarkComparisonRequired`)
  })

  check(`${where} reports the causes it should`, () => {
    for (const code of item.expect.causeCodes ?? []) {
      assert.ok(has(result.causes, code), `${where}: expected cause ${code}, got ${codes(result.causes).join(', ') || '(none)'}`)
    }
    /**
     * ⛔ The one-directional check that matters, and the reason it is written
     * this way round. #254 and #256 both say absence is not refutation, and the
     * way that rule breaks is a run reporting `thesis_refuted` for something it
     * merely could not read. So a case that did not declare it must not produce
     * it — a subset assertion alone would never catch that.
     */
    if (!(item.expect.causeCodes ?? []).includes('thesis_refuted')) {
      assert.ok(!has(result.causes, 'thesis_refuted'), `${where}: reported thesis_refuted without the fixture claiming a refutation`)
    }
  })

  check(`${where} reports the diagnostics it should`, () => {
    for (const code of item.expect.diagnosticCodes ?? []) {
      assert.ok(has(result.diagnostics, code), `${where}: expected diagnostic ${code}, got ${codes(result.diagnostics).join(', ') || '(none)'}`)
    }
  })

  reached.set(item.name, `${result.data.intent}::${result.data.review.name}`)
}

/**
 * ── The assertion this file exists for ────────────────────────────────────
 *
 * «촉매 실현, 1회 지연, 반복 지연, 취소, 미수금 재증가/차환 악화 fixture가 서로
 * 다른 판단과 리뷰를 만든다» (#258), and #256's «모든 사례가 대기로 끝나는 구현을
 * 성공으로 처리하지 않는다». Six named cases, six distinct `intent::review`
 * pairs. A change that collapsed two of them into one would pass every check
 * above and fail here, which is the point.
 */
const SIX = [
  'catalyst-realised-and-priced-in',
  'one-delay-with-new-evidence',
  'repeated-delay-exhausts-the-budget',
  'catalyst-cancelled',
  'receivable-re-growth-fires-a-declared-invalidation',
  'refinancing-deterioration',
]
check('the six catalyst outcomes reach six different judgements', () => {
  const pairs = SIX.map((name) => {
    const pair = reached.get(name)
    assert.ok(pair !== undefined, `cases.json is missing the case ${name}`)
    return pair
  })
  assert.equal(new Set(pairs).size, SIX.length, `the six cases collapsed onto ${new Set(pairs).size} judgement(s): ${pairs.join(' | ')}`)
  assert.ok(!pairs.some((pair) => pair.startsWith('wait-for-data')), 'a catalyst outcome ended in wait-for-data, which is the failure #256 names')
})

check('the positive thesis reaches the entry path and the refuted one reaches an exit', () => {
  assert.equal(reached.get('completed-positive-thesis-reaches-the-buy-path'), 'enter-staged::staged-entry-armed')
  assert.equal(reached.get('catalyst-cancelled'), 'close-out::catalyst-cancelled')
})

check('every intent the ladder can produce is a registered one', () => {
  for (const pair of reached.values()) assert.ok(INTENTS.includes(pair.split('::')[0]), `${pair} is not a registered intent`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. The ledger's mechanical rules, one scenario per rule.
// ─────────────────────────────────────────────────────────────────────────────

const ledgerFixture = read('fixtures/ledger.json')

for (const scenario of ledgerFixture.scenarios) {
  const row = { ...ledgerFixture.baseCatalyst, ...scenario.overrides }
  const result = catalystLedger({
    previous: scenario.previous ?? null,
    rows: [row],
    transitions: scenario.transitions ?? [],
    asOf: ledgerFixture.asOf,
  })
  const where = `ledger.json → ${scenario.name}`
  const only = result.data.rows[0]

  check(`${where} produces its diagnostics`, () => {
    for (const code of scenario.expect.diagnosticCodes ?? []) {
      assert.ok(has(result.diagnostics, code), `${where}: expected ${code}, got ${codes(result.diagnostics).join(', ') || '(none)'}`)
    }
    if ((scenario.expect.diagnosticCodes ?? []).length === 0) {
      assert.deepEqual(
        result.diagnostics.filter((entry) => entry.severity === 'blocked'),
        [],
        `${where}: expected no blocked diagnostic, got ${codes(result.diagnostics).join(', ')}`,
      )
    }
  })

  check(`${where} lands in the state it should`, () => {
    if (scenario.expect.state !== undefined) assert.equal(only.state, scenario.expect.state, `${where}: state`)
    if (scenario.expect.registered !== undefined) assert.equal(only.registered, scenario.expect.registered, `${where}: registered`)
    if (scenario.expect.confirmedDates !== undefined) assert.equal(result.data.summary.confirmedDates, scenario.expect.confirmedDates, `${where}: confirmedDates`)
    if (scenario.expect.estimatedDates !== undefined) assert.equal(result.data.summary.estimatedDates, scenario.expect.estimatedDates, `${where}: estimatedDates`)
    if (scenario.expect.dueForAdjudication !== undefined) assert.equal(only.dueForAdjudication, scenario.expect.dueForAdjudication, `${where}: dueForAdjudication`)
    for (const id of scenario.expect.contraryEvidenceIncludes ?? []) {
      assert.ok(only.contraryEvidence.includes(id), `${where}: contrary evidence ${id} was not reinstated`)
    }
    for (const code of scenario.expect.causeCodes ?? []) {
      assert.ok(has(result.causes, code), `${where}: expected cause ${code}`)
    }
  })
}

check('no state machine path leaves a terminal state', () => {
  for (const state of TERMINAL_STATES) {
    assert.deepEqual(CATALYST_TRANSITIONS[state], [], `${state} has an exit, and a finished record is not edited`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. The staged plan, read four times.
// ─────────────────────────────────────────────────────────────────────────────

const staging = read('fixtures/staging.json')

for (const run of staging.runs) {
  const result = stagedPlan({ previous: run.previous, plan: staging.plan, price: run.price, asOf: run.asOf })
  const where = `staging.json → ${run.name}`
  check(`${where} adds what it should and no more`, () => {
    if (run.expect.addedThisRun !== undefined) assert.equal(result.data.addedThisRun, run.expect.addedThisRun, `${where}: addedThisRun`)
    if (run.expect.cumulativeWeightAfter !== undefined) assert.equal(result.data.cumulativeWeightAfter, run.expect.cumulativeWeightAfter, `${where}: cumulativeWeightAfter`)
    if (run.expect.filledStageIds !== undefined) assert.deepEqual(result.data.filledStageIds, run.expect.filledStageIds, `${where}: filledStageIds`)
    if (run.expect.pendingStageIds !== undefined) assert.deepEqual(result.data.pendingStageIds, run.expect.pendingStageIds, `${where}: pendingStageIds`)
    if (run.expect.lapsedStageIds !== undefined) assert.deepEqual(result.data.lapsedStageIds, run.expect.lapsedStageIds, `${where}: lapsedStageIds`)
    for (const code of run.expect.diagnosticCodes ?? []) assert.ok(has(result.diagnostics, code), `${where}: expected ${code}`)
  })
}

/**
 * The same thing said once more, from the other end: two consecutive runs over
 * one register never take the position past the plan's own cumulative target.
 * The fixture asserts the increments; this asserts the invariant, so a future
 * stage added to the fixture cannot quietly break it.
 */
check('replaying the whole plan never exceeds its cumulative target', () => {
  let register = null
  for (const run of staging.runs) {
    const result = stagedPlan({ previous: register, plan: staging.plan, price: run.price, asOf: run.asOf })
    register = result.data.nextRegister
    assert.ok(
      register.filledWeight <= staging.plan.cumulativeTargetWeight + 1e-9,
      `replaying reached ${register.filledWeight} against a target of ${staging.plan.cumulativeTargetWeight}`,
    )
  }
})

for (const scenario of staging.malformed) {
  const result = stagedPlan({ previous: null, plan: scenario.plan, price: scenario.price, asOf: scenario.asOf })
  const where = `staging.json → malformed → ${scenario.name}`
  check(`${where} is refused`, () => {
    for (const code of scenario.expect.diagnosticCodes ?? []) assert.ok(has(result.diagnostics, code), `${where}: expected ${code}`)
    for (const code of scenario.expect.causeCodes ?? []) assert.ok(has(result.causes, code), `${where}: expected cause ${code}`)
    if (scenario.expect.addedThisRun !== undefined) assert.equal(result.data.addedThisRun, scenario.expect.addedThisRun, `${where}: addedThisRun`)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Whole-account concentration.
// ─────────────────────────────────────────────────────────────────────────────

const concentration = read('fixtures/concentration.json')

for (const scenario of concentration.scenarios) {
  const result = accountConcentration({
    positions: scenario.positions,
    proposals: scenario.proposals,
    caps: scenario.caps,
    strategy: scenario.strategy,
  })
  const where = `concentration.json → ${scenario.name}`
  check(`${where} measures one book`, () => {
    for (const [symbol, total] of Object.entries(scenario.expect.total ?? {})) {
      assert.equal(result.data.rows.find((row) => row.symbol === symbol)?.total, total, `${where}: total for ${symbol}`)
    }
    for (const [symbol, headroom] of Object.entries(scenario.expect.headroom ?? {})) {
      assert.equal(result.data.headroom[symbol], headroom, `${where}: headroom for ${symbol}`)
    }
    if (scenario.expect.strategyCapTotal !== undefined) assert.equal(result.data.strategyCapTotal, scenario.expect.strategyCapTotal, `${where}: strategyCapTotal`)
    if (scenario.expect.breaches !== undefined) assert.deepEqual(result.data.breaches, scenario.expect.breaches, `${where}: breaches`)
    for (const code of scenario.expect.diagnosticCodes ?? []) assert.ok(has(result.diagnostics, code), `${where}: expected ${code}`)
    for (const code of scenario.expect.causeCodes ?? []) assert.ok(has(result.causes, code), `${where}: expected cause ${code}`)
  })
}

/**
 * ── #813: the host states a **total**, and three books it is measured on ───
 *
 * The scenarios are the A/B/C of `untilled/aumos` PR #815, which drove the real
 * host — `Kernel.decide`, real `position_assignments`, `discoveryService`'s
 * `portfolio-get` — and fed its answer to this package's own `lib`. The fund is
 * ₩100,000,000 on XKRX with a 20% account single-name ceiling, and the third
 * column is what that host actually produces once the orders go out:
 *
 *   A  held 0%  · pending total 8%   → 8%   (unchanged by #813)
 *   B  held 6%  · pending total 12%  → 12%  (this package said 18%)
 *   C  held 6%  · pending total 15%  → 15%  (said 21%: breach, headroom 0)
 *
 * ⚠️ **B and C are the shape of the defect**: a name that is *already held* and
 * *also* carries a pending total. In A the two readings coincide — nobody holds
 * the name — which is why #810's measurement, every row of which was an unheld
 * name, could not tell them apart.
 */
for (const scenario of [
  { label: 'A — held 0%, pending total 8%', held: 0, pendingTotal: 0.08, total: 0.08, proposed: 0.08, naive: 0.08, headroom: 0.12 },
  { label: 'B — held 6%, pending total 12%', held: 0.06, pendingTotal: 0.12, total: 0.12, proposed: 0.06, naive: 0.18, headroom: 0.08 },
  { label: 'C — held 6%, pending total 15%', held: 0.06, pendingTotal: 0.15, total: 0.15, proposed: 0.09, naive: 0.21, headroom: 0.05 },
]) {
  check(`#813 ${scenario.label} — the pending total is folded by maximum and the ceiling still has room`, () => {
    const answer = accountConcentration({
      positions: scenario.held > 0 ? [{ symbol: 'A00007', weight: scenario.held, strategy: 'shareholder-rerating' }] : [],
      proposals: [{ symbol: 'A00007', targetWeight: scenario.pendingTotal, strategy: 'fundamental-mean-reversion' }],
      caps: { accountSingleName: 0.2 },
      strategy: 'catalyst-turnaround',
    })
    const row = answer.data.rows.find((entry) => entry.symbol === 'A00007')
    assert.equal(row.total, scenario.total, `${scenario.label}: the account's exposure to this name`)
    if (scenario.naive !== scenario.total) assert.notEqual(row.total, scenario.naive, `${scenario.label}: the holding and the pending total were added`)
    assert.equal(row.held, scenario.held)
    assert.equal(row.proposed, scenario.proposed, `${scenario.label}: what the pending total still asks for on top of the holding`)
    assert.equal(row.breach, false, `${scenario.label}: a book with room reported a breach`)
    assert.equal(row.headroomForStrategy, scenario.headroom, `${scenario.label}: what is left of the 20% ceiling`)
    assert.ok(!has(answer.causes, 'risk_limit_exceeded'), `${scenario.label}: a book with room refused`)
  })
}

check('#813 — a pending trim does not reduce exposure before it fills, and two managers naming one total have agreed on it', () => {
  const trimming = accountConcentration({
    positions: [{ symbol: 'A00011', weight: 0.14, strategy: 'catalyst-turnaround' }],
    proposals: [{ symbol: 'A00011', targetWeight: 0.08, strategy: 'catalyst-turnaround' }],
    caps: { accountSingleName: 0.2 },
    strategy: 'catalyst-turnaround',
  })
  assert.equal(trimming.data.rows[0].total, 0.14, 'a pending trim was read as though it had already filled')
  assert.equal(trimming.data.rows[0].proposed, 0, 'a pending total below the holding asked for something on top of it')

  const twoManagers = accountConcentration({
    positions: [{ symbol: 'A00007', weight: 0.06, strategy: 'shareholder-rerating' }],
    proposals: [
      { symbol: 'A00007', targetWeight: 0.12, strategy: 'fundamental-mean-reversion' },
      { symbol: 'A00007', targetWeight: 0.12, strategy: 'evidence-gated' },
    ],
    caps: { accountSingleName: 0.2 },
    strategy: 'catalyst-turnaround',
  })
  assert.equal(twoManagers.data.rows[0].total, 0.12, 'two proposals for the same total were read as a request for twice it')
  assert.equal(twoManagers.data.rows[0].breach, false)
  assert.equal(twoManagers.data.rows[0].headroomForStrategy, 0.08, 'the other strategies were charged twice for one end state')
})

check('#813 — the sector axis folds the same way, or a ceiling counts one name twice', () => {
  const answer = accountConcentration({
    positions: [
      { symbol: 'A00007', sector: 'utilities', weight: 0.06, strategy: 'shareholder-rerating' },
      { symbol: 'A00008', sector: 'utilities', weight: 0.1, strategy: 'evidence-gated' },
    ],
    proposals: [{ symbol: 'A00007', sector: 'utilities', targetWeight: 0.12, strategy: 'fundamental-mean-reversion' }],
    caps: { accountSingleName: 0.2, accountSector: 0.3 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A00007', sector: 'utilities' },
  })
  assert.equal(answer.data.sectorState, 'evaluated')
  assert.equal(answer.data.sectorExposure.utilities, 0.22, 'the sector total added a holding and its own pending total')
  assert.ok(!has(answer.causes, 'risk_limit_exceeded'), 'a sector with room was reported as past its ceiling')
})
/**
 * ── #814/#816: the holding row names its assignee, and the fold does not move ─
 *
 * `untilled/aumos#816` puts an `assignment` — `assigned` · `none` · `released` ·
 * `departed`, plus the assignee's **instance** id — on every holding row that
 * `portfolio_get` answers. The adapter that turns one into this package's input is
 * one expression, and it is the one that PR's own measurement used:
 *
 *   `assignment.state === 'assigned' ? (mine ? my strategy id : that instance) : 'unattributed'`
 *
 * ⛔ **Two axes, and only one of them moves.** The fold answers *«what will this
 * name be»* and is keyed on the name, because a `position-weight` target is
 * executed against the whole position — `rebalanceShadowBook` reads the position's
 * total weight and never its attribution (`untilled/aumos#815`). Attribution
 * answers *«how much of it is mine»*, which is `byStrategy` and
 * `headroomForStrategy`. So an assignment that arrives, changes or is withdrawn
 * moves the second and leaves the first exactly where it was, and the two cases
 * below are that sentence made checkable.
 */
check('#814 — the assignee moves the strategy headroom and never the name total', () => {
  const assignment = (state, managerInstanceId = null) => ({ state, managerInstanceId })
  const MINE = 'inst_catalyst_turnaround'
  const strategyOf = (row) =>
    row.state === 'assigned' ? (row.managerInstanceId === MINE ? 'catalyst-turnaround' : row.managerInstanceId) : 'unattributed'

  /** PR untilled/aumos#816's own table, reproduced against this branch: no pending, 6% held, 20% ceiling. */
  for (const [expected, view] of [
    [0.2, assignment('assigned', MINE)],
    [0.14, assignment('assigned', 'inst_shareholder_rerating')],
    [0.14, assignment('none')],
    [0.14, assignment('released')],
    [0.14, assignment('departed')],
  ]) {
    const answer = accountConcentration({
      positions: [{ symbol: 'A00007', weight: 0.06, strategy: strategyOf(view) }],
      proposals: [],
      caps: { accountSingleName: 0.2 },
      strategy: 'catalyst-turnaround',
    })
    const row = answer.data.rows[0]
    assert.equal(row.total, 0.06, `${view.state}: the assignee changed what the name totals`)
    assert.equal(row.headroomForStrategy, expected, `${view.state}: headroom for this strategy`)
  }

  /**
   * ⚠️ **And the three unattributed words stay conservative.** `none`, `released`
   * and `departed` each leave the holding as somebody else's, because a holding
   * nobody assigned is not a holding this manager may assume (aumos-catalogue#268 §1).
   */
  for (const [label, held, pendingTotal, total] of [['A', 0, 0.08, 0.08], ['B', 0.06, 0.12, 0.12], ['C', 0.06, 0.15, 0.15]]) {
    const answers = [assignment('assigned', MINE), assignment('assigned', 'inst_shareholder_rerating'), assignment('none')].map((view) =>
      accountConcentration({
        positions: held > 0 ? [{ symbol: 'A00007', weight: held, strategy: strategyOf(view) }] : [],
        proposals: [{ symbol: 'A00007', targetWeight: pendingTotal, strategy: 'inst_fundamental_mean_reversion' }],
        caps: { accountSingleName: 0.2 },
        strategy: 'catalyst-turnaround',
      }).data.rows[0],
    )
    for (const row of answers) {
      assert.equal(row.total, total, `${label}: the fold read the assignment`)
      assert.equal(row.held, held, `${label}: the holding moved with the assignment`)
      assert.equal(row.breach, false)
    }
    // …and the split does move, which is the axis the assignment is for.
    assert.equal(answers[0].headroomForStrategy > answers[1].headroomForStrategy || held === 0, true, `${label}: being the assignee opened no headroom`)
    assert.equal(answers[1].headroomForStrategy, answers[2].headroomForStrategy, `${label}: an unattributed holding was read as this manager's`)
  }
})

/**
 * ── #269: the sector axis this package does not compute ───────────────────
 *
 * ⛔ **«No sector concept, therefore no conflict» was a claim about the code and
 * not about the account.** The host does not enforce a Mandate's sector ceiling
 * and this package did not receive one, so under such a Mandate a run could open
 * a position that put the account through a limit its investor had declared —
 * and every number in the answer would be right. The arithmetic is still not
 * this package's methodology; the *contract* is.
 */
check('#269 — an undeclared sector ceiling is not applicable and constrains nothing', () => {
  const answer = accountConcentration({
    positions: [{ symbol: 'A', weight: 0.04, strategy: 'catalyst-turnaround' }],
    proposals: [],
    caps: { accountSingleName: 0.2 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A', sector: null },
  })
  assert.equal(answer.data.sectorState, 'not-applicable')
  assert.ok(has(answer.diagnostics, 'sector_cap_not_applicable'), 'an axis nobody declared and an axis nobody looked at left the same trace')
  assert.ok(!has(answer.causes, 'data_missing'), 'an undeclared sector ceiling withheld an increase it never constrained')
})

check('#269 — a declared sector ceiling is evaluated when every row carries a sector', () => {
  const within = accountConcentration({
    positions: [{ symbol: 'B', sector: 'utilities', weight: 0.06, strategy: 'evidence-gated' }],
    proposals: [],
    caps: { accountSingleName: 0.2, accountSector: 0.3 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A', sector: 'utilities' },
  })
  assert.equal(within.data.sectorState, 'evaluated')
  assert.equal(within.data.sectorExposure.utilities, 0.06)
  assert.ok(!has(within.causes, 'data_missing'))
  assert.ok(!has(within.causes, 'risk_limit_exceeded'))

  const over = accountConcentration({
    positions: [{ symbol: 'B', sector: 'utilities', weight: 0.34, strategy: 'evidence-gated' }],
    proposals: [],
    caps: { accountSingleName: 0.4, accountSector: 0.3 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A', sector: 'utilities' },
  })
  assert.ok(has(over.causes, 'risk_limit_exceeded'), 'a sector already past its declared ceiling was not a limit finding')
})

check('#269 — a declared ceiling whose total cannot be formed is an absence, from the candidate or from the book', () => {
  const noCandidateSector = accountConcentration({
    positions: [{ symbol: 'B', sector: 'utilities', weight: 0.06, strategy: 'evidence-gated' }],
    proposals: [],
    caps: { accountSingleName: 0.2, accountSector: 0.3 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A', sector: null },
  })
  assert.equal(noCandidateSector.data.sectorState, 'unevaluated')
  assert.ok(has(noCandidateSector.causes, 'data_missing'))
  assert.ok(!has(noCandidateSector.causes, 'thesis_refuted'), 'an unformable sector total was recorded against the thesis')

  /**
   * ⛔ **The hole #269 names: the candidate is classified and a *book row* is not.**
   * A ceiling is measured against a total, and one unclassified row makes the
   * total short by whatever it is. A run that checked only the candidate passes
   * this one.
   */
  const unclassifiedRow = accountConcentration({
    positions: [
      { symbol: 'B', sector: 'utilities', weight: 0.06, strategy: 'evidence-gated' },
      { symbol: 'C', weight: 0.05, strategy: 'shareholder-rerating' },
    ],
    proposals: [],
    caps: { accountSingleName: 0.2, accountSector: 0.3 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A', sector: 'utilities' },
  })
  assert.equal(unclassifiedRow.data.sectorState, 'unevaluated', 'the candidate named its sector and the book could not form one, and it passed')
  assert.deepEqual(
    unclassifiedRow.causes.find((row) => row.code === 'data_missing')?.details.unclassified,
    ['C'],
    'the run has to name the row it could not classify',
  )

  const unclassifiedProposal = accountConcentration({
    positions: [],
    proposals: [{ symbol: 'D', targetWeight: 0.04, strategy: 'shareholder-rerating' }],
    caps: { accountSingleName: 0.2, accountSector: 0.3 },
    strategy: 'catalyst-turnaround',
    candidate: { symbol: 'A', sector: 'utilities' },
  })
  assert.equal(unclassifiedProposal.data.sectorState, 'unevaluated', 'an unclassified open proposal was left out of the sector total')
})

check('#269 end to end — the entry waits and the exits stay open', () => {
  const positive = cases.cases.find((item) => item.name === 'completed-positive-thesis-reaches-the-buy-path')
  assert.ok(positive, 'cases.json no longer carries the buy-path case, so this regression is testing nothing')
  const withSectorCap = (name) => {
    const item = structuredClone(cases.cases.find((row) => row.name === name).input)
    item.book.caps = { ...(item.book.caps ?? {}), accountSector: 0.3 }
    item.book.positions = [...(item.book.positions ?? []), { symbol: 'MYSTERY', weight: 0.05, strategy: 'shareholder-rerating' }]
    return item
  }

  const withheld = runVerdict(withSectorCap('completed-positive-thesis-reaches-the-buy-path'))
  assert.equal(withheld.data.intent, 'wait-for-data', `a declared sector ceiling nobody could check reached ${withheld.data.intent}`)
  assert.equal(withheld.data.incrementThisRun ?? 0, 0, 'exposure was increased under a limit this run could not verify')
  assert.ok(has(withheld.causes, 'data_missing'))
  assert.ok(!has(withheld.causes, 'thesis_refuted'), 'an absence about the account was filed against the thesis')

  /**
   * ⑤ **A risk-reducing exit is not withheld.** Those rungs sit above the
   * structural gate, so a cancellation still closes out and a fired invalidation
   * still reduces, whatever the sector total could not be formed from.
   */
  for (const [name, intent] of [
    ['catalyst-cancelled', 'close-out'],
    ['receivable-re-growth-fires-a-declared-invalidation', 'reduce-on-invalidation'],
    ['refinancing-deterioration', 'resize-to-risk-limit'],
    ['one-delay-with-new-evidence', 'hold-through-delay'],
  ]) {
    const answer = runVerdict(withSectorCap(name))
    assert.equal(answer.data.intent, intent, `${name} reached ${answer.data.intent} once a sector ceiling could not be checked — a limit that only constrains increases withheld a reduction`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Two ledgers that never become one.
// ─────────────────────────────────────────────────────────────────────────────

const scoreboard = read('fixtures/scoreboard.json')

for (const scenario of scoreboard.scenarios) {
  const result = scoreboards({ catalysts: scenario.catalysts, price: scenario.price, benchmark: scenario.benchmark })
  const where = `scoreboard.json → ${scenario.name}`
  check(`${where} scores the two sides apart`, () => {
    for (const [key, value] of Object.entries(scenario.expect.catalyst ?? {})) {
      assert.equal(result.data.catalystLedger[key], value, `${where}: catalystLedger.${key}`)
    }
    for (const [key, value] of Object.entries(scenario.expect.price ?? {})) {
      assert.equal(result.data.priceLedger[key], value, `${where}: priceLedger.${key}`)
    }
    for (const code of scenario.expect.diagnosticCodes ?? []) assert.ok(has(result.diagnostics, code), `${where}: expected ${code}`)
  })
}

check('the catalyst score is blind to the price and the price score is blind to the catalyst', () => {
  const rising = scoreboards({ catalysts: [{ id: 'x', state: 'failed', cancelled: false }], price: { unrealisedReturn: 0.4 } })
  const falling = scoreboards({ catalysts: [{ id: 'x', state: 'failed', cancelled: false }], price: { unrealisedReturn: -0.4 } })
  assert.deepEqual(rising.data.catalystLedger, falling.data.catalystLedger, 'the catalyst ledger moved when only the price did')
  assert.equal(rising.data.catalystLedger.successRate, 0, 'a failed catalyst under a 40% gain still scored above zero')
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. The reference case, and what asserting it is allowed to mean.
// ─────────────────────────────────────────────────────────────────────────────

const reference = read('fixtures/reference-case.json')

for (const variant of reference.variants) {
  const result = runVerdict(variant.input)
  const where = `reference-case.json → ${variant.name}`
  check(`${where} classifies as it should`, () => {
    assert.equal(result.data.classification.classification, variant.expect.classification, `${where}: classification`)
    /**
     * #258: «낮은 PER이 아니라는 이유만으로 제외하지 않는다». Each variant carries
     * a large multiple and none of them is excluded for it.
     */
    assert.equal(result.data.classification.excludedByValuationMultiple, false, `${where}: excluded on a valuation multiple`)
    assert.ok(result.data.classification.valuationMultiple > 20, `${where}: the fixture is supposed to carry a multiple that a low-PER screen would reject`)
    for (const key of ['qualifiesAsPosition', 'policyAnnounced', 'policyExecuting', 'policyInResults']) {
      if (variant.expect[key] !== undefined) assert.equal(result.data.classification[key], variant.expect[key], `${where}: ${key}`)
    }
    if (variant.expect.improvingChannels !== undefined) {
      assert.deepEqual(result.data.recovery.improvingChannels, variant.expect.improvingChannels, `${where}: improvingChannels`)
    }
    for (const code of variant.expect.diagnosticCodes ?? []) assert.ok(has(result.diagnostics, code), `${where}: expected ${code}`)
    assert.equal(result.data.intent, variant.expect.intent, `${where}: intent`)
    assert.equal(result.data.review.name, variant.expect.review, `${where}: review`)
  })
}

/**
 * ⛔ The claim the block above is **not** making, asserted so that nobody has to
 * take the comment's word for it: the classification does not carry the outcome.
 * Variants B and C are the same company, the same classification, and two
 * different answers — which is what stops «classifies as a turnaround» from
 * being read as «this package would have bought it».
 */
check('the reference case classification does not by itself produce a purchase', () => {
  const b = reference.variants.find((variant) => variant.name.startsWith('B-'))
  const c = reference.variants.find((variant) => variant.name.startsWith('C-'))
  assert.equal(b.expect.classification, c.expect.classification)
  assert.notEqual(b.expect.intent, c.expect.intent)
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. The absent-input audit. (regression, after untilled/aumos-catalogue#265)
//
// ── The defect class, and why it needs its own section ─────────────────────
//
// A review of the sibling `shareholder-rerating` package found the same mistake
// three times and it has one shape: **a declared input that is absent, unread or
// unadjudicable being treated as a pass.** Delete the account object from a
// passing fixture and the holdings default to `[]` — which is arithmetically an
// account with unlimited headroom — and the run still returns a full-sized
// purchase. Nothing is malformed. Nothing is missing on screen. The answer is
// wrong, and no per-case fixture can see it, because every per-case fixture
// passes every input.
//
// So the regressions below are **mutations of a fixture that passes**, applied
// in memory: take the one case that reaches the entry path, remove exactly one
// declared input, and assert the run refuses rather than proceeds. The fixture
// files are not edited — the positive cases above must keep passing for the same
// reasons they passed before.
//
// ⛔ The other half of every assertion here: none of these may report
// `thesis_refuted`. An input nobody read says nothing whatever about the thesis,
// and the failure mode this section guards against has a twin in which absence
// is over-read instead of under-read.
// ─────────────────────────────────────────────────────────────────────────────

const positive = cases.cases.find((item) => item.name === 'completed-positive-thesis-reaches-the-buy-path')
const heldDelay = cases.cases.find((item) => item.name === 'one-delay-with-new-evidence')

/** One mutation of a passing input, with the fixture left alone. */
function mutate(base, edit) {
  const copy = structuredClone(base.input)
  edit(copy)
  return runVerdict(copy)
}

const ABSENCE_REGRESSIONS = [
  {
    name: 'the book was not read',
    why: '#265 finding 1, exactly: positions and proposals defaulted to empty arrays, and an account nobody could read authorised a full position.',
    base: positive,
    edit: (input) => delete input.book,
    expect: { intent: 'wait-for-data', review: 'inputs-unread', causeCodes: ['data_missing'] },
  },
  {
    name: 'the account single-name limit was not read',
    why: '#265 finding 2: only an explicit failure refused, so an unadjudicable limit passed.',
    base: positive,
    edit: (input) => delete input.book.caps.accountSingleName,
    expect: { intent: 'wait-for-data', review: 'inputs-unread', causeCodes: ['data_missing'] },
  },
  {
    name: 'the mandate position cap was not read',
    why: 'It used to be filtered out of the cap list, leaving this package’s own ceiling as the only limit.',
    base: positive,
    edit: (input) => delete input.sizing.mandatePositionCap,
    expect: { intent: 'wait-for-data', review: 'inputs-unread', causeCodes: ['data_missing'] },
  },
  {
    name: 'the mandate was read and declares no position cap',
    why: 'The other side of the same rule, and the reason it is three states and not two: a declared absence is readable and may authorise, and it leaves its own record.',
    base: positive,
    edit: (input) => {
      input.sizing.mandatePositionCap = 'not-declared'
    },
    expect: { intent: 'enter-staged', review: 'staged-entry-armed', diagnosticCodes: ['mandate_position_cap_not_declared'] },
  },
  {
    name: 'the catalyst register was not read, on the entry path',
    base: positive,
    edit: (input) => delete input.register,
    expect: { intent: 'wait-for-data', review: 'inputs-unread', causeCodes: ['data_missing'] },
  },
  {
    name: 'the cash burn was not read',
    why: 'It defaulted to 0, which reads as a company that is not burning cash — infinite runway, check passed.',
    base: positive,
    edit: (input) => delete input.financials.monthlyCashBurn,
    expect: { intent: 'research-watch', review: 'survivability-fails', causeCodes: ['data_missing'] },
  },
  {
    name: 'the debt maturity schedule was not read',
    why: 'It defaulted to 0, which reads as a company with no debt falling due — coverage null, check skipped entirely.',
    base: positive,
    edit: (input) => delete input.financials.debtMaturingWithinYear,
    expect: { intent: 'research-watch', review: 'survivability-fails', causeCodes: ['data_missing'] },
  },
  {
    name: 'the price has explicitly not stabilised',
    why: '#265 finding 4’s shape: the input was declared, carried into the answer, and never read by the implementation.',
    base: positive,
    edit: (input) => {
      input.price.stabilised = false
    },
    expect: { intent: 'research-watch', review: 'stabilisation-not-confirmed' },
  },
  {
    name: 'stabilisation was not read at all',
    why: 'A secondary confirmation, so its absence is uncertainty and not a gate — #256 says supporting data absence is recorded as uncertainty. It may withhold; it may never qualify.',
    base: positive,
    edit: (input) => delete input.price.stabilised,
    expect: { intent: 'enter-staged', review: 'staged-entry-armed', diagnosticCodes: ['stabilisation_unread'] },
  },
  {
    name: 'the book already holds the whole target',
    why: 'The case with no defined behaviour: the increment is zero and there is nothing to do, rather than the full target bought again.',
    base: positive,
    edit: (input) => {
      input.book.positions = [{ symbol: 'A00007', strategy: 'catalyst-turnaround', weight: 0.12 }]
    },
    expect: { intent: 'hold', review: 'already-at-target' },
  },
  {
    name: 'the register was not read, on a held position mid-delay',
    why: 'The one the delay counter exists for: without the register a fourth slip is indistinguishable from a first, and the old code would have held through it as though it were the first.',
    base: heldDelay,
    edit: (input) => delete input.register,
    expect: { intent: 'hold', review: 'register-unread', causeCodes: ['data_missing'] },
  },
  {
    name: 'the balance sheet was not read, on a held position',
    why: 'The held twin of the entry check: unchanged and named, not resized — resizing on an absence would score it as a breach.',
    base: heldDelay,
    edit: (input) => delete input.financials.liquidAssets,
    expect: { intent: 'hold', review: 'survivability-unread', causeCodes: ['data_missing'] },
  },
]

for (const regression of ABSENCE_REGRESSIONS) {
  const result = mutate(regression.base, regression.edit)
  const where = `absent-input → ${regression.name}`
  check(where, () => {
    assert.equal(result.data.intent, regression.expect.intent, `${where}: expected ${regression.expect.intent}, got ${result.data.intent}`)
    assert.equal(result.data.review.name, regression.expect.review, `${where}: review`)
    for (const code of regression.expect.causeCodes ?? []) {
      assert.ok(has(result.causes, code), `${where}: expected cause ${code}, got ${codes(result.causes).join(', ') || '(none)'}`)
    }
    for (const code of regression.expect.diagnosticCodes ?? []) {
      assert.ok(has(result.diagnostics, code), `${where}: expected diagnostic ${code}, got ${codes(result.diagnostics).join(', ') || '(none)'}`)
    }
    // ⛔ An unread input is never a refutation. Every mutation, every time.
    assert.ok(!has(result.causes, 'thesis_refuted'), `${where}: an unread input was reported as a refutation`)
  })
}

/**
 * The invariant the twelve cases above are twelve instances of, asserted once as
 * a rule: **no mutation that removes a declared input may increase exposure.**
 * A future rung that forgets the gate fails here rather than in production.
 */
check('no run missing a declared input increases exposure', () => {
  for (const regression of ABSENCE_REGRESSIONS) {
    const result = mutate(regression.base, regression.edit)
    if (regression.expect.intent === 'enter-staged') continue
    assert.equal(result.data.incrementThisRun, 0, `${regression.name}: added ${result.data.incrementThisRun} of the book on an input nobody read`)
    assert.equal(result.data.increasesExposure, false, `${regression.name}: increasesExposure`)
  }
})

/**
 * ── Two weights, two meanings (#265's fourth finding) ─────────────────────
 *
 * The same field meant «the whole position should be this» and «buy this much
 * more» depending on which caller read it, and either reading by the host is
 * wrong for the other case. Here they are separate fields, and the ones that do
 * not buy anything say zero rather than leaving the previous meaning standing.
 */
check('the cumulative target and the increment are two different numbers', () => {
  const entry = runVerdict(positive.input)
  assert.equal(entry.data.intent, 'enter-staged')
  assert.equal(entry.data.cumulativeTargetWeight, 0.12, 'the cumulative target is what the sizing produced')
  assert.equal(entry.data.ownHeldWeight, 0, 'the book holds none of it')
  assert.equal(entry.data.incrementThisRun, 0.12, 'with no staged plan the increment is the whole gap')
  assert.equal(entry.data.weightMeanings.cumulativeTargetWeight, 'this-strategys-share-of-the-position')
  assert.equal(entry.data.weightMeanings.incrementThisRun, 'weight-added-this-run')

  // Every intent that is not one of the two purchases reports a zero increment,
  // including the trims and the exits — a reduction is a cumulative target the
  // host reduces to, never a negative increment.
  for (const item of cases.cases) {
    const result = runVerdict(item.input)
    if (result.data.increasesExposure) continue
    assert.equal(result.data.incrementThisRun, 0, `${item.name} carries a non-zero increment on ${result.data.intent}`)
  }
})

/**
 * ── #817: the third weight, and it is the only one that may cross the wire ──
 *
 * `#813` and `#814` were the **reading** direction. This is the **writing** one:
 * `cumulativeTargetWeight` is what `headroomForStrategy` leaves this desk — *«the
 * smaller cap, less what every other strategy has»* — and the host's
 * `targetWeight` is the **whole position**, executed by `rebalanceShadowBook`
 * without attribution ever being read (`untilled/aumos#815`).
 *
 * ⛔ **Over an unattributed holding the difference is a sale.**
 * `untilled/aumos#817` drove the real host over a 6% holding assigned to nobody:
 * this package reached `enter-staged` with a cumulative target of `0.02`, and
 * handing that over produced `sell:40`. `#786` refuses a judgement on **another
 * manager's** position; an unattributed one has no manager for it to be.
 *
 * ⚠️ **Holdings are added and open proposals are not.** A pending total is
 * exposure for a ceiling and is not a position for an order.
 */
check('#817 — the weight handed to the host carries the part of the position this desk does not run', () => {
  const bookWith = (positions, proposals = []) => ({ positions, proposals, caps: { accountSingleName: 0.2 } })
  const runWith = (book) => runVerdict({ ...structuredClone(positive.input), book }).data

  const fresh = runWith(bookWith([], []))
  assert.equal(fresh.intent, 'enter-staged')
  assert.equal(fresh.otherHeldWeight, 0)
  assert.equal(fresh.hostTargetWeight, fresh.cumulativeTargetWeight, 'on a name nobody holds the two totals coincide — which is why an unheld-name measurement saw none of this')

  /** The issue's book: 6% assigned to nobody, and 12% pending under another manager. */
  const unattributed = runWith(bookWith(
    [{ symbol: 'A00007', weight: 0.06, strategy: 'unattributed' }],
    [{ symbol: 'A00007', weight: undefined, targetWeight: 0.12, strategy: 'inst_shareholder_rerating' }],
  ))
  assert.equal(unattributed.intent, 'enter-staged', 'the run reaching the wire is a purchase')
  assert.equal(unattributed.ownHeldWeight, 0, 'a holding assigned to nobody was read as this desk\'s')
  assert.equal(unattributed.otherHeldWeight, 0.06, 'a holding assigned to nobody was not carried as somebody else\'s')
  assert.equal(unattributed.concentration.rows[0].total, 0.12, 'the ceiling axis still folds the pending total in')
  assert.equal(unattributed.hostTargetWeight, round(0.06 + unattributed.cumulativeTargetWeight), 'the weight handed to the host sold a holding nobody asked to sell')
  assert.ok(unattributed.hostTargetWeight > 0.06, 'an enter-staged left this package as a reduction')
  assert.notEqual(unattributed.hostTargetWeight, round(0.12 + unattributed.cumulativeTargetWeight), 'a pending proposal was added to the order — it is exposure for a ceiling and not a position')

  /** Another manager's holding is the same arithmetic, and it has to be. */
  const theirs = runWith(bookWith([{ symbol: 'A00007', weight: 0.06, strategy: 'inst_shareholder_rerating' }]))
  assert.equal(theirs.otherHeldWeight, 0.06)
  assert.equal(theirs.hostTargetWeight, round(0.06 + theirs.cumulativeTargetWeight))

  /**
   * ⛔ **A position this desk runs is still reducible, and a close-out still
   * closes.** #817 must not turn every reduction into a no-op — that is
   * `untilled/aumos#782`'s «safely do nothing» coming back.
   */
  const mine = runVerdict({
    ...structuredClone(cases.cases.find((item) => item.name === 'catalyst-cancelled').input),
  }).data
  assert.equal(mine.intent, 'close-out')
  assert.equal(mine.otherHeldWeight, 0, 'the fixture book is this desk\'s own position')
  assert.equal(mine.hostTargetWeight, 0, 'a close-out on a wholly-own position is the host\'s exit')

  /** …and the same close-out beside somebody else's holding stops at their weight. */
  const shared = runVerdict({
    ...structuredClone(cases.cases.find((item) => item.name === 'catalyst-cancelled').input),
    book: {
      positions: [
        { symbol: 'A00004', weight: 0.05, strategy: 'catalyst-turnaround' },
        { symbol: 'A00004', weight: 0.04, strategy: 'inst_fundamental_mean_reversion' },
      ],
      proposals: [],
      caps: { accountSingleName: 0.2 },
    },
  }).data
  assert.equal(shared.intent, 'close-out')
  assert.equal(shared.otherHeldWeight, 0.04)
  assert.equal(shared.hostTargetWeight, 0.04, 'an exit liquidated another manager\'s holding of the same name')

  /** An unread book has no target at all: a `0` here would be an order. */
  const unread = runVerdict({ ...structuredClone(positive.input), book: { proposals: [], caps: { accountSingleName: 0.2 } } }).data
  assert.equal(unread.otherHeldWeight, null)
  assert.equal(unread.hostTargetWeight, null, 'an account nobody read produced a weight')
})

/**
 * The same three-state rule at the two module boundaries, so that a caller other
 * than `runVerdict` cannot reach the permissive reading either.
 */
check('the modules themselves distinguish read-and-empty from unread', () => {
  const ledgerUnread = catalystLedger({ rows: [], transitions: [], asOf: cases.asOf })
  assert.equal(ledgerUnread.data.summary.registerRead, false)
  assert.equal(ledgerUnread.data.summary.delayExhausted, null, 'delayExhausted was false on an unread register, which claims there is room left')
  assert.ok(has(ledgerUnread.causes, 'data_missing'))

  const ledgerEmpty = catalystLedger({ previous: null, rows: [], transitions: [], asOf: cases.asOf })
  assert.equal(ledgerEmpty.data.summary.registerRead, true)
  assert.ok(!has(ledgerEmpty.causes, 'data_missing'), 'an explicitly empty register was reported as unread')

  const planUnread = stagedPlan({ plan: staging.plan, price: 10000, asOf: staging.runs[0].asOf })
  assert.equal(planUnread.data.addedThisRun, 0, 'a stage fired on an unknown fill history, which is the double-add')
  assert.ok(has(planUnread.causes, 'data_missing'))

  const bookUnread = accountConcentration({ caps: { accountSingleName: 0.2 }, strategy: 'catalyst-turnaround' })
  assert.equal(bookUnread.data.readable, false)
  assert.ok(has(bookUnread.causes, 'data_missing'))
  assert.equal(bookUnread.data.unusedHeadroom, null, 'an unread book reported headroom')

  const capUnread = accountConcentration({ positions: [], proposals: [], caps: {}, strategy: 'catalyst-turnaround' })
  assert.equal(capUnread.data.readable, false, 'an unread account cap fell back to this package’s own ceiling')
  assert.ok(has(capUnread.causes, 'data_missing'))
})

// ─────────────────────────────────────────────────────────────────────────────
// 7b. #821 — the reduction direction, and the field that made it quiet.
//
// `#817` put the addition on the **buying** side and `aumos-catalogue#278` put
// it on the selling side of the other two packages. It read `close-out` here,
// found it safe, and left this package alone — but `close-out` is safe **by
// accident**: its own share is `0`, so `otherHeld + 0` happens to equal what the
// account holds. The three reduction intents whose share is not zero handed the
// host `otherHeld + (the weight a purchase would target)`, which over a 6%
// holding assigned to nobody is `buy:16`, `buy:39` and `buy:60`.
//
// ⚠️ **And the answer said the opposite in the same object.**
// `increasesExposure` was `intent === 'enter-staged' || 'add-next-stage'` — the
// intent restated, never the weight measured — so it answered `false` beside a
// `hostTargetWeight` 1.7pp above the holding. That is why 111 checks were green
// over a defect that doubles a position.
// ─────────────────────────────────────────────────────────────────────────────

const CAPS = { accountSingleName: 0.2 }
const bookOf = (symbol, assignee) => ({
  positions: assignee === 'none'
    ? [{ symbol, weight: 0.06 }]
    : [{ symbol, weight: 0.06, ...(assignee === 'unassigned-row' ? {} : { strategy: assignee }) }],
  proposals: [],
  caps: CAPS,
})

/** The same run, re-booked: 6% of the name held by this desk, by nobody, or by another manager. */
const ASSIGNEES = [
  { name: 'mine', strategy: 'catalyst-turnaround' },
  { name: 'unattributed', strategy: 'none' },
  { name: 'theirs', strategy: 'inst_shareholder_rerating' },
]

const REDUCTIONS = [
  { case: 'catalyst-realised-and-priced-in', intent: 'trim-into-realisation' },
  { case: 'receivable-re-growth-fires-a-declared-invalidation', intent: 'reduce-on-invalidation' },
  { case: 'refinancing-deterioration', intent: 'resize-to-risk-limit' },
  { case: 'catalyst-cancelled', intent: 'close-out' },
]

const rebooked = (name, assignee) => {
  const input = structuredClone(cases.cases.find((item) => item.name === name).input)
  input.book = bookOf(input.symbol, assignee)
  return runVerdict(input)
}

/**
 * ⑴ The measurement the issue made, one row at a time. **The number that leaves
 * may never buy what this desk did not ask to buy**, and over a position none of
 * which is this desk's the reduction is withdrawn rather than repriced.
 */
check('#821 — a reduction over a position this desk does not run buys nothing and says so', () => {
  for (const reduction of REDUCTIONS) {
    for (const assignee of ASSIGNEES) {
      const result = rebooked(reduction.case, assignee.strategy)
      const data = result.data
      const where = `#821 → ${reduction.intent} → ${assignee.name}`

      assert.equal(data.positionWeight, 0.06, `${where}: the account holds 6% of the name whoever runs it`)
      assert.ok(
        data.hostTargetWeight <= data.positionWeight + 1e-9,
        `${where}: a reduction handed the host ${data.hostTargetWeight} against a holding of ${data.positionWeight} — the intent says sell and the order buys`,
      )
      assert.notEqual(data.exposureDirection, 'increase', `${where}: exposureDirection`)
      assert.equal(data.increasesExposure, false, `${where}: increasesExposure`)

      if (assignee.name === 'mine') {
        // ⛔ #782: the desk that runs the position still reduces it. Nothing here may turn that into a no-op.
        assert.equal(data.intent, reduction.intent, `${where}: this desk's own reduction was withdrawn`)
        assert.equal(data.ownHeldWeight, 0.06)
        assert.equal(data.otherHeldWeight, 0)
        assert.equal(data.exposureDirection, reduction.intent === 'resize-to-risk-limit' ? 'unchanged' : 'reduce', `${where}: exposureDirection`)
        assert.ok(!has(result.diagnostics, 'held_position_is_not_this_desks'), `${where}: this desk's own position was reported as somebody else's`)
        continue
      }

      assert.equal(data.ownHeldWeight, 0, `${where}: ownHeldWeight`)
      assert.equal(data.otherHeldWeight, 0.06, `${where}: otherHeldWeight`)
      assert.equal(data.intent, 'reduction-not-this-desks', `${where}: the reduction stood over a position none of which is this desk's`)
      assert.equal(data.hostTargetWeight, 0.06, `${where}: the weight that leaves moves a position this desk does not run`)
      assert.equal(data.exposureDirection, 'unchanged', `${where}: exposureDirection`)
      assert.ok(has(result.diagnostics, 'held_position_is_not_this_desks'), `${where}: nothing said why the reduction did not go out`)

      /**
       * ⛔ **The withdrawal is not an absence** (`aumos-catalogue#278`,
       * `untilled/aumos#782`). The book was read and it said something
       * definite; calling it `data_missing` would make every holding bought by
       * hand in a broker app un-reviewable.
       */
      assert.ok(!has(result.causes, 'data_missing'), `${where}: a position that was read was reported as unread`)
      const withdrawn = result.diagnostics.find((entry) => entry.code === 'held_position_is_not_this_desks')
      assert.equal(withdrawn.severity, 'note', `${where}: the withdrawal was reported as a defect in an input`)
      assert.equal(withdrawn.details.intentBeforeWithdrawal, reduction.intent, `${where}: the answer does not say which judgement was withdrawn`)

      /** ⚠️ The review is the judgement, and the judgement still stands. */
      const own = rebooked(reduction.case, 'catalyst-turnaround').data
      assert.equal(data.review.name, own.review.name, `${where}: the review was withdrawn along with the order`)
      assert.equal(data.review.atEpochMs, own.review.atEpochMs, `${where}: the review is no longer armed`)
      assert.equal(data.review.benchmarkComparisonRequired, own.review.benchmarkComparisonRequired, `${where}: the benchmark comparison was dropped`)
    }
  }
})

/**
 * ⑵ **The rule the four rows above are four instances of.** Every answer this
 * package can produce, over every attribution, is asked one question: does the
 * weight that leaves do what the word says?
 *
 * ⛔ This is the check that would have caught the defect. It reads only the two
 * published numbers, so a future rung, a future intent or a future edit to the
 * arithmetic fails here rather than at an exchange.
 */
check('#821 — the word and the number agree, on every case and every attribution', () => {
  const books = [
    ['mine', (symbol) => bookOf(symbol, 'catalyst-turnaround')],
    ['unattributed', (symbol) => bookOf(symbol, 'none')],
    ['theirs', (symbol) => bookOf(symbol, 'inst_shareholder_rerating')],
    ['empty', () => ({ positions: [], proposals: [], caps: CAPS })],
    ['unread', () => ({ proposals: [], caps: CAPS })],
  ]
  /**
   * ⚠️ **And the same sweep with a staged plan on top (`untilled/aumos#825`).**
   * Without it no row here ever reaches `add-next-stage` — the rung needs a due
   * stage — so the whole staged-add side of the ladder sat outside the check
   * that exists to catch exactly this, and #825's `sell:30` walked past it.
   * `over-target` is the book that makes the stage due into a holding already
   * above what the plan builds toward.
   */
  for (const item of cases.cases) {
    for (const [label, make] of [...books, ['over-target', (symbol) => ({ positions: [{ symbol, strategy: 'catalyst-turnaround', weight: 0.15 }], proposals: [], caps: CAPS })]]) {
      for (const planned of [false, true]) {
        const input = structuredClone(item.input)
        input.book = make(input.symbol)
        if (planned) {
          input.held = true
          input.plan = structuredClone(staging.plan)
        }
        const data = runVerdict(input).data
        const where = `#821 → ${item.name} → ${label}${planned ? ' + plan' : ''}`

        const role = INTENT_WEIGHT_ROLES[data.intent]
        assert.ok(role !== undefined, `${where}: ${data.intent} has no weight role`)

        /** ⚠️ `increasesExposure` is the two numbers compared, and this recomputes it from them. */
        const measured = typeof data.hostTargetWeight === 'number' && typeof data.positionWeight === 'number'
          ? (data.hostTargetWeight > data.positionWeight + 1e-9 ? 'increase' : data.hostTargetWeight < data.positionWeight - 1e-9 ? 'reduce' : 'unchanged')
          : null
        assert.equal(data.exposureDirection, measured, `${where}: exposureDirection was restated rather than measured`)
        assert.equal(data.increasesExposure, measured === 'increase', `${where}: increasesExposure disagrees with the weight that leaves`)

        if (data.hostTargetWeight === null) continue
        if (role === 'reduce' || role === 'close') {
          assert.ok(data.hostTargetWeight <= data.positionWeight + 1e-9, `${where}: ${data.intent} handed the host ${data.hostTargetWeight} over a holding of ${data.positionWeight}`)
          assert.ok(data.hostTargetWeight >= data.otherHeldWeight - 1e-9, `${where}: ${data.intent} reduced past this desk's own share and into somebody else's`)
        }
        if (role === 'standstill') {
          assert.equal(data.hostTargetWeight, data.positionWeight, `${where}: ${data.intent} changes nothing and asked the host for ${data.hostTargetWeight} against a holding of ${data.positionWeight}`)
        }
        if (role === 'increase') {
          /**
           * ⛔ **The assertion the `reduce` branch had and this one did not
           * (`untilled/aumos#825`).** Three lines up a reduction may not raise the
           * position; here a *purchase* may not lower it — and for eight months
           * nothing said so, because this branch checked the **formula** and never
           * the **direction**. A due stage over a holding above the plan's
           * cumulative target handed the host `0.12` against `0.15` and sold 30
           * shares on a run whose own word is «add».
           */
          assert.ok(
            data.hostTargetWeight >= data.positionWeight - 1e-9,
            `${where}: ${data.intent} handed the host ${data.hostTargetWeight} over a holding of ${data.positionWeight} — a purchase that reduces the position`,
          )
          if (typeof data.cumulativeTargetWeight === 'number' && typeof data.ownHeldWeight === 'number') {
            assert.equal(
              data.hostTargetWeight,
              round(data.otherHeldWeight + Math.max(data.cumulativeTargetWeight, data.ownHeldWeight)),
              `${where}: #817's addition no longer holds on the buying side, under #825's floor`,
            )
          }
        }

        /**
         * ⚠️ **And the sentence beside the number is measured too.** `#821`
         * renamed the restated `increasesExposure` to `addsToThisDesksShare` and
         * left it restated: `increase && increment > 0`. Over a holding at or
         * above the plan's cumulative target that answered `true` while this
         * desk's share did not move at all.
         */
        if (data.addsToThisDesksShare === true && typeof data.ownHeldWeight === 'number' && typeof data.otherHeldWeight === 'number') {
          assert.ok(
            data.hostTargetWeight - data.otherHeldWeight > data.ownHeldWeight + 1e-9,
            `${where}: addsToThisDesksShare was restated rather than measured — this desk's share goes from ${data.ownHeldWeight} to ${round(data.hostTargetWeight - data.otherHeldWeight)}`,
          )
        }
      }
    }
  }
})

/**
 * ⑶ **The input `#821` measured and left alone (`untilled/aumos#825`).** A due
 * stage on a plan whose cumulative target sits **below** what this desk already
 * holds. `#821` asserted `exposureDirection: 'reduce'` here and wrote *"the
 * answer says buy and the host reduces"* into its own message — it read the
 * defect, named it, and pinned it green, because measuring a number is not the
 * same as refusing it.
 *
 * ⛔ There is nothing to add and the run now says that in both languages: the
 * word is `hold` on the review this package already had for it one branch over,
 * and the weight is the holding.
 */
check('#825 — a due stage whose cumulative target is already held adds nothing and says so', () => {
  const at = (ownWeight) => {
    const input = structuredClone(positive.input)
    input.held = true
    input.plan = structuredClone(staging.plan)
    input.book = { positions: [{ symbol: input.symbol, strategy: 'catalyst-turnaround', weight: ownWeight }], proposals: [], caps: CAPS }
    return runVerdict(input).data
  }

  /** The row the issue measured: 0.15 held against a cumulative 0.12, and `sell:30` left for the exchange. */
  const over = at(0.15)
  assert.equal(over.intent, 'hold', 'a stage fired over a holding already above its own cumulative target')
  assert.equal(over.review.name, 'already-at-target', 'the review does not say why the stage added nothing')
  assert.equal(over.incrementThisRun, 0, 'a stage that adds nothing reported an increment')
  assert.equal(over.cumulativeTargetWeight, 0.12, 'the plan’s own target is still reported')
  assert.equal(over.positionWeight, 0.15)
  assert.equal(over.hostTargetWeight, 0.15, 'the weight that leaves sold this desk’s own position')
  assert.equal(over.exposureDirection, 'unchanged')
  assert.equal(over.increasesExposure, false)
  assert.equal(over.addsToThisDesksShare, false, 'this run adds nothing to this desk’s share and said it did')

  /** The boundary: exactly at the target is «already at it», the same as the entry side reads it. */
  const equal = at(0.12)
  assert.equal(equal.intent, 'hold')
  assert.equal(equal.hostTargetWeight, 0.12)
  assert.equal(equal.exposureDirection, 'unchanged')
  assert.equal(equal.addsToThisDesksShare, false)

  /** ⛔ And the stage that has somewhere to go still goes there — `buy:60`, unchanged. */
  const under = at(0.06)
  assert.equal(under.intent, 'add-next-stage', 'a real stage stopped firing')
  assert.equal(under.review.name, 'stage-filled')
  assert.equal(under.incrementThisRun, 0.04)
  assert.equal(under.hostTargetWeight, 0.12, 'the stage no longer reaches the plan’s cumulative target')
  assert.equal(under.exposureDirection, 'increase')
  assert.equal(under.addsToThisDesksShare, true)
})

/**
 * ⑶′ **The row where the two clamps meet, and the statement that the floor has
 * no producer.** A position 10% of which is this desk's and 15% somebody
 * else's, under a 20% cap: the fold below takes the plan's target down to the
 * 5% that is left, which is *under* what this desk holds. Folding a target down
 * is the same arithmetic that turns a purchase into a sale, and this is the row
 * where it would — `sell:5pp` on a run whose word is «add».
 *
 * ⚠️ **What actually answers here is the rung, not the floor.** Every path to
 * an `increase` role now passes a rung that reads «already at the target» — the
 * staged-add rung above, and the entry side's since #265 — so
 * `max(cumulative, ownHeldWeight)` in `verdict.mjs` is a **backstop with no
 * producer in this build**, and the sweep below is the assertion of exactly
 * that. ⛔ It stays because the role table is what decides the weight and #821
 * is the record of what an unclamped role does while 111 checks stay green; a
 * future rung reaching `increase` past those two guards lands on the floor
 * rather than on an exchange. **Green here is the evidence of the absence.**
 */
check('#825 — a purchase never reaches a target below what this desk holds, and never lowers the position', () => {
  const input = structuredClone(positive.input)
  input.held = true
  input.plan = structuredClone(staging.plan)
  input.book = {
    positions: [
      { symbol: input.symbol, strategy: 'catalyst-turnaround', weight: 0.1 },
      { symbol: input.symbol, strategy: 'inst_shareholder_rerating', weight: 0.15 },
    ],
    proposals: [],
    caps: CAPS,
  }
  const data = runVerdict(input).data

  assert.equal(data.ownHeldWeight, 0.1)
  assert.equal(data.otherHeldWeight, 0.15)
  assert.equal(data.positionWeight, 0.25)
  assert.ok(data.cumulativeTargetWeight < data.ownHeldWeight, 'the room left for this desk is no longer below what it holds, and this row no longer stands where the two clamps meet')
  /**
   * ⚠️ **The word here became `blocked-by-account-limit` in
   * `untilled/aumos#828`, and not one number moved.** #825 answered this state
   * with `already-at-target`, whose reason restated the folded target against
   * itself; the room here is taken by another desk's **holding** and this
   * package has carried the true word for that since #265. Both are
   * `standstill`, so what #825 established — a stage that cannot be added is
   * not a sale — is asserted by the two weights below exactly as it was.
   */
  assert.equal(data.intent, 'blocked-by-account-limit', 'a stage fired into a target below what this desk already holds')
  assert.equal(INTENT_WEIGHT_ROLES[data.intent], 'standstill', 'the rung that answers this state stopped being a standstill')
  assert.equal(data.hostTargetWeight, 0.25, 'the weight that leaves sold 5pp of a position on a run whose word is «add»')
  assert.equal(data.exposureDirection, 'unchanged')
  assert.equal(data.addsToThisDesksShare, false)

  /**
   * ⛔ The absence itself, swept: over every case, every attribution and the
   * staged plan on top, no answer carrying an `increase` role holds more than
   * it targets. The day one does, this line goes red beside the floor that
   * caught it — which is the only order those two events may happen in.
   */
  for (const item of cases.cases) {
    for (const [label, make] of [
      ['mine', (symbol) => bookOf(symbol, 'catalyst-turnaround')],
      ['unattributed', (symbol) => bookOf(symbol, 'none')],
      ['theirs', (symbol) => bookOf(symbol, 'inst_shareholder_rerating')],
      ['over-target', (symbol) => ({ positions: [{ symbol, strategy: 'catalyst-turnaround', weight: 0.15 }], proposals: [], caps: CAPS })],
    ]) {
      for (const planned of [false, true]) {
        const probe = structuredClone(item.input)
        probe.book = make(probe.symbol)
        if (planned) {
          probe.held = true
          probe.plan = structuredClone(staging.plan)
        }
        const answer = runVerdict(probe).data
        if (INTENT_WEIGHT_ROLES[answer.intent] !== 'increase') continue
        if (typeof answer.cumulativeTargetWeight !== 'number' || typeof answer.ownHeldWeight !== 'number') continue
        assert.ok(
          answer.cumulativeTargetWeight > answer.ownHeldWeight - 1e-9,
          `#825 → ${item.name} → ${label}${planned ? ' + plan' : ''}: ${answer.intent} reached a target of ${answer.cumulativeTargetWeight} over a held ${answer.ownHeldWeight}, and only verdict.mjs's floor stood between that and a sale`,
        )
      }
    }
  }
})

/**
 * ⑶″ **The stage that quietly disappeared (`untilled/aumos#825`).** A plan's
 * cumulative target is frozen at the run that wrote it; the room left for this
 * desk is not. `enter-staged` is sized through `accountHeadroom` every run and
 * lands exactly on the cap — `add-next-stage` read the same cap into its own
 * answer and ignored it, so over 15% of the name held elsewhere it asked for a
 * position of 27% under a 20% limit and the host downgraded the **whole
 * judgement** to WAIT.
 *
 * ⚠️ Weaker than the row above — no money moves wrongly, a stage merely stops
 * arriving and nothing says why. So the fold is reported rather than silent.
 */
check('#825 — a due stage is folded into the room this name still has, and says when it was', () => {
  const staged = (otherWeight) => {
    const input = structuredClone(positive.input)
    input.held = true
    input.plan = structuredClone(staging.plan)
    input.book = { positions: [{ symbol: input.symbol, strategy: 'inst_shareholder_rerating', weight: otherWeight }], proposals: [], caps: CAPS }
    return runVerdict(input)
  }

  const tight = staged(0.15)
  assert.equal(tight.data.intent, 'add-next-stage', 'the stage stopped firing rather than fitting')
  assert.equal(tight.data.cumulativeTargetWeight, 0.05, 'the plan’s frozen target was handed over unfolded')
  assert.equal(tight.data.hostTargetWeight, 0.2, `a stage asked for ${tight.data.hostTargetWeight} of a name the account caps at 0.2`)
  assert.ok(tight.data.hostTargetWeight <= tight.data.concentration.accountCap + 1e-9, 'the answer read the cap and asked past it')
  assert.ok(
    has(tight.diagnostics, 'stage_target_folded_into_headroom'),
    `the fold happened without saying so: ${codes(tight.diagnostics).join(', ') || '(none)'}`,
  )

  /** ⛔ And where the room is there, the plan's own number is what leaves — the fold is a ceiling and nothing else. */
  const roomy = staged(0.06)
  assert.equal(roomy.data.intent, 'add-next-stage')
  assert.equal(roomy.data.cumulativeTargetWeight, 0.12, 'a plan with room to run was folded anyway')
  assert.equal(roomy.data.hostTargetWeight, 0.18)
  assert.ok(!has(roomy.diagnostics, 'stage_target_folded_into_headroom'), 'a fold that did not bind was reported')
})

// ─────────────────────────────────────────────────────────────────────────────
// `untilled/aumos#828` — a pending total is a ceiling and is not a position.
//
// ⚠️ **`#825` opened this one itself.** Its «⬜ 함께 고친 것» folded the plan's
// cumulative target into `headroomForStrategy`, and that headroom subtracts
// `otherStrategies` — the `max` of what other desks **hold** and what their open
// proposals **ask for** (`#813`). Right for a ceiling: a limit has to hold in
// every state the account passes through, so somebody's unfilled buy counts
// before it fills. Wrong for the number that goes **back** to the host, and
// `sizing.mjs` says so three hundred lines above the fold: *the weight this desk
// hands back is executed against the position, and an unfilled proposal is not a
// position.*
//
// Measured through the host (`shareholder-rerating` sealing a BUY nobody
// approved — `funding: unfunded`, no reservation, no order), over a 6% position
// wholly this desk's, on a plan building toward 12%:
//
//   pending 0.08 → `buy:60`   pending 0.15 → `buy:50`   pending 0.20 → no order
//
// ⚠️ **And the arithmetic was incoherent, not merely generous.** The fold
// subtracts `otherStrategies` from the cap and `hostTargetWeight` adds back only
// `otherHeldWeight`, so the two ends of one sum read two different books.
// ─────────────────────────────────────────────────────────────────────────────

/** The same staged run, re-booked: 6% held by this desk, and somebody else's unapproved proposal on top. */
const stagedWithPending = (pendingTotal, ownWeight = 0.06) => {
  const input = structuredClone(positive.input)
  input.held = true
  input.plan = structuredClone(staging.plan)
  input.book = {
    positions: [{ symbol: input.symbol, strategy: 'catalyst-turnaround', weight: ownWeight }],
    proposals: pendingTotal === null ? [] : [{ symbol: input.symbol, strategy: 'inst_shareholder_rerating', targetWeight: pendingTotal }],
    caps: CAPS,
  }
  return runVerdict(input)
}

/**
 * ⑴ **The row the issue measured, all four of it.** Nobody else holds a share of
 * this name; another desk has merely written a total down. The stage is the same
 * stage in every row and the weight that leaves is the same weight.
 */
check('#828 — a due stage is measured against holdings, and another desk’s unfilled proposal moves nothing', () => {
  const baseline = stagedWithPending(null).data
  assert.equal(baseline.intent, 'add-next-stage', 'the fixture no longer reaches the staged-add rung')
  assert.equal(baseline.cumulativeTargetWeight, 0.12)
  assert.equal(baseline.hostTargetWeight, 0.12)

  for (const pending of [0.08, 0.15, 0.2, 0.25]) {
    const answer = stagedWithPending(pending).data
    const where = `#828 → pending ${pending}`
    assert.equal(answer.intent, 'add-next-stage', `${where}: a proposal nobody approved withheld this desk's stage`)
    assert.equal(answer.review.name, 'stage-filled', `${where}: the review changed on a book whose holdings did not`)
    assert.equal(answer.incrementThisRun, 0.04, `${where}: the stage that came due`)
    assert.equal(
      answer.cumulativeTargetWeight,
      0.12,
      `${where}: the plan's target was folded into a ceiling that counts an unfilled proposal as a position`,
    )
    assert.equal(
      answer.hostTargetWeight,
      0.12,
      `${where}: ${answer.hostTargetWeight} left for the exchange against the ${baseline.hostTargetWeight} the same holdings produce with no proposal on the name`,
    )
    assert.equal(answer.exposureDirection, 'increase', `${where}: a stage that adds became something else`)
    assert.equal(answer.addsToThisDesksShare, true, `${where}`)
  }
})

/**
 * ⑵ **The divergence is said out loud.** `#826` is the record of why: an answer
 * whose number moved because of a proposal on the other side of the fund, with
 * an empty `diagnostics` beside it, is the fifth quiet answer in this series.
 * So the two folds are reported whenever they disagree, and the total that
 * *would* have gone to the exchange is carried with it — an observation is not
 * one unless a reader can measure what it withheld.
 */
check('#828 — where the two folds disagree the answer names both, and the order that was not sent', () => {
  const quiet = stagedWithPending(0.08)
  assert.ok(
    !has(quiet.diagnostics, 'stage_target_ignores_others_pending'),
    'a proposal that does not narrow anything was reported as if it had',
  )

  for (const [pending, wouldHaveBeen] of [[0.15, 0.11], [0.2, 0.06]]) {
    const answer = stagedWithPending(pending)
    const where = `#828 → pending ${pending}`
    assert.ok(
      has(answer.diagnostics, 'stage_target_ignores_others_pending'),
      `${where}: the folds disagree and nothing said so: ${codes(answer.diagnostics).join(', ') || '(none)'}`,
    )
    const row = answer.diagnostics.find((entry) => entry.code === 'stage_target_ignores_others_pending')
    assert.equal(row.severity, 'note', `${where}: an observation is not a refusal`)
    assert.equal(
      row.details.hostTargetWeightIfPendingFolded,
      wouldHaveBeen,
      `${where}: the withheld order is not measurable from the observation that withheld it`,
    )
    assert.equal(row.details.hostTargetWeight, 0.12, `${where}`)
  }
})

/**
 * ⑶ **The word, where the fold does bind.** A holdings fold that leaves this
 * desk no room above what it already holds is the account limit taken by other
 * desks' **positions**, and this package has carried the true word for that
 * since #265 — `blocked-by-account-limit` / `account-limit-taken`. `#825`'s new
 * rung stood in front of it and answered `already-at-target` instead, whose
 * reason read *«already holds 0.06 … against a cumulative target of 0.06»*: a
 * tautology built out of the folded number, hiding the reason underneath it.
 *
 * ⛔ **The weights do not move**, and that is the point — this is the word being
 * wrong beside numbers that were right.
 */
check('#828 — a stage the account limit stops says the account limit stopped it', () => {
  const input = structuredClone(positive.input)
  input.held = true
  input.plan = structuredClone(staging.plan)
  input.book = {
    positions: [
      { symbol: input.symbol, strategy: 'catalyst-turnaround', weight: 0.1 },
      { symbol: input.symbol, strategy: 'inst_shareholder_rerating', weight: 0.15 },
    ],
    proposals: [],
    caps: CAPS,
  }
  const answer = runVerdict(input)
  const data = answer.data

  assert.equal(data.intent, 'blocked-by-account-limit', 'a stage the account limit stopped answered in the vocabulary of a plan that was already met')
  assert.equal(data.review.name, 'account-limit-taken')
  assert.equal(INTENT_WEIGHT_ROLES[data.intent], 'standstill', 'the word changed and the money must not')
  assert.equal(data.hostTargetWeight, 0.25, 'the weight that leaves moved with the word')
  assert.equal(data.positionWeight, 0.25)
  assert.equal(data.exposureDirection, 'unchanged')
  assert.equal(data.addsToThisDesksShare, false)
  assert.ok(data.review.reason.includes('0.12'), `the reason does not name the target the plan actually builds toward: ${data.review.reason}`)
  assert.ok(data.review.reason.includes('0.15'), `the reason does not name what other desks hold of this name: ${data.review.reason}`)

  /**
   * ⛔ And the tautology it replaces: the folded number restated against itself.
   * `already-at-target`'s sentence is true of a plan this desk has reached and
   * says nothing at all when the plan was cut down to the holding first.
   */
  assert.ok(
    !/against a cumulative target of 0\.05/.test(data.review.reason),
    `the reason is built out of the folded number rather than the reason it was folded: ${data.review.reason}`,
  )
})

/**
 * ⑷ **The sweep, with the axis that was missing.** `#825`'s own sweep added a
 * `plan` dimension because without one no row reached the staged-add rung. It
 * had no **`pending`** dimension, so no row separated what other desks *hold*
 * from what they have merely *written down* — and this defect sat inside that
 * gap for exactly as long as it existed.
 *
 * ⚠️ **The claim is narrow and it is the whole sentence:** on the staged-add
 * path an open proposal by another desk changes nothing about the order. It may
 * — and does — still change the entry ceiling, the causes and the diagnostics.
 */
check('#828 — on the held path, another desk’s open proposal changes no number this run hands the host', () => {
  for (const item of cases.cases) {
    for (const [label, make] of [
      ['mine', (symbol) => bookOf(symbol, 'catalyst-turnaround')],
      ['unattributed', (symbol) => bookOf(symbol, 'none')],
      ['theirs', (symbol) => bookOf(symbol, 'inst_shareholder_rerating')],
      ['over-target', (symbol) => ({ positions: [{ symbol, strategy: 'catalyst-turnaround', weight: 0.15 }], proposals: [], caps: CAPS })],
    ]) {
      const held = structuredClone(item.input)
      held.held = true
      held.plan = structuredClone(staging.plan)
      held.book = make(held.symbol)
      const without = runVerdict(held).data

      for (const pending of [0.08, 0.15, 0.2, 0.25]) {
        const withPending = structuredClone(held)
        withPending.book = make(withPending.symbol)
        withPending.book.proposals = [{ symbol: withPending.symbol, strategy: 'inst_shareholder_rerating', targetWeight: pending }]
        const answer = runVerdict(withPending).data
        const where = `#828 → ${item.name} → ${label} + pending ${pending}`

        /**
         * ⚠️ **`cumulativeTargetWeight` is asserted on the two roles that read
         * it, and the exception is real rather than a convenience.** It decides
         * `ownTarget` under `increase` and `reduce` and under no other: a
         * `standstill` hands over the holding and a `close` hands over zero, and
         * the share reported beside either is the *entry* sizing — which reads
         * the entry ceiling, folds open proposals in, and is right to (#813). A
         * `close-out` over a 6% holding moves that number with somebody's
         * pending total and moves no order at all.
         */
        const role = INTENT_WEIGHT_ROLES[without.intent]
        const fields = role === 'increase' || role === 'reduce'
          ? ['intent', 'cumulativeTargetWeight', 'incrementThisRun', 'hostTargetWeight', 'exposureDirection', 'addsToThisDesksShare']
          : ['intent', 'incrementThisRun', 'hostTargetWeight', 'exposureDirection', 'addsToThisDesksShare']
        for (const field of fields) {
          assert.deepEqual(
            answer[field],
            without[field],
            `${where}: [${without.intent}] ${field} went from ${JSON.stringify(without[field])} to ${JSON.stringify(answer[field])} on a proposal nobody approved and nothing filled`,
          )
        }
      }
    }
  }
})

/**
 * ⑸ **⛔ And the entry ceiling is not what changed.** `#813` folds pending
 * totals into every book-derived ceiling and that judgement stands for the
 * buying question: a desk opening a *new* position beside another desk's
 * unfilled buy is the state a limit exists for. What #828 splits off is the
 * weight that travels back, and this is the assertion that it split rather than
 * removed.
 */
check('#828 — the entry ceiling still folds open proposals in, and still stops an opening', () => {
  const entering = (pendingTotal) => {
    const input = structuredClone(positive.input)
    input.held = false
    input.book = {
      positions: [],
      proposals: pendingTotal === null ? [] : [{ symbol: input.symbol, strategy: 'inst_shareholder_rerating', targetWeight: pendingTotal }],
      caps: CAPS,
    }
    return runVerdict(input).data
  }

  assert.equal(entering(null).intent, 'enter-staged', 'the entry fixture no longer opens')
  const taken = entering(0.2)
  assert.equal(taken.intent, 'blocked-by-account-limit', 'an opening beside a full account limit stopped being refused')
  assert.equal(taken.review.name, 'account-limit-taken')
  const narrowed = entering(0.15)
  assert.ok(
    narrowed.cumulativeTargetWeight <= 0.05 + 1e-9,
    `an entry sized past the room a pending total leaves: ${narrowed.cumulativeTargetWeight}`,
  )
})


/**
 * ⑷ **A share of the name, not all of it.** The clamp is a ceiling on the
 * reduction target and never a floor: a desk holding part of a position reduces
 * **its** part, down to what the arithmetic asks for and no further into
 * anybody else's.
 */
check('#821 — a desk reduces its own share of a shared position and no more', () => {
  const shared = structuredClone(cases.cases.find((item) => item.name === 'catalyst-realised-and-priced-in').input)
  shared.book = {
    positions: [
      { symbol: shared.symbol, strategy: 'catalyst-turnaround', weight: 0.05 },
      { symbol: shared.symbol, strategy: 'inst_fundamental_mean_reversion', weight: 0.04 },
    ],
    proposals: [],
    caps: CAPS,
  }
  const data = runVerdict(shared).data
  assert.equal(data.intent, 'trim-into-realisation', 'a desk that runs part of the name still trims it')
  assert.equal(data.ownHeldWeight, 0.05)
  assert.equal(data.otherHeldWeight, 0.04)
  assert.equal(data.positionWeight, 0.09)
  assert.equal(data.hostTargetWeight, round(0.04 + data.cumulativeTargetWeight), 'the trim left this desk’s share and reached into the other manager’s')
  assert.equal(data.exposureDirection, 'reduce', 'a real trim stopped leaving')

  /** …and where the sizing asks for **more** than this desk holds, a trim does not become a purchase. */
  const overSized = structuredClone(shared)
  overSized.book.positions[0].weight = 0.005
  const capped = runVerdict(overSized).data
  assert.equal(capped.intent, 'trim-into-realisation')
  assert.ok(capped.cumulativeTargetWeight > capped.ownHeldWeight, 'the fixture no longer sizes above what this desk holds, and this assertion no longer measures the clamp')
  assert.equal(capped.hostTargetWeight, 0.045, 'a trim was re-sized upward out of the entry arithmetic and bought the difference')
  assert.equal(capped.exposureDirection, 'unchanged')
})

/**
 * ⑸ **A standstill states the holding.** `hold`, `hold-through-delay`,
 * `exit-review`, the research watches and every WAIT are rungs whose own prose
 * is «nothing is added and nothing is closed» — and each of them handed the host
 * the weight a *purchase* would target. A `hold-through-delay` bought 2.3pp of a
 * position it wholly ran; `exit-review`, whose entire content is «adjudicate
 * before deciding anything else», handed over a `0` and liquidated the name.
 */
check('#821 — a judgement that changes nothing asks the host to change nothing', () => {
  const standstills = [
    { case: 'one-delay-with-new-evidence', intent: 'hold-through-delay' },
    { case: 'repeated-delay-exhausts-the-budget', intent: 'exit-review' },
  ]
  for (const item of standstills) {
    for (const assignee of ASSIGNEES) {
      const data = rebooked(item.case, assignee.strategy).data
      const where = `#821 → ${item.intent} → ${assignee.name}`
      assert.equal(data.intent, item.intent, `${where}: the rung moved`)
      assert.equal(data.hostTargetWeight, 0.06, `${where}: a rung that adds nothing and closes nothing sent ${data.hostTargetWeight} over a holding of 0.06`)
      assert.equal(data.incrementThisRun, 0, `${where}: incrementThisRun`)
      assert.equal(data.exposureDirection, 'unchanged', `${where}: exposureDirection`)
    }
  }

  /** The entry-side watches, on a name this desk does not hold: nothing to change, and 0 is not an order. */
  const watch = runVerdict(structuredClone(cases.cases.find((item) => item.name === 'policy-announced-with-no-traced-path').input)).data
  assert.equal(watch.intent, 'research-watch')
  assert.equal(watch.positionWeight, 0)
  assert.equal(watch.hostTargetWeight, 0, 'a research watch on an unheld name asked the host for a position')

  /** …and the same watch over a holding assigned to nobody leaves that holding alone. */
  const overHolding = rebooked('policy-announced-with-no-traced-path', 'none').data
  assert.equal(overHolding.intent, 'research-watch')
  assert.equal(overHolding.hostTargetWeight, 0.06, 'a research watch reached for a holding it never judged')
})

/** ⑹ The role table is total over the intent vocabulary — a fourteenth intent with no role is caught here. */
check('#821 — every registered intent says what it asks the position to do', () => {
  for (const intent of INTENTS) {
    assert.ok(INTENT_WEIGHT_ROLE_NAMES.includes(INTENT_WEIGHT_ROLES[intent]), `${intent} has no weight role, and a weight nobody assigned a role to is this defect`)
  }
  assert.deepEqual(Object.keys(INTENT_WEIGHT_ROLES).sort(), [...INTENTS].sort(), 'the role table and the intent vocabulary drifted apart')
  assert.equal(INTENT_WEIGHT_ROLES['close-out'], 'close')
  assert.equal(INTENT_WEIGHT_ROLES['reduction-not-this-desks'], 'standstill')
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. The package's own boundaries.
// ─────────────────────────────────────────────────────────────────────────────

check('the cause vocabulary is closed', () => {
  assert.throws(() => cause('looks_wrong', 'a fifth word'), /not one of the four causes/)
  assert.deepEqual(Object.keys(CAUSE_CODES).sort(), ['data_missing', 'research_incomplete', 'risk_limit_exceeded', 'thesis_refuted'])
  assert.equal(CAUSE_CODES.data_missing.lane, 'absence')
  assert.equal(CAUSE_CODES.research_incomplete.lane, 'absence')
  assert.equal(CAUSE_CODES.thesis_refuted.lane, 'refutation')
  assert.equal(CAUSE_CODES.risk_limit_exceeded.lane, 'limit')
})

/**
 * ⚠️ **The scope rule for this pull request, made mechanical.** Each of the three
 * packages in #256 is independently self-contained: the published artifact is a
 * path→contents map rooted at the package directory, so a relative import that
 * escapes it does not survive publication — it fails at install rather than here.
 */
check('nothing in lib/ imports from outside this package', () => {
  for (const file of readdirSync(join(PACKAGE, 'lib'))) {
    if (!file.endsWith('.mjs')) continue
    const source = readFileSync(join(PACKAGE, 'lib', file), 'utf8')
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      const specifier = match[1]
      if (specifier.startsWith('node:')) continue
      assert.ok(specifier.startsWith('./'), `lib/${file} imports ${specifier}, which leaves this package's directory`)
    }
  }
})

/**
 * Every threshold is written down three times — here, in `config.schema.json`
 * and in `PROMPT.md` — and the second copy is what an investor reads on the
 * install screen while the third is what governs when an invocation carries no
 * `config` block at all. Two of the three are machine-comparable, so they are
 * compared; the prompt is checked for the key's name only, because a number in
 * prose can legitimately be written as `0.20` or as `20%`.
 */
const schema = read('config.schema.json')
const prompt = readFileSync(join(PACKAGE, 'PROMPT.md'), 'utf8')

check('the config schema and the methodology constants agree', () => {
  for (const [key, value] of Object.entries(METHODOLOGY)) {
    const property = schema.properties[key]
    assert.ok(property !== undefined, `config.schema.json has no ${key}, and an investor cannot set what is not declared`)
    assert.equal(property.default, value, `config.schema.json says ${key} defaults to ${property.default} and lib/constants.mjs says ${value}`)
    assert.ok(typeof property.description === 'string' && property.description.length > 40, `${key} needs a description an investor can read`)
    assert.ok(prompt.includes(key), `PROMPT.md never names ${key}, and the prompt is what governs when an invocation carries no config block`)
  }
})

check('the manifest and the plugin agree, and the capabilities are the ones the prompt uses', () => {
  const manifest = read('aumos.json')
  const plugin = read('.claude-plugin/plugin.json')
  assert.equal(manifest.id, 'catalyst-turnaround')
  assert.equal(plugin.name, manifest.id)
  assert.equal(plugin.version, manifest.version, 'the plugin and the manifest disagree about the version')
  assert.equal(manifest.prompt, './PROMPT.md')
  for (const capability of manifest.capabilities) {
    assert.ok(typeof capability.reason === 'string' && capability.reason.length > 20, `${capability.kind} is requested with no reason an investor can read`)
  }
  const notice = readFileSync(join(PACKAGE, 'NOTICE.md'), 'utf8')
  assert.ok(notice.includes(manifest.provenance.licenseHolder), 'NOTICE.md does not carry the licence holder verbatim')
  assert.match(manifest.provenance.commit, /^[0-9a-f]{40}$/)
})

console.log(`catalyst-turnaround: ${checks} checks over ${cases.cases.length} ladder cases, ${ledgerFixture.scenarios.length} ledger scenarios, ${staging.runs.length + staging.malformed.length} staged-plan runs, ${concentration.scenarios.length} concentration scenarios, ${scoreboard.scenarios.length} scoreboards and ${reference.variants.length} reference-case variants`)
console.log(`catalyst-turnaround: ${ABSENCE_REGRESSIONS.length} absent-input regressions — a declared input removed from a passing run, and none of them buys anything or reports a refutation`)
console.log(`catalyst-turnaround: the six catalyst outcomes reached ${new Set(SIX.map((name) => reached.get(name))).size} distinct judgements`)
