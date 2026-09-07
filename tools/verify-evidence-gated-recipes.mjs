import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execute } from '../managers/evidence-gated/lib/index.mjs'

/**
 * ── The check the recipe path could not have without processes (#209 §8-D) ──
 *
 * `manifest.recipes` says this package's arithmetic has a name the host can
 * call, and every claim that makes is about a **program**: one JSON object on
 * stdin, one JSON line on stdout, no arguments, no environment, no clock. None
 * of that is observable by importing the module — an entrypoint that read
 * `process.argv`, or that answered two lines, or that reached for `Date.now()`,
 * imports exactly as cleanly as one that does not. #210 learned the same thing
 * one layer up: its hook looked correct and was silently doing nothing until it
 * was run as a process with a real payload.
 *
 * So five things are checked, and the last two are the ones a tidy pair of
 * constants cannot fake:
 *
 *  1. **Every declared recipe resolves** to a `.mjs` file inside the package,
 *     spelled the way `untilled/aumos#726` resolves it — no absolute path, no
 *     `..`, no directory. A row whose entrypoint does not exist is reported by
 *     the host as `invalid-recipe-entrypoint` at call time, which is a refusal
 *     nobody sees until a run needs the answer.
 *  2. **The declared ids do not collide with the build's own.** `fixture-scan`
 *     is the one name `RECIPE_REGISTRY` holds; a package claiming it is refused
 *     `ambiguous-recipe` rather than resolved.
 *  3. **The answer is one of the three shapes** the contract allows, on one line.
 *  4. **Parity, against the call this replaces.** The same bars are handed to
 *     `execute()` directly and to the entrypoint as a process, and the computed
 *     rows must be identical — not close, identical. This is the criterion the
 *     issue asks for and the reason the entrypoints are shells: they call the
 *     same function, so a difference here means a shell that edited something.
 *  5. **No bars come back.** The point of the route is that the heavy input
 *     stays in the host; an entrypoint that echoed its readings would move the
 *     cost rather than remove it.
 */

const packageRoot = new URL('../managers/evidence-gated/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('aumos.json', packageRoot), 'utf8'))

/** The one name the host's own registry holds (`untilled/aumos#724`). */
const BUILD_RECIPE_IDS = new Set(['fixture-scan'])

assert.ok(Array.isArray(manifest.recipes) && manifest.recipes.length > 0, 'the manifest declares recipes; without them the roster sweep has no name for the host to call and the instructions point at nothing')

const seen = new Set()
for (const recipe of manifest.recipes) {
  assert.match(recipe.id, /^[a-z0-9][a-z0-9-]*$/, `recipe id ${recipe.id} is spelled the way the host parses it`)
  assert.ok(!seen.has(recipe.id), `recipe id ${recipe.id} is declared once — two rows for one name is a row the host will never reach`)
  seen.add(recipe.id)
  assert.ok(!BUILD_RECIPE_IDS.has(recipe.id), `recipe id ${recipe.id} is not one the build registers; a name held by both is refused ambiguous-recipe rather than resolved`)
  assert.match(recipe.version, /^\d+\.\d+\.\d+$/, `recipe ${recipe.id} pins an exact version — the host takes no range`)
  assert.ok(recipe.entrypoint.endsWith('.mjs'), `recipe ${recipe.id} names a .mjs entrypoint; anything else is refused by extension`)
  assert.ok(!recipe.entrypoint.startsWith('/') && !recipe.entrypoint.split('/').includes('..'), `recipe ${recipe.id} names a path inside its own package`)
  await readFile(new URL(recipe.entrypoint, packageRoot), 'utf8')
}

/** A falling series long enough for the 200-bar indicators, dated against the pin and never a clock. */
const asOf = '2026-09-01T00:00:00.000Z'
function series(count = 240) {
  const bars = []
  let price = 100
  for (let index = 0; index < count; index += 1) {
    price *= 1 - 0.002
    bars.push({
      timestamp: new Date(Date.parse('2025-10-01T00:00:00.000Z') + index * 86_400_000).toISOString(),
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1_000 + index,
    })
  }
  return bars
}

function request(bars, extra = {}) {
  return {
    recipeId: 'roster-scan',
    recipeVersion: '1.0.0',
    asOf,
    market: 'XKRX',
    symbol: '005930',
    parameters: { held: [], pending: [], sectors: { '005930': 'technology' } },
    readings:
      bars === null
        ? [{ provider: 'open-dart', documentKey: 'filings', version: 1, publishedAt: '2026-08-01T00:00:00.000Z', normalized: { rows: [] } }]
        : [{ provider: 'toss', documentKey: 'bars/daily', version: 1, publishedAt: asOf, normalized: { bars } }],
    ...extra,
  }
}

/** Runs one entrypoint the way the host does: a process, stdin, one line back. */
function run(entrypoint, body) {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL(entrypoint, packageRoot))], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    // The environment the host gives it. ⛔ Not `process.env`: a recipe that
    // only works because it inherited something is one that fails in the host.
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '' },
    timeout: 30_000,
  })
  assert.equal(child.status, 0, `${entrypoint} exits 0 — a refusal is a shape, not an exit code (stderr: ${child.stderr})`)
  const lines = child.stdout.trim().split('\n')
  assert.equal(lines.length, 1, `${entrypoint} answers with exactly one JSON line; the host parses the whole of stdout as one object`)
  return JSON.parse(lines[0])
}

