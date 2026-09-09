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
 * the ones something other than `execute()` serves — they are steps of the run
 * loop all the same, which is exactly what #146 measured. ⚠️ **And two of
 * them are not the host's**: `WebSearch`/`WebFetch` are the CLI's, so that step
 * exists only in a session whose prompt named them, and a session that was not
 * given them reports the absence rather than routing around it (#229).
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
  /**
   * ⚠️ **The stage that fills the axis, and it is a step for the reason #146
   * is** (#228). `catalystRegister` was built with no automatic producer for
   * its input, so «research the window for every roster name» was a sentence in
   * a checklist and the axis stayed empty run after run. A derivation that is
   * not a numbered step of the flow is the same defect one level down.
   */
  { calls: ['catalystCadence'], kind: 'operation' },
  {
    calls: ['catalystRegister'],
    kind: 'operation',
    /** ⛔ `estimated`, never `catalysts`: the two arrive on different arguments because they are different claims. */
    feeds: [feed('catalystCadence', 'estimated')],
    /** The bounded revision this step's `nextState` is carried in. */
    carriedIn: 'research/catalyst-window',
  },
  {
    calls: ['radarCandidates'],
    kind: 'operation',
    feeds: [feed('catalystRegister', 'catalysts'), feed('catalystRegister', 'events')],
  },
  { calls: ['radarFeedDiagnosis'], kind: 'operation', feeds: [feed('radarCandidates', 'candidates'), feed('catalystRegister', '*', 'catalysts')] },
  {
    calls: ['upsideRadar'],
    kind: 'operation',
    feeds: [feed('radarCandidates', 'candidates'), feed('radarFeedDiagnosis', '*', 'feed')],
  },
  { calls: ['thesisGapSources', 'thesisValuation'], kind: 'operation' },
  /**
   * ⛔ **The step that was missing, and it was missing from the spine (#229).**
   * `variantViewCheck`'s `consensusRefs` is the only one of its four requirements
   * whose input is in no filing and on no exchange feed, and since #226 a candidate
   * short of any of the four is refused outright rather than sized smaller. The
   * next step could file a consensus reading and the one after could ledger it —
   * and nothing anywhere said to go and **get** one. Measured on
   * `run_c7ad46eea03840bf84ae7a8822ed02c3`: `requirementReport` 0 of 4.
   */
  { calls: ['WebSearch', 'WebFetch'], kind: 'tool' },
  { calls: ['observation_file'], kind: 'tool' },
  { calls: ['observationLedger'], kind: 'operation' },
  /**
   * ⛔ **The stage that finishes a candidate, and it was missing from the spine
   * exactly as the consensus step was (#243).** Every gate that opens a position
   * has been here since #226 and `variantViewCheck` judges them; nothing
   * produced **the document they judge.** Measured on
   * `run_bb689b6199084b04afd8b0e1d1528cda`: 157 names screened across both
   * markets, 42 eligible, four pushed to `variantViewCheck`, all four declined,
   * **0 registered** — and `267260` stopped at `1 of 4`.
   *
   * ⚠️ **Two steps, because they answer two questions.** `candidateQueue`
   * decides *which* candidate is carried — per lens, since one score ordering
   * three lenses is #242 — and `candidateCompletion` reads whether the document
   * was actually written. ⚠️ The order is the fix, the same way #146's is: the
   * queue names what this run owes before the run can decide it owes nothing,
   * and `candidateCompletion` is fed that list rather than a number of its own.
   *
   * ⚠️ **It is last on purpose.** The record it checks needs the two steps above
   * it — a `consensusRefs` row is filed by `observation_file` and ledgered by
   * `observationLedger` — so a completion stage placed before them would ask for
   * a document one of whose four requirements could not yet exist.
   */
  { calls: ['candidateQueue'], kind: 'operation' },
  { calls: ['candidateCompletion'], kind: 'operation', feeds: [feed('candidateQueue', 'owesDocument')] },
  /**
   * ⛔ **The boundary moves during the run, so the verdict about it is last
   * (#246).** `coverage` was step 2 of the sleeve's own preamble — before this
   * branch had run and therefore before any extension it discovers exists — and
   * at that moment `extensions: []` makes `complete: true` *honest*. Then the
   * run registers an extension and the record and the verdict disagree.
   *
   * ⚠️ **Two flows did it in the same run, which is what makes it a procedure
   * rather than an accident.** Measured on `run_bb689b6199084b04afd8b0e1d1528cda`
   * (2026-09-09): `kr-sleeve` persisted `extensions: ["001440"]` and `us-sleeve`
   * `["LEU"]`, and both reported `coverage.complete: true` / `uncovered: []`.
   * The orchestrator re-called `coverage` with those names in the universe and
   * both flipped — KR 77/75/74 → `complete: false`, `uncovered: ["001440"]`;
   * US 85/84/83 → `uncovered: ["LEU"]` — because neither name had a
   * `prices/daily` disposition and `coverageState` counts exactly that.
   *
   * ⚠️ **`researchState` is a step for the reason `catalystRegister` is.** It was
   * a sentence in a paragraph below the checklist, so nothing ordered it against
   * anything; declaring it here is what makes «after» a fact a verifier can
   * execute rather than an adverb in prose.
   *
   * ⛔ **No `feed` between them, and the absence is deliberate.** `researchState`
   * answers `nextState.rows[]` — `{symbol, market, observedAt, evidenceIds,
   * sector, extension}` — and `coverage` takes `extensions` as bare symbol
   * strings; a declared wire between two shapes that do not match would be the
   * vacuous kind of assertion this file exists to replace. What is declared here
   * is the **order**, which is the whole of what #246 asks for.
   */
  { calls: ['researchState'], kind: 'operation', carriedIn: 'coverage/research-index' },
  { calls: ['coverage'], kind: 'operation' },
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
