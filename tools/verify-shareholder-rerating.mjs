/**
 * The deterministic core of `shareholder-rerating`, against its committed fixtures.
 *
 *   node tools/verify-shareholder-rerating.mjs
 *
 * ── Why this package has code at all ───────────────────────────────────────
 *
 * The catalogue's default is prose, and most of this package is prose. What is code
 * is the part where being *checkably* right decides how much of somebody's book moves,
 * and #257's completion conditions name each piece of it:
 *
 *   ⑴ the total return keeps re-rating and dividends apart, and **never** adds a
 *      company's buyback yield to an investor's cash dividend;
 *   ⑵ the four look-alike cases — a dividend trap, a one-off gain, an inadequate
 *      capital position and an announced-but-unexecuted buyback — reach four
 *      **different** answers, and a completed positive thesis reaches a sized BUY;
 *   ⑶ a staged plan re-run does not add the same exposure twice;
 *   ⑷ concentration is measured over the whole account — real holdings **and** open
 *      proposals — and per-strategy caps never sum into a larger account cap;
 *   ⑸ `data_missing`, `research_incomplete`, `thesis_refuted` and
 *      `risk_limit_exceeded` stay four things (#254).
 *
 * A model can be argued out of any of those in a long session. Arithmetic cannot, and
 * a fixture is the only form in which "these four cases end differently" is a claim
 * somebody can check rather than a paragraph somebody wrote.
 *
 * ── Plain Node, deliberately ──────────────────────────────────────────────
 *
 * `node:assert/strict` and committed JSON, in the shape `check:allocator` and
 * `check:recipes` already use. There is no test framework in this repository and this
 * is not the pull request that adds one: a dependency added for a checker is a
 * dependency every future submitter installs to lint a directory of prose.
 *
 * ⚠️ **It runs before `check:pins` in the workflow, and that position is load-bearing
 * for a reason written at the end of `.github/workflows/lint.yml`**: `steps` are
 * sequential, `check:pins` is red by construction on a pull request that adds a
 * package, and a check placed after it is a check that never runs on the pull requests
 * it exists for.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  REQUIRED_OUTPUTS,
  ISSUER_KINDS,
  ROUTES,
  THRESHOLDS,
  capitalHeadroom,
  concentration,
  evaluateCase,
  round,
  returnComposition,
  stagedIncrement,
} from '../managers/shareholder-rerating/lib/index.mjs'

const fixtureRoot = new URL('../managers/shareholder-rerating/fixtures/', import.meta.url)
const read = async (name) => JSON.parse(await readFile(new URL(name, fixtureRoot), 'utf8'))

const cases = await read('cases.json')
const composition = await read('return-composition.json')
const staged = await read('staged-plans.json')
const boundaries = await read('boundaries.json')
const manifest = JSON.parse(await readFile(new URL('../managers/shareholder-rerating/aumos.json', import.meta.url), 'utf8'))

let checked = 0
const ok = (message) => {
  checked += 1
  console.log(`  ok  ${message}`)
}

const codesOf = (diagnostics) => diagnostics.map((row) => row.code)

/**
 * ── ⑴ the composition ─────────────────────────────────────────────────────
 *
 * `legsSumToTotal` is asserted as an identity rather than as a number: the total
 * return **is** the re-rating plus the investor's cash and nothing else, so the sum
 * has to close in every scenario of every fixture. That is the assertion a buyback
 * silently added to the cash leg would fail.
 */
for (const fixture of composition.cases) {
  const answer = returnComposition(fixture.input)
  const expect = fixture.expect
  const where = `return-composition/${fixture.id}`

  if (expect.blocked === true) {
    assert.ok(
      answer.diagnostics.some((row) => row.severity === 'blocked'),
      `${where}: expected a refusal and got ${codesOf(answer.diagnostics).join(', ') || 'nothing'}`,
    )
  }
  for (const code of expect.diagnosticCodes ?? []) {
    assert.ok(codesOf(answer.diagnostics).includes(code), `${where}: expected diagnostic ${code}, got ${codesOf(answer.diagnostics).join(', ')}`)
  }
  if (expect.totalReturnBaseIsNull === true) {
    assert.equal(answer.data.totalReturn.base, null, `${where}: a refused composition may not still publish a number`)
  }
  for (const [key, value] of Object.entries(expect.rerating ?? {})) {
    assert.equal(answer.data.rerating[key], value, `${where}: rerating.${key}`)
  }
  for (const [key, value] of Object.entries(expect.totalReturn ?? {})) {
    assert.equal(answer.data.totalReturn[key], value, `${where}: totalReturn.${key}`)
  }
  for (const key of ['investorCashReturn', 'buybackYield', 'cancellationYield', 'withholdingTaxRateUsed', 'buybackIncludedInInvestorReturn']) {
    if (key in expect) assert.equal(answer.data[key], expect[key], `${where}: ${key}`)
  }
  if (expect.legsSumToTotal === true) {
    for (const scenario of ['bear', 'base', 'bull']) {
      const sum = answer.data.rerating[scenario] + answer.data.investorCashReturn
      assert.ok(
        Math.abs(sum - answer.data.totalReturn[scenario]) < 1e-9,
        `${where}: ${scenario} total return is not its two legs — a third leg got into the sum`,
      )
    }
    if (answer.data.buybackYield !== null) {
      assert.notEqual(
        answer.data.totalReturn.base,
        answer.data.rerating.base + answer.data.investorCashReturn + answer.data.buybackYield,
        `${where}: the buyback yield is inside the total return, which is the one thing this module exists to prevent`,
      )
    }
  }
  ok(`${where} — ${fixture.note ?? 'composition'}`)
}

/**
 * ── ⑵ and ⑸ the cases ─────────────────────────────────────────────────────
 */
const reached = new Map()
for (const fixture of cases.cases) {
  const answer = evaluateCase(fixture.input)
  const expect = fixture.expect
  const where = `cases/${fixture.id}`

  for (const key of ['case', 'route', 'outcomeCode', 'proposedAction', 'targetTotalWeight', 'incrementWeight', 'existingExposure', 'lossFraction', 'discountToBase', 'investorCashReturn', 'buybackYield', 'returnHeadroomYield', 'projectedExposure']) {
    if (key in expect) assert.equal(answer.data[key], expect[key], `${where}: ${key}`)
  }
  if ('totalReturnBase' in expect) assert.equal(answer.data.totalReturn.base, expect.totalReturnBase, `${where}: totalReturn.base`)
  for (const code of expect.diagnosticCodes ?? []) {
    assert.ok(codesOf(answer.diagnostics).includes(code), `${where}: expected diagnostic ${code}, got ${codesOf(answer.diagnostics).join(', ')}`)
  }
  if (expect.noBlockedDiagnostics === true) {
    const blocked = answer.diagnostics.filter((row) => row.severity === 'blocked')
    assert.deepEqual(blocked, [], `${where}: an absence was recorded as a refusal — ${codesOf(blocked).join(', ')}`)
    assert.notEqual(answer.data.outcomeCode, 'thesis_refuted', `${where}: missing data was filed as a refuted thesis`)
  }
  if (expect.missingOutputs !== undefined) {
    assert.deepEqual(answer.data.details.missing, expect.missingOutputs, `${where}: the run has to name what it did not finish`)
  }
  if (answer.data.case !== null) reached.set(answer.data.case, (reached.get(answer.data.case) ?? 0) + 1)
  ok(`${where} — ${answer.data.case} → ${answer.data.route} → ${answer.data.proposedAction}`)
}

