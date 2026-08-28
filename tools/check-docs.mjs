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
 *
 * ── The second check: the shape the documents describe (#45) ───────────────
 *
 * The translations were guarded and the *content* was not, and the content went
 * wrong in the way that costs a contributor their first pull request: all four
 * documents drew a tree with `manifest.json` and a numbered `prompt/` directory
 * long after `prompt-bundle` was retired (#286) and the constants became
 * `aumos.json` and `PROMPT.md`. A package built to that description fails
 * `manifest-present` and `prompt-present` at once — refused for reading our own
 * documentation. Ten open issues had already copied the tree.
 *
 * So the filenames the lint actually keys on are read **out of `rules.ts`** and
 * required to appear in every document. Reading them rather than repeating them
 * is the whole point: a constant that moves in the lint moves this check with
 * it, and the document that still names the old file is the one that fails.
 *
 * ⚠️ **It reads the fenced blocks and not the prose, and the first draft did
 * not.** Requiring the string anywhere in the document passed a README whose
 * tree had been reverted to `manifest.json`, because the ⚠️ note *correcting*
 * that tree names both files — the guard was measuring its own correction. It
 * was caught by planting the regression and watching it go green, which is the
 * only way that class of mistake is ever caught.
 *
 * So the tree is what is checked: inside a fenced block, the manifest must be
 * named and the retired filename must not be. Prose is left alone in both
 * directions — this repository's convention is to keep a withdrawn claim
 * visible with a ⚠️ note beside it, and a rule that forbade the old string
 * outright would forbid the correction.
 *
 * ── The third check: the shape a manager README has (#85) ─────────────────
 *
 * A ManagerPackage's README is the page an investor chooses from, and eight of
 * them were written by whoever wrote the package. They answered the same three
 * questions — what methodology is this, how does a run actually go, what does
 * it need — under eight different headings, in eight different orders, and two
 * of them did not answer the second one at all. Nothing was wrong with any one
 * page; what was missing was the property that makes a *catalogue* readable,
 * which is that the same question is in the same place on every page.
 *
 * So the section list is fixed and checked here rather than argued in review.
 * The flow diagram is checked as a fenced `mermaid` block for the same reason:
 * it was the section every page was missing, so it is the one most likely to be
 * quietly dropped by the next author in a hurry.
 *
 * What this does **not** claim: that the prose under a heading is any good.
 * Only that a reader comparing two managers finds both answers in the same
 * place, and that neither page has silently lost its flow.
 *
 * ⚠️ **The translation guard is generalised rather than listed.** Every `X.md`
 * in a submitted directory — `managers/` or `sources/` — with an `X.ko.md`
 * beside it is a pair, found by reading the directory. Listing them was the
 * version of this that goes stale: a submission that adds a document and its
 * translation would be guarded only if somebody remembered to come back here,
 * and nobody does.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** English source → its translations. Adding a language is adding an entry. */
const TRANSLATED = [
  { source: 'README.md', translations: ['docs/readme/README.ko.md'] },
  { source: 'CONTRIBUTING.md', translations: ['docs/contributing/CONTRIBUTING.ko.md'] },
  ...packageTranslationPairs(),
]

/** Every submitted directory under `root`, in catalogue order. */
function submissions(root) {
  return readdirSync(join(ROOT, root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${root}/${entry.name}`)
    .sort()
}

/** Every `managers/<id>/` directory. The README skeleton is a package rule. */
function packageDirectories() {
  return submissions('managers')
}

/**
 * Where a translated document can live. Both kinds of submission carry a README
 * a person reads, and both may carry it twice — a source's `caveat` is
 * translated in `translations/ko.json` exactly as a package's summary is.
 */
function translatedDirectories() {
  return [...submissions('managers'), ...submissions('sources')]
}

/**
 * `X.md` beside `X.ko.md`, found rather than listed.
 *
 * The locale sits before the extension (`README.ko.md`), which is the shape
 * `CONTRIBUTING.md` requires of a translated README, so a document whose middle
 * segment is a locale is a translation and its English original is the same
 * name without it.
 */
function packageTranslationPairs() {
  const pairs = []
  for (const directory of translatedDirectories()) {
    const files = readdirSync(join(ROOT, directory))
    for (const file of files.sort()) {
      const match = /^(.+)\.[a-z]{2}(-[A-Za-z0-9]+)?\.md$/.exec(file)
      if (match === null) continue
      const original = `${match[1]}.md`
      if (!files.includes(original)) continue
      pairs.push({ source: `${directory}/${original}`, translations: [`${directory}/${file}`] })
    }
  }
  return pairs
}

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

/**
 * The lint's own filename constants, read from the file that owns them.
 *
 * `rules.ts` is TypeScript and this script runs on plain `node`, so it is read
 * as text rather than imported — `npm run check:docs` would otherwise need the
 * `--experimental-strip-types` flag that only `npm run lint` carries. A regex
 * over an `export const` line is enough because the shape of that line is
 * asserted by the lint's own tests, and a rename that changed the shape would
 * fail loudly here rather than silently pass.
 */
function lintConstants() {
  const source = readFileSync(join(ROOT, 'tools/lint/rules.ts'), 'utf8')
  const names = ['MANIFEST_FILENAME', 'DEFAULT_PROMPT_PATH']
  return names.map((name) => {
    const match = new RegExp(`export const ${name} = '([^']+)'`).exec(source)
    if (match === null) {
      throw new Error(
        `tools/lint/rules.ts no longer exports ${name} as a string literal — ` +
          'this guard reads it as text and cannot follow a change of shape',
      )
    }
    return { name, value: match[1] }
  })
}

const CONSTANTS = lintConstants()
const DESCRIBES_THE_SHAPE = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/readme/README.ko.md',
  'docs/contributing/CONTRIBUTING.ko.md',
]

