/**
 * ── What the run actually did, recorded rather than inferred (issue #212 ④) ─
 *
 * `mandateExecution` answers *«why does this book hold no single name?»*, and
 * until this operation it answered it by **intersecting diagnostic strings with
 * a classification table**. Three of the four answers were decided that way,
 * and the positive one — `no-candidate-cleared-the-gates`, *the gates ran, on
 * their inputs, and nothing was worth owning* — was earned by the presence of a
 * code in the `gate-ran` lane. That is state read off prose-adjacent artifacts:
 * the code says a gate refused **one** candidate and nothing anywhere said
 * whether the roster had been prepared at all.
 *
 * ⚠️ **The measured failure is `untilled/aumos-catalogue#209`'s own.** A roster
 * nobody collected a price series for comes back evaluated-with-no-data on every
 * row; one gate then refuses one name, emits `active_return_below_gate`, and the
 * old rule read that single code as evidence that the whole roster had been
 * judged. *Blindness reported as an absence of opportunity* is the error #209 is
 * named after, and the classification table could not tell the two apart because
 * **no input to it counted anything.**
 *
 * ── What replaced it ───────────────────────────────────────────────────────
 *
 * `untilled/aumos#724` and `#730` gave the host a research job and a research
 * result that count. `research_job_get` carries `counts` — `total`, `pending`,
 * `evaluated`, `unprepared`, `failed` — and the symbols behind each;
 * `research_result_get` carries a settled `summary` — `sourced`, `evaluated`,
 * `unprepared`, `failed`, `unpreparedSymbols`, `failedSymbols`. This operation
 * reads those, exactly as the host wrote them, and answers three facts:
 *
 *   1. `dataPreparation` — did the roster get prepared, and how far.
 *   2. `candidateEvaluation` — did the recipe answer for anything.
 *   3. `eligibleCount` — how many of the answers cleared this package's gates.
 *
 * ⛔ **The three counts are three reports and are never summed** — the host's own
 * rule, kept verbatim here because folding `unprepared` into `evaluated` is the
 * mistake, one layer up, that #209 asks to design out.
 *
 * ── ⛔ `sourced` is absent from the `items` basis, and that is the host's rule ─
 *
 * A settled summary derives `sourced` as *items − gaps*, which is only true once
 * every item has been attempted. Deriving it mid-flight counts *not looked at
 * yet* as *sourced*, and the number falls as the job progresses — a count that
 * goes down is a count a reader stops trusting. So the field simply is not there
 * on an unsettled job, the way `services/kernel-host/src/research-counts.ts`
 * leaves it out.
 *
 * ── ⚠️ `eligibleCount` is this package's number and not the host's ──────────
 *
 * Eligibility is a methodology verdict — which of the recipe's answers cleared
 * the lens envelopes, the evidence gates and the challenge — so no host field
 * carries it and none should. It arrives here as **`eligibleSymbols`**, the names
 * the run's own fold (`opportunityUniverse` over the result rows, then the
 * evidence gates) arrived at, and the count is derived from them rather than
 * typed. A number a run can type is a number a run can invent; a list of names
 * is checkable and its length is arithmetic.
 *
 * ⛔ **Absent is `null`, and `[]` is `0`.** «Nobody folded the rows» and «the
 * rows were folded and nothing cleared» are different facts and the second is a
 * measurement. That is the same three-way split the host's `basis` keeps
 * (`result` · `items` · `none`, where `none` is *not* zero) and the same rule
 * `cash_floor_unevaluated` has always followed here.
 *
 * ⛔ **Nothing in this file reads a diagnostic.** Diagnostics stay exactly where
 * they were and keep saying **why** — which stage lost which input — and this
 * operation says **what happened**. The two are different questions and #212 ④
 * is about which one decides the verdict.
 */
import { diagnostic } from './diagnostics.mjs'

/** ⚠️ `unevaluated` is «no record», `unprepared` is «the record says nothing was readable». */
export const DATA_PREPARATION_STATES = Object.freeze(['prepared', 'partial', 'unprepared', 'unsettled', 'unevaluated'])

/** The same three-way split one field over: absent, in flight, measured. */
export const CANDIDATE_EVALUATION_STATES = Object.freeze(['evaluated', 'none', 'unsettled', 'unevaluated'])