/**
 * The completion condition that is about the **set** of answers rather than about any
 * one of them: a package whose every case ends in WAIT is not a success, and four
 * look-alike cases that all reach one label have not told them apart.
 */
const buys = cases.cases.filter((fixture) => fixture.expect.proposedAction === 'BUY')
assert.ok(buys.length >= 1, 'no fixture reaches a sized BUY — a package where every case waits is not a success')
for (const label of ['dividend-trap', 'one-off-earnings', 'capital-inadequate', 'announced-not-executed']) {
  assert.ok(reached.has(label), `no fixture reaches ${label}, so nothing shows this package tells it apart from the others`)
}
assert.ok(reached.has('rerated') && reached.has('return-policy-retreat'), 'the trim-or-exit half of the methodology has no fixture')
const routesReached = new Set(cases.cases.map((fixture) => fixture.expect.route).filter(Boolean))
assert.ok(routesReached.size >= 4, `only ${routesReached.size} distinct routes are exercised`)
ok(`the case set reaches ${reached.size} labels and ${routesReached.size} routes, including ${buys.length} sized BUY path(s)`)

const outcomeCodes = new Set(cases.cases.map((fixture) => fixture.expect.outcomeCode).filter(Boolean))
for (const code of ['data_missing', 'research_incomplete', 'thesis_refuted', 'risk_limit_exceeded']) {
  assert.ok(outcomeCodes.has(code), `${code} is never reached, so nothing shows it stays distinct from the other three (#254)`)
}
ok('data_missing, research_incomplete, thesis_refuted and risk_limit_exceeded are each reached by a fixture')

/**
 * ── ⑶ the staged plan ─────────────────────────────────────────────────────
 */
for (const fixture of staged.cases) {
  const answer = stagedIncrement({ ...fixture.input, plan: staged.plan })
  const where = `staged-plans/${fixture.id}`
  assert.equal(answer.data.action, fixture.expect.action, `${where}: action`)
  assert.equal(answer.data.increment, fixture.expect.increment, `${where}: increment`)
  if ('reason' in fixture.expect) assert.equal(answer.data.reason, fixture.expect.reason, `${where}: reason`)
  if ('cumulativeAfter' in fixture.expect) assert.equal(answer.data.cumulativeAfter, fixture.expect.cumulativeAfter, `${where}: cumulativeAfter`)
  if (fixture.expect.outcomeCode !== undefined) {
    const carried = answer.diagnostics.some((row) => row.details?.outcomeCode === fixture.expect.outcomeCode)
    assert.ok(carried, `${where}: the refusal has to carry ${fixture.expect.outcomeCode} so the ledger can group it`)
  }
  assert.ok(answer.data.decisionId !== null, `${where}: a stage that cannot name the decision it came from is not a plan`)
  ok(`${where} — ${answer.data.action}${answer.data.reason ? ` (${answer.data.reason})` : ''}`)
}

/**
 * The re-run property, asserted directly rather than only through the fixtures: the
 * same stage evaluated against a book that already reflects it adds nothing.
 */
{
  const first = stagedIncrement({
    plan: staged.plan,
    stageId: 'stage-1',
    asOf: '2026-09-10T07:00:00Z',
    executedStageIds: [],
    book: { heldWeight: 0, openProposalWeight: 0 },
    recheck: { thesisIntact: true, discountToBase: 0.31, riskBudgetRemaining: 0.01, lossFraction: 0.1875 },
  })
  const second = stagedIncrement({
    plan: staged.plan,
    stageId: 'stage-1',
    asOf: '2026-09-10T07:05:00Z',
    executedStageIds: [],
    // The first proposal is open and unapproved — the state a repeated run finds.
    book: { heldWeight: 0, openProposalWeight: first.data.increment },
    recheck: { thesisIntact: true, discountToBase: 0.31, riskBudgetRemaining: 0.01, lossFraction: 0.1875 },
  })
  assert.equal(second.data.increment, 0, 'a repeated run added the same exposure a second time')
  assert.equal(first.data.increment + second.data.increment, first.data.stageTargetWeight, 'the two runs together moved past the stage')
  ok('a stage evaluated twice proposes its weight once, whether or not the ledger entry survived')
}

/**
 * ── ⑷ the whole account ───────────────────────────────────────────────────
 */
{
  const answer = concentration({
    proposed: { symbol: 'A', sector: 'financials', weight: 0.03 },
    holdings: [{ symbol: 'A', sector: 'financials', weight: 0.06, strategy: 'evidence-gated' }],
    // ⚠️ A total, not an addition: `catalyst-turnaround` is asking for this name to *be* 0.09 of the book (#813).
    openProposals: [{ symbol: 'A', sector: 'financials', targetWeight: 0.09, strategy: 'catalyst-turnaround', decisionId: 'dec_x' }],
    caps: { accountPositionCap: 0.1, strategyPositionCap: 0.08, accountSectorCap: 0.3, accountGrossCap: 0.9 },
    strategy: 'shareholder-rerating',
  })
  assert.equal(answer.data.bindingPositionCap, 0.08, 'the binding cap is the smaller of the two, never their sum')
  assert.equal(answer.data.existingExposure, 0.09, 'an open proposal from another strategy is exposure and is counted')
  assert.equal(answer.data.held, 0.06)
  assert.equal(answer.data.openProposals, 0.03, 'the open proposal was added to the holding instead of folded against it')
  assert.equal(answer.data.withinLimits, false)
  assert.equal(answer.data.outcomeCode, 'risk_limit_exceeded')
  assert.ok(codesOf(answer.diagnostics).includes('strategy_caps_do_not_sum'))
  assert.ok(codesOf(answer.diagnostics).includes('overlapping_open_proposal'))
  ok('per-strategy and account caps fold by minimum, over holdings and open proposals together')
}
{
  // ⚠️ `openProposals: []` states that nothing is pending. Since the fix, leaving it
  // out states that nobody looked — see the `unreadable` assertion below.
  const withoutOpen = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: [{ symbol: 'A', weight: 0.06 }],
    openProposals: [],
    caps: { accountPositionCap: 0.1 },
  })
  const withOpen = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: [{ symbol: 'A', weight: 0.06 }],
    openProposals: [{ symbol: 'A', targetWeight: 0.09 }],
    caps: { accountPositionCap: 0.1 },
  })
  const unreadable = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: [{ symbol: 'A', weight: 0.06 }],
    caps: { accountPositionCap: 0.1 },
  })
  assert.equal(unreadable.data.withinLimits, null, 'an unread open-proposal list was read as an empty one')
  assert.equal(unreadable.data.outcomeCode, 'data_missing')
  assert.equal(withoutOpen.data.withinLimits, true, 'the same proposal fits when nothing else is pending')
  assert.equal(withOpen.data.withinLimits, false, 'an unapproved proposal was left out of the account exposure')
  ok('an open proposal changes the answer, which is what makes it exposure rather than paperwork')
}
{
  const duplicated = concentration({
    proposed: { symbol: 'A', weight: 0.01 },
    holdings: [
      { symbol: 'A', weight: 0.06, strategy: 'evidence-gated' },
      { symbol: 'A', weight: 0.06, strategy: 'shareholder-rerating' },
    ],
    openProposals: [],
    caps: { accountPositionCap: 0.1 },
  })
  assert.equal(duplicated.data.held, 0.06, 'one position was counted twice because two theses were attached to it')
  assert.ok(codesOf(duplicated.diagnostics).includes('duplicate_position_rows'))
  ok('a position is one quantity however many theses point at it')
}

