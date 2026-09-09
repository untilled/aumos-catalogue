import { diagnostic } from './diagnostics.mjs'
import { validateThesis, variantViewCheck } from './methodology.mjs'

/**
 * ── The stage that carries one candidate to a document (issue #243) ────────
 *
 * The four gates that open a real-money position — `thesisComplete`,
 * `variantView`, `consensusRefs`, `challengeCleared` — have been in this
 * package since #226, and `variantViewCheck` judges them. What was never here
 * is the **stage that produces the thing they judge.**
 *
 * Measured on `run_bb689b6199084b04afd8b0e1d1528cda` (2026-09-09). The price
 * branch was fed and evaluated on both markets — KR 74 of 74, US 83 of 83,
 * `unprepared` 0 — and produced 17 eligible KR candidates and 25 US. Four were
 * pushed as far as `variantViewCheck`:
 *
 * | candidate | `variantViewCheck` | outstanding |
 * |---|---|---|
 * | `267260` | **1 of 4** | `thesisComplete`, `variantView`, `challengeCleared` |
 * | `NKE`    | 3 of 4 | `challengeCleared` (`conditional_watch`) |
 * | `LOW`    | 2 of 4 | `thesisComplete`, `challengeCleared` |
 * | `MCD`    | — | blocked earlier by `entry_quality_falling_knife` |
 *
 * 157 names screened, four touched, all four declined, **nothing registered**.
 *
 * ⛔ **The gates are not too strict, and the evidence for that is the one
 * result this methodology has.** The ported original — `theses/036460_KOGAS.md`,
 * +18.6pp, the thesis `INCIDENTS.md` cites — satisfied all four **by hand**: a
 * named «the market discounts X / our differentiated view is Y» section, four
 * `consensusRefs` rows each carrying `metric`, `period`, `value`, `currency`,
 * `source_url` and `captured_at`, one dated challenge cross-check, and
 * bear/base/bull with a probability-weighted return, a hard stop and a review
 * date. One name, deeply, every artefact, small.
 *
 * ── What this operation is, and what it deliberately is not ────────────────
 *
 * ⛔ **It is not a fifth gate and it does not judge a candidate.** It reads
 * whether the **stage ran**: for each name `candidateQueue` said this run owes a
 * document for, is there a document, and does it name that name. The judgement
 * of the document is `variantViewCheck`'s, which this calls rather than
 * reimplements — so there is exactly one answer in this package to «is the
 * variant view established», and it is not one this file can disagree with.
 *
 * ⚠️ **A rejection is owed the document too, and that is the whole finding.**
 * `267260` was declined correctly — the consensus was 19 buy / 0 sell, so there
 * was no view to differ from — but the answer the run published for it was
 * `1 of 4`, and *«1 of 4»* does not read as «judged and declined». It reads as
 * «there was nothing to judge». Those are two different states of this book and
 * only one of them is evidence that the methodology ran, which is why
 * `candidate_completion_absent` is an `input-path` cause in
 * `CAUSE_CODE_REGISTRY`: a run carrying it has a lane it **cannot claim to have
 * judged**, exactly as one carrying `catalyst_producer_absent` does. ⛔ It is
 * emphatically not a gate's own finding — `challenge_not_cleared` and
 * `thesis_incomplete` are judgements this methodology made and are registered
 * nowhere, and a run filing its own verdict under "the wiring is unfinished"
 * would be excusing it.
 *
 * ⚠️ **`unevaluated` at this site, not `blocked`.** A run may honestly reach
 * `WAIT` with every document written and every candidate declined, and blocking
 * would refuse the run rather than the claim. What the lane does instead is
 * withdraw the positive answer: `mandateExecution` may no longer report
 * `no-candidate-cleared-the-gates`, which is the sentence the measured run
 * published while four candidates sat unfinished.
 */
export function candidateCompletion({ owesDocument = [], records = [], asOf = null } = {}) {
  const diagnostics = []
  const owed = (Array.isArray(owesDocument) ? owesDocument : []).filter((row) => row && typeof row === 'object')
  const written = (Array.isArray(records) ? records : []).filter((row) => row && typeof row === 'object')

  /**
   * ⚠️ Matched on the symbol, and on the market **only when both sides name
   * one**. A document is addressed to a company; a run that recorded the market
   * one way on the queue and another on the record has not written a second
   * document, and refusing the match would report the stage as never run.
   */
  const recordFor = (row) => written.find((record) =>
    String(record.symbol ?? '') === String(row.symbol ?? '')
    && (!record.market || !row.market || String(record.market) === String(row.market)))

  const completed = []
  const absent = []
  for (const row of owed) {
    const record = recordFor(row)
    if (!record) {
      absent.push({ symbol: row.symbol ?? null, market: row.market ?? null, lens: row.lens ?? null })
      continue
    }
    const thesis = record.thesis && typeof record.thesis === 'object' ? record.thesis : null
    const check = variantViewCheck({
      thesis,
      challengeVerdict: record.challengeVerdict ?? null,
      evidenceSamples: Array.isArray(record.evidenceSamples) ? record.evidenceSamples : [],
      asOf,
    })
    const thesisReport = thesis ? validateThesis(thesis) : null
    completed.push({
      symbol: row.symbol ?? null,
      market: row.market ?? null,
      lens: row.lens ?? null,
      /** ⚠️ What the run concluded, carried verbatim and never interpreted: a decline is an outcome of the stage, not a failure of it. */
      verdict: typeof record.verdict === 'string' ? record.verdict : null,
      satisfied: check.data?.satisfied ?? [],
      missing: check.data?.missing ?? [],
      requirementsMet: (check.data?.satisfied ?? []).length,
      /** The gaps under `thesisComplete`, so «3 of 4» names what the fourth is waiting on rather than restating itself. */
      thesisGaps: thesisReport?.data?.gaps ?? null,
    })
  }

  if (absent.length > 0) {
    diagnostics.push(diagnostic(
      'candidate_completion_absent',
      'unevaluated',
      'This run owed a completed candidate record for the top candidate of these lenses and none was written; a lane whose leading candidate reached no document is a lane this run cannot claim to have judged, whether or not it also declined the name',
      'records',
      { candidates: absent },
    ))
  }

  return {
    data: {
      owed: owed.length,
      documented: completed.length,
      /** ⚠️ Reported apart, because they are two sentences: judged-and-declined, and never carried to a document. */
      completed,
      absent,
      lenses: [...new Set(owed.map((row) => row.lens).filter((lens) => typeof lens === 'string'))].sort(),
      stageRan: owed.length > 0 && absent.length === 0,
    },
    diagnostics,
  }
}
