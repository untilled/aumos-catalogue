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
 * ── ⚠️ Who counts what, and why it moved (`untilled/aumos#743` §B) ──────────
 *
 * `untilled/aumos#724` gave the host a research job and a research result that
 * count, and this operation read both. #743 §B took half of that away, and took
 * the right half: `research_result_get` is gone, and with it a settled summary
 * carrying `sourced` and `unprepared`. Those two said *this fund held readable
 * documents for this name*, which is a judgement about documents that only the
 * domain reading them makes — a common executor making it was the app holding an
 * investment opinion, and this package is the one that has to hold it.
 *
 * So the counting is split, and each half is counted where it is known:
 *
 * | fact | who says it | how it arrives |
 * |---|---|---|
 * | how many items, how many left, how many answered, how many could not | the host | `task_get`'s `counts` — `total`, `pending`, `done`, `failed` |
 * | how many had anything to read | **this package's recipe** | `sourced` on each answer, written by `recipes/request.mjs` |
 * | how many the recipe computed something for | this package | `data !== null` on each answer |
 * | how many cleared the gates | this package's own fold | `eligibleSymbols` |
 *
 * ⚠️ **The recipe answers are FILES now, and the manager reads them back.** One
 * per item, at `<outputPath>/<itemId>.json`, and `files_read` is the route. So
 * `rows` is what this operation is handed where a settled `result` used to be —
 * and the shift is not cosmetic: a count that used to be asserted by the host is
 * now derived from the answers themselves, which is a count a reader can check.
 *
 * ── The three facts this answers, unchanged ────────────────────────────────
 *
 *   1. `dataPreparation` — did the roster get prepared, and how far.
 *   2. `candidateEvaluation` — did the recipe answer for anything.
 *   3. `eligibleCount` — how many of the answers cleared this package's gates.
 *
 * ⛔ **The counts are reports and are never summed** — kept verbatim from the
 * host's own rule, because folding `unprepared` into `evaluated` is the mistake,
 * one layer up, that #209 asks to design out.
 *
 * ── ⛔ `sourced` is absent from the `run` basis, and for its original reason ─
 *
 * It is derived from the answers, so it is only as complete as the answers read
 * back. Deriving it from `done` mid-flight counts *not looked at yet* as
 * *sourced*, and a count that falls as a job progresses is a count a reader
 * stops trusting. So on a run whose files have not been read it simply is not
 * there, exactly as it was not there on an unsettled job before.
 *
 * ── ⚠️ `eligibleCount` is this package's number and not the host's ──────────
 *
 * Eligibility is a methodology verdict — which of the recipe's answers cleared
 * the lens envelopes, the evidence gates and the challenge — so no host field
 * carries it and none should. It arrives here as **`eligibleSymbols`**, the names
 * the run's own fold (`opportunityUniverse` over the answers, then the evidence
 * gates) arrived at, and the count is derived from them rather than typed. A
 * number a run can type is a number a run can invent; a list of names is
 * checkable and its length is arithmetic.
 *
 * ⛔ **Absent is `null`, and `[]` is `0`.** «Nobody folded the rows» and «the
 * rows were folded and nothing cleared» are different facts and the second is a
 * measurement. That is the same three-way split `basis` keeps (`rows` · `run` ·
 * `none`, where `none` is *not* zero) and the same rule `cash_floor_unevaluated`
 * has always followed here.
 *
 * ⛔ **Nothing in this file reads a diagnostic.** Diagnostics stay exactly where
 * they were and keep saying **why** — which stage lost which input — and this
 * operation says **what happened**. The two are different questions and #212 ④
 * is about which one decides the verdict.
 */
import { diagnostic } from './diagnostics.mjs'

/** ⚠️ `unevaluated` is «no record», `unprepared` is «the answers say nothing was readable». */
export const DATA_PREPARATION_STATES = Object.freeze(['prepared', 'partial', 'unprepared', 'unsettled', 'unevaluated'])

/** The same three-way split one field over: absent, in flight, measured. */
export const CANDIDATE_EVALUATION_STATES = Object.freeze(['evaluated', 'none', 'unsettled', 'unevaluated'])

/**
 * Where the counts came from — and ⛔ `none` is not zero.
 *
 * ⚠️ **The three moved with the tools and kept their split** (`untilled/aumos#743` §B).
 * `result` was *the host settled a summary* and is gone with `research_result_get`;
 * `rows` is *this run read the answers back out of its own folder*, which is
 * where preparation is measurable now. `items` became `run` for the same reason
 * the tool did: what the host counts is a task run's items and not a roster.
 */