/**
 * ── ⑺ #813: the host states a **total**, and three books it is measured on ─
 *
 * The scenarios are the A/B/C of `untilled/aumos` PR #815, which drove the real
 * host — `Kernel.decide`, real `position_assignments`, `discoveryService`'s
 * `portfolio-get` — and fed its answer to this package's own `lib`. The fund is
 * ₩100,000,000 on XKRX with a 20% single-name ceiling, and the third column is
 * what that host actually produces once the orders go out:
 *
 *   A  held 0%  · pending total 8%   → 8%   (unchanged by #813)
 *   B  held 6%  · pending total 12%  → 12%  (this package said 18%)
 *   C  held 6%  · pending total 15%  → 15%  (this package said 21%, and refused)
 *
 * ⚠️ **B and C are the shape of the defect**: a name that is *already held* and
 * *also* has a pending total. In A the two readings coincide — nobody holds the
 * name — which is why #810's measurement, all of whose rows were unheld names,
 * could not tell them apart.
 */
const HOST_ABC = [
  { label: 'A — held 0%, pending total 8%', held: 0, pendingTotal: 0.08, exposure: 0.08, naive: 0.08, headroom: 0.12 },
  { label: 'B — held 6%, pending total 12%', held: 0.06, pendingTotal: 0.12, exposure: 0.12, naive: 0.18, headroom: 0.08 },
  { label: 'C — held 6%, pending total 15%', held: 0.06, pendingTotal: 0.15, exposure: 0.15, naive: 0.21, headroom: 0.05 },
]

for (const scenario of HOST_ABC) {
  const answer = concentration({
    proposed: { symbol: '005930', sector: 'technology', weight: 0 },
    holdings: scenario.held > 0 ? [{ symbol: '005930', sector: 'technology', weight: scenario.held }] : [],
    openProposals: [{ symbol: '005930', sector: 'technology', targetWeight: scenario.pendingTotal, strategy: 'fundamental-mean-reversion', decisionId: 'dec_other' }],
    caps: { accountPositionCap: 0.2 },
    strategy: 'shareholder-rerating',
  })
  assert.equal(answer.data.existingExposure, scenario.exposure, `${scenario.label}: the account's exposure to this name`)
  if (scenario.naive !== scenario.exposure) {
    assert.notEqual(answer.data.existingExposure, scenario.naive, `${scenario.label}: the holding and the pending total were added`)
  }
  assert.equal(answer.data.symbolHeadroom, scenario.headroom, `${scenario.label}: what is left of the 20% ceiling`)
  assert.equal(answer.data.withinLimits, true, `${scenario.label}: a book with room refused the question the sizing asks`)
  assert.equal(answer.data.outcomeCode, null)
  ok(`#813 ${scenario.label} — the pending total is folded by maximum and the ceiling still has room`)
}
{
  /**
   * ⛔ **A pending *trim* does not reduce exposure before it fills.** The fold is
   * `max` rather than «the latest total wins»: this book holds 14% right now, and
   * a ceiling has to hold in both of the states it passes through.
   */
  const trimming = concentration({
    proposed: { symbol: 'A', weight: 0 },
    holdings: [{ symbol: 'A', weight: 0.14 }],
    openProposals: [{ symbol: 'A', targetWeight: 0.08, strategy: 'catalyst-turnaround' }],
    caps: { accountPositionCap: 0.2 },
  })
  assert.equal(trimming.data.existingExposure, 0.14, 'a pending trim was read as though it had already filled')
  assert.equal(trimming.data.openProposals, 0, 'a pending total below the holding asks for nothing on top of it')

  /**
   * ⛔ **Two managers naming the same total have agreed on one end state.** The
   * host says so — it publishes each judgement's own total and adds nothing —
   * and a run that summed them would put this name at 24% of a 20% book.
   */
  const twoManagers = concentration({
    proposed: { symbol: 'A', weight: 0 },
    holdings: [{ symbol: 'A', weight: 0.06 }],
    openProposals: [
      { symbol: 'A', targetWeight: 0.12, strategy: 'catalyst-turnaround' },
      { symbol: 'A', targetWeight: 0.12, strategy: 'fundamental-mean-reversion' },
    ],
    caps: { accountPositionCap: 0.2 },
  })
  assert.equal(twoManagers.data.existingExposure, 0.12, 'two proposals for the same total were read as a request for twice it')
  assert.equal(twoManagers.data.withinLimits, true)

  // …and the whole-book axis is folded the same way, or a gross ceiling counts one name twice.
  const gross = concentration({
    proposed: { symbol: 'A', weight: 0 },
    holdings: [
      { symbol: 'A', weight: 0.06 },
      { symbol: 'B', weight: 0.1 },
    ],
    openProposals: [{ symbol: 'A', targetWeight: 0.12, strategy: 'catalyst-turnaround' }],
    caps: { accountPositionCap: 0.2, accountGrossCap: 0.9 },
  })
  assert.equal(gross.data.grossExposure, 0.22, 'the gross axis added a holding and its own pending total')
  ok('#813 — a pending trim, two managers agreeing on one total, and the gross axis that folds the same way')
}
/**
 * ── #814/#816: a holding row that names its assignee changes nothing here ──
 *
 * `untilled/aumos#816` puts an `assignment` — `assigned` · `none` · `released` ·
 * `departed`, plus the assignee's **instance** id — on every holding row
 * `portfolio_get` answers, and the adapter into this package's `holdings` is one
 * expression: `assigned` and mine → this instance's strategy id, `assigned` and
 * somebody else's → that instance, the other three words → `unattributed`.
 *
 * ⛔ **This package's exposure arithmetic does not read it, and that is correct
 * rather than an oversight.** `held` is counted over the whole account whoever it
 * belongs to, because a cap is a cap on the *position*; `strategy` is read in one
 * place only, the `overlapping_open_proposal` diagnostic about somebody else's
 * pending row. #813's fold is keyed on the name for the same reason — a
 * `position-weight` target is executed against the whole position — so an
 * assignment arriving cannot move a number below.
 *
 * ⚠️ **`untilled/aumos#817` adds the one axis where it does move**, and the block
 * after this one is that axis: not what the account *is*, but what this run may
 * ask it to *become*. Every assertion below still holds unchanged.
 */
{
  const MINE = 'inst_shareholder_rerating'
  const strategyOf = (row) =>
    row.state === 'assigned' ? (row.managerInstanceId === MINE ? 'shareholder-rerating' : row.managerInstanceId) : 'unattributed'
  const views = [
    { state: 'assigned', managerInstanceId: MINE },
    { state: 'assigned', managerInstanceId: 'inst_catalyst_turnaround' },
    { state: 'none', managerInstanceId: null },
    { state: 'released', managerInstanceId: null },
    { state: 'departed', managerInstanceId: null },
  ]
  for (const [label, held, pendingTotal, exposure] of [['A', 0, 0.08, 0.08], ['B', 0.06, 0.12, 0.12], ['C', 0.06, 0.15, 0.15]]) {
    for (const view of views) {
      const answer = concentration({
        proposed: { symbol: '005930', sector: 'technology', weight: 0 },
        holdings: held > 0 ? [{ symbol: '005930', sector: 'technology', weight: held, strategy: strategyOf(view) }] : [],
        openProposals: [{ symbol: '005930', sector: 'technology', targetWeight: pendingTotal, strategy: 'fundamental-mean-reversion' }],
        caps: { accountPositionCap: 0.2 },
        strategy: 'shareholder-rerating',
      })
      assert.equal(answer.data.existingExposure, exposure, `${label}/${view.state}: the fold read the assignment`)
      assert.equal(answer.data.held, held, `${label}/${view.state}: the holding moved with the assignment`)
      assert.equal(answer.data.withinLimits, true)
    }
  }
  ok('#814 — a holding that names its assignee moves no number in this package, and the fold stays keyed on the name')
}

