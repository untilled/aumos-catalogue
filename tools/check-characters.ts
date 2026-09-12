/**
 * Two managers must not wear the same face. (untilled/aumos#938)
 *
 *   node --experimental-strip-types tools/check-characters.ts
 *
 * ── What this asks that the lint cannot ────────────────────────────────────
 *
 * `tools/lint/` judges one package at a time — that `character` is two strings,
 * that the generator is one this build knows. Uniqueness is not a property of
 * one package, and it is the property the catalogue actually needs: a face is
 * how a person tells one manager from another in a sidebar of sixteen-pixel
 * marks, and two managers drawn identically is a defect no per-package rule can
 * see and no reviewer will notice from a diff.
 *
 * ⚠️ **The subject is the portrait's pixels, not the appearance.** #938 is
 * explicit that these are different questions: two appearances that differ only
 * below the neck — a different shirt, different trousers — produce the *same*
 * sixteen-pixel face, and the catalogue would show one drawing twice while every
 * signature was distinct. So `portraitFingerprint` is what fails this job, and
 * `appearanceSignature` collisions are printed as a warning: a full-body
 * duplicate is impossible while faces are unique, but a near-duplicate is worth
 * a reviewer's eye.
 *
 * ── Resolving a collision ──────────────────────────────────────────────────
 *
 * ⛔ Not at runtime. #938 refuses reassignment by roster — a face that moved
 * because somebody else was installed is not an identity. The fix is a suffix on
 * the *later-published* package's seed (`"<id>#2"`), committed here, permanent
 * from that day: a published seed is never changed, so the earlier package keeps
 * the face people already know it by.
 *
 * ── Why the generator is a copy ────────────────────────────────────────────
 *
 * `tools/characters/characters.ts`, vendored, for `tools/lint/VENDORED.md`'s
 * reason: `untilled/aumos` is private and a fork's pull request is given no
 * secrets, so the rules that greet a submission have to be readable source
 * sitting here. It has no imports, so this runs with nothing installed — the
 * same arrangement as every `check:*` step.
 *
 * ⚠️ **A stale copy is a face this repository draws and Aumos does not.** The
 * guard is `scripts/check-catalogue-tools.mjs` over there, asking daily whether
 * this copy is the generated one, in exactly the shape it already asks it of
 * `tools/lint/`.
 *
 * ── The table it prints ────────────────────────────────────────────────────
 *
 * #938 asks for a contact sheet a person looks at. This is not that — a terminal
 * cannot show a face — but the reviewer opening the sheet needs to know what
 * they are meant to be seeing, and «hair, face, accessory» is the part of an
 * appearance that survives being drawn at sixteen pixels. Clothing is left out
 * on purpose: a table that made outfits look like diversity is the mistake the
 * fingerprint check exists to catch.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GENERATOR_ID,
  type CharacterDescriptor,
  appearanceSignature,
  defaultSeedFor,
  isSeed,
  portraitFingerprint,
  portraitFor,
  resolveAppearance,
} from './characters/characters.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANAGERS = join(ROOT, 'managers')

/**
 * Generators this repository can draw.
 *
 * ⚠️ **One name, and a second one only ever joins it.** #938's version policy is
 * that a new generator is a new *value* and the old one keeps rendering what it
 * always rendered, so removing a row here would move every published face that
 * named it.
 */
const KNOWN = new Set([GENERATOR_ID])

interface Face {
  readonly id: string
  readonly descriptor: CharacterDescriptor
  readonly fingerprint: string
  readonly signature: string
  readonly hair: string
  readonly face: string
  readonly accessory: string
}

const problems: string[] = []
const faces: Face[] = []

for (const directory of readdirSync(MANAGERS).sort()) {
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(readFileSync(join(MANAGERS, directory, 'aumos.json'), 'utf8'))
  } catch {
    continue // Not a package directory — `managers/README.md` and its translation.
  }

  const id = typeof manifest.id === 'string' ? manifest.id : directory
  const declared = manifest.character as { generator?: unknown; seed?: unknown } | undefined

  // ⚠️ No descriptor is legal and is **not** a hole: the face falls back to the
  // package id, which is what every package published before #938 already draws.
  // This says so rather than passing in silence, because in *this* repository an
  // omission is a submission that forgot rather than a compatibility case.
  const generator = declared === undefined ? GENERATOR_ID : declared.generator
  const seed = declared === undefined ? defaultSeedFor({ packageId: id }) : declared.seed
  if (declared === undefined) {
    console.log(`  --    ${id} — no descriptor; derived from the package id`)
  }

  if (typeof generator !== 'string' || !KNOWN.has(generator)) {
    problems.push(
      `${id}: character.generator ${JSON.stringify(generator)} is not one this repository can ` +
        'draw — a published catalogue cannot show a face it has no generator for',
    )
    continue
  }
  if (typeof seed !== 'string' || !isSeed(seed)) {
    problems.push(
      `${id}: character.seed ${JSON.stringify(seed)} is not a seed — printable ASCII, 1 to 128 ` +
        'characters, because the hash is over bytes',
    )
    continue
  }

  const descriptor: CharacterDescriptor = { generator, seed }
  const appearance = resolveAppearance(descriptor)
  const rows = portraitFor(descriptor)
  if (appearance === null || rows === null) {
    problems.push(`${id}: the generator refused ${JSON.stringify(descriptor)}`)
    continue
  }

  faces.push({
    id,
    descriptor,
    fingerprint: portraitFingerprint(rows),
    signature: appearanceSignature(appearance),
    hair: `${appearance.hair}/${appearance.hairColour}`,
    face: `${appearance.face}/${appearance.skin}/${appearance.eyes}`,
    accessory: appearance.accessory,
  })
}

// ── The table ───────────────────────────────────────────────────────────────

const column = (values: readonly string[]) => Math.max(...values.map((value) => value.length))
const widths = {
  id: column(faces.map((face) => face.id)),
  hair: column(faces.map((face) => face.hair)),
  face: column(faces.map((face) => face.face)),
}
console.log('')
for (const face of faces) {
  console.log(
    `  ${face.fingerprint}  ${face.id.padEnd(widths.id)}  ${face.hair.padEnd(widths.hair)}  ` +
      `${face.face.padEnd(widths.face)}  ${face.accessory}`,
  )
}
console.log('')

// ── Duplicates ──────────────────────────────────────────────────────────────

const by = (key: (face: Face) => string) => {
  const groups = new Map<string, Face[]>()
  for (const face of faces) {
    const value = key(face)
    groups.set(value, [...(groups.get(value) ?? []), face])
  }
  return [...groups].filter(([, group]) => group.length > 1)
}

for (const [signature, group] of by((face) => face.signature)) {
  console.log(`⚠️  ${group.map((face) => face.id).join(' and ')} resolve to one appearance:`)
  console.log(`    ${signature}`)
}

for (const [fingerprint, group] of by((face) => face.fingerprint)) {
  const names = group.map((face) => face.id)
  problems.push(
    `${names.join(' and ')} draw the same face (${fingerprint}). Give the ` +
      `later-published one a suffixed seed — \`"seed": "${names[names.length - 1]}#2"\` in its ` +
      'aumos.json — and leave the earlier one alone: a published seed does not move.',
  )
}

if (problems.length === 0) {
  console.log(`${faces.length} managers, ${faces.length} distinct faces.`)
  process.exit(0)
}

console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
for (const problem of problems) console.log(`  ${problem}`)
process.exit(1)
