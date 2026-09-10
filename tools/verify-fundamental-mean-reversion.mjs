/**
 * Does `fundamental-mean-reversion` still classify what its fixtures say it does?
 *
 *   node tools/verify-fundamental-mean-reversion.mjs
 *
 * ── Why this package gets a checker and most do not ────────────────────────
 *
 * The catalogue's default is prose, and this package is mostly prose. What it
 * ships beside the prose is the small set of things #259 and #256 require to be
 * **checkably** right rather than model-judged, and every one of them is a place
 * where a wrong answer is silent: a fall that no session printed, a stabilisation
 * condition loosened until the reference case passes, a stop price treated as a
 * fill, a staged plan that adds twice on a re-run, a price band written up as a
 * valuation. None of those looks wrong from inside the run that makes it.
 *
 * ── The one assertion that is not about the code ───────────────────────────
 *
 * The thresholds are pinned **here as literals** and compared against
 * `lib/core.mjs`. That is deliberately a second copy, and it is the only second
 * copy in this file: #259 fixes the period, RSI and price conditions in the pull
 * request that adds the package and forbids adjusting them to make the reference
 * case pass, so a later edit to `THRESHOLDS` has to arrive as a diff in a file
 * whose only subject is that they did not move. A constant that can be tuned
 * quietly is a constant that is tuned on the day the answer is uncomfortable.
 *
 * ── What a green tick here does not establish ──────────────────────────────
 *
 * ⛔ The bars are **synthetic shapes**, generated once and committed. They are
 * not any listed company's prices, and no assertion below is evidence about a
 * market. What they establish is that a given shape reaches a given branch, which
 * is what a classifier can be held to offline.
 *
 * ⛔ Nothing here runs against a host. Proposal storage, WATCH re-arming, the
 * link from a decision to a real fill, and duplicate-exposure attribution across
 * managers are #256's host-integration criteria and they need a running Aumos.
 * They are named in the pull request rather than reported as passing.
 *
 * Plain Node and `node:assert`, over committed JSON. No test framework is
 * installed in this repository and this does not add one.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DIAGNOSIS_CODES,
  OUTCOMES,
  STRATEGY_ID,
  THRESHOLDS,
  execute,
  concentration,
  normalizeBars,
  reversionTarget,
  round,
  sectorConcentration,
  stabilisation,
  technicalState,
} from '../managers/fundamental-mean-reversion/lib/index.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(ROOT, 'managers', 'fundamental-mean-reversion', 'fixtures')
const read = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'))

const series = read('series.json')
const cases = read('cases.json')
const sizing = read('sizing.json')
const staged = read('staged-plan.json')
const reversion = read('reversion.json')

const ASOF = series.asOf
const rowsOf = (name) => {
  const rows = series.series[name]
  assert.ok(Array.isArray(rows), `fixtures/series.json carries a series named ${name}`)
  return rows.map(([date, open, high, low, close, volume]) => ({ timestamp: `${date}${series.timestampSuffix}`, open, high, low, close, volume }))
}

let checks = 0
const check = (message, fn) => {
  fn()
  checks += 1
  void message
}

// ── ① the pre-registered thresholds have not moved ────────────────────────
check('thresholds are the ones #259 fixed', () => {
  assert.deepEqual(THRESHOLDS.discovery, {
    drawdownWindowBars: 252,
    drawdownFloor: -0.3,
    rsiPeriod: 14,
    rsiCeiling: 35,
    ma200DistanceCeiling: -0.15,
  }, 'the discovery gate is 252 bars, a 30% fall, RSI(14) ≤ 35 and 15% below the 200-bar average')
  assert.deepEqual(THRESHOLDS.stabilisation, {
    baseWindowBars: 120,
    knifeWindowBars: 5,
    minSessionsSinceLow: 15,
    minReclaimAboveBaseLow: 0.05,
    minRsi: 35,
  }, 'the entry gate is a 120-bar base, 5 bars of knife, 15 sessions above the low, a 5% reclaim and RSI ≥ 35')
  assert.deepEqual(THRESHOLDS.integrity, {
    windowBars: 200,
    closeToMa200: { min: 0.1, max: 10 },
    high200ToLow200: { min: 1, max: 20 },
    adjacentLogReturn: 0.5,
  }, 'the series-integrity bounds are the ones #248 measured, unchanged')
  assert.equal(THRESHOLDS.history.minBars, 250)
  assert.equal(THRESHOLDS.sizing.perThesisRiskBudget, 0.0075)
  assert.equal(THRESHOLDS.sizing.gapHaircutFloor, 0.03)
  assert.equal(THRESHOLDS.sizing.gapHaircutCap, 0.15)
  assert.equal(THRESHOLDS.sizing.haltHaircut, 0.02)
  assert.equal(THRESHOLDS.wait.maxWaitDaysDefault, 120)
})

// ── ② every case still reaches the branch it reaches ──────────────────────
const reached = new Map()
for (const row of cases.cases) {
  const answer = execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: {
      ...row.input,
      series: { adjustment: row.declared ?? undefined, corporateActions: row.corporateActions ?? [], rows: rowsOf(row.series) },
    },
  })
  reached.set(row.name, answer)

  check(row.name, () => {
    assert.ok(OUTCOMES.includes(answer.outcome), `${row.name}: ${answer.outcome} is in this package's outcome vocabulary`)
    assert.equal(answer.outcome, row.expect.outcome, `${row.name}: outcome`)
    assert.equal(answer.verdict, row.expect.verdict, `${row.name}: verdict`)
    assert.equal(answer.code, row.expect.code, `${row.name}: diagnosis code`)
    assert.equal(answer.lens, row.expect.lens, `${row.name}: lens`)
    if (answer.code !== null) assert.ok(DIAGNOSIS_CODES.includes(answer.code), `${row.name}: ${answer.code} is one of #256's four`)

    // The measured block is committed so that a change in the arithmetic shows
    // up as a fixture diff rather than as a quiet re-ranking.
    assert.equal(answer.technical?.drawdownFromHigh ?? null, row.measured.drawdownFromHigh, `${row.name}: drawdown`)
    assert.equal(answer.technical?.rsi14 ?? null, row.measured.rsi14, `${row.name}: RSI`)
    assert.equal(answer.technical?.ma200Distance ?? null, row.measured.ma200Distance, `${row.name}: distance from the 200-bar average`)
    assert.equal(answer.discovery?.researchOpen ?? null, row.measured.researchOpen, `${row.name}: whether the discovery gate opened`)
    assert.equal(answer.stabilisation?.outcome ?? null, row.measured.stabilisation, `${row.name}: stabilisation outcome`)
  })
}

// ── ③ a package where every case ends in WAIT is not a success (#256) ─────
check('the cases reach different outcomes', () => {
  const outcomes = new Set([...reached.values()].map((answer) => answer.outcome))
  const verdicts = new Set([...reached.values()].map((answer) => answer.verdict))
  for (const required of ['mean-reversion-candidate', 'falling-knife', 'structural-earnings-damage', 'data-missing', 'price-artifact-suspected', 'target-reached-trim', 'invalidated-re-adjudicate', 'deadline-elapsed-re-adjudicate', 'risk-limit-exceeded', 'stabilization-unconfirmed', 'uptrend-pullback-not-this-strategy', 'out-of-scope', 'research-incomplete']) {
    assert.ok(outcomes.has(required), `some case reaches ${required}`)
  }
  assert.ok(verdicts.has('BUY'), 'a completed positive thesis reaches BUY — a classifier that can only wait has not been shown to classify anything')
  assert.ok(verdicts.has('TRIM'), 'reaching the recovery target leads to a staged trim')
  assert.ok(verdicts.has('RE_ADJUDICATE'), 'invalidation and an elapsed deadline lead to an explicit re-judgement')
})

// ── ④ a re-judgement may not be answered by waiting ───────────────────────
check('RE_ADJUDICATE leaves neither WAIT nor WATCH open', () => {
  for (const name of ['invalidation-triggered', 'deadline-elapsed']) {
    const answer = reached.get(name)
    assert.equal(answer.verdict, 'RE_ADJUDICATE')
    assert.deepEqual([...answer.ampActions], ['RESIZE', 'SELL'], `${name}: the position is resized or closed, or the thesis is re-judged in writing`)
    assert.ok(!answer.ampActions.includes('WAIT') && !answer.ampActions.includes('WATCH'), `${name}: a broken low or an elapsed deadline is not answered by holding quietly`)
  }
})

// ── ⑤ the #248 regression: an artefact is not an opportunity ──────────────
check('an unadjusted split does not manufacture an oversold signal', () => {
  const answer = reached.get('unadjusted-split-declared-adjusted')
  assert.equal(answer.outcome, 'price-artifact-suspected')
  assert.equal(answer.lens, null, 'an unreadable series is given no lens — an artefact does not get to name the methodology it belongs to')
  assert.ok(
    (answer.blocking ?? []).includes('price_series_discontinuity_suspected'),
    'the step by a factor is what refused it, and it is named',
  )
  // And the artefact would otherwise have sailed through: this is the whole point.
  assert.ok(answer.technical.drawdownFromHigh < THRESHOLDS.discovery.drawdownFloor, 'the artefact\'s "drawdown" clears the research gate on its own')
  assert.equal(answer.discovery.researchOpen, true, 'so the gate would have opened on a fall no session printed')
  assert.equal(answer.technical.discontinuity.jumpCount, 1, 'one adjacent session steps by more than 50%')
})

check('an ex-dividend series does not manufacture one either', () => {
  const declared = reached.get('ex-dividend-unadjusted-series')
  assert.equal(declared.outcome, 'data-missing')
  assert.ok(
    declared.diagnostics.some((row) => row.code === 'adjustment_basis_unusable'),
    'a series that says it is unadjusted and declares an action in the window is refused by declaration',
  )

  // ⚠️ The contrast is the assertion. A distribution leaves no step and no
  // outlier session — nothing in the bars can see it — so what is compared is
  // the same rows read two ways against the rows that are actually adjusted.
  const mislabelled = reached.get('ex-dividend-same-rows-called-adjusted')
  const truth = reached.get('ex-dividend-truly-adjusted-series')
  assert.equal(mislabelled.technical.discontinuity.jumpCount, 0, 'the accumulated distributions leave no step for any reading of the bars to find')
  assert.ok(mislabelled.technical.drawdownFromHigh <= THRESHOLDS.discovery.drawdownFloor, 'read as adjusted, the unadjusted series clears the 30% research gate')
  assert.equal(mislabelled.discovery.researchOpen, true)
  assert.ok(truth.technical.drawdownFromHigh > THRESHOLDS.discovery.drawdownFloor, 'and the truly adjusted series never fell that far')
  assert.equal(truth.discovery.researchOpen, false)
  assert.equal(truth.outcome, 'out-of-scope', 'so the real answer is that this is not a candidate at all')
})

// ── ⑥ no future information across an earnings date ───────────────────────
check('rows dated after asOf reach no reading', () => {
  const withFuture = technicalState(normalizeBars(rowsOf('shock-then-base-with-future-rows'), ASOF).bars)
  const without = technicalState(normalizeBars(rowsOf('shock-then-base'), ASOF).bars)
  assert.deepEqual(withFuture, without, 'the three post-asOf sessions — one of them a 14% earnings jump — change nothing this package computes')
  assert.equal(reached.get('no-future-rows-across-an-earnings-date').outcome, reached.get('temporary-shock-plus-stabilisation').outcome)
})

// ── ⑦ being below the 200-bar average is not the strategy, and not an exclusion ─
check('an uptrend pullback is told apart from an oversold recovery', () => {
  const pullback = reached.get('uptrend-pullback')
  assert.equal(pullback.outcome, 'uptrend-pullback-not-this-strategy')
  assert.ok(pullback.technical.ma200Distance > 0 && pullback.technical.ma200Rising === true, 'price above a rising 200-bar average')
  assert.ok(pullback.technical.drawdownFromHigh <= THRESHOLDS.discovery.drawdownFloor, 'and it fell far enough to have been taken for one of ours')

  const ours = reached.get('temporary-shock-plus-stabilisation')
  assert.ok(ours.technical.ma200Distance < 0, 'the case this methodology does trade is below that average')
  assert.equal(ours.outcome, 'mean-reversion-candidate', 'and being below it excludes nothing')
})

// ── ⑧ the reference plan's shape ──────────────────────────────────────────
check('the reference shape classifies as mean reversion, and WATCH is an acceptable answer', () => {
  const answer = reached.get('reference-plan-shape')
  assert.equal(answer.lens, 'fundamental-mean-reversion', 'the plan is this methodology\'s kind of plan')
  assert.ok(['WATCH', 'WAIT'].includes(answer.verdict), 'and the answer at that instant is a wait, because the stabilisation evidence is not there')
  assert.equal(answer.stabilisation.outcome, 'stabilization-unconfirmed')
  assert.ok((answer.stabilisation.unmet ?? []).includes('reclaimAboveBaseLow'), 'one first bounce is not a reclaim')
  // ⛔ Nothing here is loosened to reproduce a historical purchase, and no
  // assertion below says the outcome should have been BUY.
})

// ── ⑨ sizing: a stop is not a fill, and the account's limit is the account's ─
const sized = new Map()
for (const row of sizing.cases) {
  const answer = execute({ operation: 'positionSizing', asOf: ASOF, input: { ...row.input, rows: rowsOf(row.series) } })
  sized.set(row.name, answer)
  check(`sizing/${row.name}`, () => {
    assert.equal(answer.status, row.measured.status, `${row.name}: status`)
    assert.equal(answer.code ?? null, row.measured.code, `${row.name}: code`)
    assert.equal(answer.effectiveLoss ?? null, row.measured.effectiveLoss, `${row.name}: effective loss`)
    assert.equal(answer.targetTotalWeight ?? null, row.measured.targetTotalWeight, `${row.name}: target total weight`)
    assert.equal(answer.incrementalWeight ?? null, row.measured.incrementalWeight, `${row.name}: incremental weight`)
    assert.equal(answer.atOrAboveTarget ?? null, row.measured.atOrAboveTarget, `${row.name}: at-or-above-target`)
    assert.equal(answer.bindingConstraint ?? null, row.measured.bindingConstraint, `${row.name}: binding constraint`)
  })
}

check('a gap-down history sizes smaller than a calm one', () => {
  const calm = sized.get('calm-series')
  const gap = sized.get('gap-down-series')
  const halted = sized.get('halted-name')
  assert.ok(gap.effectiveLoss > calm.effectiveLoss, 'the same stop distance costs more where the price has gapped through levels')
  assert.ok(gap.targetTotalWeight < calm.targetTotalWeight, 'so the position is smaller')
  assert.ok(halted.effectiveLoss > calm.effectiveLoss, 'a halted name costs the halt haircut on top')
  assert.ok(halted.targetTotalWeight < calm.targetTotalWeight)
  assert.ok(calm.haircut.total >= THRESHOLDS.sizing.gapHaircutFloor, 'and a quiet history still pays the floor, because a quiet history is not a promise')
})

check('concentration counts real holdings and open proposals together', () => {
  const held = sized.get('held-by-another-strategy')
  assert.equal(held.exposure.existingWeight, 0.085, 'a 6% holding under one strategy, under another strategy\'s open proposal asking for a total of 8.5%, is 8.5% of exposure to one name')
  assert.equal(held.bindingConstraint, 'single-name-headroom')
  assert.equal(held.targetTotalWeight, 0.015, 'so the 10% account ceiling leaves 1.5%')
  assert.ok(held.targetTotalWeight < sized.get('calm-series').targetTotalWeight, 'which is less than the risk budget alone would have taken')

  const strategyCap = sized.get('per-strategy-cap-cannot-raise-the-account-cap')
  assert.equal(strategyCap.targetTotalWeight, held.targetTotalWeight, 'a 20% per-strategy allowance does not raise a 10% account ceiling')
  assert.ok(
    strategyCap.diagnostics.some((row) => row.code === 'strategy_cap_exceeds_account_cap'),
    'and the attempt is reported rather than obeyed',
  )

  const full = sized.get('no-headroom-left')
  assert.equal(full.status, 'refused')
  assert.equal(full.code, 'risk_limit_exceeded', 'no room is a finding about the book — never `thesis_refuted` and never `data_missing`')
})

/**
 * ── #813: the host states a **total**, and three books it is measured on ───
 *
 * The scenarios are the A/B/C of `untilled/aumos` PR #815, which drove the real
 * host — `Kernel.decide`, real `position_assignments`, `discoveryService`'s
 * `portfolio-get` — and fed its answer to this package's own `lib`. The fund is
 * ₩100,000,000 on XKRX with a 20% single-name ceiling, and the third column is
 * what that host actually produces once the orders go out:
 *
 *   A  held 0%  · pending total 8%   → 8%   (unchanged by #813)
 *   B  held 6%  · pending total 12%  → 12%  (this package said 18%; sized 0.02)
 *   C  held 6%  · pending total 15%  → 15%  (said 21%: refused outright)
 *
 * ⚠️ **B and C are the shape of the defect**: a name that is *already held* and
 * *also* carries a pending total. In A the two readings coincide — nobody holds
 * the name — which is why #810's measurement, every row of which was an unheld
 * name, could not tell them apart. ⚠️ And this package named its proposal field
 * `targetWeight`, the host's own noun, while adding it to the holding: one word
 * meaning two things on the two sides of one boundary.
 */