/**
 * ── #817: the weight that leaves, and «above target» as a question about whose ─
 *
 * `#813` and `#814` were the **reading** direction. This is the **writing** one.
 * `decision_submit` carries a `position-weight` **total** and `rebalanceShadowBook`
 * executes it against the whole position without ever reading attribution
 * (`untilled/aumos#815`), so the number that crosses the boundary has to carry
 * the part of the position this run is not entitled to move:
 *
 *     hostTargetWeight = otherHeld + (ownHeld + incrementWeight)
 *
 * ⛔ **And `«the account is above it — this is a reduction question»` had to say
 * whose account.** `untilled/aumos#817` drove the real host over a 6% holding
 * assigned to nobody: this package sized the name at 5%, called it a reduction,
 * and the order was `sell:10` against a position no judgement on this fund ever
 * asked to reduce. This package already said the right sentence about pending
 * rows — *«an excess made of somebody else's unapproved proposal is theirs to
 * withdraw»* — and it now says it about holdings too.
 *
 * ⚠️ **This is not «nobody may touch an unattributed position»** — the state
 * `untilled/aumos#782` undid. A BUY into an unattributed name still leaves here,
 * and it leaves as a **buy**.
 */
{
  const buyPath = (() => {
    const fixture = cases.cases.find((row) => row.id === 'financial-positive-reaches-buy')
    assert.ok(fixture, 'cases.json no longer carries the sized BUY case, so this regression is testing nothing')
    return fixture.input
  })()
  const runWith = (holdings, openProposals = []) =>
    evaluateCase({ ...structuredClone(buyPath), book: { holdings, openProposals } }).data

  /** Nothing held: the two totals coincide, which is why an unheld-name measurement saw none of this. */
  const fresh = runWith([], [])
  assert.equal(fresh.proposedAction, 'BUY')
  assert.equal(fresh.otherHeldWeight, 0)
  assert.equal(fresh.hostTargetWeight, fresh.targetTotalWeight, 'on a name nobody holds the two totals differ')

  /** 4% held by this manager: unchanged from before #817, and the identity holds. */
  const own = runWith([{ symbol: '000000', sector: 'financials', weight: 0.04, strategy: 'shareholder-rerating' }])
  assert.equal(own.proposedAction, 'BUY')
  assert.equal(own.otherHeldWeight, 0)
  assert.equal(own.hostTargetWeight, own.targetTotalWeight, 'a wholly-own position ends at the target it always ended at')

  /**
   * ⛔ **The issue's book.** 6% assigned to nobody, and this run's target is
   * below it. Before #817 the answer was `RESIZE` and a target that sold a third
   * of somebody's position; now nothing of this manager's is above anything.
   */
  const unattributed = runWith([{ symbol: '000000', sector: 'financials', weight: 0.06 }])
  assert.equal(unattributed.heldWeight, 0.06)
  assert.equal(unattributed.otherHeldWeight, 0.06, 'a holding assigned to nobody was carried as this manager\'s')
  assert.equal(unattributed.outcomeCode, 'position_above_target', 'the account really is above the target, and that finding stands')
  assert.equal(unattributed.proposedAction, 'WAIT', 'this run proposed a reduction of a position it does not run')
  assert.equal(unattributed.hostTargetWeight, null, 'and it handed the host a weight anyway')
  assert.ok(
    codesOf(evaluateCase({ ...structuredClone(buyPath), book: { holdings: [{ symbol: '000000', sector: 'financials', weight: 0.06 }], openProposals: [] } }).diagnostics)
      .includes('excess_is_not_this_managers_to_reduce'),
    'the run said nothing about why it left the excess alone',
  )

  /** Another manager's holding is the same arithmetic, and it has to be. */
  const theirs = runWith([{ symbol: '000000', sector: 'financials', weight: 0.06, strategy: 'catalyst-turnaround' }])
  assert.equal(theirs.otherHeldWeight, 0.06)
  assert.equal(theirs.proposedAction, 'WAIT')
  assert.equal(theirs.hostTargetWeight, null)

  /**
   * ⛔ **And this desk's own 7% is still reduced**, to `targetTotalWeight`, which
   * is the behaviour `boundaries.json` has asserted since finding ③.
   */
  const mineAbove = runWith([{ symbol: '000000', sector: 'financials', weight: 0.07, strategy: 'shareholder-rerating' }])
  assert.equal(mineAbove.proposedAction, 'RESIZE')
  assert.equal(mineAbove.otherHeldWeight, 0)
  assert.equal(mineAbove.hostTargetWeight, mineAbove.targetTotalWeight, 'this manager could no longer reduce its own position')
  assert.ok(mineAbove.hostTargetWeight < 0.07)

  /**
   * ⚠️ **Holdings are added and open proposals are not.** A 6% holding of this
   * desk's under somebody else's pending total of 12% is 12% of exposure for the
   * *ceiling* and 6% of *position* for the order. Buying up to their unfilled
   * total would be this run executing their unapproved judgement.
   */
  const pending = evaluateCase({
    ...structuredClone(buyPath),
    book: {
      holdings: [{ symbol: '000000', sector: 'financials', weight: 0.02, strategy: 'catalyst-turnaround' }],
      openProposals: [{ symbol: '000000', sector: 'financials', targetWeight: 0.03, strategy: 'fundamental-mean-reversion' }],
    },
  }).data
  assert.equal(pending.existingExposure, 0.03, 'the ceiling axis stopped folding the pending total in')
  assert.equal(pending.otherHeldWeight, 0.02, 'a pending proposal was counted as a position')
  assert.equal(pending.proposedAction, 'BUY')
  assert.equal(pending.hostTargetWeight, round(0.02 + pending.incrementWeight), 'the order was assembled out of exposure rather than out of holdings')
  assert.notEqual(pending.hostTargetWeight, round(0.03 + pending.incrementWeight), 'somebody else\'s unfilled proposal was bought on their behalf')

  ok('#817 — the host weight is holdings-not-mine plus this desk\'s own end state, and «above target» is a question about this desk')
}