export const EXECUTION_RECORD_BASES = Object.freeze(['rows', 'run', 'none'])

/** `named` — a list was folded, whatever its length. `unreported` — nobody folded. */
export const ELIGIBLE_BASES = Object.freeze(['named', 'unreported'])

/**
 * A task run that has stopped, whichever way it stopped.
 *
 * ⛔ `cancelled` and `failed` are terminal too. What this word decides is only
 * whether more items may still arrive, and none may in any of the four.
 */
const TERMINAL_STATES = new Set(['completed', 'partial', 'failed', 'cancelled'])

const wholeNumber = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0

const symbolList = (value) => (Array.isArray(value)
  ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 32))]
  : null)

/**
 * What one recipe answer is called, on the roster the reader knows.
 *
 * ⚠️ The item id is a **coordinate** (`XKRX:005930`) because that is what makes
 * the host hand the recipe this fund's documents; the roster is spoken in bare
 * symbols. The answer carries both, so the symbol is preferred and the id is
 * split as the fallback — `itemCoordinate`'s rule, one process over.
 */
function rowName(row) {
  const symbol = row?.symbol
  if (typeof symbol === 'string' && symbol.length > 0 && symbol.length <= 32) return symbol
  const id = row?.itemId
  if (typeof id !== 'string' || id.length === 0) return null
  const cut = id.lastIndexOf(':')
  const name = cut > 0 && cut < id.length - 1 ? id.slice(cut + 1) : id
  return name.length <= 32 ? name : null
}

/**
 * The counts this package derives from the answers it read back.
 *
 * ⚠️ **Derived and never asserted.** Every number here is `rows.filter(...).length`
 * over answers written by `recipes/request.mjs`, so a reader who has the folder
 * can recompute all of them. That is the difference #743 §B bought: the host
 * used to assert `sourced` and this run used to repeat it.
 *
 * ⛔ **A row that is not an object is counted as unreadable rather than skipped.**
 * Dropping it would shrink the denominator and quietly turn a folder half of
 * which could not be parsed into a fully prepared roster.
 */
/**
 * ── ⚠️ Whether this answer evaluated anything, in either of the two ways an
 *    answer says so (#251 ③) ───────────────────────────────────────────────
 *
 * `data` non-null is what `recipes/request.mjs` writes and it stays
 * authoritative. What was missing is that **a caller who states the fact
 * directly was read by nothing**: `rows[].evaluated: true` on every row came
 * back `counts.evaluated: 0` and `candidateEvaluation: 'none'`, with no
 * diagnostic — and `mandateExecution` then read out a record saying *«25 names
 * eligible»* beside *«nothing was evaluated»*, which is a self-contradiction
 * this package published about its own run.
 *
 * ⛔ **`null` is a third answer and not a `false`.** A row that carries neither
 * field has not said, and counting it as «not evaluated» is the silent zero the
 * whole defect is made of; it is named below instead.
 *
 * ⚠️ **`data` wins when both are present, and a disagreement is reported.** Two
 * fields answering one question is the shape this package keeps deleting, so the
 * one the producer writes decides and the reader is told the two did not agree.
 */
function rowEvaluated(row) {
  if (row.data !== undefined) return row.data !== null
  if (typeof row.evaluated === 'boolean') return row.evaluated
  return null
}

function readRows(rows) {
  const unreadable = []
  const sourced = []
  const unprepared = []
  const unstated = []
  const contradicted = []
  let evaluated = 0
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      unreadable.push(row)
      continue
    }
    const name = rowName(row)
    if (row.sourced === true) {
      if (name !== null) sourced.push(name)
      const said = rowEvaluated(row)
      if (said === null) unstated.push(name)
      else if (said) evaluated += 1
      if (row.data !== undefined && typeof row.evaluated === 'boolean' && row.evaluated !== (row.data !== null)) contradicted.push(name)
    } else if (row.sourced === false) {
      if (name !== null) unprepared.push(name)
    } else {
      unreadable.push(row)
    }
  }
  return {
    unreadable,
    sourced: sourced.length,
    unprepared: unprepared.length,
    evaluated,
    /** ⚠️ Rows that said nothing either way — never folded into `evaluated`. */
    evaluationUnstated: unstated.length,
    evaluationUnstatedSymbols: [...new Set(unstated.filter((name) => name !== null))],
    evaluationContradicted: contradicted.length,
    unpreparedSymbols: [...new Set(unprepared)],
  }
}