/** Every fenced block in a document, joined — where a tree example lives. */
function fences(markdown) {
  return (markdown.match(/```[\s\S]*?```/g) ?? []).join('\n')
}

/** Filenames the lint no longer opens. A tree that still draws one is the defect. */
const RETIRED_IN_A_TREE = ['manifest.json']

for (const document of DESCRIBES_THE_SHAPE) {
  const drawn = fences(readFileSync(join(ROOT, document), 'utf8'))
  const missing = CONSTANTS.filter(({ value }) => !drawn.includes(value))
  const retired = RETIRED_IN_A_TREE.filter((value) => drawn.includes(value))

  if (missing.length === 0 && retired.length === 0) {
    console.log(`  ok  ${document} draws ${CONSTANTS.map((c) => c.value).join(' and ')}`)
    continue
  }

  failed += 1
  for (const { name, value } of missing) {
    console.log(`FAIL  ${document} has no fenced block naming ${value} (rules.ts → ${name})`)
  }
  for (const value of retired) {
    console.log(
      `FAIL  ${document} draws ${value} in a fenced block, and the lint opens ` +
        `${CONSTANTS[0].value}. Correcting it in prose is not enough — the tree is what gets copied`,
    )
  }
}

/**
 * The section list every ManagerPackage README carries, in this order.
 *
 * Six headings, one per question an investor asks before installing something
 * that will judge their money. The order is the point as much as the set is:
 * two managers compared side by side have to answer the same question in the
 * same place, or the catalogue is eight essays rather than a catalogue.
 *
 * Adding a language is adding an entry, and its headings are that language's
 * — the *shape* guard above already holds the translation to the same skeleton,
 * so a Korean page cannot answer five of the six.
 */
const README_SECTIONS = {
  'README.md': [
    'In one paragraph',
    'The methodology',
    'How a run works',
    'What it needs',
    'What it is bad at',
    'Notes',
  ],
  'README.ko.md': ['한 문단 요약', '방법론', '실행 흐름', '필요한 것', '약한 지점', '덧붙임'],
}

/** Top-level (`##`) headings in order, outside fenced blocks. */
function sections(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((line) => /^##\s+(.+?)\s*$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => match[1])
}

for (const directory of packageDirectories()) {
  for (const [file, expected] of Object.entries(README_SECTIONS)) {
    const path = `${directory}/${file}`
    let markdown
    try {
      markdown = readFileSync(join(ROOT, path), 'utf8')
    } catch {
      // A package is not required to carry every translation; the pair guard
      // above is what refuses a half-shipped one.
      if (file !== 'README.md') continue
      failed += 1
      console.log(`FAIL  ${path} is missing, and every package needs the page a person reads`)
      continue
    }

    const actual = sections(markdown)
    const problems = []
    if (actual.join('\u0000') !== expected.join('\u0000')) {
      problems.push(`sections are ${actual.join(' · ') || '(none)'}`)
    }
    if (!/```mermaid/.test(markdown)) {
      problems.push('no fenced mermaid block — the run has to be drawn, not only described')
    }

    if (problems.length === 0) {
      console.log(`  ok  ${path} answers the six in order, and draws its flow`)
      continue
    }

    failed += 1
    console.log(`FAIL  ${path}`)
    for (const problem of problems) console.log(`        ${problem}`)
    console.log(`        expected: ${expected.join(' · ')}`)
  }
}

/**
 * The retired tree, in a package's own documents.
 *
 * The four documents above are required to *draw* the current filenames because
 * describing the package shape is their job. A package's own pages are not, and
 * most now draw no tree at all — so only the negative half applies here: a
 * fenced block may not name the file the lint no longer opens.
 */
for (const directory of packageDirectories()) {
  for (const file of readdirSync(join(ROOT, directory))) {
    if (!file.endsWith('.md')) continue
    const path = `${directory}/${file}`
    const retired = RETIRED_IN_A_TREE.filter((value) => fences(readFileSync(join(ROOT, path), 'utf8')).includes(value))
    if (retired.length === 0) continue
    failed += 1
    for (const value of retired) {
      console.log(`FAIL  ${path} draws ${value} in a fenced block, and the lint opens ${CONSTANTS[0].value}`)
    }
  }
}

if (failed > 0) {
  console.log('')
  console.log(
    `${failed} document(s) drifted. A section on one side and not the other is a rule a contributor is never told about, and then refused for — and a document that does not name the file the lint opens describes a package that cannot be submitted.`,
  )
  process.exit(1)
}
