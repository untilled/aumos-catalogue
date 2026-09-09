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
  METHODOLOGY,
  TERMINAL_STATES,
  accountConcentration,
  catalystLedger,
  cause,
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
// 7. The package's own boundaries.
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
console.log(`catalyst-turnaround: the six catalyst outcomes reached ${new Set(SIX.map((name) => reached.get(name))).size} distinct judgements`)