/**
 * The host's counts, from whichever of the two answers carried them.
 *
 * ⚠️ **`task_start` carries them on a cache hit.** `cached: true` comes back
 * with `counts` and no run to poll, so a run that never called `task_get` still
 * has them — and reading only the poll would tell that run it had prepared
 * nothing. It is the same accommodation `research_prepare` needed, under the new
 * name, and it is why `started` is a parameter at all.
 */
function hostCounts(started, run) {
  const fromRun = run?.counts
  if (fromRun && typeof fromRun === 'object') return { counts: fromRun, state: typeof run?.state === 'string' ? run.state : null, from: 'run' }
  const fromStarted = started?.counts
  if (fromStarted && typeof fromStarted === 'object') return { counts: fromStarted, state: typeof started?.status === 'string' ? started.status : null, from: 'started' }
  return null
}

export function executionRecord({ started = null, run = null, rows = undefined, eligibleSymbols = undefined } = {}) {
  const diagnostics = []
  const host = hostCounts(started, run)
  const handedRows = rows === undefined || rows === null ? null : Array.isArray(rows) ? rows : undefined

  if (handedRows === undefined) {
    diagnostics.push(diagnostic(
      'research_record_unreadable',
      'unevaluated',
      '`rows` is the list of recipe answers this run read back out of its own folder with `files_read`, one per item. A value that is not an array records nothing about what was prepared. ⛔ Absent is a different fact and is allowed: it says the answers were not read, and the record says so',
      'rows',
      { rows },
    ))
  }

  let basis = 'none'
  /** ⛔ The derived four stay `null` unless the answers were read — see the header. */
  let read = { total: null, pending: null, done: null, failed: null, rowsRead: null, sourced: null, unprepared: null, evaluated: null }
  let unpreparedSymbols = []
  let failedSymbols = []
  let pendingSymbols = []

  if (host !== null) {
    const counts = host.counts
    if (!['total', 'pending', 'done', 'failed'].every((key) => wholeNumber(counts[key]))) {
      diagnostics.push(diagnostic(
        'research_record_unreadable',
        'unevaluated',
        'A task run carries `total`, `pending`, `done` and `failed` as whole counts; this one does not. ⛔ Hand back what `task_get` returned, verbatim — a paraphrase of it is not a record',
        'run.counts',
        { counts },
      ))
    } else {
      const settled = host.state !== null && TERMINAL_STATES.has(host.state)
      const derived = handedRows === null || handedRows === undefined ? null : readRows(handedRows)
      basis = settled && derived !== null ? 'rows' : 'run'
      read = {
        total: counts.total,
        pending: counts.pending,
        done: counts.done,
        failed: counts.failed,
        rowsRead: derived === null ? null : handedRows.length,
        sourced: basis === 'rows' ? derived.sourced : null,
        unprepared: basis === 'rows' ? derived.unprepared : null,
        evaluated: basis === 'rows' ? derived.evaluated : null,
        /** ⛔ `0` is «every answer said»; a positive number is «this count is short by that many» (#251 ③). */
        evaluationUnstated: basis === 'rows' ? derived.evaluationUnstated : null,
      }
      if (basis === 'rows') unpreparedSymbols = symbolList(derived.unpreparedSymbols) ?? []
      failedSymbols = symbolList((run?.failures ?? []).map((row) => rowName(row))) ?? []
      pendingSymbols = symbolList((run?.pendingItems ?? []).map((id) => rowName({ itemId: id }))) ?? []
      /**
       * ⚠️ **A row that says nothing about evaluation is not a row that says
       * no** (#251 ③). `evaluated` is derived, so a roster whose answers all
       * omit both fields comes back `0` — indistinguishable from a recipe that
       * ran and answered nothing. This is the sentence that separates them, and
       * it names the two fields either of which settles it.
       *
       * ⛔ Not `input_key_unread`: that code is about a **declared operation
       * key** the contract publishes, and these are fields inside somebody
       * else's answer file. This is the same code the missing `sourced` raises,
       * for the same reason — an answer read back without the field the
       * diagnosis rests on.
       */
      if (basis === 'rows' && derived.evaluationUnstated > 0) {
        diagnostics.push(diagnostic(
          'research_record_unreadable',
          'unevaluated',
          'Some of the answers read back say neither `data` nor `evaluated`, so whether the recipe arrived at anything for those names is unknown and `counts.evaluated` is short by that many. ⛔ It is not a count of answers that evaluated nothing — hand back the recipe answers as `files_read` returned them, where `data` is the field, or state `evaluated` as a boolean',
          'rows',
          { evaluationUnstated: derived.evaluationUnstated, symbols: derived.evaluationUnstatedSymbols, settledBy: ['data', 'evaluated'], rowsRead: handedRows.length },
        ))
      }
      /** ⚠️ Two fields answering one question, disagreeing. `data` is the producer's and it decides. */
      if (basis === 'rows' && derived.evaluationContradicted > 0) {
        diagnostics.push(diagnostic(
          'research_record_unreadable',
          'unevaluated',
          'Some answers carry both `data` and `evaluated` and the two disagree about whether the recipe arrived at anything. `data` is what the recipe itself writes and it is the one counted; the other was read past',
          'rows',
          { evaluationContradicted: derived.evaluationContradicted, authoritative: 'data' },
        ))
      }
      if (basis === 'rows' && derived.unreadable.length > 0) {
        diagnostics.push(diagnostic(
          'research_record_unreadable',
          'unevaluated',
          'Some of the answers read back do not carry `sourced` as a boolean, so whether this fund held anything readable for those names is unknown and they are counted in neither column. ⛔ Hand back the recipe answers as `files_read` returned them — a paraphrase drops the one field the starvation diagnosis rests on',
          'rows',
          { unreadable: derived.unreadable.length, rowsRead: handedRows.length },
        ))
      }
    }
  }

  /**
   * ⛔ **`unsettled` rather than `in-flight`.** A cancelled run also has item
   * rows and no answers read back, and calling that «in flight» would say a run
   * is going that has stopped. What both share is the only thing this operation
   * needs: preparation has not been measured, so these counts are *so far* and
   * not an answer. ⚠️ Since #743 §B a **settled** run whose files nobody read is
   * the same word for the same reason — the answers are on disk and unread, and
   * a record that called that «prepared» would be asserting the state nobody
   * counted, which is exactly what #212 ④ removed.
   */
  const dataPreparation = basis === 'none'
    ? 'unevaluated'
    : basis === 'run'
      ? 'unsettled'
      : read.sourced === 0
        ? 'unprepared'
        : read.unprepared > 0 || read.failed > 0
          ? 'partial'
          : 'prepared'

  const candidateEvaluation = basis === 'none'
    ? 'unevaluated'
    : basis === 'run'
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
      'Nothing about this run’s data preparation was handed over, so whether the roster was prepared, whether the recipe answered and how many names cleared the gates are all unknown. ⛔ That is not «the roster offered nothing»: call `task_start`, poll `task_get`, read the answer files with `files_read` and hand back what they returned',
      'run',
    ))
  } else if (dataPreparation === 'unsettled') {
    diagnostics.push(diagnostic(
      'research_roster_unsettled',
      'unevaluated',
      'The task run has not settled, or its answers were not read back, so these counts are what the host has done so far and not a measurement of what was prepared. ⛔ `sourced` is deliberately absent here: it is derived from the answers themselves, and deriving it from `done` counts a name nobody has reached yet as a name this fund can read. The control is `files_read` over `<outputPath>/<itemId>.json`',
      'run',
      { pending: read.pending, total: read.total, pendingSymbols, rowsRead: read.rowsRead },
    ))
  } else if (dataPreparation === 'unprepared') {
    diagnostics.push(diagnostic(
      'research_roster_unprepared',
      'unevaluated',
      'The recipe answered for no name on this roster: every one of them had nothing readable at this pin. ⛔ Read it as blindness and never as an absence of opportunity — the control that fixes it is `source_cache_refresh` on the named symbols',
      'rows',
      { unprepared: read.unprepared, unpreparedSymbols, failed: read.failed, failedSymbols },
    ))
  } else if (dataPreparation === 'partial') {
    diagnostics.push(diagnostic(
      'research_roster_partially_prepared',
      'unevaluated',
      'Some names on this roster had nothing readable at this pin, or were there and could not be read. The rest are an answer you can use; the named ones are names this run is blind about, and a verdict over the whole roster is not established while they stand',
      'rows',
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
      /** The host's four, as the host wrote them; the rest derived from the answers. Never summed. */
      counts: read,
      unpreparedSymbols,
      failedSymbols,
      pendingSymbols,
      /** Where the answers are, so a reader can go and check the counts above. */
      outputPath: typeof run?.outputPath === 'string' ? run.outputPath : typeof started?.outputPath === 'string' ? started.outputPath : null,
      /** ⛔ Nothing here was read off a diagnostic; that is the whole point of #212 ④. */
      inferredFromDiagnostics: false,
      countsAreNeverSummed: true,
    },
    diagnostics,
  }
}
