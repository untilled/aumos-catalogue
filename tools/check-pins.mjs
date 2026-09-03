/**
 * The drift guard on the published pins.
 *
 *   node tools/check-pins.mjs
 *
 * ── What a pin is, and how it goes wrong ───────────────────────────────────
 *
 * Since untilled/aumos#323 this repository **commits** its own list rather than
 * having one generated from it: `.claude-plugin/marketplace.json` is read by
 * Aumos's BROWSE and by `/plugin marketplace add`, and each entry names a
 * `git-subdir` source — a `path` inside this repository and the `sha` to take
 * it from. What is published is the tree at that sha, not the tree on `main`.
 *
 * So the pin can be **behind the files beside it**, and that state is silent.
 * `npm run lint` reads the working tree and passes; the catalogue serves an
 * older package. It happened on the first submission that needed a fix after
 * review (#43): three commits corrected the package, the pin stayed on the
 * commit before them, and nothing said so.
 *
 * ── Why the pin goes stale by construction rather than by carelessness ─────
 *
 * A pin names a commit that already exists, so the commit that changes a
 * package cannot pin itself. The repository's own answer is a follow-up repin
 * commit — `a79d1bf`, `22648e7`, `1be9d98` are all that — and a step that only
 * exists in somebody's memory is a step that is skipped. This is that step,
 * moved into the build.
 *
 * ── What is compared, and why it is the tree and not the log ───────────────
 *
 * `<sha>:<path>` and `HEAD:<path>` resolve to git tree objects, and two equal
 * tree ids are the same bytes. Asking the log instead — *"did any commit after
 * the pin touch this path"* — reports a difference where there is none the
 * moment a change is reverted, and the question a reader has is about the bytes
 * that get installed.
 *
 * ⚠️ **HEAD, not the working tree.** A pin names a commit, and an uncommitted
 * edit is not published — so this passes on staged-but-uncommitted work and is
 * meant to. Run it after committing.
 *
 * ── The two cheap neighbours ──────────────────────────────────────────────
 *
 * `name` and `version` are hand-copied into the same entry from `aumos.json`
 * and go stale the same way, for the same reason, at no extra cost to check. A
 * `version` that disagrees with the manifest is the entry describing a release
 * that is not the one it serves.
 *
 * What this does **not** claim: that the pinned tree is any good. That is the
 * lint's subject, and the lint reads the working tree — the two guards answer
 * different questions and neither substitutes for the other.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKETPLACE = '.claude-plugin/marketplace.json'

/** `git` with its output, or `null` where git itself refused. */
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/**
 * ⚠️ **The source list was not read here until untilled/aumos#486.**
 *
 * This script named one document, and `.aumos/sources.json` pinned its entries
 * the same way — `git-subdir` and a sha. So the two halves of this repository
 * could point at different commits and nothing said so, which is exactly what
 * happened: untilled/aumos#477's pull request repinned every manager entry and
 * left every source entry on the commit before it, undoing #57's *every entry
 * points at one commit* without a single red line.
 *
 * The manifest filename is the only real difference between the two, so it is a
 * parameter and everything else is one loop.
 *
 * ⛔ **And since #112 ① the source entries no longer pin anything.** All five
 * are written `"source": "./sources/<id>"` — a relative path, because every one
 * of them named this repository and a pin across no boundary bought nothing but
 * a second pull request to move it. They reach the `git-subdir` guard below,
 * fail it, and print `--`: **this script now has nothing to say about
 * `.aumos/sources.json`**, and the paragraph above is kept because the failure
 * it describes is real and returns the moment a source entry pins again.
 *
 * ⚠️ **What is no longer guarded, stated rather than left to be discovered.**
 * The claim this file makes is *the reviewed tree is the installed tree*, and
 * for a relative entry it is `.aumos/sources.json`'s reader — the Aumos
 * generator, reading `main` at whatever moment it runs — that has to keep it.
 * That is a claim this repository cannot check, and it is the reason #112 ① is
 * gated on the Aumos side rather than on this build going green.
 */
const SOURCES = '.aumos/sources.json'

const marketplace = JSON.parse(readFileSync(join(ROOT, MARKETPLACE), 'utf8'))
const sourcesList = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, SOURCES), 'utf8'))
  } catch {
    // ⚠️ Absent is **not** a failure: a repository with no source list simply
    // has no sources, which `marketplace.ts` calls the ordinary case.
    return null
  }
})()
const plugins = [
  ...(Array.isArray(marketplace.plugins) ? marketplace.plugins : []).map((entry) => ({
    entry,
    manifest: 'aumos.json',
    document: MARKETPLACE,
  })),
  ...(Array.isArray(sourcesList?.sources) ? sourcesList.sources : []).map((entry) => ({
    entry,
    manifest: 'source.json',
    document: SOURCES,
  })),
]

