import { diagnostic, finite, round } from './diagnostics.mjs'
import { PAPER_SETUP_COHORTS } from './vocabulary.mjs'
import { attestationCounts, attestationOf, MANAGER_OBSERVATION_SOURCE, strongestAttestation } from './observation.mjs'

/**
 * ── One trigger vocabulary, two shapes that mean different things (§25) ────
 *
 * `validateThesis` accepted `price_below` and `validateWatch` accepted
 * `price-below`, for the same condition, and no skill listed either set. A run
 * that learned one spelling was refused by the other function.
 *
 * The spelling is now kebab-case everywhere, matching the `unit` and `lens`
 * vocabularies. ⚠️ **The snake_case forms are still read, and no longer here**
 * (#212 ⑥): `canonical-input.mjs` folds them at the one boundary and raises the
 * `info` that says which name is canonical, so this module receives one
 * spelling and the two sets below are the whole vocabulary it states.
 *
 * ⚠️ The two sets are still **not identical**, and that is deliberate rather
 * than leftover:
 *
 * - `metric` is a thesis invalidation and not a WATCH, because a WATCH must be
 *   evaluable by the wake engine from published data and a thesis metric may
 *   need a filing read by a person.
 * - `weight-drift` is a WATCH and not a thesis invalidation, because drifting
 *   past a weight says something about the portfolio, not about the claim.
 * - `event` is a thesis invalidation and not a WATCH, for the same reason
 *   `metric` is: nothing publishes *"the buyback was halted"* at the instant it
 *   becomes true, so no wake engine can fire on it — but a person can read the
 *   named producer's document by the named date. `producer` and `checkBy` are
 *   what make that reading a check rather than a mood; see
 *   `EVENT_INVALIDATION_PRODUCER` below.
 *
 * Everything else is shared, `at-time` included — it used to be spelled `time`
 * on the thesis side, which made one condition look like two.
 *
 * Both facts are published in `candidate-research` rather than left to be
 * discovered by a refusal.
 */
export const THESIS_TRIGGER_KINDS = new Set(['price-below', 'price-above', 'metric', 'at-time', 'event'])
export const WATCH_TRIGGER_KINDS = new Set(['at-time', 'price-below', 'price-above', 'weight-drift'])

const TRIGGER_KINDS = THESIS_TRIGGER_KINDS
const MATURITY = new Set(['insufficient', 'observing', 'reviewable', 'promoted'])

/**
 * ── What was actually wrong with an `event` invalidation (2026-09-07) ──────
 *
 * The refusal read *"Invalidation must be price, metric or time; producer-less
 * event is forbidden"* and then refused **every** event, producer or not. The
 * clause the sentence turns on was never implemented: what cannot be judged is
 * not the kind, it is an event with nobody who announces it. *"자사주 매입 중단"*
 * and *"PF 손실 대규모 인식"* are not vague — they are the two conditions under
 * which the Woori thesis was wrong, they are exactly what a falsification
 * condition is supposed to be, and the gate had no way to hold them.
 *
 * ⛔ This is not a relaxation. Before, an investor with a real falsifier had
 * two moves: drop it, or dress it as a `metric` with a level nobody measures.
 * The second is worse than the event, because it reads as machine-checked. What
 * is added here is a **second required field on a kind that used to be
 * unregisterable**, and every existing kind is refused on exactly the terms it
 * was before.
 *
 * ── The shape, and why it is two fields rather than a sentence ─────────────
 *
 * `producer` is `{ publisher, document }`: **who** announces the fact, and **in
 * which document** it will be announced. This follows the vocabulary already
 * here rather than inventing a third style — `consensusRefs` is a row of
 * separately checkable fields (`metric`, `value`, `sourceUrl`, `publishedAt`,
 * `capturedAt`) and a `catalysts` window is `{ event, windowStart, windowEnd }`.
 * A free-text `producer` would have been a string the run writes and the gate
 * reads back to itself — the shape of #141, where a sentence a run invented
 * became an allocation limit. Two named fields can each be *wrong in a way
 * somebody can name*: a publisher who publishes no such thing, a document that
 * does not carry the item.
 *
 * ⚠️ **No URL is required, and that is not an oversight.** A `consensusRefs`
 * row cites a document that already exists, which is why it carries
 * `sourceUrl` and a `publishedAt` that cannot follow its `capturedAt`. An event
 * invalidation names a document that has **not been published yet** — the whole
 * point is to register the falsifier before the fact. Requiring a link would
 * mean either no event trigger can be registered in advance, or the link is
 * invented; the second is how a fabricated citation gets into a thesis. The URL
 * appears later, on the consensus row that cites the document once it exists.
 *
 * ── Why `checkBy` is blocking here and unevaluated elsewhere ───────────────
 *
 * A producer with no deadline still cannot decide anything: *"not announced
 * yet"* is a true answer forever, so the trigger reads as watched while never
 * being read. That is not hypothetical. `036460_KOGAS` ran **four consecutive
 * `threatened` verdicts** (2026-07-17 · 07-20 · 07-21 · 07-27), each concluding
 * that no new fact had arrived, because its two live triggers could only fire
 * *when a negative was confirmed* — and the investor broke the loop by hand,
 * registering `unjudgeable_deadline`, a trigger whose firing condition is **the
 * failure to confirm by a date**. That hand-made trigger is what the pair
 * `producer` + `checkBy` makes ordinary: the producer says where the answer
 * comes from, the deadline says when its absence is itself the answer. Missing
 * either one is `blocked`, because half of this pair judges nothing.
 *
 * ⚠️ What still does not happen is machine evaluation. `thesisSentinel` cannot
 * compare an event to a number and reports `sentinel_rule_unevaluated`, as it
 * should — a person reads the producer's document. `exitCheck` already raises
 * `thesis_review` for any trigger that passed its own `checkBy` unevaluated, so
 * a registered event whose deadline arrives surfaces there without a new lane.
 */
export const EVENT_INVALIDATION_PRODUCER = Object.freeze(['publisher', 'document'])

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

export function eventProducerComplete(producer) {
  return Boolean(producer) && typeof producer === 'object' && !Array.isArray(producer) &&
    EVENT_INVALIDATION_PRODUCER.every((field) => nonEmpty(producer[field]))
}

