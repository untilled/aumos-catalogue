/**
 * ── Which names this run actually looked at, and what «no candidates» means ──
 *
 * Everything else in this directory answers a question about **one company that is
 * already in front of it**. Nothing answered the question before that: which set of
 * symbols this run swept, where the next run resumes, and whether a run that produced
 * no candidate had screened a market or had read nothing at all.
 *
 * ⚠️ **Zero candidates and zero reads are the same output and they are opposite
 * facts.** Both end as a `WAIT` with no new name in it. `evidence-gated` shipped
 * exactly that failure — a book woke six times and never proposed a name it found
 * itself (`run_ba37a8f6907a49c3a805a4ce3ee10ec6`, #140) — because coverage was
 * answered `complete: true` over a denominator made entirely of the book's own
 * holdings. `docs/contracts/discovery-run.md` is the contract this module implements
 * and #305 is the issue; what is here is this package's own copy of it.
 *
 * ⛔ **Vendored, not imported, and the siblings are named so a reader can diff them.**
 * `managers/fundamental-mean-reversion/lib/discovery.mjs` and
 * `managers/catalyst-turnaround/lib/discovery.mjs` are the same contract in two other
 * packages. They are copies on purpose: the published artifact is a path→contents map
 * rooted at `managers/shareholder-rerating/`, a relative path leaving it does not
 * survive publication, and `COMMONISATION-SURVEY.md` (#270) settled that commonising
 * policy through a shared module makes one package's answer win silently. What the
 * three share is the **vocabulary** — field names and status words — and that is
 * asserted across them by `tools/verify-discovery-contract.mjs`, not by an import.
 *
 * ── What is this package's own, and is therefore different from the siblings ──
 *
 *   • the cursor is a **DART receipt number**, not a symbol index: this desk's entrance
 *     is the disclosure sweep and not a price sweep, so the thing that is consumed in
 *     order is `rcept_no`;
 *   • `filing` and `web` are **required** lanes and `price` is optional — the opposite
 *     of `fundamental-mean-reversion`. A return policy lives in the issuer's IR
 *     material and in no filing, so a run with a dark web lane has not looked for it;
 *   • a candidate needs **all three of this desk's axes**, and the three are stated in
 *     `PROMPT.md` §2 rather than here.
 *
 * ── The three axes, and why one of them is never enough ────────────────────
 *
 * A high yield, a low PBR and a deep drawdown are the three things that make a company
 * *look* like this methodology's subject, and each one alone is also what a dividend
 * trap, a business earning below its cost of equity and a six-month-old accident look
 * like. `classify.mjs` tells them apart once a company is in front of it. This module
 * refuses to put the company there on one axis at all:
 *
 *   `discount`        the discount, measured in the sector's **own** terms
 *   `earningsQuality` recurring earnings **and** the capital or cash headroom behind them
 *   `execution`       the programme's actual execution rate — not its announcement
 *
 * ⚠️ **A row short of the three is `watching`, never `excluded`.** An axis nobody read
 * is an absence and recording it as a rejection puts a refutation in the ledger that no
 * evidence stands behind — which every later run then reads as a name this desk has
 * already looked at and turned down. That is #254's distinction, one level up from
 * `classify.mjs`, and it is the reason `candidate_axes_incomplete` is `unevaluated`
 * when an axis was unread and `info` when all three were read and one said no.
 */

import { diagnostic, finite, instantOf } from './numbers.mjs'

/** The four words a lane may be in. Taken from `evidence-gated`'s `discoveryCapacity`. */
export const LANE_STATUSES = Object.freeze(['open', 'partial', 'dark', 'unstated'])

/** The four things a run's discovery may have been. Closed set; `docs/contracts/discovery-run.md`. */
export const DISCOVERY_STATUSES = Object.freeze([
  'candidates_produced',
  'no_candidate_qualified',
  'discovery_not_run',
  'discovery_incomplete',
])

/**
 * ⛔ **`filing` and `web` are required for this package and `price` is not.**
 * The entrance is 배당·자기주식 취득 결정/결과·소각 and the value-up disclosure, plus the
 * issuer's own statement of its policy — which is a web reading. A price series does not
 * open a case here and its absence does not close one.
 */
export const REQUIRED_LANES = Object.freeze(['filing', 'web'])
export const OPTIONAL_LANES = Object.freeze(['price'])

/** This package's cursor is a receipt number, because a disclosure sweep consumes receipts. */
export const CURSOR_KIND = 'dart-receipt'

/** The three axes, in the order `PROMPT.md` §2 states them. */
export const CANDIDATE_AXES = Object.freeze(['discount', 'earningsQuality', 'execution'])

