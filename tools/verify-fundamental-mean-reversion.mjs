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
  OUTCOME_WEIGHT_ROLES,
  STRATEGY_ID,
  WEIGHT_ROLES,
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
 * ── #256: «보유 종목에 복수 thesis가 붙어도 포지션 수량은 하나다» ──────────
 *
 * The host merges every row of one asset into one `Position` before this package
 * sees it — `broker-book.ts` folds the broker's rows by asset, and
 * `discovery-service.ts` maps positions one-to-one with at most one assignment
 * per `assetKey`. So two holding rows for one name are a restatement of one
 * quantity, and adding them was reading a 6% position as 12%.
 *
 * ⚠️ **Mixed attribution is the interesting half.** Two rows for one name
 * carrying different `strategy` values are two claims about *whose* it is, not
 * two positions: each bucket keeps its largest row and the position is the
 * largest row of all, so the parts can never add to more than the whole.
 */
check('#256 — one name is one position however many theses point at it', () => {
  const twoTheses = concentration({
    holdings: [
      { symbol: 'FMR001', sector: 'technology', weight: 0.06, strategy: STRATEGY_ID },
      { symbol: 'FMR001', sector: 'technology', weight: 0.06, strategy: 'inst_shareholder_rerating' },
    ],
    openProposals: [],
  }, 'FMR001')
  assert.equal(twoTheses.heldWeight, 0.06, 'one position was counted twice because two theses were attached to it')
  assert.equal(twoTheses.existingWeight, 0.06)
  assert.equal(twoTheses.grossHeld, 0.06, 'and the gross axis carried the double through the whole book')
  assert.ok(twoTheses.diagnostics.some((row) => row.code === 'duplicate_holding_rows' && row.severity === 'info'), 'the row arrived twice and nothing in the answer said so')

  /** Mixed assignment: max per bucket, then one position, and own + other is the whole. */
  const mixed = concentration({
    holdings: [
      { symbol: 'FMR001', weight: 0.04, strategy: STRATEGY_ID },
      { symbol: 'FMR001', weight: 0.06, strategy: 'inst_shareholder_rerating' },
    ],
    openProposals: [],
  }, 'FMR001')
  assert.equal(mixed.heldWeight, 0.06, 'the two claims were added into a 0.10 position the account does not hold')
  assert.equal(mixed.ownHeldWeight, 0.04, 'and this desk\'s own share is still its own largest row')
  assert.equal(mixed.otherHeldWeight, 0.02)
  assert.equal(round(mixed.ownHeldWeight + mixed.otherHeldWeight), mixed.heldWeight, 'the parts add to more than the whole')

  /** A single row is untouched: the fold only ever fires on a second one. */
  const one = concentration({ holdings: [{ symbol: 'FMR001', weight: 0.06, strategy: STRATEGY_ID }], openProposals: [] }, 'FMR001')
  assert.equal(one.heldWeight, 0.06)
  assert.deepEqual(one.diagnostics, [], 'a book with no duplicate row reported one')

  /** And the sector axis folds the same name the same way, or the sector total is over by the smaller row. */
  const sector = sectorConcentration({
    holdings: [
      { symbol: 'FMR001', sector: 'utilities', weight: 0.06, strategy: STRATEGY_ID },
      { symbol: 'FMR001', sector: 'utilities', weight: 0.06, strategy: 'inst_shareholder_rerating' },
      { symbol: 'FMR002', sector: 'utilities', weight: 0.1, strategy: 'evidence-gated' },
    ],
    openProposals: [],
  }, 'utilities', 'FMR001')
  assert.equal(sector.exposure, 0.16, 'the sector total counted one position twice')
  assert.equal(sector.heldExposure, 0.16)
  assert.equal(sector.ownWeight, 0.06)
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
    /**
     * ⛔ **This assertion used to pin the buy-direction sum here, and that is
     * what #823 was.** The review answer carried `otherHeld + targetTotalWeight`
     * — an *entry* target — on an outcome whose whole content is «reduce», and
     * this checker held it green. What the answer may carry is the reduction's
     * own total, and over a position none of which is this desk's that total is
     * the floor exactly: the review is written down and no order leaves.
     */
    assert.ok(answer.sizing.targetTotalWeight > 0, `${label}: the entry arithmetic is still on the answer under its own name`)
    assert.equal(answer.sizing.hostTargetWeight, 0.06, `${label}: the reduction carried the entry target, which over a holding this desk has none of is a purchase`)
    assert.equal(answer.sizing.hostTargetWeightRole, 'reduce', `${label}: the total on the answer does not say which judgement it is for`)
    assert.equal(answer.hostTargetWeight, 0.06, `${label}: the answer's own total moved a position this desk does not run`)
    assert.equal(answer.exposureDirection, 'unchanged', `${label}: the answer proposes a change to a position none of which is this desk's`)
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
   *
   * ⚠️ **The numbers moved with #256's fold and the rule did not.** Two rows for
   * one name are one position, so this book is a **0.06** position of which 0.04
   * is assigned here and 0.02 is not — it was read as a 0.10 position before,
   * which is the double this fold closes. What #819 asserts is unchanged: the
   * floor is somebody else's share, it is above zero, and the exit is gone.
   */
  const sharedSizing = sizeAgainst([...held(0.04, STRATEGY_ID), ...held(0.06, 'inst_shareholder_rerating')])
  const shared = classify('invalidation-triggered', sharedSizing)
  assert.equal(shared.ownHeldWeight, 0.04)
  assert.equal(shared.otherHeldWeight, 0.02, 'the two rows were added, so the name was read as a 0.10 position the account does not hold')
  assert.equal(shared.hostTargetWeightFloor, 0.02)
  assert.deepEqual([...shared.ampActions], ['RESIZE'], 'a shared position could still be exited, and an exit takes their half with it')
  assert.ok(codesOf(shared).includes('reduction_is_bounded_by_anothers_holding'))
  assert.ok(sharedSizing.diagnostics.some((row) => row.code === 'duplicate_holding_rows'), 'the name arrived twice and the sizing did not say so')

  /** An account nobody folded is not an account with nobody in it. */
  const unread = classify('invalidation-triggered', null)
  assert.equal(unread.ownHeldWeight, null, 'an unread book answered 0, which is the reading that says nobody else holds this')
  assert.equal(unread.otherHeldWeight, null)
  assert.equal(unread.hostTargetWeightFloor, null)
  assert.deepEqual([...unread.ampActions], ['RESIZE', 'SELL'], 'the published actions moved on an answer that measured nothing')
  assert.ok(codesOf(unread).includes('review_exposure_unread'), 'the run was not told that its reduction has no floor')
})

/**
 * ── The #823 harness: one book shape, five attributions, every outcome ─────
 *
 * ⛔ **The inputs are built here and no fixture was edited.** `execution` is
 * declared the way XKRX requires (`dailyPriceLimit: true`), which is what makes
 * the entry arithmetic answer the `0.03623596` the issue drove to the exchange —
 * a share that sits *above* a 2% or 3% holding and *below* a 6% or 12% one, and
 * that gap is the whole of the defect.
 */
const CAP823 = { singleNameCap: 0.1, grossCap: 0.9 }
const sizingBase823 = structuredClone(sizing.cases.find((row) => row.name === 'calm-series').input)
const SYMBOL823 = sizingBase823.symbol
const held823 = (weight, strategy) => ({ symbol: SYMBOL823, sector: 'technology', weight, ...(strategy === undefined ? {} : { strategy }) })
const sizeFor823 = (holdings, overrides = {}) =>
  execute({
    operation: 'positionSizing',
    asOf: ASOF,
    input: {
      ...structuredClone(sizingBase823),
      mandate: CAP823,
      execution: { halted: false, dailyPriceLimit: true },
      book: { holdings, openProposals: [] },
      rows: rowsOf('shock-then-base'),
      ...overrides,
    },
  })
const case823 = (name) => {
  const row = cases.cases.find((fixture) => fixture.name === name)
  assert.ok(row, `fixtures/cases.json carries ${name}`)
  return row
}
const classify823 = (name, sizingAnswer, extra = {}) => {
  const row = case823(name)
  return execute({
    operation: 'classifyCase',
    asOf: ASOF,
    input: {
      ...structuredClone(row.input),
      series: { adjustment: row.declared ?? undefined, corporateActions: row.corporateActions ?? [], rows: rowsOf(row.series) },
      sizing: sizingAnswer,
      ...extra,
    },
  })
}
const codesOf823 = (answer) => answer.diagnostics.map((diag) => diag.code)
/** The three review outcomes over a position **wholly this desk's** — where #819's defences do not exist. */
const reviewAnswers = (holding) =>
  ['invalidation-triggered', 'deadline-elapsed', 'target-reached-staged-trim'].map((name) => [
    `${name}@${holding}`,
    classify823(name, sizeFor823([held823(holding, STRATEGY_ID)])),
  ])