const HOST_ABC = [
  { label: 'A — held 0%, pending total 8%', held: 0, pendingTotal: 0.08, exposure: 0.08, naive: 0.08 },
  { label: 'B — held 6%, pending total 12%', held: 0.06, pendingTotal: 0.12, exposure: 0.12, naive: 0.18 },
  { label: 'C — held 6%, pending total 15%', held: 0.06, pendingTotal: 0.15, exposure: 0.15, naive: 0.21 },
]

for (const scenario of HOST_ABC) {
  check(`#813 ${scenario.label} — the pending total is folded by maximum, and the sizing still runs`, () => {
    const book = {
      holdings: scenario.held > 0 ? [{ symbol: 'FMR001', sector: 'technology', weight: scenario.held, strategy: 'catalyst-turnaround' }] : [],
      openProposals: [{ symbol: 'FMR001', sector: 'technology', targetWeight: scenario.pendingTotal, strategy: 'shareholder-rerating' }],
    }
    const folded = concentration(book, 'FMR001')
    assert.equal(folded.existingWeight, scenario.exposure, `${scenario.label}: the fund's exposure to this name`)
    if (scenario.naive !== scenario.exposure) {
      assert.notEqual(folded.existingWeight, scenario.naive, `${scenario.label}: the holding and the pending total were added`)
    }
    assert.equal(folded.heldWeight, scenario.held)
    assert.equal(folded.proposedWeight, round(scenario.exposure - scenario.held), `${scenario.label}: what the pending total still asks for on top of the holding`)
    assert.equal(folded.ownWeight, 0, 'none of it belongs to this manager')
    assert.equal(folded.otherWeight, scenario.exposure)

    /**
     * ⛔ **And it reaches a size.** Under a 20% ceiling every one of the three has
     * room for the risk budget, so the binding constraint is the budget rather
     * than the book — which is the sentence #815 could not write before this.
     */
    const answer = execute({
      operation: 'positionSizing',
      asOf: ASOF,
      input: { ...structuredClone(sizing.cases.find((row) => row.name === 'calm-series').input), mandate: { singleNameCap: 0.2, grossCap: 0.9 }, book, rows: rowsOf('shock-then-base') },
    })
    assert.equal(answer.status, 'ok', `${scenario.label}: a book with room refused to size`)
    assert.equal(answer.code ?? null, null)
    assert.equal(answer.exposure.existingWeight, scenario.exposure)
    assert.equal(answer.bindingConstraint, 'risk-budget', `${scenario.label}: the book bound a position the risk budget should have`)
    assert.equal(answer.targetTotalWeight, 0.04011194, `${scenario.label}: the target the risk budget alone asks for`)
  })
}