/**
 * The pre-registered operating values behind the two settings #305 added. They are
 * **budgets and floors**, not thresholds that classify, so they are here beside the
 * thing that reads them rather than in `thresholds.mjs` — whose claim is that every
 * number that decides a *case* is on one screen.
 */
export const DISCOVERY_DEFAULTS = Object.freeze({
  discoveryBudgetFilings: 100,
  researchCompletionFloor: 1,
})

function laneStatus(value) {
  if (typeof value === 'string' && LANE_STATUSES.includes(value)) return value
  if (value === true) return 'open'
  if (value === false) return 'dark'
  if (value === null || value === undefined) return 'unstated'
  return null
}

function cursorOf(value) {
  if (value === null || value === undefined) return null
  const at = instantOf(value.atEpochMs ?? value.at ?? null)
  return {
    kind: typeof value.kind === 'string' ? value.kind : null,
    value: typeof value.value === 'string' ? value.value : null,
    atEpochMs: at,
  }
}

function sameCursor(a, b) {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.kind === b.kind && a.value === b.value && a.atEpochMs === b.atEpochMs
}

/**
 * One screened row against the three axes.
 *
 * Each axis is `true` (read, and it says yes), `false` (read, and it says no) or
 * `null`/absent (**nobody read it**). The three answers are not degrees of one.
 */
export function screenCandidate(row = {}) {
  const diagnostics = []
  const symbol = typeof row.symbol === 'string' ? row.symbol : null
  const axes = row.axes ?? {}
  const read = {}
  const unread = []
  const refuted = []
  for (const axis of CANDIDATE_AXES) {
    const value = axes[axis]
    if (value === true) read[axis] = true
    else if (value === false) {
      read[axis] = false
      refuted.push(axis)
    } else {
      read[axis] = null
      unread.push(axis)
    }
  }
  const qualifies = CANDIDATE_AXES.every((axis) => read[axis] === true)
  if (!qualifies) {
    diagnostics.push(
      diagnostic(
        'candidate_axes_incomplete',
        unread.length > 0 ? 'unevaluated' : 'info',
        unread.length > 0
          ? `${symbol ?? 'this row'} is short of ${unread.join(', ')}: a high yield, a low PBR or a fall on its own is what a dividend trap and a business earning under its cost of equity also look like. It stays \`watching\` — an axis nobody read is an absence and never a rejection.`
          : `${symbol ?? 'this row'} was measured on all three axes and ${refuted.join(', ')} said no. That is a screen-out with evidence behind it, and it stays \`watching\` rather than becoming a candidate.`,
        `screened[${symbol ?? '?'}].axes`,
        { symbol, axes: read, missingAxes: unread, refutedAxes: refuted },
      ),
    )
  }
  return {
    data: {
      symbol,
      market: typeof row.market === 'string' ? row.market : null,
      axes: read,
      qualifies,
      missingAxes: unread,
      refutedAxes: refuted,
      /** ⚠️ Not `excluded`. The name stays on the desk with a question against it. */
      state: qualifies ? 'discovered' : 'watching',
      resumed: row.resumed === true,
    },
    diagnostics,
  }
}

/**
 * The record #305 asks every run of the three packages to write, with these names.
 *
 * @param {object} input
 * @param {string}  [input.runId]
 * @param {string|number} input.asOf
 * @param {object|null} [input.universe]  `{ source, count }` — absent is **undeclared**
 * @param {number}  [input.symbolsAttempted]
 * @param {number}  [input.symbolsSucceeded]
 * @param {string[]} [input.symbolsFailed]
 * @param {object[]} [input.screened]     rows for `screenCandidate`
 * @param {object}  [input.lanes]         `{ price, filing, web }`
 * @param {number}  [input.researchCompleted]
 * @param {number}  [input.filingsRead]
 * @param {boolean} [input.budgetSpentOnHoldings]
 * @param {object}  [input.cursorBefore]  `{ kind, value, atEpochMs }`
 * @param {object}  [input.cursorAfter]   what the run *proposes* advancing to
 * @param {string[]} [input.uncertainty]  the proposal's `rationale.uncertainty`, if it exists yet
 * @param {object}  [input.config]
 */