/** A held position whose review found nothing, so the run falls through to the sizing rungs. */
const heldCase823 = (holding, review, overrides = {}) =>
  classify823('temporary-shock-plus-stabilisation', sizeFor823([held823(holding, STRATEGY_ID)], overrides), {
    position: { held: true, weight: holding },
    review: { invalidationTriggered: false, deadlineElapsed: false, ...review },
  })

/**
 * ── #823: the number a judgement carries is the judgement's ────────────────
 *
 * `#819` gave the review branch the whole `sizing` answer so that the two
 * attribution numbers would travel with it. What travelled with them was
 * `positionSizing`'s `hostTargetWeight` — `otherHeld + targetTotalWeight`, the
 * **entry** total, assembled before any outcome was known. A review is reached
 * most often while the position is still being staged in, this desk holding
 * *less* than its own sizing target, and there that total is a **purchase**:
 * driven to the exchange, a `target-reached-trim` over a 2% holding wholly this
 * desk's left as `buy:16`, and `invalidated-re-adjudicate` — the outcome whose
 * code is `thesis_refuted` — bought 1.6pp more of the name it had just refuted.
 *
 * ⛔ **`#819`'s two defences are absent in exactly this case.** The withdrawn
 * `SELL` and `hostTargetWeightFloor` both need `otherHeldWeight > 0`; on a
 * position wholly this desk's the actions are `["RESIZE","SELL"]` and the floor
 * is `0`. Nothing was left to stop it, and nothing said so: the same answer
 * carried `incrementalWeight: 0.016…` and `atOrAboveTarget: false` with an empty
 * `diagnostics`.
 *
 * ⚠️ **The large holdings were green by coincidence** — 6% and 12% sit above the
 * entry target, so the entry total happens to reduce. That is the coincidence
 * that made `catalyst-turnaround`'s `close-out` look safe until
 * `aumos-catalogue#279` measured the other twelve intents.
 */
check('#823 — a reduction over a position wholly this desk\'s may not leave as a purchase', () => {
  const answers = reviewAnswers(0.02)
  for (const [name, answer] of answers) {
    assert.equal(answer.ownHeldWeight, 0.02, `${name}: the desk's own holding`)
    assert.equal(answer.otherHeldWeight, 0, `${name}: nobody else is in this name — which is why #819 stops nothing here`)
    assert.equal(answer.hostTargetWeightFloor, 0, `${name}: and the floor is 0, as it must be for a position this desk may close`)
    assert.deepEqual([...answer.ampActions], ['RESIZE', 'SELL'], `${name}: the published actions are unchanged on this desk's own position`)
    assert.equal(answer.weightRole, 'reduce', `${name}: an outcome that reduces was not typed as one`)
    assert.equal(answer.positionWeight, 0.02, `${name}: what the account holds in the name`)
    assert.ok(answer.sizing.targetTotalWeight > 0.02, `${name}: the entry arithmetic sizes this desk's share above the holding — this is the state the defect needs`)
    assert.equal(answer.hostTargetWeight, 0.02, `${name}: a reduction asked the host for more than the account holds, which is a buy`)
    assert.equal(answer.sizing.hostTargetWeight, 0.02, `${name}: the sizing carried on the answer still names the entry total`)
    assert.equal(answer.sizing.hostTargetWeightRole, 'reduce', `${name}: the carried total does not say which judgement it is for`)
    assert.equal(answer.exposureDirection, 'unchanged', `${name}: the answer increases the account's exposure to a name it judged should be reduced`)
    assert.ok(codesOf823(answer).includes('reduction_target_clamped_to_own_holding'), `${name}: nothing in the answer said the entry total had been withheld`)
    /** ⚠️ The two entry-direction readings are still there and still true — of the entry question. */
    assert.equal(answer.sizing.atOrAboveTarget, false, `${name}: this desk does hold less than its own entry target, and that reading is not what was wrong`)
    assert.ok(answer.sizing.incrementalWeight > 0)
  }

  /** 3%: the same shape one point higher, and the issue measured `buy:6` here. */
  for (const [name, answer] of reviewAnswers(0.03)) {
    assert.equal(answer.hostTargetWeight, 0.03, `${name}: a 3% holding was bought up to the entry target`)
    assert.equal(answer.exposureDirection, 'unchanged', `${name}: exposureDirection`)
  }
})

/**
 * ⛔ **The reduction this fix must not kill (`untilled/aumos#782`).** Where the
 * holding is above the entry target the clamp is the identity — `min` is a
 * ceiling and never a floor — and the trim, the resize and the exit leave
 * exactly as before. `sell:23` and `sell:83` are the orders the issue measured.
 */
check('#823 — a real reduction still leaves, and the clamp is a ceiling and not a floor', () => {
  for (const holding of [0.06, 0.12]) {
    for (const [name, answer] of reviewAnswers(holding)) {
      const share = answer.sizing.targetTotalWeight
      assert.ok(share < holding, `${name}/${holding}: the fixture no longer measures a holding above the entry target`)
      assert.equal(answer.hostTargetWeight, share, `${name}/${holding}: a reduction of this desk's own position was clamped away`)
      assert.equal(answer.exposureDirection, 'reduce', `${name}/${holding}: the order that leaves is no longer a reduction`)
      assert.deepEqual([...answer.ampActions], ['RESIZE', 'SELL'], `${name}/${holding}: this desk stopped being able to close its own position`)
      assert.ok(!codesOf823(answer).includes('reduction_target_clamped_to_own_holding'), `${name}/${holding}: the clamp reported itself as binding where it is the identity`)
    }
  }

  /**
   * ⚠️ **A shared position reduces this desk's share only.** The floor is what
   * somebody else holds and the reduction lands above it — never at the entry
   * total's expense, and never at theirs.
   */
  const shared = classify823('invalidation-triggered', sizeFor823([held823(0.04, STRATEGY_ID), held823(0.06, 'inst_shareholder_rerating')]))
  assert.equal(shared.ownHeldWeight, 0.04)
  /**
   * ⚠️ **#256: two rows for one name are one position.** 0.04 assigned here and
   * 0.06 assigned elsewhere is a **0.06** position with 0.02 of it somebody
   * else's — not the 0.10 the sum used to report. The rule under test is the
   * same one: the floor is theirs, and the reduction lands above it.
   */
  assert.equal(shared.positionWeight, 0.06)
  assert.equal(shared.otherHeldWeight, 0.02)
  assert.equal(shared.hostTargetWeight, round(0.02 + Math.min(shared.sizing.targetTotalWeight, 0.04)), 'a shared position was reduced by more than this desk\'s share of it')
  assert.ok(shared.hostTargetWeight >= shared.hostTargetWeightFloor, 'the reduction went below the floor, selling a holding this desk does not run')
  assert.ok(shared.hostTargetWeight < shared.positionWeight, 'and this desk could no longer reduce the part of the position that is its own')
  assert.equal(shared.exposureDirection, 'reduce')
})

/**
 * ⛔ **The check that fails when a word and a number disagree.** Eighty-six
 * checks were green while a `TRIM` asked the host to buy, because nothing
 * compared the verdict with the weight the same answer carried. This reads only
 * the two numbers on the answer and the outcome's role, so a new outcome, a new
 * rung or a new arithmetic reaches it without anybody adding a case.
 */
