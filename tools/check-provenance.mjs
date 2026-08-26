/**
 * A ported package and the spec beside it have to agree. (untilled/aumos#477 슬라이스 C)
 *
 *   node tools/check-provenance.mjs
 *
 * ── Where these checks come from ───────────────────────────────────────────
 *
 * They ran in `untilled/aumos`, over `examples/managers/ai-hedge-fund-value/` —
 * a second copy of the package this repository publishes. #477 deleted that copy
 * because it had drifted from what is published here, and these four checks went
 * with it: **they need the package and its `harness.json` together, and after
 * the deletion only this repository has both.**
 *
 * What moved is stated one file at a time rather than as a summary, because each
 * was defending something different:
 *
 *   ⑴ the manifest and the spec name **one** commit, licence, holder and repo.
 *      A spec that drifted from the package it produced is a provenance record
 *      for something else — worse than none, because it is the document a
 *      licence audit reads;
 *   ⑵ both point at **one** notice, so an attribution cannot exist in two
 *      versions that can disagree;
 *   ⑶ the spec's `capabilities` are exactly the manifest's. The manifest is what
 *      the installer enforces (§37) and the spec is what a reader audits; a spec
 *      claiming the narrower grant understates the reach of what it attributes;
 *   ⑷ every role in `graph` appears in `PROMPT.md`, **in the graph's order**.
 *      This is the claim that a HarnessSpec graph describes *the layout of a
 *      document* rather than an execution plan, which is the whole reason the
 *      format can record a port without becoming a runtime.
 *
 * ✅ **And it runs over a larger corpus than it used to.** Over there it was one
 * package, the only real port anyone had written. Here it is every submission
 * that ships a `harness.json`, including ones nobody at Aumos wrote — which is
 * the same reason the bundle lint belongs here.
 *
 * ⛔ **It is not a licence audit.** It asks whether the two documents a package
 * ships agree with each other; it cannot tell you whether either is true of the
 * upstream repository they name. Nothing here fetches that repository.
 *
 * ⚠️ **A package with no `harness.json` is not a problem.** Most packages are
 * nobody's derivative and declare nothing — an absent field cannot establish
 * originality any more than it could establish a licence. What is refused is a
 * package that declares `provenance` **and** ships a spec that says something
 * else.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANAGERS = join(ROOT, 'managers')

const problems = []
const notes = []

function problem(message) {
  problems.push(message)
}

function read(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Every role id the graph names, in the order the graph names them.
 *
 * ⚠️ A copy of `@aumos/harness-spec`'s `graphRoleIds`, for the reason
 * `tools/lint/` is a copy of `@aumos/package-lint`: a fork's pull request runs
 * with no secrets and cannot install a private workspace. Two implementations
 * of one function is the cost that arrangement charges, and the shape is small
 * enough to read side by side.
 */
function graphRoleIds(graph) {
  if (graph.kind === 'sequential') return [...(graph.stages ?? [])]
  return [...(graph.fanout ?? []), ...(graph.aggregate ?? [])]
}

function checkPackage(id) {
  const directory = join(MANAGERS, id)
  const specPath = join(directory, 'harness.json')
  if (!existsSync(specPath)) return false

  const manifest = read(join(directory, 'aumos.json'))
  const spec = read(specPath)
  const declared = manifest.provenance
  const where = `${id}/harness.json`

  // ⑷ 먼저, provenance가 없어도 참이어야 하는 것.
  const prompt = readFileSync(join(directory, manifest.prompt ?? './PROMPT.md'), 'utf8').toLowerCase()
  const order = graphRoleIds(spec.graph ?? {})
  const positions = order.map((role) => prompt.indexOf(String(role).toLowerCase()))
  const missing = order.filter((_, index) => positions[index] === -1)
  if (missing.length > 0) {
    problem(`${where}: graph names ${missing.join(', ')}, which ${id}/PROMPT.md never mentions`)
  } else {
    const sorted = [...positions].sort((a, b) => a - b)
    if (positions.some((value, index) => value !== sorted[index])) {
      problem(
        `${where}: the graph's order is ${order.join(' → ')}, and PROMPT.md introduces them in a ` +
          'different one — a HarnessSpec graph describes the layout of the document, not a plan',
      )
    }
  }

  if (declared === undefined) {
    problem(`${id}/aumos.json ships a harness.json and declares no provenance`)
    return true
  }

  // ⑴
  for (const field of ['sourceRepo', 'commit', 'license', 'licenseHolder']) {
    if (declared[field] !== spec.provenance?.[field]) {
      problem(
        `${id}: aumos.json says provenance.${field} is ${JSON.stringify(declared[field])} and ` +
          `harness.json says ${JSON.stringify(spec.provenance?.[field])}`,
      )
    }
  }
  if (spec.producesPackage !== manifest.id) {
    problem(`${where}: producesPackage is ${spec.producesPackage}, and this package is ${manifest.id}`)
  }

  // ⑵ 하나의 고지. 경로가 같아야 하고, 그 파일이 실제로 저작권자를 담아야 한다.
  if (declared.notice !== spec.provenance?.notice) {
    problem(
      `${id}: the manifest and the spec point at two notices ` +
        `(${declared.notice} and ${spec.provenance?.notice}) — an attribution with two versions`,
    )
  } else {
    const noticePath = join(directory, declared.notice)
    if (!existsSync(noticePath)) {
      problem(`${id}: provenance.notice names ${declared.notice}, which the package does not ship`)
    } else if (!readFileSync(noticePath, 'utf8').includes(declared.licenseHolder)) {
      problem(`${id}/${declared.notice} does not name ${declared.licenseHolder}`)
    }
  }

  // ⑶
  const asked = (manifest.capabilities ?? []).map((capability) => capability.kind).sort()
  const audited = [...(spec.capabilities ?? [])].sort()
  if (JSON.stringify(asked) !== JSON.stringify(audited)) {
    problem(
      `${id}: the manifest asks for [${asked.join(', ')}] and the spec audits ` +
        `[${audited.join(', ')}] — a spec that understates the grant understates what it attributes`,
    )
  }

  return true
}

let checked = 0
for (const entry of readdirSync(MANAGERS, { withFileTypes: true }).sort()) {
  if (!entry.isDirectory()) continue
  if (checkPackage(entry.name)) {
    checked += 1
    notes.push(`${entry.name} — package and harness spec agree`)
  }
}

for (const note of notes) console.log(`  ok  ${note}`)

if (checked === 0) {
  // ⚠️ 초록이 아니라 문장이다. 이 검사가 아무것도 재지 않는 상태는 조용하면 안 된다.
  console.log('  --  no package here ships a harness.json, so nothing was compared')
}

if (problems.length > 0) {
  console.error(`\n${problems.length} provenance problem(s):\n`)
  for (const message of problems) console.error(`  ✗ ${message}`)
  process.exit(1)
}