export function validateThesis(input) {
  const diagnostics = []
  const required = ['thesisId', 'asset', 'createdAt', 'coreClaim', 'horizonEnd', 'evidenceStatus']
  for (const field of required) if (!input?.[field]) diagnostics.push(diagnostic('thesis_field_missing', 'blocked', `Thesis field ${field} is required`, field))
  if (!['complete', 'incomplete'].includes(input?.evidenceStatus)) diagnostics.push(diagnostic('thesis_evidence_status_invalid', 'blocked', 'evidenceStatus must be complete or incomplete', 'evidenceStatus'))
  const gaps = []
  if (!input?.variantView) gaps.push('variantView')
  const consensus = (input?.consensusRefs ?? []).filter((row) => row?.metric && finite(row?.value) && row?.sourceUrl && row?.publishedAt && row?.capturedAt)
  if (!consensus.length) gaps.push('consensusRefs')
  for (const [index, row] of consensus.entries()) {
    if (Date.parse(row.publishedAt) > Date.parse(row.capturedAt)) diagnostics.push(diagnostic('consensus_time_invalid', 'blocked', 'publishedAt cannot follow capturedAt', `consensusRefs[${index}]`))
  }
  const catalysts = (input?.catalysts ?? []).filter((row) => row?.event && Number.isFinite(Date.parse(row.windowStart)) && Number.isFinite(Date.parse(row.windowEnd)))
  if (!catalysts.length) gaps.push('catalysts')
  catalysts.forEach((row, index) => {
    if (Date.parse(row.windowStart) > Date.parse(row.windowEnd)) diagnostics.push(diagnostic('catalyst_window_invalid', 'blocked', 'windowStart cannot follow windowEnd', `catalysts[${index}]`))
  })
  const invalidations = []
  for (const [index, row] of (input?.invalidationTriggers ?? []).entries()) {
    /** ⚠️ The kind is canonical by the time it arrives (#212 ⑥); the alias table is `canonical-input.mjs`' and the `info` naming the canonical spelling is raised there. */
    const kind = row?.kind
    if (!TRIGGER_KINDS.has(kind)) {
      diagnostics.push(diagnostic('invalidation_kind_invalid', 'blocked', 'Invalidation must be price, metric, time or a produced event', `invalidationTriggers[${index}].kind`, { supported: [...TRIGGER_KINDS] }))
      continue
    }
    if (kind === 'event') {
      /**
       * Both halves or neither: a producer with no deadline is never read, and
       * a deadline with no producer names no document to read. Refused here
       * rather than falling through, so an event never reaches the generic
       * `unevaluated` deadline line and never counts toward `invalidations`.
       */
      if (!eventProducerComplete(row?.producer)) {
        diagnostics.push(diagnostic('invalidation_producer_missing', 'blocked', 'An event invalidation must name its producer as { publisher, document } — who announces the fact and in which document; a producer-less event is judged by nobody', `invalidationTriggers[${index}].producer`, { required: [...EVENT_INVALIDATION_PRODUCER] }))
        continue
      }
      if (!Number.isFinite(Date.parse(row?.checkBy))) {
        diagnostics.push(diagnostic('invalidation_event_undated', 'blocked', 'An event invalidation must name the date its producer is read by; without one “not announced yet” stays true forever and the trigger decides nothing', `invalidationTriggers[${index}].checkBy`))
        continue
      }
      invalidations.push(row)
      continue
    }
    if (['price-below', 'price-above'].includes(kind) && !finite(row.level)) diagnostics.push(diagnostic('invalidation_price_missing', 'blocked', 'Price invalidation needs a numeric level', `invalidationTriggers[${index}].level`))
    if (!Number.isFinite(Date.parse(row.checkBy))) diagnostics.push(diagnostic('invalidation_deadline_missing', 'unevaluated', 'Invalidation needs a checkBy deadline', `invalidationTriggers[${index}].checkBy`))
    else invalidations.push(row)
  }
  if (!invalidations.length) gaps.push('invalidationTriggers')
  if (!finite(input?.expectedUpsidePct)) gaps.push('expectedUpsidePct')
  if (!finite(input?.fairValueRange?.low) || !finite(input?.fairValueRange?.high)) gaps.push('fairValueRange')
  if (input?.evidenceStatus === 'complete' && gaps.length) diagnostics.push(diagnostic('thesis_false_complete', 'blocked', 'A complete thesis cannot have evidence gaps', 'evidenceStatus', { gaps }))
  else if (gaps.length) diagnostics.push(diagnostic('thesis_incomplete', 'unevaluated', 'Thesis gaps remain explicit', 'input', { gaps }))
  return { data: { valid: !diagnostics.some((row) => row.severity === 'blocked'), complete: input?.evidenceStatus === 'complete' && gaps.length === 0, gaps }, diagnostics }
}

/**
 * ── What a variant view is *checked* by, and which lane it opens (issue #153) ─
 *
 * The source methodology ran two lanes. The mechanical one — `mechanical_experiment_lane`,
 * approved 2026-07-29 — states its own trade in one sentence: *"variant view를
 * 요구하지 않는 대신 사이징을 1%로 묶는다."* The other half of that trade is the
 * lane it is contrasted with: the **main lane requires a variant view and could
 * size a name to the investor's own single-name cap** (20%, warn 18%). The three
 * names the investor actually made money on were in that lane.
 *
 * The port kept the 1% lane and lost the other one: §4's lens-maturity ceiling
 * was applied to *both*, so a candidate with a variant view was held to
 * `experimentalCeiling` — 1.345% on this book — exactly like a mechanical one.
 * ⛔ **Restoring the second lane is not a relaxation of a gate; it is moving a
 * gate off the lane it was never written for.** Nothing here lowers
 * `promotionGate`, nothing here touches the control arm's 1% / 6%, and
 * `controlArmLane.expansionProhibited` still stands: a control-arm *result* is
 * never an argument for size anywhere.
 *
 * ── The part that has to be computed ──────────────────────────────────────
 *
 * If "this candidate has a variant view" were a claim a run could simply
 * assert, the main lane would be a text box that raises a cap twentyfold — the
 * exact shape of #141, where a string a run invented became an allocation
 * limit. So the answer is assembled from inputs that can be checked, and every
 * one of them already exists in this package:
 *
 * | requirement | checked by | why this one |
 * |---|---|---|
 * | `thesisComplete` | `validateThesis().complete` | the thesis names `variantView` and carries expected upside, fair value, catalysts and invalidation triggers; a gap list is not a variant view |
 * | `variantView` | a non-empty statement on the thesis | the claim itself, still necessary and never sufficient |
 * | `consensusRefs` | one dated, sourced, point-in-time row | *"we see this differently"* has no meaning without what the consensus is; a citation published after it was captured, or after `asOf`, is not one |
 * | `challengeCleared` | `challengeVerdict === 'cleared'` | the adversarial read is what separates a variant view from a preference; a conditional verdict is a watch |
 *
 * ⛔ **Anything unchecked falls to the control arm.** `verified` is true only
 * when every requirement is satisfied; a missing input is `missing`, never
 * waived, and there is no argument, flag or lane request that turns *"not
 * checked"* into *"checked"*.
 *
 * ⛔ **`evidenceSamples` is the leak guard.** A candidate may not reach the
 * main lane on the control arm's own record: the mechanical cohort is the
 * baseline others clear, and a thesis that cites it as its evidence has spent
 * the control it depends on. `verdictReport` refuses the same substitution one
 * layer up; this refuses it at the lane door. Rows are read in
 * `paperAdmission`'s vocabulary (`{ setup, cohort }`).
 */
export const RESEARCH_COHORT = 'llm-research'

export const VARIANT_VIEW_REQUIREMENTS = Object.freeze(['thesisComplete', 'variantView', 'consensusRefs', 'challengeCleared'])