/**
 * ── #819: the routes that propose a sale, and whose position they are about ──
 *
 * `untilled/aumos#817` reached the buy path and stopped there. Everything else
 * — `trim-or-exit-review`, `reject`, `watch` — returns before the concentration
 * fold ever runs, so `actionFor` judged on `heldWeight`, the **whole** position,
 * and reached `RESIZE` the moment the account held anything of the name. Driven
 * against the real host over a 6% holding assigned to nobody, all three routes
 * answered identically on this desk's position, on another manager's and on an
 * unattributed one, with `hostTargetWeight: null` and `otherHeldWeight: null`.
 *
 * ⛔ **The attribution may not be bought at the price of the caps.** These
 * routes ask a question about the book — *whose shares are these?* — and not
 * about the Mandate, so `heldAttribution` answers it without a cap in sight. A
 * run under a Mandate that states no single-name ceiling still knows whose
 * position it is, which is what stops it from selling somebody else's.
 *
 * ⚠️ **And this desk's own reduction still leaves**, which is the behaviour
 * `#816` and `boundaries.json` have asserted since finding ③.
 */
{
  const MINE = 'shareholder-rerating'
  const fixtureOf = (id) => {
    const row = cases.cases.find((fixture) => fixture.id === id)
    assert.ok(row, `cases.json no longer carries ${id}, so this regression is testing nothing`)
    return row.input
  }
  const runWith = (id, holdings, overrides = {}) =>
    evaluateCase({ ...structuredClone(fixtureOf(id)), strategy: MINE, ...overrides, book: { holdings, openProposals: [] } })
  const symbolOf = (id) => fixtureOf(id).symbol
  const row = (id, weight, strategy) => [{ symbol: symbolOf(id), sector: 'financials', weight, ...(strategy === undefined ? {} : { strategy }) }]

  for (const id of ['rerated-reaches-trim-review', 'policy-retreat-reaches-trim-review', 'dividend-trap-is-refused']) {
    /** ⛔ The issue's book: 6% held and assigned to nobody, on a route that proposes a reduction. */
    for (const [label, holdings] of [['unattributed', row(id, 0.06)], ['another manager', row(id, 0.06, 'catalyst-turnaround')]]) {
      const answer = runWith(id, holdings)
      assert.equal(answer.data.case, evaluateCase({ ...structuredClone(fixtureOf(id)), strategy: MINE, book: { holdings: [], openProposals: [] } }).data.case, `${id}/${label}: the finding about the company moved with the book, and it is a finding about the company`)
      assert.equal(answer.data.heldWeight, 0.06, `${id}/${label}: the account really does hold it`)
      assert.equal(answer.data.ownHeldWeight, 0, `${id}/${label}: a holding this manager was never assigned was read as its own`)
      assert.equal(answer.data.otherHeldWeight, 0.06, `${id}/${label}: this route carried no attribution at all`)
      assert.equal(answer.data.hostTargetWeightFloor, 0.06, `${id}/${label}: no floor left with the answer, so a target below it sold their holding`)
      assert.equal(answer.data.proposedAction, 'WAIT', `${id}/${label}: this run proposed a reduction of a position it does not run`)
      assert.equal(answer.data.hostTargetWeight, null, `${id}/${label}: and it handed the host a weight anyway`)
      assert.ok(
        codesOf(answer.diagnostics).includes('reduction_is_not_this_managers_to_make'),
        `${id}/${label}: nothing said why the reduction was left alone`,
      )
    }

    /** ⛔ **This desk's own position is still reduced.** #819 must not make every review a no-op. */
    const mine = runWith(id, row(id, 0.06, MINE))
    assert.equal(mine.data.ownHeldWeight, 0.06)
    assert.equal(mine.data.otherHeldWeight, 0)
    assert.equal(mine.data.hostTargetWeightFloor, 0, `${id}: with nothing of anybody else's in the name the floor is 0`)
    assert.equal(mine.data.proposedAction, 'RESIZE', `${id}: this manager could no longer reduce its own position`)

    /** A name nobody holds is still a `WAIT`, and always was. */
    assert.equal(runWith(id, []).data.proposedAction, 'WAIT')
    assert.equal(runWith(id, []).data.hostTargetWeightFloor, 0)
  }

  /**
   * ⚠️ **A run that did not name itself cannot attribute anything**, and that is
   * a defect in the call rather than a finding about the book. It is reported as
   * one instead of being resolved in the permissive direction.
   */
  const anonymous = evaluateCase({
    ...structuredClone(fixtureOf('rerated-reaches-trim-review')),
    strategy: undefined,
    book: { holdings: row('rerated-reaches-trim-review', 0.06, MINE), openProposals: [] },
  })
  assert.equal(anonymous.data.proposedAction, 'WAIT')
  assert.ok(codesOf(anonymous.diagnostics).includes('run_did_not_name_its_strategy'), 'a run that named no strategy was allowed to trim on a guess')

  /** An account nobody read is not an account with nobody in it — unchanged, and still stated. */
  const unread = evaluateCase({ ...structuredClone(fixtureOf('rerated-reaches-trim-review')), strategy: MINE, book: undefined })
  assert.equal(unread.data.proposedAction, 'WAIT')
  assert.equal(unread.data.outcomeCode, 'data_missing')
  assert.equal(unread.data.ownHeldWeight, null, 'an unread book answered a number')
  assert.equal(unread.data.hostTargetWeightFloor, null)

  /**
   * ⚠️ **Holdings, never exposure — on this side too.** A pending total is
   * exposure for a ceiling and is not a position for an order, so somebody
   * else's unfilled proposal neither creates a reduction nor raises the floor.
   */
  const pending = evaluateCase({
    ...structuredClone(fixtureOf('rerated-reaches-trim-review')),
    strategy: MINE,
    book: { holdings: [], openProposals: [{ symbol: symbolOf('rerated-reaches-trim-review'), sector: 'financials', targetWeight: 0.12, strategy: 'fundamental-mean-reversion' }] },
  })
  assert.equal(pending.data.ownHeldWeight, 0)
  assert.equal(pending.data.otherHeldWeight, 0, 'an unfilled proposal was carried as a position')
  assert.equal(pending.data.hostTargetWeightFloor, 0, 'the floor was raised by a proposal nobody has approved')
  assert.equal(pending.data.proposedAction, 'WAIT')

  ok('#819 — the routes that reduce ask whose position it is, and a floor leaves with every one of them')
}

/**
 * ── ⑹ #269: a stated ceiling that could not be checked, and «financial» as four
 *      balance sheets ────────────────────────────────────────────────────────
 *
 * Two contracts, and the reason they are in one section is that they are the same
 * mistake at two altitudes: a classification nobody supplied being read as a
 * classification that permits something.
 *
 * ⚠️ **Every case below builds its own input or mutates a `structuredClone` of a
 * committed one.** No fixture file was reshaped to make an assertion here pass; the
 * only edit to `cases.json` in this change is the vocabulary migration asserted at
 * the end of this block.
 */
const byId = (id) => {
  const fixture = cases.cases.find((row) => row.id === id)
  assert.ok(fixture, `cases.json no longer carries ${id}, so a #269 regression is testing nothing`)
  return structuredClone(fixture.input)
}

