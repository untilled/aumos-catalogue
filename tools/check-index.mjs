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
 * ⚠️ **Needs full history.** `actions/checkout` clones shallow by default and
 * every `git cat-file` below would then fail on an older pin. The workflow sets
 * `fetch-depth: 0`; run locally in a normal clone and it is already true.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
    if (typeof source !== 'object' || source === null) {
      report(where, 'has no source object')
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