export function variantViewCheck({ thesis = null, challengeVerdict = null, evidenceSamples = [], asOf = null } = {}) {
  const diagnostics = []
  const satisfied = []
  const missing = []
  const record = (requirement, met) => (met ? satisfied : missing).push(requirement)

  const thesisReport = thesis && typeof thesis === 'object' ? validateThesis(thesis) : null
  record('thesisComplete', thesisReport?.data?.complete === true)
  record('variantView', typeof thesis?.variantView === 'string' && thesis.variantView.trim().length > 0)

  const asOfInstant = Date.parse(asOf)
  const consensusRefs = Array.isArray(thesis?.consensusRefs) ? thesis.consensusRefs : []
  const accepted = consensusRefs.filter((row) => {
    if (!row?.metric || !finite(row?.value) || !row?.sourceUrl) return false
    const published = Date.parse(row.publishedAt)
    const captured = Date.parse(row.capturedAt)
    if (!Number.isFinite(published) || !Number.isFinite(captured) || published > captured) return false
    return !Number.isFinite(asOfInstant) || published <= asOfInstant
  })
  record('consensusRefs', accepted.length > 0)
  record('challengeCleared', challengeVerdict === 'cleared')

  /**
   * ── Whose word the 20% lane is standing on (issue #692, catalogue side) ───
   *
   * `consensusRefs` is the one requirement of the four whose input **can only
   * come from the web.** Broker estimates and price targets are in no filing
   * and on no exchange feed, and until `untilled/aumos#693` the CLI's own web
   * tools issued no evidence id, so the row this check accepts was a URL typed
   * into a thesis with nothing in the record behind it. That is the supply
   * route #693 opened, and it opened it in one grade: `observation_file` files
   * the passage as the **manager's testimony**, not as something Aumos fetched.
   *
   * ⚠️ **The investor was asked and chose that trade** — a manager-attested
   * `consensusRefs` row satisfies the requirement, and the investor reads the
   * passage before approving 20%-scale sizing. So the requirement is **not**
   * raised here: `accepted` is byte-for-byte what it was, `verified` is
   * unchanged, and a manager-attested row counts exactly as it did.
   *
   * ⛔ **What is added is that the grade is never silent.** The trade the
   * investor accepted was ⑴ *"file it, and I will read it before I approve"*,
   * and a grade that stays inside this function turns that into ⑶ *"drop the
   * requirement"* without anybody choosing it. So the grade of each accepted
   * row is computed, the strongest one is published, and — when the strongest
   * one this lane has is the manager's own word — it is said in a diagnostic
   * that `effectivePositionCap` turns into a disclosure obligation.
   *
   * An `uncited` row is the pre-#693 shape and is now a reported gap rather
   * than an unremarkable one: the supply route exists, so a consensus figure
   * with no evidence id behind it is a choice.
   */
  const acceptedGrades = accepted.map((row) => attestationOf(row))
  const consensusRefsAttestation = attestationCounts(acceptedGrades)
  const consensusStrongestAttestation = strongestAttestation(acceptedGrades)
  const consensusRefRows = accepted.map((row, index) => ({
    index,
    metric: row.metric,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    evidenceId: typeof row?.evidenceId === 'string' && row.evidenceId.trim().length ? row.evidenceId.trim() : null,
    attestation: acceptedGrades[index],
  }))
  const managerAttestedRefs = consensusRefRows.filter((row) => row.attestation === 'manager')
  const restsOnManagerAttestation = consensusStrongestAttestation === 'manager'
  const uncitedRefs = consensusRefRows.filter((row) => row.attestation === 'uncited')
  if (uncitedRefs.length) {
    diagnostics.push(diagnostic(
      'consensus_ref_uncited',
      'unevaluated',
      'These consensus rows passed the point-in-time check and name no evidence id, so nothing in the record stands behind them. Since untilled/aumos#693 there is a route: file the source’s own words with `observation_file` and carry the id it returns back onto the row',
      'thesis.consensusRefs',
      { rows: uncitedRefs.map((row) => ({ index: row.index, metric: row.metric, sourceUrl: row.sourceUrl })) },
    ))
  }
  const ungradedRefs = consensusRefRows.filter((row) => row.attestation === 'ungraded')
  if (ungradedRefs.length) {
    diagnostics.push(diagnostic(
      'consensus_ref_grade_unstated',
      'unevaluated',
      'These consensus rows name an evidence id and say nothing about what kind of row it is, so whether this lane rests on the manager’s own reading cannot be answered here. Carry `evidenceKind` and `evidenceSource` back from the filing receipt',
      'thesis.consensusRefs',
      { rows: ungradedRefs.map((row) => ({ index: row.index, evidenceId: row.evidenceId })) },
    ))
  }
  if (restsOnManagerAttestation) {
    diagnostics.push(diagnostic(
      'consensus_ref_manager_attested',
      'unevaluated',
      `The strongest consensus citation this candidate has is the manager’s own reading, filed through \`observation_file\` and sourced \`${MANAGER_OBSERVATION_SOURCE}\`. Aumos fetched none of it and verified none of it; the requirement is met and the grade travels with it. If this opens the main lane, the proposal says so where the investor reads before approving`,
      'thesis.consensusRefs',
      { rows: managerAttestedRefs.map((row) => ({ metric: row.metric, sourceUrl: row.sourceUrl, evidenceId: row.evidenceId, publishedAt: row.publishedAt })) },
    ))
  }

  const citedCohorts = [...new Set((Array.isArray(evidenceSamples) ? evidenceSamples : [])
    .map((row) => row?.cohort ?? PAPER_SETUP_COHORTS[row?.setup] ?? null)
    .filter((cohort) => typeof cohort === 'string'))]
  const controlArmCited = citedCohorts.filter((cohort) => cohort !== RESEARCH_COHORT)
  if (controlArmCited.length) {
    diagnostics.push(diagnostic(
      'control_arm_evidence_cited',
      'blocked',
      'This variant view rests on the mechanical cohort, which is the control arm: its result is the baseline an edge claim has to clear and never the argument for one. Cite the research cohort or external evidence, or size this candidate in the control arm',
      'evidenceSamples',
      { cohorts: controlArmCited, researchCohort: RESEARCH_COHORT },
    ))
  }

  const verified = missing.length === 0 && controlArmCited.length === 0

  /**
   * ── Which of the four, and why that one (issue #160, ask 4) ───────────────
   *
   * `missing: ["thesisComplete"]` hides that the other **three** were met. On
   * the 2026-09-06 measurement that one word is the whole difference between a
   * declared 20% cap and an effective 1%, and the investor reading it cannot
   * tell whether nothing was done or almost everything was. So every
   * requirement reports its own state, what checked it, and — when it is
   * unmet — the narrowest statement available of what is still outstanding.
   *
   * ⛔ It reports; it does not relax. The four requirements, their checks and
   * `verified` are byte-for-byte what they were.
   */
  const thesisGaps = thesisReport?.data?.gaps ?? null
  const outstanding = {
    thesisComplete: thesisGaps === null
      ? 'no thesis was supplied, so validateThesis was never run'
      : thesisGaps.length
        ? `validateThesis returns gaps: ${thesisGaps.join(', ')}`
        : 'validateThesis returns no gaps but evidenceStatus is not `complete`',
    variantView: 'the thesis carries no non-empty `variantView` statement',
    consensusRefs: consensusRefs.length
      ? `${consensusRefs.length} consensus row(s) were given and none survived the point-in-time check (metric, finite value, sourceUrl, publishedAt <= capturedAt and <= asOf)`
      : 'no consensus row was given, so there is nothing the view differs from',
    challengeCleared: `challengeVerdict is ${challengeVerdict ?? 'absent'} rather than \`cleared\``,
  }
  const checkedBy = {
    thesisComplete: 'validateThesis().complete',
    variantView: 'a non-empty statement on the thesis',
    consensusRefs: 'one dated, sourced, point-in-time row',
    challengeCleared: "challengeVerdict === 'cleared'",
  }
  const requirementReport = VARIANT_VIEW_REQUIREMENTS.map((requirement) => ({
    requirement,
    satisfied: satisfied.includes(requirement),
    checkedBy: checkedBy[requirement],
    outstanding: satisfied.includes(requirement) ? null : outstanding[requirement],
    /** ⚠️ Only the thesis requirement decomposes further; the other three are one fact each. */
    gaps: requirement === 'thesisComplete' ? thesisGaps : null,
  }))

  if (!verified) {
    diagnostics.push(diagnostic(
      'variant_view_unverified',
      'unevaluated',
      `No variant view is established for this candidate, so it is a mechanical entry and is sized as one: the main lane is what a checked variant view opens, and an unchecked one is not a smaller version of a checked one. ${satisfied.length} of ${VARIANT_VIEW_REQUIREMENTS.length} requirements are met and ${missing.length ? `what is outstanding is ${missing.join(', ')}` : 'the evidence cited is the control arm\'s own'}`,
      'thesis',
      { missing, satisfied, gaps: thesisGaps, consensusRefsAccepted: accepted.length, requirementReport },
    ))
  }
  return {
    data: {
      verified,
      requirements: VARIANT_VIEW_REQUIREMENTS,
      satisfied,
      missing,
      /** Per requirement rather than per verdict, so the one that binds is nameable. (#160) */
      requirementReport,
      satisfiedCount: satisfied.length,
      requirementCount: VARIANT_VIEW_REQUIREMENTS.length,
      gaps: thesisReport?.data?.gaps ?? null,
      consensusRefsAccepted: accepted.length,
      consensusRefsGiven: consensusRefs.length,
      /** Whose word each accepted row is, and the best grade among them. (#692) */
      consensusRefRows,
      consensusRefsAttestation,
      consensusStrongestAttestation,
      managerAttestedRefs,
      /**
       * True when the best citation this candidate has is the manager's own
       * reading. `effectivePositionCap` reads it and requires the proposal to
       * say so at the approval point; it changes no requirement and no cap.
       */
      restsOnManagerAttestation,
      challengeVerdict: challengeVerdict ?? null,
      citedCohorts,
      controlArmEvidenceCited: controlArmCited.length > 0,
      /** The lane a checked variant view opens; anything else is the control arm. */
      lane: verified ? 'main' : 'control-arm',
    },
    diagnostics,
  }
}

