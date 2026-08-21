/**
 * Lints every submitted AgentPackage. Run by CI on every pull request.
 *
 *   node --experimental-strip-types tools/lint/main.ts [agents-directory]
 *
 * VENDORED — see VENDORED.md. Do not edit `rules.ts` or `read.ts` here.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// The 2020-12 dialect specifically, which is what `$schema` on our generated
// documents says. ajv's default entry point is draft-07 and refuses them, which
// is a mismatch that shows up as "no schema with key or ref" rather than as
// anything about dialects.
import { Ajv2020 } from 'ajv/dist/2020.js'
// `format: "uri"` is in our generated schema and ajv does not implement formats
// itself. Without this it prints "unknown format ignored" and silently stops
// checking `homepage` and `provenance.sourceRepo` — a check that announces it
// is not running is still a check that is not running.
import addFormats from 'ajv-formats'
import { findPackageDirectories, readPackageFiles } from './read.ts'
import { lintAgentPackage } from './rules.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(process.argv[2] ?? join(HERE, '../../agents'))

const schema = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(HERE, name), 'utf8')) as Record<string, unknown>

const manifestSchema = schema('agent-package-manifest.schema.json')

// `strict: false`: the schemas are generated from zod and carry annotations ajv
// does not recognise. Refusing to *read* our own published schema would be the
// checker failing on the document it exists to apply.
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const validateManifest = ajv.compile(manifestSchema)

let failed = 0
const packages = findPackageDirectories(ROOT)

if (packages.length === 0) {
  console.log('no packages under ' + ROOT)
  process.exit(0)
}

for (const name of packages) {
  const problems: string[] = []
  let files: Record<string, string> = {}

  try {
    files = { ...readPackageFiles(join(ROOT, name)) }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }

  const manifestText = files['manifest.json']
  if (manifestText !== undefined) {
    let manifest: unknown
    try {
      manifest = JSON.parse(manifestText)
    } catch (error) {
      problems.push('manifest.json is not JSON: ' + String(error))
    }

    if (manifest !== undefined) {
      if (!validateManifest(manifest)) {
        for (const issue of validateManifest.errors ?? []) {
          problems.push('manifest' + (issue.instancePath || '') + ' ' + (issue.message ?? ''))
        }
      }
      // The one rule that is about this repository rather than about a package.
      // Two sources merge into one `registry.json`, and an id that does not
      // match the directory it arrived in makes that merge unreviewable.
      const id = (manifest as { id?: unknown }).id
      if (id !== name) {
        problems.push(
          'the directory is agents/' + name + ' but the manifest says id ' + String(id) +
            '. The directory name is the package id, so that a reviewer reading the tree is reading the catalogue.',
        )
      }
    }

    for (const problem of lintAgentPackage(files)) {
      problems.push(problem.rule + ': ' + problem.message)
    }
  }

  if (problems.length === 0) {
    console.log('  ok  ' + name)
    continue
  }
  failed += 1
  console.log('FAIL  ' + name)
  for (const problem of problems) console.log('        ' + problem)
}

if (failed > 0) {
  console.log('')
  console.log(failed + ' package(s) did not pass. Every rule above is argued in tools/lint/rules.ts.')
  process.exit(1)
}