check('#823 — every outcome, on five books: the total agrees with the judgement', () => {
  const books = [
    ['mine', [held823(0.06, STRATEGY_ID)]],
    ['unattributed', [held823(0.06)]],
    ['another manager', [held823(0.06, 'inst_catalyst_turnaround')]],
    ['shared', [held823(0.04, STRATEGY_ID), held823(0.06, 'inst_shareholder_rerating')]],
    ['empty book', []],
  ]
  /** The directions each verdict may leave with. A word that cannot be read off the number is not enforced. */
  const allowed = { BUY: ['increase', 'unchanged'], TRIM: ['reduce', 'unchanged'], RE_ADJUDICATE: ['reduce', 'unchanged'], WAIT: ['unchanged'], WATCH: ['unchanged'] }
  let measured = 0
  for (const row of cases.cases) {
    for (const [label, holdings] of books) {
      const answer = classify823(row.name, sizeFor823(holdings))
      const where = `${row.name}/${label}`
      assert.equal(answer.weightRole, OUTCOME_WEIGHT_ROLES[answer.outcome], `${where}: the answer's role is not the one the table gives its outcome`)
      if (answer.hostTargetWeight === null) {
        assert.ok(answer.ownHeldWeight === null || answer.otherHeldWeight === null, `${where}: an answer that folded the account still named no total`)
        continue
      }
      measured += 1
      assert.equal(answer.positionWeight, round(answer.ownHeldWeight + answer.otherHeldWeight), `${where}: positionWeight is not what the account holds`)
      if (answer.weightRole === 'increase') {
        assert.equal(answer.hostTargetWeight, round(answer.otherHeldWeight + answer.sizing.targetTotalWeight), `${where}: #817's addition on the buy path moved`)
        assert.ok(answer.hostTargetWeight >= answer.positionWeight, `${where}: a judgement to add left as a reduction`)
      } else {
        assert.ok(answer.hostTargetWeight >= answer.otherHeldWeight, `${where}: the total handed over is below the floor, so it sells a holding this desk does not run`)
        assert.ok(answer.hostTargetWeight <= answer.positionWeight, `${where}: an outcome that does not add asked the host for more than the account holds`)
      }
      if (answer.weightRole === 'standstill') {
        assert.equal(answer.hostTargetWeight, answer.positionWeight, `${where}: an outcome that changes nothing proposed a change`)
      }
      /** ⚠️ Recomputed here rather than trusted: a field that restates the outcome measures nothing. */
      const direction = answer.hostTargetWeight > answer.positionWeight ? 'increase' : answer.hostTargetWeight < answer.positionWeight ? 'reduce' : 'unchanged'
      assert.equal(answer.exposureDirection, direction, `${where}: exposureDirection is not the comparison of the two numbers on this answer`)
      assert.ok(allowed[answer.verdict].includes(direction), `${where}: the verdict is ${answer.verdict} and the weight it carries is an ${direction} of the account's exposure`)
      if (answer.sizing) assert.equal(answer.sizing.hostTargetWeight, answer.hostTargetWeight, `${where}: two fields named hostTargetWeight on one answer, and they disagree`)
    }
  }
  assert.ok(measured > 40, 'the cross-check reached too few answers to be measuring anything')
})

/** ⛔ Every outcome has a role, and no role is invented for an outcome nobody published. */
check('#823 — the role table covers this package\'s outcome vocabulary exactly', () => {
  assert.deepEqual([...Object.keys(OUTCOME_WEIGHT_ROLES)].sort(), [...OUTCOMES].sort(), 'an outcome with no role would take whatever the sizing answered, which is the defect')
  for (const [outcome, role] of Object.entries(OUTCOME_WEIGHT_ROLES)) {
    assert.ok(WEIGHT_ROLES.includes(role), `${outcome}: ${role} is not one of the three`)
  }
  assert.deepEqual([...new Set(Object.values(OUTCOME_WEIGHT_ROLES))].sort(), [...WEIGHT_ROLES].sort(), 'a role nothing reaches is a role nothing was checked against')
})

/**
 * ── #826: a pending total is a ceiling, and it is not a position ───────────
 *
 * `#823` closed «the number a judgement carries is the judgement's». This is one
 * layer under it: the number a *reduction* carries was `min(entry ceiling, own
 * holding)`, and that entry ceiling folds other desks' **open proposals** in —
 * `aumos-catalogue#275` put them there, and for the buying question they belong
 * there, because a limit has to hold in every state the account passes through.
 *
 * For a sale they do not. Driven to the exchange against the real host, a 6%
 * position wholly this desk's left as `sell:23`; with `shareholder-rerating`
 * holding a **sealed and unapproved** 15% BUY on the same name it left as
 * `sell:50`, and once the pending total passed the cap it left as the whole
 * position. Nothing was approved, nothing was filled, and `diagnostics` was
 * empty — the fifth answer in this series to change a number and say nothing.
 *
 * ⛔ **The inputs are built here and no fixture was edited.** `CAP823` caps a
 * single name at 10%, so a pending total of 15% takes the single-name headroom
 * to 1% and one of 16% takes it past zero — the two rows the issue measured.
 */
const pending826 = (total, strategy = 'inst_shareholder_rerating') => [{ symbol: SYMBOL823, sector: 'technology', targetWeight: total, strategy }]
const sizeWithPending826 = (holdings, total) =>
  sizeFor823(holdings, total === null ? {} : { book: { holdings, openProposals: pending826(total) } })
/** The three review outcomes over a 6% position **wholly this desk's** — where #819's defences do not exist. */
const reviews826 = (holding, total) =>
  ['invalidation-triggered', 'deadline-elapsed', 'target-reached-staged-trim'].map((name) => [
    `${name}@pending=${total}`,
    classify823(name, sizeWithPending826([held823(holding, STRATEGY_ID)], total)),
  ])

check('#826 — another desk\'s unfilled proposal does not enlarge this desk\'s sale', () => {
  /** The order the issue measured with nobody else in the name: `sell:23` out of a 6% holding. */
  const baseline = new Map(reviews826(0.06, null).map(([name, answer]) => [name.split('@')[0], answer]))
  for (const [, answer] of baseline) {
    assert.equal(answer.hostTargetWeight, 0.03623596, 'the baseline reduction is no longer the one the issue drove to the exchange')
  }

  /**
   * ⚠️ **Every one of these narrows the *entry* ceiling, and none of them may
   * move the sale.** 0.15 took it to 1% and 0.16 past zero — where the entry
   * answer is refused outright — and the run still sold exactly what it sold
   * with the account to itself.
   */
  for (const total of [0.05, 0.11, 0.15, 0.16, 0.3]) {
    for (const [name, answer] of reviews826(0.06, total)) {
      const plain = baseline.get(name.split('@')[0])
      assert.equal(answer.weightRole, 'reduce', `${name}: an outcome that reduces was not typed as one`)
      assert.equal(answer.ownHeldWeight, 0.06, `${name}: the desk's own holding`)
      assert.equal(answer.otherHeldWeight, 0, `${name}: nobody else *holds* this name — a proposal is not a holding`)
      assert.equal(
        answer.hostTargetWeight,
        plain.hostTargetWeight,
        `${name}: an unapproved, unfilled proposal changed the total this desk hands the exchange`,
      )
      assert.equal(answer.exposureDirection, 'reduce', `${name}: the order that leaves is no longer a reduction`)
      assert.ok(answer.hostTargetWeight > 0, `${name}: a pending proposal liquidated a position this desk runs`)
    }
  }

  /**
   * ⛔ **And the entry ceiling really did move, so this is not a test of a
   * number nobody narrowed.** At 0.15 the single-name headroom binds at 1% and
   * at 0.16 `positionSizing` refuses outright — that is the state the review
   * branches are reached in.
   */
  const narrowed = sizeWithPending826([held823(0.06, STRATEGY_ID)], 0.15)
  assert.equal(narrowed.status, 'ok')
  assert.equal(narrowed.bindingConstraint, 'single-name-headroom', 'the pending total no longer narrows the entry ceiling — #813 was reverted')
  assert.equal(narrowed.targetTotalWeight, 0.01, 'the entry share is not the 1% the issue measured')
  assert.equal(narrowed.heldOnlyBindingConstraint, 'risk-budget', 'the held-only fold read a proposal')
  assert.equal(narrowed.heldOnlyTargetTotalWeight, 0.03623596, 'the held-only fold is not this desk\'s share measured against holdings')
  const past = sizeWithPending826([held823(0.06, STRATEGY_ID)], 0.16)
  assert.equal(past.status, 'refused', 'a pending total past the cap no longer refuses the entry')
  assert.equal(past.targetTotalWeight, 0, 'and the entry share it refuses with is not zero')
  assert.equal(past.heldOnlyTargetTotalWeight, 0.03623596, 'a refused *entry* took the reduction ceiling down with it')
})

/**
 * ⚠️ **Said out loud, because four answers before this one were not.** The
 * counterfactual travels with it: an observation that cannot be measured against
 * what it withheld is a restatement.
 */
