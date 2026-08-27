/**
 * Field-by-field parity between the frozen Trading Harness numeric core and the
 * port in each `managers/evidence-gated-<role>` package's `lib/`, read through the Global
 * member —
 * `verify-evidence-gated-allocator.mjs` argues why one copy. (issue #50, Phase 1C)
 *
 *   node tools/legacy-parity.mjs                       # compare against frozen numbers
 *   node tools/legacy-parity.mjs --freeze <legacy-root>  # re-measure, then write them
 *
 * ── Why the numbers are frozen into the fixture ───────────────────────────
 *
 * The legacy checkout is private and holds the investor's real ledger and
 * credentials; a check that can only run beside it is a check this repository
 * cannot make. So the legacy side is measured once, by an operator who has that
 * tree, and the measurement travels in `fixtures/legacy-golden/parity.json`.
 * Afterwards this script — and `verify-evidence-gated-allocator.mjs`, which
 * calls the same comparison — asks the only question that stays answerable
 * here: *does the port still produce what Python produced?*
 *
 * `--freeze` is therefore not a way to make a failure go away. It re-measures,
 * and a changed frozen number is a claim that the legacy tree changed, which
 * belongs in the diff with its reason.
 *
 * ⚠️ One field kind is not exact and says so. `bootstrap_cluster_ci` resamples
 * with `random.Random` and the port uses `mulberry32-v1`, so the two draw
 * different resamples from the same distribution. The point estimate, cluster
 * count and percentile indices are exact; the interval bounds are compared
 * against the spread the legacy implementation itself produces across seeds,
 * which is what a Monte-Carlo bound can honestly claim. Changing either PRNG is
 * a methodology-version change, not a refactor.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execute } from '../managers/evidence-gated/lib/index.mjs'

const fixtureUrl = new URL('../managers/evidence-gated/fixtures/legacy-golden/parity.json', import.meta.url)
const bridgeUrl = new URL('legacy-parity.py', import.meta.url)

const read = (value, path) => {
  if (path === null || path === undefined) return value
  let current = value
  for (const step of String(path).split('.')) {
    const match = step.match(/^(.*?)\[(\d+)\]$/)
    if (match) current = (match[1] ? current?.[match[1]] : current)?.[Number(match[2])]
    else current = current?.[step]
    if (current === undefined) return undefined
  }
  return current
}

/** `rows[].qValue` means "this field of every row", which is how the ranked BH output lines up. */
const collect = (value, path) => {
  const [head, tail] = String(path).split('[].')
  if (tail === undefined) return read(value, path)
  return (read(value, head) ?? []).map((row) => read(row, tail))
}

const roundTo = (value, digits) => (typeof value === 'number' ? Number(value.toFixed(digits)) : value)

const scaled = (value, scale) => {
  if (scale !== 'percent') return value
  if (Array.isArray(value)) return value.map((row) => scaled(row, scale))
  return typeof value === 'number' ? value * 100 : value
}

const close = (actual, expected, tolerance) => {
  if (typeof actual === 'number' && typeof expected === 'number') return Math.abs(actual - expected) <= tolerance
  return JSON.stringify(actual) === JSON.stringify(expected)
}

export async function loadParity() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'))
}

/**
 * The comparison the catalogue can always run: port output against frozen legacy output.
 */
