import { METHODOLOGY, RECOVERY_CHANNELS } from './constants.mjs'
import { DAY_MS, cause, diagnostic, finite, instantOf, round } from './diagnostics.mjs'
import { LEDGER_VOCABULARY } from './ledger.mjs'

/**
 * ── One discovery run, and the four things it is allowed to have been ──────
 *
 * ⚠️ **Vendored on purpose, and the siblings are named.** The same record shape
 * is produced by `managers/fundamental-mean-reversion/lib/discovery.mjs` and by
 * `managers/shareholder-rerating/lib/discovery.mjs` (`aumos-catalogue#305`).
 * The three files share §7.1's **field names** and nothing else: the sweep unit,
 * the cursor kind, the required lanes and the gate are each package's own, and
 * the published artifact is a path→contents map rooted at this directory, so a
 * relative import that escaped it would not survive publication. If you change a
 * field name here, change it in all three or the shared contract is a coincidence.
 *
 * ── What this exists to stop ───────────────────────────────────────────────
 *
 * #305 states it in one line: **후보 0건은 ⟨조건 통과가 없었다⟩와 ⟨아무것도
 * 조회하지 못했다⟩ 중 어느 쪽인가.** A run that reads no filing window and a run
 * that reads the whole window and finds nothing worth registering produce the
 * same empty answer, and the difference between them is the whole value of the
 * answer. So the run's own statistics are computed here rather than narrated,
 * and the four statuses are a closed set:
 *
 * | status | what it means |
 * |---|---|
 * | `candidates_produced` | the sweep ran and at least one name came out of it |
 * | `no_candidate_qualified` | the sweep ran **completely** and nothing qualified |
 * | `discovery_not_run` | no universe, no budget left, or every required lane shut |
 * | `discovery_incomplete` | the sweep ran and some range failed, was not reached, or a required lane is not `open` |
 *
 * ⚠️ **More than one row holds at once, so the precedence is part of the contract:**
 * `discovery_not_run` > `discovery_incomplete` > `candidates_produced` >
 * `no_candidate_qualified`. A failed range **or** a required lane that is not `open`
 * outranks a produced candidate; the candidate is still counted and still reaches
 * the ledger, and what follows from the word is the cursor, which does not move.
 *
 * ⛔ **`no_candidate_qualified` is the expensive one and it has three guards.**
 * It may be reported only when the universe was declared, every lane this
 * strategy requires is `open`, and no symbol failed. Anything less is one of the
 * other two words, because "nothing qualified" is a claim about the market and
 * the other two are claims about the run.
 *
 * ⛔ **An undeclared universe is `unevaluated` and never `blocked`.** The book
 * whose universe is undeclared is exactly the book that still has to be watched
 * on the sell side — every held catalyst still gets re-read, every deadline
 * still gets adjudicated — so zero discovery capacity is a **report**, not a
 * stop. This is `managers/evidence-gated/lib/coverage.mjs`'s rule, kept.
 *
 * ── The sweep unit, which is not a symbol ──────────────────────────────────
 *
 * `fundamental-mean-reversion` sweeps symbols because its entrance is a price
 * series. This package's entrance is **an event**, so the unit swept is a range
 * of OpenDART receipts and the cursor is `{ kind: 'dart-receipt', value: <rcept_no> }`.
 * The host's filings index carries `rcept_no`, `rcept_dt` and `report_nm`, has
 * **no type filter and no since-cursor**, and always answers a fixed five-year
 * window newest-first (`skills/ct-event-sweep/SKILL.md` has the measured
 * contract). Incrementality is therefore ours: the last receipt this manager
 * fully read is the boundary, and everything above it is the range.
 *
 * ⛔ **The cursor never moves past a failed range.** A range that failed is
 * retried next run, and a cursor that walked over it would turn a transient
 * vendor refusal into a permanent hole in the record that nothing would ever
 * report. OpenDART's `020` (quota exhausted) is that refusal; its `013` (no
 * matching document) is **not** — it is a succeeded range that was empty, and a
 * run that confuses the two either stalls forever or skips a year of filings.
 */

/** The closed set. A fifth word is a status nobody can group a run by. */
export const DISCOVERY_STATUSES = Object.freeze([
  'candidates_produced',
  'no_candidate_qualified',
  'discovery_not_run',
  'discovery_incomplete',
])