const bars = series()

for (const [entrypoint, operation] of [
  ['recipes/roster-scan.mjs', 'scan'],
  ['recipes/opportunity-metrics.mjs', 'opportunityMetrics'],
]) {
  const answered = run(entrypoint, { ...request(bars), recipeId: operation })
  assert.equal(answered.ok, true, `${entrypoint} answers ok over a readable series`)
  assert.ok('output' in answered, `${entrypoint} evaluated rather than reporting empty; readings carrying a series are not nothing`)

  // 4. Parity — the same input through the call this route replaces.
  const direct = execute({
    operation,
    asOf,
    input: {
      symbol: '005930',
      market: 'XKRX',
      bars,
      held: false,
      pending: false,
      ...(operation === 'opportunityMetrics' ? { sector: 'technology' } : {}),
    },
  })
  assert.deepEqual(
    answered.output.data,
    direct.data,
    `${entrypoint} computes what mcp__evidence-gated-metrics__calculate computes, byte for byte — the entrypoint is a shell over execute() and a difference here is a shell that edited something`,
  )
  assert.deepEqual(
    answered.output.diagnostics.filter((row) => row.severity !== 'info'),
    direct.diagnostics.filter((row) => row.severity !== 'info'),
    `${entrypoint} carries the operation's own diagnostics unedited; they are the only thing that separates "read and empty" from "never fed"`,
  )

  // 5. The heavy input does not come back.
  const text = JSON.stringify(answered)
  assert.ok(!text.includes('"open"') && !text.includes(bars[0].timestamp), `${entrypoint} returns no bar series; a route that echoed its readings would move the cost rather than remove it`)
  assert.ok(text.length < 20_000, `${entrypoint} answers with a row rather than a roster (${text.length} bytes)`)

  assert.equal(answered.output.evaluatedAsOf, asOf, `${entrypoint} dates its answer against the pin it was handed`)
}

/**
 * A name whose stored documents carry no price series.
 *
 * ⚠️ **This is the row the whole issue is about.** It is not `empty: true` —
 * that would say *we read this name's documents and it carried nothing*, a
 * finding about the company — and it is not a failure. It is an evaluated row
 * whose data is null beside the operation's own `unevaluated` diagnostic, which
 * says the price branch was never run for that name.
 *
 * ⚠️ **It used to be what every row looked like and no longer is.** Before
 * `untilled/aumos#734` the host collected three filing documents and no price
 * series, so this was the answer for the whole roster. `prices`/`daily` is now
 * a route and 0.4.55's instructions call it before preparing — which is why the
 * case stays here rather than being deleted: it is now the shape of a name that
 * was *not collected*, and the instructions have to keep telling those apart
 * from a name whose series was collected and is genuinely short.
 */
for (const [entrypoint, code] of [
  ['recipes/roster-scan.mjs', 'scanner_history_insufficient'],
  ['recipes/opportunity-metrics.mjs', 'opportunity_history_insufficient'],
]) {
  const answered = run(entrypoint, request(null))
  assert.equal(answered.ok, true, `${entrypoint} does not fail over readings that carry no series`)
  assert.notEqual(answered.empty, true, `${entrypoint} does not report "we looked and there was nothing" when what is missing is the price series and not the company's news`)
  assert.equal(answered.output.data, null, `${entrypoint} computes nothing without bars`)
  assert.equal(answered.output.barsUsed, 0, `${entrypoint} says how many bars it actually read`)
  assert.ok(
    answered.output.diagnostics.some((row) => row.code === code && row.severity === 'unevaluated'),
    `${entrypoint} reports ${code} / unevaluated — the package's own word for "this was not judged", which is what an investor must not read as "nothing qualified"`,
  )
}