/** The five situations of #269's table, on `concentration` directly. */
{
  const book = {
    holdings: [{ symbol: 'B', sector: 'financials', weight: 0.05 }],
    openProposals: [],
    caps: { accountPositionCap: 0.1, accountSectorCap: 0.25 },
  }

  // ① no ceiling stated → not applicable, and every other axis still runs.
  const noCap = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: book.holdings,
    openProposals: [],
    caps: { accountPositionCap: 0.1 },
  })
  assert.equal(noCap.data.sectorLimitState, 'not-applicable')
  assert.equal(noCap.data.withinLimits, true, 'an absent sector ceiling stopped a proposal it never constrained')
  assert.ok(codesOf(noCap.diagnostics).includes('sector_cap_not_applicable'), 'the code has to say not-applicable rather than merely not-stated')
  assert.ok(!codesOf(noCap.diagnostics).includes('sector_exposure_unevaluated'))

  // ② stated and every classification present → the axis is judged, both ways.
  const withinSector = concentration({
    proposed: { symbol: 'A', sector: 'financials', weight: 0.03 },
    holdings: book.holdings,
    openProposals: [],
    caps: book.caps,
  })
  assert.equal(withinSector.data.sectorLimitState, 'evaluated')
  assert.equal(withinSector.data.sectorExposure, 0.05)
  assert.equal(withinSector.data.withinLimits, true)
  const overSector = concentration({
    proposed: { symbol: 'A', sector: 'financials', weight: 0.03 },
    holdings: [{ symbol: 'B', sector: 'financials', weight: 0.23 }],
    openProposals: [],
    caps: book.caps,
  })
  assert.equal(overSector.data.withinLimits, false)
  assert.equal(overSector.data.outcomeCode, 'risk_limit_exceeded')
  assert.ok(codesOf(overSector.diagnostics).includes('sector_limit_exceeded'))

  // ③ stated and the candidate carries no sector → the increase is withheld.
  const candidateUnclassified = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: book.holdings,
    openProposals: [],
    caps: book.caps,
  })
  assert.equal(candidateUnclassified.data.sectorLimitState, 'unevaluated')
  assert.equal(candidateUnclassified.data.withinLimits, null, 'a stated sector ceiling that could not be checked let an increase through')
  assert.equal(candidateUnclassified.data.outcomeCode, 'data_missing', 'an unformable sector total was filed as something other than an absence')
  assert.ok(codesOf(candidateUnclassified.diagnostics).includes('sector_exposure_unevaluated'))
  assert.ok(!codesOf(candidateUnclassified.diagnostics).includes('proposal_has_no_sector'), 'the warn that did not stop anything is gone')

  /**
   * ⛔ **③′ the hole #269 names by name: the candidate is classified and the *book*
   * is not.** A sector ceiling is measured over a total, and a total made of rows one
   * of which has no sector is not a total. A run that looked only at the candidate
   * would pass this, which is exactly why it is here.
   */
  const otherHoldingUnclassified = concentration({
    proposed: { symbol: 'A', sector: 'financials', weight: 0.03 },
    holdings: [
      { symbol: 'B', sector: 'financials', weight: 0.05 },
      { symbol: 'C', weight: 0.07 },
    ],
    openProposals: [],
    caps: book.caps,
  })
  assert.equal(otherHoldingUnclassified.data.withinLimits, null, 'the candidate named its sector and the book could not form one, and the increase went through anyway')
  assert.equal(otherHoldingUnclassified.data.outcomeCode, 'data_missing')
  assert.deepEqual(
    otherHoldingUnclassified.diagnostics.find((row) => row.code === 'sector_exposure_unevaluated')?.details.unclassifiedRows,
    ['C'],
    'the run has to name which row it could not classify',
  )
  // …and the same for an unapproved proposal, which is exposure about to exist.
  const otherProposalUnclassified = concentration({
    proposed: { symbol: 'A', sector: 'financials', weight: 0.03 },
    holdings: book.holdings,
    openProposals: [{ symbol: 'D', targetWeight: 0.04, strategy: 'catalyst-turnaround' }],
    caps: book.caps,
  })
  assert.equal(otherProposalUnclassified.data.withinLimits, null, 'an unclassified open proposal was left out of the sector total')

  // ⑤ a reduction, and the `weight: 0` question, are not withheld by the same gap.
  for (const [label, weight] of [['the question the sizing asks', 0], ['a reduction', -0.02]]) {
    const answer = concentration({
      proposed: { symbol: 'A', sector: 'financials', weight },
      holdings: [{ symbol: 'B', sector: 'financials', weight: 0.05 }, { symbol: 'C', weight: 0.07 }],
      openProposals: [],
      caps: book.caps,
    })
    assert.equal(answer.data.withinLimits, true, `${label} was withheld by a ceiling that only constrains additions`)
    const row = answer.diagnostics.find((entry) => entry.code === 'sector_exposure_unevaluated')
    assert.equal(row?.severity, 'warn', `${label} should still say the sector total could not be formed`)
    assert.equal(row?.details.increasesExposure, false)
  }
  ok('#269 ①②③⑤ — an unformable sector total withholds the increase, names the rows, and stops neither a reduction nor the sizing question')
}

/**
 * The same five situations end to end, because `concentration` returning `null` only
 * matters if `evaluateCase` refuses to call it permission.
 */
{
  // ③ through the whole ladder, from the one fixture that reaches a sized BUY.
  const buy = byId('financial-positive-reaches-buy')
  buy.mandate.caps.accountSectorCap = 0.25
  buy.book.holdings = [{ symbol: '999999', weight: 0.07, strategy: 'evidence-gated' }]
  const withheld = evaluateCase(buy)
  assert.equal(withheld.data.proposedAction, 'WAIT', 'a BUY went onto a book whose sector total nobody could form')
  assert.equal(withheld.data.outcomeCode, 'data_missing')
  assert.notEqual(withheld.data.outcomeCode, 'thesis_refuted', 'a missing classification was filed as a refuted thesis')
  assert.deepEqual(withheld.diagnostics.filter((row) => row.severity === 'blocked'), [], 'an absence was recorded as a refusal')
  assert.ok(codesOf(withheld.diagnostics).includes('sector_exposure_unevaluated'))

  // …and classifying that same row is the whole of the difference.
  const classified = structuredClone(buy)
  classified.book.holdings[0].sector = 'materials'
  const allowed = evaluateCase(classified)
  assert.equal(allowed.data.proposedAction, 'BUY', 'classifying the book was not enough to let the same proposal through')

  // ④ an existing position is still analysed and still reachable for a reduction.
  const rerated = byId('rerated-reaches-trim-review')
  rerated.mandate ??= {}
  rerated.mandate.caps ??= {}
  rerated.mandate.caps.accountSectorCap = 0.25
  if (Array.isArray(rerated.book?.holdings)) rerated.book.holdings = rerated.book.holdings.map(({ sector, ...rest }) => rest)
  const held = evaluateCase(rerated)
  assert.equal(held.data.case, 'rerated', 'a sector ceiling nobody could check changed the verdict about the company')
  assert.equal(held.data.proposedAction, 'RESIZE', 'a risk-reducing reduction was withheld by a limit that only constrains increases')

  // ⑤ the buy-path name already above its target — the other way a reduction is reached.
  const above = byId('financial-positive-reaches-buy')
  above.mandate.caps.accountSectorCap = 0.25
  above.book.holdings = [{ symbol: '000000', weight: 0.07, strategy: 'shareholder-rerating' }]
  const reduced = evaluateCase(above)
  assert.equal(reduced.data.proposedAction, 'RESIZE', 'a position above target with an unformable sector total could not be reduced')
  assert.equal(reduced.data.outcomeCode, 'position_above_target')
  ok('#269 ③④⑤ end to end — the increase waits as data_missing, the company keeps its verdict, and both reduction paths stay open')
}

