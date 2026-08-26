/**
 * Lints every submitted data source. Run by CI on every pull request.
 *
 *   node --experimental-strip-types tools/lint-sources/main.ts [sources-directory]
 *
 * VENDORED — see VENDORED.md. Do not edit `coherence.ts`, `errors.ts` or
 * `hosts.ts` here.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// The 2020-12 dialect specifically, which is what `$schema` on our generated
// document says. ajv's default entry point is draft-07 and refuses it, which is
// a mismatch that shows up as "no schema with key or ref" rather than as
// anything about dialects.
import { Ajv2020 } from 'ajv/dist/2020.js'
import { assertUnderBrokerCeiling, type BrokerCeiling } from './broker-ceiling.ts'
import { assertCoherent } from './coherence.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(process.argv[2] ?? join(HERE, '../../sources'))

// `strict: false`: the schema is generated from zod and carries annotations ajv
// does not recognise. Refusing to *read* our own published schema would be the
// checker failing on the document it exists to apply.
const ajv = new Ajv2020({ strict: false, allErrors: true })
const validate = ajv.compile(
  JSON.parse(readFileSync(join(HERE, 'source-spec.schema.json'), 'utf8')) as object,
)

// Generated from Aumos's connector table and carried here, which is what lets
// this repository run the broker ceiling at all. (#486)
const CEILING = JSON.parse(
  readFileSync(join(HERE, 'broker-ceiling.json'), 'utf8'),
) as BrokerCeiling

const directories = (() => {
  try {
    return readdirSync(ROOT)
      .filter((name) => !name.startsWith('.'))
      .filter((name) => statSync(join(ROOT, name)).isDirectory())
      .sort()
  } catch {
    return []
  }
})()

if (directories.length === 0) {
  console.log('no data sources under ' + ROOT)
  process.exit(0)
}

let failed = 0

for (const name of directories) {
  const problems: string[] = []
  let document: unknown

  try {
    document = JSON.parse(readFileSync(join(ROOT, name, 'source.json'), 'utf8'))
  } catch (error) {
    problems.push('source.json could not be read: ' + String(error))
  }

  if (document !== undefined) {
    if (!validate(document)) {
      for (const issue of validate.errors ?? []) {
        problems.push('source' + (issue.instancePath || '') + ' ' + (issue.message ?? ''))
      }
    } else {
      // The schema passed, so every field this reads is present and of the
      // right shape. `port` and `query` carry defaults the schema does not
      // apply — it describes the document as authored — so they are filled in
      // here exactly as the parser fills them.
      const spec = document as {
        id?: unknown
        credentials?: unknown
        endpoints?: unknown
      }
      try {
        assertCoherent({
          ...(spec as object),
          credentials: Array.isArray(spec.credentials) ? spec.credentials : [],
          endpoints: Array.isArray(spec.endpoints) ? spec.endpoints : [],
        } as Parameters<typeof assertCoherent>[0])
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }

      // At a broker, a document **selects**; it does not declare. (#486)
      //
      // ⚠️ **This is the rule this linter could not run until #486**, and
      // `VENDORED.md` said so: it reads Aumos's connector table, so a
      // submission relaying a broker used to get a green tick here and a refusal
      // at install. The table is generated from that same code and carried in
      // `broker-ceiling.json` beside this file.
      try {
        assertUnderBrokerCeiling(
          {
            id: String(spec.id),
            endpoints: Array.isArray(spec.endpoints) ? (spec.endpoints as never) : [],
          },
          CEILING,
        )
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }

      // The one rule that is about this repository rather than about a
      // document. Two sources merge into one `sources.json`, and an id that
      // does not match the directory it arrived in makes that merge
      // unreviewable — the same reason the manager lint checks it.
      if (spec.id !== name) {
        problems.push(
          'the directory is sources/' + name + ' but the document says id ' + String(spec.id) +
            '. The directory name is the source id, so that a reviewer reading the tree is reading the catalogue.',
        )
      }
    }

    // A README is for a person, so nothing here judges what is in it — only
    // that a reader arriving from the catalogue has something to arrive at.
    try {
      readFileSync(join(ROOT, name, 'README.md'), 'utf8')
    } catch {
      problems.push(
        'README.md is missing. The catalogue links a person to it before they type a credential, and a source nobody can read about is one nobody should install.',
      )
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
  console.log(failed + ' source(s) did not pass. Every rule above is argued in tools/lint-sources/coherence.ts or in the schema beside it.')
  process.exit(1)
}