/**
 * ⚠️ **The shape the host actually stores: one closed bar per document.**
 *
 * The fixture above hands one reading carrying the whole series, which is what a
 * relayed vendor answer looks like. `prices`/`daily` does not store that —
 * `untilled/aumos#734` files **one document per bar**, keyed by that bar's own
 * start, because a series under one key would make every refresh restate the
 * whole history. So a fed roster arrives here as two hundred readings of one bar
 * each, and the only thing that turns them back into a series is `scannerInput`
 * accumulating `normalized.bars` across every reading before normalizing once.
 *
 * ⛔ That was never measured — the single-reading fixture passes whether the loop
 * accumulates or overwrites — and it is the join the whole route now rests on.
 * The two answers must be identical, because they are the same series.
 */
{
  const perDocument = bars.map((bar) => ({
    provider: 'prices',
    documentKey: bar.timestamp,
    version: 1,
    publishedAt: new Date(Date.parse(bar.timestamp) + 86_400_000).toISOString(),
    normalized: { interval: '1d', currency: 'KRW', bars: [bar] },
  }))
  // Deliberately out of order: the host reads its rows back by publication and
  // this package must not depend on that ordering. `normalizeBars` sorts.
  perDocument.reverse()
  for (const [entrypoint, operation] of [
    ['recipes/roster-scan.mjs', 'scan'],
    ['recipes/opportunity-metrics.mjs', 'opportunityMetrics'],
  ]) {
    const split = run(entrypoint, { ...request(bars), recipeId: operation, readings: perDocument })
    const whole = run(entrypoint, { ...request(bars), recipeId: operation })
    assert.equal(split.output.documents, bars.length, `${entrypoint} counts one document per bar, which is how the host files a daily series`)
    assert.equal(split.output.barsUsed, whole.output.barsUsed, `${entrypoint} reads the same number of bars out of one-bar documents as out of one series document`)
    assert.deepEqual(
      split.output.data,
      whole.output.data,
      `${entrypoint} computes the same row from ${bars.length} one-bar documents as from one document carrying ${bars.length} bars — the fed roster arrives in the first shape and every fixture until now used the second`,
    )
    assert.ok(
      !JSON.stringify(split).includes('"open"'),
      `${entrypoint} still returns no bar series when it was handed one document per bar`,
    )
  }
}

/** A bar later than the pin never reaches a metric, and the drop is reported. */
const future = series()
future.push({ timestamp: '2026-12-01T00:00:00.000Z', open: 1, high: 1, low: 1, close: 1, volume: 1 })
const pinned = run('recipes/roster-scan.mjs', request(future))
assert.equal(pinned.output.barsRead, future.length, 'the recipe says how many rows it was handed')
assert.equal(pinned.output.barsUsed, bars.length, 'and how many survived the pin — a row later than asOf is dropped before any metric sees it')
assert.ok(
  pinned.output.diagnostics.some((row) => row.code === 'post_as_of_row_dropped'),
  'and the drop is reported rather than silent',
)

/** The entrypoint refuses a request that is not JSON without throwing at the host. */
const malformed = spawnSync(process.execPath, [fileURLToPath(new URL('recipes/roster-scan.mjs', packageRoot))], {
  input: 'not json',
  encoding: 'utf8',
  env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '' },
  timeout: 30_000,
})
assert.equal(malformed.status, 0, 'a malformed request exits 0 — the failure travels as a shape so the host reports this package\'s words rather than a stack trace')
assert.equal(JSON.parse(malformed.stdout.trim()).ok, false, 'and it is ok: false')

/**
 * ⛔ No clock, anywhere under `recipes/`.
 *
 * The one property that makes a research result reproducible, and therefore
 * cacheable: everything dated is dated against `asOf`. It is checked as text
 * because it cannot be checked by running — a recipe that consulted the clock
 * would answer identically today and differently in a month.
 */
