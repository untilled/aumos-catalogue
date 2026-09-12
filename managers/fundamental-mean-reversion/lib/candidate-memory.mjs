/**
 * ── The candidate ledger: the only durable state this manager owns ─────────
 *
 * #305 §"공통 수집, 전략별 후보 장부": the *way* a roster and a filing are
 * fetched is common, and the *candidate* — its hypothesis, how far the research
 * got, what is still unanswered and when to come back — is each strategy's own.
 * This file is that ledger for `fundamental-mean-reversion`, and it holds six
 * things and nothing else: the name, when it was found and by which path, the
 * state it is in, one sentence of hypothesis, the host's own `evidenceId`
 * references, and the cursor plus the ranges that failed.
 *
 * ⛔ **It is not a source cache and not an account.** Prices come back from the
 * Toss connection and filings from the host source cache on every run;
 * `portfolio_get` owns holdings, cash and open proposals. `memoryHoldsVendorPayload`
 * below refuses a write that copies any of them, because a private folder that
 * quietly becomes a second price database is the failure #305 puts in its own
 * out-of-scope list.
 *
 * ⚠️ **Vendored, deliberately, and this is the FMR copy.** The siblings are
 * `managers/catalyst-turnaround/lib/candidate-memory.mjs` (its rows carry
 * `catalystIds[]` into that package's register) and
 * `managers/shareholder-rerating/lib/candidate-memory.mjs` (`programmeIds[]`).
 * A published ManagerPackage is installed alone, so a cross-package import is a
 * dependency the host never resolves — `CONTRIBUTING.md` forbids it and the
 * three files are kept identical by `docs/contracts/discovery-run.md` and by
 * three verifiers rather than by a shared module. What differs here: `strategy`
 * is `fundamental-mean-reversion`, the cursor kind is `symbol-index`, and the
 * severity words are this package's `info / unevaluated / blocked`.
 *
 * ── What it borrows, and from where ────────────────────────────────────────
 *
 * The `previous` → `nextLedger` carry-forward, the epoch-milliseconds encoding
 * of every persisted instant, the `previousRead` / `previousExtraKeys` reporting
 * and the 200-row / 60 KB caps are `evidence-gated/lib/research-state.mjs`'s,
 * for the reason that file gives at length: a key that refuses its own stored
 * value is a key that self-locks on the first malformed write. The
 * undefined-versus-null discriminator and the *record only grows* rule are
 * `catalyst-turnaround/lib/ledger.mjs`'s.
 *
 * ⛔ **`previous === undefined` is not `previous === null`.** `undefined` is
 * nobody having read the ledger — a `files_read` that was never made or failed —
 * and the answer is `data_missing` with no candidate created and no state
 * advanced. `null` is the ledger having been read and found empty, which is an
 * ordinary first run and re-seeds. Defaulting one to the other is how a resumed
 * candidate reads as a new discovery and gets researched from scratch forever.
 *
 * ⚠️ **Persisted instants are numbers with an `…EpochMs` suffix.** A
 * `nextReviewAtEpochMs` is in the future by construction, and a host that walks
 * a payload for post-`asOf` string timestamps refuses the whole read.
 */
import { DIAGNOSIS_CODES, diagnostic, finite, isBlocked } from './core.mjs'

export const SCHEMA_VERSION = 1
export const STRATEGY = 'fundamental-mean-reversion'
export const LEDGER_CURSOR_KIND = 'symbol-index'

/** The path this package writes, as one document. See `skills/fmr-universe-sweep`. */
export const LEDGER_PATH = 'state/candidates.json'

/** `discovered → triaged → researching → watching | proposed | excluded`. */
export const CANDIDATE_STATES = Object.freeze(['discovered', 'triaged', 'researching', 'watching', 'proposed', 'excluded'])

export const CANDIDATE_TRANSITIONS = Object.freeze({
  discovered: Object.freeze(['triaged', 'excluded']),
  triaged: Object.freeze(['researching', 'watching', 'excluded']),
  researching: Object.freeze(['watching', 'proposed', 'excluded']),
  watching: Object.freeze(['researching', 'proposed', 'excluded']),
  proposed: Object.freeze(['watching', 'researching', 'excluded']),
  /** ⚠️ The one re-entry, and it costs a reason and new evidence. */
  excluded: Object.freeze(['researching']),
})