check('#813 — a pending trim does not reduce exposure before it fills, and two managers naming one total have agreed on it', () => {
  const trimming = concentration({
    holdings: [{ symbol: 'FMR001', weight: 0.14, strategy: 'fundamental-mean-reversion' }],
    openProposals: [{ symbol: 'FMR001', targetWeight: 0.08, strategy: 'fundamental-mean-reversion' }],
  }, 'FMR001')
  assert.equal(trimming.existingWeight, 0.14, 'a pending trim was read as though it had already filled')
  assert.equal(trimming.proposedWeight, 0, 'a pending total below the holding asked for something on top of it')
  assert.equal(trimming.ownWeight, 0.14, 'and this manager is responsible for all of it')

  const twoManagers = concentration({
    holdings: [{ symbol: 'FMR001', weight: 0.06, strategy: 'catalyst-turnaround' }],
    openProposals: [
      { symbol: 'FMR001', targetWeight: 0.12, strategy: 'shareholder-rerating' },
      { symbol: 'FMR001', targetWeight: 0.12, strategy: 'evidence-gated' },
    ],
  }, 'FMR001')
  assert.equal(twoManagers.existingWeight, 0.12, 'two proposals for the same total were read as a request for twice it')
  assert.equal(twoManagers.otherWeight, 0.12)

  // …and the gross axis folds the same way, or a whole-account ceiling counts one name twice.
  const gross = concentration({
    holdings: [
      { symbol: 'FMR001', weight: 0.06, strategy: 'catalyst-turnaround' },
      { symbol: 'FMR002', weight: 0.1, strategy: 'catalyst-turnaround' },
    ],
    openProposals: [{ symbol: 'FMR001', targetWeight: 0.12, strategy: 'shareholder-rerating' }],
  }, 'FMR001')
  assert.equal(gross.grossExisting, 0.22, 'the gross axis added a holding and its own pending total')
  assert.equal(gross.grossHeld, 0.16)
  assert.equal(gross.grossProposed, 0.06, 'what the pending totals still require over the whole book')
})

check('#813 — the sector axis folds the names before it adds them up', () => {
  const answer = sectorConcentration({
    holdings: [
      { symbol: 'FMR001', sector: 'utilities', weight: 0.06, strategy: 'catalyst-turnaround' },
      { symbol: 'FMR002', sector: 'utilities', weight: 0.1, strategy: 'evidence-gated' },
    ],
    openProposals: [{ symbol: 'FMR001', sector: 'utilities', targetWeight: 0.12, strategy: 'shareholder-rerating' }],
  }, 'utilities', 'FMR001')
  assert.equal(answer.exposure, 0.22, 'the sector total added a holding and its own pending total')
  assert.deepEqual(answer.unclassified, [])
})
/**
 * ── #814/#816: the holding row names its assignee, and the fold does not move ─
 *
 * `untilled/aumos#816` puts an `assignment` — `assigned` · `none` · `released` ·
 * `departed`, plus the assignee's **instance** id — on every holding row
 * `portfolio_get` answers, and the adapter into this package's `book` is the one
 * expression that PR's own measurement used:
 *
 *   `assignment.state === 'assigned' ? (mine ? STRATEGY_ID : that instance) : 'unattributed'`
 *
 * ⛔ **Two axes, and only one of them moves.** `existingWeight` answers *«what will
 * this name be»* and is keyed on the name; `ownWeight`/`otherWeight` answer *«how
 * much of it is mine»*. #813's fold lives on the first axis and #814's assignment
 * on the second, so an assignment arriving changes what is left for this thesis
 * and never what the name totals.
 */
check('#814 — the assignee moves own/other and never the name total', () => {
  const MINE = 'inst_fundamental_mean_reversion'
  const strategyOf = (row) =>
    row.state === 'assigned' ? (row.managerInstanceId === MINE ? STRATEGY_ID : row.managerInstanceId) : 'unattributed'
  const assignment = (state, managerInstanceId = null) => ({ state, managerInstanceId })

  /** PR untilled/aumos#816's own table, reproduced against this branch: no pending, 6% held. */
  const mine = concentration({ holdings: [{ symbol: 'FMR001', weight: 0.06, strategy: strategyOf(assignment('assigned', MINE)) }], openProposals: [] }, 'FMR001')
  assert.equal(mine.existingWeight, 0.06)
  assert.equal(mine.ownWeight, 0.06, 'a position this manager is the assignee of read as somebody else\'s')
  assert.equal(mine.otherWeight, 0)
  for (const view of [assignment('assigned', 'inst_catalyst_turnaround'), assignment('none'), assignment('released'), assignment('departed')]) {
    const answer = concentration({ holdings: [{ symbol: 'FMR001', weight: 0.06, strategy: strategyOf(view) }], openProposals: [] }, 'FMR001')
    assert.equal(answer.existingWeight, 0.06, `${view.state}: the assignee changed what the name totals`)
    assert.equal(answer.ownWeight, 0, `${view.state}: a holding this manager was not assigned was read as its own`)
    assert.equal(answer.otherWeight, 0.06)
  }

  // ── A/B/C again, with the holding assigned three different ways ──────────
  for (const [label, held, pendingTotal, exposure] of [['A', 0, 0.08, 0.08], ['B', 0.06, 0.12, 0.12], ['C', 0.06, 0.15, 0.15]]) {
    for (const view of [assignment('assigned', MINE), assignment('assigned', 'inst_catalyst_turnaround'), assignment('none')]) {
      const answer = concentration({
        holdings: held > 0 ? [{ symbol: 'FMR001', weight: held, strategy: strategyOf(view) }] : [],
        openProposals: [{ symbol: 'FMR001', targetWeight: pendingTotal, strategy: 'inst_shareholder_rerating' }],
      }, 'FMR001')
      assert.equal(answer.existingWeight, exposure, `${label}/${view.state}: the fold read the assignment`)
      assert.equal(answer.heldWeight, held)
      assert.equal(answer.ownWeight, view.managerInstanceId === MINE ? held : 0, `${label}/${view.state}: own exposure`)
      assert.equal(answer.otherWeight, round(exposure - (view.managerInstanceId === MINE ? held : 0)))
    }
  }
})