check('#826 — the answer says that a pending total was not folded into its sale', () => {
  for (const [name, answer] of reviews826(0.06, 0.15)) {
    const row = answer.diagnostics.find((diag) => diag.code === 'reduction_target_ignores_others_pending')
    assert.ok(row, `${name}: the sale was measured against a different ceiling and nothing said so`)
    assert.equal(row.severity, 'info')
    assert.equal(row.details.entryTargetTotalWeight, 0.01, `${name}: the entry share the diagnostic names`)
    assert.equal(row.details.heldOnlyTargetTotalWeight, 0.03623596, `${name}: the share this sale was measured against`)
    assert.equal(row.details.hostTargetWeight, answer.hostTargetWeight, `${name}: the diagnostic names a total the answer did not send`)
    assert.equal(row.details.hostTargetWeightIfPendingFolded, 0.01, `${name}: the order that would have gone out is not carried, so nobody can measure what was withheld`)
  }

  /** ⛔ And it is silent where the two folds agree — a line on every answer is a line nobody reads. */
  for (const [name, answer] of reviews826(0.06, null)) {
    assert.ok(
      !answer.diagnostics.some((diag) => diag.code === 'reduction_target_ignores_others_pending'),
      `${name}: reported a divergence on an account with no open proposal in the name`,
    )
  }
})

/**
 * ⛔ **The three regressions this fix must not kill.** `#813`/`#275` folds
 * pending into the *entry* ceiling, `#817`/`#277` adds what others hold to the
 * buy total, and `#823`/`#280` clamps a reduction to this desk's own holding.
 */
check('#826 — the buy path still folds the pending total, and adds what others hold', () => {
  /** `#817`: an unattributed 6%, sized here at 3.75%, leaves as `0.09623596` and buys. */
  const unattributed = sizeFor823([held823(0.06)])
  const buy = classify823('temporary-shock-plus-stabilisation', unattributed, {
    position: { held: false },
    review: { invalidationTriggered: false, deadlineElapsed: false },
  })
  assert.equal(buy.weightRole, 'increase', 'the entry outcome is no longer typed as one')
  assert.equal(buy.hostTargetWeight, round(0.06 + unattributed.targetTotalWeight), '#817\'s addition on the buy path moved')
  assert.equal(buy.hostTargetWeight, 0.09623596, 'the buy total is not the one #277 measured')

  /**
   * `#813`: the entry ceiling still narrows under somebody's pending total, and
   * the buy total still comes off `targetTotalWeight` and never off the
   * held-only fold — a buy that ignored the pending would overstate the account.
   */
  const crowded = sizeWithPending826([held823(0.06)], 0.15)
  assert.ok(crowded.targetTotalWeight < crowded.heldOnlyTargetTotalWeight, 'the pending total stopped narrowing the entry ceiling')
  const crowdedBuy = classify823('temporary-shock-plus-stabilisation', crowded, {
    position: { held: false },
    review: { invalidationTriggered: false, deadlineElapsed: false },
  })
  if (crowdedBuy.weightRole === 'increase' && crowdedBuy.hostTargetWeight !== null) {
    assert.equal(
      crowdedBuy.hostTargetWeight,
      round(0.06 + crowded.targetTotalWeight),
      'the buy path read the held-only fold and bought room another desk had already asked for',
    )
  }
})

/**
 * ⚠️ **The two folds are the same fold on an account with no open proposals**,
 * which is the common case and the reason this change is invisible almost
 * everywhere. Measured over every sizing fixture rather than asserted.
 */
check('#826 — with no open proposal in the book the two folds are one number', () => {
  let measured = 0
  for (const row of sizing.cases) {
    const answer = sized.get(row.name)
    if (typeof answer?.targetTotalWeight !== 'number') continue
    const proposals = Array.isArray(row.input?.book?.openProposals) ? row.input.book.openProposals : []
    if (proposals.length > 0) continue
    measured += 1
    assert.equal(answer.heldOnlyTargetTotalWeight, answer.targetTotalWeight, `${row.name}: a book with no open proposal folded to two different shares`)
    assert.equal(answer.heldOnlyBindingConstraint, answer.bindingConstraint, `${row.name}: and to two different binding constraints`)
  }
  assert.ok(measured >= 5, 'too few sizing fixtures reached the identity to be measuring it')
})

/**
 * ⛔ **Both book folds have a holdings-only twin, and each is measured
 * separately.** The single-name axis is what the issue drove to the exchange;
 * the gross and sector axes are the same arithmetic and would have carried the
 * same defect the first time either of them bound.
 */
check('#826 — every axis that reads the book has a holdings-only term', () => {
  const book = {
    holdings: [
      { symbol: SYMBOL823, sector: 'technology', weight: 0.06, strategy: STRATEGY_ID },
      { symbol: 'OTHER', sector: 'technology', weight: 0.1, strategy: 'inst_catalyst_turnaround' },
    ],
    openProposals: [
      { symbol: SYMBOL823, sector: 'technology', targetWeight: 0.15, strategy: 'inst_shareholder_rerating' },
      { symbol: 'OTHER', sector: 'technology', targetWeight: 0.3, strategy: 'inst_shareholder_rerating' },
    ],
  }
  const name = concentration(book, SYMBOL823, STRATEGY_ID)
  assert.equal(name.otherWeight, 0.09, 'the ceiling term folds the pending total, as #813 requires')
  assert.equal(name.otherHeldWeight, 0, 'holdings only: nobody else holds this name')
  assert.equal(name.grossOther, round(0.15 + 0.3 - 0.06), 'the gross ceiling term folds every open proposal on the fund')
  assert.equal(name.grossOtherHeld, 0.1, 'the gross term has no holdings-only twin, so a fund-wide proposal enlarges this desk\'s sale')

  const sector = sectorConcentration(book, 'technology', SYMBOL823, STRATEGY_ID)
  assert.equal(sector.exposure, round(0.15 + 0.3), 'the sector ceiling term folds the pending totals')
  assert.equal(sector.heldExposure, round(0.06 + 0.1), 'the sector term has no holdings-only twin')
  assert.equal(sector.ownWeight, 0.06, 'this desk\'s own sector share — it wrote none of these proposals')
  assert.equal(sector.otherWeight, round(0.45 - 0.06), 'the sector ceiling term is measured against the folded exposure')
  assert.equal(sector.ownHeldWeight, 0.06, 'and its holdings-only share is what it holds')
  assert.equal(sector.otherHeldWeight, 0.1, 'somebody else\'s pending proposal counted as a sector position')
})

/**
 * ── #835: a residual is not an allocation, and it may not size a sale ───────
 *
 * `#826` closed one axis under `#823` — a pending total is a ceiling and is not
 * a position. This is the other one, and it was open the whole time:
 * `positionSizing` folds **six** ceilings into one number, and two of them are
 * `cap − everything else in the bucket`. A sector ceiling states no division of
 * itself between the names under it, so reading *«the sector has 0.01 left»* as
 * *«this position must become 0.01»* hands the whole adjustment to whichever
 * name was evaluated last.
 *
 * Driven to the real host on a 6% position **wholly this desk's**, its thesis
 * invalidated, under a 0.25 sector ceiling — another *name* filling the sector:
 *
 *     other name held   hostTargetWeight   order
 *     0 … 0.21          0.03623596         sell:23
 *     0.24              0.01               sell:50
 *     0.245             0.005              sell:55
 *     0.3 / 0.5         0                  sell:60   ← the whole position
 *
 * ⛔ **Nobody asked for that liquidation and nothing in the answer said so.**
 * `deadline-elapsed-re-adjudicate` did not differ by one value, the gross axis
 * is the same arithmetic with a wider bucket, and the owner of that other name —
 * another desk, this desk, or nobody at all — made no difference, so `#786`'s
 * gate never reaches it.
 *
 * ⛔ **The inputs are built here and no fixture was edited.**
 */
const CAP835 = { singleNameCap: 0.1, grossCap: 0.9, sectorCap: 0.25 }
/** A **different name** in the same sector. `strategy` omitted means unattributed. */
const otherName835 = (weight, strategy) => ({ symbol: 'OTHER9', sector: 'technology', weight, ...(strategy === undefined ? {} : { strategy }) })
const pendingName835 = (weight, strategy = 'inst_catalyst_turnaround') => ({ symbol: 'OTHER9', sector: 'technology', targetWeight: weight, strategy })
const size835 = (holdings, mandate = CAP835, proposals = []) =>
  sizeFor823(holdings, { mandate, sector: 'technology', book: { holdings, openProposals: proposals } })
const REVIEWS835 = ['invalidation-triggered', 'deadline-elapsed', 'target-reached-staged-trim']
const reviews835 = (holdings, mandate = CAP835, proposals = []) =>
  REVIEWS835.map((name) => [name, classify823(name, size835(holdings, mandate, proposals))])
