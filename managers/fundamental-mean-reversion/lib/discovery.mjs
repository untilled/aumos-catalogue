/**
 * ── The discovery run: which names this run actually looked at, and what a
 *    zero means ─────────────────────────────────────────────────────────────
 *
 * #305 asks the same five questions of three packages: which set of symbols did
 * this run really read, how was it read incrementally, when does the web open a
 * new candidate, where does the next run resume, and — the one that matters —
 * **is a zero-candidate run a screen that found nothing or a run that read
 * nothing?** Those two are indistinguishable in prose and they are opposite
 * facts, so the record is arithmetic here rather than a sentence.
 *
 * ⚠️ **Vendored, deliberately, and this is the FMR copy.** The identical record
 * lives in `managers/catalyst-turnaround/lib/discovery.mjs` and
 * `managers/shareholder-rerating/lib/discovery.mjs`. The three are siblings and
 * not imports: `CONTRIBUTING.md` forbids a package reaching into another
 * package's `lib/`, because a published ManagerPackage is installed on its own
 * and an import across that boundary is a dependency the host never resolves.
 * The field names are identical on purpose — `docs/contracts/discovery-run.md`
 * is the one document all three are read against — and what differs is stated in
 * one place each:
 *
 * | | FMR (here) | catalyst-turnaround | shareholder-rerating |
 * |---|---|---|---|
 * | required lanes | **price, filing** | filing, web | filing, web |
 * | optional lane | web | price | price |
 * | cursor kind | **`symbol-index`** | `dart-receipt` | `dart-receipt` |
 * | severity words | **info / unevaluated / blocked** | blocked / unevaluated / note | its own |
 *
 * ⛔ **A lane nobody asked about is `unstated`, never `open`.** The vocabulary is
 * `evidence-gated/lib/coverage.mjs`'s `discoveryCapacity` unchanged, for the
 * reason that file gives: the run that measured #140 had *both* discovery
 * branches shut and answered a `WAIT` that read exactly like a considered
 * no-change. Defaulting the unasked half to open reproduces it.
 *
 * ⛔ **And an undeclared universe is `unevaluated`, never `blocked`.** The book
 * whose universe nobody declared is precisely the book that still has to be
 * watched on the sell side — Stage 1 runs on holdings alone. Zero discovery is a
 * *report*.
 */
import { SEVERITIES, diagnostic, finite, isBlocked } from './core.mjs'

/** The closed set. A fifth status is a fourth question nobody asked. */
export const DISCOVERY_STATUSES = Object.freeze([
  'candidates_produced',
  'no_candidate_qualified',
  'discovery_not_run',
  'discovery_incomplete',
])

/** From `evidence-gated`'s `discoveryCapacity`, unchanged. */
export const LANE_STATUSES = Object.freeze(['open', 'partial', 'dark', 'unstated'])

/**
 * ⚠️ **This package's own answer, and the one place it differs from its
 * siblings.** A mean-reversion candidate is found by a price sweep and is
 * refused by a filing; the web is corroboration. So `price` and `filing` are
 * required and `web` is optional — the inverse of `catalyst-turnaround`, which
 * is found by an event and only sized by a price.
 */
export const REQUIRED_LANES = Object.freeze(['price', 'filing'])
export const OPTIONAL_LANES = Object.freeze(['web'])
export const LANES = Object.freeze([...REQUIRED_LANES, ...OPTIONAL_LANES])

/** FMR sweeps a roster in symbol order; CT and SR page a receipt number. */
export const CURSOR_KIND = 'symbol-index'

/** What `researchShortlistSize` is when no `config` block arrived at all. */
export const DEFAULT_SHORTLIST_SIZE = 3
export const DEFAULT_DISCOVERY_BUDGET_SYMBOLS = 120
export const DEFAULT_RESEARCH_COMPLETION_FLOOR = 1