let failed = 0
const fail = (entry, message, detail) => {
  failed += 1
  console.log(`FAIL  ${entry} ${message}`)
  if (detail) for (const line of detail) console.log(`        ${line}`)
}

if (plugins.length === 0) {
  console.log(`FAIL  ${MARKETPLACE} lists no plugins`)
  process.exit(1)
}

for (const { entry: plugin, manifest: manifestFile, document } of plugins) {
  const entry = plugin?.name ?? '(unnamed entry)'
  const source = plugin?.source ?? {}

  if (source.source !== 'git-subdir') {
    console.log(`  --  ${entry} is not a git-subdir source, so there is no pin to check`)
    continue
  }
  if (typeof source.path !== 'string' || typeof source.sha !== 'string') {
    fail(entry, 'has a git-subdir source without both a path and a sha')
    continue
  }

  // The commit has to be in this clone at all. It is not in a shallow one, and
  // a checker that passed there would pass for the wrong reason — so the
  // workflow fetches the full history and this says which failure it is.
  if (git('rev-parse', '--verify', '--quiet', `${source.sha}^{commit}`) === null) {
    fail(entry, `pins ${source.sha.slice(0, 12)}, which is not a commit in this clone`, [
      'A shallow clone has one commit and cannot answer this. `fetch-depth: 0`.',
    ])
    continue
  }

  const pinned = git('rev-parse', `${source.sha}:${source.path}`)
  const head = git('rev-parse', `HEAD:${source.path}`)

  if (head === null) {
    fail(entry, `names ${source.path}, which is not in HEAD`)
    continue
  }
  if (pinned === null) {
    fail(entry, `pins ${source.sha.slice(0, 12)}, where ${source.path} does not exist`)
    continue
  }
  if (pinned !== head) {
    const last = git('log', '-1', '--format=%h %s', `${source.sha}..HEAD`, '--', source.path)
    fail(entry, `pins ${source.sha.slice(0, 12)}, whose ${source.path} is not the one in HEAD`, [
      `pinned tree ${pinned.slice(0, 12)} — this is what installs`,
      `HEAD tree   ${head.slice(0, 12)} — this is what was reviewed`,
      ...(last ? [`newest commit on that path since the pin: ${last}`] : []),
      'Repin the entry to the commit that carries the reviewed tree.',
    ])
    continue
  }

  // The neighbours, once the pin itself is sound.
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, source.path, manifestFile), 'utf8'))
  } catch {
    fail(entry, `names ${source.path}, which has no readable ${manifestFile}`)
    continue
  }
  if (manifest.id !== plugin.name) {
    fail(entry, `is named ${JSON.stringify(plugin.name)} and its manifest id is ${JSON.stringify(manifest.id)}`)
    continue
  }
  if (manifest.version !== plugin.version) {
    fail(entry, `publishes version ${plugin.version} and its manifest says ${manifest.version}`)
    continue
  }

  console.log(`  ok  ${entry} — ${source.sha.slice(0, 12)} serves the tree in HEAD (${document})`)
}

/**
 * Every entry, in both documents, on one commit. (catalogue #57, untilled/aumos#486)
 *
 * ⚠️ **A separate claim from the loop above, and it is the one that was silently
 * broken.** Each entry can pin a commit that serves its own tree while the two
 * documents disagree about *which* commit — every line prints ok and the
 * repository is still in the state #57 merged its entries to leave.
 *
 * ⛔ **With the source entries relative (#112 ①) this can no longer trip**, since
 * only `.claude-plugin/marketplace.json` contributes a sha and one document
 * cannot disagree with itself. It is left in place rather than deleted because
 * the entry it is written against is the *external* one — the first entry that
 * names another repository restores both the shape and this check's subject.
 */
const pinned = new Map()
for (const { entry: plugin, document } of plugins) {
  const sha = plugin?.source?.sha
  if (typeof sha !== 'string') continue
  if (!pinned.has(sha)) pinned.set(sha, [])
  pinned.get(sha).push(`${plugin.name} (${document})`)
}
if (pinned.size > 1) {
  failed += 1
  console.log('')
  console.log('FAIL  the two documents pin different commits')
  for (const [sha, names] of pinned) {
    console.log(`        ${sha.slice(0, 12)} — ${names.join(', ')}`)
  }
  console.log('        Repin every entry to the commit that carries the reviewed tree.')
}

if (failed > 0) {
  console.log('')
  console.log(
    `${failed} entry/entries are pinned away from the files beside them. What the catalogue serves is the pinned tree, not this one, and nothing else in this build reads it.`,
  )
  process.exit(1)
}