/**
 * ── Which evidence row answers which invalidation (issue #181) ─────────────
 *
 * The join was `new Map(evidence.map((row) => [row.id, row]))` read with
 * `evidenceById.get(rule.evidenceId)`, and both halves of that line fail on the
 * same value: **`undefined`**. A rule that names no `evidenceId` looks the key
 * `undefined` up, and every evidence row that carries no `id` was *filed* under
 * `undefined` — last one wins. So an unjoined rule did not go unevaluated; it
 * silently borrowed **whichever id-less evidence row happened to come last**
 * and was then compared against it as if it were its own observation.
 *
 * ⚠️ The measured shape of that (control (a) of the issue, run
 * `run_996380fbdd9a41a5bb3d74f3eca761a2`): four rules and four id-less rows,
 * every rule joined to the last row — the price, 113,320 — and the rule
 * *"USDKRW above 1,543.40"* answered **`met`**, because 113,320 is indeed above
 * 1,543.40. Control (d) moved the same wrong answer onto `hard-stop` merely by
 * dropping the price row, which is the proof that position, not key, was doing
 * the joining. The operators were never wrong (control (b): 4 of 4 correct).
 *
 * ⛔ **The direction of the error is the reason this is not a cosmetic bug.**
 * A borrowed number is compared against a threshold it was never scaled to, and
 * a price borrowed by an FX rule clears an FX threshold by three orders of
 * magnitude — so the fabricated answer is `met`, `met` is `threatened`, and
 * three `threatened` in a row sets `escalationRequired`, which `PROMPT.md` §2b
 * turns into an owed resize or liquidation. The defect manufactures forced
 * selling on an invalidation that never fired.
 *
 * ── What joins now, and what an unjoined rule answers ──────────────────────
 *
 * Three keys, tried in this order, each of them something the caller wrote
 * down rather than something inferred from position:
 *
 * | key | direction | why it is here |
 * |---|---|---|
 * | `rule.evidenceId` → `evidence[].id` | rule names its row | the key the code always meant to use, and the only one the old tests exercised |
 * | `evidence[].invalidationId` → `rule.id` | row names its rule | the shape the `us-sleeve` observer tried in the same run; refusing it taught nothing |
 * | `rule.metric` → `evidence[].metric` | same measurement | a `metric` rule and a `metric` observation of the same name are the same quantity; this is the shape the orchestrator passed |
 *
 * ⛔ **Anything else is `unevaluated`, and so is anything ambiguous.** Two rows
 * answering one key is not a tie to be broken — a broken tie is exactly the
 * silent borrowing this replaces — and `unevaluated` is the safe direction
 * because of what each state costs: `unevaluated` makes the verdict `watch`,
 * which a person reads, while a wrong `met` makes it `threatened`, which
 * accumulates toward an automatic sell. ⛔ Nor is the fallback ever `not-met`:
 * that would report an invalidation as *checked and clear* on evidence nobody
 * supplied, hiding a real breach the same way the old code invented one.
 *
 * ⚠️ `joinedBy` rides on every evaluation so the answer says which key stood.
 */
export const SENTINEL_JOIN_KEYS = Object.freeze(['evidenceId', 'invalidationId', 'metric'])

const named = (value) => (typeof value === 'string' && value.trim().length ? value.trim() : null)

export function resolveSentinelEvidence(rule, evidence = []) {
  const rows = Array.isArray(evidence) ? evidence.filter((row) => row && typeof row === 'object') : []
  const pick = (key, matches) => {
    if (matches.length === 1) return { observation: matches[0], joinedBy: key, reason: null }
    if (matches.length > 1) return { observation: null, joinedBy: null, reason: 'ambiguous', key, matched: matches.length }
    return null
  }

  const wantedId = named(rule?.evidenceId)
  if (wantedId) {
    return pick('evidenceId', rows.filter((row) => named(row.id) === wantedId)) ??
      { observation: null, joinedBy: null, reason: 'no-such-evidence-id', key: 'evidenceId' }
  }

  const ruleId = named(rule?.id)
  if (ruleId) {
    const answered = pick('invalidationId', rows.filter((row) => named(row.invalidationId) === ruleId))
    if (answered) return answered
  }

  const metric = named(rule?.metric)
  if (rule?.kind === 'metric' && metric) {
    return pick('metric', rows.filter((row) => named(row.metric) === metric)) ??
      { observation: null, joinedBy: null, reason: 'no-evidence-for-metric', key: 'metric' }
  }

  return { observation: null, joinedBy: null, reason: 'unjoined', key: null }
}