/** `managers/evidence-gated/lib/coverage.mjs`'s lane vocabulary, unchanged. */
export const LANE_STATUSES = Object.freeze(['open', 'partial', 'dark', 'unstated'])

/**
 * ⛔ **Filing and web are both required here, and price is not.**
 * This desk's entrance is an event: a filing carries the event and the web
 * carries the policy gazette or the ministry notice that half of Korean
 * turnarounds actually begin in. Price is read later, to size a position and to
 * test the trim, and a run that never read one has still done discovery.
 * (`fundamental-mean-reversion` requires price and filing; `shareholder-rerating`
 * requires the same two as this one.)
 */
export const REQUIRED_LANES = Object.freeze(['filing', 'web'])
export const OPTIONAL_LANES = Object.freeze(['price'])

/** This package's cursor kind. FMR's is `symbol-index`; SR's is this one. */
export const CURSOR_KIND = 'dart-receipt'

/**
 * ── The host's own words for a lane, mapped rather than re-invented ────────
 *
 * `host-contracts-305.md` §4(b): `source_cache_read.state` is one of
 * `never-fetched | refresh-failed | fresh | stale`, and `source_cache_refresh.state`
 * one of `observed | observed-empty | satisfied | failed`. #305 says to map our
 * lane statuses onto those and not to build a second vocabulary beside them.
 *
 * ⚠️ **`observed-empty` is `open`.** The store was asked, answered, and holds no
 * document — which is the one reading in this whole file that really is a fact
 * about the *issuer* rather than about the run. `stale` is `partial` because the
 * answer is real and older than the freshness this run asked for.
 */
export const LANE_FROM_CACHE_STATE = Object.freeze({
  'never-fetched': 'unstated',
  'refresh-failed': 'dark',
  fresh: 'open',
  stale: 'partial',
  observed: 'open',
  'observed-empty': 'open',
  satisfied: 'open',
  failed: 'dark',
})

/**
 * ── The events this desk sweeps for, which are #305's four bullets ─────────
 *
 * 요금·단가 정상화 / 차환 확정·부채 감소·자산 매각 / 생산 재개·구조조정 완료 /
 * 미수금·재고·운전자본 정상화 또는 손실 축소.
 *
 * ⚠️ **`catalystKind` is the join to `lib/ledger.mjs`, and it is why the names
 * overlap where they can.** A sweep kind is what a `report_nm` looked like; a
 * catalyst kind is what a registered row is. Two sweep kinds (`asset-disposal`,
 * `restructuring-completion`) are spelled exactly as the ledger spells them
 * because they are the same event; the rest are narrower readings that fold into
 * one ledger kind, and the fold is written down here rather than guessed per run.
 *
 * ⚠️ **`channel` is `RECOVERY_CHANNELS`' own word**, so that a candidate found
 * by this sweep arrives at Stage 5 already saying which channel it claims — and
 * so that two events naming one channel cannot be counted as two improvements.
 */
export const SWEEP_EVENT_KINDS = Object.freeze({
  'tariff-or-price-normalisation': { catalystKind: 'tariff-or-price-revision', channel: 'regulated-price' },
  'refinancing-secured': { catalystKind: 'refinancing-or-capital-raise', channel: 'financing-cost' },
  'debt-reduction': { catalystKind: 'refinancing-or-capital-raise', channel: 'financing-cost' },
  'asset-disposal': { catalystKind: 'asset-disposal', channel: 'cash-flow' },
  'production-restart': { catalystKind: 'restructuring-completion', channel: 'operating-margin' },
  'restructuring-completion': { catalystKind: 'restructuring-completion', channel: 'operating-margin' },
  'working-capital-normalisation': { catalystKind: 'receivable-settlement', channel: 'receivable-balance' },
  'loss-narrowing': { catalystKind: 'earnings-release', channel: 'cash-flow' },
})

export const SWEEP_EVENT_KIND_NAMES = Object.freeze(Object.keys(SWEEP_EVENT_KINDS))

/**
 * The three links a candidate owes, in #305's own order:
 * **사건 → 매출/비용 → 현금흐름**, plus the period in which it can be checked.
 */
