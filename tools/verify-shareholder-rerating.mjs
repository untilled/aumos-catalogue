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
  targetWeight,
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

/**
 * ⚠️ **Both fixture files, since `untilled/aumos#830`.** The four codes have to stay
 * four things and each has to be reached by a committed fixture; which *file* the
 * fixture lives in was never the claim. `risk_limit_exceeded` used to be reached in
 * `cases.json` by an account carrying 9% of a name against an 8% ceiling with none of
 * it this desk's — and #830 is the finding that a run adding nothing is not a run a
 * ceiling withholds, so that row now declines as «the account is above target and the
 * excess is not mine to reduce». The code is still reached, by the two `boundaries.json`
 * rows where the ceilings genuinely leave a purchase no room at all.
 */
const outcomeCodes = new Set(
  [...cases.cases, ...boundaries.cases.filter((fixture) => fixture.kind !== 'stagedIncrement')]
    .map((fixture) => fixture.expect.outcomeCode)
    .filter(Boolean),
)
for (const code of ['data_missing', 'research_incomplete', 'thesis_refuted', 'risk_limit_exceeded']) {
  assert.ok(outcomeCodes.has(code), `${code} is never reached by any committed fixture, so nothing shows it stays distinct from the other three (#254)`)
}
ok('data_missing, research_incomplete, thesis_refuted and risk_limit_exceeded are each reached by a fixture')

/**
 * ── ⑵b the reference case, replayed on as-of material (#256) ──────────────
 *
 * `cases.json` is illustrative. `reference-replay.json` is not: every field in it
 * is transcribed from the investor's private record at a fixed commit, dated on or
 * before 2026-05-25, with everything later — and the whole thesis file, which did
 * not exist until 2026-06-28 — listed as excluded rather than mixed in. Inputs the
 * record does not carry are `null` and named as `data_missing`; none was estimated,
 * and no exit line was read as a fair value.
 *
 * ⛔ A green tick here does **not** re-audit the investor's reported result, which
 * #256 says was never audited and is not a validated edge. It says the library, fed
 * only what was knowable on the day, answers what the fixture records. The answer is
 * a WAIT, it was not tuned to be one, and nothing was tuned to make it a BUY either.
 */
const replay = await read('reference-replay.json')

assert.ok(['eligible', 'ineligible'].includes(replay.replayEligibility), 'reference-replay.json: replayEligibility is eligible or ineligible')
assert.ok(Array.isArray(replay.excluded) && replay.excluded.length > 0, 'reference-replay.json: a replay with nothing excluded has not been checked for contamination')
for (const row of replay.excluded) {
  assert.ok(['future_information', 'post_hoc_revision', 'data_missing'].includes(row.reason), `reference-replay.json: ${row.item} carries an unknown exclusion reason ${row.reason}`)
}
ok(`reference-replay — ${replay.replayEligibility}, ${replay.excluded.length} excluded item(s), each with a reason`)

