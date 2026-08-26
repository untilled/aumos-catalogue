/**
 * Who may wear a reserved publisher name, and where that is written down.
 *
 *   node tools/check-publisher.mjs
 *
 * ── What was lost, and it was structural ───────────────────────────────────
 *
 * Attribution used to be a **directory**. This repository held `first-party/`
 * beside `agents/`, and which one a package sat in was a fact a submitter could
 * not move themselves — the path was the provenance, and untilled/aumos read it
 * that way (`officialPackageRoots`). #48 merged the two into `managers/`.
 *
 * What replaced it is `metadata.publisher`, **hand-written, in an entry the
 * submitter writes anyway**. And the whole marketplace document sits in a
 * repository where the name `aumos` is reserved, so Aumos's own reserved-name
 * check — which asks *did this name come from the repository it is reserved
 * to* — is satisfied by construction for every row here, including a merged
 * submission's. `packages/registry/src/marketplace.ts` says the same thing in
 * its own words: *a name check and not a signature*.
 *
 * So a submission can wear our name and no machine says otherwise. The whole of
 * what stands between that and an investor is a person merging a pull request.
 *
 * ── What this check buys, stated narrowly ─────────────────────────────────
 *
 * It does not restore the old guarantee. A fork's pull request can edit
 * `.aumos/first-party.json` exactly as it can edit the marketplace document —
 * ⛔ **this is not enforcement and must not be read as any.**
 *
 * What it changes is that the claim **cannot be made quietly**. Today claiming
 * `aumos` is one field inside an entry a submitter is already writing, next to
 * a description and a version, in a diff a reviewer is reading for other
 * reasons. After this, it also requires adding a line to a file whose only
 * subject is *which packages are untilled's own* — a diff that is one line long
 * and impossible to read as anything else. A human gate is worth the attention
 * the reviewer had that day (CONTRIBUTING says so about review generally), and
 * this is about aiming that attention.
 *
 * `.github/CODEOWNERS` is the other half and is honest about its own limit
 * there.
 *
 * ⬜ The answer that does not depend on attention is a signature over the
 * published bytes — untilled/aumos §45. This is what stands until then.
 *
 * ── Four questions, and the third is the one worth having ─────────────────
 *
 * 1. An entry claiming a reserved name is on the roster.
 * 2. Every roster line names an entry that exists.
 * 3. ⚠️ **The roster names no package that is not published here.** A line left
 *    behind after a package is withdrawn is a name **pre-authorised for
 *    whoever submits it next** — the roster would greet that submission with a
 *    check that already passes, which is the one way this file could make
 *    things worse than no file. That is what (2) is for, and it is why the
 *    roster is checked in both directions rather than read as an allowlist.
 * 4. The roster names no publisher that is not reserved, because a roster line
 *    for a name anybody may use is a rule that does nothing and reads as one
 *    that does.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * ⚠️ **A copy of `RESERVED_PUBLISHERS`, and the drift runs one way.**
 *
 * The table lives in `packages/registry/src/marketplace.ts` in a **private**
 * repository, so this cannot import it for `tools/lint/VENDORED.md`'s reason —
 * a fork's pull request is given no secrets, by design.
 *
 * ⛔ The asymmetry matters: if Aumos reserves a **new** name and this list stays
 * behind, submissions may claim that name here and this check says nothing. The
 * reverse — a name here that Aumos no longer reserves — is caught by question 4
 * below. So the direction that fails silently is *adding* one, and adding one
 * over there means adding it here in the same breath.
 */
const RESERVED = ['aumos']

const problems = []

function read(path) {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), 'utf8'))
  } catch (error) {
    problems.push(`${path} could not be read: ${error.message}`)
    return null
  }
}

const roster = read('.aumos/first-party.json')
const marketplace = read('.claude-plugin/marketplace.json')
const sources = read('.aumos/sources.json')

if (roster && marketplace && sources) {
  // Both documents, one rule. A reserved name is reserved for a *publisher*
  // and not for a kind of thing, so a source claiming it and a manager claiming
  // it are the same claim and are answered in the same place.
  const claims = [
    ...(marketplace.plugins ?? []).map((entry) => ({ kind: 'managers', entry })),
    ...(sources.sources ?? []).map((entry) => ({ kind: 'sources', entry })),
  ]

  for (const { kind, entry } of claims) {
    const publisher = entry.metadata?.publisher
    if (typeof publisher !== 'string') continue
    if (!RESERVED.includes(publisher.toLowerCase())) continue

    const listed = roster[publisher]?.[kind] ?? []
    if (!listed.includes(entry.name)) {
      problems.push(
        `${kind}/${entry.name} claims the publisher “${publisher}”, which is reserved. ` +
          `Packages untilled publishes here are listed in .aumos/first-party.json; ` +
          `if this is a submission, use your own name.`,
      )
    }
  }

  for (const [publisher, kinds] of Object.entries(roster)) {
    if (!RESERVED.includes(publisher.toLowerCase())) {
      problems.push(
        `.aumos/first-party.json names the publisher “${publisher}”, which is not reserved. ` +
          `Anybody may publish under it, so a line here grants nothing and reads as though it does.`,
      )
      continue
    }

    for (const [kind, names] of Object.entries(kinds)) {
      const published = new Set(
        claims.filter((claim) => claim.kind === kind).map((claim) => claim.entry.name),
      )
      for (const name of names) {
        if (!published.has(name)) {
          problems.push(
            `.aumos/first-party.json lists ${kind}/${name} under “${publisher}”, and no such ` +
              `entry is published. A line left behind is that name held open for whoever ` +
              `submits it next — remove it in the commit that withdraws the package.`,
          )
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} publisher problem(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    `\nWho may wear a reserved name is written in .aumos/first-party.json, and ` +
      `tools/check-publisher.mjs says what that file is and is not worth.`,
  )
  process.exit(1)
}

console.log(
  `✓ every entry claiming a reserved publisher is on the roster, and the roster names ` +
    `nothing that is not published (${RESERVED.join(', ')})`,
)