export function comparePort(parity) {
  const failures = []
  for (const testCase of parity.cases) {
    const frozen = testCase.legacyMeasured
    if (frozen === undefined) {
      failures.push(`${testCase.name}: no frozen legacy measurement`)
      continue
    }
    const output = execute({ ...testCase.node, asOf: parity.asOf ?? '2026-08-20T00:00:00Z' })
    for (const field of testCase.fields) {
      const tolerance = field.tolerance ?? parity.tolerance
      const actual = scaled(collect(output.data, field.node), field.scale)
      const expected = read(frozen, field.legacy)
      if (field.kind === 'monte-carlo') {
        const envelope = testCase.monteCarloEnvelope?.[field.legacy]
        if (!envelope) {
          failures.push(`${testCase.name}.${field.node}: no measured Monte-Carlo envelope`)
        } else if (!(actual >= envelope.low && actual <= envelope.high)) {
          failures.push(`${testCase.name}.${field.node}: ${actual} outside the legacy seed envelope [${envelope.low}, ${envelope.high}]`)
        }
        continue
      }
      const translated = field.legacyValueMap?.[actual] ?? actual
      const compared = field.legacyRounding === undefined ? translated : roundTo(translated, field.legacyRounding)
      if (!close(compared, expected, tolerance)) {
        failures.push(`${testCase.name}.${field.node}: port ${JSON.stringify(compared)} vs legacy ${JSON.stringify(expected)}`)
      }
    }
    /**
     * A recorded difference is still a test.
     *
     * Each entry says what the port returns, what the legacy returned and why
     * the two were allowed to part. Asserting the difference — rather than
     * dropping the case — means a later change that quietly restores the legacy
     * behaviour, or moves the port somewhere neither side stood, fails here and
     * has to say so in the diff.
     */
    for (const difference of testCase.acceptedDifferences ?? []) {
      const actual = read(output.data, difference.field) ?? null
      if (JSON.stringify(actual) !== JSON.stringify(difference.port)) {
        failures.push(`${testCase.name}.${difference.field}: recorded difference expects port ${JSON.stringify(difference.port)}, got ${JSON.stringify(actual)}`)
      }
    }
    if (testCase.expectedStatus && output.status !== testCase.expectedStatus) {
      failures.push(`${testCase.name}: expected status ${testCase.expectedStatus}, got ${output.status}`)
    }
    if (testCase.expectedDiagnostic && !output.diagnostics.some((row) => row.code === testCase.expectedDiagnostic)) {
      failures.push(`${testCase.name}: expected diagnostic ${testCase.expectedDiagnostic}`)
    }
  }
  return failures
}

function runBridge(root, requests) {
  const process_ = spawnSync('python3', [bridgeUrl.pathname, root], { input: JSON.stringify(requests), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (process_.status !== 0) throw new Error(`legacy bridge failed: ${process_.stderr || process_.status}`)
  return JSON.parse(process_.stdout)
}

async function freeze(root) {
  const parity = await loadParity()
  const results = runBridge(root, parity.cases.map((testCase) => testCase.legacy))
  /**
   * The Monte-Carlo envelope is measured, not assumed: the legacy implementation
   * is re-run across seeds and the port must land inside the interval its own
   * ancestor produces. An envelope written by hand would be a tolerance chosen
   * to make the test pass.
   */
  const envelopeSeeds = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23]
  for (const [index, testCase] of parity.cases.entries()) {
    const result = results[index]
    if (!result.ok) throw new Error(`${testCase.name}: ${result.error}`)
    testCase.legacyMeasured = result.value
    const monteCarlo = testCase.fields.filter((field) => field.kind === 'monte-carlo')
    if (!monteCarlo.length) continue
    const runs = runBridge(root, envelopeSeeds.map((seed) => ({ ...testCase.legacy, args: [...testCase.legacy.args.slice(0, -1), seed] })))
    testCase.monteCarloEnvelope = {}
    for (const field of monteCarlo) {
      const values = runs.map((run) => read(run.value, field.legacy))
      testCase.monteCarloEnvelope[field.legacy] = { low: Math.min(...values), high: Math.max(...values), seeds: envelopeSeeds.length }
    }
  }
  parity.measuredAt = new Date().toISOString().slice(0, 10)
  await writeFile(fixtureUrl, `${JSON.stringify(parity, null, 2)}\n`)
  return parity
}

// Imported by `verify-evidence-gated-allocator.mjs` for the frozen comparison, so
// the command-line half only runs when this file is the entry point.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [flag, root] = process.argv.slice(2)
  if (flag === '--freeze') {
    if (!root) throw new Error('usage: node tools/legacy-parity.mjs --freeze <legacy-harness-root>')
    const parity = await freeze(root)
    console.log(`froze ${parity.cases.length} legacy measurements from ${parity.legacyBaseline}`)
  }

  const parity = await loadParity()
  const failures = comparePort(parity)
  for (const failure of failures) console.error(`  FAIL ${failure}`)
  assert.equal(failures.length, 0, `${failures.length} parity difference(s) between the legacy core and the port`)
  const fieldCount = parity.cases.reduce((sum, testCase) => sum + testCase.fields.length, 0)
  const recorded = parity.cases.flatMap((testCase) => testCase.acceptedDifferences ?? [])
  console.log(`legacy parity: ${parity.cases.length} cases, ${fieldCount} fields match ${parity.legacyBaseline.slice(0, 12)}, ${recorded.length} recorded difference(s)`)
  for (const difference of recorded) console.log(`  differs on purpose — ${difference.field}: ${difference.kind}`)
  }