export function thesisSentinel({ invalidations = [], evidence = [], priorVerdicts = [] }) {
  const diagnostics = []
  if (!invalidations.length) diagnostics.push(diagnostic('sentinel_rules_missing', 'unevaluated', 'No invalidation was evaluated; an empty rule set cannot establish an intact thesis', 'invalidations'))
  const evaluations = invalidations.map((rule, index) => {
    const id = named(rule?.id) ?? `rule-${index}`
    if (!named(rule?.id)) {
      diagnostics.push(diagnostic('sentinel_rule_unnamed', 'info', 'This invalidation carries no id, so the answer names it by position and evidence cannot address it by invalidationId; the id you pass is kept verbatim', `invalidations[${index}].id`, { synthesized: id }))
    }
    const { observation, joinedBy, reason, key, matched } = resolveSentinelEvidence(rule, evidence)
    if (!observation) {
      diagnostics.push(diagnostic(
        reason === 'ambiguous' ? 'sentinel_evidence_ambiguous' : 'sentinel_evidence_missing',
        'unevaluated',
        reason === 'ambiguous'
          ? 'More than one evidence row answers this invalidation under the same key, and a broken tie is a guess; the rule is left unevaluated rather than decided by whichever row came last'
          : 'No evidence row joins to this invalidation, so it is unevaluated — never met. Join by evidenceId, by an evidence row naming this rule in invalidationId, or, for a metric rule, by an evidence row carrying the same metric',
        key ? `invalidations[${index}].${key}` : `invalidations[${index}]`,
        { joinKeys: [...SENTINEL_JOIN_KEYS], reason, ...(matched ? { matched } : {}) },
      ))
      return { id, state: 'unevaluated', joinedBy: null }
    }
    let met = null
    if (rule.kind === 'price_below' && finite(observation.value) && finite(rule.level)) met = observation.value < rule.level
    else if (rule.kind === 'price_above' && finite(observation.value) && finite(rule.level)) met = observation.value > rule.level
    else if (rule.kind === 'metric' && finite(observation.value) && finite(rule.level)) met = rule.operator === 'above' ? observation.value > rule.level : observation.value < rule.level
    else if (rule.kind === 'time' && Number.isFinite(Date.parse(observation.availableAt)) && Number.isFinite(Date.parse(rule.at))) met = Date.parse(observation.availableAt) >= Date.parse(rule.at)
    if (met === null) diagnostics.push(diagnostic('sentinel_rule_unevaluated', 'unevaluated', 'Rule and evidence are not comparable', `invalidations[${index}]`))
    return { id, state: met === null ? 'unevaluated' : met ? 'met' : 'not-met', evidenceId: named(observation.id) ?? null, joinedBy }
  })
  const verdict = !evaluations.length ? 'unevaluated' : evaluations.some((row) => row.state === 'met') ? 'threatened' : evaluations.some((row) => row.state === 'unevaluated') ? 'watch' : 'intact'
  let consecutiveThreatened = 0
  for (const row of [...priorVerdicts].sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))) {
    if (row.verdict !== 'threatened') break
    consecutiveThreatened += 1
  }
  if (verdict === 'threatened') consecutiveThreatened += 1
  const escalationRequired = consecutiveThreatened >= 3
  if (escalationRequired) diagnostics.push(diagnostic('sentinel_threatened_repeated', 'blocked', 'Repeated threatened verdict requires explicit resize/exit/deadline decision', 'priorVerdicts', { consecutiveThreatened }))
  return { data: { verdict, evaluations, consecutiveThreatened, escalationRequired }, diagnostics }
}

/**
 * The three pre-registered radar lanes (`ur-v1`, registered 2026-07-18 —
 * before any signal was accumulated, which is the point of registering them).
 *
 * Each carries its own rule version so revising one lane's definition does not
 * invalidate another lane's sample, and every lane is evaluated for **every**
 * candidate. Inclusion and exclusion are both explained mechanically: a
 * candidate that fell out of a lane says which condition it failed, so "the
 * radar found nothing" can be told apart from "the radar was starving".
 *
 * That distinction was the whole 2026-07-29 diagnosis in the original — the
 * information-edge lenses were not missing, their inputs were. `inflection`
 * matched 2 of 92 candidates with 16 excluded for "no registered catalyst";
 * filling the rolling earnings window took it to 12. A lane that reports only
 * its hits cannot surface that.
 */
const RADAR_LANES = {
  inflection: 'uri-v1',
  'quality-pullback': 'urq-v1',
  'post-event-continuation': 'urp-v1',
}

function radarLaneVerdicts(row, candidate, asOf) {
  // ⛔ `axes.valuation` is deliberately absent from this line: no registered lane
  // screens on price-to-book. The row declares that with `gates: false` (#170).
  const { inflection, catalyst, price } = row.axes
  const filingYoy = inflection.operatingIncomeYoy
  const marginDelta = inflection.marginDeltaYoy
  const detail = {}

  const decide = (lane, included, reason) => { detail[lane] = { included, ruleVersion: RADAR_LANES[lane], reason } }

  if (inflection.status === 'unknown') decide('inflection', false, 'no-valid-point-in-time-filing')
  else if (!(filingYoy > 0)) decide('inflection', false, 'latest-filing-operating-income-not-improving')
  else if (!inflection.signFlip) decide('inflection', false, 'no-sign-flip-against-the-previous-comparable-filing')
  else if (catalyst.status !== 'present') decide('inflection', false, 'no-catalyst-registered-within-60-days')
  else decide('inflection', true, 'sign-flip-with-a-registered-catalyst')

  /**
   * The radar's route into the same population the scanner's `quality-pullback`
   * lens reaches by price alone. One lens, two routes: the rule version is what
   * keeps their samples from pooling, exactly as it does across lanes.
   */
  const close = price?.close
  const conditions = [
    [filingYoy > 0, 'latest-filing-operating-income-not-improving'],
    [finite(marginDelta) && marginDelta >= 0, 'operating-margin-not-holding'],
    [finite(close) && finite(price?.ma200) && close > price.ma200, 'trend-not-preserved-above-ma200'],
    [finite(close) && finite(price?.ma50) && close < price.ma50, 'not-actually-pulling-back-below-ma50'],
    [finite(price?.offHigh200) && price.offHigh200 >= -0.25, 'drawdown-past-25-percent-is-a-breakdown-not-a-pullback'],
  ]
  const failed = conditions.find(([ok]) => !ok)
  if (inflection.status === 'unknown') decide('quality-pullback', false, 'no-valid-point-in-time-filing')
  else if (failed) decide('quality-pullback', false, failed[1])
  else decide('quality-pullback', true, 'quality-holding-through-a-preserved-uptrend-pullback')

  const event = (candidate.events ?? []).find((entry) => {
    const since = (Date.parse(asOf) - Date.parse(entry?.announcedAt)) / 86_400_000
    return Number.isFinite(since) && since >= 0 && since <= 30
  })
  if (!event) decide('post-event-continuation', false, 'no-event-in-the-last-30-days')
  else if (!(finite(event.sue) ? event.sue > 0 : finite(event.day1ExcessPct) && event.day1ExcessPct > 0)) {
    decide('post-event-continuation', false, finite(event.sue) ? 'surprise-not-positive' : 'no-surprise-and-no-day-one-excess')
  } else if (!(finite(close) && finite(event.preAnnouncementClose) && close >= event.preAnnouncementClose)) {
    decide('post-event-continuation', false, 'price-has-not-held-the-pre-announcement-level')
  } else decide('post-event-continuation', true, 'positive-surprise-the-price-has-held')

  return detail
}