for (const file of ['recipes/request.mjs', 'recipes/roster-scan.mjs', 'recipes/opportunity-metrics.mjs']) {
  const source = (await readFile(new URL(file, packageRoot), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const forbidden of ['Date.now', 'new Date()', 'process.env', 'process.argv', 'require(', 'node:fs', 'node:child_process', 'fetch(']) {
    assert.ok(!source.includes(forbidden), `${file} does not use ${forbidden}; the recipe contract is no clock, no environment, no arguments, no filesystem and no network`)
  }
}

/**
 * ── The collection step, and the fact that it is written down before the sweep ──
 *
 * `research_prepare` **collects nothing**: it runs a recipe over documents this
 * fund already stores. So a run told only about the three research calls does
 * exactly what one measured run did before `untilled/aumos#734` existed at all —
 * prepares a roster nobody collected a price series for and reads every row's
 * `scanner_history_insufficient` as a market with no opportunities. The fix is
 * host-side and shipped; what is checked here is that the **instructions** name
 * it, because an unfed sweep with a route available is the same wrong answer.
 *
 * ⚠️ **Ordering is checked by position rather than by prose.** «Refresh first»
 * is the whole content of the step — an instruction that mentioned both calls
 * in the wrong order would read as correct to a skimmer and produce the empty
 * sweep — so every document that names both must name the collection first.
 *
 * ⛔ Not checked: that a run obeys it. Nothing in this repository runs a manager.
 */
const INSTRUCTION_FILES = [
  'PROMPT.md',
  'skills/orchestrate/SKILL.md',
  'skills/kr-sleeve/SKILL.md',
  'skills/us-sleeve/SKILL.md',
  'skills/candidate-research/SKILL.md',
  'agents/kr-sleeve.md',
  'agents/us-sleeve.md',
  'agents/allocate.md',
]

for (const file of INSTRUCTION_FILES) {
  const text = await readFile(new URL(file, packageRoot), 'utf8')
  // Both halves of the coordinate, in either spelling — `prices`/`daily` when a
  // document names the route and «provider `prices`, document `daily`» when it
  // spells out the call. ⛔ Not one regular expression for the punctuation: the
  // check is that the coordinate is named, not how it is typeset.
  assert.ok(
    /\bprices\b/.test(text) && /\bdaily\b/.test(text),
    `${file} names the prices/daily document; a flow told to prepare a roster and not told to collect its series prepares an unfed one`,
  )
  const collect = text.indexOf('prices')
  const prepare = text.indexOf('research_prepare')
  assert.ok(prepare !== -1, `${file} still names research_prepare`)
  assert.ok(
    collect < prepare,
    `${file} names the collection before the sweep; the two calls in the other order read as correct and produce a roster whose every row says the price branch was never run`,
  )
}

/**
 * ⛔ **And no document tells a flow to hand `vendorId` or a research market to it.**
 *
 * Both are refused by the host on this route — a bar is one venue's record, and
 * the venue and ticker are already given — and a refusal a document walked a run
 * into is worse than one it warned about. Checked as text because the refusal
 * lives in the host and nothing here can provoke it.
 */
const routeSkill = await readFile(new URL('skills/data-source-contract/SKILL.md', packageRoot), 'utf8')
assert.ok(
  /refused/.test(routeSkill.slice(routeSkill.indexOf('prices'))),
  'the route document says which fields prices/daily refuses rather than leaving a run to find out',
)

/**
 * The three readings of one diagnostic (#209 §8-D).
 *
 * `scanner_history_insufficient` is emitted identically whether nobody collected
 * the series, whether this machine prices no venue for that name, or whether the
 * name genuinely has almost no history — and only the last is a finding. That is
 * the same distinction as `sourced`/`evaluated`/`unprepared` one layer down, and
 * merging them is the error the issue is named after.
 */
const researchSkill = await readFile(new URL('skills/candidate-research/SKILL.md', packageRoot), 'utf8')
const splitAt = researchSkill.indexOf('has three causes')
assert.notEqual(splitAt, -1, 'candidate-research splits scanner_history_insufficient rather than leaving it one word')
const insufficient = researchSkill.slice(splitAt)
for (const answer of ['no-source-for-market', 'satisfied', 'observed', 'barsRead']) {
  assert.ok(
    insufficient.includes(answer),
    `that split is decided by what the refresh answered, and it names ${answer}; a split a run cannot evaluate is prose`,
  )
}

console.log('evidence-gated recipes: entrypoints run as processes, compute what calculate computes, return no bars, read a per-document series, and are collected before they are prepared')