const TRACED_PATH_LINKS = Object.freeze(['event', 'revenueOrCost', 'cashFlow'])

const laneWord = (value) => {
  if (value === undefined || value === null) return 'unstated'
  if (value === true) return 'open'
  if (value === false) return 'dark'
  if (LANE_STATUSES.includes(value)) return value
  if (LANE_FROM_CACHE_STATE[value] !== undefined) return LANE_FROM_CACHE_STATE[value]
  return 'unstated'
}

const cursorOf = (value, atEpochMs) => {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return { kind: CURSOR_KIND, value, atEpochMs: atEpochMs ?? null }
  if (typeof value?.value !== 'string') return null
  return { kind: value.kind ?? CURSOR_KIND, value: value.value, atEpochMs: instantOf(value.atEpochMs) ?? atEpochMs ?? null }
}

const sameCursor = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.kind === b.kind && a.value === b.value)

/**
 * What one range of receipts actually was.
 *
 * `status` may be stated outright, or read off the OpenDART status code the
 * request came back with — and the second is preferred, because the codes are
 * the thing a run really holds and the translation is the part that goes wrong.
 */
function rangeOutcome(range) {
  const stated = range?.status
  if (['succeeded', 'failed', 'unreached'].includes(stated)) return { status: stated, dartStatus: range?.dartStatus ?? null }
  const dartStatus = range?.dartStatus ?? null
  if (dartStatus === null) return { status: 'unreached', dartStatus }
  if (dartStatus === '000') return { status: 'succeeded', dartStatus }
  /**
   * ⛔ **`013` is not a failure.** OpenDART answers `013` when the query matched
   * no document, and `host-contracts-305.md` §4 records that the host's own
   * cache turns it into `observed` with zero documents. A range that came back
   * `013` was read to the end and holds nothing; treating it as failed parks the
   * cursor on it forever and reports `discovery_incomplete` on a complete sweep.
   */
  if (dartStatus === '013') return { status: 'succeeded', dartStatus }
  return { status: 'failed', dartStatus }
}

/**
 * One discovery run's record, its candidates, and the ranges it owes a retry.
 *
 * `previous` is the **candidate ledger** this manager wrote last run, and the
 * three-state rule from `lib/ledger.mjs` applies to it unchanged: `undefined` is
 * nobody having read it, `null` is having read it and found it empty. The first
 * is `data_missing` and produces no candidate at all — a run that cannot tell a
 * new name from one it found three weeks ago must not write either down.
 */