/**
 * ⛔ **The ranking this methodology forbids by name.** #305: *"가격 하락 깊이
 * 하나로 shortlist 순위를 정하지 않는다."* The deepest faller is the name most
 * likely to have fallen for a reason, so a shortlist sorted by depth is sorted
 * by the probability of being right about the fall — the opposite of what the
 * ordering implies it is doing.
 */
const DEPTH_ONLY_BASES = Object.freeze(['drawdown', 'drawdown-depth', 'depth', 'fall-depth', 'drawdownFromHigh', 'deepest-fall'])

const laneOf = (value) => (LANE_STATUSES.includes(value) ? value : 'unstated')

function instantOf(value) {
  if (finite(value)) return value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function cursorOf(value, atEpochMs) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return { kind: CURSOR_KIND, value, atEpochMs }
  if (typeof value.value !== 'string' || value.value === '') return null
  return {
    kind: typeof value.kind === 'string' && value.kind ? value.kind : CURSOR_KIND,
    value: value.value,
    atEpochMs: instantOf(value.atEpochMs) ?? atEpochMs,
  }
}

/**
 * The run's own record, and the shortlist it is allowed to carry forward.
 *
 * `universe`     `{ declared, source, count }` — `declared` is a positive claim
 *                and an absent `universe` is *not* a declaration of an empty one.
 * `gateResults`  one row per symbol the gate was actually run on:
 *                `{ symbol, market?, researchOpen, rankBasis?, resumed?,
 *                   researchCompleted?, drawdown? }`.
 * `laneStatuses` `{ price, filing, web }`, each one of `LANE_STATUSES`.
 * `uncertainty`  this run's `DecisionProposal.rationale.uncertainty`, when it
 *                exists. Omitted leaves the disclosure **unjudged**, not passed.
 */