/**
 * ── #817: the number that leaves, and it is neither of the two that stay ────
 *
 * `#813` and `#814` were both the **reading** direction — how the host's answer
 * becomes a row of this package's `book`. This is the **writing** direction, and
 * nothing had said anything about it:
 *
 *   `targetTotalWeight`  the cap **less what everyone else has** — this thesis's
 *                        share of the position
 *   host `targetWeight`  the **whole** position's weight, which
 *                        `rebalanceShadowBook` executes without ever reading
 *                        attribution (`untilled/aumos#815`)
 *
 * ⛔ **On an unattributed holding the difference is a sale.** `untilled/aumos#817`
 * drove the real host over a 6% holding assigned to nobody: this package reached
 * BUY, sized `0.0375`, and handing that number over produced `sell:22` — an order
 * against a position no judgement on the fund ever asked to reduce. Nothing
 * stopped it: `#786` refuses a judgement on **another manager's** position and an
 * unattributed one has no manager to be somebody else's.
 *
 * ⚠️ **The addend is `otherHeldWeight` and never `otherWeight`.** The second folds
 * open proposals in — right for a ceiling, since a limit must hold in every state
 * the account passes through, and wrong for an order, since an unfilled proposal
 * is not a position. Adding one would have this run buy another manager's
 * unapproved judgement for them.
 */
check('#817 — a BUY over an unattributed holding leaves as a buy, and the addend is holdings only', () => {
  const CAP = { singleNameCap: 0.2, grossCap: 0.9 }
  const base = structuredClone(sizing.cases.find((row) => row.name === 'calm-series').input)
  const sizeAgainst = (book) =>
    execute({ operation: 'positionSizing', asOf: ASOF, input: { ...structuredClone(base), mandate: CAP, book, rows: rowsOf('shock-then-base') } })

  /** The issue's book: 6% held by nobody, 12% pending under another manager. */
  const unattributed = sizeAgainst({
    holdings: [{ symbol: 'FMR001', sector: 'technology', weight: 0.06, strategy: 'unattributed' }],
    openProposals: [{ symbol: 'FMR001', sector: 'technology', targetWeight: 0.12, strategy: 'inst_shareholder_rerating' }],
  })
  assert.equal(unattributed.status, 'ok')
  assert.equal(unattributed.exposure.heldWeight, 0.06)
  assert.equal(unattributed.exposure.ownHeldWeight, 0, 'a holding assigned to nobody was read as this manager\'s')
  assert.equal(unattributed.exposure.otherHeldWeight, 0.06, 'a holding assigned to nobody was not carried as somebody else\'s')
  assert.equal(unattributed.exposure.otherWeight, 0.12, 'the ceiling axis still folds the pending total in')
  assert.equal(unattributed.targetTotalWeight, 0.04011194, 'this thesis\'s share of the position')
  assert.equal(unattributed.incrementalWeight, 0.04011194)
  assert.equal(unattributed.hostTargetWeight, 0.10011194, 'the weight handed to the host sold a holding nobody asked to sell')
  assert.ok(unattributed.hostTargetWeight > unattributed.exposure.heldWeight, 'a BUY left this package as a reduction')
  assert.notEqual(unattributed.hostTargetWeight, round(0.12 + unattributed.targetTotalWeight), 'a pending proposal was added to the order — it is exposure for a ceiling and not a position')

  /**
   * ⛔ **Assigned to this manager: the reduction still leaves.** Trimming a
   * position this desk runs is what these methodologies are for, and #817 must
   * not close that door. `otherHeldWeight` is 0, so the two numbers agree.
   */
  const mine = sizeAgainst({
    holdings: [{ symbol: 'FMR001', sector: 'technology', weight: 0.12, strategy: STRATEGY_ID }],
    openProposals: [],
  })
  assert.equal(mine.exposure.ownHeldWeight, 0.12)
  assert.equal(mine.exposure.otherHeldWeight, 0)
  assert.equal(mine.hostTargetWeight, mine.targetTotalWeight, 'with nothing of somebody else\'s in the name the two totals are one number')
  assert.ok(mine.hostTargetWeight < 0.12, 'this manager could no longer reduce its own position')
  assert.equal(mine.atOrAboveTarget, true, 'and it is a reduction question rather than a refusal')

  /** Another manager's holding is the same arithmetic as an unattributed one, and it must be. */
  const theirs = sizeAgainst({
    holdings: [{ symbol: 'FMR001', sector: 'technology', weight: 0.06, strategy: 'inst_catalyst_turnaround' }],
    openProposals: [],
  })
  assert.equal(theirs.exposure.otherHeldWeight, 0.06)
  assert.equal(theirs.hostTargetWeight, unattributed.exposure.otherHeldWeight + theirs.targetTotalWeight)
  assert.ok(theirs.hostTargetWeight > 0.06, 'a judgement on another manager\'s name left as a reduction of it')

  /** An empty book is the case where the defect is invisible — the two totals coincide. */
  const fresh = sizeAgainst({ holdings: [], openProposals: [] })
  assert.equal(fresh.exposure.otherHeldWeight, 0)
  assert.equal(fresh.hostTargetWeight, fresh.targetTotalWeight, 'and this is why an unheld-name measurement could not see any of it')
})

/**
 * ── #819: the same conversion, on the branch that **sells** ────────────────
 *
 * `untilled/aumos#817` closed the buy direction and the review branch never saw
 * it. Driven against the real host, `invalidation-triggered`,
 * `deadline-elapsed` and `target-reached-staged-trim` came back **identical**
 * on a position this desk runs, on another manager's, and on one assigned to
 * nobody — no `sizing` on the answer, so neither attribution number crossed,
 * and an `exit` over a 6% unattributed holding was `sell:60`: the whole
 * position, all of it somebody else's.
 *
 * ⛔ **And an `exit` bypasses every weight this package computes.** Its target
 * is a real `0` (`untilled/aumos#154`), so no arithmetic protects it — the only
 * protection is to stop offering it. `catalyst-turnaround` reached the same
 * conclusion in the form its branch could take (`close-out` comes back as
 * `hostTargetWeight = otherHeld`); this branch sizes nothing, so it says the
 * same thing as a **floor** and by withdrawing `SELL`.
 *
 * ⚠️ **A reduction of this desk's own position still leaves**, which is the
 * whole point of `TRIM` and `RE_ADJUDICATE` and is the thing this fix must not
 * kill.
 */
