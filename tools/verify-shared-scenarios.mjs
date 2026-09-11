/**
 * The four shared contracts, across `shareholder-rerating`, `catalyst-turnaround`
 * and `fundamental-mean-reversion`, on one set of scenarios.
 *
 *   node tools/verify-shared-scenarios.mjs
 *
 * ── Why this exists, and why it is not a shared library ────────────────────
 *
 * `COMMONISATION-SURVEY.md` (#270, PR #271) compared the three packages by
 * executing them and reached two conclusions at once: **keep the three
 * implementations independent** — the genuinely identical overlap is two
 * functions and about twelve lines — **and build a shared scenario suite**,
 * because on three of the four boundaries all three packages promise to hold,
 * they did not return the same answer, and nothing in this repository would ever
 * have said so. This is that suite (#256).
 *
 * A shared library would have made the three agree *by construction*: one of the
 * three meanings of «an open proposal's weight» would have won silently and
 * nobody would have decided which. The disagreement is the information, so this
 * checker is built to **report** a disagreement rather than to remove it.
 *
 * ── What it asserts, and the list is short on purpose ──────────────────────
 *
 *   ① an unread account is not an empty one — no increase, and the reason is an
 *      absence rather than a refutation;
 *   ② the total and the increment are two numbers, and the increment is the
 *      total less what is already carried, never negative;
 *   ③ an open proposal is counted once — pending totals fold by `max`, a desk's
 *      own restated proposal does not double its own position, and another
 *      desk's pending total is a ceiling and not a position;
 *   ④ a limit that could not be checked is not a limit that passed.
 *
 * Per scenario and per package, exactly four things are compared: **did it
 * authorise an increase**, **which of #256's four causes** if it refused, **the
 * exposure the caps were measured against**, and **the (total, increment)
 * relation**.
 *
 * ⛔ **What it must never assert**: field names, severity words, diagnostic
 * codes, output shapes, and — the one that matters most — splitting conditions,
 * sizing formulas, exit logic, classification vocabularies and thresholds. Those
 * are each package's own (#256), and a cross-package assertion over any of them
 * is commonisation of policy through the back door. The three sizing formulas
 * produce three different weights on every scenario here and none of them is
 * compared to another.
 *
 * ── Two kinds of difference, and they are reported differently ─────────────
 *
 *   **`expectedDisagreement`** — the packages answer differently *by policy*.
 *   Recorded in the scenario with a reason, checked against the answer that
 *   package actually gives, and **green**. A scenario is never skipped and never
 *   softened into an easier one to make three answers into one.
 *
 *   **`knownDefect`** — an answer that is wrong against one of the four
 *   contracts. Checked exactly as everything else is, printed **loudly**, and
 *   green — because #256 forbids a fix for something the checks missed from
 *   travelling in the same change as the check that found it. Every one of them
 *   wants its own issue against its own package.
 *
 * ⚠️ **A `knownDefect` that has stopped reproducing is printed loudly too**, and
 * is also green: the package it names has been fixed, and the answer is to delete
 * the entry, not to fail the build of whoever fixed it.
 *
 * ── Plain Node, deliberately ──────────────────────────────────────────────
 *
 * `node:assert/strict` is not even needed: the comparison is a table and the
 * output is the point. No test framework, no install, no network — the shape
 * `check:allocator`, `check:shareholder-rerating`, `check:catalyst-turnaround`
 * and `check:fundamental-mean-reversion` already use, and for the same reason: a
 * dependency added for a checker is a dependency every future submitter installs
 * to lint a directory of prose.
 *
 * ⚠️ **It runs before `check:pins` in the workflow, and that position is
 * load-bearing** for the reason written at the end of `.github/workflows/lint.yml`.
 */

import { SCENARIOS, THESIS } from './shared-scenarios/scenarios.mjs'
import * as shareholderRerating from './shared-scenarios/adapters/shareholder-rerating.mjs'
import * as catalystTurnaround from './shared-scenarios/adapters/catalyst-turnaround.mjs'
import * as fundamentalMeanReversion from './shared-scenarios/adapters/fundamental-mean-reversion.mjs'

const ADAPTERS = [shareholderRerating, catalystTurnaround, fundamentalMeanReversion]

/** Weights are compared at the tolerance every one of the three already rounds to. */
const TOLERANCE = 1e-9
const same = (left, right) =>
  typeof left === 'number' && typeof right === 'number' ? Math.abs(left - right) <= TOLERANCE : left === right
const show = (value) => (value === null ? 'null' : typeof value === 'number' ? String(value) : String(value))

const failures = []
const defects = []
const staleDefects = []
const disagreements = []
let checks = 0

const table = []