/** ② the five issuer kinds, and what each may enter. */
{
  assert.deepEqual(
    Object.keys(ISSUER_KINDS).sort(),
    ['bank', 'insurance', 'non-financial', 'securities', 'unclassified'],
    'the five issuer kinds of #269 are not the five here',
  )
  assert.deepEqual(
    Object.entries(ISSUER_KINDS).filter(([, row]) => row.supported).map(([name]) => name).sort(),
    ['bank', 'non-financial'],
    'this change was scoped to keeping the bank and operating-company arithmetic and no more',
  )

  const insuranceInputs = { cet1: 0.128, policyTargetCet1: 0.125, riskWeightedAssets: 2e14, marketCap: 1.2e13 }

  /**
   * ⛔ **The hole, stated as its own assertion.** `financial` used to admit anything
   * financial to the bank arithmetic. An insurer handing in a CET1 is now refused
   * outright — and refused as *the run's* mistake, which is what `classify.mjs` reads
   * `bank_metric_out_of_sector` as.
   */
  const insurerWithCet1 = capitalHeadroom({ issuerKind: 'insurance', financial: insuranceInputs })
  assert.ok(codesOf(insurerWithCet1.diagnostics).includes('bank_metric_out_of_sector'), 'an insurer was let into the bank arithmetic because it was financial')
  assert.equal(insurerWithCet1.data.headroomRatio, undefined, 'a refused issuer kind still published a capital headroom')
  assert.equal(insurerWithCet1.data.adequate, null)

  for (const [kind, ratio] of [['insurance', 'K-ICS'], ['securities', 'NCR']]) {
    const answer = capitalHeadroom({ issuerKind: kind, classification: { basis: '사업보고서', consolidationBasis: 'consolidated' } })
    const row = answer.diagnostics.find((entry) => entry.code === 'capital_headroom_method_unsupported')
    assert.ok(row, `${kind} passed silently instead of being stated as unsupported`)
    assert.equal(row.severity, 'unevaluated', `${kind} was refused rather than left unevaluated — an unsupported method is not a finding about the company`)
    assert.equal(row.details.ratio, ratio, `${kind} has to name the ratio that would answer it`)
    assert.equal(answer.data.adequate, null, `${kind} produced a capital verdict from an arithmetic that does not exist here`)
    assert.equal(answer.data.returnHeadroomYield, null)
  }

  const conglomerate = capitalHeadroom({ issuerKind: 'unclassified' })
  assert.ok(codesOf(conglomerate.diagnostics).includes('issuer_kind_unclassified'))
  assert.equal(conglomerate.data.adequate, null)

  const legacy = capitalHeadroom({ issuerKind: 'financial', financial: insuranceInputs })
  assert.ok(codesOf(legacy.diagnostics).includes('issuer_kind_not_specific'), '"financial" still selected the bank arithmetic')
  assert.equal(legacy.data.adequate, null)
  assert.equal(legacy.data.headroomRatio, undefined)

  const bank = capitalHeadroom({
    issuerKind: 'bank',
    classification: { basis: '2026 사업보고서 Ⅱ. 사업의 내용', consolidationBasis: 'consolidated' },
    financial: { ...insuranceInputs, regulatoryMinimumCet1: 0.105 },
  })
  assert.equal(bank.data.adequate, true, 'the bank arithmetic that already worked stopped working')
  assert.equal(bank.data.issuerKind, 'bank')
  assert.deepEqual(bank.data.classification, { basis: '2026 사업보고서 Ⅱ. 사업의 내용', consolidationBasis: 'consolidated' }, 'the classification receipts have to travel in the answer')
  assert.ok(!codesOf(bank.diagnostics).includes('issuer_classification_basis_not_stated'))
  assert.ok(!codesOf(bank.diagnostics).includes('capital_basis_not_stated'))

  const unsourced = capitalHeadroom({ issuerKind: 'bank', financial: { ...insuranceInputs, regulatoryMinimumCet1: 0.105 } })
  assert.ok(codesOf(unsourced.diagnostics).includes('issuer_classification_basis_not_stated'), 'the kind was asserted with no document behind it and nothing said so')
  assert.ok(codesOf(unsourced.diagnostics).includes('capital_basis_not_stated'), 'a consolidated group CET1 and a bank standalone one were left indistinguishable')
  assert.equal(unsourced.data.adequate, true, 'an absent receipt was turned into a refusal of the company')

  // The industrial arithmetic keeps its own refusal, now against every financial kind.
  const industrialWithBankRatio = capitalHeadroom({ issuerKind: 'non-financial', financial: insuranceInputs })
  assert.ok(codesOf(industrialWithBankRatio.diagnostics).includes('bank_metric_out_of_sector'))
  const brokerWithLeverage = capitalHeadroom({ issuerKind: 'securities', nonFinancial: { netDebt: 1e12, ebitda: 2e11 } })
  assert.ok(codesOf(brokerWithLeverage.diagnostics).includes('industrial_metric_out_of_sector'))
  ok('#269 ② — five issuer kinds; insurance, securities and unclassified are explicitly unevaluated, and a CET1 on an insurer is refused rather than divided')
}

/** An unsupported kind end to end is a wait, and never a verdict on the capital. */
{
  const insurer = byId('financial-positive-reaches-buy')
  insurer.sectorKind = 'insurance'
  delete insurer.financial
  const answer = evaluateCase(insurer)
  assert.notEqual(answer.data.proposedAction, 'BUY', 'an issuer whose capital arithmetic does not exist here reached a sized BUY')
  assert.notEqual(answer.data.case, 'capital-inadequate', 'an unimplemented method was filed as an inadequate balance sheet')
  assert.notEqual(answer.data.outcomeCode, 'thesis_refuted')
  assert.equal(answer.data.returnHeadroomYield, null)
  assert.ok(codesOf(answer.diagnostics).includes('capital_headroom_method_unsupported'))

  const legacyWord = byId('financial-positive-reaches-buy')
  legacyWord.sectorKind = 'financial'
  const stale = evaluateCase(legacyWord)
  assert.notEqual(stale.data.proposedAction, 'BUY', 'the retired word still reached a BUY through the bank arithmetic')
  assert.ok(codesOf(stale.diagnostics).includes('issuer_kind_not_specific'))

  for (const fixture of cases.cases) {
    assert.notEqual(fixture.input.sectorKind, 'financial', `cases/${fixture.id} still carries the retired issuer kind`)
    assert.notEqual(fixture.input.issuerKind, 'financial', `cases/${fixture.id} still carries the retired issuer kind`)
  }
  ok('#269 ② end to end — an unsupported or unspecific issuer kind waits, is never a capital verdict, and no fixture carries the retired word')
}