/** The order the issue measured with nothing else in the bucket: `sell:23` out of a 6% holding. */
const SHARE835 = 0.03623596
const SECTOR_SWEEP835 = [0, 0.1, 0.19, 0.2, 0.21, 0.24, 0.245, 0.2451, 0.3, 0.5]

/**
 * ⛔ **The two axes are enumerated, not sampled.** «One place fixed and its twin
 * missed» is the shape three of this series' defects had, so the roster is
 * asserted whole: every ceiling this package folds is either one that **names**
 * this position or one that is the account's **leftover room**, and the
 * reduction fold is exactly the first list.
 */
check('#835 — every ceiling is a name axis or a residual, and a sale reads only the first', () => {
  const declared = { singleNameCap: 0.1, grossCap: 0.9, sectorCap: 0.25, strategyCap: 0.08 }
  const answer = size835([held823(0.06, STRATEGY_ID), otherName835(0.1, 'inst_catalyst_turnaround')], declared)
  assert.equal(answer.status, 'ok')
  const NAME_AXES = ['risk-budget', 'liquidity', 'single-name-headroom', 'strategy-headroom']
  const RESIDUAL_AXES = ['gross-headroom', 'sector-headroom']
  assert.deepEqual(
    answer.ceilings.map((row) => row.name),
    [...NAME_AXES, ...RESIDUAL_AXES],
    'the roster of ceilings moved — every new axis has to be judged a name axis or a residual before it folds',
  )
  assert.deepEqual(
    answer.heldOnlyCeilings.map((row) => row.name),
    [...NAME_AXES, ...RESIDUAL_AXES],
    '#826\'s fold reads every axis, which is what leaves the residual question open',
  )
  assert.deepEqual(answer.reductionCeilings.map((row) => row.name), NAME_AXES, 'the reduction fold reads an axis it may not size a sale with')
  for (const row of answer.reductionCeilings) {
    assert.ok(!RESIDUAL_AXES.includes(row.name), `${row.name} is the account's leftover room after other names and sized a sale`)
  }
  /** ⚠️ And each name axis is measured against holdings only — the two corrections compose. */
  const withPending = size835(
    [held823(0.06, STRATEGY_ID)],
    declared,
    [{ symbol: SYMBOL823, sector: 'technology', targetWeight: 0.15, strategy: 'inst_shareholder_rerating' }],
  )
  assert.ok(
    ['single-name-headroom', 'strategy-headroom'].includes(withPending.bindingConstraint),
    `the pending total stopped narrowing the entry ceiling: ${withPending.bindingConstraint}`,
  )
  assert.ok(withPending.targetTotalWeight < SHARE835, 'the entry share was not narrowed by the pending total')
  assert.equal(withPending.reductionTargetTotalWeight, SHARE835, 'the reduction fold read another desk\'s unfilled proposal')
})

/**
 * ⛔ **The sector ramp, flat.** Every row here narrows the *entry* ceiling — the
 * pre-conditions are asserted below so this is not a test of a number nobody
 * moved — and not one of them may move the sale.
 */
check('#835 — another name filling the sector does not enlarge this desk\'s sale', () => {
  for (const other of SECTOR_SWEEP835) {
    const holdings = other === 0 ? [held823(0.06, STRATEGY_ID)] : [held823(0.06, STRATEGY_ID), otherName835(other, 'inst_catalyst_turnaround')]
    for (const [name, answer] of reviews835(holdings)) {
      const where = `${name}@sector=${other}`
      assert.equal(answer.weightRole, 'reduce', `${where}: an outcome that reduces was not typed as one`)
      assert.equal(answer.ownHeldWeight, 0.06, `${where}: the desk's own holding`)
      assert.equal(answer.otherHeldWeight, 0, `${where}: nobody else holds *this* name — the other name is a different position`)
      assert.equal(answer.hostTargetWeight, SHARE835, `${where}: a sector filled by another name changed the total this desk hands the exchange`)
      assert.equal(answer.exposureDirection, 'reduce', `${where}: the order that leaves is no longer a reduction`)
      assert.ok(answer.hostTargetWeight > 0, `${where}: the account's leftover room liquidated a position this desk runs`)
    }
  }

  /** ⛔ And the entry ceiling really did collapse, so the rows above are the state the defect needs. */
  const measured = SECTOR_SWEEP835.map((other) => [
    other,
    size835(other === 0 ? [held823(0.06, STRATEGY_ID)] : [held823(0.06, STRATEGY_ID), otherName835(other, 'inst_catalyst_turnaround')]),
  ])
  const at = (other) => measured.find((row) => row[0] === other)[1]
  assert.equal(at(0.21).targetTotalWeight, SHARE835, 'the sector axis binds earlier than the issue measured')
  assert.equal(at(0.24).targetTotalWeight, 0.01, 'the entry share at 0.24 is not the 1% the issue measured')
  assert.equal(at(0.24).bindingConstraint, 'sector-headroom', 'the sector axis stopped binding the entry ceiling — #813 was reverted')
  assert.equal(at(0.245).targetTotalWeight, 0.005, 'the entry share at 0.245 moved')
  assert.equal(at(0.3).targetTotalWeight, 0, 'a sector past its ceiling no longer refuses the entry')
  assert.equal(at(0.3).status, 'refused', 'and it no longer refuses with a code')
  assert.equal(at(0.3).code, 'risk_limit_exceeded')
  for (const other of SECTOR_SWEEP835) {
    assert.equal(at(other).reductionTargetTotalWeight, SHARE835, `sector=${other}: a refused *entry* took the reduction ceiling down with it`)
    assert.equal(at(other).reductionBindingConstraint, 'risk-budget', `sector=${other}: the reduction fold read a bucket-wide ceiling`)
  }
})

/**
 * ⛔ **The gross axis is the same arithmetic with a wider bucket**, and it would
 * have carried the same defect the first time it bound. Measured on its own,
 * with no sector ceiling declared at all.
 */
check('#835 — and the gross axis, which is the same arithmetic one bucket wider', () => {
  const GROSS835 = { singleNameCap: 0.1, grossCap: 0.3 }
  for (const other of [0, 0.2, 0.26, 0.27, 0.295, 0.2951, 0.3, 0.5]) {
    const holdings = other === 0 ? [held823(0.06, STRATEGY_ID)] : [held823(0.06, STRATEGY_ID), otherName835(other, 'inst_catalyst_turnaround')]
    for (const [name, answer] of reviews835(holdings, GROSS835)) {
      const where = `${name}@gross=${other}`
      assert.equal(answer.weightRole, 'reduce', `${where}: an outcome that reduces was not typed as one`)
      assert.equal(answer.hostTargetWeight, SHARE835, `${where}: the book's leftover room after other names sized this desk's sale`)
      assert.equal(answer.exposureDirection, 'reduce', `${where}: the order that leaves is no longer a reduction`)
    }
  }
  const crowded = size835([held823(0.06, STRATEGY_ID), otherName835(0.27, 'inst_catalyst_turnaround')], GROSS835)
  assert.equal(crowded.bindingConstraint, 'gross-headroom', 'the gross axis stopped binding the entry ceiling')
  assert.equal(crowded.targetTotalWeight, 0.03, 'the entry share under a crowded book moved')
  assert.equal(crowded.reductionTargetTotalWeight, SHARE835, 'the reduction fold read the book\'s leftover room')
  const full = size835([held823(0.06, STRATEGY_ID), otherName835(0.3, 'inst_catalyst_turnaround')], GROSS835)
  assert.equal(full.targetTotalWeight, 0, 'a book at its gross ceiling no longer refuses the entry')
  assert.equal(full.reductionTargetTotalWeight, SHARE835, 'and it took the reduction ceiling down with it')
})

/**
 * ⛔ **Whose the other name is makes no difference, and that is the point.**
 * `untilled/aumos#786`'s handover gate fires where the *position under review*
 * is somebody else's; here the position is wholly this desk's and the name
 * filling the bucket is a different one. Another desk, this desk, and nobody at
 * all give one answer — so no attribution rule reaches this, and it is not a
 * multi-manager defect.
 */