for (const scenario of SCENARIOS) {
  console.log(`\n── ${scenario.id} — contract ${scenario.contract} ───────────────`)
  console.log(`   ${scenario.title}`)
  console.log(`   expected: increase=${scenario.expected.approvesIncrease} cause=${show(scenario.expected.cause)} exposure=${show(scenario.expected.exposure)}`)

  for (const adapter of ADAPTERS) {
    const name = adapter.PACKAGE
    const disagreement = scenario.expectedDisagreement?.[name] ?? null
    const defect = scenario.knownDefect?.[name] ?? null
    /**
     * ⚠️ **The shared answer, then the recorded difference from it.** A package
     * with neither entry is held to the scenario's own expectation; one with an
     * entry is held to *that* answer, so a recorded disagreement is a checked
     * claim rather than an exemption.
     */
    const expected = { ...scenario.expected, ...(disagreement ?? {}), ...(defect ?? {}) }

    const observed = adapter.run({ ...scenario, thesis: THESIS })
    const problems = []

    checks += 3
    if (observed.approvesIncrease !== expected.approvesIncrease) {
      problems.push(`authorised an increase: ${observed.approvesIncrease}, expected ${expected.approvesIncrease}`)
    }
    if (!same(observed.cause ?? null, expected.cause ?? null)) {
      problems.push(`cause: ${show(observed.cause ?? null)}, expected ${show(expected.cause ?? null)}`)
    }
    if (!same(observed.exposure, expected.exposure)) {
      problems.push(`exposure measured against the cap: ${show(observed.exposure)}, expected ${show(expected.exposure)}`)
    }

    /**
     * ── Contract ②, checked as a relation and never as a number ────────────
     *
     * ⛔ **The three weights are three methodologies and are not comparable.**
     * What *is* comparable is that the two numbers are two numbers: the
     * increment is what is left of the total once what is already carried is
     * out of it, and it is never negative — a reduction is a different
     * judgement, not a negative purchase.
     */
    if (typeof observed.total === 'number' && typeof observed.increment === 'number') {
      checks += 2
      if (observed.increment < 0) problems.push(`increment ${observed.increment} is negative`)
      const base = observed.incrementBase
      if (typeof base !== 'number') {
        problems.push('published a total and an increment with no stated base to relate them')
      } else {
        const implied = Math.max(0, observed.total - base)
        if (!same(observed.increment, implied)) {
          problems.push(`increment ${observed.increment} is not the total ${observed.total} less the ${base} already carried`)
        }
      }
    } else if (observed.approvesIncrease) {
      checks += 1
      problems.push('authorised an increase without publishing both a total and an increment')
    }

    const mark = problems.length === 0 ? (defect ? 'DEFECT' : disagreement ? 'differs' : 'ok') : 'FAIL'
    console.log(
      `   ${mark.padEnd(8)}${name.padEnd(28)} increase=${String(observed.approvesIncrease).padEnd(5)} cause=${show(observed.cause ?? null).padEnd(20)} exposure=${show(observed.exposure).padEnd(10)} total=${show(observed.total)} increment=${show(observed.increment)}`,
    )
    for (const problem of problems) console.log(`             ⛔ ${problem}`)

    table.push({ scenario: scenario.id, package: name, observed, expected, kind: mark })

    if (problems.length > 0) {
      /**
       * ⛔ **A `knownDefect` whose observed answer has moved is not a failure.**
       * The recorded answer is what that package gave when this entry was
       * written; a package that now answers something else has been changed,
       * and the entry is stale rather than the build broken.
       */
      if (defect) staleDefects.push({ scenario: scenario.id, package: name, problems, note: defect.note })
      else failures.push({ scenario: scenario.id, package: name, problems })
    } else if (defect) {
      defects.push({ scenario: scenario.id, package: name, note: defect.note, observed })
    } else if (disagreement) {
      disagreements.push({ scenario: scenario.id, package: name, reason: disagreement.reason })
    }
  }
}

console.log('\n══ documented disagreements — a policy difference, recorded and checked ══')
if (disagreements.length === 0) console.log('   (none)')
for (const row of disagreements) {
  console.log(`   • ${row.scenario} / ${row.package}`)
  console.log(`     ${row.reason}`)
}

console.log('\n══ ⛔ KNOWN DEFECTS — a contract answered wrongly, recorded and NOT fixed here ══')
if (defects.length === 0) console.log('   (none)')
for (const row of defects) {
  console.log(`   ⛔ ${row.scenario} / ${row.package}`)
  console.log(`      ${row.note}`)
  console.log(`      observed: increase=${row.observed.approvesIncrease} cause=${show(row.observed.cause ?? null)} exposure=${show(row.observed.exposure)}`)
}

if (staleDefects.length > 0) {
  console.log('\n══ ⚠️ STALE KNOWN DEFECTS — the package no longer answers what was recorded ══')
  for (const row of staleDefects) {
    console.log(`   ⚠️ ${row.scenario} / ${row.package} — ${row.note}`)
    for (const problem of row.problems) console.log(`      ${problem}`)
    console.log('      Delete the `knownDefect` entry, or correct it to what the package now answers.')
  }
}

if (failures.length > 0) {
  console.log('\n══ ⛔ CONTRACT VIOLATIONS ══')
  for (const row of failures) {
    console.log(`   ⛔ ${row.scenario} / ${row.package}`)
    for (const problem of row.problems) console.log(`      ${problem}`)
  }
  console.log(
    `\nshared scenarios FAILED — ${failures.length} unrecorded contract violation(s) across ${SCENARIOS.length} scenario(s) × ${ADAPTERS.length} package(s).`,
  )
  process.exit(1)
}

console.log(
  `\nshared scenarios ok — ${checks} check(s), ${SCENARIOS.length} scenario(s) × ${ADAPTERS.length} package(s), ${disagreements.length} documented disagreement(s), ${defects.length} known defect(s)${staleDefects.length > 0 ? `, ${staleDefects.length} stale known defect(s)` : ''}.`,
)