/** The rank of each state, so a move backwards is arithmetic and not a judgement. */
const STATE_RANK = Object.freeze({ discovered: 0, triaged: 1, researching: 2, watching: 3, proposed: 4, excluded: 5 })

export const CAPS = Object.freeze({
  candidates: 200,
  serialisedBytes: 60000,
  evidenceIdsPerCandidate: 8,
  hypothesisChars: 280,
  symbolChars: 32,
})

/**
 * ⛔ **The content this ledger may never hold**, asserted here and again in
 * `tools/verify-fundamental-mean-reversion.mjs`. Two families: copied vendor
 * payload (bars, statement rows, a filing's own words) and copied account state
 * (quantity, cash, an open proposal's weight). Each is re-read from its owner on
 * every run, and a stale second copy is worse than no copy because it answers.
 */
export const FORBIDDEN_KEYS = Object.freeze([
  'open', 'high', 'low', 'close', 'volume', 'bars', 'rows', 'candles', 'prices', 'series',
  'excerpt', 'body', 'fullText',
  'quantity', 'weight', 'cash', 'averageCost', 'targetWeight', 'targetWeights', 'pending', 'proposals', 'holdings',
])

/** The known keys of a stored ledger. Anything else is reported and not carried. */
const LEDGER_KEYS = Object.freeze(['schemaVersion', 'strategy', 'ruleVersion', 'updatedAtEpochMs', 'cursor', 'failedRanges', 'candidates'])

/**
 * The read/migration table, published so `ARCHITECTURE.md` and the verifier read
 * it rather than restate it.
 *
 * | `previous` | reading | `nextLedger` |
 * |---|---|---|
 * | `undefined` | **`data_missing`** — nobody read it | `null` |
 * | `null` | `absent` — read and empty | seeded |
 * | not an object | `unparseable` — degraded to empty | seeded |
 * | no `schemaVersion` | `degraded` — the pre-contract hand-written blob | seeded |
 * | `schemaVersion` present ≠ 1 | **refused** — a writer this code does not know | `null` |
 * | `updatedAtEpochMs` > `asOf` | **refused** — a later run's judgement, backwards | `null` |
 * | `schemaVersion` 1 | `rows` | carried |
 */
export const LEDGER_MIGRATIONS = Object.freeze([
  Object.freeze({ previous: 'undefined', reading: 'unread', outcome: 'data_missing', nextLedger: null }),
  Object.freeze({ previous: 'null', reading: 'absent', outcome: 'seed', nextLedger: 'seeded' }),
  Object.freeze({ previous: 'not-an-object', reading: 'unparseable', outcome: 'degrade', nextLedger: 'seeded' }),
  Object.freeze({ previous: 'no-schema-version', reading: 'degraded', outcome: 'degrade', nextLedger: 'seeded' }),
  Object.freeze({ previous: 'unknown-schema-version', reading: 'refused', outcome: 'refuse', nextLedger: null }),
  Object.freeze({ previous: 'updated-after-as-of', reading: 'refused', outcome: 'refuse', nextLedger: null }),
  Object.freeze({ previous: 'schema-version-1', reading: 'rows', outcome: 'carry', nextLedger: 'carried' }),
])

/**
 * A cause, in this package's four-word vocabulary (`lib/core.mjs`
 * `DIAGNOSIS_CODES`). ⛔ It throws on a fifth: #254's whole point is that
 * absence, incompleteness, refutation and a full book are four different states,
 * and a new word here would be a fifth that nothing downstream distinguishes.
 */
function cause(code, message, path, details = {}) {
  if (!DIAGNOSIS_CODES.includes(code)) throw new Error(`unknown diagnosis code ${code}; this package publishes ${DIAGNOSIS_CODES.join(', ')}`)
  return { code, message, ...(path ? { path } : {}), details }
}

