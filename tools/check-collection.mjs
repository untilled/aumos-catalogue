/**
 * The three packages of a collection ship the same core, and this proves it.
 * (aumos #447)
 *
 * ── What the split bought, and the one thing it cost ───────────────────────
 *
 * `evidence-gated` is three packages — `evidence-gated-kr`, `evidence-gated-us`
 * and `evidence-gated-global` — because **one package is one manager** and three
 * market roles are three track records, which is the whole reason the
 * methodology was split rather than being selected in config.
 *
 * What that costs is duplication: this catalogue has no way for one package to
 * share code with another, so the deterministic core, the MCP wrapper and the
 * fixtures are committed **three times**. The failure that creates is specific
 * and silent — a fix lands in one copy and not the others, and three packages
 * sold as one methodology quietly compute different numbers. Nothing about a
 * per-package lint can see it: each copy is internally valid.
 *
 * So the guard is here: the shared files are compared **byte for byte**, and the
 * manifests are compared on the one field that makes them a set.
 *
 * ── What is deliberately *not* compared ────────────────────────────────────
 *
 * ⛔ The files that are supposed to differ, listed below as `OWN`: the manifest,
 * the settings schema, the CLI's plugin document, the translation, the prompt
 * and the two READMEs. Those are where a package says which market it is, and a
 * check that demanded they match would be demanding the split back.
 *
 * ⛔ Whether the *contents* are right. That is `check:allocator`'s, which runs
 * the core against its fixtures — once, against the Global member, because this
 * check has already established the other two are the same bytes.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANAGERS = fileURLToPath(new URL('../managers/', import.meta.url))

/** The collection, and the order its members are reported in. */
const COLLECTION = 'evidence-gated'
const MEMBERS = ['evidence-gated-kr', 'evidence-gated-us', 'evidence-gated-global']

/**
 * The files a member is expected to write for itself.
 *
 * A path is either its own or shared, and there is no third answer — a file
 * nobody listed here is shared, which is the safe direction: a new file that
 * genuinely differs per market fails this check until somebody says so, and a
 * new shared file is guarded from the day it lands.
 */
const OWN = new Set([
  'aumos.json',
  'config.schema.json',
  '.claude-plugin/plugin.json',
  'translations/ko.json',
  'PROMPT.md',
  'README.md',
  'README.ko.md',
  'IMPLEMENTATION.md',
  'CONFORMANCE.md',
])

function walk(root, base = root) {
  const out = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) out.push(...walk(path, base))
    else if (entry.isFile()) out.push(relative(base, path))
  }
  return out.sort()
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12)
}

const problems = []
const trees = new Map()
for (const member of MEMBERS) {
  const root = join(MANAGERS, member)
  assert.ok(statSync(root).isDirectory(), `${member} is not in this catalogue`)
  trees.set(member, walk(root))
}

// ── every member holds the same set of files ────────────────────────────────
const [first, ...rest] = MEMBERS
for (const member of rest) {
  const mine = new Set(trees.get(member))
  const theirs = new Set(trees.get(first))
  for (const path of theirs) if (!mine.has(path)) problems.push(`${member} is missing ${path}`)
  for (const path of mine) if (!theirs.has(path)) problems.push(`${first} is missing ${path}`)
}

// ── and the shared ones are the same bytes ──────────────────────────────────
for (const path of trees.get(first)) {
  if (OWN.has(path)) continue
  const digests = new Map(
    MEMBERS.filter((member) => trees.get(member).includes(path)).map((member) => [
      member,
      digest(join(MANAGERS, member, path)),
    ]),
  )
  if (new Set(digests.values()).size > 1) {
    problems.push(
      `${path} differs across the collection — ${[...digests]
        .map(([member, sha]) => `${member} ${sha}`)
        .join(', ')}`,
    )
  }
}

// ── and they agree about being one set ──────────────────────────────────────
//
// The publisher is in the comparison because that is what the product compares:
// a collection is `publisher` **and** `collection.id`, so two members published
// under different names are two collections however alike their prose is.
const declared = MEMBERS.map((member) => {
  const manifest = JSON.parse(readFileSync(join(MANAGERS, member, 'aumos.json'), 'utf8'))
  return { member, manifest }
})
for (const { member, manifest } of declared) {
  if (manifest.id !== member) problems.push(`${member}/aumos.json calls itself ${manifest.id}`)
  if (manifest.collection?.id !== COLLECTION) {
    problems.push(`${member} does not declare the ${COLLECTION} collection`)
  }
  if (manifest.contributes?.managers?.length !== 1) {
    problems.push(`${member} contributes ${manifest.contributes?.managers?.length} managers, and one package is one manager`)
  }
}
const keys = new Set(
  declared.map(({ manifest }) => `${manifest.publisher} ${manifest.collection?.id}`),
)
if (keys.size > 1) {
  problems.push(`the members do not share one publisher and collection id: ${[...keys].join(' · ')}`)
}
const names = new Set(declared.map(({ manifest }) => manifest.collection?.name))
if (names.size > 1) {
  // Every member carries the name because no member is the collection's home,
  // and the catalogue draws whichever it read first. Two spellings is a card
  // whose title depends on the order of a listing.
  problems.push(`the members disagree about the collection's name: ${[...names].join(' · ')}`)
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`  ✗ ${problem}`)
  console.error(
    `\n${COLLECTION}: ${problems.length} problem(s). The members share a core they each ship a copy of; a fix belongs in all three.`,
  )
  process.exit(1)
}

const shared = trees.get(first).filter((path) => !OWN.has(path)).length
console.log(
  `  ok  ${COLLECTION} — ${MEMBERS.length} packages, ${shared} shared files identical, ${OWN.size} written per member`,
)