check('#835 — the owner of the name that filled the bucket is not the axis', () => {
  for (const other of [0.24, 0.245, 0.3]) {
    const answers = [
      ['another desk', otherName835(other, 'inst_catalyst_turnaround')],
      ['this desk', otherName835(other, STRATEGY_ID)],
      ['nobody', otherName835(other)],
    ].map(([owner, row]) => [owner, classify823('invalidation-triggered', size835([held823(0.06, STRATEGY_ID), row]))])
    for (const [owner, answer] of answers) {
      assert.equal(answer.hostTargetWeight, SHARE835, `sector=${other}/${owner}: the sale depended on who filled the bucket`)
      assert.equal(answer.ownHeldWeight, 0.06, `sector=${other}/${owner}: this desk's holding in the name under review`)
      assert.equal(answer.otherHeldWeight, 0, `sector=${other}/${owner}: the other *name* was counted as part of this position`)
      assert.deepEqual([...answer.ampActions], ['RESIZE', 'SELL'], `sector=${other}/${owner}: #819's withdrawal fired on a position wholly this desk's`)
    }
  }
})

/**
 * ⚠️ **Said out loud, because five answers before this one were not.** The
 * counterfactual travels with it: an observation that cannot be measured against
 * what it withheld is a restatement.
 */
check('#835 — the answer says that the account\'s leftover room was not folded into its sale', () => {
  for (const [name, answer] of reviews835([held823(0.06, STRATEGY_ID), otherName835(0.3, 'inst_catalyst_turnaround')])) {
    const row = answer.diagnostics.find((diag) => diag.code === 'reduction_is_not_sized_by_the_accounts_remaining_room')
    assert.ok(row, `${name}: the sale was measured against a different ceiling and nothing said so`)
    assert.equal(row.severity, 'info')
    assert.equal(row.details.heldOnlyTargetTotalWeight, 0, `${name}: the remainder the diagnostic names`)
    assert.equal(row.details.reductionTargetTotalWeight, SHARE835, `${name}: the share this sale was measured against`)
    assert.equal(row.details.reductionBindingConstraint, 'risk-budget', `${name}: what actually bound the sale`)
    assert.equal(row.details.heldOnlyBindingConstraint, 'sector-headroom', `${name}: the axis whose remainder was set aside`)
    assert.equal(row.details.hostTargetWeight, answer.hostTargetWeight, `${name}: the diagnostic names a total the answer did not send`)
    assert.equal(row.details.hostTargetWeightIfRoomFolded, 0, `${name}: the liquidation that would have gone out is not carried, so nobody can measure what was withheld`)
  }

  /** ⛔ And it is silent where the two folds agree — a line on every answer is a line nobody reads. */
  for (const [name, answer] of reviews835([held823(0.06, STRATEGY_ID)])) {
    assert.ok(
      !answer.diagnostics.some((diag) => diag.code === 'reduction_is_not_sized_by_the_accounts_remaining_room'),
      `${name}: reported a divergence on an account with no other name in the bucket`,
    )
  }
  /** ⛔ And silent on a purchase: an addition **is** bounded by the account's room (#813). */
  const buy = classify823('temporary-shock-plus-stabilisation', size835([held823(0.06), otherName835(0.18, 'inst_catalyst_turnaround')]), {
    position: { held: false },
    review: { invalidationTriggered: false, deadlineElapsed: false },
  })
  assert.equal(buy.weightRole, 'increase')
  assert.ok(
    !buy.diagnostics.some((diag) => diag.code === 'reduction_is_not_sized_by_the_accounts_remaining_room'),
    'an entry answer reported a reduction finding',
  )
})

/**
 * ⚠️ **`#823`'s clamp reports the number it actually clamps, and that is a
 * second reader of this fold.** A mutant that left it on `heldOnlyTarget`
 * survived every check above: the two folds only disagree where the bucket is
 * crowded, and the clamp only fires where the target is above the holding, so
 * the case that separates them needs **both** at once — a small holding under a
 * nearly-full sector. There `heldOnlyTarget` is at the holding and says nothing
 * while the sale really is being clamped, which is the silence `#826` named.
 */
check('#835 — the clamp names the fold it clamps, not the account\'s leftover room', () => {
  const crowded = [held823(0.02, STRATEGY_ID), otherName835(0.23, 'inst_catalyst_turnaround')]
  const measured = size835(crowded)
  assert.equal(measured.reductionTargetTotalWeight, SHARE835, 'the reduction fold is not this desk\'s own target')
  assert.equal(measured.heldOnlyTargetTotalWeight, 0.02, 'the sector remainder is no longer exactly the holding — the case no longer separates the two folds')
  for (const [name, answer] of reviews835(crowded)) {
    assert.equal(answer.ownHeldWeight, 0.02)
    assert.equal(answer.hostTargetWeight, 0.02, `${name}: the sale was not clamped to this desk's own holding`)
    const row = answer.diagnostics.find((diag) => diag.code === 'reduction_target_clamped_to_own_holding')
    assert.ok(row, `${name}: the sale was clamped and the answer said nothing — the clamp is reporting a fold it does not use`)
    assert.equal(row.path, 'sizing.reductionTargetTotalWeight', `${name}: the clamp names a fold it did not clamp`)
    assert.equal(row.details.reductionTargetTotalWeight, SHARE835, `${name}: the share the clamp actually bounded`)
    assert.equal(row.details.heldOnlyTargetTotalWeight, 0.02, `${name}: the remainder fold is carried beside it and is not the subject`)
    assert.equal(row.details.hostTargetWeight, answer.hostTargetWeight)
  }
})

/**
 * ⛔ **Two invariants over the whole sweep, and neither may have an exception.**
 * A sale may never exceed what the ceilings that name this position size it at,
 * and a judgement to reduce may never hand the host a total above what the
 * account holds. Both are measured on the sector axis, the gross axis, all three
 * review outcomes, and all three owners of the name that filled the bucket.
 */
check('#835 — no sale is larger than this desk\'s own target, and no reduction leaves as a purchase', () => {
  const books = []
  for (const other of SECTOR_SWEEP835) {
    for (const owner of ['inst_catalyst_turnaround', STRATEGY_ID, undefined]) {
      books.push([
        `sector=${other}/${owner ?? 'nobody'}`,
        other === 0 ? [held823(0.06, STRATEGY_ID)] : [held823(0.06, STRATEGY_ID), otherName835(other, owner)],
        CAP835,
      ])
    }
  }
  for (const other of [0, 0.2, 0.27, 0.295, 0.3, 0.5]) {
    books.push([
      `gross=${other}`,
      other === 0 ? [held823(0.06, STRATEGY_ID)] : [held823(0.06, STRATEGY_ID), otherName835(other, 'inst_catalyst_turnaround')],
      { singleNameCap: 0.1, grossCap: 0.3 },
    ])
  }
  /** ⚠️ And the pending twin of each, so `#826`'s axis is swept here too. */
  for (const other of [0.15, 0.3]) {
    books.push([`pendingName=${other}`, [held823(0.06, STRATEGY_ID)], CAP835, [pendingName835(other)]])
  }
  let measured = 0
  for (const [where, holdings, mandate, proposals] of books) {
    for (const [name, answer] of reviews835(holdings, mandate, proposals ?? [])) {
      assert.equal(answer.weightRole, 'reduce', `${name}@${where}: an outcome that reduces was not typed as one`)
      const own = answer.ownHeldWeight
      const share = answer.sizing.reductionTargetTotalWeight
      assert.ok(typeof share === 'number', `${name}@${where}: the answer does not publish what its sale was measured against`)
      assert.equal(answer.hostTargetWeight, round(answer.otherHeldWeight + Math.min(share, own)), `${name}@${where}: the sale is not this desk's own target clamped to its own holding`)
      assert.ok(answer.hostTargetWeight >= round(answer.otherHeldWeight + Math.min(share, own)), `${name}@${where}: the sale went past what the ceilings naming this position size it at`)
      assert.ok(answer.hostTargetWeight <= answer.positionWeight, `${name}@${where}: a judgement to reduce left as a purchase`)
      assert.ok(share <= own || answer.hostTargetWeight === answer.positionWeight, `${name}@${where}: a reduction target above the holding was not clamped`)
      measured += 1
    }
  }
  assert.equal(measured, books.length * 3, 'the sweep did not reach every review outcome on every book')
})

/**
 * ⛔ **The regressions this fix must not kill.** `#813`/`#275` bounds the entry
 * by the account's leftover room and still does; `#817` adds what others hold to
 * the buy total; `#819` withdraws `SELL` and floors the target where part of the
 * position is not this desk's.
 */
