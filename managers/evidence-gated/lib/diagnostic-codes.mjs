/**
 * ── One table, because the vocabulary was being spelled twice (issue #171) ──
 *
 * `mandateExecution` answers the question *«why does this book hold no single
 * name?»* by intersecting the diagnostics this run's other operations already
 * returned with a list of codes. That list was written out by hand beside the
 * operation that reads it, and the operations that **emit** the codes were
 * written somewhere else — so the two drifted, and the drift was invisible
 * because a code that matches nothing simply does not match.
 *
 * ⚠️ **It reversed the answer on a real run.** (`run_73a3e6c41c204f468ee8be8d29
 * 23d898`, asOf 2026-09-07) The run reported `corp_code_unmapped_symbols`,
 * `radar_lane_starved` and `lane_query_failed` — three stages that lost an
 * input — and the hand-written list was looking for `corp_code_mapping_pending`
 * and `radar_feed_produced_nothing`. Nothing intersected, and the operation
 * concluded `no-candidate-cleared-the-gates` / `info`: *the methodology is
 * working*. The book's own memory has recorded
 * `vocabularies-diverge-between-operations-with-no-shared-registry` five times
 * before this one; this was the first time it flipped a verdict.
 *
 * So the vocabulary lives here, once, and every consumer projects it. There is
 * no second list to keep in step — `INPUT_PATH_INCOMPLETE_CODES` and
 * `CAUSE_UNRESOLVED_CODES` in `sizing.mjs` are `lane()` calls over these rows.
 *
 * ⛔ **The declined alternative was importing a constant at every emission
 * site.** It would put the string in exactly one place, and it would also take
 * the code literal out of 26 `diagnostic('…')` calls — the form every one of
 * this package's other ~300 codes is written in, and the form a reader greps
 * for when a run reports a code they have not seen. What is done instead is
 * that `module` names the file that must emit the row, and
 * `tools/verify-evidence-gated-diagnostic-codes.mjs` reads that file and fails
 * if it does not: the spelling is proven rather than shared, and a rename that
 * touches one side is a red build rather than a silent reclassification.
 *
 * ── The three lanes ────────────────────────────────────────────────────────
 *
 * `input-path` — **a stage that lost an input.** The roster, the corp-code
 * join, the vendor status, the source cache, the lane preflight, the discovery
 * denominator, and the one valuation gap that names a source which exists and
 * was never called. A run carrying any of these has an empty lane it cannot
 * claim to have judged.
 *
 * ⛔ Codes from the sizing and lens gates never belong here. A thesis that did
 * not clear its challenge is a *judgement* the methodology made, and a run that
 * filed it under "the wiring is unfinished" would be excusing its own verdict.
 *
 * `unresolved` — **codes that refuse both conclusions.** `instrument_class_unk
 * nown` says the run could not establish whether a filer exists at all. ⛔
 * Unknown is not "incomplete", and it is not "the gates ran and found nothing"
 * either; it demotes the answer to `unreported` without claiming the wiring is
 * at fault. (#166)
 *
 * ── ⛔ The third lane is deleted, and what replaced it (#212 ④) ────────────
 *
 * `gate-ran` was #171's answer to `info` being the *default*: the positive claim
 * had to be earned by a code from a gate that ran and refused — an expected
 * active return under the gate, a challenge not cleared, a thesis still
 * incomplete, a gap no source can close for this instrument.
 *
 * ⚠️ **One refused candidate is not a judged roster.** `active_return_below_gate`
 * says a gate refused **one** name; it says nothing about whether the other
 * seventy-three were prepared at all, so a run blind across its whole universe
 * could emit it once and be told the methodology was working. That is
 * `untilled/aumos-catalogue#209`'s error reached through #171's own check.
 *
 * So the positive claim is earned by a **counted record** now — `executionRecord`
 * over the host's research job and result (`aumos#724`, `#730`), requiring
 * `dataPreparation: 'prepared'`, `candidateEvaluation: 'evaluated'` and
 * `eligibleCount === 0`. The four rows that lane held are unregistered: they are
 * still emitted, still explain *why* a candidate was refused, and no longer
 * grant anything. `README.md` carries the deleted-to-replacement pairing.
 *
 * ⚠️ A code that is in **neither** lane counts for nothing, and a run whose
 * every reported code is unregistered is `unreported`: it has told this
 * operation nothing it can read. That is the safe side, and it is the half of
 * #171 that stays.
 */

/** `input-path` · `unresolved` — see above. */
export const CAUSE_LANES = Object.freeze(['input-path', 'unresolved'])

/**
 * Every row: the code, the operation that emits it, the module the verifier
 * reads to prove it, and the lane `mandateExecution` reads it in.
 *
 * ⚠️ `operation` is the name `execute` dispatches — the verifier checks it
 * against the live operation table, so an operation renamed out from under a
 * row fails the build rather than leaving a code nobody can produce.
 */
