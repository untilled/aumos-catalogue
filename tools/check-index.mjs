/**
 * The two documents machines actually read, checked against this repository.
 *
 *   node tools/check-index.mjs
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `lint/` and `lint-sources/` judge the **directories** — a submitted package,
 * a submitted source document. Nothing judged the two index documents that name
 * them, and those are the only files an installed Aumos ever fetches:
 * `.claude-plugin/marketplace.json` and `.aumos/sources.json`.
 *
 * That gap shipped. The `alpaca` row carried a `sha` somebody had written by
 * hand — a short sha padded with zeros, 41 characters long and wrong in the
 * eighth — so Aumos's `managerSourceSchema` refused the row, its reader dropped
 * it, and the source was **absent from every machine's catalogue** while sitting
 * right here in the file. Nothing said so at either end.
 *
 * ── Why this is not the Aumos schema copied again ──────────────────────────
 *
 * `lint-sources/` is vendored from Aumos and byte-compared over there, which is
 * the right shape for rules Aumos owns. These are not those rules. Aumos's
 * schema can say *forty lowercase hex characters* and can say nothing else: from
 * where it runs, a sha is an opaque forty-character string it will hand to a
 * download. **This** repository is the only place that can answer whether that
 * commit is real, whether the directory the entry points at exists inside it,
 * and whether the version claimed matches the manifest committed there.
 *
 * So the checks below are deliberately the ones the schema cannot make, plus the
 * single one it can — because a 41-character sha is exactly what happened and a
 * guard that assumed the obvious case away would have let it through again.
 *
 * ── Two shapes of `source`, since #112 ① ──────────────────────────────────
 *
 * The rule is about the **boundary**, not about which document an entry is in:
 *
 *   an entry that names *this* repository   →  `"source": "./sources/open-dart"`
 *   an entry that names *another* one       →  `git-subdir` + a 40-hex `sha`
 *
 * A pin's whole job is that somebody else's `HEAD` can move under you. Across no
 * boundary it buys nothing and costs a second pull request to move it, which is
 * the round trip #112 measured. Both shapes are read here — `checkRelative`
 * states what changes between them — and both must keep being read, because the
 * first entry naming another repository restores the sha shape on its own.
 *
 * ⚠️ **Neither shape belongs to one of the two documents.** #116 converted the
 * five in `.aumos/sources.json` and #115 converts the nine in
 * `.claude-plugin/marketplace.json`, so this file spends one merge with a
 * relative source list and a pinned plugin list and is written for either. When
 * both have landed there is no sha in the repository at all and `check:pins` has
 * nothing left to check — which is the state #112 ① is asking for, not an
 * accident to guard against.
 *
 * ⛔ **What a green tick here does not establish, and it is the reason #116 was
 * held.** Aumos's schema is what admits or drops a row and it is not vendored
 * here — `tools/lint-sources/source-spec.schema.json` is the schema of a source
 * **document** (`spec`/`id`/`hosts`/`endpoints`), has no `source`, `name` or
 * `metadata`, and never sees an index entry. When this was written Aumos's
 * reader took the object shape only (`managerSourceSchema`, a `strictObject`
 * whose `sha` is `/^[0-9a-f]{40}$/`), so a relative entry would have been
 * *skipped* — the `alpaca` failure exactly. untilled/aumos#627 is the reader
 * that accepts both, and the conversion here follows its release rather than
 * this check going green.
 *
 * ⚠️ **Needs full history.** `actions/checkout` clones shallow by default and
 * every `git cat-file` below would then fail on an older pin. The workflow sets
 * `fetch-depth: 0`; run locally in a normal clone and it is already true — and
 * a relative entry does not need it, because it reads the working tree.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The two indexes, and where each entry's claims can be checked.
 *
 * `manifest` is the file inside the pinned directory that owns `version`. The
 * two documents disagree about almost everything else — one is Claude's plugin
 * shape, one is ours — and agree about exactly this much.
 */
const INDEXES = [
  { path: '.claude-plugin/marketplace.json', list: 'plugins', manifest: 'aumos.json' },
  { path: '.aumos/sources.json', list: 'sources', manifest: 'source.json' },
]

const SHA = /^[0-9a-f]{40}$/

/** `git`, or `null` when the object is not in this clone. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  } catch {
    return null
  }
}

const problems = []
const report = (where, message) => problems.push(`${where}: ${message}`)

/**
 * An entry whose `source` is a relative path — `"./sources/open-dart"`,
 * `"./managers/basic-investor"` — rather than a `git-subdir` object. (#112 ①)
 *
 * It is keyed off nothing but the type of `source`, so it serves both indexes:
 * `index.manifest` is already the parameter that says whether the file inside is
 * `source.json` or `aumos.json`.
 *
 * ⚠️ **This is the same questions asked of a different tree.** A pin names a
 * commit, so the sha branch above asks git what that commit holds. A relative
 * path names *this repository at whatever commit the reader took*, so the
 * subject is the working tree and every `git cat-file` becomes a `statSync`.
 * The claims are unchanged: the directory the entry points at exists, and the
 * manifest inside it is the package the entry says it is.
 *
 * ⛔ **What replaces the sha check is the escape check**, and it is not
 * decoration. A sha is a closed vocabulary — forty hex characters or nothing —
 * and a path is not: `"../"` or an absolute path names something outside the
 * tree that gets published, which is a directory the reader will not have and
 * this repository cannot vouch for. So the path must resolve inside `ROOT`,
 * and it must be written `./…` so that a bare `sources/open-dart` — which some
 * readers resolve against their own cwd — is refused here rather than resolved
 * somewhere else.
 *
 * ⚠️ **The working tree, not HEAD, and that is a real difference from
 * `check-pins.mjs`.** An uncommitted directory passes this and is not published.
 * That is the same bound `lint` already has (it reads the working tree too), and
 * the one guard that spoke about *committed* bytes — `check:pins` — no longer
 * has anything to say about a relative entry, and says so in its own ⛔ note.
 *
 * ⚠️ **And the tree a reader installs is not this one either.** With
 * untilled/aumos#627 a relative entry resolves to the repository's `HEAD` **at
 * the moment that machine fetched the document**, which is what replaces the
 * publisher-fixed commit. Two investors reading an hour apart can install
 * different bytes under one version number with nobody having touched the
 * catalogue in between. That is stated where it is decided — #627's own
 * `document.ts` note — and repeated here only so that nobody reads this check's
 * `statSync` as a claim about what installs.
 */
