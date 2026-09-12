/**
 * `metadata.character` is projected from the package's manifest, never typed.
 * (untilled/aumos#938)
 *
 *   node tools/project-character.mjs            # is the index what the manifests say?
 *   node tools/project-character.mjs --write    # make it so
 *
 * ── Why a projector rather than a field a submitter fills in ───────────────
 *
 * A manager's face is `{generator, seed}` hashed to an appearance, and the
 * catalogue shows that face **before** anything is downloaded — from the index,
 * which is the only document a machine fetches ahead of the bytes. So the
 * descriptor has to be in two places: `managers/<id>/aumos.json`, which is where
 * the package declares its own identity, and `.claude-plugin/marketplace.json`,
 * which is what a browsing installation reads.
 *
 * Two places means they can disagree, and the disagreement is **silent and
 * visible**: the card shows one face and the installed manager another, with
 * nothing refusing either. Every other `metadata` field has that same shape and
 * lives with it, because every other field is prose a person compares by
 * reading. A face is not comparable by reading — `1cfdc6b9…` and `1daf0178…`
 * look equally plausible next to any package.
 *
 * So this repository keeps the manifest as the source and derives the entry.
 * The index is still committed, still served at `HEAD`, still the publication;
 * what changes is that the one field nobody can proof-read is written by a
 * program, and CI asks whether it still matches. ⛔ It projects nothing else —
 * the rest of `metadata` is authored, and widening this into a general
 * regenerator would make every submission a merge conflict with a generator.
 *
 * ── What it does with an entry that names another repository ───────────────
 *
 * Nothing, and says so. A `git-subdir` entry's manifest lives at a pinned commit
 * in somebody else's tree; this script reads the working tree, so for that shape
 * there is no manifest here to project from and the authored value stands.
 * `tools/check-index.mjs` documents the same boundary for the same reason.
 *
 * ⚠️ **A malformed descriptor is not this script's problem.** `npm run lint`
 * owns the shape (`tools/lint/manager-package-manifest.schema.json`) and
 * `tools/check-characters.ts` owns whether the faces are distinct. This one only
 * asks whether the index repeats what the manifest says.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = join(ROOT, '.claude-plugin', 'marketplace.json')

const write = process.argv.includes('--write')

const raw = readFileSync(INDEX, 'utf8')
const document = JSON.parse(raw)

const problems = []
let projected = 0
let skipped = 0

for (const entry of document.plugins ?? []) {
  const where = `.claude-plugin/marketplace.json → ${entry.name}`

  if (typeof entry.source !== 'string') {
    skipped += 1
    console.log(`  --    ${entry.name} — pinned to another repository, authored value kept`)
    continue
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, entry.source, 'aumos.json'), 'utf8'))
  } catch (error) {
    problems.push(`${where}: cannot read its manifest — ${error.message}`)
    continue
  }

  const declared = manifest.character
  const carried = entry.metadata?.character

  // Two strings, in this order, and nothing else travels. Copying the object
  // wholesale would carry a key the schema refuses into a document nothing
  // validates on the way in.
  const wanted =
    declared === undefined
      ? undefined
      : { generator: declared.generator, seed: declared.seed }

  if (JSON.stringify(carried) === JSON.stringify(wanted)) {
    console.log(`  ok    ${entry.name}${wanted ? ` — ${wanted.seed}` : ' — no descriptor'}`)
    continue
  }

  if (!write) {
    problems.push(
      `${where}: the index says ${JSON.stringify(carried ?? null)} and the manifest says ` +
        `${JSON.stringify(wanted ?? null)}`,
    )
    console.log(`  DIFF  ${entry.name}`)
    continue
  }

  entry.metadata ??= {}
  if (wanted === undefined) delete entry.metadata.character
  else entry.metadata.character = wanted
  projected += 1
  console.log(`  set   ${entry.name} — ${wanted ? wanted.seed : 'removed'}`)
}

console.log('')

if (write) {
  // Byte-identical formatting to what is committed — 2-space `JSON.stringify`
  // with a trailing newline — so the diff is the projection and nothing else.
  writeFileSync(INDEX, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`Projected ${projected} entr${projected === 1 ? 'y' : 'ies'}.`)
  process.exit(0)
}

if (problems.length === 0) {
  console.log(
    `Every entry carries what its manifest declares (${document.plugins.length - skipped} checked).`,
  )
  process.exit(0)
}

console.log(`${problems.length} entr${problems.length === 1 ? 'y is' : 'ies are'} out of step:`)
for (const problem of problems) console.log(`  ${problem}`)
console.log('')
console.log('Run `npm run character:project` and commit the result. Do not edit')
console.log('`.claude-plugin/marketplace.json` by hand for this field: the manifest is where a')
console.log('package declares its own face, and a published seed is never changed afterwards.')
process.exit(1)
