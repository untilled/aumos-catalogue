/**
 * A package directory, read as the map its published bundle is. (#183)
 *
 * Moved here from `apps/web/registry/generate.ts`, where it was `collectFiles`
 * and was the publisher's private business. It stops being private the moment a
 * package can arrive from somebody else: *"an AgentPackage is text"* is the load
 * -bearing claim of the whole distribution format (`@aumos/registry`'s
 * `bundle.ts` — a JSON string is not a binary, so there is no field an
 * executable could live in), and a claim that is only checked at publish time is
 * one a contributor discovers after review rather than in their own CI.
 *
 * `node:fs` is the only import, and it is the only file in this package that has
 * one — `rules.ts` is pure so it can be copied into a repository that has none
 * of this. This file is copied too; `node:fs` is everywhere Node is.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { PackageFiles } from './rules.ts'

/**
 * Directories a tool made and a tool maintains, skipped at every depth.
 *
 * The rule everywhere else in this file is *take the directory whole* — a
 * publisher that chose a subset would be editing somebody's package on the way
 * past — and this is the one exception, so the criterion is narrow and stated
 * here rather than grown case by case: **the contents are recreated by a tool
 * without being asked, and they are about the package rather than part of it.**
 * Both members qualify and nothing else has yet:
 *
 * - `.git` is version control's own store, and version-controlling an authored
 *   package is an ordinary thing to do. Reading it as package content is worse
 *   than awkward: `.git/index` is not UTF-8, so the lint refuses the package
 *   with a message about a file the author never wrote — and the *fingerprint*
 *   half is worse still, because `readShippedFiles` would hash `.git/**` and
 *   §24's row identity would then change on every commit. That is the exact
 *   inversion of what a fingerprint is for: the same system, a different hash,
 *   every time.
 * - `__pycache__` is compiled bytecode of `.py` files that are already in the
 *   package. Binary, so it breaks the read the same way, and derived, so
 *   hashing it adds nothing the source files do not already say. One appeared
 *   the first time the ported harness was run (#219
 *   ③).
 *
 * A `.DS_Store` fails the same read and is deliberately **not** here: it is a
 * file rather than a directory, and — unlike these two — deleting it is a repair
 * that holds. The refusal names it, which is what lets its author act.
 *
 * Skipping is by name at any depth, because `__pycache__` sits beside every
 * `.py` and a submodule puts a `.git` below the root.
 */
export const TOOL_DIRECTORIES: readonly string[] = ['.git', '__pycache__']

/**
 * Every file in the directory, as text, keyed by its path relative to the root.
 *
 * Everything is taken rather than a chosen subset. What a package *is* is the
 * directory its author put together — `harness.json` records what a port left
 * behind, `conformance-report.md` records a verdict and the wrong first attempt
 * that produced it — and a publisher that decided which of those an investor
 * gets would be editing somebody's package on the way past.
 *
 * A file that is not UTF-8 text stops the read **here**, loudly. The format
 * cannot express a binary — that is its whole argument — so a package that
 * contains one is a package that cannot be published, and saying so at the file
 * rather than at an install screen is what lets the person holding it act.
 */
export function readPackageFiles(directory: string): PackageFiles {
  const files: Record<string, string> = {}

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (TOOL_DIRECTORIES.includes(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(
          `${relative(directory, full)} is not a regular file. An agent package is text; a symlink or a device node has no published form.`,
        )
      }
      const bytes = readFileSync(full)
      const text = bytes.toString('utf8')
      if (Buffer.compare(Buffer.from(text, 'utf8'), bytes) !== 0) {
        throw new Error(
          `${relative(directory, full)} is not UTF-8 text, and the published bundle format cannot carry it. That is deliberate — see packages/registry/src/bundle.ts.`,
        )
      }
      files[relative(directory, full).split('\\').join('/')] = text
    }
  }

  walk(directory)
  return files
}

/**
 * The directories under a root that are AgentPackages.
 *
 * A submissions repository is a directory of them and the generator has to
 * enumerate it without being told what is there — which is the difference
 * between a catalogue and `PUBLISHED`, the hand-kept list of what we ourselves
 * offer. `manifest.json` is the marker, so a README, a licence and a workflow
 * beside the packages are not mistaken for one.
 */
export function findPackageDirectories(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .filter((name) => {
      try {
        return readdirSync(join(root, name)).includes('manifest.json')
      } catch {
        return false
      }
    })
}
