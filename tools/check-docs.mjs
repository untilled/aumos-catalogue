/**
 * The drift guard on the translations.
 *
 *   node tools/check-docs.mjs
 *
 * ── Why a translated document gets a check and a vendored one gets a test ──
 *
 * `tools/lint/` is a copy and it is byte-compared over in the Aumos repository,
 * because a copy that can go stale needs a guard or a stated bound. A
 * translation is a copy too — of the *structure*, not of the bytes — and it goes
 * stale the same way: a section added to the English page and not to the Korean
 * one is a rule a Korean-reading contributor is never told about, and their pull
 * request is then refused for something the document they read did not mention.
 *
 * Byte comparison is obviously unavailable, so what is compared is the **shape**:
 * every document has the same number of headings at each level, in the same
 * order of levels. That catches the failure that actually happens — a section
 * added on one side — and it deliberately catches nothing about the prose,
 * because judging a translation is not something a script can do and pretending
 * otherwise would report a pass it did not establish.
 *
 * What it does **not** claim: that the Korean says what the English says. Only
 * that neither has a section the other lacks.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** English source → its translations. Adding a language is adding an entry. */
const TRANSLATED = [
  { source: 'README.md', translations: ['docs/readme/README.ko.md'] },
  { source: 'CONTRIBUTING.md', translations: ['docs/contributing/CONTRIBUTING.ko.md'] },
]

/**
 * Heading levels in order — `['#', '##', '##', '###', …]`.
 *
 * Fenced code blocks are stripped first: a `#` at the start of a line inside a
 * shell example is a comment, and counting it would make the guard fail on the
 * one thing a translation is most likely to copy verbatim and correctly.
 */
function shape(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((line) => /^(#{1,6})\s/.exec(line))
    .filter((match) => match !== null)
    .map((match) => match[1].length)
}

let failed = 0

for (const { source, translations } of TRANSLATED) {
  const expected = shape(readFileSync(join(ROOT, source), 'utf8'))

  for (const translation of translations) {
    let actual
    try {
      actual = shape(readFileSync(join(ROOT, translation), 'utf8'))
    } catch {
      failed += 1
      console.log(`FAIL  ${translation} is missing, and ${source} links to it`)
      continue
    }

    if (actual.join() === expected.join()) {
      console.log(`  ok  ${translation}`)
      continue
    }

    failed += 1
    console.log(`FAIL  ${translation} has a different section structure from ${source}`)
    console.log(`        ${source}: ${expected.length} headings — ${expected.join(' ')}`)
    console.log(`        ${translation}: ${actual.length} headings — ${actual.join(' ')}`)
  }
}

if (failed > 0) {
  console.log('')
  console.log(
    `${failed} document(s) drifted. A section on one side and not the other is a rule a contributor is never told about, and then refused for.`,
  )
  process.exit(1)
}
