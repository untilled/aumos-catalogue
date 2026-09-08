/**
 * ── The branch checklist's spine, rendered from the flow (#212 ⑦) ──────────
 *
 * The two sleeve skills carry a numbered checklist, and until this issue the
 * only thing behind it was a regular expression in the allocator verifier that
 * read *"which number is `catalystRegister`, which number is
 * `radarCandidates`"* off the markdown and compared the two. That pins wording,
 * numbering and order in a document and measures nothing that runs.
 *
 * `lib/flows.mjs` owns the spine now — which calls a flow makes, in what order,
 * which of them feeds which — and this file renders it into the checklist:
 * the **numbers and the order of the blocks**, and nothing else. The prose
 * inside a step is the author's and this generator copies it through
 * byte-for-byte, so rewriting a sentence cannot fail a check and moving a step
 * cannot pass one.
 *
 *   node tools/generate-evidence-gated-flow-steps.mjs --write
 *   node tools/generate-evidence-gated-flow-steps.mjs --check
 *
 * `--check` runs inside `tools/verify-evidence-gated-allocator.mjs`, so the
 * checklist cannot drift from the declaration the verifier executes.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { FLOWS, numberedSteps } from '../managers/evidence-gated/lib/flows.mjs'

const PACKAGE = new URL('../managers/evidence-gated/', import.meta.url)
const OPENS = 'Do these in order and report each one:'
const CLOSES = '\nAlso run the price-pattern'

/** The checklist, and only it: the list between the sentence that opens it and the paragraph after. */
function bounds(text, skill) {
  const opens = text.indexOf(OPENS)
  if (opens < 0) throw new Error(`${skill} no longer opens its checklist with «${OPENS}»`)
  const start = text.indexOf('\n\n', opens) + 2
  const end = text.indexOf(CLOSES, start)
  if (end < 0) throw new Error(`${skill}'s checklist runs to the end of the file; it is expected to be followed by the price-pattern paragraph`)
  return [start, end]
}

/** The numbered blocks of a checklist, marker line and continuation lines together. */
function blocksOf(section, skill) {
  const blocks = []
  for (const line of section.split('\n')) {
    if (/^\d+\. /.test(line)) blocks.push([line])
    else if (blocks.length > 0) blocks.at(-1).push(line)
    else if (line.trim() !== '') throw new Error(`${skill}'s checklist opens with prose rather than a numbered step: ${line}`)
  }
  return blocks.map((lines) => lines.join('\n'))
}

/**
 * Which declared step a block is. ⚠️ Identity is the step's **primary call**
 * appearing on the block's marker line — a name in `lib/flows.mjs`, never a
 * phrase — and it has to be unambiguous: two blocks claiming one step, or a
 * step no block claims, throws here rather than renumbering something into the
 * wrong place.
 */
function claim(blocks, steps, skill) {
  const taken = new Map()
  for (const step of steps) {
    const marker = blocks.filter((block) => block.split('\n')[0].includes(step.call))
    if (marker.length !== 1) throw new Error(`${skill}: ${marker.length} checklist steps name \`${step.call}\` on their first line; exactly one is expected`)
    if (taken.has(marker[0])) throw new Error(`${skill}: one checklist step is claimed by both \`${taken.get(marker[0])}\` and \`${step.call}\``)
    taken.set(marker[0], step.call)
  }
  const unclaimed = blocks.filter((block) => !taken.has(block))
  if (unclaimed.length > 0) throw new Error(`${skill}: ${unclaimed.length} checklist step(s) name no call declared in lib/flows.mjs — the first is: ${unclaimed[0].split('\n')[0]}`)
  return (call) => blocks.find((block) => taken.get(block) === call)
}

/**
 * ⚠️ `steps` is a parameter so the verifier can render from a mutated copy and
 * prove this check is not vacuous: two steps swapped in the declaration have to
 * move the file, or the comparison is asserting nothing.
 */
export function renderFlowSteps(section, steps, skill = 'the checklist') {
  const blocks = blocksOf(section, skill)
  const blockFor = claim(blocks, steps, skill)
  /** ⛔ No trailing newline is added: the blank line before the paragraph after is the last block's own. */
  return steps.map((step) => blockFor(step.call).replace(/^\d+\. /, `${step.n}. `)).join('\n')
}

export async function checkFlowSteps(flows = FLOWS) {
  for (const [flow, row] of Object.entries(flows)) {
    const text = await readFile(new URL(row.skill, PACKAGE), 'utf8')
    const [start, end] = bounds(text, row.skill)
    const found = text.slice(start, end)
    const expected = renderFlowSteps(found, numberedSteps(flow), row.skill)
    if (found === expected) continue
    const a = found.split('\n')
    const b = expected.split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] === b[i]) continue
      return `${row.skill} line ${i + 1} of the branch checklist differs from lib/flows.mjs\n  in the skill: ${a[i] ?? '(no line)'}\n  in the flow:  ${b[i] ?? '(no line)'}\nRun: node tools/generate-evidence-gated-flow-steps.mjs --write`
    }
    return `${row.skill}'s branch checklist differs from lib/flows.mjs`
  }
  return null
}

if (process.argv.includes('--write')) {
  for (const [flow, row] of Object.entries(FLOWS)) {
    const text = await readFile(new URL(row.skill, PACKAGE), 'utf8')
    const [start, end] = bounds(text, row.skill)
    const rendered = renderFlowSteps(text.slice(start, end), numberedSteps(flow), row.skill)
    await writeFile(new URL(row.skill, PACKAGE), text.slice(0, start) + rendered + text.slice(end))
    console.log(`wrote ${row.skill}: ${FLOWS[flow].steps.length} numbered steps`)
  }
} else if (process.argv.includes('--check')) {
  const problem = await checkFlowSteps()
  if (problem) {
    console.error(problem)
    process.exit(1)
  }
  console.log(`both sleeve checklists match lib/flows.mjs (${FLOWS['kr-sleeve'].steps.length} steps each)`)
}
