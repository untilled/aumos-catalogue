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
  THRESHOLDS,
  execute,
  normalizeBars,
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
    assert.equal(answer.targetWeight ?? null, row.measured.targetWeight, `${row.name}: target weight`)
    assert.equal(answer.bindingConstraint ?? null, row.measured.bindingConstraint, `${row.name}: binding constraint`)
  })
}

check('a gap-down history sizes smaller than a calm one', () => {
  const calm = sized.get('calm-series')
  const gap = sized.get('gap-down-series')
  const halted = sized.get('halted-name')
  assert.ok(gap.effectiveLoss > calm.effectiveLoss, 'the same stop distance costs more where the price has gapped through levels')
  assert.ok(gap.targetWeight < calm.targetWeight, 'so the position is smaller')
  assert.ok(halted.effectiveLoss > calm.effectiveLoss, 'a halted name costs the halt haircut on top')
  assert.ok(halted.targetWeight < calm.targetWeight)
  assert.ok(calm.haircut.total >= THRESHOLDS.sizing.gapHaircutFloor, 'and a quiet history still pays the floor, because a quiet history is not a promise')
})

check('concentration counts real holdings and open proposals together', () => {
  const held = sized.get('held-by-another-strategy')
  assert.equal(held.exposure.existingWeight, 0.085, 'a 6% holding under one strategy and a 2.5% open proposal under another are 8.5% of exposure to one name')
  assert.equal(held.bindingConstraint, 'single-name-headroom')
  assert.equal(held.targetWeight, 0.015, 'so the 10% account ceiling leaves 1.5%')
  assert.ok(held.targetWeight < sized.get('calm-series').targetWeight, 'which is less than the risk budget alone would have taken')

  const strategyCap = sized.get('per-strategy-cap-cannot-raise-the-account-cap')
  assert.equal(strategyCap.targetWeight, held.targetWeight, 'a 20% per-strategy allowance does not raise a 10% account ceiling')
  assert.ok(
    strategyCap.diagnostics.some((row) => row.code === 'strategy_cap_exceeds_account_cap'),
    'and the attempt is reported rather than obeyed',
  )

  const full = sized.get('no-headroom-left')
  assert.equal(full.status, 'refused')
  assert.equal(full.code, 'risk_limit_exceeded', 'no room is a finding about the book — never `thesis_refuted` and never `data_missing`')
})

check('config may narrow the risk budget and may not widen it', () => {
  const widened = sized.get('config-may-not-widen-the-risk-budget')
  assert.equal(widened.riskBudget, THRESHOLDS.sizing.perThesisRiskBudget)
  assert.ok(widened.diagnostics.some((row) => row.code === 'config_loosens_preregistered_threshold'))
  assert.equal(widened.targetWeight, sized.get('calm-series').targetWeight)
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

// ── ⑫ asOf is not optional ────────────────────────────────────────────────
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