check('#835 — the buy path is still bounded by the account\'s leftover room (#813)', () => {
  /**
   * ⚠️ **The position under review is part of its own sector bucket**, so an
   * unattributed 6% plus another name at 0.18 is 0.24 of a 0.25 ceiling: 0.01
   * left, and that is what the entry may become.
   */
  const crowded = size835([held823(0.06), otherName835(0.18, 'inst_catalyst_turnaround')])
  assert.equal(crowded.targetTotalWeight, 0.01, 'the entry ceiling stopped reading the sector remainder')
  assert.equal(crowded.bindingConstraint, 'sector-headroom')
  const buy = classify823('temporary-shock-plus-stabilisation', crowded, {
    position: { held: false },
    review: { invalidationTriggered: false, deadlineElapsed: false },
  })
  assert.equal(buy.weightRole, 'increase')
  /** ⛔ `#817` unmoved: what others hold is added to the entry share, and the sum is what buys. */
  assert.equal(buy.hostTargetWeight, round(0.06 + 0.01), 'the buy path read the reduction fold and bought room the sector does not have')

  /** ⛔ A sector past its ceiling still refuses the entry outright. */
  const full = size835([held823(0.06), otherName835(0.3, 'inst_catalyst_turnaround')])
  assert.equal(full.status, 'refused')
  assert.equal(full.code, 'risk_limit_exceeded')
  assert.equal(full.targetTotalWeight, 0)

  /** ⚠️ `#819`: where the position under review is somebody else's, nothing here changed. */
  const anothers = classify823('invalidation-triggered', size835([held823(0.06, 'inst_catalyst_turnaround'), otherName835(0.24, 'inst_catalyst_turnaround')]))
  assert.equal(anothers.ownHeldWeight, 0, 'the position under review is not this desk\'s')
  assert.deepEqual([...anothers.ampActions], ['WATCH'], '#819\'s withdrawal stopped firing on a position wholly another desk\'s')
  assert.equal(anothers.hostTargetWeightFloor, 0.06, 'the floor is what somebody else holds')
  assert.equal(anothers.hostTargetWeight, 0.06, 'a review of somebody else\'s position proposed to move it')
})

/**
 * ⚠️ **The three folds are one fold on an account with nothing else in the
 * bucket**, which is the common case and the reason this change is invisible
 * almost everywhere. Measured over every sizing fixture rather than asserted.
 */
check('#835 — with no other name in the bucket the three folds are one number', () => {
  let measured = 0
  for (const row of sizing.cases) {
    const answer = sized.get(row.name)
    if (typeof answer?.targetTotalWeight !== 'number') continue
    const holdings = Array.isArray(row.input?.book?.holdings) ? row.input.book.holdings : []
    const proposals = Array.isArray(row.input?.book?.openProposals) ? row.input.book.openProposals : []
    if (proposals.length > 0) continue
    if (holdings.some((held) => held?.symbol !== row.input?.symbol)) continue
    measured += 1
    assert.equal(answer.reductionTargetTotalWeight, answer.heldOnlyTargetTotalWeight, `${row.name}: a book with no other name folded to two different shares`)
    assert.equal(answer.reductionTargetTotalWeight, answer.targetTotalWeight, `${row.name}: and to a third`)
    assert.equal(answer.reductionBindingConstraint, answer.bindingConstraint, `${row.name}: and to two different binding constraints`)
  }
  assert.ok(measured >= 5, 'too few sizing fixtures reached the identity to be measuring it')
})

/**
 * ⚠️ **The same family, two outcomes over.** `aumos-catalogue#278` attached the
 * sizing to three review outcomes; two more answers carry it — the completed
 * position (`WAIT`) and a sizing carrying an unevaluated reading (`WATCH`) — and
 * both carried the entry total. On a holding **above** the entry target that
 * number is *below* what the account holds, so a `WAIT` was carrying a sale.
 */
check('#823 — an answer that changes nothing carries the position as held', () => {
  const complete = heldCase823(0.12, { targetReached: false })
  assert.equal(complete.outcome, 'target-weight-already-held')
  assert.equal(complete.verdict, 'WAIT')
  assert.equal(complete.weightRole, 'standstill')
  assert.ok(complete.sizing.targetTotalWeight < 0.12, 'the entry total is below the holding, which is what made the WAIT a sale')
  assert.equal(complete.hostTargetWeight, 0.12, 'an answer of «the position is complete» proposed to sell part of it')
  assert.equal(complete.exposureDirection, 'unchanged')
  assert.ok(codesOf823(complete).includes('standstill_total_is_the_position_as_held'), 'nothing said that the entry total had been set aside')

  /** An unevaluated halt state: `research-incomplete`, `WATCH`, and the sizing rides along. */
  const unevaluated = heldCase823(0.12, { targetReached: false }, { execution: {} })
  assert.equal(unevaluated.outcome, 'research-incomplete')
  assert.equal(unevaluated.verdict, 'WATCH')
  assert.ok(unevaluated.sizing, 'the answer carries the sizing it could not evaluate, which is where the total came from')
  assert.equal(unevaluated.hostTargetWeight, 0.12, 'unfinished research proposed a reduction of the position it could not finish researching')
  assert.equal(unevaluated.exposureDirection, 'unchanged')
})