check('#819 — a review of a position this desk does not run may not leave as a sale', () => {
  const CAP = { singleNameCap: 0.2, grossCap: 0.9 }
  const sizingBase = structuredClone(sizing.cases.find((row) => row.name === 'calm-series').input)
  const sizeAgainst = (holdings) =>
    execute({
      operation: 'positionSizing',
      asOf: ASOF,
      input: { ...structuredClone(sizingBase), mandate: CAP, book: { holdings, openProposals: [] }, rows: rowsOf('shock-then-base') },
    })
  const SYMBOL = sizingBase.symbol
  const held = (weight, strategy) => [{ symbol: SYMBOL, sector: 'technology', weight, ...(strategy === undefined ? {} : { strategy }) }]

  const reviewOf = (name) => {
    const row = cases.cases.find((fixture) => fixture.name === name)
    assert.ok(row, `fixtures/cases.json carries ${name}, which this regression is about`)
    return row
  }
  const classify = (name, sizingAnswer) => {
    const row = reviewOf(name)
    return execute({
      operation: 'classifyCase',
      asOf: ASOF,
      input: {
        ...structuredClone(row.input),
        series: { adjustment: row.declared ?? undefined, corporateActions: row.corporateActions ?? [], rows: rowsOf(row.series) },
        sizing: sizingAnswer,
      },
    })
  }
  const codesOf = (answer) => answer.diagnostics.map((diag) => diag.code)

  /**
   * ⛔ **The issue's book.** 6% held and assigned to nobody — every share bought
   * by hand in a broker app is in this state. The review still happens; what it
   * may no longer do is end in a sale of somebody else's position.
   */
  for (const [label, holdings] of [
    ['unattributed', held(0.06)],
    ['another manager', held(0.06, 'inst_catalyst_turnaround')],
  ]) {
    const answer = classify('invalidation-triggered', sizeAgainst(holdings))
    assert.equal(answer.outcome, 'invalidated-re-adjudicate', `${label}: the finding about the thesis is unchanged — this is not a refusal to review`)
    assert.equal(answer.verdict, 'RE_ADJUDICATE', `${label}: the re-judgement still has to be written down`)
    assert.equal(answer.ownHeldWeight, 0, `${label}: a holding this desk was never assigned was read as its own`)
    assert.equal(answer.otherHeldWeight, 0.06, `${label}: the review answer carries no attribution at all`)
    assert.equal(answer.hostTargetWeightFloor, 0.06, `${label}: the review answer named no floor, so any target it produced sold the whole position`)
    assert.deepEqual([...answer.ampActions], ['WATCH'], `${label}: a re-adjudication of a position this desk does not run still offers to sell it`)
    assert.ok(!answer.ampActions.includes('SELL'), `${label}: an exit is a real 0 and would liquidate their holding`)
    assert.ok(codesOf(answer).includes('reviewed_position_is_not_this_desks'), `${label}: nothing said whose position it is`)
    /** ⚠️ The review branch answered no `sizing` at all, so neither weight reached the model. */
    assert.ok(answer.sizing?.exposure, `${label}: the review answer carries no sizing, so the run reading it has no numbers to reduce against`)
    assert.equal(answer.sizing.hostTargetWeight, round(0.06 + answer.sizing.targetTotalWeight), `${label}: the buy-direction total is still assembled the way #817 assembles it`)
    assert.ok(!codesOf(answer).includes('data_missing'), `${label}: an explicit book was reported as missing data, which is the state untilled/aumos#782 undid`)
  }

  /** The same on the other two review branches: one fix, three doors. */
  for (const name of ['deadline-elapsed', 'target-reached-staged-trim']) {
    const answer = classify(name, sizeAgainst(held(0.06)))
    assert.deepEqual([...answer.ampActions], ['WATCH'], `${name}: this branch was left offering a sale of somebody else's position`)
    assert.equal(answer.hostTargetWeightFloor, 0.06, `${name}: no floor left with the answer`)
  }

  /**
   * ⛔ **A reduction of this desk's own position still leaves, unchanged.** #819
   * must not turn every review into a no-op: that is the «safely do nothing»
   * state `untilled/aumos#782` undid.
   */
  const mine = classify('invalidation-triggered', sizeAgainst(held(0.12, STRATEGY_ID)))
  assert.equal(mine.ownHeldWeight, 0.12)
  assert.equal(mine.otherHeldWeight, 0)
  assert.equal(mine.hostTargetWeightFloor, 0, 'with nothing of anybody else\'s in the name the floor is 0, which is the host\'s exit')
  assert.deepEqual([...mine.ampActions], ['RESIZE', 'SELL'], 'a review of this desk\'s own position stopped being able to close it')
  assert.ok(!codesOf(mine).includes('reviewed_position_is_not_this_desks'))

  /**
   * ⚠️ **A shared position keeps the resize and loses the exit.** There is
   * something here to reduce, and the reduction is a total at or above the
   * floor rather than a `0`.
   */
  const shared = classify('invalidation-triggered', sizeAgainst([...held(0.04, STRATEGY_ID), ...held(0.06, 'inst_shareholder_rerating')]))
  assert.equal(shared.ownHeldWeight, 0.04)
  assert.equal(shared.otherHeldWeight, 0.06)
  assert.equal(shared.hostTargetWeightFloor, 0.06)
  assert.deepEqual([...shared.ampActions], ['RESIZE'], 'a shared position could still be exited, and an exit takes their half with it')
  assert.ok(codesOf(shared).includes('reduction_is_bounded_by_anothers_holding'))

  /** An account nobody folded is not an account with nobody in it. */
  const unread = classify('invalidation-triggered', null)
  assert.equal(unread.ownHeldWeight, null, 'an unread book answered 0, which is the reading that says nobody else holds this')
  assert.equal(unread.otherHeldWeight, null)
  assert.equal(unread.hostTargetWeightFloor, null)
  assert.deepEqual([...unread.ampActions], ['RESIZE', 'SELL'], 'the published actions moved on an answer that measured nothing')
  assert.ok(codesOf(unread).includes('review_exposure_unread'), 'the run was not told that its reduction has no floor')
})

check('config may narrow the risk budget and may not widen it', () => {
  const widened = sized.get('config-may-not-widen-the-risk-budget')
  assert.equal(widened.riskBudget, THRESHOLDS.sizing.perThesisRiskBudget)
  assert.ok(widened.diagnostics.some((row) => row.code === 'config_loosens_preregistered_threshold'))
  assert.equal(widened.targetTotalWeight, sized.get('calm-series').targetTotalWeight)
})

check('an invalidation above the entry is unsized rather than assumed', () => {
  const answer = sized.get('invalidation-above-entry')
  assert.equal(answer.status, 'refused')
  assert.equal(answer.code, 'research_incomplete', 'a thesis with no measurable loss is unfinished research, not a refuted one')
})

// ── ⑩ the staged ledger ───────────────────────────────────────────────────
for (const row of staged.cases) {
  const answer = execute({ operation: 'stagedPlan', asOf: ASOF, input: { plan: row.plan, stageId: row.stageId, satisfied: row.satisfied, gate: row.gate } })
  check(`staged/${row.name}`, () => {
    assert.equal(answer.status, row.expect.status, `${row.name}: status`)
    if (row.expect.code) assert.equal(answer.code, row.expect.code, `${row.name}: code`)
    assert.equal(answer.state?.committedWeight ?? null, row.measured.committedWeight, `${row.name}: committed weight`)
  })
}

check('a re-run does not add twice', () => {
  const plan = staged.cases.find((row) => row.name === 're-run-does-not-double-add')
  const before = execute({ operation: 'stagedPlan', asOf: ASOF, input: { plan: plan.plan } })
  const again = execute({ operation: 'stagedPlan', asOf: ASOF, input: { plan: plan.plan, stageId: plan.stageId, satisfied: plan.satisfied, gate: plan.gate } })
  assert.equal(again.status, 'refused')
  assert.equal(again.code, 'stage_already_filled')
  assert.equal(again.state.committedWeight, before.state.committedWeight, 'the cumulative target has not moved')
  assert.deepEqual(again.plan, plan.plan, 'and the ledger comes back unchanged rather than absent, so a run writing the answer back verbatim cannot erase it')
})

check('no stage fires on price or elapsed time alone', () => {
  for (const name of ['price-alone-is-not-a-stage', 'elapsed-time-alone-is-not-a-stage']) {
    const row = staged.cases.find((entry) => entry.name === name)
    const answer = execute({ operation: 'stagedPlan', asOf: ASOF, input: { plan: row.plan, stageId: row.stageId, satisfied: row.satisfied, gate: row.gate } })
    assert.equal(answer.code, 'stage_condition_price_or_time_only', `${name}: averaging into a falling price is not the execution of a plan`)
  }
})

// ── ⑪ a bounce is never written up as a valuation ─────────────────────────
for (const row of reversion.cases) {
  const answer = execute({ operation: 'reversionTarget', asOf: ASOF, input: { ...row.input, rows: rowsOf(row.series) } })
  check(`target/${row.name}`, () => {
    assert.equal(answer.status, row.expect.status, `${row.name}: status`)
    if (row.expect.kind) assert.equal(answer.kind, row.expect.kind, `${row.name}: kind`)
    if (row.expect.code) {
      assert.ok(answer.diagnostics.some((entry) => entry.code === row.expect.code), `${row.name}: ${row.expect.code}`)
    }
    assert.equal(answer.mid ?? null, row.measured.mid, `${row.name}: the middle of the range`)
  })
}