function instantOf(value) {
  if (finite(value)) return value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const keyOf = (market, symbol) => `${market ?? 'XKRX'}:${symbol}`

/** Depth-limited walk for copied vendor payload and copied account state. */
function forbiddenContent(value, path = '', depth = 0, found = []) {
  if (depth > 6 || value === null || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    if (value.length > 8 && value.every((entry) => typeof entry === 'number')) found.push({ path, reason: 'numeric-array', length: value.length })
    for (const [index, entry] of value.entries()) forbiddenContent(entry, `${path}[${index}]`, depth + 1, found)
    return found
  }
  for (const [key, entry] of Object.entries(value)) {
    const where = path ? `${path}.${key}` : key
    if (FORBIDDEN_KEYS.includes(key)) found.push({ path: where, reason: 'forbidden-key', key })
    forbiddenContent(entry, where, depth + 1, found)
  }
  return found
}

/**
 * The ledger for one run.
 *
 * `previous`     what `files_read` returned for `state/candidates.json`, or
 *                `undefined` if it was not read at all.
 * `observations` one row per candidate this run saw:
 *                `{ symbol, market?, discoveryPath, hypothesis?, sectionsComplete?,
 *                   openQuestions?, evidenceIds?, nextReviewAtEpochMs?,
 *                   nextReviewCondition?, excludedReasonCode? }`.
 * `transitions`  `{ symbol, market?, to, atEpochMs, evidenceIds?, reentryReason? }`.
 * `ruleVersion`  the gate version this run judged under, e.g. `fmr-gate-1`.
 */
export function candidateLedger({
  previous = undefined,
  observations = [],
  transitions = [],
  failedRanges = [],
  resolvedRanges = [],
  cursor = undefined,
  asOf = null,
  ruleVersion = null,
} = {}) {
  const diagnostics = []
  const causes = []

  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    return {
      data: { rows: [], summary: null, nextLedger: null },
      diagnostics: [diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf', { asOf })],
      causes,
    }
  }
  const currentRuleVersion = typeof ruleVersion === 'string' && ruleVersion ? ruleVersion : null
  if (currentRuleVersion === null) {
    diagnostics.push(diagnostic('rule_version_unstated', 'unevaluated', 'A candidate row records the gate version it was judged under; without one, a later change of the gate cannot be told from a candidate that was never re-judged', 'ruleVersion'))
  }

  // ── ① the read, and the discriminator that is the whole of this file ──────
  const ledgerRead = previous !== undefined
  if (!ledgerRead) {
    causes.push(cause(
      'data_missing',
      'The candidate ledger was not read, so no candidate is known to exist and none may be created or advanced on this run. Pass null to say it was read and is empty — a resumed candidate and a first discovery are indistinguishable without that difference',
      'previous',
    ))
    diagnostics.push(diagnostic(
      'candidate_ledger_unread',
      'unevaluated',
      'Nothing was read from state/candidates.json. This run may still review holdings and armed watches; it may not open, advance or close a candidate',
      'previous',
    ))
    return {
      data: { rows: [], summary: { total: 0, ledgerRead: false, previousRead: 'unread', previousExtraKeys: [], byState: {}, newThisRun: 0, resumed: 0, requiresReevaluation: [], failedRanges: 0 }, nextLedger: null },
      diagnostics,
      causes,
    }
  }

  let previousRead
  let carriedCandidates = []
  let carriedRanges = []
  let carriedCursor = null
  let previousExtraKeys = []

  if (previous === null) {
    previousRead = 'absent'
  } else if (typeof previous !== 'object' || Array.isArray(previous)) {
    previousRead = 'unparseable'
  } else {
    const storedVersion = previous.schemaVersion
    const storedAt = instantOf(previous.updatedAtEpochMs)
    if (storedVersion !== undefined && storedVersion !== null && storedVersion !== SCHEMA_VERSION) {
      diagnostics.push(diagnostic(
        'candidate_ledger_version_unknown',
        'blocked',
        `state/candidates.json was written by schemaVersion ${storedVersion} and this package reads ${SCHEMA_VERSION}. Its rows may be shaped in a way this code would misread or silently drop, and dropping research history is the failure this file exists to avoid`,
        'previous.schemaVersion',
        { stored: storedVersion, known: SCHEMA_VERSION },
      ))
      return { data: { rows: [], summary: null, nextLedger: null }, diagnostics, causes }
    }
    if (storedAt !== null && storedAt > asOfInstant) {
      diagnostics.push(diagnostic(
        'candidate_ledger_from_the_future',
        'blocked',
        'The stored ledger was written after asOf. It can hold only past-dated rows and still leak a later run’s judgement backwards into this one',
        'previous.updatedAtEpochMs',
        { updatedAtEpochMs: storedAt, asOfEpochMs: asOfInstant },
      ))
      return { data: { rows: [], summary: null, nextLedger: null }, diagnostics, causes }
    }
    previousRead = storedVersion === undefined || storedVersion === null ? 'degraded' : 'rows'
    carriedCandidates = Array.isArray(previous.candidates) ? previous.candidates : []
    carriedRanges = Array.isArray(previous.failedRanges) ? previous.failedRanges : []
    carriedCursor = previous.cursor ?? null
    previousExtraKeys = Object.keys(previous).filter((key) => !LEDGER_KEYS.includes(key)).sort().slice(0, 32)
  }

  // ── ② forbidden content, before anything is written anywhere ──────────────
  const offences = [
    ...forbiddenContent(carriedCandidates, 'previous.candidates'),
    ...forbiddenContent(observations, 'observations'),
  ]
  if (offences.length > 0) {
    diagnostics.push(diagnostic(
      'memory_holds_vendor_payload',
      'blocked',
      'This write copies vendor payload or account state into the private folder. Prices come back from the Toss connection, filings from the host source cache and holdings from portfolio_get on every run; a second copy here is stale the moment it is written and it answers anyway',
      offences[0].path,
      { offences: offences.slice(0, 12), forbiddenKeys: FORBIDDEN_KEYS },
    ))
  }

  // ── ③ the rows: carried first, then this run's observations folded in ─────
  const rows = new Map()
  for (const carried of carriedCandidates) {
    if (typeof carried?.symbol !== 'string' || !carried.symbol) continue
    rows.set(keyOf(carried.market, carried.symbol), {
      symbol: carried.symbol,
      market: carried.market ?? 'XKRX',
      state: CANDIDATE_STATES.includes(carried.state) ? carried.state : 'discovered',
      discoveredAtEpochMs: instantOf(carried.discoveredAtEpochMs) ?? asOfInstant,
      lastSeenAtEpochMs: instantOf(carried.lastSeenAtEpochMs) ?? asOfInstant,
      discoveryPath: Array.isArray(carried.discoveryPath) ? [...new Set(carried.discoveryPath.filter((path) => typeof path === 'string' && path))] : [],
      ruleVersion: typeof carried.ruleVersion === 'string' ? carried.ruleVersion : null,
      hypothesis: typeof carried.hypothesis === 'string' ? carried.hypothesis : null,
      sectionsComplete: Array.isArray(carried.sectionsComplete) ? [...carried.sectionsComplete] : [],
      openQuestions: Array.isArray(carried.openQuestions) ? [...carried.openQuestions] : [],
      evidenceIds: Array.isArray(carried.evidenceIds) ? carried.evidenceIds.filter((id) => typeof id === 'string' && id) : [],
      nextReviewAtEpochMs: instantOf(carried.nextReviewAtEpochMs),
      nextReviewCondition: typeof carried.nextReviewCondition === 'string' ? carried.nextReviewCondition : null,
      excludedReasonCode: carried.excludedReasonCode ?? null,
      history: Array.isArray(carried.history) ? [...carried.history] : [],
      carried: true,
      seenThisRun: false,
      requiresReevaluation: false,
    })
  }

  for (const observation of Array.isArray(observations) ? observations : []) {
    const symbol = observation?.symbol
    if (typeof symbol !== 'string' || !symbol) {
      diagnostics.push(diagnostic('candidate_symbol_missing', 'blocked', 'A candidate row is keyed on (market, symbol); a row without one cannot be de-duplicated and would be re-discovered every run', 'observations[].symbol'))
      continue
    }
    if (symbol.length > CAPS.symbolChars) {
      diagnostics.push(diagnostic('candidate_field_too_long', 'blocked', `A symbol is at most ${CAPS.symbolChars} characters; anything longer is source text wearing an identifier’s name`, 'observations[].symbol', { symbol: symbol.slice(0, 40), cap: CAPS.symbolChars }))
      continue
    }
    if (typeof observation.hypothesis === 'string' && observation.hypothesis.length > CAPS.hypothesisChars) {
      diagnostics.push(diagnostic('candidate_field_too_long', 'blocked', `A hypothesis is one sentence — at most ${CAPS.hypothesisChars} characters. A research note that outgrows it belongs in the proposal’s rationale, not in the ledger`, 'observations[].hypothesis', { length: observation.hypothesis.length, cap: CAPS.hypothesisChars }))
      continue
    }
    const market = typeof observation.market === 'string' && observation.market ? observation.market : 'XKRX'
    const key = keyOf(market, symbol)
    const paths = (Array.isArray(observation.discoveryPath) ? observation.discoveryPath : [observation.discoveryPath]).filter((path) => typeof path === 'string' && path)
    const seenEvidence = (Array.isArray(observation.evidenceIds) ? observation.evidenceIds : []).filter((id) => typeof id === 'string' && id)
    const existing = rows.get(key)

    if (existing === undefined) {
      /**
       * ⛔ A candidate is created only on a run that read the ledger, which is why
       * the unread branch returned above. Creating one here on an unread ledger is
       * how the same name is "discovered" on every run forever.
       */
      rows.set(key, {
        symbol,
        market,
        state: 'discovered',
        discoveredAtEpochMs: asOfInstant,
        lastSeenAtEpochMs: asOfInstant,
        discoveryPath: [...new Set(paths)],
        ruleVersion: currentRuleVersion,
        hypothesis: typeof observation.hypothesis === 'string' ? observation.hypothesis : null,
        sectionsComplete: Array.isArray(observation.sectionsComplete) ? [...observation.sectionsComplete] : [],
        openQuestions: Array.isArray(observation.openQuestions) ? [...observation.openQuestions] : [],
        evidenceIds: seenEvidence.slice(0, CAPS.evidenceIdsPerCandidate),
        nextReviewAtEpochMs: instantOf(observation.nextReviewAtEpochMs),
        nextReviewCondition: typeof observation.nextReviewCondition === 'string' ? observation.nextReviewCondition : null,
        excludedReasonCode: observation.excludedReasonCode ?? null,
        history: [{ atEpochMs: asOfInstant, from: null, to: 'discovered', ruleVersion: currentRuleVersion }],
        carried: false,
        seenThisRun: true,
        requiresReevaluation: false,
      })
      continue
    }

    /**
     * ── The duplicate, which folds ────────────────────────────────────────────
     *
     * Two sweeps reaching the same name in one run, or the same name reached
     * again next week, is one row. `lastSeenAtEpochMs` moves, `discoveryPath`
     * folds into a set, and a **new** path appends one history entry — new,
     * because appending on every sighting would make a re-run over an unchanged
     * input grow the record forever and idempotency is the property #305 asks
     * for by name.
     */
    existing.seenThisRun = true
    existing.lastSeenAtEpochMs = asOfInstant
    const addedPaths = paths.filter((path) => !existing.discoveryPath.includes(path))
    if (addedPaths.length > 0) {
      existing.discoveryPath = [...existing.discoveryPath, ...addedPaths]
      existing.history.push({ atEpochMs: asOfInstant, from: existing.state, to: existing.state, ruleVersion: existing.ruleVersion, via: addedPaths.join(',') })
    }
    if (typeof observation.hypothesis === 'string') existing.hypothesis = observation.hypothesis
    if (Array.isArray(observation.sectionsComplete)) existing.sectionsComplete = [...new Set([...existing.sectionsComplete, ...observation.sectionsComplete])]
    if (Array.isArray(observation.openQuestions)) existing.openQuestions = [...observation.openQuestions]
    if (observation.nextReviewAtEpochMs !== undefined) existing.nextReviewAtEpochMs = instantOf(observation.nextReviewAtEpochMs)
    if (typeof observation.nextReviewCondition === 'string') existing.nextReviewCondition = observation.nextReviewCondition

    /**
     * ⛔ **Evidence is monotonic.** A row handed back without an id the carried
     * record holds is reinstated and the run stops: a laundered record is worse
     * than a missing one, because it reads clean.
     */
    if (Array.isArray(observation.evidenceIds)) {
      const dropped = existing.evidenceIds.filter((id) => !seenEvidence.includes(id))
      const merged = [...new Set([...existing.evidenceIds, ...seenEvidence])]
      if (dropped.length > 0) {
        diagnostics.push(diagnostic(
          'candidate_evidence_dropped',
          'blocked',
          'This run handed back a candidate whose evidence is missing from the carried record. It has been reinstated; what cannot be reinstated is the reason it went',
          `candidates[${key}].evidenceIds`,
          { dropped },
        ))
      }
      if (merged.length > CAPS.evidenceIdsPerCandidate) {
        diagnostics.push(diagnostic('candidate_evidence_capped', 'info', `A candidate carries at most ${CAPS.evidenceIdsPerCandidate} evidence ids; the oldest are kept and the rest stay readable through evidence_search`, `candidates[${key}].evidenceIds`, { held: merged.length, cap: CAPS.evidenceIdsPerCandidate }))
      }
      existing.evidenceIds = merged.slice(0, CAPS.evidenceIdsPerCandidate)
    }
  }

  // ── ④ the rule version, which is never migrated silently ──────────────────
  if (currentRuleVersion !== null) {
    for (const [key, row] of rows) {
      if (row.ruleVersion !== null && row.ruleVersion !== currentRuleVersion) {
        row.requiresReevaluation = true
        diagnostics.push(diagnostic(
          'rule_version_changed',
          'unevaluated',
          `This candidate was judged under ${row.ruleVersion} and this run judges under ${currentRuleVersion}. It is returned for re-evaluation rather than migrated: a gate that moved is a candidate that was never tested against the gate it is now being carried under`,
          `candidates[${key}].ruleVersion`,
          { carried: row.ruleVersion, current: currentRuleVersion },
        ))
      }
    }
  }

  // ── ⑤ the transitions ─────────────────────────────────────────────────────
  for (const move of Array.isArray(transitions) ? transitions : []) {
    const key = keyOf(move?.market, move?.symbol)
    const row = rows.get(key)
    const where = `transitions[${key}→${move?.to ?? '?'}]`
    if (row === undefined) {
      diagnostics.push(diagnostic('transition_target_missing', 'blocked', 'A state change names a candidate this run read or created', where))
      continue
    }
    const to = move?.to
    if (!CANDIDATE_STATES.includes(to)) {
      diagnostics.push(diagnostic('transition_target_unknown', 'blocked', `A candidate moves between ${CANDIDATE_STATES.join(' / ')}`, `${where}.to`, { to: to ?? null }))
      continue
    }
    const observedAt = instantOf(move?.atEpochMs ?? move?.observedAt)
    if (observedAt === null || observedAt > asOfInstant) {
      diagnostics.push(diagnostic('transition_observed_at_invalid', 'blocked', 'A state change is observed at an instant at or before asOf', `${where}.atEpochMs`))
      continue
    }
    const moveEvidence = (Array.isArray(move?.evidenceIds) ? move.evidenceIds : []).filter((id) => typeof id === 'string' && id)

    /**
     * ⛔ **Leaving `excluded` costs a reason and new evidence.** A name this desk
     * researched and put down is the name the next run is most likely to pick up
     * again on the same chart, and re-entry with nothing new is how a rejected
     * thesis becomes a position by attrition. Dropping `excluded` silently — a row
     * handed back as `researching` with no `reentryReason` — is the same move
     * without the paperwork, and it is refused under the same code as any other
     * backwards step.
     */
    if (row.state === 'excluded') {
      const reason = typeof move?.reentryReason === 'string' && move.reentryReason.length >= 8
      if (to !== 'researching' || !reason || moveEvidence.length === 0) {
        diagnostics.push(diagnostic(
          'candidate_state_regressed',
          'blocked',
          'This candidate is excluded and this run moves it without saying what changed. Re-entry is researching, with a reentryReason and at least one new evidence id; anything else is the rejection being reversed by restatement',
          `${where}.reentryReason`,
          { from: row.state, to: to ?? null, hasReason: reason, evidenceIds: moveEvidence.length, excludedReasonCode: row.excludedReasonCode },
        ))
        continue
      }
    } else if (STATE_RANK[to] < STATE_RANK[row.state] && !CANDIDATE_TRANSITIONS[row.state].includes(to)) {
      diagnostics.push(diagnostic(
        'candidate_state_regressed',
        'blocked',
        `${row.state} does not lead back to ${to}. Research progress only grows; a candidate that has to be re-opened is re-opened explicitly`,
        `${where}.to`,
        { from: row.state, to, allowed: CANDIDATE_TRANSITIONS[row.state] },
      ))
      continue
    } else if (!CANDIDATE_TRANSITIONS[row.state].includes(to)) {
      diagnostics.push(diagnostic('candidate_transition_illegal', 'blocked', `${row.state} does not lead to ${to}`, `${where}.to`, { from: row.state, to, allowed: CANDIDATE_TRANSITIONS[row.state] }))
      continue
    }

    const from = row.state
    row.state = to
    row.lastSeenAtEpochMs = asOfInstant
    row.evidenceIds = [...new Set([...row.evidenceIds, ...moveEvidence])].slice(0, CAPS.evidenceIdsPerCandidate)
    if (to === 'excluded') row.excludedReasonCode = move?.reasonCode ?? move?.reentryReason ?? row.excludedReasonCode ?? 'excluded'
    if (from === 'excluded') row.excludedReasonCode = null
    row.history.push({
      atEpochMs: observedAt,
      from,
      to,
      ruleVersion: currentRuleVersion,
      ...(typeof move?.reentryReason === 'string' ? { reentryReason: move.reentryReason } : {}),
    })
  }

  // ── ⑥ the failed ranges, retried before anything after them ───────────────
  const resolved = new Set((Array.isArray(resolvedRanges) ? resolvedRanges : []).map((range) => `${range?.from}→${range?.to}`))
  const ranges = new Map()
  for (const range of carriedRanges) {
    if (typeof range?.from !== 'string') continue
    const id = `${range.from}→${range.to}`
    if (resolved.has(id)) continue
    ranges.set(id, {
      kind: typeof range.kind === 'string' ? range.kind : LEDGER_CURSOR_KIND,
      from: range.from,
      to: range.to ?? null,
      reasonCode: range.reasonCode ?? 'lane_query_failed',
      firstFailedAtEpochMs: instantOf(range.firstFailedAtEpochMs) ?? asOfInstant,
      attempts: Number.isInteger(range.attempts) ? range.attempts : 1,
    })
  }
  for (const range of Array.isArray(failedRanges) ? failedRanges : []) {
    if (typeof range?.from !== 'string') continue
    const id = `${range.from}→${range.to}`
    const carried = ranges.get(id)
    if (carried === undefined) {
      ranges.set(id, {
        kind: typeof range.kind === 'string' ? range.kind : LEDGER_CURSOR_KIND,
        from: range.from,
        to: range.to ?? null,
        reasonCode: range.reasonCode ?? 'lane_query_failed',
        firstFailedAtEpochMs: asOfInstant,
        attempts: 1,
      })
      continue
    }
    /** ⚠️ A retry that failed again is the same range with one more attempt, never a second row. */
    carried.attempts += 1
    carried.reasonCode = range.reasonCode ?? carried.reasonCode
    diagnostics.push(diagnostic(
      'failed_range_retried',
      'info',
      `${id} failed again; this is attempt ${carried.attempts} since ${carried.firstFailedAtEpochMs}. The range stays at the front of the next sweep and the cursor stays behind it`,
      `failedRanges[${id}]`,
      { attempts: carried.attempts, reasonCode: carried.reasonCode },
    ))
  }
  const nextRanges = [...ranges.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))

  // ── ⑦ the cursor ──────────────────────────────────────────────────────────
  let nextCursor = carriedCursor === null ? null : { kind: carriedCursor.kind ?? LEDGER_CURSOR_KIND, value: carriedCursor.value ?? null, atEpochMs: instantOf(carriedCursor.atEpochMs) ?? asOfInstant }
  if (cursor !== undefined && cursor !== null && typeof cursor.value === 'string' && cursor.value) {
    const blockedBy = nextRanges.find((range) => cursor.value >= range.from)
    if (blockedBy !== undefined) {
      diagnostics.push(diagnostic(
        'cursor_advanced_past_failed_range',
        'blocked',
        `The cursor would move to ${cursor.value}, at or past the unread range beginning ${blockedBy.from}. A cursor that steps over an unread range deletes it permanently: nothing later ever looks at it again`,
        'cursor',
        { proposed: cursor.value, failedRange: blockedBy },
      ))
    } else {
      nextCursor = { kind: cursor.kind ?? LEDGER_CURSOR_KIND, value: cursor.value, atEpochMs: asOfInstant }
    }
  }

  // ── ⑧ the caps ────────────────────────────────────────────────────────────
  const finalRows = [...rows.values()].sort((a, b) => (keyOf(a.market, a.symbol) < keyOf(b.market, b.symbol) ? -1 : 1))
  if (finalRows.length > CAPS.candidates) {
    diagnostics.push(diagnostic('candidate_ledger_capacity', 'blocked', `The ledger holds ${finalRows.length} candidates, past the ${CAPS.candidates} this package carries. Close the ones that are finished explicitly rather than evicting history silently`, 'candidates', { held: finalRows.length, cap: CAPS.candidates }))
  }

  const persisted = finalRows.map((row) => ({
    symbol: row.symbol,
    market: row.market,
    state: row.state,
    discoveredAtEpochMs: row.discoveredAtEpochMs,
    lastSeenAtEpochMs: row.lastSeenAtEpochMs,
    discoveryPath: row.discoveryPath,
    ruleVersion: row.ruleVersion,
    hypothesis: row.hypothesis,
    sectionsComplete: row.sectionsComplete,
    openQuestions: row.openQuestions,
    evidenceIds: row.evidenceIds,
    nextReviewAtEpochMs: row.nextReviewAtEpochMs,
    nextReviewCondition: row.nextReviewCondition,
    excludedReasonCode: row.excludedReasonCode,
    history: row.history,
  }))
  const serialisedBytes = new TextEncoder().encode(JSON.stringify(persisted)).length
  if (serialisedBytes > CAPS.serialisedBytes) {
    diagnostics.push(diagnostic('candidate_ledger_capacity', 'blocked', `The ledger serialises to ${serialisedBytes} bytes, past its ${CAPS.serialisedBytes}-byte budget. A ledger that has to grow to hold prose is a ledger that has started to hold the research instead of pointing at it`, 'candidates', { serialisedBytes, cap: CAPS.serialisedBytes }))
  }

  const byState = {}
  for (const state of CANDIDATE_STATES) byState[state] = finalRows.filter((row) => row.state === state).length
  const summary = {
    total: finalRows.length,
    byState,
    newThisRun: finalRows.filter((row) => !row.carried).length,
    resumed: finalRows.filter((row) => row.carried && row.seenThisRun).length,
    requiresReevaluation: finalRows.filter((row) => row.requiresReevaluation).map((row) => row.symbol),
    failedRanges: nextRanges.length,
    ledgerRead: true,
    previousRead,
    previousExtraKeys,
    serialisedBytes,
  }

  /** ⛔ `null` whenever anything blocked: a refused read is never written back. */
  const nextLedger = isBlocked(diagnostics)
    ? null
    : {
        schemaVersion: SCHEMA_VERSION,
        strategy: STRATEGY,
        ruleVersion: currentRuleVersion,
        updatedAtEpochMs: asOfInstant,
        cursor: nextCursor,
        failedRanges: nextRanges,
        candidates: persisted,
      }

  if (finalRows.some((row) => row.state === 'researching' && !row.nextReviewCondition && !row.nextReviewAtEpochMs)) {
    causes.push(cause(
      'research_incomplete',
      'A candidate is left in researching with no re-review condition and no re-review instant, so nothing will ever bring this run back to it. Say the question and when it can be answered',
      'candidates',
    ))
  }

  return { data: { rows: finalRows, summary, nextLedger }, diagnostics, causes }
}

export const CANDIDATE_VOCABULARY = Object.freeze({
  states: CANDIDATE_STATES,
  transitions: CANDIDATE_TRANSITIONS,
  caps: CAPS,
  forbiddenKeys: FORBIDDEN_KEYS,
  migrations: LEDGER_MIGRATIONS,
  ledgerPath: LEDGER_PATH,
  cursorKind: LEDGER_CURSOR_KIND,
  strategy: STRATEGY,
})