export function upsideRadar({ candidates = [], feed = null, asOf }) {
  const diagnostics = []
  const maximumFilingLagDays = 120
  const maximumFilingAgeDays = 180
  const rows = candidates.map((candidate, index) => {
    const filings = (candidate.filings ?? []).filter((filing) => {
      const lag = (Date.parse(filing.availableAt) - Date.parse(filing.periodEnd)) / 86_400_000
      const age = (Date.parse(asOf) - Date.parse(filing.availableAt)) / 86_400_000
      return finite(filing.operatingIncomeYoy) && lag <= maximumFilingLagDays && age <= maximumFilingAgeDays && Date.parse(filing.availableAt) <= Date.parse(asOf)
    }).sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
    const latest = filings.at(-1)
    const previous = filings.at(-2)
    const inflection = latest ? {
      status: latest.operatingIncomeYoy > 0 ? 'improving' : 'deteriorating',
      operatingIncomeYoy: latest.operatingIncomeYoy,
      previousOperatingIncomeYoy: previous?.operatingIncomeYoy ?? null,
      signFlip: latest.operatingIncomeYoy > 0 && finite(previous?.operatingIncomeYoy) && previous.operatingIncomeYoy <= 0,
      marginDeltaYoy: latest.marginDeltaYoy ?? null,
      cashConversion: latest.cashConversion ?? null,
      availableAt: latest.availableAt,
    } : { status: 'unknown', reason: 'no-valid-point-in-time-filing' }
    const price = candidate.price ?? { status: 'unknown' }
    const catalyst = (candidate.catalysts ?? []).some((row) => Date.parse(row.windowEnd) >= Date.parse(asOf) && Date.parse(row.windowStart) <= Date.parse(asOf) + 60 * 86_400_000)
      ? { status: 'present' }
      : { status: 'unknown', reason: 'no-registered-catalyst-not-proof-of-absence' }
    const expectation = candidate.latestEarnings ? { status: 'recorded', sue: candidate.latestEarnings.sue ?? null, guidanceSurprise: candidate.latestEarnings.guidanceSurprise ?? null } : { status: 'unknown', reason: 'no-point-in-time-event-record' }
    /**
     * ⚠️ **This axis is reported and it gates nothing, and it now says so on
     * every row.** That sentence is the whole of #170 and it is not a placeholder
     * for wiring that is coming.
     *
     * The three lanes are pre-registered technical and event lenses; none of them
     * asks what a name costs, `eligible` reads `price`, `inflection` and
     * `catalyst`, and `rankKey` reads two of those. `priceToBook` and
     * `debtToEquity` rode out on every candidate anyway, and a value that arrives
     * beside four axes that decide is read as a fifth that decides. #141 is the
     * same shape from the other side — `parkedLiquidity` arrived on every row and
     * was read by nothing — and what that fix settled is that a value and the use
     * a reader infers from it must not be allowed to disagree in silence.
     *
     * ⛔ **The answer is not a fourth lane.** Cheap is not a discovery signal
     * here: the predecessor harness screened on none, valuation in this package
     * belongs to `thesisValuation`, which prices a thesis that already cleared
     * discovery, and a lane is a **pre-registration** — a named rule version
     * registered before any signal accumulated, which is the point of
     * `RADAR_LANES`. Adding one to spend a computed number would register a lens
     * backwards, from the data outwards, and pool a new sample into a shelf of
     * lanes whose versions exist to keep samples apart. If a value lane is ever
     * wanted it is registered as one, on its own `ruleVersion`, on purpose.
     *
     * ⛔ **And it is not deletion either.** The numbers are correct, cheap and
     * point-in-time, and a run writing a thesis for a name the radar surfaced
     * reads them as context. What was wrong was never the arithmetic; it was that
     * nothing on the answer distinguished *context* from *verdict*.
     */
    const valuation = candidate.valuation?.equity > 0 && (finite(candidate.valuation.shares) || finite(candidate.valuation.debt)) ? {
      status: 'partial',
      gates: false,
      role: 'reported-not-gated',
      priceToBook: finite(price.close) && finite(candidate.valuation.shares) ? round(price.close * candidate.valuation.shares / candidate.valuation.equity, 2) : null,
      debtToEquity: finite(candidate.valuation.debt) ? round(candidate.valuation.debt / candidate.valuation.equity, 2) : null,
    } : { status: 'unknown', gates: false, role: 'reported-not-gated', reason: 'missing-shares-or-equity-never-zero-filled' }
    const eligible = price.status !== 'unknown' && inflection.status !== 'unknown' && (inflection.status === 'improving' || catalyst.status === 'present')
    if (!eligible) diagnostics.push(diagnostic('upside_candidate_unranked', 'info', 'Candidate remains visible but unranked because an axis is missing', `candidates[${index}]`, { asset: candidate.asset }))
    const row = { asset: candidate.asset, market: candidate.market, sector: candidate.sector ?? null, eligible, axes: { inflection, expectation, catalyst, price, valuation }, rankMeaning: 'research-priority-only' }
    row.lanes = radarLaneVerdicts(row, candidate, asOf)
    row.lensesEntered = Object.entries(row.lanes).filter(([, verdict]) => verdict.included).map(([lane]) => lane)
    return row
  })
  const rankKey = (row) => {
    const cell = row.axes.inflection.status === 'improving' && row.axes.price.status === 'confirmed' ? 2 : row.axes.inflection.status === 'improving' || row.axes.catalyst.status === 'present' ? 1 : 0
    return [cell, row.axes.inflection.marginDeltaYoy ?? -1e15, row.axes.price.rs20VsBenchmarkPct ?? -1e15]
  }
  const ranked = rows.filter((row) => row.eligible).sort((a, b) => {
    const aa = rankKey(a); const bb = rankKey(b)
    return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2] || String(a.asset).localeCompare(String(b.asset))
  }).map((row, index) => ({ ...row, rank: index + 1 }))
  /**
   * Starvation is a finding. A lane whose every exclusion is the same missing
   * input is not saying "nothing qualifies", it is saying it was never fed.
   *
   * ⚠️ **And *"unfed"* was as far as it went, which stopped being enough the
   * moment the branch had a feeding path to fail at** (#146). *The registry was
   * never requested*, *the registry answered and matched no roster symbol*,
   * *the vendor refused on quota*, *nothing was ever cached* and *the refresh
   * failed* all produced this one sentence, and they have five different fixes.
   * `radarFeedDiagnosis` computes which one it was; passing its answer in as
   * `feed` puts the stage and the cause on the diagnostic.
   *
   * ⛔ Not passing it is itself reported. A starved lane with no feed reading is
   * the run saying *I do not know why I am empty*, and that sentence has to be
   * visible rather than absent — this package's dominant failure is a missing
   * input coming back looking like an answer.
   */
  const feedStage = typeof feed?.stage === 'string' ? feed.stage : null
  const feedCause = typeof feed?.cause === 'string' ? feed.cause : null
  /**
   * ⚠️ **The header carries the count, because the header is what gets read**
   * (#178). `feedStage: 'fed'` on a branch that fed one name out of 83 is how
   * 82 never-fed names became «the market was reviewed and rejected», and the
   * fix is only worth anything where that sentence is formed. `null` when the
   * reading could not count — never a coverage nobody measured.
   */
  const feedCoverage = feed?.coverage && finite(feed.coverage.fed) && finite(feed.coverage.of) ? { fed: feed.coverage.fed, of: feed.coverage.of, unfed: feed.coverage.unfed ?? feed.coverage.of - feed.coverage.fed } : null
  const laneCoverage = Object.fromEntries(Object.keys(RADAR_LANES).map((lane) => {
    const verdicts = rows.map((row) => row.lanes[lane])
    const excluded = verdicts.filter((verdict) => !verdict.included)
    const reasons = {}
    for (const verdict of excluded) reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1
    const dominant = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] ?? null
    const starved = rows.length === 0 || Boolean(dominant && dominant[1] / rows.length >= 0.8 && /no-valid-point-in-time-filing|no-catalyst-registered|no-event-in-the-last-30-days/.test(dominant[0]))
    if (starved) {
      diagnostics.push(diagnostic(
        'radar_lane_starved',
        'unevaluated',
        feedCause && feedCoverage && feedStage === 'partially-fed'
          ? `This lane is unfed for ${feedCoverage.unfed} of ${feedCoverage.of} candidates and fed for ${feedCoverage.fed}; the exclusions below are not one answer about the market: ${feedCause}`
          : feedCause
            ? `This lane is unfed rather than empty, and the feed broke at the ${feedStage} stage: ${feedCause}`
            : 'This lane received no candidates or excluded almost every candidate for missing input; it is unfed rather than empty',
        'candidates',
        { lane, reason: dominant?.[0] ?? 'no-candidates-supplied', of: rows.length, feedStage, feedCause, ...(feedCoverage ? { feedCoverage } : {}) },
      ))
    }
    return [lane, { ruleVersion: RADAR_LANES[lane], included: verdicts.length - excluded.length, excluded: excluded.length, reasons, starved, feedStage, feedCause, feedCoverage }]
  }))
  const starvedLanes = Object.entries(laneCoverage).filter(([, row]) => row.starved).map(([lane]) => lane)
  if (starvedLanes.length && !feedCause) diagnostics.push(diagnostic('radar_starvation_cause_unreported', 'unevaluated', 'A lane starved and no feed reading was supplied, so this run can say that it is unfed but not what stage lost the input; pass radarFeedDiagnosis as feed', 'feed', { starvedLanes }))
  if (feedCause && !starvedLanes.length && feed?.fed === false) diagnostics.push(diagnostic('radar_feed_broken_lanes_passed', 'info', 'The feed reading says the branch was not fully fed while every lane evaluated; the lanes are answerable and the shortfall is still worth reporting', 'feed', { feedStage, feedCause, ...(feedCoverage ? { feedCoverage } : {}) }))
  /**
   * The same sentence the rows carry, once, for a reader holding the whole
   * answer rather than one row: these axes are computed and no lane, no
   * `eligible` and no rank reads them. An exemption nobody can see is the same
   * shape as a value nobody reads (#141), and this is that field for #170.
   */
  const reportedNotGatedAxes = ['valuation']
  return { data: { ranked, unranked: rows.filter((row) => !row.eligible), lanes: laneCoverage, starvedLanes, reportedNotGatedAxes, feed: feedCause ? { stage: feedStage, cause: feedCause, fed: feed?.fed ?? null, coverage: feedCoverage } : null, branch: 'fundamental-and-event', rankMeaning: 'research-priority-only' }, diagnostics }
}