export function discoveryRun({
  universe = undefined,
  attempted = null,
  succeeded = null,
  failed = [],
  gateResults = [],
  previousCursor = undefined,
  proposedCursor = undefined,
  laneStatuses = {},
  budgetSpentOnHoldings = null,
  rangeComplete = null,
  uncertainty = undefined,
  runId = null,
  asOf = null,
  config = {},
} = {}) {
  const diagnostics = []
  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    return {
      data: null,
      diagnostics: [diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf', { asOf })],
    }
  }

  // ── ① the universe, which is a claim and not an absence ───────────────────
  const universeDeclared = universe?.declared === true
  const universeSource = typeof universe?.source === 'string' && universe.source ? universe.source : null
  const universeCount = Number.isInteger(universe?.count) ? universe.count : null
  if (!universeDeclared) {
    diagnostics.push(diagnostic(
      'universe_undeclared',
      'unevaluated',
      'This run named no universe, so it screened nothing and it cannot say that nothing qualified. ⛔ This is never blocked: holdings and armed watches are still reviewed, and a book whose universe nobody declared is exactly the book that still has to be watched on the sell side',
      'universe',
      { universe: universe ?? null },
    ))
  } else if (universeSource === null) {
    diagnostics.push(diagnostic('universe_source_unnamed', 'unevaluated', 'A declared universe says where the roster came from — the route, not a description of it, e.g. toss:/api/v1/stocks/all', 'universe.source'))
  }

  // ── ② the lanes ───────────────────────────────────────────────────────────
  const lanes = {}
  for (const lane of LANES) lanes[lane] = laneOf(laneStatuses?.[lane])
  const unstatedRequired = REQUIRED_LANES.filter((lane) => lanes[lane] === 'unstated')
  if (unstatedRequired.length > 0) {
    diagnostics.push(diagnostic(
      'discovery_lane_unstated',
      'unevaluated',
      `A discovery lane nobody asked about is not a lane that was open. This package requires ${REQUIRED_LANES.join(' and ')}; say open, partial or dark for each`,
      'laneStatuses',
      { unstated: unstatedRequired, required: REQUIRED_LANES, optional: OPTIONAL_LANES },
    ))
  }
  const requiredOpen = REQUIRED_LANES.every((lane) => lanes[lane] === 'open')
  const requiredShut = REQUIRED_LANES.every((lane) => lanes[lane] === 'dark' || lanes[lane] === 'unstated')
  const requiredPartial = REQUIRED_LANES.some((lane) => lanes[lane] === 'partial')

  // ── ③ the sweep's own arithmetic ──────────────────────────────────────────
  const symbolsFailed = (Array.isArray(failed) ? failed : []).filter((symbol) => typeof symbol === 'string' && symbol).slice(0, 200)
  const rows = Array.isArray(gateResults) ? gateResults : []
  const symbolsAttempted = Number.isInteger(attempted) ? attempted : rows.length + symbolsFailed.length
  const symbolsSucceeded = Number.isInteger(succeeded) ? succeeded : rows.length
  if (symbolsSucceeded + symbolsFailed.length !== symbolsAttempted) {
    diagnostics.push(diagnostic(
      'sweep_counts_inconsistent',
      'unevaluated',
      'symbolsSucceeded + symbolsFailed does not equal symbolsAttempted, so this run cannot say which part of the roster it read',
      'symbolsAttempted',
      { symbolsAttempted, symbolsSucceeded, symbolsFailed: symbolsFailed.length },
    ))
  }
  const budgetSymbols = Number.isInteger(config?.discoveryBudgetSymbols) ? config.discoveryBudgetSymbols : DEFAULT_DISCOVERY_BUDGET_SYMBOLS
  if (symbolsAttempted > budgetSymbols) {
    diagnostics.push(diagnostic(
      'discovery_budget_exceeded',
      'info',
      `This sweep read ${symbolsAttempted} symbols against a budget of ${budgetSymbols}. The budget is what one run can read without starving the research it exists to feed`,
      'symbolsAttempted',
      { symbolsAttempted, budgetSymbols },
    ))
  }

  const passed = rows.filter((row) => row?.researchOpen === true && typeof row?.symbol === 'string' && row.symbol)
  const gatePassed = passed.length
  const newCandidates = passed.filter((row) => row.resumed !== true).length
  const resumedCandidates = passed.filter((row) => row.resumed === true).length
  const researchCompleted = rows.filter((row) => row?.researchCompleted === true).length

  // ── ④ the shortlist, which is a hard cut and not an intention ─────────────
  const statedBases = passed.map((row) => (typeof row.rankBasis === 'string' && row.rankBasis ? row.rankBasis : null))
  const depthBases = statedBases.filter((basis) => basis !== null && DEPTH_ONLY_BASES.includes(basis))
  const noBasisStated = statedBases.every((basis) => basis === null)
  /**
   * The structural half of the same rule: with no basis stated at all, an order
   * that is **strictly monotone in drawdown** across three or more names is a
   * depth ranking, whatever it is called — deepest-first and shallowest-first are
   * the same sort read from opposite ends. Three is the floor because two names
   * in either order are also alphabetical, and a coincidence is not a finding. A
   * row that states its basis is exempt: what is being caught is the ordering
   * nobody would defend if they had to write it down.
   */
  const depths = passed.map((row) => (finite(row.drawdown) ? row.drawdown : null))
  const monotone = (direction) => depths.every((value, index) => index === 0 || (direction > 0 ? value > depths[index - 1] : value < depths[index - 1]))
  const orderedByDepth =
    noBasisStated &&
    depths.length >= 3 &&
    depths.every((value) => value !== null) &&
    (monotone(1) || monotone(-1))
  if (depthBases.length > 0 || orderedByDepth) {
    diagnostics.push(diagnostic(
      'shortlist_ranked_by_depth',
      'blocked',
      'The shortlist is ordered by how far the price fell. The deepest faller is the name most likely to have fallen for a reason, so this ordering ranks by the probability of the fall being correct. Rank on the research question — which fall this desk can actually decompose, and whose evidence is reachable',
      'gateResults[].rankBasis',
      { statedBases: depthBases, inferredFromOrder: orderedByDepth, forbidden: DEPTH_ONLY_BASES },
    ))
  } else if (noBasisStated && gatePassed > 0) {
    diagnostics.push(diagnostic(
      'shortlist_rank_basis_unstated',
      'unevaluated',
      'No row says what the shortlist is ordered on, so the one ordering this methodology forbids cannot be ruled out. State rankBasis per row',
      'gateResults[].rankBasis',
    ))
  }

  const configuredSize = config?.researchShortlistSize
  const shortlistSize = Number.isInteger(configuredSize) && configuredSize >= 1 && configuredSize <= 10 ? configuredSize : DEFAULT_SHORTLIST_SIZE
  const shortlist = passed.slice(0, shortlistSize).map((row) => ({
    symbol: row.symbol,
    market: typeof row.market === 'string' && row.market ? row.market : 'XKRX',
    rankBasis: typeof row.rankBasis === 'string' && row.rankBasis ? row.rankBasis : null,
    resumed: row.resumed === true,
  }))
  if (gatePassed > shortlist.length) {
    diagnostics.push(diagnostic(
      'shortlist_truncated',
      'info',
      `${gatePassed} names passed the gate and ${shortlist.length} are carried forward. The rest are not rejections: leave each one its open question and its re-review condition, because fewer finished beats more sampled`,
      'shortlist',
      { gatePassed, shortlistSize, dropped: passed.slice(shortlist.length).map((row) => row.symbol) },
    ))
  }

  // ── ⑤ the decision table, applied in this order and no other ──────────────
  const budgetSpent = budgetSpentOnHoldings === true
  let discoveryStatus
  if (!universeDeclared || budgetSpent || requiredShut) {
    discoveryStatus = 'discovery_not_run'
  } else if (requiredPartial || !requiredOpen || symbolsFailed.length > 0 || rangeComplete === false) {
    discoveryStatus = 'discovery_incomplete'
  } else if (shortlist.length > 0) {
    discoveryStatus = 'candidates_produced'
  } else {
    /**
     * ⛔ Reached only here, and the guard is restated rather than inherited from
     * the branch above: a zero that means «the screen ran and nothing qualified»
     * requires a declared universe, every required lane open, and no failed
     * symbol. If any of the three is missing the honest answer is that the sweep
     * is unfinished, and `no_candidate_qualified` is never reached by fallthrough.
     */
    discoveryStatus = universeDeclared && requiredOpen && symbolsFailed.length === 0 ? 'no_candidate_qualified' : 'discovery_incomplete'
  }

  if (discoveryStatus === 'discovery_not_run') {
    diagnostics.push(diagnostic(
      'discovery_not_run',
      'unevaluated',
      'This run read no universe. ⛔ Do not write that no candidate was found: carry the token discovery_not_run verbatim in one uncertainty entry and say which of the three reasons it was',
      'discoveryStatus',
      {
        universeDeclared,
        budgetSpentOnHoldings: budgetSpent,
        requiredLanes: Object.fromEntries(REQUIRED_LANES.map((lane) => [lane, lanes[lane]])),
      },
    ))
    /**
     * ⚠️ **The disclosure round trip, copied from `evidence-gated`'s
     * `discovery_lane_dark_undisclosed`.** What is refused is not the run — it is
     * a *proposal* that had zero discovery capacity and does not say so, which is
     * the output an investor cannot tell from a considered no-change. The marker
     * is the token `discovery_not_run` **verbatim**, because the prose around it
     * is written in the invocation's `language` and a matcher looking for English
     * words would pass every Korean run for the wrong reason.
     *
     * Omitting `uncertainty` leaves it unjudged: a call made before the proposal
     * exists has nothing to read.
     */
    if (Array.isArray(uncertainty)) {
      const disclosed = uncertainty.some((entry) => typeof entry === 'string' && entry.includes('discovery_not_run'))
      if (!disclosed) {
        diagnostics.push(diagnostic(
          'discovery_not_run_undisclosed',
          'blocked',
          'This proposal was produced by a run that screened nothing and does not say so. One uncertainty entry carries the token discovery_not_run verbatim; the sentence around it is yours and is written in the invocation language',
          'uncertainty',
          { entries: uncertainty.length },
        ))
      }
    }
  }

  if (discoveryStatus === 'discovery_incomplete' && shortlist.length > 0) {
    diagnostics.push(diagnostic(
      'candidates_produced_within_incomplete_sweep',
      'info',
      'Names qualified, and part of the roster was still not read. The candidates stand; the cursor does not move, because the unread part is retried before anything after it',
      'discoveryStatus',
      { shortlist: shortlist.map((row) => row.symbol), symbolsFailed },
    ))
  }

  const completionFloor = Number.isInteger(config?.researchCompletionFloor) && config.researchCompletionFloor >= 1 && config.researchCompletionFloor <= 3
    ? config.researchCompletionFloor
    : DEFAULT_RESEARCH_COMPLETION_FLOOR
  if (discoveryStatus === 'candidates_produced' && researchCompleted < completionFloor) {
    diagnostics.push(diagnostic(
      'research_completion_floor_unmet',
      'unevaluated',
      `This run carried ${shortlist.length} name(s) forward and finished ${researchCompleted}, below the floor of ${completionFloor}. Reading many names shallowly and stopping is the failure #256 names; finish one or say why none could be finished`,
      'researchCompleted',
      { researchCompleted, completionFloor, shortlist: shortlist.length },
    ))
  }

  // ── ⑥ the cursor, which never moves past a range that failed ──────────────
  const cursorBefore = cursorOf(previousCursor, asOfInstant)
  const advancing = discoveryStatus === 'candidates_produced' || discoveryStatus === 'no_candidate_qualified'
  const proposed = cursorOf(proposedCursor, asOfInstant)
  let cursorAfter = cursorBefore
  if (advancing) {
    if (proposed === null) {
      diagnostics.push(diagnostic(
        'cursor_not_advanced',
        'info',
        'The sweep completed and named no new cursor, so the next run re-reads the same range. Name the last symbol this run actually finished',
        'proposedCursor',
      ))
    } else {
      cursorAfter = { ...proposed, atEpochMs: asOfInstant }
    }
  } else if (proposed !== null && cursorBefore !== null && proposed.value !== cursorBefore.value) {
    diagnostics.push(diagnostic(
      'cursor_advanced_past_failed_range',
      'blocked',
      `This run ended ${discoveryStatus} and handed back a cursor beyond the one it started from. A cursor that steps over an unread range deletes that range permanently — nothing later ever looks at it again`,
      'proposedCursor',
      { cursorBefore: cursorBefore.value, proposed: proposed.value, discoveryStatus, symbolsFailed },
    ))
  } else if (proposed !== null && cursorBefore === null && symbolsFailed.length > 0) {
    diagnostics.push(diagnostic(
      'cursor_advanced_past_failed_range',
      'blocked',
      'Symbols failed in this sweep and a cursor was handed back anyway. The failed range is retried first on the next run, so the cursor stays where it was',
      'proposedCursor',
      { proposed: proposed.value, symbolsFailed },
    ))
  }

  const record = {
    schemaVersion: 1,
    updatedAtEpochMs: asOfInstant,
    runId: typeof runId === 'string' && runId ? runId : null,
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
  }

  return { data: { ...record, shortlist }, diagnostics }
}

/** What the verifier and `ARCHITECTURE.md` read rather than retype. */
export const DISCOVERY_VOCABULARY = Object.freeze({
  statuses: DISCOVERY_STATUSES,
  lanes: LANE_STATUSES,
  requiredLanes: REQUIRED_LANES,
  optionalLanes: OPTIONAL_LANES,
  cursorKind: CURSOR_KIND,
  severities: SEVERITIES,
  forbiddenRankBases: DEPTH_ONLY_BASES,
})

/** Used by `lib/index.mjs` to decide whether the answer is `ok` or `refused`. */
export function discoveryRefused(diagnostics) {
  return isBlocked(diagnostics)
}