/** The host's own word for where a count came from — `none` is not zero. */
export const EXECUTION_RECORD_BASES = Object.freeze(['result', 'items', 'none'])

/** `named` — a list was folded, whatever its length. `unreported` — nobody folded. */
export const ELIGIBLE_BASES = Object.freeze(['named', 'unreported'])

const wholeNumber = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0

const symbolList = (value) => (Array.isArray(value)
  ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 32))]
  : null)

/**
 * The settled summary, whichever of the two tools carried it.
 *
 * ⚠️ **`research_prepare` carries one too, on a cache hit.** `cached: true`
 * comes back with `summary` and no job to poll, so a run that never called
 * `research_job_get` still has a settled record — and reading only `result`
 * would tell that run it had prepared nothing.
 */
function settledSummary(prepared, result) {
  const fromResult = result?.summary
  if (fromResult && typeof fromResult === 'object') return { summary: fromResult, resultRef: typeof result?.resultRef === 'string' ? result.resultRef : null }
  const fromPrepared = prepared?.summary
  if (fromPrepared && typeof fromPrepared === 'object') return { summary: fromPrepared, resultRef: typeof prepared?.resultRef === 'string' ? prepared.resultRef : null }
  return null
}

export function executionRecord({ prepared = null, job = null, result = null, eligibleSymbols = undefined } = {}) {
  const diagnostics = []
  const settled = settledSummary(prepared, result)
  const counts = job?.counts

  let basis = 'none'
  /** ⛔ `sourced` stays `null` unless a settled summary named it — see the header. */
  let read = { total: null, pending: null, sourced: null, evaluated: null, unprepared: null, failed: null }
  let unpreparedSymbols = []
  let failedSymbols = []
  let pendingSymbols = []

  if (settled !== null) {
    const summary = settled.summary
    if (!['sourced', 'evaluated', 'unprepared', 'failed'].every((key) => wholeNumber(summary[key]))) {
      diagnostics.push(diagnostic(
        'research_record_unreadable',
        'unevaluated',
        'A research summary carries `sourced`, `evaluated`, `unprepared` and `failed` as whole counts; this one does not, so nothing about this run’s preparation can be recorded from it. ⛔ Hand back what `research_result_get` returned, verbatim — a paraphrase of it is not a record',
        'result.summary',
        { summary },
      ))
    } else {
      basis = 'result'
      read = {
        total: summary.sourced + summary.unprepared,
        pending: 0,
        sourced: summary.sourced,
        evaluated: summary.evaluated,
        unprepared: summary.unprepared,
        failed: summary.failed,
      }
      unpreparedSymbols = symbolList(summary.unpreparedSymbols) ?? []
      failedSymbols = symbolList(summary.failedSymbols) ?? []
    }
  } else if (counts && typeof counts === 'object') {
    if (!['total', 'pending', 'evaluated', 'unprepared', 'failed'].every((key) => wholeNumber(counts[key]))) {
      diagnostics.push(diagnostic(
        'research_record_unreadable',
        'unevaluated',
        'A research job carries `total`, `pending`, `evaluated`, `unprepared` and `failed` as whole counts; this one does not. ⛔ Hand back what `research_job_get` returned, verbatim',
        'job.counts',
        { counts },
      ))
    } else {
      basis = 'items'
      read = { total: counts.total, pending: counts.pending, sourced: null, evaluated: counts.evaluated, unprepared: counts.unprepared, failed: counts.failed }
      unpreparedSymbols = symbolList(job?.unpreparedSymbols) ?? []
      failedSymbols = symbolList((job?.failures ?? []).map((row) => row?.symbol)) ?? []
      pendingSymbols = symbolList(job?.pendingSymbols) ?? []
    }
  }

  /**
   * ⛔ **`unsettled` rather than `in-flight`.** A cancelled job also has item
   * rows and no result, and calling that «in flight» would say a job is running
   * that has stopped. What both share is the only thing this operation needs:
   * no settled result exists, so these counts are *so far* and not an answer.
   */
  const dataPreparation = basis === 'none'
    ? 'unevaluated'
    : basis === 'items'
      ? 'unsettled'
      : read.evaluated === 0
        ? 'unprepared'
        : read.unprepared > 0 || read.failed > 0
          ? 'partial'
          : 'prepared'

  const candidateEvaluation = basis === 'none'
    ? 'unevaluated'
    : basis === 'items'
      ? 'unsettled'
      : read.evaluated > 0
        ? 'evaluated'
        : 'none'

  const eligible = eligibleSymbols === undefined || eligibleSymbols === null ? null : symbolList(eligibleSymbols)
  if (eligibleSymbols !== undefined && eligibleSymbols !== null && eligible === null) {
    diagnostics.push(diagnostic(
      'research_record_unreadable',
      'unevaluated',
      '`eligibleSymbols` is the list of names this run’s own fold found eligible — the count is derived from it and never typed. A value that is not an array of symbols records nothing',
      'eligibleSymbols',
      { eligibleSymbols },
    ))
  }
  const eligibleCount = eligible === null ? null : eligible.length

  if (basis === 'none') {
    diagnostics.push(diagnostic(
      'research_record_absent',
      'unevaluated',
      'Nothing about this run’s data preparation was handed over, so whether the roster was prepared, whether the recipe answered and how many names cleared the gates are all unknown. ⛔ That is not «the roster offered nothing»: call `research_prepare`, poll `research_job_get`, read `research_result_get` and hand back what they returned',
      'result',
    ))
  } else if (dataPreparation === 'unsettled') {
    diagnostics.push(diagnostic(
      'research_roster_unsettled',
      'unevaluated',
      'A research job exists and no result does yet, so these counts are what has settled so far and not an answer. ⛔ `sourced` is deliberately absent here: the settled summary derives it as items minus gaps, and deriving it mid-flight counts a name nobody has reached yet as a name this fund can read',
      'job',
      { pending: read.pending, total: read.total, pendingSymbols },
    ))
  } else if (dataPreparation === 'unprepared') {
    diagnostics.push(diagnostic(
      'research_roster_unprepared',
      'unevaluated',
      'The recipe answered for no name on this roster: every one of them had nothing readable at this pin. ⛔ Read it as blindness and never as an absence of opportunity — the control that fixes it is `source_cache_refresh` on the named symbols',
      'result.summary',
      { unprepared: read.unprepared, unpreparedSymbols, failed: read.failed, failedSymbols },
    ))
  } else if (dataPreparation === 'partial') {
    diagnostics.push(diagnostic(
      'research_roster_partially_prepared',
      'unevaluated',
      'Some names on this roster had nothing readable at this pin, or were there and could not be read. The rest are an answer you can use; the named ones are names this run is blind about, and a verdict over the whole roster is not established while they stand',
      'result.summary',
      { unprepared: read.unprepared, unpreparedSymbols, failed: read.failed, failedSymbols },
    ))
  }

  if (eligibleCount === null && basis !== 'none') {
    diagnostics.push(diagnostic(
      'research_eligibility_unreported',
      'unevaluated',
      'The roster was prepared and nothing said how many of the answers cleared this package’s gates. ⛔ An absent list is not an empty one: hand `eligibleSymbols` over as the names your own fold arrived at, and `[]` if it arrived at none',
      'eligibleSymbols',
    ))
  }

  return {
    data: {
      /** ⛔ Bumped when a reader must refuse an older shape; `mandateExecution` checks it. */
      recordVersion: 1,
      basis,
      bases: EXECUTION_RECORD_BASES,
      dataPreparation,
      dataPreparationStates: DATA_PREPARATION_STATES,
      candidateEvaluation,
      candidateEvaluationStates: CANDIDATE_EVALUATION_STATES,
      /** ⛔ `null` is «nobody folded the rows»; `0` is a measurement. */
      eligibleCount,
      eligibleBasis: eligible === null ? 'unreported' : 'named',
      eligibleSymbols: eligible ?? [],
      eligibleBases: ELIGIBLE_BASES,
      /** The host's counts, as the host wrote them. Never summed into a coverage number. */
      counts: read,
      unpreparedSymbols,
      failedSymbols,
      pendingSymbols,
      resultRef: settled?.resultRef ?? null,
      /** ⛔ Nothing here was read off a diagnostic; that is the whole point of #212 ④. */
      inferredFromDiagnostics: false,
      countsAreNeverSummed: true,
    },
    diagnostics,
  }
}