function checkRelative(where, index, entry, source) {
  if (!source.startsWith('./')) {
    report(
      where,
      `source ${JSON.stringify(source)} must begin with "./" — a relative source is resolved against this repository, and a bare path is resolved against whatever the reader's cwd happens to be`,
    )
    return
  }
  const directory = resolve(ROOT, source)
  const inside = relative(ROOT, directory)
  if (inside === '') {
    report(where, `source ${JSON.stringify(source)} is the repository root, not a package directory in it`)
    return
  }
  if (inside.startsWith('..') || isAbsolute(inside)) {
    report(where, `source ${JSON.stringify(source)} resolves outside this repository`)
    return
  }

  try {
    if (!statSync(directory).isDirectory()) {
      report(where, `${inside} is not a directory`)
      return
    }
  } catch {
    report(where, `${inside} does not exist`)
    return
  }

  // The two copies of one fact, the same pair the sha branch compares — read
  // from the tree instead of from a commit.
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(directory, index.manifest), 'utf8'))
  } catch (error) {
    report(where, `${inside}/${index.manifest} cannot be read as JSON — ${error.message}`)
    return
  }
  if (manifest.id !== entry.name) {
    report(
      where,
      `is named ${JSON.stringify(entry.name)}, but ${inside}/${index.manifest} says id ${JSON.stringify(manifest.id)}`,
    )
    return
  }
  if (entry.version !== manifest.version) {
    report(where, `says version ${entry.version}, but ${inside}/${index.manifest} says ${manifest.version}`)
  }
}

for (const index of INDEXES) {
  let document
  try {
    document = JSON.parse(readFileSync(join(ROOT, index.path), 'utf8'))
  } catch (error) {
    report(index.path, `cannot be read as JSON — ${error.message}`)
    continue
  }

  const entries = document[index.list]
  if (!Array.isArray(entries)) {
    report(index.path, `has no "${index.list}" array`)
    continue
  }

  for (const entry of entries) {
    const where = `${index.path} → ${entry?.name ?? '(unnamed)'}`
    const source = entry?.source

    // A relative source is not a pin, so the questions are the working tree's
    // and not a commit's. `checkRelative` says which ones and why.
    if (typeof source === 'string') {
      checkRelative(where, index, entry, source)
      continue
    }

    if (typeof source !== 'object' || source === null) {
      report(where, 'source must be a relative path string or a git-subdir object')
      continue
    }

    const { sha, path } = source
    // The one check Aumos also makes, kept because it is the one that failed.
    // Its message names the length, because "invalid sha" sent nobody looking at
    // a string that was one character too long.
    if (typeof sha !== 'string' || !SHA.test(sha)) {
      report(
        where,
        `sha must be 40 lowercase hex characters; this is ${typeof sha === 'string' ? `${sha.length} characters — "${sha}"` : typeof sha}`,
      )
      continue
    }

    // From here on, the checks Aumos cannot make. An entry can be perfectly
    // shaped and still name a commit nobody pushed.
    if (git(['cat-file', '-e', `${sha}^{commit}`]) === null) {
      report(where, `sha ${sha} is not a commit in this repository`)
      continue
    }
    if (typeof path !== 'string' || path === '') {
      report(where, 'has no path')
      continue
    }
    if (git(['cat-file', '-e', `${sha}:${path}`]) === null) {
      report(where, `${path} does not exist at ${sha}`)
      continue
    }

    // What the entry says this version is, against what the pinned manifest
    // says. These are two copies of one fact and the index is the derived one,
    // so a disagreement means the index was edited without the package being
    // republished — the reader installs bytes that call themselves something
    // else.
    const manifest = git(['show', `${sha}:${path}/${index.manifest}`])
    if (manifest === null) {
      report(where, `${path}/${index.manifest} does not exist at ${sha}`)
      continue
    }
    let claimed
    try {
      claimed = JSON.parse(manifest).version
    } catch (error) {
      report(where, `${path}/${index.manifest} at ${sha} is not JSON — ${error.message}`)
      continue
    }
    if (entry.version !== claimed) {
      report(where, `says version ${entry.version}, but ${index.manifest} at ${sha} says ${claimed}`)
    }
  }
}

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) in the published indexes:\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    '\nThese documents are what an installed Aumos fetches. An entry it cannot read is',
  )
  console.error('dropped from that machine\'s catalogue without the package author being told.')
  process.exit(1)
}

console.log(`indexes ok — ${INDEXES.map((index) => index.path).join(', ')}`)
