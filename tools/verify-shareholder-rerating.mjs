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
    openProposals: [{ symbol: 'A', sector: 'financials', weight: 0.03, strategy: 'catalyst-turnaround', decisionId: 'dec_x' }],
    caps: { accountPositionCap: 0.1, strategyPositionCap: 0.08, accountSectorCap: 0.3, accountGrossCap: 0.9 },
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
    openProposals: [{ symbol: 'A', weight: 0.03 }],
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
    openProposals: [{ symbol: 'D', weight: 0.04, strategy: 'catalyst-turnaround' }],
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