/** ⛔ And the buy path is untouched: `#817`'s addition is the `increase` role, unchanged. */
check('#823 — the entry total is unchanged where the judgement is to enter (#817)', () => {
  const answer = classify823('temporary-shock-plus-stabilisation', sizeFor823([held823(0.06)]))
  assert.equal(answer.outcome, 'mean-reversion-candidate')
  assert.equal(answer.verdict, 'BUY')
  assert.equal(answer.weightRole, 'increase')
  assert.equal(answer.otherHeldWeight, 0.06)
  assert.equal(answer.hostTargetWeight, round(0.06 + answer.sizing.targetTotalWeight), '#817\'s addition moved on the path it was written for')
  assert.equal(answer.exposureDirection, 'increase', 'a BUY over an unattributed holding stopped adding to it')
  assert.ok(!codesOf823(answer).includes('reduction_target_clamped_to_own_holding'))
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

check('a staged plan missing its own ceiling, expiry, rung weight or fill history adds nothing', () => {
  const template = staged.cases.find((row) => row.name === 'first-stage-fires')
  const stageWith = (mutate) => {
    const plan = clone(template.plan)
    mutate(plan)
    return { sent: clone(plan), answer: execute({ operation: 'stagedPlan', asOf: ASOF, input: { plan, stageId: 'stage-1', satisfied: ['stabilisation-held', 'thesis-evidence'], gate: clone(template.gate) } }) }
  }
  const control = stageWith(() => {})
  assert.equal(control.answer.status, 'ok', 'the control still fires')

  for (const [what, mutate, code] of [
    ['no cumulative target', (plan) => { delete plan.plannedTotalWeight }, 'staged_total_unstated'],
    ['a zero cumulative target', (plan) => { plan.plannedTotalWeight = 0 }, 'staged_total_unstated'],
    ['no expiry', (plan) => { delete plan.expiresAt }, 'plan_expiry_unstated'],
    ['an unparseable expiry', (plan) => { plan.expiresAt = 'whenever' }, 'plan_expiry_unstated'],
    ['a rung with no weight', (plan) => { delete plan.stages[0].weight }, 'stage_weight_unstated'],
    /**
     * ⛔ **#256 — `filled` is now in this list, and it is the one that bought.**
     * The other four refused before the fix; an absent or unreadable fill
     * history did not, because `Array.isArray(x) ? x : []` answered «nothing
     * committed yet» and the rung fired. `null` is deliberately *not* here: it
     * is the positive statement that the ledger was read and holds nothing.
     */
    ['no ledger at all', (plan) => { delete plan.filled }, 'data_missing'],
    ['a ledger that is not a list', (plan) => { plan.filled = 'stage-1' }, 'data_missing'],
    ['a ledger that is an object', (plan) => { plan.filled = { 'stage-1': true } }, 'data_missing'],
  ]) {
    const { sent, answer } = stageWith(mutate)
    assert.equal(answer.status, 'refused', `${what}: refused`)
    assert.equal(answer.code, code, `${what}: ${code}`)
    assert.deepEqual(answer.plan, sent, `${what}: the ledger came back unchanged rather than absent`)
  }

  /** And the three states of `filled`, side by side, on one otherwise identical plan. */
  assert.equal(stageWith((plan) => { plan.filled = [] }).answer.status, 'ok', 'an explicitly empty ledger is a ledger')
  assert.equal(stageWith((plan) => { plan.filled = null }).answer.status, 'ok', 'null says the ledger was read and holds nothing, which is how catalyst-turnaround spells it')
  const unread = stageWith((plan) => { delete plan.filled }).answer
  assert.equal(unread.state.ledgerRead, false)
  assert.equal(unread.state.committedWeight, null, 'a total nobody could form was reported as a total of nothing')
  assert.equal(unread.state.remainingWeight, null, 'and the room left under the cumulative target was measured from it')
  assert.ok(unread.diagnostics.some((row) => row.code === 'staged_ledger_unread' && row.severity === 'blocked'))
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

// ── ⑬ the Mandate the host actually sends (`untilled/aumos#838`) ──────────
/**
 * ⛔ **Every cap above this line was written by hand, and that is what let this
 * defect live through twelve orders of work.** The fixtures state
 * `{ singleNameCap, grossCap }` because that is what this package calls them —
 * so every assertion passed while a run handed the *investor's* Mandate refused
 * on both of them and sized nothing at all.
 *
 * The host's `mandate.constraints` is a closed set of eight fields. It is built
 * here, in full, from `packages/amp/src/snapshots.ts`, and the checks below
 * drive the package with **nothing else**:
 *
 *   `maxPositionWeight` → `singleNameCap`   `cashFloor` → `grossCap` as `1 − cashFloor`
 *   and no sector or per-strategy axis exists in that contract at all.
 *
 * ⚠️ **The fixtures on disk are not touched.** The Mandate is built in this file
 * and every case is a deep copy, so a reviewer sees the difference between two
 * inputs rather than having to diff two fixture files.
 */
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
/** The constraints object with a key deleted rather than set to `undefined`. */
const hostMandateWithout = (...fields) => {
  const mandate = hostMandate()
  for (const field of fields) delete mandate.constraints[field]
  return mandate
}
const sizeWithMandate = (mandate, mutate = () => {}) => {
  const input = positiveSizing()
  input.mandate = mandate
  mutate(input)
  return execute({ operation: 'positionSizing', asOf: ASOF, input })
}

check('the Mandate as the host sends it sizes, under the names this package uses', () => {
  for (const [what, mandate] of [
    ['the snapshot verbatim', hostMandate()],
    ['the bare constraints object', hostMandate().constraints],
  ]) {
    const answer = sizeWithMandate(mandate)
    assert.equal(answer.status, 'ok', `${what}: a Mandate carrying both ceilings refused`)
    assert.ok(answer.targetTotalWeight > 0, `${what}: and produced no weight`)
    assert.deepEqual(
      answer.diagnostics.filter((row) => row.severity === 'unevaluated' || row.severity === 'blocked'),
      [],
      `${what}: and a BUY over it is authorised by checks that actually ran`,
    )
  }
})

check('`maxPositionWeight` is the single-name ceiling and it binds', () => {
  /**
   * ⚠️ **Measured, not asserted structurally.** The investor's 0.02 has to
   * *bind* — the risk budget sizes this case at 0.03623596, so a cap that was
   * merely read and not applied leaves that number standing.
   */
  const loose = sizeWithMandate(hostMandate())
  assert.equal(loose.bindingConstraint, 'risk-budget', 'the 0.1 ceiling is wider than the risk budget, as the control assumes')
  const tight = sizeWithMandate(hostMandate({ maxPositionWeight: 0.02 }))
  assert.equal(tight.status, 'ok')
  assert.equal(tight.bindingConstraint, 'single-name-headroom', 'the investor\'s concentration answer is what bound it')
  assert.equal(tight.targetTotalWeight, 0.02)
  assert.ok(tight.targetTotalWeight < loose.targetTotalWeight)
})

check('`cashFloor` is the gross ceiling, as its complement, and it binds', () => {
  /**
   * ⚠️ **The same regression #269 wrote for a hand-written `grossCap`, driven
   * off the field the investor actually answers.** A 0.2 cash floor is a 0.8
   * gross ceiling; 0.79 of the book held elsewhere leaves 0.01.
   */
  const crowded = sizeWithMandate(hostMandate({ cashFloor: 0.2 }), (input) => {
    input.book.holdings = [{ symbol: 'OTHER', weight: 0.79, strategy: 'another-manager' }]
  })
  assert.equal(crowded.status, 'ok')
  assert.equal(crowded.bindingConstraint, 'gross-headroom', 'the declared cash floor is what bound it')
  assert.equal(crowded.targetTotalWeight, 0.01, 'so the 3.6% the risk budget wanted becomes the 1% the floor leaves')

  const full = sizeWithMandate(hostMandate({ cashFloor: 0.2 }), (input) => {
    input.book.holdings = [{ symbol: 'OTHER', weight: 0.8, strategy: 'another-manager' }]
  })
  assert.equal(full.status, 'refused')
  assert.equal(full.code, 'risk_limit_exceeded')
  assert.equal(full.bindingConstraint, 'gross-headroom')
})

check('a Mandate that declares no cash floor constrains nothing, and no Mandate at all still refuses', () => {
  /**
   * ⛔ **The two facts this package already separated one axis over.** The
   * sector branch reads an undeclared ceiling as *«the investor declined to
   * constrain that axis»* and an unreadable one as a refusal; the gross branch
   * refused both, four lines away, under a name the host has never sent.
   */
  const undeclared = sizeWithMandate(hostMandateWithout('cashFloor'))
  assert.equal(undeclared.status, 'ok', 'an investor who left the cash question blank stopped this run from sizing')
  assert.ok(
    undeclared.diagnostics.some((row) => row.code === 'gross_cap_not_applicable' && row.severity === 'info'),
    'and the declined axis has to say so rather than be silently skipped',
  )
  assert.deepEqual(
    undeclared.diagnostics.filter((row) => row.severity === 'unevaluated' || row.severity === 'blocked'),
    [],
    'a declared absence is not an unevaluated reading',
  )
  /** The gross ceiling is genuinely gone: a book 99% invested is not stopped by it. */
  const wide = sizeWithMandate(hostMandateWithout('cashFloor'), (input) => {
    input.book.holdings = [{ symbol: 'OTHER', weight: 0.99, strategy: 'another-manager' }]
  })
  assert.equal(wide.status, 'ok')
  assert.notEqual(wide.bindingConstraint, 'gross-headroom')

  /** ⛔ And the unread case is untouched: no Mandate in sight is still a refusal. */
  const unread = sizeWith((input) => { delete input.mandate.grossCap })
  assert.equal(unread.status, 'refused', 'an unread gross cap stopped refusing')
  assert.equal(unread.code, 'data_missing')
  assert.ok(unread.diagnostics.some((row) => row.code === 'mandate_gross_cap_missing'))
})

check('a Mandate that declares no concentration limit still refuses', () => {
  /**
   * ⚠️ **And that refusal is right.** `maxPositionWeight` is a field the host
   * really sends and the screen really asks for; an investor who left it blank
   * has not authorised this run to choose its own limit. ⛔ Only the *gross*
   * axis changed, because the host has no field of that name to leave blank.
   */
  const answer = sizeWithMandate(hostMandateWithout('maxPositionWeight'))
  assert.equal(answer.status, 'refused')
  assert.equal(answer.code, 'data_missing')
  assert.ok(answer.diagnostics.some((row) => row.code === 'mandate_single_name_cap_missing'))
})

check('a stated cap wins, so a Mandate riding alongside changes nothing at all', () => {
  /**
   * ⛔ **The differential this whole change is held to.** Every case that states
   * its ceilings must be byte-for-byte what it was, whatever else is passed —
   * including a Mandate whose numbers are different ones.
   */
  for (const [what, mandate] of [
    ['the host snapshot', hostMandate({ maxPositionWeight: 0.9, cashFloor: 0.5 })],
    ['a Mandate declaring neither', hostMandateWithout('maxPositionWeight', 'cashFloor')],
  ]) {
    for (const book of [
      { holdings: [], openProposals: [] },
      { holdings: [{ symbol: 'OTHER', weight: 0.79, strategy: 'another-manager' }], openProposals: [] },
      { holdings: [{ symbol: 'FMR001', weight: 0.04, strategy: 'another-manager' }], openProposals: [] },
    ]) {
      const stated = sizeWith((input) => { input.book = clone(book) })
      const alongside = sizeWith((input) => {
        input.book = clone(book)
        Object.assign(input.mandate, mandate)
      })
      assert.equal(
        JSON.stringify(alongside),
        JSON.stringify(stated),
        `${what}: a stated cap stopped winning over the Mandate beside it`,
      )
    }
  }
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