check('a technical target cannot be labelled a valuation', () => {
  const refused = execute({ operation: 'reversionTarget', asOf: ASOF, input: { basis: 'moving-average', movingAverage: 'ma200', claimedKind: 'valuation', rows: rowsOf('shock-then-base') } })
  assert.equal(refused.status, 'refused')
  assert.ok(refused.diagnostics.some((row) => row.code === 'technical_target_labelled_as_valuation'))

  const technical = execute({ operation: 'reversionTarget', asOf: ASOF, input: { basis: 'moving-average', movingAverage: 'ma200', rows: rowsOf('shock-then-base') } })
  assert.equal(technical.kind, 'technical', 'the kind is derived from the basis and never accepted from the caller')

  const band = execute({ operation: 'reversionTarget', asOf: ASOF, input: { basis: 'historical-price-band', referenceWindow: { from: '2025-08-01', to: '2026-03-01' }, rows: rowsOf('shock-then-base') } })
  assert.equal(band.kind, 'price-history')
  assert.ok(band.high <= band.close * 100 && band.high <= technical.close * 100)

  const unsupported = execute({ operation: 'reversionTarget', asOf: ASOF, input: { basis: 'normalised-earning-power', earningPower: { normalisedEps: 12000 }, rows: rowsOf('shock-then-base') } })
  assert.equal(unsupported.status, 'refused')
  assert.ok(unsupported.diagnostics.some((row) => row.code === 'target_basis_unsupported'), 'a valuation label without the figures behind it is refused rather than downgraded quietly')
})

check('the old high is never assumed to be recovered', () => {
  const answer = execute({ operation: 'reversionTarget', asOf: ASOF, input: { basis: 'moving-average', movingAverage: 'ma200', rows: rowsOf('flat-range') } })
  assert.equal(answer.status, 'refused')
  assert.ok(answer.diagnostics.some((row) => row.code === 'target_assumes_prior_high_recovered'))
})

/**
 * ── ⑫ the absence audit: a declared input that is gone may not read as a pass ─
 *
 * Every case below **deletes or blanks one declared input** from an otherwise
 * positive run and asserts the answer changes. That is the whole of the defect
 * class: an account nobody could read defaulting to an account with no
 * positions, an unadjudicable cap being skipped rather than refusing, a clamp's
 * floor standing in for a measurement, a guard written `finite(x) && …` that a
 * caller can omit its way past.
 *
 * ⚠️ **The fixtures on disk are not touched.** Each mutation is made on a deep
 * copy in memory, so the assertions above keep passing for the reasons they
 * always did, and a reviewer can see the *difference* between the two inputs
 * rather than having to diff two fixture files.
 *
 * ⛔ **`data_missing`, never `thesis_refuted`.** Absence is not evidence against
 * a thesis (#254), and every assertion below names the code it expects.
 */
const clone = (value) => JSON.parse(JSON.stringify(value))
const positiveSizing = () => ({
  symbol: 'FMR001',
  entryPrice: 172000,
  invalidationPrice: 145000,
  nav: 400_000_000,
  mandate: { singleNameCap: 0.1, grossCap: 0.9 },
  book: { holdings: [], openProposals: [] },
  execution: { halted: false, dailyPriceLimit: true },
  rows: rowsOf('shock-then-base'),
})
const sizeWith = (mutate) => {
  const input = positiveSizing()
  mutate(input)
  return execute({ operation: 'positionSizing', asOf: ASOF, input })
}
/** The control: unmutated, this input sizes. Every assertion below is a difference from it. */
check('the absence audit has a positive control', () => {
  const control = sizeWith(() => {})
  assert.equal(control.status, 'ok')
  assert.ok(control.targetTotalWeight > 0)
  /**
   * ⚠️ Was `deepEqual(diagnostics, [])`. #269 added an `info` note saying the
   * Mandate declares no sector ceiling — an axis nobody declared and an axis
   * nobody looked at must not leave the same trace — so the assertion is
   * restated at the severity it was always about: nothing here is unevaluated
   * or blocked, which is what authorises a BUY over it.
   */
  assert.deepEqual(
    control.diagnostics.filter((row) => row.severity === 'unevaluated' || row.severity === 'blocked'),
    [],
    'and it carries no unevaluated reading, so a BUY over it is authorised by checks that actually ran',
  )
  assert.deepEqual(
    control.diagnostics.map((row) => row.code),
    ['sector_cap_not_applicable'],
    'a Mandate declaring no sector ceiling has to say so rather than leave the axis silently skipped (#269)',
  )
})

check('an unread book is not an empty book', () => {
  for (const [what, mutate] of [
    ['the whole object', (input) => { delete input.book }],
    ['holdings', (input) => { delete input.book.holdings }],
    ['open proposals', (input) => { delete input.book.openProposals }],
    ['a null book', (input) => { input.book = null }],
  ]) {
    const answer = sizeWith(mutate)
    assert.equal(answer.status, 'refused', `${what} missing: refused`)
    assert.equal(answer.code, 'data_missing', `${what} missing: data_missing, not a refutation`)
    assert.ok(answer.diagnostics.some((row) => row.code === 'book_unreadable'), `${what} missing: named`)
    assert.equal(answer.targetTotalWeight, undefined, `${what} missing: and no weight was produced`)
  }
  // An empty book is a *fact* and still sizes — the distinction is the point.
  const empty = sizeWith((input) => { input.book = { holdings: [], openProposals: [] } })
  assert.equal(empty.status, 'ok', 'a fund that really holds nothing is not missing data')
})

check('an unreadable cap is not an absent cap', () => {
  const gross = sizeWith((input) => { delete input.mandate.grossCap })
  assert.equal(gross.status, 'refused')
  assert.equal(gross.code, 'data_missing')
  assert.ok(gross.diagnostics.some((row) => row.code === 'mandate_gross_cap_missing'), 'the gross cap was named in the contract and is now read or refused')

  const single = sizeWith((input) => { delete input.mandate.singleNameCap })
  assert.equal(single.status, 'refused')
  assert.equal(single.code, 'data_missing')

  // The regression in its original form: 79% of the book held elsewhere, a
  // declared 80% gross cap, and a fresh buy the risk budget would have sized at
  // 4%. The cap must **bind** rather than be skipped.
  const crowded = sizeWith((input) => {
    input.mandate.grossCap = 0.8
    input.book.holdings = [{ symbol: 'OTHER', weight: 0.79, strategy: 'another-manager' }]
  })
  assert.equal(crowded.status, 'ok')
  assert.equal(crowded.bindingConstraint, 'gross-headroom', 'the declared gross cap is what bound it')
  assert.equal(crowded.targetTotalWeight, 0.01, 'so the 4% the risk budget wanted becomes the 1% the cap leaves')
  assert.ok(crowded.targetTotalWeight < crowded.riskWeight)

  // And with the cap already taken, there is no position at all.
  const full = sizeWith((input) => {
    input.mandate.grossCap = 0.8
    input.book.holdings = [{ symbol: 'OTHER', weight: 0.8, strategy: 'another-manager' }]
  })
  assert.equal(full.status, 'refused')
  assert.equal(full.code, 'risk_limit_exceeded')
  assert.equal(full.bindingConstraint, 'gross-headroom')
})

check('an unmeasurable gap haircut refuses rather than taking the floor', () => {
  const answer = sizeWith((input) => { input.rows = input.rows.slice(-5) })
  assert.equal(answer.status, 'refused')
  assert.equal(answer.code, 'data_missing')
  assert.ok(answer.diagnostics.some((row) => row.code === 'gap_haircut_unmeasurable'))
  assert.equal(answer.haircut.measurable, false)
  assert.equal(answer.haircut.total, null, 'and the floor was not supplied in place of a measurement')

  // The floor still does its own job where there *is* a measurement to bound.
  const calm = sized.get('calm-series')
  assert.equal(calm.haircut.measurable, true)
  assert.ok(calm.haircut.bounded >= THRESHOLDS.sizing.gapHaircutFloor)
})