/**
 * Field names that are the *body* of a source, not a summary of one.
 *
 * The rule this enforces is the one the issue states plainly: private memory
 * cites Evidence ids and never copies IR, news or consensus prose. Two things go
 * wrong when it does. The copy stops being the observation — nothing re-checks
 * it against the vendor, so a stale paragraph outlives the source it came from —
 * and the run that reads it can no longer say which Evidence its conclusion came
 * from, which is what §5 asks of every recorded fact.
 *
 * ⚠️ The length ceiling is the part that actually catches this in practice: a
 * pasted release does not usually arrive under a key called `articleBody`. It is
 * deliberately generous, because every legitimate value here is an aggregate — a
 * count, a metric, a status, a short label — and none of them is a paragraph.
 */
const SOURCE_TEXT_KEYS = new Set(['rawText', 'articleBody', 'filingText', 'transcript', 'consensusText', 'newsBody', 'pressRelease', 'sourceText'])
const MAX_MEMORY_STRING = 500

function copiedSourceText(value, path = 'value') {
  const found = []
  if (typeof value === 'string') {
    if (value.length > MAX_MEMORY_STRING) found.push({ path, reason: 'string-too-long' })
    return found
  }
  if (Array.isArray(value)) {
    for (const [index, row] of value.entries()) found.push(...copiedSourceText(row, `${path}[${index}]`))
    return found
  }
  if (value && typeof value === 'object') {
    for (const [key, row] of Object.entries(value)) {
      if (SOURCE_TEXT_KEYS.has(key)) found.push({ path: `${path}.${key}`, reason: 'source-body-key' })
      else found.push(...copiedSourceText(row, `${path}.${key}`))
    }
  }
  return found
}

export function validateMemory({ value, asOf, expectedSchemaVersion = 1 }) {
  const diagnostics = []
  if (!value || typeof value !== 'object' || value.schemaVersion !== expectedSchemaVersion || !MATURITY.has(value.status) || !Number.isFinite(Date.parse(value.updatedAsOf)) || Date.parse(value.updatedAsOf) > Date.parse(asOf)) {
    diagnostics.push(diagnostic('memory_value_ignored', 'unevaluated', 'Malformed, wrong-version or future memory is ignored', 'value'))
    return { data: { accepted: false, value: null }, diagnostics }
  }
  if (value.sampleCount !== undefined && (!Number.isInteger(value.sampleCount) || value.sampleCount < 0)) diagnostics.push(diagnostic('memory_sample_count_invalid', 'unevaluated', 'Invalid sampleCount makes memory unusable', 'value.sampleCount'))
  const identifiers = [...(value.decisionIds ?? []), ...(value.evidenceIds ?? [])]
  if (value.sampleCount > 0 && !identifiers.length) diagnostics.push(diagnostic('memory_provenance_missing', 'unevaluated', 'Learned state must trace to Decision/Evidence ids', 'value'))
  for (const copied of copiedSourceText(value)) {
    diagnostics.push(diagnostic('memory_raw_source_copied', 'blocked', 'Private memory references Evidence ids; it never carries the source text itself', copied.path, { reason: copied.reason }))
  }
  return { data: { accepted: diagnostics.length === 0, value: diagnostics.length ? null : value }, diagnostics }
}

/**
 * ⛔ `visibleMemoryRevision` was here, and it is gone (#212 ①).
 *
 * It answered *which revision may this run read* by filtering rows on
 * `instanceId`, `key`, `writtenAsOf <= asOf` — and on `model`. Every one of
 * those four is the host's answer already: private memory is namespaced by
 * manager **instance** and another instance's is refused by name
 * (`cross-namespace-private-memory`), and the run's `asOf` pin governs what a
 * payload may carry. So this was a second answer to a question that already had
 * one, and a second answer is only ever as good as the day it was written.
 * ⚠️ Since aumos#743 the record is a folder read with `files_read` and the
 * namespace is the folder, which is the same answer under a wider address.
 *
 * ⚠️ **It had already drifted, and in the direction that loses memory.** The
 * host keys the private record by instance **alone** — a model or vendor swap,
 * an in-place package update and a config change all keep it, which is what
 * `MEMORY_LIFETIME` on `memory_read`/`memory_write` promised, what the file
 * tools' own descriptions promise since aumos#743, and what
 * `skills/memory-contract/SKILL.md` §Isolation tells a run to expect. The
 * `row.model === model` clause said the opposite: measured on
 * `fixtures/memory-contract.json`, swapping the model on the same instance
 * turned revision 2 into `null`. A run composing it would have read *no prior
 * learning* on the first run after a model change and written its baseline
 * again from zero.
 *
 * ⛔ **No legacy adapter, and that is a measurement rather than a preference.**
 * This package never persisted revisions itself — rows arrive from the host,
 * whose table has no model column to have written one — so there is no old
 * shape for an adapter to translate. An adapter here would be a permanent
 * second path guarding nothing, which is the thing §212 asks to stop.
 *
 * ⚠️ **`model` left the input vocabulary with it.** It was the only operation
 * that named `model` as an input key, and `verify-evidence-gated-allocator.mjs`
 * now asserts that no registered operation names it again — the way this clause
 * came back would be quietly, one operation at a time.
 */

export function migrationMap({ records = [], cutoverAt, schemaVersion = 1 }) {
  const diagnostics = []
  if (!Number.isFinite(Date.parse(cutoverAt))) diagnostics.push(diagnostic('migration_cutover_invalid', 'blocked', 'A cutover timestamp is required', 'cutoverAt'))
  const destinations = { thesis: [], brief: [], watch: [], evidence: [], memory: [] }
  const seen = new Set()
  for (const [index, row] of records.entries()) {
    if (!row?.legacyId || seen.has(row.legacyId)) {
      diagnostics.push(diagnostic('migration_record_duplicate', 'blocked', 'Each legacy record must have one stable id', `records[${index}].legacyId`))
      continue
    }
    seen.add(row.legacyId)
    const destination = row.kind === 'asset-claim' ? 'thesis' : row.kind === 'book-conclusion' ? 'brief' : row.kind === 'live-gate' ? 'watch' : row.kind === 'raw-evidence' ? 'evidence' : row.kind === 'aggregate-learning' ? 'memory' : null
    if (!destination) diagnostics.push(diagnostic('migration_owner_unknown', 'blocked', 'Legacy record has no canonical Aumos owner', `records[${index}].kind`))
    else destinations[destination].push({ ...row, importedAt: cutoverAt })
  }
  return { data: { destinations, marker: { key: 'migration/schema-version', schemaVersion, cutoverAt }, backfillForwardTrackRecord: false, legacyModeAfterCutover: 'read-only' }, diagnostics }
}