for (const fixture of replay.cases) {
  const answer = evaluateCase(fixture.input)
  const where = `reference-replay/${fixture.id}`
  for (const key of ['case', 'route', 'outcomeCode', 'proposedAction']) {
    assert.equal(answer.data[key], fixture.expect[key], `${where}: ${key}`)
  }
  for (const code of fixture.expect.diagnosticCodes ?? []) {
    assert.ok(codesOf(answer.diagnostics).includes(code), `${where}: expected diagnostic ${code}, got ${codesOf(answer.diagnostics).join(', ')}`)
  }
  /**
   * ⛔ #254, and the reason the contamination controls are here. An input nobody
   * could read says nothing about the thesis; supplying it afterwards — a later
   * account state, or a capital ratio read off the wrong line — must not turn the
   * run into a refutation either.
   */
  if (fixture.expect.noRefutation === true) {
    assert.notEqual(answer.data.outcomeCode, 'thesis_refuted', `${where}: an absent or a late-supplied input was filed as a refuted thesis`)
    assert.notEqual(answer.data.case, 'capital-inadequate', `${where}: an unreadable capital position was filed as an inadequate one`)
  }
  ok(`${where} — ${answer.data.case} → ${answer.data.route} → ${answer.data.proposedAction}`)
}

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
 * ── #830: a ceiling withholds an addition, and this desk's reduction is not one ─
 *
 * ⛔ **The first defect in this series that removed a *reduction* rather than
 * mis-sizing one**, and `untilled/aumos#782` names it: *nothing here can turn a
 * real reduction into a no-op.*
 *
 * `evaluateCase` folds concentration twice. The first pass proposes nothing —
 * `weight: 0` — and asks what the account permits this name to **be**; that
 * ceiling goes into the sizing, and the sizing minus what the account already
 * carries is what decides between a purchase and a reduction. Until #830 the
 * three limit gates in that pass raised `blocked` on the *state of the book*
 * rather than on anything the proposal asked for, so `withinLimits` came back
 * `false` and `index.mjs` turned the whole case into a `wait` **before** the
 * reduction branch was ever reached.
 *
 * Measured through the real host at `e571a88`: this desk holding 6% of a name
 * under a 10% cap went `sell:6` — and stopped going anywhere the moment another
 * manager sealed a BUY **nobody approved**, `funding: unfunded`, zero
 * reservations, zero orders. The threshold was `projected > cap` exactly: a
 * pending total of 0.1 kept the trim and 0.1001 deleted it. The diagnostic said
 * `proposed: 0` about itself while doing it.
 *
 * ⚠️ **And it fires with nobody else on the book at all.** A desk 0.1pp over its
 * own ceiling could not reduce itself: the projection that exceeded the cap was
 * its own holding, and the answer to *«you are over the limit»* was to withhold
 * the only order that fixes it.
 *
 * ⚠️ **The sentence this closes is one paragraph below the gate, in the same
 * file.** `sector_exposure_unevaluated` has carried it since #269 — *«Only an
 * addition is withheld when a stated ceiling cannot be evaluated»* — and
 * `index.mjs`'s trim branch says the other half — *«an excess made of somebody
 * else's unapproved proposal is theirs to withdraw»*. Neither was reachable,
 * because the gate answered first.
 *
 * ⛔ **The ceiling itself does not move, and `untilled/aumos#813` is why.** A
 * limit has to hold in every state the account passes through, so an unfilled
 * buy counts before it fills — and it still does, on both of the paths that ask
 * to *add*: `maxTotalWeightForName` bounds the sizing whatever the book is
 * doing, and the second fold, whose `weight` is a real increment, blocks exactly
 * as it did. What changed is the direction: a run that adds nothing is told the
 * account is over its ceiling and is not prevented from doing the one thing that
 * helps.
 */
{
  const MINE = 'shareholder-rerating'
  const buyPath = (() => {
    const fixture = cases.cases.find((row) => row.id === 'financial-positive-reaches-buy')
    assert.ok(fixture, 'cases.json no longer carries the sized BUY case, so this regression is testing nothing')
    return fixture.input
  })()
  const SYMBOL = buyPath.symbol
  const run = (holdings, openProposals = []) =>
    evaluateCase({ ...structuredClone(buyPath), strategy: MINE, book: { holdings, openProposals } })
  const holding = (weight, strategy) => ({ symbol: SYMBOL, sector: 'financials', weight, ...(strategy === undefined ? {} : { strategy }) })
  const proposal = (targetWeight, strategy) => ({ symbol: SYMBOL, sector: 'financials', targetWeight, strategy })

  /**
   * The reference: 6% wholly this desk's, nobody else on the book, comfortably
   * under the cap. This is the order #830 is about — every row below is this row
   * with somebody else's paper added to it.
   */
  const alone = run([holding(0.06, MINE)]).data
  assert.equal(alone.route, 'trim-or-exit-review')
  assert.equal(alone.proposedAction, 'RESIZE')
  assert.ok(alone.hostTargetWeight !== null && alone.hostTargetWeight < 0.06, 'the reference row is not a reduction, so nothing below measures one')

  /**
   * ⛔ **Somebody else's unapproved proposal deleted it.** `0.1001` is the
   * issue's measured threshold — one basis point over a 10% cap — and every
   * larger pending total is the same door.
   */
  for (const pendingTotal of [0.1001, 0.12, 0.2, 0.5]) {
    const answer = run([holding(0.06, MINE)], [proposal(pendingTotal, 'catalyst-turnaround')])
    assert.equal(answer.data.route, alone.route, `pending ${pendingTotal}: an unapproved proposal moved this desk off the reduction route`)
    assert.equal(answer.data.proposedAction, 'RESIZE', `pending ${pendingTotal}: a real reduction became a no-op`)
    assert.equal(answer.data.hostTargetWeight, alone.hostTargetWeight, `pending ${pendingTotal}: somebody else's unfilled proposal sized this desk's order`)
    assert.equal(answer.data.ownHeldWeight, 0.06)
    assert.equal(answer.data.otherHeldWeight, 0, `pending ${pendingTotal}: a pending total was carried as a position`)
  }
  ok('#830 — a reduction this desk makes out of its own holding survives another desk\'s unapproved proposal, whatever it asks for')

  /**
   * ⚠️ **The standalone half, which has nothing to do with other managers.** One
   * holding, this desk's, over its own ceiling.
   */
  for (const own of [0.101, 0.12, 0.2]) {
    const answer = run([holding(own, MINE)]).data
    assert.equal(answer.route, 'trim-or-exit-review', `own ${own}: a desk over its own ceiling could not reach the reduction route`)
    assert.equal(answer.proposedAction, 'RESIZE', `own ${own}: a desk over its own ceiling could not reduce itself`)
    assert.equal(answer.hostTargetWeight, alone.hostTargetWeight, `own ${own}: the reduction went somewhere other than the sized target`)
    assert.ok(answer.hostTargetWeight < own, `own ${own}: the «reduction» did not reduce`)
  }
  ok('#830 — a desk over its own single-name ceiling reduces itself, which is the standalone half and has nothing to do with other managers')

  /**
   * ⛔ **The ceiling still withholds an addition**, which is `#813` and the whole
   * reason the gate exists. A book already at the cap with nothing of this
   * desk's in it proposes no purchase, and one already over it proposes none
   * either — the arithmetic that stops it is the increment, and it stopped it
   * before this fix and stops it now.
   */
  for (const [label, holdings, proposals] of [
    ['pending at the cap', [], [proposal(0.1, 'catalyst-turnaround')]],
    ['pending over the cap', [], [proposal(0.2, 'catalyst-turnaround')]],
    ['another desk holds the cap', [holding(0.1, 'catalyst-turnaround')], []],
  ]) {
    const answer = run(holdings, proposals).data
    assert.notEqual(answer.proposedAction, 'BUY', `${label}: this run bought into a name the account has no room for`)
    assert.equal(answer.hostTargetWeight, null, `${label}: a weight left on a run that proposes nothing`)
  }

  /**
   * ⛔ **And a fold that is handed a real addition blocks exactly as before.**
   * This is the gate's teeth: `weight` above the tolerance is a purchase, and a
   * purchase over a stated ceiling is withheld whatever the book already holds.
   */
  const addOverCap = concentration({
    proposed: { symbol: SYMBOL, sector: 'financials', weight: 0.05 },
    holdings: [holding(0.06, MINE)],
    openProposals: [],
    caps: { accountPositionCap: 0.1 },
    strategy: MINE,
  })
  assert.equal(addOverCap.data.withinLimits, false, 'an addition over a stated single-name ceiling was permitted')
  assert.ok(addOverCap.diagnostics.some((row) => row.code === 'concentration_limit_exceeded' && row.severity === 'blocked'))
  ok('#813 — an addition is still measured against holdings and open proposals together, and a full book still buys nothing')

  /**
   * ⚠️ **The same three axes, and each of them separately.** #830 was found on
   * the single-name gate; the sector and gross gates are the same sentence with
   * a different total behind it, and a fix that moved one of the three would
   * leave the defect reachable through the other two.
   */
  const axes = [
    ['accountPositionCap', { accountPositionCap: 0.1 }, 'concentration_limit_exceeded'],
    ['accountSectorCap', { accountPositionCap: 0.9, accountSectorCap: 0.1 }, 'sector_limit_exceeded'],
    ['accountGrossCap', { accountPositionCap: 0.9, accountGrossCap: 0.1 }, 'gross_limit_exceeded'],
  ]
  for (const [label, caps, code] of axes) {
    const probe = (weight) =>
      concentration({
        proposed: { symbol: SYMBOL, sector: 'financials', weight },
        holdings: [holding(0.2, MINE)],
        openProposals: [],
        caps,
        strategy: MINE,
      })
    const asked = probe(0)
    const said = asked.diagnostics.find((row) => row.code === code)
    assert.ok(said, `${label}: the axis said nothing about a book that is over it`)
    assert.equal(said.severity, 'warn', `${label}: a run that adds nothing was withheld by a ceiling it did not approach`)
    assert.equal(said.details.increasesExposure, false, `${label}: the diagnostic does not say which direction it judged`)
    assert.equal(asked.data.withinLimits, true, `${label}: «what may this name be?» came back as a refusal`)

    /** A reduction is not an addition either. */
    const reducing = probe(-0.05)
    assert.equal(reducing.data.withinLimits, true, `${label}: a reduction was withheld by a ceiling it moves away from`)

    /** And the addition is still withheld. */
    const adding = probe(0.05)
    const blockedRow = adding.diagnostics.find((row) => row.code === code)
    assert.ok(blockedRow && blockedRow.severity === 'blocked', `${label}: an addition over the ceiling lost its teeth`)
    assert.equal(blockedRow.details.increasesExposure, true, `${label}: the diagnostic does not say which direction it judged`)
    assert.equal(adding.data.withinLimits, false, `${label}: an addition over a declared ceiling was permitted`)
  }

  ok('#830 — all three declared axes withhold an addition and none of them withholds a reduction')
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

/**
 * ── #833: a ceiling made of other names sizes no sale ──────────────────────
 *
 * ⛔ **The second door of #830, and the measurement says it is the worse one.**
 * #830 closed the three *gates*; this is the *fold* underneath them. Every
 * declared axis is folded into `maxTotalWeightForName`, the sizing is bounded by
 * it, and `index.mjs` subtracts what the account carries — so as another desk's
 * names fill a sector or the whole book, the ceiling on **this** name falls, and
 * a reduction sized against it grows. Measured through the real host on a 6%
 * position wholly this desk's, its own thesis intact, `accountSectorCap` 0.25,
 * this package sizing it at `0.05333333`:
 *
 *     other names in the sector   ceiling   the order          multiple
 *     0     / 0.19                0.053     sell:6              1.0×
 *     0.21                        0.04      sell:20             3.0×
 *     0.24                        0.01      sell:50             7.5×   (83% of it)
 *     0.245                       0.005     —                   8.2×
 *     0.2451 and above            —         no order at all     deleted
 *
 * ⛔ **And an open proposal nobody approved produced the same number as a
 * holding**, which is the mirror of what `aumos-catalogue#281` closed in
 * `fundamental-mean-reversion` and `#284` closed in this package's gates.
 *
 * ── The judgement, because the arithmetic could not make it ─────────────────
 *
 * ⛔ **A residual is not an allocation.** A sector ceiling states no division of
 * itself between the names under it, so reading *«the sector has 0.01 left»* as
 * *«this position must become 0.01»* assigns the whole adjustment to whichever
 * name was evaluated last — and to a desk that may not be able to reduce a
 * single share of what filled the bucket. An arithmetic whose answer depends on
 * evaluation order has not made a decision.
 *
 * ⚠️ **So the fix is not the `0` boundary the issue framed, it is the axis.**
 * Stopping only at *«the ceiling derived 0»* would have left the 3.0× and the
 * 7.5× rows exactly where the host measured them. What changed is which
 * ceilings may size a sale: the ones that name **this position** — the
 * single-name caps and the risk arithmetic — and never the account's leftover
 * room after other names. That is this package's own sentence from #269 and
 * #830, *a ceiling constrains additions rather than reductions*, applied to the
 * last place it was not: the fold.
 *
 * ⛔ **`untilled/aumos#813` does not move**, and the entry rows below are the
 * proof: an addition is still measured against holdings and open proposals
 * together, and a full bucket still buys nothing.
 */
{
  const MINE = 'shareholder-rerating'
  const OTHER = 'catalyst-turnaround'
  const buyPath = (() => {
    const fixture = cases.cases.find((row) => row.id === 'financial-positive-reaches-buy')
    assert.ok(fixture, 'cases.json no longer carries the sized BUY case, so this regression is testing nothing')
    return fixture.input
  })()
  const SYMBOL = buyPath.symbol
  /** The size this package's arithmetic gives this thesis, with no book in the way. */
  const SIZED = 0.05333333
  const SECTOR_CAPS = { accountPositionCap: 0.1, accountSectorCap: 0.25 }
  const GROSS_CAPS = { accountPositionCap: 0.1, accountGrossCap: 0.5 }

  /**
   * ⚠️ **The bucket is filled by a *different name*, which is the whole point.**
   * Nothing here touches this desk's position: the sector and the gross totals
   * move because somebody else owns something else.
   */
  const bucket = (weight, kind, axis) => {
    if (weight === 0) return { holdings: [], openProposals: [] }
    const sector = axis === 'sector' ? 'financials' : 'industrials'
    return kind === 'pending'
      ? { holdings: [], openProposals: [{ symbol: 'OTHER1', sector, targetWeight: weight, strategy: OTHER, decisionId: 'dec_1' }] }
      : { holdings: [{ symbol: 'OTHER1', sector, weight, strategy: OTHER }], openProposals: [] }
  }
  const run = ({ own = 0.06, ownStrategy = MINE, weight, kind, axis }) => {
    const rest = bucket(weight, kind, axis)
    const holdings = own === 0 ? rest.holdings : [{ symbol: SYMBOL, sector: 'financials', weight: own, ...(ownStrategy === undefined ? {} : { strategy: ownStrategy }) }, ...rest.holdings]
    return evaluateCase({
      ...structuredClone(buyPath),
      strategy: MINE,
      mandate: { ...structuredClone(buyPath.mandate), caps: axis === 'sector' ? SECTOR_CAPS : GROSS_CAPS },
      book: { holdings, openProposals: rest.openProposals },
    })
  }

  /**
   * ⛔ **The four axes of this regression, and each of them separately.** Others'
   * **holdings** and others' **open proposals** are one axis (a proposal nobody
   * approved is not a position for an order); the **sector** and **gross**
   * ceilings are the other (a fix that moved one leaves the defect reachable
   * through the twin, which is how #830 nearly shipped half-fixed).
   *
   * ⚠️ **And the sweep is a sweep.** The host measured five points on the ramp
   * and the threshold that deletes the order sits at `cap − minimumExecutable`;
   * a single probe anywhere on it would have called this closed while three of
   * the five rows were still wrong.
   */
  const RAMP = {
    /** `0.1967` is `cap − sized`, where the remainder first bites; every row above it used to grow the sale. */
    sector: [0, 0.19, 0.1967, 0.2, 0.21, 0.24, 0.245, 0.2451, 0.25, 0.3, 0.5],
    gross: [0, 0.44, 0.4467, 0.45, 0.46, 0.49, 0.495, 0.4951, 0.5, 0.6, 0.8],
  }
  for (const axis of ['sector', 'gross']) {
    for (const weight of RAMP[axis]) {
      for (const kind of ['held', 'pending']) {
        const answer = run({ weight, kind, axis }).data
        const where = `${axis}/${kind}/${weight}`
        assert.equal(answer.route, 'trim-or-exit-review', `${where}: other names in the bucket moved this desk off the reduction route`)
        assert.equal(answer.proposedAction, 'RESIZE', `${where}: a real reduction became a no-op because somebody else filled the bucket`)
        assert.equal(answer.ownHeldWeight, 0.06, `${where}: this desk's own holding moved`)
        assert.equal(answer.otherHeldWeight, 0, `${where}: another name was carried as part of this position`)
        assert.equal(
          answer.hostTargetWeight,
          SIZED,
          `${where}: the account's leftover room after other names sized this desk's sale`,
        )
        assert.ok(answer.hostTargetWeight < 0.06, `${where}: the «reduction» did not reduce`)
      }
    }
  }
  ok('#833 — a reduction is sized by the ceilings that name this position, on both bucket axes and whether the bucket is held or merely proposed')

  /**
   * ⛔ **Others' holdings and others' unapproved proposals answer identically,
   * and that is now true because neither reaches the number.** Before #833 they
   * were identical because both reached it.
   */
  for (const axis of ['sector', 'gross']) {
    for (const weight of RAMP[axis]) {
      const held = run({ weight, kind: 'held', axis }).data
      const pending = run({ weight, kind: 'pending', axis }).data
      assert.equal(pending.hostTargetWeight, held.hostTargetWeight, `${axis}/${weight}: a proposal nobody approved sized this desk's order differently from a holding`)
      assert.equal(pending.otherHeldWeight, 0, `${axis}/${weight}: a pending total was carried as a position`)
    }
  }
  ok('#833 — an unapproved proposal in another name neither creates a reduction nor enlarges one')

  /**
   * ⚠️ **What was withheld is on the page.** `untilled/aumos#782` is only
   * checkable if the order this fix deletes is reported beside the one that
   * leaves — the same rule `aumos-catalogue#281` wrote as
   * `hostTargetWeightIfPendingFolded`.
   */
  {
    const CODE = 'reduction_is_not_sized_by_the_accounts_remaining_room'
    const diverging = run({ weight: 0.24, kind: 'held', axis: 'sector' })
    const said = diverging.diagnostics.find((row) => row.code === CODE)
    assert.ok(said, 'nothing said that the reduction was measured against something other than the account\'s remaining room')
    assert.equal(said.details.reduceTargetTotalWeight, SIZED)
    assert.equal(said.details.entryTargetTotalWeight, 0.01)
    assert.equal(said.details.maxTotalWeightBinding, 'accountSectorCap')
    assert.equal(said.details.reductionNameLimitBinding, 'accountPositionCap')
    assert.equal(said.details.hostTargetWeight, SIZED)
    assert.equal(said.details.hostTargetWeightIfRoomFolded, 0.01, 'the order this fix withholds is not measurable, so the control is a restatement')

    /** ⛔ **Silent when the two folds agree**, which is every ordinary account. */
    for (const [label, weight] of [['an empty bucket', 0], ['a bucket with room to spare', 0.19]]) {
      assert.ok(
        !codesOf(run({ weight, kind: 'held', axis: 'sector' }).diagnostics).includes(CODE),
        `${label}: a finding fired on a run where the two folds are one number`,
      )
    }

    /** ⚠️ **And the account's excess is still named**, by the axis it belongs to. */
    for (const [axis, weight, code] of [['sector', 0.3, 'sector_limit_exceeded'], ['gross', 0.6, 'gross_limit_exceeded']]) {
      const codes = codesOf(run({ weight, kind: 'held', axis }).diagnostics)
      assert.ok(codes.includes(code), `${axis}: the book really is over its ceiling and nothing said so`)
    }
  }
  ok('#833 — the order the account\'s leftover room would have sent is reported beside the one that leaves, and the excess is still named')

  /**
   * ⛔ **#813, unmoved.** The entry direction reads every declared axis and folds
   * an unapproved proposal into it, so a full bucket buys nothing — and the rows
   * that still had room buy exactly what the room allows.
   */
  for (const axis of ['sector', 'gross']) {
    const full = axis === 'sector' ? [0.25, 0.3, 0.5] : [0.5, 0.6, 0.8]
    const room = axis === 'sector' ? [[0.21, 0.04], [0.24, 0.01]] : [[0.46, 0.04], [0.49, 0.01]]
    for (const weight of full) {
      for (const kind of ['held', 'pending']) {
        const answer = run({ own: 0, weight, kind, axis }).data
        assert.notEqual(answer.proposedAction, 'BUY', `${axis}/${kind}/${weight}: this run bought into a bucket the account has no room in`)
        assert.equal(answer.hostTargetWeight, null, `${axis}/${kind}/${weight}: a weight left on a run that proposes nothing`)
        assert.equal(answer.outcomeCode, 'risk_limit_exceeded')
      }
    }
    for (const [weight, allowed] of room) {
      for (const kind of ['held', 'pending']) {
        const answer = run({ own: 0, weight, kind, axis }).data
        assert.equal(answer.proposedAction, 'BUY', `${axis}/${kind}/${weight}: a bucket with room in it bought nothing`)
        assert.equal(answer.incrementWeight, allowed, `${axis}/${kind}/${weight}: the addition was not bounded by the account's remaining room`)
      }
    }
  }
  ok('#813 — the entry direction still folds every declared axis and every unapproved proposal, and a full bucket still buys nothing')

  /**
   * ⛔ **A desk that holds less than its own sized target proposes nothing at
   * all** — not a purchase into a bucket with no room, and not the liquidation
   * the remainder names. This is the state the issue's option ⑶ was about, and
   * it is a `WAIT` that says why.
   */
  for (const [own, weight, outcome] of [
    [0.02, 0.24, 'position_at_target'],
    [0.05, 0.24, 'position_at_target'],
    [0.02, 0.3, 'risk_limit_exceeded'],
  ]) {
    const answer = run({ own, weight, kind: 'held', axis: 'sector' }).data
    assert.equal(answer.proposedAction, 'WAIT', `own ${own}/bucket ${weight}: a desk below its own target proposed something`)
    assert.equal(answer.hostTargetWeight, null, `own ${own}/bucket ${weight}: a weight left with a run that proposes nothing`)
    assert.equal(answer.outcomeCode, outcome)
  }
  ok('#833 — a desk holding less than its own sized target neither buys into a full bucket nor liquidates itself into one')

  /**
   * ⛔ **The RESIZE/WAIT test reads the same fold the order is built from**, and
   * a mutant that lets it read the entry fold survives every row above. The
   * entry fold is the smaller of the two, so a test against it says `RESIZE` on
   * a desk whose own holding is *below* the number the order then names — a
   * **purchase sent out of a judgement to reduce**, which is what
   * `aumos-catalogue#278` and `#280` are about, arriving through this door.
   *
   * ⚠️ **The bucket is crowded and this name carries somebody else's pending
   * total**, which is the only shape where `ownHeld` sits between the two folds:
   * a holding is one row per name, so a second desk's *holding* replaces this
   * desk's rather than stacking on it.
   */
  {
    const crowdedAndPending = (own) =>
      evaluateCase({
        ...structuredClone(buyPath),
        strategy: MINE,
        mandate: { ...structuredClone(buyPath.mandate), caps: SECTOR_CAPS },
        book: {
          holdings: [
            { symbol: SYMBOL, sector: 'financials', weight: own, strategy: MINE },
            { symbol: 'OTHER1', sector: 'financials', weight: 0.24, strategy: OTHER },
          ],
          openProposals: [{ symbol: SYMBOL, sector: 'financials', targetWeight: 0.12, strategy: OTHER, decisionId: 'dec_2' }],
        },
      }).data
    for (const own of [0.01, 0.03, 0.05]) {
      const answer = crowdedAndPending(own)
      assert.equal(answer.proposedAction, 'WAIT', `own ${own}: a desk holding less than its own sized target was told to reduce`)
      assert.equal(answer.hostTargetWeight, null, `own ${own}: a reduction handed the host a total above this desk's own holding, which is a purchase`)
    }
    /** And the desk that really is above it still reduces. */
    const above = crowdedAndPending(0.06)
    assert.equal(above.proposedAction, 'RESIZE')
    assert.equal(above.hostTargetWeight, SIZED)
    assert.ok(above.hostTargetWeight < 0.06)
  }
  ok('#833 — the RESIZE/WAIT test and the weight that leaves read one fold, so no reduction is sent as a purchase')

  /**
   * ⛔ **The single-name axes still bind in both directions**, which is the line
   * this change draws: a ceiling that names *this* position needs no allocation
   * across names and a desk over it reduces itself. `#830`'s standalone half.
   */
  for (const own of [0.101, 0.12, 0.2]) {
    const answer = run({ own, weight: 0, kind: 'held', axis: 'sector' }).data
    assert.equal(answer.proposedAction, 'RESIZE', `own ${own}: a desk over its own single-name ceiling could not reduce itself`)
    assert.equal(answer.hostTargetWeight, SIZED)
    assert.ok(answer.hostTargetWeight < own)
  }
  ok('#830 — a desk over a ceiling that names its own position still reduces itself, which #833 does not touch')

  /**
   * ⚠️ **The two folds, on `concentration` and `targetWeight` directly**, because
   * the pair is the contract and a consumer reading either one has to be able to
   * tell them apart.
   */
  {
    const fold = (caps, others) =>
      concentration({
        proposed: { symbol: SYMBOL, sector: 'financials', weight: 0 },
        holdings: [{ symbol: SYMBOL, sector: 'financials', weight: 0.06, strategy: MINE }, ...others],
        openProposals: [],
        caps,
        strategy: MINE,
      }).data
    const alone = fold(SECTOR_CAPS, [])
    assert.equal(alone.maxTotalWeightForName, alone.reductionNameLimit, 'with nothing else in the bucket the two folds are not one number')
    assert.equal(alone.reductionNameLimitBinding, 'accountPositionCap')

    const crowded = fold(SECTOR_CAPS, [{ symbol: 'OTHER1', sector: 'financials', weight: 0.24, strategy: OTHER }])
    assert.equal(crowded.maxTotalWeightForName, 0.01, 'the entry ceiling stopped counting other names in the bucket')
    assert.equal(crowded.maxTotalWeightBinding, 'accountSectorCap')
    assert.equal(crowded.reductionNameLimit, 0.1, 'the reduction ceiling folded the account\'s leftover room after other names')
    assert.equal(crowded.reductionNameLimitBinding, 'accountPositionCap')

    /** ⚠️ **`strategyPositionCap` is a single-name axis and binds both folds.** */
    const twoNameCaps = fold({ ...SECTOR_CAPS, strategyPositionCap: 0.08 }, [])
    assert.equal(twoNameCaps.reductionNameLimit, 0.08)
    assert.equal(twoNameCaps.reductionNameLimitBinding, 'strategyPositionCap')

    /** An unreadable account answers neither. */
    const unread = concentration({ proposed: { symbol: SYMBOL, weight: 0 }, holdings: undefined, openProposals: [], caps: SECTOR_CAPS })
    assert.equal(unread.data.reductionNameLimit, null)
    assert.equal(unread.data.reductionNameLimitBinding, null)

    const sizedTwice = targetWeight({
      riskBudgetWeight: 0.01,
      lossFraction: 0.1875,
      mandatePositionCap: 0.08,
      accountNameLimit: 0.01,
      accountNameLimitForReduction: 0.1,
      minimumExecutableWeight: 0.005,
    }).data
    assert.equal(sizedTwice.targetTotalWeight, 0.01, 'the entry fold stopped reading the account limit')
    assert.equal(sizedTwice.bindingCapName, 'accountNameLimit')
    assert.equal(sizedTwice.reduceTargetTotalWeight, SIZED, 'the reduction fold read the account\'s leftover room')
    assert.equal(sizedTwice.reduceBindingCapName, 'mandatePositionCap')

    /** ⛔ **Absent means the same fold twice**, so a caller written before #833 is unchanged. */
    const once = targetWeight({ riskBudgetWeight: 0.01, lossFraction: 0.1875, mandatePositionCap: 0.08, accountNameLimit: 0.01, minimumExecutableWeight: 0.005 }).data
    assert.equal(once.reduceTargetTotalWeight, once.targetTotalWeight)

    /** ⛔ **And the venue minimum still refuses both**, rather than the entry refusal travelling to a number it never measured. */
    const tiny = targetWeight({ riskBudgetWeight: 0.0001, lossFraction: 0.1875, mandatePositionCap: 0.08, accountNameLimit: 0.08, accountNameLimitForReduction: 0.08, minimumExecutableWeight: 0.005 }).data
    assert.equal(tiny.targetTotalWeight, null)
    assert.equal(tiny.reduceTargetTotalWeight, null, 'a target below the venue minimum survived on the reduction fold')
  }
  ok('#833 — `concentration` and `targetWeight` publish both folds, and an absent reduction limit is the same fold twice')
}

// ─────────────────────────────────────────────────────────────────────────────
// The Mandate the host actually sends (`untilled/aumos#838`)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⛔ **Every cap in `fixtures/cases.json` was written by hand, and that is what
 * let this defect live through twelve orders of work.** They state
 * `mandate.mandatePositionCap` and `mandate.caps.*` because that is what this
 * package calls them — so every assertion passed while a run handed the
 * *investor's* Mandate answered WAIT: `position_cap_not_stated` left
 * `withinLimits` at `null`, and `null` is not permission.
 *
 * The host's `mandate.constraints` is a closed set of eight fields, built here
 * in full from `packages/amp/src/snapshots.ts`. Two of them are ceilings this
 * package knows: `maxPositionWeight` is `accountPositionCap`, and the complement
 * of `cashFloor` is `accountGrossCap`. No sector and no per-strategy axis exists
 * in that contract at all.
 *
 * ⚠️ **The fixtures on disk are not touched** — every case below is a deep copy.
 */
{
  const HOST_CONSTRAINTS = Object.freeze({
    baseCurrency: 'KRW',
    allowedAssetClasses: ['equity', 'etf', 'crypto', 'cash'],
    maxPositionWeight: 0.1,
    cashFloor: 0.1,
    maxDrawdown: 0.06,
    allowShorting: true,
    allowLeverage: true,
    excludedSymbols: [],
  })
  const hostMandate = (overrides = {}) => ({
    mandateId: 'mdt_838',
    version: 3,
    label: 'Untilled',
    objective: 'Compound the book without a drawdown that ends it',
    horizonDays: 365,
    constraints: { ...HOST_CONSTRAINTS, ...overrides },
  })
  const hostMandateWithout = (...fields) => {
    const mandate = hostMandate()
    for (const field of fields) delete mandate.constraints[field]
    return mandate
  }
  const buyPath = (() => {
    const fixture = cases.cases.find((row) => row.id === 'financial-positive-reaches-buy')
    assert.ok(fixture, 'cases.json no longer carries the sized BUY case, so these regressions test nothing')
    return fixture.input
  })()
  /** The same case with every hand-written ceiling stripped out and the Mandate in their place. */
  const underMandate = (mandate, mutate = () => {}) => {
    const input = structuredClone(buyPath)
    delete input.mandate.mandatePositionCap
    delete input.mandate.caps
    if (mandate !== null) input.mandate.constraints = mandate.constraints ?? mandate
    mutate(input)
    return evaluateCase(input)
  }

  const control = evaluateCase(structuredClone(buyPath))
  assert.equal(control.data.proposedAction, 'BUY', 'the positive control no longer buys, so the checks below test nothing')

  const verbatim = underMandate(hostMandate())
  assert.equal(verbatim.data.proposedAction, 'BUY', 'a Mandate carrying both ceilings still waited')
  assert.ok(verbatim.data.targetTotalWeight > 0, 'and produced no weight')
  assert.ok(
    !codesOf(verbatim.diagnostics).includes('position_cap_not_stated'),
    'the concentration limit the investor stated was reported as unstated',
  )
  ok('#838 — the Mandate as the host sends it sizes, under the names this package uses')

  /**
   * ⚠️ **The investor's number has to *bind*.** The risk budget sizes this case
   * at 0.05333333, so a 0.02 concentration answer that was read and not applied
   * leaves that standing.
   */
  const tight = underMandate(hostMandate({ maxPositionWeight: 0.02 }))
  assert.equal(tight.data.targetTotalWeight, 0.02, "`maxPositionWeight` did not bind the single-name axis")
  assert.ok(tight.data.targetTotalWeight < verbatim.data.targetTotalWeight)
  ok('#838 — `maxPositionWeight` is the single-name ceiling and it binds')

  /**
   * ⚠️ **A 0.2 cash floor is a 0.8 gross ceiling.** With 0.78 of the book held
   * elsewhere the gross axis is what is left, and `gross_cap_not_stated` — the
   * note that says this Mandate declared none — must be gone.
   */
  const crowded = underMandate(hostMandate({ cashFloor: 0.2 }), (input) => {
    input.book = { holdings: [{ symbol: 'OTHER', sector: 'industrials', weight: 0.78 }], openProposals: [] }
  })
  assert.ok(
    !codesOf(crowded.diagnostics).includes('gross_cap_not_stated'),
    'a declared cash floor was still reported as no gross ceiling at all',
  )
  assert.equal(crowded.data.maxTotalWeightBinding, 'accountGrossCap', "the investor's cash floor is what bound the name")
  /**
   * ⚠️ **The number, not just the axis name.** A 0.2 floor read *as* the ceiling
   * rather than as its complement still reports `accountGrossCap` and is still
   * wrong by 0.6 of the book; only the weight it leaves says which was read.
   */
  assert.equal(crowded.data.targetTotalWeight, 0.02, '0.8 invested less the 0.78 held elsewhere is what the floor leaves')
  assert.equal(crowded.data.projectedGrossExposure, 0.8, 'and the book lands exactly on the ceiling the floor implies')
  ok('#838 — `cashFloor` is the gross ceiling, as its complement, and it binds')

  /**
   * ⛔ **Declared-none is not unread, and this package already said so for the
   * gross axis.** An investor who left the cash question blank has declined to
   * constrain that axis; one who left the concentration question blank has not
   * authorised a run to choose its own limit, and that stays a WAIT.
   */
  const noFloor = underMandate(hostMandateWithout('cashFloor'))
  assert.equal(noFloor.data.proposedAction, 'BUY', 'a blank cash answer stopped this run from sizing')
  assert.ok(codesOf(noFloor.diagnostics).includes('gross_cap_not_stated'), 'and the declined axis has to say so')

  const noCap = underMandate(hostMandateWithout('maxPositionWeight'))
  assert.equal(noCap.data.proposedAction, 'WAIT', 'a Mandate stating no concentration limit sized a position anyway')
  assert.ok(codesOf(noCap.diagnostics).includes('position_cap_not_stated'))

  const noMandate = underMandate(null)
  assert.equal(noMandate.data.proposedAction, 'WAIT', 'an unread Mandate sized a position anyway')
  assert.ok(codesOf(noMandate.diagnostics).includes('position_cap_not_stated'))
  ok('#838 — a blank cash answer constrains nothing; a blank concentration answer and no Mandate at all still wait')

  /**
   * ⛔ **The differential this whole change is held to.** Every case that states
   * its ceilings is byte-for-byte what it was, whatever Mandate rides alongside
   * — including one whose numbers are different ones.
   */
  for (const [what, mandate, complete] of [
    /**
     * ⚠️ **Both axes stated, so there is nothing left for a Mandate to fill.**
     * `cases.json` states `accountPositionCap` and leaves the gross axis to the
     * `gross_cap_not_stated` note, and filling *that* is the fix rather than a
     * regression — so this half completes the caps first and then asserts that
     * a Mandate saying something else moves nothing.
     */
    ['the host snapshot', hostMandate({ maxPositionWeight: 0.9, cashFloor: 0.5 }), true],
    ['a Mandate declaring neither', hostMandateWithout('maxPositionWeight', 'cashFloor'), false],
  ]) {
    for (const fixture of cases.cases) {
      /**
       * ⚠️ **The two sizing numbers are completed on both rows and the caps only on
       * the first (`untilled/aumos#841`).** This differential's claim is «a Mandate
       * fills a name the caller left empty and moves nothing the caller stated», and
       * until #841 it completed the *caps* alone — so a fixture stating no risk
       * budget had one filled in by the Mandate on one side of the comparison and
       * not the other, and the differential reported the fix as a regression. That
       * is the same mistake in the same file as the one #841 found: a differential
       * has to state everything the Mandate could fill, or it is measuring the fill.
       */
      const withCaps = (input) => {
        input.mandate = { riskBudgetWeight: 0.01, minimumExecutableWeight: 0.005, ...(input.mandate ?? {}) }
        if (!complete) return input
        input.mandate = { mandatePositionCap: 0.08, ...input.mandate }
        input.mandate.caps = { accountPositionCap: 0.1, accountGrossCap: 0.95, ...(input.mandate.caps ?? {}) }
        return input
      }
      const stated = evaluateCase(withCaps(structuredClone(fixture.input)))
      const beside = withCaps(structuredClone(fixture.input))
      beside.mandate = { ...(beside.mandate ?? {}), constraints: mandate.constraints }
      const alongside = evaluateCase(beside)
      assert.equal(
        JSON.stringify(alongside),
        JSON.stringify(stated),
        `${what}: ${fixture.id} moved when a Mandate was passed beside its stated caps`,
      )
    }
  }
  ok('#838 — a stated cap wins, so a Mandate riding alongside changes nothing at all')
}

// ─────────────────────────────────────────────────────────────────────────────
// The two numbers the Mandate cannot carry (`untilled/aumos#841`)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⛔ **`#838` closed half of this and the half it left standing was the whole of
 * sizing.** `riskBudgetWeight` and `minimumExecutableWeight` were read off
 * `mandate.*` and **no producer of either name exists anywhere in the host** —
 * not in the Mandate's closed set of eight fields, not on the investment-principles
 * screen. Both absences are `unevaluated`, `unevaluated` blocks, and blocked
 * sizing is `WAIT`. Measured on these very fixtures with the host's Mandate handed
 * in verbatim: the four cases that do anything at all all flipped to
 * `data_missing`, and *"there is no default risk budget … the answer is WAIT"*
 * meant **always** WAIT.
 *
 * ⚠️ **`#838`'s own checker did not catch it, and how it missed is the lesson.**
 * Its `underMandate` helper deleted the caps and kept the rest of
 * `input.mandate`, so the two sizing numbers rode along in every comparison. A
 * check that completes some of what the host cannot send is measuring the part it
 * completed. Everything below builds the Mandate from the eight published fields
 * and states **nothing else**.
 *
 * ⚠️ **The fixtures on disk are not touched** — every case below is a deep copy.
 */
{
  const HOST_CONSTRAINTS = Object.freeze({
    baseCurrency: 'KRW',
    allowedAssetClasses: ['equity', 'etf', 'crypto', 'cash'],
    maxPositionWeight: 0.1,
    cashFloor: 0.1,
    maxDrawdown: 0.06,
    allowShorting: true,
    allowLeverage: true,
    excludedSymbols: [],
  })
  const hostMandate = (overrides = {}) => ({
    mandateId: 'mdt_841',
    version: 3,
    label: 'Untilled',
    objective: 'Compound the book without a drawdown that ends it',
    horizonDays: 365,
    constraints: { ...HOST_CONSTRAINTS, ...overrides },
  })
  /**
   * ⚠️ **`book.totalValue` is `portfolio.totalValue`** — `packages/amp/src/snapshots.ts`
   * carries it on every invocation, in major units of the account's base currency.
   * The venue minimum is published in won and a weight only against a total, so this
   * is the second host field this package had never read. ⛔ It is not optional
   * anywhere below: a run that states no account value is refused, because a floor
   * skipped for want of a denominator is a floor that passed a check nobody made.
   */
  const BOOK_VALUE = 50_000_000_000

  /** One fixture, its whole Mandate replaced by the host's and nothing else stated. */
  const underHost = (id, { mandate = hostMandate(), config, totalValue = BOOK_VALUE, mutate = () => {} } = {}) => {
    const fixture = cases.cases.find((row) => row.id === id)
    assert.ok(fixture, `cases.json no longer carries ${id}, so these regressions test nothing`)
    const input = structuredClone(fixture.input)
    input.mandate = mandate === null ? {} : structuredClone(mandate)
    if (totalValue !== null) input.book = { ...(input.book ?? {}), totalValue }
    if (config !== undefined) input.config = config
    mutate(input)
    return evaluateCase(input)
  }

  /**
   * ── The sweep the issue's table is ────────────────────────────────────────
   *
   * ⛔ **Not one of the fifteen may report either absence.** Naming the two codes
   * rather than only the four flipped answers is deliberate: an implementation that
   * reached `BUY` while still reporting `risk_budget_not_stated` would be sizing on
   * a number it had just called missing.
   */
  {
    const acting = new Map([
      ['financial-positive-reaches-buy', ['BUY', 'buy-path', 0.05333333]],
      ['reference-plan-is-classified-not-screened-out', ['BUY', 'buy-path', 0.05714286]],
      ['account-concentration-caps-never-sum', ['WAIT', 'trim-or-exit-review', 0.05333333]],
      ['a-cap-binds-the-total-and-the-increment-is-what-is-left', ['BUY', 'buy-path', 0.05333333]],
    ])
    for (const fixture of cases.cases) {
      const answer = underHost(fixture.id)
      const codes = codesOf(answer.diagnostics)
      for (const absence of ['risk_budget_not_stated', 'minimum_executable_not_stated', 'position_cap_not_stated']) {
        assert.ok(
          !codes.includes(absence),
          `${fixture.id}: the investor's own Mandate was reported as carrying no ${absence}`,
        )
      }
      const expected = acting.get(fixture.id)
      if (expected === undefined) continue
      const [action, route, weight] = expected
      assert.equal(answer.data.proposedAction, action, `${fixture.id}: the Mandate the host sends no longer reaches ${action}`)
      assert.equal(answer.data.route, route, `${fixture.id}: route moved`)
      assert.equal(answer.data.targetTotalWeight, weight, `${fixture.id}: the weight the pre-registered budget funds moved`)
    }
  }
  ok('#841 — every case reaches its answer under the Mandate the host actually sends, and none reports an absence')

  /**
   * ⛔ **The discriminator, and the reason this is not a loosening.** A Mandate that
   * was *read* and declares no per-idea axis is an undeclared axis, which #838
   * already settled constrains nothing. A run carrying **no Mandate** is nobody
   * having looked, and it refuses exactly as it did.
   */
  {
    const blind = underHost('financial-positive-reaches-buy', { mandate: null })
    assert.equal(blind.data.proposedAction, 'WAIT', 'a run handed no Mandate at all sized a position')
    assert.ok(codesOf(blind.diagnostics).includes('risk_budget_not_stated'), 'and did not say the budget was missing')
    assert.ok(codesOf(blind.diagnostics).includes('position_cap_not_stated'), 'and did not say the cap was missing')
    const verbatim = evaluateCase(structuredClone(cases.cases.find((row) => row.id === 'no-mandate-numbers-is-unevaluated-not-a-default').input))
    assert.equal(verbatim.data.outcomeCode, 'data_missing', 'the no-Mandate fixture stopped refusing')
    assert.ok(
      !codesOf(verbatim.diagnostics).includes('risk_budget_from_methodology'),
      'the pre-registered budget leaked into a run that carried no Mandate',
    )
  }
  ok('#841 — a Mandate that was read fills the axis it has no field for; no Mandate at all still refuses')

  /**
   * ⚠️ **A numerator and never a size.** The investor's own concentration answer
   * still cuts it, and the answer says the cap is what bound.
   */
  {
    const capped = underHost('financial-positive-reaches-buy', { mandate: hostMandate({ maxPositionWeight: 0.02 }) })
    assert.equal(capped.data.proposedAction, 'BUY', 'the tight cap refused rather than binding')
    assert.equal(capped.data.targetTotalWeight, 0.02, 'the investor\'s concentration answer did not cut the pre-registered budget')
    assert.ok(codesOf(capped.diagnostics).includes('cap_is_binding'), 'and the proposal presented a ceiling as a calculation')
  }
  ok('#841 — the pre-registered budget is a numerator and the investor\'s ceiling still binds')

  /**
   * ⚠️ **`config` narrows and may not widen**, `fundamental-mean-reversion`'s rule for
   * the same quantity in the same units. ⛔ The refused value is not clamped silently:
   * the answer is the pre-registered one and a `warn` says why.
   */
  {
    const narrow = underHost('financial-positive-reaches-buy', { config: { riskBudgetWeight: 0.005 } })
    assert.equal(narrow.data.targetTotalWeight, 0.02666667, 'a narrower configured budget did not size the position')
    assert.ok(
      narrow.diagnostics.some((row) => row.code === 'risk_budget_from_methodology' && row.details.source === 'config'),
      'and the run did not say which number it fell back to',
    )
    const wide = underHost('financial-positive-reaches-buy', { config: { riskBudgetWeight: 0.05 } })
    assert.equal(wide.data.targetTotalWeight, 0.05333333, 'a configured budget wider than the pre-registered one governed the run')
    assert.ok(codesOf(wide.diagnostics).includes('risk_budget_config_widens'), 'and it was widened silently')
  }
  ok('#841 — `config.riskBudgetWeight` narrows the pre-registered budget and cannot widen it')

  /**
   * ── The venue floor, which was a published setting with no reader ─────────
   *
   * `config.minimumExecutablePosition` has said 500,000 won since this package
   * shipped and nothing ever read it: the arithmetic wanted a weight. It is a weight
   * only against the size of the book.
   */
  {
    const small = underHost('financial-positive-reaches-buy', { totalValue: 5_000_000 })
    assert.equal(small.data.proposedAction, 'WAIT', 'a position of a handful of shares was proposed')
    assert.equal(small.data.outcomeCode, 'position_not_executable', 'and it was refused for the wrong reason')
    assert.ok(codesOf(small.diagnostics).includes('minimum_executable_not_met'), 'and the venue floor did not bind')

    const lowered = underHost('financial-positive-reaches-buy', { totalValue: 5_000_000, config: { minimumExecutablePosition: 100_000 } })
    assert.equal(lowered.data.proposedAction, 'BUY', 'the configured venue minimum was not read')
    assert.equal(lowered.data.targetTotalWeight, 0.05333333, 'and the weight moved with it')

    /**
     * ⚠️ **The floor applies to the order as well as to the position, and that is a
     * second reader of the same number** (`index.mjs`'s increment gate). A target
     * that clears the floor can still be reached by an addition that does not, and
     * until #841 that gate read `mandate.minimumExecutableWeight` — the name with no
     * producer — so on the host's Mandate it compared against `undefined` and let
     * every addition through.
     */
    const sliver = underHost('financial-positive-reaches-buy', {
      totalValue: 50_000_000,
      mutate: (input) => {
        input.book.openProposals = [
          { symbol: input.symbol, sector: input.sector, targetWeight: 0.05, strategy: 'shareholder-rerating', decisionId: 'dec_own_841' },
        ]
      },
    })
    assert.equal(sliver.data.incrementWeight, 0.00333333, 'the increment this account still has room for moved')
    assert.equal(sliver.data.proposedAction, 'WAIT', 'an order below the smallest this venue can express was proposed')
    assert.ok(
      codesOf(sliver.diagnostics).includes('increment_below_minimum_executable'),
      'and the order floor did not bind on a floor the package derived rather than was handed',
    )

    const blind = underHost('financial-positive-reaches-buy', { totalValue: null })
    assert.equal(blind.data.proposedAction, 'WAIT', 'the venue floor was skipped because the book size was unknown')
    assert.ok(codesOf(blind.diagnostics).includes('minimum_executable_not_stated'), 'and nothing said the comparison had not been made')
    assert.ok(codesOf(blind.diagnostics).includes('account_value_not_stated'), 'and nothing named the field that fixes it')
  }
  ok('#841 — the venue floor is the published won amount over the size of the book, and an unknown book still refuses')

  /**
   * ⛔ **The differential this change is held to.** Every case that states both
   * numbers is byte-for-byte what it was, whatever Mandate, config and account value
   * ride alongside — which is what makes «stated wins» a property rather than a
   * sentence, and what makes every committed fixture above untouched by any of this.
   */
  {
    /**
     * ⚠️ **Everything a Mandate could fill is stated, caps included.** Otherwise this
     * measures #838's fill rather than #841's: the gross axis is filled from
     * `cashFloor` and the case would differ for a reason this block is not about.
     */
    const stateBoth = (input) => {
      input.mandate = { riskBudgetWeight: 0.01, minimumExecutableWeight: 0.005, mandatePositionCap: 0.08, ...(input.mandate ?? {}) }
      input.mandate.caps = { accountPositionCap: 0.1, accountGrossCap: 0.95, ...(input.mandate.caps ?? {}) }
      return input
    }
    for (const fixture of cases.cases) {
      const stated = evaluateCase(stateBoth(structuredClone(fixture.input)))
      const beside = stateBoth(structuredClone(fixture.input))
      beside.mandate.constraints = hostMandate().constraints
      beside.book = { ...(beside.book ?? {}), totalValue: BOOK_VALUE }
      beside.config = { riskBudgetWeight: 0.002, minimumExecutablePosition: 9_000_000_000 }
      assert.equal(
        JSON.stringify(evaluateCase(beside)),
        JSON.stringify(stated),
        `${fixture.id} moved when a Mandate, a config and an account value rode beside its stated numbers`,
      )
    }
  }
  ok('#841 — a stated budget and a stated venue floor win, so nothing riding alongside changes anything')
}

// ─────────────────────────────────────────────────────────────────────────────
// The venue floor is money, and money has a currency (`untilled/aumos#845`)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⛔ **`#841` gave `minimumExecutablePosition` its first reader and the reader read the
 * amount without its unit.** 500,000 is won; divided by a **dollar** book of $100,000 it
 * is `500000 / 100000 = 5.0`, a floor of five hundred per cent of the account, which no
 * position can clear. So every case that reached sizing sized correctly and was then
 * refused, and this package was structurally `WAIT` on any book not denominated in won.
 *
 * Measured on these fifteen fixtures under the host's Mandate handed in verbatim:
 * **eight act on a won book and three on a dollar one**, the five that went missing
 * refused by this floor alone.
 *
 * ⚠️ **And the *wrong* reading of `totalValue` was the one that looked green.** The host
 * sends `portfolio.totalValue` as a `Money` — an integer count of **minor** units — so a
 * caller handing `minorUnits` straight in passes 10,000,000 for that $100,000 book and
 * the floor lands back in its ordinary range: seven act. Two readings of one field, the
 * correct one strictly worse-looking than the wrong one, and the unit lived only in the
 * prose where no arithmetic could check it.
 *
 * ⛔ **Nothing here pre-registers a weight to replace the amount.** A venue minimum is
 * money — «a share in its ordinary price range, in a quantity that can be staged into
 * and trimmed» — and the same statement is 0.1 of a five-million-won book and 0.00001 of
 * a fifty-billion-won one. There is no non-fitted weight to publish and `thresholds.mjs`
 * opens by saying none of its numbers was fitted. What moved instead is that the amount
 * now **names its currency** and governs the book it was declared for: elsewhere the
 * axis is undeclared, which #838 already settled constrains nothing and says so.
 *
 * ⚠️ **The account-currency axis is why this lived through thirteen orders of work** —
 * every fixture, every regression and every sweep above is a won book. Every block below
 * states a currency.
 *
 * ⚠️ **The fixtures on disk are not touched** — every case below is a deep copy.
 */
{
  const constraintsIn = (baseCurrency) => ({
    baseCurrency,
    allowedAssetClasses: ['equity', 'etf', 'crypto', 'cash'],
    maxPositionWeight: 0.1,
    cashFloor: 0.1,
    maxDrawdown: 0.06,
    allowShorting: true,
    allowLeverage: true,
    excludedSymbols: [],
  })
  const hostMandateIn = (baseCurrency) => ({
    mandateId: 'mdt_845',
    version: 3,
    label: 'Untilled',
    objective: 'Compound the book without a drawdown that ends it',
    horizonDays: 365,
    constraints: constraintsIn(baseCurrency),
  })
  /** A won book and a dollar book of ordinary size for each, and nothing else stated. */
  const WON_BOOK = 50_000_000_000
  const DOLLAR_BOOK = 100_000

  const underBook = (id, { currency = 'USD', totalValue = DOLLAR_BOOK, config, mandate, mutate = () => {} } = {}) => {
    const fixture = cases.cases.find((row) => row.id === id)
    assert.ok(fixture, `cases.json no longer carries ${id}, so these regressions test nothing`)
    const input = structuredClone(fixture.input)
    input.mandate = structuredClone(mandate ?? hostMandateIn(currency))
    if (totalValue !== null) input.book = { ...(input.book ?? {}), totalValue }
    if (config !== undefined) input.config = config
    mutate(input)
    return evaluateCase(input)
  }
  const sweep = (options) =>
    cases.cases.map((fixture) => [fixture.id, underBook(fixture.id, options)])

  /**
   * ── The sweep the issue's table is ────────────────────────────────────────
   *
   * ⛔ **The answer to «what does this book do» may not depend on what it is
   * denominated in.** Both sides state the ordinary size of their own currency, so a
   * floor that is genuinely about the venue binds on neither — and until #845 the
   * dollar side refused five of the eight that act.
   */
  {
    const won = new Map(sweep({ currency: 'KRW', totalValue: WON_BOOK }))
    const dollar = new Map(sweep({ currency: 'USD', totalValue: DOLLAR_BOOK }))
    const acting = (answers) => [...answers.values()].filter((a) => a.data.proposedAction !== 'WAIT').length
    assert.equal(acting(won), 8, 'the won sweep no longer acts on eight, so the comparison below tests nothing')
    assert.equal(
      acting(dollar),
      8,
      'a dollar book acts on a different number of cases than a won book of the same ordinary size',
    )
    for (const [id, answer] of dollar) {
      const reference = won.get(id)
      assert.equal(answer.data.proposedAction, reference.data.proposedAction, `${id}: the action moved with the currency`)
      assert.equal(answer.data.route, reference.data.route, `${id}: the route moved with the currency`)
      assert.equal(
        answer.data.targetTotalWeight,
        reference.data.targetTotalWeight,
        `${id}: the weight moved with the currency`,
      )
      assert.ok(
        !codesOf(answer.diagnostics).includes('minimum_executable_not_met'),
        `${id}: a dollar-denominated book was refused by a floor published in won`,
      )
    }
  }
  ok('#845 — a dollar book reaches the same fifteen answers as a won book of the same ordinary size')

  /**
   * ⚠️ **Undeclared, and it says which two currencies made it so.** #838 settled that an
   * axis nothing declares constrains nothing; ⛔ what it never licensed is doing that
   * *silently*, so the note has to name the mismatch and the settings that fix it.
   * `minimum_executable_not_stated` is the other thing — it is `unevaluated` and blocks —
   * and reporting it here would be refusing all over again.
   */
  {
    const answer = underBook('financial-positive-reaches-buy')
    const note = answer.diagnostics.find((row) => row.code === 'minimum_executable_currency_mismatch')
    assert.ok(note, 'a floor that did not apply to this book was dropped without a word')
    assert.equal(note.severity, 'warn', 'a loosening was reported at a severity nobody reads')
    assert.equal(note.details.minimumExecutablePositionCurrency, 'KRW')
    assert.equal(note.details.baseCurrency, 'USD')
    assert.equal(note.details.minimumExecutablePosition, 500000)
    assert.ok(
      !codesOf(answer.diagnostics).includes('minimum_executable_not_stated'),
      'a declared absence was reported as an unevaluated one, which blocks',
    )
    assert.equal(answer.data.proposedAction, 'BUY')
  }
  ok('#845 — a floor published in another currency is a declared absence, named, and never a silent one')

  /**
   * ⛔ **A currency the run never read is nobody having looked, and that still refuses** —
   * the same rule #841 already applies to a book whose *size* is unknown, on the other
   * half of the same denominator. ⚠️ The Mandate here is read (`allowedAssetClasses` is a
   * marker) and carries no `baseCurrency`, so this is not the no-Mandate path.
   */
  {
    const blind = underBook('financial-positive-reaches-buy', {
      totalValue: WON_BOOK,
      mandate: { allowedAssetClasses: ['equity'], maxPositionWeight: 0.1, cashFloor: 0.1 },
    })
    assert.equal(blind.data.proposedAction, 'WAIT', 'a book of unknown currency divided an amount of won by it anyway')
    assert.ok(codesOf(blind.diagnostics).includes('account_currency_not_stated'), 'and nothing named the field that fixes it')
    assert.ok(codesOf(blind.diagnostics).includes('minimum_executable_not_stated'), 'and nothing said the comparison was never made')
  }
  ok('#845 — an account whose currency was never read refuses, as one whose size was never read always has')

  /**
   * ⚠️ **An investor whose venue is a dollar venue states it in dollars**, and the floor
   * then binds there exactly as the won one binds on a won book — the same two-sided
   * check #841 makes, moved one currency over.
   */
  {
    const priced = { minimumExecutablePosition: 400, minimumExecutablePositionCurrency: 'USD' }
    const ordinary = underBook('financial-positive-reaches-buy', { config: priced })
    assert.equal(ordinary.data.proposedAction, 'BUY', 'a floor stated in the account\'s own currency was not applied at all')
    assert.equal(ordinary.data.targetTotalWeight, 0.05333333, 'and the weight moved')
    assert.ok(
      ordinary.diagnostics.some((row) => row.code === 'minimum_executable_from_position'),
      'and the run did not say which floor it used',
    )

    const tiny = underBook('financial-positive-reaches-buy', { config: priced, totalValue: 5_000 })
    assert.equal(tiny.data.proposedAction, 'WAIT', 'a position of a handful of shares was proposed on a small dollar book')
    assert.equal(tiny.data.outcomeCode, 'position_not_executable', 'and it was refused for the wrong reason')
    assert.ok(codesOf(tiny.diagnostics).includes('minimum_executable_not_met'), 'and the floor the investor stated did not bind')

    /**
     * ⛔ **And it is an amount of *that* money and of no other.** A floor of $1,000,000
     * against a five-million-**won** book is 0.2 if the code is ignored, which refuses
     * this case; it is a fact about a dollar venue and constrains a won book not at all.
     */
    /** ⚠️ An ISO code is a code however it was typed. */
    const shouted = underBook('financial-positive-reaches-buy', {
      config: { minimumExecutablePosition: 400, minimumExecutablePositionCurrency: 'usd' },
      totalValue: 5_000,
    })
    assert.equal(shouted.data.proposedAction, 'WAIT', 'a floor currency typed in lower case stopped matching the book')
    assert.ok(codesOf(shouted.diagnostics).includes('minimum_executable_not_met'))

    const elsewhere = underBook('financial-positive-reaches-buy', {
      currency: 'KRW',
      totalValue: 5_000_000,
      config: { minimumExecutablePosition: 1_000_000, minimumExecutablePositionCurrency: 'USD' },
    })
    assert.equal(elsewhere.data.proposedAction, 'BUY', 'a dollar amount was divided by a won book')
    assert.ok(codesOf(elsewhere.diagnostics).includes('minimum_executable_currency_mismatch'))
  }
  ok('#845 — a venue minimum stated in the account\'s own currency binds on that account')

  /**
   * ⚠️ **The one spelling of this floor that never needs a currency**, and it wins over
   * the amount on either book — which is what makes «state a weight» the answer for an
   * investor whose currency this package has never heard of.
   */
  {
    const dollar = underBook('financial-positive-reaches-buy', { config: { minimumExecutableWeight: 0.01 } })
    assert.equal(dollar.data.proposedAction, 'BUY')
    assert.equal(dollar.data.targetTotalWeight, 0.05333333)
    assert.ok(
      dollar.diagnostics.some((row) => row.code === 'minimum_executable_from_weight' && row.details.minimumExecutableWeight === 0.01),
      'the run did not say it sized against a floor given as a weight',
    )
    assert.ok(
      !codesOf(dollar.diagnostics).includes('minimum_executable_currency_mismatch'),
      'a floor that needs no currency still reported a currency mismatch',
    )

    const blocking = underBook('financial-positive-reaches-buy', { config: { minimumExecutableWeight: 0.2 } })
    assert.equal(blocking.data.proposedAction, 'WAIT', 'a weight floor above the sized position did not bind')
    assert.ok(codesOf(blocking.diagnostics).includes('minimum_executable_not_met'))

    /**
     * ⛔ **On a won book it wins over the amount too.** 500,000 on a five-million-won
     * book is 0.1 and refuses this case; the stated 0.01 does not, and which answer
     * arrives is the whole of «stated wins».
     */
    const won = underBook('financial-positive-reaches-buy', {
      currency: 'KRW',
      totalValue: 5_000_000,
      config: { minimumExecutableWeight: 0.01 },
    })
    assert.equal(won.data.proposedAction, 'BUY', 'the amount governed a run that stated the floor as a weight')
    assert.ok(!codesOf(won.diagnostics).includes('minimum_executable_from_position'))
  }
  ok('#845 — `config.minimumExecutableWeight` needs no currency and wins over the published amount')

  /**
   * ⛔ **An unrecognised code compares unequal rather than being validated.** The host's
   * own table knows five currencies and guesses the rest, and a second list in a package
   * is a list that goes stale against the first — so the safe direction is that a code
   * nobody recognises leaves the floor *undeclared* rather than dividing won by it.
   */
  {
    const odd = underBook('financial-positive-reaches-buy', {
      currency: 'KRW',
      totalValue: 5_000_000,
      config: { minimumExecutablePositionCurrency: 'XYZ' },
    })
    assert.ok(codesOf(odd.diagnostics).includes('minimum_executable_currency_mismatch'))
    /**
     * ⚠️ **The book is small enough that the won amount would bind if the code were
     * ignored** — 500,000 over five million is 0.2 and refuses this case — so `BUY` is
     * the answer only if the unrecognised code actually stood the floor down.
     */
    assert.equal(odd.data.proposedAction, 'BUY', 'an unrecognised floor currency was treated as the pre-registered one')
    assert.ok(!codesOf(odd.diagnostics).includes('minimum_executable_not_met'))
  }
  ok('#845 — a floor currency this package does not recognise is undeclared and never applied anyway')

  /**
   * ⛔ **The differential the whole change is held to: a won book does not move.** Every
   * one of the fifteen, under the host's Mandate and the two configurations #841 pinned,
   * answers exactly what it answered — the currency axis only ever *stops* an amount
   * being applied to money it is not an amount of.
   *
   * ⚠️ Stating the currency explicitly and leaving it to the pre-registered default are
   * the same run, which is what makes the default a default rather than a second answer.
   */
  {
    for (const totalValue of [WON_BOOK, 5_000_000]) {
      for (const fixture of cases.cases) {
        const bare = underBook(fixture.id, { currency: 'KRW', totalValue })
        const spelled = underBook(fixture.id, {
          currency: 'KRW',
          totalValue,
          config: { minimumExecutablePositionCurrency: 'KRW' },
        })
        assert.equal(
          JSON.stringify(spelled),
          JSON.stringify(bare),
          `${fixture.id}: naming the pre-registered floor currency moved a won book`,
        )
      }
    }
    const acting = new Map([
      ['financial-positive-reaches-buy', ['BUY', 'buy-path', 0.05333333]],
      ['reference-plan-is-classified-not-screened-out', ['BUY', 'buy-path', 0.05714286]],
      ['account-concentration-caps-never-sum', ['WAIT', 'trim-or-exit-review', 0.05333333]],
      ['a-cap-binds-the-total-and-the-increment-is-what-is-left', ['BUY', 'buy-path', 0.05333333]],
    ])
    for (const [id, [action, route, weight]] of acting) {
      const answer = underBook(id, { currency: 'KRW', totalValue: WON_BOOK })
      assert.equal(answer.data.proposedAction, action, `${id}: the won book stopped reaching ${action}`)
      assert.equal(answer.data.route, route, `${id}: route moved on the won book`)
      assert.equal(answer.data.targetTotalWeight, weight, `${id}: the weight moved on the won book`)
    }
  }
  ok('#845 — the won book this package was written for answers exactly what it answered')
}

console.log(`\nshareholder-rerating ok — ${checked} check(s)`)