export function discoveryRun(input = {}) {
  const diagnostics = []
  const asOfInstant = instantOf(input.asOf)
  if (asOfInstant === null) {
    return {
      data: null,
      diagnostics: [
        diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf'),
      ],
    }
  }

  // ── the lanes ────────────────────────────────────────────────────────────
  const lanes = {}
  for (const lane of [...OPTIONAL_LANES, ...REQUIRED_LANES]) {
    const status = laneStatus(input.lanes?.[lane])
    if (status === null) {
      diagnostics.push(
        diagnostic(
          'discovery_lane_status_unknown',
          'unevaluated',
          `A lane status outside ${LANE_STATUSES.join(' / ')} says nothing this record can carry, so it is read as \`unstated\` — which is what it is: nobody stated it.`,
          `lanes.${lane}`,
          { lane, offered: input.lanes?.[lane] ?? null, statuses: LANE_STATUSES },
        ),
      )
      lanes[lane] = 'unstated'
    } else {
      lanes[lane] = status
    }
  }
  const requiredUnstated = REQUIRED_LANES.filter((lane) => lanes[lane] === 'unstated')
  if (requiredUnstated.length > 0) {
    diagnostics.push(
      diagnostic(
        'discovery_lane_unstated',
        'unevaluated',
        `A discovery lane nobody asked about is not a lane that was open. ${requiredUnstated.join(' and ')} ${requiredUnstated.length === 1 ? 'is' : 'are'} required by this strategy and ${requiredUnstated.length === 1 ? 'was' : 'were'} never stated, so this run cannot claim to have swept anything.`,
        `lanes.${requiredUnstated[0]}`,
        { unstated: requiredUnstated, required: REQUIRED_LANES },
      ),
    )
  }
  const requiredDark = REQUIRED_LANES.every((lane) => lanes[lane] === 'dark' || lanes[lane] === 'unstated')
  if (requiredDark) {
    diagnostics.push(
      diagnostic(
        'discovery_lane_dark',
        'unevaluated',
        'Every lane this strategy requires was dark or never asked, so this run had zero discovery capacity. Report it as cannot-adjudicate; it is not a market in which nothing qualified.',
        'lanes.filing',
        { lanes },
      ),
    )
  }

  // ── the universe ─────────────────────────────────────────────────────────
  const universe = input.universe ?? null
  const universeSource = typeof universe?.source === 'string' && universe.source.length > 0 ? universe.source : null
  const universeCount = finite(universe?.count) ? universe.count : null
  const universeDeclared = universeSource !== null && universeCount !== null
  if (!universeDeclared) {
    /**
     * ⛔ **Never `blocked`.** The book whose universe is undeclared is exactly the book
     * that still has to be watched on the sell side: the held-thesis review and every
     * reduction route run on holdings alone. Zero discovery is a report, not a stop.
     */
    diagnostics.push(
      diagnostic(
        'universe_undeclared',
        'unevaluated',
        'No universe was declared, so this run has no denominator and cannot say that nothing qualified. ⛔ It is not blocked: holdings and armed watches are reviewed exactly as they would have been, and the sell side is untouched.',
        'universe',
        { universeSource, universeCount },
      ),
    )
  }

  // ── the symbols ──────────────────────────────────────────────────────────
  const symbolsFailed = (Array.isArray(input.symbolsFailed) ? input.symbolsFailed : []).filter(
    (symbol) => typeof symbol === 'string' && symbol.length > 0,
  )
  const symbolsSucceeded = finite(input.symbolsSucceeded) ? input.symbolsSucceeded : 0
  const symbolsAttempted = finite(input.symbolsAttempted) ? input.symbolsAttempted : symbolsSucceeded + symbolsFailed.length
  if (symbolsAttempted < symbolsSucceeded + symbolsFailed.length) {
    diagnostics.push(
      diagnostic(
        'symbol_counts_inconsistent',
        'blocked',
        'More symbols succeeded and failed than were attempted. One of the three counts is being produced rather than counted, and a coverage number nobody can reconstruct is worse than none.',
        'symbolsAttempted',
        { symbolsAttempted, symbolsSucceeded, symbolsFailed: symbolsFailed.length },
      ),
    )
  }

  // ── the screen ───────────────────────────────────────────────────────────
  const screened = []
  for (const row of Array.isArray(input.screened) ? input.screened : []) {
    const answer = screenCandidate(row)
    diagnostics.push(...answer.diagnostics)
    screened.push(answer.data)
  }
  const qualifying = screened.filter((row) => row.qualifies)
  const gatePassed = qualifying.length
  const newCandidates = qualifying.filter((row) => !row.resumed).length
  const resumedCandidates = qualifying.filter((row) => row.resumed).length
  const watching = screened.filter((row) => !row.qualifies).map((row) => row.symbol)

  // ── the budget and the completion floor, which are the two new settings ──
  const budget = Number.isInteger(input.config?.discoveryBudgetFilings)
    ? input.config.discoveryBudgetFilings
    : DISCOVERY_DEFAULTS.discoveryBudgetFilings
  const floor = Number.isInteger(input.config?.researchCompletionFloor)
    ? input.config.researchCompletionFloor
    : DISCOVERY_DEFAULTS.researchCompletionFloor
  const researchCompleted = finite(input.researchCompleted) ? input.researchCompleted : 0
  if (finite(input.filingsRead) && input.filingsRead > budget) {
    diagnostics.push(
      diagnostic(
        'discovery_budget_exceeded',
        'warn',
        `This run read ${input.filingsRead} filing index rows against a budget of ${budget}. The budget is a run-cost ceiling and not a rule about the market; what it buys is the guarantee that the next run still has a turn.`,
        'filingsRead',
        { filingsRead: input.filingsRead, discoveryBudgetFilings: budget },
      ),
    )
  }
  if (gatePassed > 0 && researchCompleted < floor) {
    /**
     * ⛔ **Reading many names shallowly and stopping is the behaviour this floor
     * exists to refuse.** It looks productive in a log and produces no judgement.
     */
    diagnostics.push(
      diagnostic(
        'research_completion_floor_unmet',
        'warn',
        `${gatePassed} name(s) passed the three axes and ${researchCompleted} ${researchCompleted === 1 ? 'was' : 'were'} carried to a completed thesis, under the floor of ${floor}. Finish one rather than skimming the rest; the others keep their next question and their review condition.`,
        'researchCompleted',
        { gatePassed, researchCompleted, researchCompletionFloor: floor },
      ),
    )
  }
  const budgetSpentOnHoldings = input.budgetSpentOnHoldings === true
  if (budgetSpentOnHoldings) {
    diagnostics.push(
      diagnostic(
        'discovery_budget_spent_on_holdings',
        'warn',
        'The review of what is already held consumed this run\'s discovery budget. ⚠️ That is `discovery_not_run` and never «no new candidates»: the run did not look.',
        'budgetSpentOnHoldings',
      ),
    )
  }

  // ── the decision table, verbatim from docs/contracts/discovery-run.md ────
  const produced = newCandidates + resumedCandidates > 0
  const everyRequiredLaneOpen = REQUIRED_LANES.every((lane) => lanes[lane] === 'open')
  /**
   * ⛔ **The precedence is part of the contract and this is the order it states:**
   *
   *   `discovery_not_run` > `discovery_incomplete` > `candidates_produced` > `no_candidate_qualified`
   *
   * ⚠️ **A failed or unreached range outranks a name that came through the gate.** More
   * than one row of the table holds at once whenever a sweep produced a candidate and
   * lost a range, and reporting it by the candidate is the #140 shape one step over:
   * how much of the market this run actually read is the fact a later reader cannot
   * reconstruct, and a partially unprocessed range is its own status rather than a
   * footnote on a productive one. The name is not lost — it is still counted in
   * `newCandidates` / `resumedCandidates`, still handed to the ledger, and
   * `candidates_produced_within_incomplete_sweep` below says so out loud. What follows
   * from the word is the cursor, which stays at the last fully succeeded range.
   */
  let discoveryStatus
  if (!universeDeclared || budgetSpentOnHoldings || requiredDark) {
    discoveryStatus = 'discovery_not_run'
  } else if (symbolsFailed.length > 0 || !everyRequiredLaneOpen) {
    discoveryStatus = 'discovery_incomplete'
  } else if (produced) {
    discoveryStatus = 'candidates_produced'
  } else {
    discoveryStatus = 'no_candidate_qualified'
  }

  if (discoveryStatus === 'discovery_incomplete' && produced) {
    /**
     * ⚠️ **`info`, never `unevaluated` or `warn`.** Nothing here is unread and nothing
     * here is a warning about the names: they were measured on all three axes and they
     * stand. What the entry records is the *shape* of the run — candidates beside an
     * unfinished sweep — so that a reader who sees `discovery_incomplete` beside a
     * non-zero `newCandidates` does not read it as a contradiction.
     */
    diagnostics.push(
      diagnostic(
        'candidates_produced_within_incomplete_sweep',
        'info',
        `${newCandidates + resumedCandidates} name(s) came through the three axes while part of this sweep was still unread. The candidates stand and are counted; the run is reported as \`discovery_incomplete\` and the cursor does not move, because the unread part is re-attempted before anything after it.`,
        'discoveryStatus',
        {
          newCandidates,
          resumedCandidates,
          symbolsFailed,
          requiredLanes: Object.fromEntries(REQUIRED_LANES.map((lane) => [lane, lanes[lane]])),
        },
      ),
    )
  }

  /**
   * ⚠️ **`discovery_not_run` has to survive the trip into a `DecisionProposal`,
   * which carries no diagnostics field** — the host discards a judgement with an
   * unknown key. So it travels as a **token**: the string `discovery_not_run`
   * verbatim in one `rationale.uncertainty` entry, matched as a token and never as a
   * phrase, because the prose around it is written in the invocation's `language` and
   * a matcher looking for English words passes every Korean run for the wrong reason.
   * That is `evidence-gated`'s `discovery_lane_dark_undisclosed` mechanism, reused.
   *
   * ⛔ Omitting `uncertainty` leaves the disclosure **unjudged**, not passed: a call
   * made before the proposal exists has nothing to read.
   */
  const uncertainty = Array.isArray(input.uncertainty) ? input.uncertainty : null
  const disclosed =
    uncertainty === null
      ? null
      : uncertainty.some((entry) => typeof entry === 'string' && /(^|[^a-z_])discovery_not_run([^a-z_]|$)/.test(entry))
  if (discoveryStatus === 'discovery_not_run' && disclosed === false) {
    diagnostics.push(
      diagnostic(
        'discovery_not_run_undisclosed',
        'blocked',
        'This run had no discovery capacity and the proposal does not say so, which is the one output an investor cannot tell from a considered no-change. Carry the token `discovery_not_run` verbatim in one `uncertainty` entry — the token, not a translation of it.',
        'uncertainty',
        { discoveryStatus, token: 'discovery_not_run' },
      ),
    )
  }

  // ── the cursor ───────────────────────────────────────────────────────────
  const cursorBefore = cursorOf(input.cursorBefore)
  const proposed = cursorOf(input.cursorAfter)
  for (const [name, cursor] of [
    ['cursorBefore', cursorBefore],
    ['cursorAfter', proposed],
  ]) {
    if (cursor !== null && cursor.kind !== null && cursor.kind !== CURSOR_KIND) {
      diagnostics.push(
        diagnostic(
          'cursor_kind_unexpected',
          'blocked',
          `This package sweeps disclosure receipts, so its cursor is a \`${CURSOR_KIND}\` whose value is an \`rcept_no\`. A cursor of another kind was written by another strategy and resuming from it reads a different market.`,
          name,
          { kind: cursor.kind, expected: CURSOR_KIND },
        ),
      )
    }
  }

  /**
   * ⛔ **The cursor marks the last *fully succeeded* range and never moves past a
   * failed one.** A cursor that advanced over a transient vendor error turns it into a
   * permanently unread slice of the market — silently, once, and nothing later ever
   * looks there again.
   */
  const mayAdvance = discoveryStatus === 'candidates_produced' || discoveryStatus === 'no_candidate_qualified'
  let cursorAfter = cursorBefore
  if (mayAdvance && symbolsFailed.length === 0) {
    cursorAfter = proposed ?? cursorBefore
  } else if (proposed !== null && !sameCursor(proposed, cursorBefore)) {
    diagnostics.push(
      diagnostic(
        'cursor_advanced_past_incomplete_range',
        'blocked',
        `This run is \`${discoveryStatus}\`${symbolsFailed.length > 0 ? ` with ${symbolsFailed.length} failed symbol(s)` : ''} and proposed a cursor past the last range that fully succeeded. The cursor has been held where it was; the next run re-attempts the failure instead of stepping over it.`,
        'cursorAfter',
        { discoveryStatus, proposed, held: cursorBefore, symbolsFailed },
      ),
    )
  }

  return {
    data: {
      record: {
        schemaVersion: 1,
        updatedAtEpochMs: asOfInstant,
        runId: typeof input.runId === 'string' ? input.runId : null,
        universeDeclared,
        universeSource,
        universeCount,
        symbolsAttempted,
        symbolsSucceeded,
        symbolsFailed,
        gatePassed,
        newCandidates,
        resumedCandidates,
        researchCompleted,
        cursorBefore,
        cursorAfter,
        priceLaneStatus: lanes.price,
        filingLaneStatus: lanes.filing,
        webLaneStatus: lanes.web,
        discoveryStatus,
      },
      screened,
      watching,
      /** `null` — never `false` — when no proposal existed yet to read. (#305) */
      notRunDisclosed: discoveryStatus === 'discovery_not_run' ? disclosed : null,
      cursorHeld: !sameCursor(cursorAfter, proposed ?? cursorAfter),
      requiredLanes: REQUIRED_LANES,
      discoveryBudgetFilings: budget,
      researchCompletionFloor: floor,
    },
    diagnostics,
  }
}