export function discoveryRun({
  previous,
  runId = null,
  universe = null,
  ranges = [],
  lanes = {},
  researchCompleted = 0,
  filingsSpentOnHoldings = 0,
  uncertainty = undefined,
  asOf,
  config = {},
} = {}) {
  const diagnostics = []
  const causes = []

  const ledgerRead = previous !== undefined
  if (!ledgerRead) {
    causes.push(
      cause(
        'data_missing',
        'The candidate ledger was not read, so this run cannot tell a name it is seeing for the first time from one it has been researching for a month. Pass null to say the ledger was read and is empty; no candidate is created or advanced on an unknown record',
        'previous',
      ),
    )
  }

  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    diagnostics.push(diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf'))
    return {
      data: { run: emptyRecord(runId, null), observations: [], watching: [], failedRanges: [], eventsSeen: 0 },
      diagnostics,
      causes,
    }
  }

  const staleDays = finite(config.priorYearStaleDays) ? config.priorYearStaleDays : METHODOLOGY.priorYearStaleDays
  const budget = Number.isInteger(config.discoveryBudgetFilings) ? config.discoveryBudgetFilings : METHODOLOGY.discoveryBudgetFilings
  const floor = Number.isInteger(config.researchCompletionFloor) ? config.researchCompletionFloor : METHODOLOGY.researchCompletionFloor

  // ── ① the universe, which the host has no concept of ──────────────────────
  const universeDeclared = universe?.declared === true
  const universeSource = typeof universe?.source === 'string' ? universe.source : null
  const universeCount = Number.isInteger(universe?.count) ? universe.count : null
  if (!universeDeclared) {
    diagnostics.push(
      diagnostic(
        'universe_undeclared',
        'unevaluated',
        'No universe was declared, so there is no denominator for this sweep and no honest way to say nothing qualified. Declare the listing this run swept — the whole-market enumeration, or a stated subset with the reason it is a subset — before reading a discovery verdict',
        'universe',
        { source: universeSource, count: universeCount },
      ),
    )
  }

  // ── ② the ranges, in the order they were swept ────────────────────────────
  const cursorBefore = cursorOf(previous?.cursor)
  const swept = []
  let stopped = false
  let lastSucceededCursor = cursorBefore
  const symbolsAttempted = new Set()
  const symbolsFailed = new Set()
  const failedRanges = []

  for (const range of ranges) {
    const outcome = rangeOutcome(range)
    const cursor = cursorOf(range?.cursor, asOfInstant)
    const where = `ranges[${cursor?.value ?? '?'}]`
    if (cursor === null) {
      diagnostics.push(
        diagnostic('range_cursor_missing', 'blocked', `A swept range is identified by the receipt it ended on — { kind: '${CURSOR_KIND}', value: '<rcept_no>' } — and a range with no cursor cannot be resumed or retried`, where),
      )
      continue
    }
    if (cursor.kind !== CURSOR_KIND) {
      diagnostics.push(
        diagnostic('range_cursor_kind_unknown', 'blocked', `This package resumes on '${CURSOR_KIND}'. A cursor of another kind belongs to another manager's ledger`, `${where}.kind`, { kind: cursor.kind }),
      )
      continue
    }
    const symbols = Array.isArray(range?.symbols) ? range.symbols.filter((s) => typeof s === 'string' && s) : []
    for (const symbol of symbols) symbolsAttempted.add(symbol)

    if (outcome.status === 'succeeded' && !stopped) lastSucceededCursor = cursor
    if (outcome.status !== 'succeeded') {
      /**
       * ⛔ **The cursor stops here and does not resume after the gap.** Every
       * range after a failure is `unreached` for the purposes of the cursor even
       * if it was in fact read, because a cursor is a *low-water mark* and a
       * high-water mark with a hole in it is the record this whole file exists
       * to prevent.
       */
      stopped = true
      for (const symbol of symbols) symbolsFailed.add(symbol)
      failedRanges.push({
        kind: CURSOR_KIND,
        from: typeof range?.from === 'string' ? range.from : cursor.value,
        to: typeof range?.to === 'string' ? range.to : cursor.value,
        reasonCode: reasonCodeOf(range, outcome),
        firstFailedAtEpochMs: instantOf(range?.firstFailedAt) ?? asOfInstant,
        attempts: Number.isInteger(range?.attempts) && range.attempts > 0 ? range.attempts : 1,
      })
      if (outcome.dartStatus === '020') {
        diagnostics.push(
          diagnostic(
            'vendor_quota_exhausted',
            'unevaluated',
            'OpenDART answered 020 — the key\'s daily quota is spent. This range was not read, so it is a failed range and not an empty one, the cursor stays where it was, and the range is the first thing the next run retries',
            where,
            { dartStatus: outcome.dartStatus },
          ),
        )
      }
    }
    swept.push({ cursor, status: outcome.status, dartStatus: outcome.dartStatus, symbols, events: Array.isArray(range?.events) ? range.events : [] })
  }

  const attemptedFilings = swept.length
  if (attemptedFilings + filingsSpentOnHoldings > budget) {
    diagnostics.push(
      diagnostic(
        'discovery_budget_exceeded',
        'note',
        `This run touched ${attemptedFilings + filingsSpentOnHoldings} filings against a ${budget}-filing budget. The budget is a cost ceiling and not a correctness rule, so the sweep is recorded as it happened — what is not allowed is spending it and then reporting that nothing qualified`,
        'config.discoveryBudgetFilings',
        { attemptedFilings, filingsSpentOnHoldings, discoveryBudgetFilings: budget },
      ),
    )
  }
  const budgetSpentOnHoldings = filingsSpentOnHoldings >= budget && attemptedFilings === 0
  if (budgetSpentOnHoldings) {
    diagnostics.push(
      diagnostic(
        'discovery_budget_spent_on_holdings',
        'unevaluated',
        'The whole filing budget went on reviewing what is already held, so no range was swept. #305 is explicit that this is reported as discovery_not_run and never as «no new candidate was found»',
        'filingsSpentOnHoldings',
        { filingsSpentOnHoldings, discoveryBudgetFilings: budget },
      ),
    )
  }

  // ── ③ the lanes ──────────────────────────────────────────────────────────
  /**
   * ⚠️ **The filing lane is measured and the other two are stated.** This desk
   * swept the filings itself, so claiming that lane from an input rather than
   * from the ranges would be asking the run how it thinks it did. `lanes.filing`
   * is honoured only when no range was swept at all — a run that read the cache
   * and swept nothing still has a lane status to report.
   */
  const filingLaneStatus =
    swept.length === 0
      ? laneWord(lanes.filing)
      : swept.every((row) => row.status === 'succeeded')
        ? 'open'
        : swept.some((row) => row.status === 'succeeded')
          ? 'partial'
          : 'dark'
  const webLaneStatus = laneWord(lanes.web)
  const priceLaneStatus = laneWord(lanes.price)
  const laneByName = { filing: filingLaneStatus, web: webLaneStatus, price: priceLaneStatus }
  const requiredLanesOpen = REQUIRED_LANES.every((name) => laneByName[name] === 'open')
  const requiredLanesShut = REQUIRED_LANES.every((name) => laneByName[name] === 'dark' || laneByName[name] === 'unstated')
  for (const name of REQUIRED_LANES) {
    if (laneByName[name] === 'unstated') {
      diagnostics.push(
        diagnostic(
          'discovery_lane_unstated',
          'unevaluated',
          `The ${name} lane is required by this strategy and nobody said what it did. A lane nobody asked about is not a lane that was open, and defaulting it to open is how a run with no reach reports a clean screen`,
          `lanes.${name}`,
        ),
      )
    }
  }

  // ── ④ the events, and the one thing that makes a name a candidate ────────
  const carried = new Map(
    (Array.isArray(previous?.candidates) ? previous.candidates : []).map((row) => [`${row?.market ?? 'XKRX'}:${row?.symbol}`, row]),
  )
  const observations = []
  const watching = []
  const seenEvents = new Set()
  let gatePassed = 0

  for (const range of swept) {
    for (const event of range.events) {
      const where = `events[${event?.eventId ?? '?'}]`
      const symbol = typeof event?.symbol === 'string' ? event.symbol : null
      const market = typeof event?.market === 'string' ? event.market : 'XKRX'
      if (symbol === null) {
        diagnostics.push(diagnostic('event_symbol_missing', 'blocked', 'A swept event names the issuer it is about; a notice with no issuer is a policy document and not yet a candidate', `${where}.symbol`))
        continue
      }
      const key = `${market}:${symbol}`
      const publishedAt = instantOf(event?.publishedAt)
      if (publishedAt === null) {
        diagnostics.push(diagnostic('event_published_at_unreadable', 'blocked', 'publishedAt is the instant the document became public, and it has to parse', `${where}.publishedAt`))
        continue
      }
      if (publishedAt > asOfInstant) {
        diagnostics.push(diagnostic('event_after_as_of', 'blocked', 'This document did not exist at asOf', `${where}.publishedAt`, { publishedAt: event.publishedAt }))
        continue
      }

      /**
       * ⑵ **Last year's gazette makes no candidate at all.** Not a watch, not a
       * research row — nothing. Korean policy stories recur annually in
       * near-identical language, and the failure mode is re-registering last
       * year's notice as this year's news with a fresh discovery date on it. A
       * source past `priorYearStaleDays` has had a full reporting year to reach
       * the results; if it has not, the thing to record is that absence.
       */
      const ageDays = round((asOfInstant - publishedAt) / DAY_MS, 3)
      if (ageDays > staleDays) {
        diagnostics.push(
          diagnostic(
            'discovery_source_stale',
            'note',
            `This notice is ${ageDays} days old, past the ${staleDays}-day line, so it makes no candidate — not a watch either. A story that has had a full reporting year to appear in results and has not is an absence to record rather than a discovery to date today`,
            `${where}.publishedAt`,
            { ageDays, staleDays, symbol },
          ),
        )
        continue
      }

      const kind = event?.kind
      const known = SWEEP_EVENT_KINDS[kind] !== undefined
      if (!known) {
        diagnostics.push(
          diagnostic(
            'event_kind_unclassified',
            'unevaluated',
            `This run could not place ${kind ?? '(none)'} in the sweep vocabulary. OpenDART's index carries report_nm and no type filter, so the classification is ours — an unclassified event is left as something to look at again and never as something that qualified`,
            `${where}.kind`,
            { kind: kind ?? null, registered: SWEEP_EVENT_KIND_NAMES },
          ),
        )
        watching.push(watchRow({ symbol, market, event, kind: null, asOfInstant, reason: 'event_kind_unclassified' }))
        continue
      }

      /**
       * ⛔ **The traced path is the gate, and #305 wrote it: 사건 → 매출/비용 →
       * 현금흐름, with a period in which it can be checked.** A programme can be
       * real, funded and announced and still reach this issuer through an
       * assumption nobody has written down.
       *
       * ⚠️ **It is `unevaluated` and it is not a refutation.** Nothing here says
       * the path does not exist — it says this run did not write it down. So the
       * name goes to `watching`, keeps its evidence, and comes back; what it does
       * not do is become a position candidate. Calling this a refutation would
       * close the very cases this desk exists for on the grounds that the work
       * was not finished.
       */
      const path = event?.tracedPath ?? {}
      const missingLinks = TRACED_PATH_LINKS.filter((link) => typeof path[link] !== 'string' || path[link].trim().length < 4)
      const period = typeof event?.confirmablePeriod === 'string' && event.confirmablePeriod.trim().length >= 4
      if (missingLinks.length > 0 || !period) {
        diagnostics.push(
          diagnostic(
            'candidate_lacks_traced_path',
            'unevaluated',
            'This event has no written path from the event to this issuer\'s own revenue or cost and on to its cash flow, with a period in which it can be checked. That is not a finding against the company — it is an unfinished piece of work — so the name is watched rather than refused, and it is not a position candidate',
            where,
            { symbol, missingLinks, confirmablePeriod: period ? event.confirmablePeriod : null },
          ),
        )
        watching.push(watchRow({ symbol, market, event, kind, asOfInstant, reason: 'candidate_lacks_traced_path' }))
        continue
      }

      gatePassed += 1
      if (seenEvents.has(key)) {
        /**
         * ⚠️ Two events on one issuer are one candidate with two discovery
         * paths. `lib/candidate-memory.mjs` folds `discoveryPath` into a set for
         * the same reason: a second row for a name already in the ledger is a
         * duplicate proposal waiting to happen.
         */
        const existing = observations.find((row) => `${row.market}:${row.symbol}` === key)
        existing.discoveryPath = [...new Set([...existing.discoveryPath, `dart:${kind}`])]
        existing.evidenceIds = [...new Set([...existing.evidenceIds, ...evidenceOf(event)])]
        continue
      }
      seenEvents.add(key)
      observations.push({
        symbol,
        market,
        discoveredAtEpochMs: carried.get(key)?.discoveredAtEpochMs ?? publishedAt,
        lastSeenAtEpochMs: asOfInstant,
        discoveryPath: [`dart:${kind}`],
        hypothesis: typeof event?.hypothesis === 'string' ? event.hypothesis : null,
        evidenceIds: evidenceOf(event),
        eventKind: kind,
        catalystKind: SWEEP_EVENT_KINDS[kind].catalystKind,
        channel: SWEEP_EVENT_KINDS[kind].channel,
        confirmablePeriod: event.confirmablePeriod,
        tracedPath: { ...path },
      })
    }
  }

  /**
   * ⛔ **With the ledger unread, nothing is written.** The counts below would be
   * a guess — every name would read as new, including the three this manager has
   * been researching for a month — and a guess written into a durable record is
   * worse than an empty run.
   */
  const recordable = ledgerRead ? observations : []
  const newCandidates = recordable.filter((row) => !carried.has(`${row.market}:${row.symbol}`)).length
  const resumedCandidates = recordable.length - newCandidates
  const completed = Number.isInteger(researchCompleted) ? researchCompleted : 0

  if (recordable.length > 0 && completed < floor) {
    causes.push(
      cause(
        'research_incomplete',
        `This run produced ${recordable.length} candidate(s) and finished ${completed} of them, against a floor of ${floor}. Reading five names shallowly and stopping is the behaviour #305 forbids by name: take one to the end — the traced path, the survivability and the invalidation — or say which one is unfinished and what would finish it`,
        'researchCompleted',
        { researchCompleted: completed, researchCompletionFloor: floor, candidates: recordable.length },
      ),
    )
  }

  // ── ⑤ the decision table, in this order, first match wins ────────────────
  /**
   * ⛔ **The precedence is part of the contract, and this is the order it states:**
   *
   *   `discovery_not_run` > `discovery_incomplete` > `candidates_produced` > `no_candidate_qualified`
   *
   * ⚠️ **A required lane that is not `open` outranks a produced candidate, exactly
   * as a failed range does.** More than one row of the table holds at once whenever
   * a sweep put a name through the gate and a lane it requires answered for only
   * part of the range, and reporting that run by the candidate is #140 one step
   * over: how much of the market this run actually read is the fact a later reader
   * cannot reconstruct. The name is not lost — it is still counted in
   * `newCandidates` / `resumedCandidates`, still handed to the ledger, and
   * `candidates_produced_within_incomplete_sweep` below says so out loud. What
   * follows from the word is the cursor, which stays where it was found.
   *
   * ⚠️ **`dark` and `unstated` are not `open` either**, so they reach this branch
   * too — but only after `requiredLanesShut` has had its say above, because a run
   * whose every required lane was shut swept nothing at all and the word for that
   * is `discovery_not_run`.
   */
  const anyRangeFailed = swept.some((row) => row.status !== 'succeeded')
  const produced = newCandidates + resumedCandidates > 0
  let discoveryStatus
  if (!ledgerRead || !universeDeclared || budgetSpentOnHoldings || requiredLanesShut) discoveryStatus = 'discovery_not_run'
  else if (anyRangeFailed || symbolsFailed.size > 0 || !requiredLanesOpen) discoveryStatus = 'discovery_incomplete'
  else if (produced) discoveryStatus = 'candidates_produced'
  else discoveryStatus = 'no_candidate_qualified'

  if (discoveryStatus === 'discovery_incomplete' && produced) {
    /**
     * ⚠️ **`note`, and never `unevaluated`.** Nothing here is unread and nothing
     * here is a warning about the names: each one carries the written path from the
     * event to this issuer's own cash flow and they stand. What the entry records is
     * the *shape* of the run — candidates beside an unfinished sweep — so that a
     * reader who sees `discovery_incomplete` beside a non-zero `newCandidates` does
     * not read the pair as a contradiction.
     */
    diagnostics.push(
      diagnostic(
        'candidates_produced_within_incomplete_sweep',
        'note',
        `${newCandidates + resumedCandidates} name(s) came through the traced-path gate while part of this sweep was still unread. The candidates stand and are counted; the run is reported as discovery_incomplete and the cursor does not move, because the unread part is re-attempted before anything after it`,
        'discoveryStatus',
        {
          newCandidates,
          resumedCandidates,
          symbolsFailed: [...symbolsFailed].sort(),
          requiredLanes: Object.fromEntries(REQUIRED_LANES.map((name) => [name, laneByName[name]])),
        },
      ),
    )
  }

  /**
   * ⛔ **The cursor rule, and it is one line.** `cursorAfter === cursorBefore`
   * whenever the status is anything but `candidates_produced` or
   * `no_candidate_qualified` — the two words that mean *this run read its whole
   * range*. Everything else leaves the boundary exactly where it was found.
   */
  const advances = discoveryStatus === 'candidates_produced' || discoveryStatus === 'no_candidate_qualified'
  const cursorAfter = advances ? lastSucceededCursor : cursorBefore

  /**
   * ⚠️ **The undisclosed claim, copied from `discovery_lane_dark_undisclosed`.**
   * What is blocked is not the run — a run with no reach still watches the book
   * — but a **proposal** that had no discovery capacity and does not say so,
   * because that output is indistinguishable from a considered no-change. The
   * marker is the token `discovery_not_run` **verbatim** in one `uncertainty`
   * entry: a token rather than a phrase, because the prose around it is written
   * in the invocation's `language` and a matcher looking for English words would
   * pass every Korean run for the wrong reason.
   */
  const disclosed = Array.isArray(uncertainty)
    ? uncertainty.some((entry) => typeof entry === 'string' && entry.includes('discovery_not_run'))
    : null
  if (discoveryStatus === 'discovery_not_run' && disclosed === false) {
    diagnostics.push(
      diagnostic(
        'discovery_not_run_undisclosed',
        'blocked',
        'This run found no new name because it looked nowhere, and its proposal does not say so. Carry the token `discovery_not_run` verbatim in one uncertainty entry',
        'uncertainty',
        { entries: uncertainty.length, discoveryStatus },
      ),
    )
  }

  const run = {
    schemaVersion: 1,
    updatedAtEpochMs: asOfInstant,
    runId,
    universeDeclared,
    universeSource,
    universeCount,
    symbolsAttempted: symbolsAttempted.size,
    symbolsSucceeded: symbolsAttempted.size - symbolsFailed.size,
    symbolsFailed: [...symbolsFailed].sort(),
    gatePassed,
    newCandidates,
    resumedCandidates,
    researchCompleted: completed,
    cursorBefore,
    cursorAfter,
    priceLaneStatus,
    filingLaneStatus,
    webLaneStatus,
    discoveryStatus,
  }

  return {
    data: {
      run,
      observations: recordable,
      watching,
      failedRanges,
      eventsSeen: swept.reduce((total, row) => total + row.events.length, 0),
      cursorAdvanced: !sameCursor(cursorBefore, cursorAfter),
      ledgerRead,
      disclosed,
      requiredLanes: [...REQUIRED_LANES],
    },
    diagnostics,
    causes,
  }
}

