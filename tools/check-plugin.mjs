/**
 * The plugin manifest says the same thing as the package manifest. (#103)
 *
 *   node tools/check-plugin.mjs
 *
 * ── What lint already does, and where it stops ─────────────────────────────
 *
 * `tools/lint/rules.ts` has one rule about this file and it is `runtime-files-
 * are-present`: a package whose `runtimes` lists `claude` must ship
 * `.claude-plugin/plugin.json`, because `--plugin-dir` on a directory without
 * one starts a session with none of the package's own material in it. That rule
 * checks **existence and nothing else**, deliberately — the vendored lint is a
 * copy of Aumos's own, and Aumos does not read the inside of this file either.
 *
 * The gap that leaves is not hypothetical. When this check was written, **eight
 * of nine published packages** carried a `version` in `plugin.json` that did not
 * match the version in `aumos.json` — `evidence-gated` said `0.1.0` against a
 * manifest at `0.4.0`, and its `description` was a sentence the package had
 * stopped using. Nothing had gone wrong at merge; there was simply nothing that
 * would say so.
 *
 * ── Why it matters that they agree ────────────────────────────────────────
 *
 * Two readers, one package. Aumos reads `aumos.json` and publishes what it finds
 * — the catalogue page, the registry entry, the version an investor installs.
 * The **CLI** reads `plugin.json` when Aumos hands it the directory, and what it
 * shows a person is what is written there.
 *
 * So a drifted `version` is not a tidiness problem: it is the same package
 * reporting two versions to two surfaces, and the one the investor sees while
 * the session runs is the one nothing was checking. A drifted `description` is
 * the same failure wearing prose.
 *
 * ⛔ **This is not a claim that the two files should be one file.** They are
 * different formats owned by different projects, and `plugin.json` may carry
 * keys of its own that have no manifest counterpart. What is checked is the
 * three fields that exist in both and mean the same thing in both.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** The fields that exist in both documents and must not disagree. */
const SHARED = ['name', 'version', 'description']

function read(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (error) {
    return { ok: false, problem: error instanceof Error ? error.message : String(error) }
  }
}

const problems = []
let checked = 0

for (const id of readdirSync('managers').sort()) {
  const dir = join('managers', id)
  const manifestPath = join(dir, 'aumos.json')
  if (!existsSync(manifestPath)) continue

  const manifest = read(manifestPath)
  if (!manifest.ok) {
    problems.push(`${manifestPath} is not JSON: ${manifest.problem}`)
    continue
  }

  // `runtimes` defaults to both loaders when a manifest omits it.
  const runtimes = manifest.value.runtimes ?? ['claude', 'codex']
  if (!runtimes.includes('claude')) continue

  const pluginPath = join(dir, '.claude-plugin', 'plugin.json')
  if (!existsSync(pluginPath)) {
    // `runtime-files-are-present` in the vendored lint already says this, and
    // says it better. Do not report it twice with two spellings.
    continue
  }

  const plugin = read(pluginPath)
  if (!plugin.ok) {
    problems.push(`${pluginPath} is not JSON: ${plugin.problem}`)
    continue
  }

  checked += 1
  for (const field of SHARED) {
    const want = field === 'name' ? manifest.value.id : manifest.value[field]
    const got = plugin.value[field]
    if (want === undefined && got === undefined) continue
    if (got === want) continue
    problems.push(
      `${id}: ${pluginPath} says ${field} ${JSON.stringify(got)}, and ${manifestPath} says ` +
        `${JSON.stringify(want)}. The CLI reads the first and the catalogue publishes the ` +
        `second, so this is one package reporting two answers to two surfaces.`,
    )
  }
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} plugin manifest problem(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    `\nThe vendored lint checks that .claude-plugin/plugin.json exists; this checks that it ` +
      `agrees with aumos.json. tools/check-plugin.mjs argues why the two must.`,
  )
  process.exit(1)
}

console.log(`✓ ${checked} plugin manifest(s) agree with their package manifest (${SHARED.join(', ')})`)