/**
 * ── The boundary regressions from the review of `d36e32b` ──────────────────
 *
 * Four P1 findings, and three of them were one defect: an input that was **absent**
 * or **declared and never read** behaved as an input that had passed. A missing book
 * became two empty lists, which is the most permissive account state there is; a
 * missing cap became no constraint; `accountGrossCap` sat in the input contract and in
 * nobody's arithmetic; and a staged add proceeded with none of its re-check numbers.
 * The fourth was one field carrying two meanings — a target total and an increment.
 *
 * ⚠️ **These mutate a deep copy and never the fixture files**, which is the property
 * the reviewer's own reproduction script had: the cases that pass above keep passing
 * for the reasons they already passed for, and these say what has to keep failing.
 */
{
  const bases = { cases: cases.cases, staged: staged.cases }
  const baseInput = (reference) => {
    const [, list, index] = /^(\w+)\[(\d+)\]$/.exec(reference)
    return structuredClone(bases[list][Number(index)].input)
  }
  const walk = (object, path) => {
    const parts = path.split('.')
    const last = parts.pop()
    let node = object
    for (const part of parts) node = node?.[part]
    return { node, last }
  }

  for (const fixture of boundaries.cases) {
    const input = baseInput(fixture.base)
    for (const mutation of fixture.mutations) {
      const { node, last } = walk(input, mutation.path)
      assert.ok(node !== undefined && node !== null, `boundaries/${fixture.id}: the path ${mutation.path} is not in the base fixture, so this regression is testing nothing`)
      if (mutation.op === 'delete') {
        assert.ok(last in node, `boundaries/${fixture.id}: ${mutation.path} is already absent from the base fixture`)
        delete node[last]
      } else {
        node[last] = structuredClone(mutation.value)
      }
    }

    const where = `boundaries/${fixture.id}`
    const expect = fixture.expect
    const answer =
      fixture.kind === 'stagedIncrement'
        ? stagedIncrement({ ...input, plan: staged.plan })
        : evaluateCase(input)

    for (const [key, value] of Object.entries(expect)) {
      if (['diagnosticCodes', 'projectionEqualsTarget'].includes(key)) continue
      assert.equal(answer.data[key], value, `${where}: ${key}`)
    }
    for (const code of expect.diagnosticCodes ?? []) {
      assert.ok(codesOf(answer.diagnostics).includes(code), `${where}: expected diagnostic ${code}, got ${codesOf(answer.diagnostics).join(', ')}`)
    }
    if (expect.projectionEqualsTarget === true) {
      assert.equal(
        answer.data.projectedExposure,
        answer.data.targetTotalWeight,
        `${where}: the increment was added on top of the target instead of taking the position to it — this is finding ③ exactly`,
      )
    }
    /**
     * ⛔ The property behind all four findings, asserted once per boundary case
     * regardless of what it expected: nothing proposes a purchase unless the account
     * was read and every declared limit adjudicated it.
     */
    if (answer.data.proposedAction === 'BUY' || answer.data.action === 'propose') {
      assert.ok(
        !answer.diagnostics.some((row) => row.severity === 'unevaluated'),
        `${where}: something was proposed while ${codesOf(answer.diagnostics.filter((row) => row.severity === 'unevaluated')).join(', ')} was unevaluated`,
      )
    }
    ok(`${where} — finding ${fixture.finding}: ${answer.data.proposedAction ?? answer.data.action}${answer.data.outcomeCode ? ` / ${answer.data.outcomeCode}` : ''}`)
  }
}

/**
 * The same rule stated over the whole corpus rather than case by case, because it is
 * the invariant and not a property of any one input.
 */
{
  const everyInput = [
    ...cases.cases.map((fixture) => fixture.input),
    ...boundaries.cases.filter((fixture) => fixture.kind !== 'stagedIncrement').map((fixture) => {
      const [, list, index] = /^(\w+)\[(\d+)\]$/.exec(fixture.base)
      const input = structuredClone({ cases: cases.cases, staged: staged.cases }[list][Number(index)].input)
      for (const mutation of fixture.mutations) {
        const parts = mutation.path.split('.')
        const last = parts.pop()
        let node = input
        for (const part of parts) node = node?.[part]
        if (mutation.op === 'delete') delete node[last]
        else node[last] = structuredClone(mutation.value)
      }
      return input
    }),
  ]
  for (const input of everyInput) {
    const answer = evaluateCase(input)
    if (answer.data.proposedAction !== 'BUY') continue
    assert.ok(Array.isArray(input.book?.holdings) && Array.isArray(input.book?.openProposals), 'a BUY was returned for a book that was never read')
    assert.equal(
      answer.data.projectedExposure,
      answer.data.targetTotalWeight,
      'a BUY whose projected exposure is not its target weight has confused the total with the increment',
    )
    assert.ok(
      !answer.diagnostics.some((row) => row.severity === 'unevaluated'),
      'a BUY was returned with an unevaluated input',
    )
  }
  ok(`across all ${everyInput.length} inputs, every BUY read the account, adjudicated every limit, and ends at its target weight`)
}

/**
 * The rest of the defect class, found by reading this package for every place a limit
 * or a re-check value was optional-with-a-default or declared-and-unread.
 */
{
  const industrial = capitalHeadroom({
    issuerKind: 'non-financial',
    nonFinancial: { operatingCashFlow: 300000000000, maintenanceCapex: 60000000000, plannedReturnCash: 200000000000, marketCap: 3000000000000 },
  })
  assert.equal(industrial.data.adequate, null, 'an unstated committed investment was treated as zero, which is the reading that makes coverage look best')
  assert.ok(codesOf(industrial.diagnostics).includes('required_investment_not_stated'))

  const noMinimum = capitalHeadroom({
    issuerKind: 'bank',
    financial: { cet1: 0.128, policyTargetCet1: 0.125, riskWeightedAssets: 200000000000000, marketCap: 12000000000000 },
  })
  assert.ok(codesOf(noMinimum.diagnostics).includes('regulatory_minimum_not_stated'), 'an unstated regulatory minimum passed silently')
  assert.equal(noMinimum.data.adequate, true, 'the policy-target test is the tighter one and still stands on its own')
  ok('an absent committed investment, regulatory minimum, credit-cost guidance or leverage ceiling is reported rather than skipped')
}

/**
 * ── the package's own documents, where they make a claim this file can check ─
 */
{
  assert.equal(manifest.id, 'shareholder-rerating')
  assert.equal(manifest.publisher, 'aumos')
  assert.equal(manifest.prompt, './PROMPT.md')
  assert.equal(manifest.provenance.commit, '1fa18c595baa742f7323366a3c220fec5c6535a7')
  assert.equal(manifest.provenance.licenseHolder, 'Lee Sang Min')
  const notice = await readFile(new URL('../managers/shareholder-rerating/NOTICE.md', import.meta.url), 'utf8')
  assert.ok(notice.includes(manifest.provenance.licenseHolder), 'NOTICE.md must carry the licence holder verbatim')
  assert.ok(notice.includes(manifest.provenance.commit), 'NOTICE.md must name the commit this port was taken from')
  const kinds = manifest.capabilities.map((row) => row.kind)
  assert.equal(new Set(kinds).size, kinds.length, 'a capability is requested twice, so one of the two reasons is not the one shown')
  for (const row of manifest.capabilities) {
    assert.ok(typeof row.reason === 'string' && row.reason.length > 20, `capability ${row.kind} has no reason an investor can read`)
  }
  assert.ok(!kinds.some((kind) => String(kind).includes('write') && kind.startsWith('broker')), 'there is no broker:write')
  ok('the manifest, the notice and the capability reasons agree with what this package claims')
}

/**
 * The prompt has to name the outputs a completed run owes and the four outcome codes,
 * because the deterministic half checks them and the prose half is what produces them.
 */
{
  const prompt = await readFile(new URL('../managers/shareholder-rerating/PROMPT.md', import.meta.url), 'utf8')
  for (const code of ['data_missing', 'research_incomplete', 'thesis_refuted', 'risk_limit_exceeded']) {
    assert.ok(prompt.includes(code), `PROMPT.md never mentions ${code}, and the run is what has to produce it`)
  }
  assert.ok(prompt.includes('The protocol is not here.'), 'PROMPT.md must say where the wire format comes from')
  for (const name of REQUIRED_OUTPUTS) {
    assert.ok(prompt.includes(name), `PROMPT.md never names the required output ${name}`)
  }
  ok(`PROMPT.md names all ${REQUIRED_OUTPUTS.length} required outputs and the four outcome codes`)
}

{
  for (const [label, route] of Object.entries(ROUTES)) {
    assert.ok(typeof route === 'string' && route.length > 0, `${label} has no route`)
  }
  assert.equal(THRESHOLDS.executionPaceFloor, 0.5)
  assert.equal(THRESHOLDS.executionObservableElapsed, 0.25)
  assert.equal(THRESHOLDS.relativeYieldTrap, 2)
  assert.equal(THRESHOLDS.nonRecurringShare, 0.3)
  ok('every case label has a route, and the four published thresholds are the four in the pull request')
}

console.log(`\nshareholder-rerating ok — ${checked} check(s)`)