const EXIT_SEVERITY = { stop_loss: 0, target_full: 0, trailing_stop: 0, time_stop: 0.2, trim: 1, thesis_invalidation: 1.5, trim_approach: 2, review: 3, thesis_review: 3.5 }
const FULL_EXIT_KINDS = new Set(['stop_loss', 'target_full', 'trailing_stop', 'time_stop'])

/**
 * L2.5 — the sell-side watch, which had become a post-hoc measurement.
 *
 * `MIGRATION.md` maps `exit-check` to "SELL/TRIM/REVIEW diagnostics, preserving
 * price and fundamental invalidation", and the `exit` coverage group named
 * `forward-outcome`, `mfe-mae` and `failure-taxonomy` — three functions in
 * `outcomes.mjs` that score a position after it closed. Attribution is not a
 * watch. A thesis that breaks on fundamentals while price sits above the stop
 * had nothing looking at it until the next scheduled review.
 *
 * Two lanes run in parallel and neither one overrides the other, which is the
 * whole point of the design this is ported from:
 *
 * - **price** — stop, trim ladder, take-profit target, trailing stop, and the
 *   time stop (the review date arrived and the position never got above its
 *   entry, so the thesis had its window);
 * - **fundamental** — `thesisSentinel`'s verdict and the sidecar deadlines:
 *   horizon end, a catalyst window that closed without the catalyst, an
 *   invalidation trigger whose own check-by date passed.
 *
 * ⛔ Every verdict is a *candidate*, never an order. Nothing here sizes, sells
 * or bypasses the per-order approval Aumos owns; a `SELL` here is an input to a
 * proposal the investor still approves one order at a time.
 *
 * A trim level set weeks ago can be stale by the time price reaches it, so
 * approaching one within 5% raises `trim_approach` — re-validate the ladder's
 * premise before it fires (approved 2026-07-11, L2.5c). It is advisory: the
 * change it argues for is a rule proposal, never an automatic edit.
 */
export function exitCheck({ symbol = null, price, rules = {}, thesis = {}, sentinel = null, asOf } = {}) {
  const diagnostics = []
  const findings = []
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : null
  const past = (day) => typeof day === 'string' && today !== null && day.slice(0, 10) <= today
  const add = (kind, message, detail = {}) => findings.push({ kind, symbol, message, ...detail })

  if (!finite(price)) {
    diagnostics.push(diagnostic('exit_price_unevaluated', 'unevaluated', 'Without a current price the price lane is unread; the fundamental lane still runs', 'price'))
  } else {
    const { stop, target, trailPct, peak, entry, reviewBy, trims = [] } = rules
    if (finite(stop) && price <= stop) add('stop_loss', 'Price is at or below the stop; a full exit is the candidate', { level: stop, price })
    if (finite(target) && price >= target) add('target_full', 'Price reached the take-profit target', { level: target, price })
    if (finite(trailPct) && finite(peak)) {
      const trigger = peak * (1 - trailPct)
      if (price <= trigger) add('trailing_stop', 'Price is at or below the trailing stop', { level: round(trigger), price, peak })
    }
    for (const trim of trims) {
      if (!finite(trim?.price) || trim?.fired) continue
      if (price >= trim.price) add('trim', 'Price reached a trim rung', { level: trim.price, sellPct: trim.sellPct ?? null, price })
      else if (price >= trim.price * 0.95) add('trim_approach', 'Price is within 5% of a trim rung; re-validate the ladder before it fires', { level: trim.price, sellPct: trim.sellPct ?? null, price })
    }
    if (reviewBy && past(reviewBy)) {
      /**
       * A calendar reminder and a thesis that had its window are different
       * findings. "Never got above entry" is the narrow, stated proxy for the
       * second — the benchmark-since-entry comparison the thesis text really
       * asks for needs an entry date this input does not carry.
       */
      if (finite(entry) && price <= entry) add('time_stop', 'The review date arrived and the position never got above entry; it is an exit candidate', { level: entry, price, reviewBy, proxy: 'at-or-below-entry' })
      else add('review', 'The review date arrived; the thesis needs eyes, not necessarily an exit', { reviewBy })
    }
  }

  for (const trigger of thesis?.invalidationTriggers ?? []) {
    if (trigger?.status && trigger.status !== 'open') continue
    const kind = trigger?.kind
    const fired = finite(price) && finite(trigger?.level) &&
      ((kind === 'price-below' && price <= trigger.level) || (kind === 'price-above' && price >= trigger.level))
    if (fired) add('thesis_invalidation', 'A thesis invalidation trigger is met; the claim must be re-verified before anything else', { triggerId: trigger.id ?? null, level: trigger.level, price })
    else if (past(trigger?.checkBy)) add('thesis_review', 'An invalidation trigger passed its own check-by date without being evaluated', { triggerId: trigger.id ?? null, checkBy: trigger.checkBy })
  }
  if (past(thesis?.horizonEnd)) add('thesis_review', 'The thesis horizon ended; score it and record a hold/add/trim/exit checkpoint', { horizonEnd: thesis.horizonEnd })
  for (const catalyst of thesis?.catalysts ?? []) {
    if (catalyst?.occurred === undefined || catalyst?.occurred === null) {
      if (past(catalyst?.windowEnd)) add('thesis_review', 'A catalyst window closed without the catalyst being scored', { event: catalyst.event ?? null, windowEnd: catalyst.windowEnd })
    }
  }
  /**
   * The fundamental lane's own verdict. `threatened` is a review candidate on
   * its own — the price lane may be silent precisely because the market has not
   * priced what the filing already says.
   */
  if (sentinel?.verdict === 'threatened') add('thesis_review', 'The fundamental sentinel reads threatened; bring the review forward rather than waiting for price', { verdict: sentinel.verdict })
  if (sentinel?.escalationRequired) {
    diagnostics.push(diagnostic('sentinel_escalation_pending', 'blocked', 'A repeated threatened verdict requires an explicit resize, exit or deadline decision in this run', 'sentinel'))
  }

  findings.sort((a, b) => (EXIT_SEVERITY[a.kind] ?? 9) - (EXIT_SEVERITY[b.kind] ?? 9))
  const kinds = new Set(findings.map((row) => row.kind))
  const action = [...kinds].some((kind) => FULL_EXIT_KINDS.has(kind)) || kinds.has('thesis_invalidation')
    ? 'SELL'
    : kinds.has('trim')
      ? 'TRIM'
      : kinds.has('review') || kinds.has('thesis_review') || kinds.has('trim_approach')
        ? 'REVIEW'
        : 'NONE'
  if (action !== 'NONE') {
    diagnostics.push(diagnostic('exit_candidate', action === 'REVIEW' ? 'info' : 'unevaluated', `Exit watch raised a ${action} candidate; it is an input to a proposal, never an order`, 'rules', { action, kinds: [...kinds] }))
  }
  return { data: { symbol, action, findings, priceLaneRead: finite(price), candidateOnly: true }, diagnostics }
}
