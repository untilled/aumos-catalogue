/**
 * ── The branch checklist, as a definition rather than a paragraph (#212 ⑦) ──
 *
 * `skills/kr-sleeve/SKILL.md` and `skills/us-sleeve/SKILL.md` each carry a
 * numbered checklist — *"Do these in order and report each one"* — and the only
 * thing standing behind it was a regular expression in
 * `tools/verify-evidence-gated-allocator.mjs` that read the numbers off the
 * markdown and compared two of them:
 *
 *     const step  = text.match(<a regex for a bold `catalystRegister` marker>)
 *     const radar = text.match(<a regex for a bold `radarCandidates` marker>)
 *     assert.ok(Number(step[1]) < Number(radar[1]))
 *
 * That pins **wording, numbering and order in a document** and measures no
 * behaviour at all: rewrite the bold marker and it fails while the run is
 * unchanged, and move the wiring in the code while leaving the sentence alone
 * and it passes while the run is broken. #146 was the opposite defect — a step
 * that existed only in prose — so the fix is not to delete the guard but to
 * move its subject: the order and the input passing are declared here, the
 * verifier **executes** the declaration, and the checklist's numbering is
 * rendered from it by `tools/generate-evidence-gated-flow-steps.mjs`.
 *
 * ⛔ The prose inside each step is still the author's. What this file owns is
 * the spine: which calls a flow makes, in what order, and which of them hands
 * its answer to which. A sentence rewritten leaves every check here green; a
 * step reordered, dropped, or unwired does not.
 *
 * ⚠️ `calls` are **names in this package**, not markdown. `kind: 'tool'` marks
 * the ones the host serves rather than `execute()` — they are steps of the run
 * loop all the same, which is exactly what #146 measured.
 */

/** A consumer's input field, and the earlier step whose answer fills it. */
const feed = (from, pick, as = pick) => ({ from, pick, as })

/** ⚠️ The universe/registry/mapping head of the two sleeves differs by vendor only. */
const head = (market) =>
  market === 'kr'
    ? [
        { calls: ['researchUniverse'], kind: 'operation' },
        { calls: ['source_request', 'parseDartCorpCodes'], kind: 'tool' },
        { calls: ['mapCorporationCodes'], kind: 'operation' },
        { calls: ['fundamentalsPlan'], kind: 'operation' },
        { calls: ['dartVendorStatus'], kind: 'operation' },
      ]
    : [
        { calls: ['researchUniverse'], kind: 'operation' },
        { calls: ['source_request'], kind: 'tool' },
        { calls: ['mapCorporationCodes'], kind: 'operation' },
        { calls: ['fundamentalsPlan'], kind: 'operation' },
        { calls: ['normalizeSecFacts'], kind: 'operation' },
      ]

/**
 * The tail is identical in both sleeves, and that is the point: the wiring
 * `catalystRegister → radarCandidates` is one fact, so it is written once.
 */
const tail = [
  {
    calls: ['catalystRegister'],
    kind: 'operation',
    /** The bounded revision this step's `nextState` is carried in. */
    carriedIn: 'research/catalyst-window',
  },
  {
    calls: ['radarCandidates'],
    kind: 'operation',
    feeds: [feed('catalystRegister', 'catalysts'), feed('catalystRegister', 'events')],
  },
  { calls: ['radarFeedDiagnosis'], kind: 'operation', feeds: [feed('radarCandidates', 'candidates')] },
  {
    calls: ['upsideRadar'],
    kind: 'operation',
    feeds: [feed('radarCandidates', 'candidates'), feed('radarFeedDiagnosis', '*', 'feed')],
  },
  { calls: ['thesisGapSources', 'thesisValuation'], kind: 'operation' },
  { calls: ['observation_file'], kind: 'tool' },
  { calls: ['observationLedger'], kind: 'operation' },
]

export const FLOWS = {
  'kr-sleeve': { skill: 'skills/kr-sleeve/SKILL.md', steps: [...head('kr'), ...tail] },
  'us-sleeve': { skill: 'skills/us-sleeve/SKILL.md', steps: [...head('us'), ...tail] },
}

/** The step numbers a flow publishes, 1-based, which is what the checklist prints. */
export function numberedSteps(flow) {
  return FLOWS[flow].steps.map((step, index) => ({ ...step, n: index + 1, call: step.calls[0] }))
}

/** The step that makes this call, or `undefined`. ⚠️ By primary call only. */
export function stepOf(flow, call) {
  return numberedSteps(flow).find((step) => step.call === call)
}

/**
 * Every way a declared wiring can be unrunnable, named. ⛔ It returns faults
 * rather than throwing so the verifier can assert emptiness **and** mutate a
 * copy to prove the assertion is not vacuous.
 */
export function wiringFaults(flow) {
  const steps = numberedSteps(flow)
  const faults = []
  for (const step of steps) {
    for (const row of step.feeds ?? []) {
      const producer = steps.find((other) => other.call === row.from)
      if (!producer) {
        faults.push({ step: step.call, from: row.from, reason: 'unknown-producer' })
        continue
      }
      if (producer.n >= step.n) faults.push({ step: step.call, from: row.from, reason: 'consumer-precedes-producer' })
    }
  }
  return faults
}

/**
 * The input a step is actually called with: its own arguments, plus every
 * declared feed taken from what an earlier step returned.
 *
 * ⚠️ `produced` is keyed by call name and holds the `data` object each step
 * answered with. A feed whose producer is not in it is **reported**, not
 * silently skipped — an unfed axis reported as a fact about the company is the
 * whole of #169, and a runner that quietly drops a wire reproduces it.
 */
export function applyFeeds(flow, call, base, produced) {
  const step = stepOf(flow, call)
  if (!step) throw new Error(`${call} is not a step of ${flow}`)
  const input = { ...base }
  const applied = []
  const unfed = []
  for (const row of step.feeds ?? []) {
    const answer = produced[row.from]
    if (answer === undefined) {
      unfed.push(row.as)
      continue
    }
    input[row.as] = row.pick === '*' ? answer : answer[row.pick]
    applied.push(row.as)
  }
  return { input, applied, unfed }
}
