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
 * `gate-ran` — **the positive evidence for `no-candidate-cleared-the-gates`.**
 * This lane is new with #171 and it exists because `info` was the *default*:
 * any set of codes that matched nothing fell through to *the methodology is
 * working*, which is the one answer in this operation that asserts something.
 * It has to be earned. A gate that ran and refused a candidate — an expected
 * active return under the gate, a challenge not cleared, a thesis still
 * incomplete, a gap no source can close for this instrument — is what earns it.
 *
 * ⚠️ A code that is in **none** of the three lanes counts for nothing, and a
 * run whose every reported code is unregistered is `unreported`: it has told
 * this operation nothing it can read. That is the safe side. The unsafe side is
 * the behaviour this file replaces.
 */

/** `input-path` · `unresolved` · `gate-ran` — see above. */
export const CAUSE_LANES = Object.freeze(['input-path', 'unresolved', 'gate-ran'])

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
  /**
   * ⛔ An index ETF publishes no statements, so this gap stays open however
   * well the wiring works — filing it as unfinished wiring would promise a fix
   * no fetch can deliver. It is a fact the run established, so it earns the
   * `info` answer rather than removing it.
   */
  { code: 'valuation_gap_has_no_source_for_this_instrument', operation: 'thesisGapSources', module: 'valuation.mjs', lane: 'gate-ran' },

  /* ── gates that ran and refused ──────────────────────────────────────── */
  { code: 'active_return_below_gate', operation: 'researchGate', module: 'evidence.mjs', lane: 'gate-ran' },
  { code: 'challenge_not_cleared', operation: 'researchGate', module: 'evidence.mjs', lane: 'gate-ran' },
  { code: 'thesis_incomplete', operation: 'validateThesis', module: 'methodology.mjs', lane: 'gate-ran' },
])

/** The codes of one lane, sorted, frozen — the only way a consumer gets a list. */
export function causeCodesInLane(lane) {
  return Object.freeze(CAUSE_CODE_REGISTRY.filter((row) => row.lane === lane).map((row) => row.code).sort())
}

/** Every registered code, whatever its lane: the set «this operation can read». */
export const REGISTERED_CAUSE_CODES = Object.freeze(CAUSE_CODE_REGISTRY.map((row) => row.code).sort())