export const CAUSE_CODE_REGISTRY = Object.freeze([
  /* ── the feeding path: roster → join → vendor → cache ────────────────── */
  { code: 'corp_code_mapping_empty', operation: 'mapCorporationCodes', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'corp_code_mapping_pending', operation: 'fundamentalsPlan', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'corp_code_registry_absent', operation: 'mapCorporationCodes', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  /**
   * ⚠️ The one the 2026-09-07 run actually emitted. It is `info` at its own
   * site — the registry answered and matched *most* of the roster — and it is
   * still an input-path finding here: every name on `unmapped` is a name the
   * branch cannot address, and a lane that is empty of them is empty for want
   * of a join, not for want of merit.
   */
  { code: 'corp_code_unmapped_symbols', operation: 'mapCorporationCodes', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'dart_status_missing', operation: 'dartVendorStatus', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'dart_status_unknown', operation: 'dartVendorStatus', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'feed_universe_empty', operation: 'fundamentalsPlan', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'source_cache_never_fetched', operation: 'fundamentalsPlan', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'source_cache_refresh_failed', operation: 'fundamentalsPlan', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'source_cache_state_unknown', operation: 'fundamentalsPlan', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'source_cache_unreported', operation: 'fundamentalsPlan', module: 'fundamentals-feed.mjs', lane: 'input-path' },

  /* ── the radar, at both ends of the same wire ────────────────────────── */
  { code: 'radar_feed_broken', operation: 'radarFeedDiagnosis', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  { code: 'radar_feed_produced_nothing', operation: 'radarCandidates', module: 'fundamentals-feed.mjs', lane: 'input-path' },
  /**
   * ⚠️ `upsideRadar`'s own word for it, and the one the list was missing.
   * *"Unfed rather than empty"* is the whole distinction this operation exists
   * to read, and it was spelled `radar_feed_produced_nothing` on the reading
   * side — a code a different operation emits, in a different module.
   */
  { code: 'radar_lane_starved', operation: 'upsideRadar', module: 'methodology.mjs', lane: 'input-path' },

  /**
   * ── the axis with no producer (#169) ─────────────────────────────────
   *
   * ⚠️ **`input-path`, and the lane choice is the judgement.** `upsideRadar`
   * excludes a name with no catalyst window under
   * `no-catalyst-registered-within-60-days` and one with no event record under
   * `no-event-in-the-last-30-days`, and both sentences read as findings about
   * the company. Measured on `run_73a3e6c41c204f468ee8be8d2923d898`: 83 of 83
   * names excluded from `post-event-continuation`, and the single name that
   * cleared every filing test excluded from `inflection` — while nothing in
   * the package had ever produced either input. That is a stage that lost an
   * input, exactly as `radar_lane_starved` is one axis over.
   *
   * ⛔ Two rows and not one, because the two have different producers: a
   * catalyst window comes from web research filed through `observation_file`,
   * an event record from the broker's corporate-actions route. A run told only
   * that «the axis is unfed» cannot tell which door to open.
   *
   * ⛔ Neither is raised by a name that was researched and genuinely has
   * nothing scheduled — that is the `never-fed` ⇄ `fed-and-genuinely-empty`
   * distinction, and `catalystRegister` counts the two separately.
   */
  { code: 'catalyst_window_unresearched', operation: 'catalystRegister', module: 'catalysts.mjs', lane: 'input-path' },
  { code: 'event_record_unresearched', operation: 'catalystRegister', module: 'catalysts.mjs', lane: 'input-path' },

  /* ── the research lanes ──────────────────────────────────────────────── */
  { code: 'lane_not_queried', operation: 'laneCoverage', module: 'source-parsers.mjs', lane: 'input-path' },
  { code: 'lane_query_failed', operation: 'laneCoverage', module: 'source-parsers.mjs', lane: 'input-path' },
  { code: 'lane_source_blocked', operation: 'laneCoverage', module: 'source-parsers.mjs', lane: 'input-path' },

  /* ── discovery ───────────────────────────────────────────────────────── */
  { code: 'discovery_lane_dark', operation: 'discoveryCapacity', module: 'coverage.mjs', lane: 'input-path' },

  /* ── the valuation gap, read three ways (#166) ───────────────────────── */
  { code: 'valuation_gap_is_unfetched_not_unfillable', operation: 'thesisGapSources', module: 'valuation.mjs', lane: 'input-path' },
  { code: 'instrument_class_disputed', operation: 'thesisGapSources', module: 'valuation.mjs', lane: 'unresolved' },
  { code: 'instrument_class_unknown', operation: 'thesisGapSources', module: 'valuation.mjs', lane: 'unresolved' },

  /* ── the budget that could not be paid for (#174) ─────────────────────── */
  /**
   * ⚠️ **`unresolved`, and the lane choice is the whole judgement here.**
   * A sleeve whose budget cannot be procured in the currency it settles in is a
   * real reason a book holds no single name — and it is neither of the other
   * two answers. It is not `input-path`: the candidate path is intact, nothing
   * upstream lost a roster or a filing, and filing it there would promise a fix
   * that fetching cannot deliver. And it is emphatically not evidence for *the
   * methodology is working* — that is a positive claim, and a run that never
   * had the dollars did not establish it. What it does is forbid the `info`
   * answer, which is exactly what this lane is for.
   *
   * ⛔ Neither row makes the operation say the wiring is at fault, and neither
   * blocks anything at its own site: converting currency is a legitimate move.
   */
  { code: 'sleeve_budget_not_fundable_in_currency', operation: 'specialistBudget', module: 'sizing.mjs', lane: 'unresolved' },
  { code: 'sleeve_budget_fundability_unevaluated', operation: 'specialistBudget', module: 'sizing.mjs', lane: 'unresolved' },
])

/** The codes of one lane, sorted, frozen — the only way a consumer gets a list. */
export function causeCodesInLane(lane) {
  return Object.freeze(CAUSE_CODE_REGISTRY.filter((row) => row.lane === lane).map((row) => row.code).sort())
}

/** Every registered code, whatever its lane: the set «this operation can read». */
export const REGISTERED_CAUSE_CODES = Object.freeze(CAUSE_CODE_REGISTRY.map((row) => row.code).sort())
