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
  ROUTES,
  THRESHOLDS,
  concentration,
  evaluateCase,
  returnComposition,
  stagedIncrement,
} from '../managers/shareholder-rerating/lib/index.mjs'

const fixtureRoot = new URL('../managers/shareholder-rerating/fixtures/', import.meta.url)
const read = async (name) => JSON.parse(await readFile(new URL(name, fixtureRoot), 'utf8'))

const cases = await read('cases.json')
const composition = await read('return-composition.json')
const staged = await read('staged-plans.json')
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

  for (const key of ['case', 'route', 'outcomeCode', 'proposedAction', 'targetWeight', 'lossFraction', 'discountToBase', 'investorCashReturn', 'buybackYield', 'returnHeadroomYield', 'projectedExposure']) {
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
    openProposals: [{ symbol: 'A', sector: 'financials', weight: 0.03, strategy: 'catalyst-turnaround', decisionId: 'dec_x' }],
    caps: { accountPositionCap: 0.1, strategyPositionCap: 0.08 },
    strategy: 'shareholder-rerating',
  })
  assert.equal(answer.data.bindingPositionCap, 0.08, 'the binding cap is the smaller of the two, never their sum')
  assert.equal(answer.data.existingExposure, 0.09, 'an open proposal from another strategy is exposure and is counted')
  assert.equal(answer.data.withinLimits, false)
  assert.equal(answer.data.outcomeCode, 'risk_limit_exceeded')
  assert.ok(codesOf(answer.diagnostics).includes('strategy_caps_do_not_sum'))
  assert.ok(codesOf(answer.diagnostics).includes('overlapping_open_proposal'))
  ok('per-strategy and account caps fold by minimum, over holdings and open proposals together')
}
{
  const withoutOpen = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: [{ symbol: 'A', weight: 0.06 }],
    caps: { accountPositionCap: 0.1 },
  })
  const withOpen = concentration({
    proposed: { symbol: 'A', weight: 0.03 },
    holdings: [{ symbol: 'A', weight: 0.06 }],
    openProposals: [{ symbol: 'A', weight: 0.03 }],
    caps: { accountPositionCap: 0.1 },
  })
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
    caps: { accountPositionCap: 0.1 },
  })
  assert.equal(duplicated.data.held, 0.06, 'one position was counted twice because two theses were attached to it')
  assert.ok(codesOf(duplicated.diagnostics).includes('duplicate_position_rows'))
  ok('a position is one quantity however many theses point at it')
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