check('an undeclared halt state is unevaluated, and unevaluated does not authorise a BUY', () => {
  const answer = sizeWith((input) => { delete input.execution })
  assert.equal(answer.status, 'ok', 'the sizing still computes — this is a reading it could not take, not one it got wrong')
  const row = answer.diagnostics.find((entry) => entry.code === 'execution_conditions_undeclared')
  assert.ok(row, 'and it says so')
  assert.equal(row.severity, 'unevaluated', 'as unevaluated rather than info, because an info stops nothing')
  assert.deepEqual(row.details.undeclared, ['halted', 'dailyPriceLimit'])

  // …and `classifyCase` refuses to reach BUY over it.
  const positive = cases.cases.find((entry) => entry.name === 'temporary-shock-plus-stabilisation')
  const withUnevaluated = execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: {
      ...clone(positive.input),
      sizing: answer,
      series: { adjustment: 'adjusted', corporateActions: [], rows: rowsOf(positive.series) },
    },
  })
  assert.equal(withUnevaluated.outcome, 'research-incomplete')
  assert.equal(withUnevaluated.code, 'research_incomplete')
  assert.ok(withUnevaluated.unevaluatedSizing.includes('execution_conditions_undeclared'))
})

check('an unreadable liquidity ceiling is missing data, not an absent constraint', () => {
  const answer = sizeWith((input) => { input.rows = input.rows.map((bar) => ({ ...bar, volume: null })) })
  assert.equal(answer.status, 'refused')
  assert.equal(answer.code, 'data_missing')
  assert.ok(answer.diagnostics.some((row) => row.code === 'liquidity_unreadable'))
})

check('the target weight and the buy increment are two fields', () => {
  const control = sizeWith(() => {})
  assert.ok(Number.isFinite(control.targetTotalWeight) && Number.isFinite(control.incrementalWeight))
  assert.equal(control.incrementalWeight, control.targetTotalWeight, 'with nothing held, the two agree — which is exactly why one field looked sufficient')

  // Half the target already held by this strategy: the total is unchanged and
  // the increment is the difference. One field could not have said both.
  const half = sizeWith((input) => { input.book.holdings = [{ symbol: 'FMR001', weight: 0.02, strategy: 'fundamental-mean-reversion' }] })
  assert.equal(half.targetTotalWeight, control.targetTotalWeight, 'a cap is measured against what *other* strategies hold, so the total does not shrink because this thesis re-ran on itself')
  assert.equal(half.incrementalWeight, round(control.targetTotalWeight - 0.02))
  assert.equal(half.atOrAboveTarget, false)

  const complete = sized.get('already-at-its-own-target')
  assert.equal(complete.status, 'ok', 'a completed position is not a refusal')
  assert.equal(complete.incrementalWeight, 0)
  assert.equal(complete.atOrAboveTarget, true)
  assert.ok(complete.targetTotalWeight > 0, 'and the total is still positive, so a reader can tell it from having no room')
  assert.ok(complete.diagnostics.some((row) => row.code === 'position_at_or_above_target'))
})

check('a completed position classifies as its own outcome, not as a risk limit', () => {
  const positive = cases.cases.find((entry) => entry.name === 'temporary-shock-plus-stabilisation')
  const answer = execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: {
      ...clone(positive.input),
      sizing: sized.get('already-at-its-own-target'),
      position: { held: true, weight: 0.045 },
      review: { invalidationTriggered: false, deadlineElapsed: false, targetReached: false },
      series: { adjustment: 'adjusted', corporateActions: [], rows: rowsOf(positive.series) },
    },
  })
  assert.equal(answer.outcome, 'target-weight-already-held')
  assert.equal(answer.verdict, 'WAIT')
  assert.equal(answer.code, null, 'the thesis stands and the book is not the reason — neither a refutation nor a risk limit')
})

check('a held position with no stated review is unadjudicated', () => {
  const positive = cases.cases.find((entry) => entry.name === 'temporary-shock-plus-stabilisation')
  const base = () => ({
    ...clone(positive.input),
    series: { adjustment: 'adjusted', corporateActions: [], rows: rowsOf(positive.series) },
  })
  const silent = execute({ operation: 'classifyCase', asOf: ASOF, input: { ...base(), position: { held: true, weight: 0.03 } } })
  assert.equal(silent.outcome, 'data-missing')
  assert.equal(silent.code, 'data_missing')

  // One explicit `false` is an adjudication and is accepted as one.
  const adjudicated = execute({ operation: 'classifyCase', asOf: ASOF, input: { ...base(), position: { held: true, weight: 0.03 }, review: { invalidationTriggered: false } } })
  assert.notEqual(adjudicated.outcome, 'data-missing', 'a review that ran and found nothing is not missing data')
})

check('the book contradicting the run about a holding stops the run', () => {
  const positive = cases.cases.find((entry) => entry.name === 'temporary-shock-plus-stabilisation')
  const ownedElsewhere = sizeWith((input) => { input.book.holdings = [{ symbol: 'FMR001', weight: 0.02, strategy: 'fundamental-mean-reversion' }] })
  const answer = execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: {
      ...clone(positive.input),
      sizing: ownedElsewhere,
      series: { adjustment: 'adjusted', corporateActions: [], rows: rowsOf(positive.series) },
    },
  })
  assert.equal(answer.outcome, 'data-missing', 'the book says this strategy holds it and the run did not say so, so the review branch was skipped rather than passed')
  assert.equal(answer.code, 'data_missing')
})

check('a stabilisation reading that could not be taken is data-missing, not unconfirmed', () => {
  // Too few bars for the 120-bar base: the readings would otherwise be taken
  // against whatever the oldest available bar happened to be.
  const short = execute({ operation: 'stabilisation', asOf: ASOF, input: { rows: rowsOf('shock-then-base').slice(-40) } })
  assert.equal(short.outcome, 'data-missing')
  assert.notEqual(short.outcome, 'stabilization-unconfirmed')
  assert.notEqual(short.outcome, 'falling-knife')
  assert.ok(short.diagnostics.some((row) => row.code === 'stabilisation_window_short'))

  // An unreadable RSI: the same, and it was already guarded — this pins it.
  const noRsi = stabilisation(normalizeBars(rowsOf('shock-then-base'), ASOF).bars, { ...technicalState(normalizeBars(rowsOf('shock-then-base'), ASOF).bars), rsi14: null })
  assert.equal(noRsi.outcome, 'data-missing')

  // And a base low of zero, which made `reclaimAboveBaseLow` null and used to
  // score as a *failed* condition rather than an unevaluated one.
  const bars = normalizeBars(rowsOf('shock-then-base'), ASOF).bars
  const state = technicalState(bars)
  const brokenBase = stabilisation(bars.map((bar, index) => (index === bars.length - 30 ? { ...bar, low: 0 } : bar)), state)
  assert.equal(brokenBase.outcome, 'data-missing', 'a reading whose value is not a number is unevaluated, and unevaluated is never unmet')
  assert.ok(brokenBase.diagnostics.some((row) => row.code === 'stabilisation_reading_unavailable'))

  // The three outcomes stay three: none of the above is either of the others.
  const outcomes = new Set([
    execute({ operation: 'stabilisation', asOf: ASOF, input: { rows: rowsOf('shock-then-base') } }).outcome,
    execute({ operation: 'stabilisation', asOf: ASOF, input: { rows: rowsOf('new-lows-continuing') } }).outcome,
    execute({ operation: 'stabilisation', asOf: ASOF, input: { rows: rowsOf('reference-shape-first-bounce') } }).outcome,
    short.outcome,
  ])
  assert.deepEqual([...outcomes].sort(), ['confirmed', 'data-missing', 'falling-knife', 'stabilization-unconfirmed'])
})

check('a staged plan missing its own ceiling, expiry or rung weight adds nothing', () => {
  const template = staged.cases.find((row) => row.name === 'first-stage-fires')
  const stageWith = (mutate) => {
    const plan = clone(template.plan)
    mutate(plan)
    return execute({ operation: 'stagedPlan', asOf: ASOF, input: { plan, stageId: 'stage-1', satisfied: ['stabilisation-held', 'thesis-evidence'], gate: clone(template.gate) } })
  }
  const control = stageWith(() => {})
  assert.equal(control.status, 'ok', 'the control still fires')

  for (const [what, mutate, code] of [
    ['no cumulative target', (plan) => { delete plan.plannedTotalWeight }, 'staged_total_unstated'],
    ['a zero cumulative target', (plan) => { plan.plannedTotalWeight = 0 }, 'staged_total_unstated'],
    ['no expiry', (plan) => { delete plan.expiresAt }, 'plan_expiry_unstated'],
    ['an unparseable expiry', (plan) => { plan.expiresAt = 'whenever' }, 'plan_expiry_unstated'],
    ['a rung with no weight', (plan) => { delete plan.stages[0].weight }, 'stage_weight_unstated'],
  ]) {
    const answer = stageWith(mutate)
    assert.equal(answer.status, 'refused', `${what}: refused`)
    assert.equal(answer.code, code, `${what}: ${code}`)
    assert.deepEqual(answer.plan, answer.plan && clone(answer.plan), `${what}: the ledger came back`)
    assert.equal((answer.plan?.filled ?? []).length, 0, `${what}: and nothing was recorded against it`)
  }
})