function evidenceOf(event) {
  return Array.isArray(event?.evidenceIds) ? [...new Set(event.evidenceIds.filter((id) => typeof id === 'string' && id))] : []
}

function watchRow({ symbol, market, event, kind, asOfInstant, reason }) {
  return {
    symbol,
    market,
    state: 'watching',
    reasonCode: reason,
    lastSeenAtEpochMs: asOfInstant,
    discoveryPath: [kind === null ? 'dart:unclassified' : `dart:${kind}`],
    evidenceIds: evidenceOf(event),
    openQuestions: [
      reason === 'candidate_lacks_traced_path'
        ? 'Which filing or notice carries the mechanism from this event to this issuer\'s own revenue or cost, and in which reporting period would it be visible?'
        : 'What kind of event is this report_nm, in the sweep vocabulary?',
    ],
  }
}

function reasonCodeOf(range, outcome) {
  if (typeof range?.reasonCode === 'string' && range.reasonCode) return range.reasonCode
  if (outcome.dartStatus === '020') return 'vendor_quota_exhausted'
  if (outcome.status === 'unreached') return 'range_not_reached'
  return 'lane_query_failed'
}

function emptyRecord(runId, asOfInstant) {
  return {
    schemaVersion: 1,
    updatedAtEpochMs: asOfInstant,
    runId,
    universeDeclared: false,
    universeSource: null,
    universeCount: null,
    symbolsAttempted: 0,
    symbolsSucceeded: 0,
    symbolsFailed: [],
    gatePassed: 0,
    newCandidates: 0,
    resumedCandidates: 0,
    researchCompleted: 0,
    cursorBefore: null,
    cursorAfter: null,
    priceLaneStatus: 'unstated',
    filingLaneStatus: 'unstated',
    webLaneStatus: 'unstated',
    discoveryStatus: 'discovery_not_run',
  }
}

export const DISCOVERY_VOCABULARY = Object.freeze({
  statuses: DISCOVERY_STATUSES,
  laneStatuses: LANE_STATUSES,
  requiredLanes: REQUIRED_LANES,
  optionalLanes: OPTIONAL_LANES,
  cursorKind: CURSOR_KIND,
  eventKinds: SWEEP_EVENT_KIND_NAMES,
  catalystKinds: LEDGER_VOCABULARY.kinds,
  recoveryChannels: RECOVERY_CHANNELS,
  cacheStateMap: LANE_FROM_CACHE_STATE,
})
