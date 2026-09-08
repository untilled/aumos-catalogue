/**
 * ── The skill's operation table, rendered from the one definition (#212 ③) ──
 *
 * `skills/deterministic-metrics/SKILL.md` carried a hand-written table of every
 * operation and what it decides. It was the fourth place the same fact was
 * written, and the only check on it compared **names** — so a row could name a
 * real operation and describe a different one, and a new operation could be
 * registered, contracted, validated and still undocumented until someone
 * noticed the count.
 *
 * The section between `## The operations` and the heading after it is generated
 * from `lib/operations.mjs` now. `--check` is run by
 * `tools/verify-evidence-gated-allocator.mjs`, so the file cannot drift from
 * the definition by one character; `--write` is how an author updates it after
 * changing a `describe`, a `group` or a `surface`.
 *
 *   node tools/generate-evidence-gated-operations.mjs --write
 *   node tools/generate-evidence-gated-operations.mjs --check
 *
 * ⛔ It renders the **published** operations. The internal ones are steps of
 * those (`surface: 'internal'`, with `subsumedBy` naming what returns their
 * answer): naming them here is what made a menu of 107 entries out of a
 * surface of 99, and the whole point of the split is that a run composing a
 * call is not shown a calculation this package already assembles.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { OPERATIONS, GROUPS, PUBLISHED_OPERATIONS, INTERNAL_OPERATIONS } from '../managers/evidence-gated/lib/operations.mjs'

const SKILL = new URL('../managers/evidence-gated/skills/deterministic-metrics/SKILL.md', import.meta.url)
const HEADING = '## The operations'

/** The heading the generated section ends at — the next `## ` in the file. */
function bounds(text) {
  const start = text.indexOf(HEADING)
  if (start < 0) throw new Error(`${HEADING} is not in the skill`)
  const next = text.indexOf('\n## ', start + HEADING.length)
  if (next < 0) throw new Error('the operations section runs to the end of the file; it is expected to be followed by another `## ` heading')
  return [start, next + 1]
}

/**
 * ⚠️ The table and the groups are **parameters** so the verifier can render
 * from a mutated copy and prove this check is not vacuous: a `describe` changed
 * in the definition has to move the line the skill carries, or the check that
 * compares them is asserting nothing.
 */
export function renderOperations(operations = OPERATIONS, groups = GROUPS) {
  const names = Object.entries(operations).filter(([, row]) => row.surface === 'published').map(([name]) => name)
  const internal = Object.entries(operations).filter(([, row]) => row.surface === 'internal').map(([name]) => name)
  const lines = [HEADING, '']
  lines.push(
    `All ${names.length}, by name. An \`operation_unknown\` diagnostic also lists them, but discovering an API by`,
    'calling it wrong is not a discovery path — every flow skill tells you not to go looking, so the',
    'names have to be here. A name absent from this table is a name you cannot call.',
    '',
    `⚠️ **${internal.length} further operations are steps of the ones below and are deliberately not listed.**`,
    'Each is already computed inside a table entry, so calling one directly re-assembles by hand an',
    'answer a single call returns whole. They still run, and `operation_unknown` names what returns',
    'each of their answers instead — so a call that reaches for one is redirected, never refused for',
    'a name that does not exist.',
    '',
  )
  for (const group of groups) {
    const rows = names.filter((name) => operations[name].group === group.id)
    if (rows.length === 0) continue
    lines.push(`### ${group.heading}`, '')
    if (group.note) lines.push(group.note, '')
    lines.push('| operation | what it decides |', '|---|---|')
    for (const name of rows) lines.push(`| \`${name}\` | ${operations[name].describe} |`)
    lines.push('')
  }
  lines.push(
    'A `check` in `tools/verify-evidence-gated-allocator.mjs` regenerates this section from',
    '`lib/operations.mjs` and fails on any difference, so the table cannot describe one operation',
    'under another\'s name and a new operation is unusable until its definition row carries a',
    '`describe`.',
    '',
  )
  return lines.join('\n')
}

export async function checkOperations() {
  const text = await readFile(SKILL, 'utf8')
  const [start, end] = bounds(text)
  const found = text.slice(start, end)
  const expected = renderOperations()
  if (found === expected) return null
  const a = found.split('\n')
  const b = expected.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue
    return `skills/deterministic-metrics/SKILL.md line ${i + 1} of the operations section differs from lib/operations.mjs\n  in the skill:  ${a[i] ?? '(no line)'}\n  in the table:  ${b[i] ?? '(no line)'}\nRun: node tools/generate-evidence-gated-operations.mjs --write`
  }
  return 'the operations section differs from lib/operations.mjs'
}

if (process.argv.includes('--write')) {
  const text = await readFile(SKILL, 'utf8')
  const [start, end] = bounds(text)
  await writeFile(SKILL, text.slice(0, start) + renderOperations() + text.slice(end))
  console.log(`wrote the operations section: ${PUBLISHED_OPERATIONS.length} published, ${INTERNAL_OPERATIONS.length} internal`)
} else if (process.argv.includes('--check')) {
  const problem = await checkOperations()
  if (problem) {
    console.error(problem)
    process.exit(1)
  }
  console.log(`the operations section matches lib/operations.mjs (${PUBLISHED_OPERATIONS.length} published)`)
}