check('a reversion target whose prior-high check could not run is refused', () => {
  const bars = normalizeBars(rowsOf('shock-then-base'), ASOF).bars
  const state = { ...technicalState(bars), high252: null }
  const answer = reversionTarget({ basis: 'moving-average', movingAverage: 'ma200', bars, state })
  assert.equal(answer.status, 'refused')
  assert.ok(answer.diagnostics.some((row) => row.code === 'target_prior_high_unreadable'), 'a guard that only applies when its input is present is a guard a caller can omit its way past')
})

check('the required-output checklist can be false', () => {
  const positive = cases.cases.find((entry) => entry.name === 'temporary-shock-plus-stabilisation')
  const answer = execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: { ...clone(positive.input), series: { adjustment: 'adjusted', corporateActions: [], rows: [] } },
  })
  assert.equal(answer.requiredOutputs.technicalState, false, 'a checklist entry hardcoded true checks nothing')
  assert.equal(answer.requiredOutputs.stabilisationObservation, false)
})

/**
 * ── #269: a declared sector ceiling this package cannot check ──────────────
 *
 * «This package has no sector concept, therefore it cannot break a sector limit»
 * is a conclusion about the code and not about the account. The host does not
 * enforce a Mandate's sector ceiling and this package did not receive it, so
 * under such a Mandate a correct-looking answer could put the account through a
 * limit its investor had declared. These are the four states of that axis.
 */
check('#269 — an undeclared sector ceiling constrains nothing and says so', () => {
  const answer = sizeWith(() => {})
  assert.equal(answer.status, 'ok')
  assert.equal(answer.sectorExposure, null)
  assert.ok(answer.diagnostics.some((row) => row.code === 'sector_cap_not_applicable' && row.severity === 'info'))
  assert.ok(!answer.ceilings.some((row) => row.name === 'sector-headroom'))
})

check('#269 — a declared sector ceiling is folded like every other ceiling', () => {
  const answer = sizeWith((input) => {
    input.sector = 'internet'
    input.mandate.sectorCap = 0.2
    input.book.holdings = [{ symbol: 'OTHER', sector: 'internet', weight: 0.05, strategy: 'evidence-gated' }]
  })
  assert.equal(answer.status, 'ok')
  assert.equal(answer.sectorExposure.exposure, 0.05)
  const ceiling = answer.ceilings.find((row) => row.name === 'sector-headroom')
  assert.ok(ceiling, 'a declared sector ceiling was read and then not applied')
  assert.equal(ceiling.value, 0.15, 'the sector headroom is the ceiling less what everyone else already has in it')

  const full = sizeWith((input) => {
    input.sector = 'internet'
    input.mandate.sectorCap = 0.05
    input.book.holdings = [{ symbol: 'OTHER', sector: 'internet', weight: 0.05, strategy: 'evidence-gated' }]
  })
  assert.equal(full.status, 'refused')
  assert.equal(full.code, 'risk_limit_exceeded', 'a full sector is a finding about the book, not about the thesis')
})

check('#269 — a declared ceiling whose total cannot be formed withholds the entry as an absence', () => {
  const noCandidateSector = sizeWith((input) => {
    input.mandate.sectorCap = 0.2
  })
  assert.equal(noCandidateSector.status, 'refused')
  assert.equal(noCandidateSector.code, 'data_missing', 'an unformable sector total was recorded as something other than an absence')
  assert.ok(noCandidateSector.diagnostics.some((row) => row.code === 'sector_exposure_unevaluable'))

  /**
   * ⛔ **The hole #269 names: the candidate is classified and the book is not.**
   * A run that looked only at the candidate would size this and buy it.
   */
  const unclassifiedHolding = sizeWith((input) => {
    input.sector = 'internet'
    input.mandate.sectorCap = 0.2
    input.book.holdings = [
      { symbol: 'OTHER', sector: 'internet', weight: 0.05, strategy: 'evidence-gated' },
      { symbol: 'MYSTERY', weight: 0.06, strategy: 'catalyst-turnaround' },
    ]
  })
  assert.equal(unclassifiedHolding.status, 'refused', 'the candidate named its sector, the book could not form one, and the position sized anyway')
  assert.equal(unclassifiedHolding.code, 'data_missing')
  assert.deepEqual(
    unclassifiedHolding.diagnostics.find((row) => row.code === 'sector_exposure_unevaluable')?.details.unclassified,
    ['MYSTERY'],
    'the run has to name the row it could not classify',
  )

  // …and an unapproved proposal, which is exposure that is about to exist.
  const unclassifiedProposal = sizeWith((input) => {
    input.sector = 'internet'
    input.mandate.sectorCap = 0.2
    input.book.openProposals = [{ symbol: 'PENDING', targetWeight: 0.04, strategy: 'shareholder-rerating' }]
  })
  assert.equal(unclassifiedProposal.status, 'refused')
  assert.equal(unclassifiedProposal.code, 'data_missing')
})

check('#269 — the withheld entry is a WATCH about the account, and the held rungs above it still fire', () => {
  const positive = cases.cases.find((entry) => entry.name === 'temporary-shock-plus-stabilisation')
  assert.ok(positive, 'the positive classification fixture is still there')
  const unformableSizing = sizeWith((row) => {
    row.sector = 'internet'
    row.mandate.sectorCap = 0.2
    row.book.holdings = [{ symbol: 'MYSTERY', weight: 0.06, strategy: 'catalyst-turnaround' }]
  })
  const withUnformableSector = () => ({
    ...clone(positive.input),
    sizing: unformableSizing,
    series: { adjustment: 'adjusted', corporateActions: [], rows: rowsOf(positive.series) },
  })
  // The control: the same fixture with its own sizing reaches a BUY.
  const control = execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: { ...clone(positive.input), series: { adjustment: 'adjusted', corporateActions: [], rows: rowsOf(positive.series) } },
  })
  assert.equal(control.verdict, 'BUY', 'the positive control no longer buys, so the assertion below is testing nothing')
  const withheld = execute({ operation: 'classifyCase', asOf: ASOF, input: withUnformableSector() })
  assert.notEqual(withheld.verdict, 'BUY', 'a declared sector ceiling nobody could check let a purchase through')
  assert.equal(withheld.code, 'data_missing', 'the withheld entry was filed as something other than an absence')
  assert.notEqual(withheld.code, 'thesis_refuted')

  /**
   * ⑸ **A reduction is not withheld.** The held-position rungs sit above the
   * sizing, so a trim, a re-adjudication and an exit reach their answers whatever
   * the sector total could not be formed from.
   */
  const held = withUnformableSector()
  held.position = { ...(held.position ?? {}), held: true }
  held.review = { ...(held.review ?? {}), invalidationTriggered: true }
  const reduction = execute({ operation: 'classifyCase', asOf: ASOF, input: held })
  assert.notEqual(reduction.verdict, 'BUY')
  assert.equal(reduction.outcome, 'invalidated-re-adjudicate', `a held position with a fired invalidation reached ${reduction.outcome}`)
  assert.equal(reduction.verdict, 'RE_ADJUDICATE', 'a risk-reducing rung was replaced by the account absence below it')
})

// ── ⑬ asOf is not optional ────────────────────────────────────────────────
check('every operation refuses a call with no asOf', () => {
  for (const operation of ['priceState', 'stabilisation', 'reversionTarget', 'positionSizing', 'stagedPlan', 'classifyCase']) {
    const answer = execute({ operation, input: {} })
    assert.equal(answer.status, 'refused', `${operation} without asOf`)
    assert.equal(answer.diagnostics[0].code, 'as_of_missing')
  }
})

console.log(`✓ fundamental-mean-reversion — ${checks} check(s) over ${cases.cases.length} classification, ${sizing.cases.length} sizing, ${staged.cases.length} staged-plan and ${reversion.cases.length} target fixtures`)
console.log('   ⛔ synthetic bars, and no host: proposal storage, WATCH re-arming, decision-to-fill linkage and')
console.log('      cross-manager exposure attribution are #256 criteria this checker cannot reach.')
