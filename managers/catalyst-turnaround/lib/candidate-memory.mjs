import { cause, diagnostic, instantOf } from './diagnostics.mjs'

/**
 * ── The candidate ledger: one document, and it is not the catalyst register ─
 *
 * ⚠️ **Vendored on purpose, and the siblings are named.** The same §7.2 record
 * is produced by `managers/fundamental-mean-reversion/lib/candidate-memory.mjs`
 * and `managers/shareholder-rerating/lib/candidate-memory.mjs`
 * (`aumos-catalogue#305`). What is shared is the **field names, the state
 * machine and the migration table**; `strategy`, `ruleVersion`, the cursor kind
 * and the foreign key at the end are each package's own. There is no shared
 * library because the published artifact is a path→contents map rooted at this
 * directory — a relative import that escaped it would fail at install, not here
 * — and because a shared library would have made the three agree by
 * construction, which is exactly what `tools/verify-shared-scenarios.mjs` exists
 * to avoid.
 *
 * ── Why it is a second document and not a bigger first one ─────────────────
 *
 * `lib/ledger.mjs` writes the **catalyst register**: what a registered catalyst
 * is, which window it is in, how many times it has slipped. This file writes the
 * **candidate ledger**: which names this desk is working on, how far the work
 * got, and where the sweep stopped. They are joined by `catalystIds[]` — a
 * candidate names the register rows it rests on — and they are never merged.
 *
 * ⛔ **Two reasons, and the second is the one that would bite.** ⑴ The register
 * is about *positions and the events they hang on* and is read on every held
 * name; the candidate ledger is about *research in progress* and is read to
 * resume a sweep. ⑵ `manager-memory` has no multi-file atomic write
 * (`host-contracts-305.md` §1: temp+rename per file, `expectedHash` CAS, no
 * transaction), so one document per concern with its own hash is the only shape
 * where a half-written run is a half-written *one* of them. Merging them would
 * make every sweep rewrite the register and every delay count rewrite the sweep.
 *
 * ── The four rules that make it a record rather than a scratchpad ──────────
 *
 * ⑴ **`undefined` and `null` are different facts.** `undefined` is nobody having
 *    read the key — `data_missing`, and no candidate is created or advanced.
 *    `null` is having read it and found it empty — seed. Defaulting the first to
 *    the second is how a failed read becomes a fresh start, and a fresh start
 *    loses every open question this desk was holding.
 * ⑵ **The record only grows.** Evidence ids cannot be dropped, history appends,
 *    and a terminal state cannot be restated away. All three are the same
 *    mistake in different clothes, and `lib/ledger.mjs` refuses them the same way.
 * ⑶ **Nothing here may hold vendor payload.** Prices, bars, filing bodies,
 *    holdings, cash and open proposals are re-read every run from the host; a
 *    private memory that starts caching them is a second source of truth that
 *    nothing reconciles. #305 puts it in the scope-out list by name.
 * ⑷ **A rule version change is never auto-migrated.** A candidate gated under
 *    `ct-event-1` is not a candidate under `ct-event-2`; it comes back with
 *    `requiresReevaluation: true` and a diagnostic naming both versions, and a
 *    human-or-model decides. Silently re-badging it would launder the gate.
 *
 * ⛔ **No fifth cause code.** `diagnostics.mjs`'s `cause()` throws on a word
 * outside the four, and everything new in this file is a `diagnostic()` row in
 * this package's own three severities — `blocked`, `unevaluated`, `note`.
 */

export const CANDIDATE_STATES = Object.freeze(['discovered', 'triaged', 'researching', 'watching', 'proposed', 'excluded'])

export const CANDIDATE_TRANSITIONS = Object.freeze({
  discovered: ['triaged', 'watching', 'excluded'],
  triaged: ['researching', 'watching', 'excluded'],
  researching: ['watching', 'proposed', 'excluded'],
  watching: ['researching', 'proposed', 'excluded'],
  proposed: ['watching', 'excluded'],
  /** ⚠️ The one way back, and it costs a reason and a new piece of evidence. */
  excluded: ['triaged'],
})

/**
 * ⛔ **Terminal for the purposes of *restatement*, which is not the same as
 * closed.** A run may move a candidate out of one of these with an explicit
 * transition that says why; what it may not do is hand back a row that is
 * quietly in a different state from the carried one. The first is a decision
 * with a record; the second is a decision with the record deleted.
 */
export const TERMINAL_CANDIDATE_STATES = Object.freeze(['proposed', 'excluded'])

export const CANDIDATE_SCHEMA_VERSION = 1

/** #305's caps, verbatim. A ledger is a roster; a roster has a size. */
export const CANDIDATE_CAPS = Object.freeze({
  candidates: 200,
  serialisedBytes: 60_000,
  evidenceIdsPerCandidate: 8,
  hypothesisChars: 280,
  symbolChars: 32,
})

/**
 * ── What a candidate row may never contain ────────────────────────────────
 *
 * Two families. The **vendor payload** family is price and filing material that
 * has a source of its own; the **account** family is the book, which
 * `portfolio_get` answers freshly every run and which a private file has no
 * business restating. A key from either is `memory_holds_vendor_payload`,
 * `blocked`, because the damage is not the bytes — it is that a stale copy reads
 * exactly like a fresh one.
 */
const FORBIDDEN_KEYS = Object.freeze([
  'open',
  'high',
  'low',
  'close',
  'volume',
  'bars',
  'rows',
  'candles',
  'excerpt',
  'body',
  'filingBody',
  'quantity',
  'weight',
  'cash',
  'averageCost',
  'targetWeight',
  'pending',
  'proposals',
])

const KNOWN_LEDGER_KEYS = Object.freeze(['schemaVersion', 'strategy', 'ruleVersion', 'updatedAtEpochMs', 'cursor', 'failedRanges', 'candidates'])

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every key name reachable from a row, so the prohibition cannot be nested past. */
function keyNames(value, found = new Set(), depth = 0) {
  if (depth > 6 || !isPlainObject(value)) {
    if (Array.isArray(value) && depth <= 6) for (const item of value) keyNames(item, found, depth + 1)
    return found
  }
  for (const [key, child] of Object.entries(value)) {
    found.add(key)
    keyNames(child, found, depth + 1)
  }
  return found
}

const cursorOf = (value) => {
  if (!isPlainObject(value) || typeof value.value !== 'string' || typeof value.kind !== 'string') return null
  return { kind: value.kind, value: value.value, atEpochMs: instantOf(value.atEpochMs) }
}

/**
 * The candidate ledger for one run.
 *
 * `previous` is the document read from `manager-memory` this run — `undefined`
 * when nobody read it. `observations` are the names this run's sweep produced
 * (`lib/discovery.mjs` → `data.observations`, plus anything a model researched
 * by hand). `transitions` are explicit state changes. `ruleVersion` is the gate
 * this run is running; `registerCatalystIds` is `catalystLedger`'s
 * `nextRegister.catalysts[].id`, and it is the only thing that crosses between
 * the two documents.
 */
export function candidateLedger({
  previous,
  observations = [],
  transitions = [],
  asOf,
  ruleVersion = null,
  cursor = undefined,
  failedRanges = undefined,
  registerCatalystIds = undefined,
  strategy = 'catalyst-turnaround',
} = {}) {
  const diagnostics = []
  const causes = []

  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    diagnostics.push(diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf'))
    return { data: { nextLedger: null, candidates: [], previousRead: 'unread', previousExtraKeys: [], summary: emptySummary(), requiresReevaluation: [] }, diagnostics, causes }
  }

  if (typeof ruleVersion !== 'string' || ruleVersion.length === 0) {
    diagnostics.push(
      diagnostic('rule_version_missing', 'blocked', 'A candidate is stamped with the gate it passed. Without the current rule version this run cannot say whether a carried candidate is still under the rules it was admitted by', 'ruleVersion'),
    )
    return { data: { nextLedger: null, candidates: [], previousRead: 'unread', previousExtraKeys: [], summary: emptySummary(), requiresReevaluation: [] }, diagnostics, causes }
  }

  // ── ① the read, and its migration table ─────────────────────────────────
  /**
   * | what arrived | reading | why |
   * |---|---|---|
   * | `undefined` | **`data_missing`** | nobody read the key. No candidate is created or advanced, and `nextLedger` is `null` |
   * | `null` | **seed** | read and empty. A key that re-seeds can never self-lock |
   * | not an object, or `candidates` not an array | **degrade** to an empty ledger | the pre-#305 hand-written blob. Carrying less history is never carrying wrong history |
   * | `schemaVersion` absent | **degrade** | same blob, same argument |
   * | `schemaVersion` present and not `1` | **refuse** | a writer this code does not know, whose rows it would misread or drop |
   * | `updatedAtEpochMs` after `asOf` | **refuse** | a document written by a later run leaks that run's judgement backwards, and the per-row check does not catch it |
   */
  let previousRead
  let carriedRows = []
  if (previous === undefined) {
    previousRead = 'unread'
    causes.push(
      cause(
        'data_missing',
        'The candidate ledger was not read. Pass null to say it was read and is empty; a run that cannot see its own roster cannot tell a new name from one it has been researching, and writing either down would be a guess in a durable record',
        'previous',
      ),
    )
  } else if (previous === null) {
    previousRead = 'seed'
  } else if (!isPlainObject(previous)) {
    previousRead = 'degraded-unparseable'
  } else {
    const storedVersion = previous.schemaVersion
    const storedAt = instantOf(previous.updatedAtEpochMs)
    if (storedVersion !== undefined && storedVersion !== null && storedVersion !== CANDIDATE_SCHEMA_VERSION) {
      diagnostics.push(
        diagnostic('candidate_ledger_unknown_version', 'blocked', `This document says schemaVersion ${storedVersion} and this code writes ${CANDIDATE_SCHEMA_VERSION}. A writer this code does not know may have shaped its rows in a way this one would silently drop, and dropping history is the failure the whole file guards`, 'previous.schemaVersion', { storedVersion }),
      )
      return { data: { nextLedger: null, candidates: [], previousRead: 'refused', previousExtraKeys: [], summary: emptySummary(), requiresReevaluation: [] }, diagnostics, causes }
    }
    if (storedAt !== null && storedAt > asOfInstant) {
      diagnostics.push(
        diagnostic('candidate_ledger_after_as_of', 'blocked', 'This ledger was written after asOf. A document from a later run can hold only past-dated rows and still carry that run\'s judgement backwards', 'previous.updatedAtEpochMs', { updatedAtEpochMs: storedAt }),
      )
      return { data: { nextLedger: null, candidates: [], previousRead: 'refused', previousExtraKeys: [], summary: emptySummary(), requiresReevaluation: [] }, diagnostics, causes }
    }
    if (storedVersion === undefined || storedVersion === null) previousRead = 'degraded-no-schema'
    else if (!Array.isArray(previous.candidates)) previousRead = 'degraded-no-candidates'
    else {
      previousRead = 'carried'
      carriedRows = previous.candidates
    }
  }

  /**
   * ⚠️ **Sibling keys are reported by name and never carried.** The 60 KB budget
   * measures this document's own fields; carrying arbitrary caller keys through
   * would be a hole in it and in the rule that this key is a roster rather than
   * a source cache. A run that wants prose beside the ledger writes it to its
   * own file.
   */
  const previousExtraKeys = isPlainObject(previous)
    ? Object.keys(previous).filter((key) => !KNOWN_LEDGER_KEYS.includes(key)).sort().slice(0, 32)
    : []
  if (previousExtraKeys.length > 0) {
    diagnostics.push(
      diagnostic('candidate_ledger_extra_keys', 'note', 'The stored ledger carries keys this schema does not define. They are named here and not carried forward', 'previous', { previousExtraKeys }),
    )
  }

  const carried = new Map(
    carriedRows.filter((row) => typeof row?.symbol === 'string').map((row) => [`${row.market ?? 'XKRX'}:${row.symbol}`, row]),
  )

  // ── ② fold the observations onto what is carried ─────────────────────────
  const rows = new Map()
  /** Every row as it was *offered*, so §④'s content prohibition has something to read. */
  const rawByKey = new Map()
  const remember = (key, raw) => rawByKey.set(key, [...(rawByKey.get(key) ?? []), raw])
  for (const [key, row] of carried) {
    rows.set(key, normalise(row, { asOfInstant, ruleVersion, fresh: false }))
    remember(key, row)
  }

  const recordable = previous === undefined ? [] : observations
  for (const observation of recordable) {
    const symbol = typeof observation?.symbol === 'string' ? observation.symbol : null
    const market = typeof observation?.market === 'string' ? observation.market : 'XKRX'
    if (symbol === null || symbol.length > CANDIDATE_CAPS.symbolChars) {
      diagnostics.push(diagnostic('candidate_symbol_invalid', 'blocked', `A candidate is keyed by (market, symbol) and the symbol is a compact identifier of at most ${CANDIDATE_CAPS.symbolChars} characters — never source text`, 'observations', { symbol }))
      continue
    }
    const key = `${market}:${symbol}`
    remember(key, observation)
    const before = rows.get(key)
    const next = normalise({ ...(before ?? {}), ...observation, market, symbol }, { asOfInstant, ruleVersion, fresh: before === undefined })

    if (before !== undefined) {
      /**
       * ⛔ **Duplicate discovery is one row, not two.** The key is
       * `(market, symbol)` and never `(strategy, market, symbol)` — this whole
       * document belongs to one strategy — so a name found twice updates
       * `lastSeenAtEpochMs`, folds `discoveryPath` into a set, appends history,
       * and produces no second row and no second proposal.
       */
      next.discoveredAtEpochMs = before.discoveredAtEpochMs ?? next.discoveredAtEpochMs
      next.discoveryPath = [...new Set([...before.discoveryPath, ...next.discoveryPath])]
      next.state = before.state
      next.ruleVersion = before.ruleVersion
      next.history = [...before.history]
      next.sectionsComplete = [...new Set([...before.sectionsComplete, ...next.sectionsComplete])]
      next.catalystIds = [...new Set([...before.catalystIds, ...next.catalystIds])]
      next.excludedReasonCode = before.excludedReasonCode

      /**
       * ⚠️ **An observation is an increment; a restatement is a claim.** The
       * sweep hands back only the evidence *this* run read — one gazette, one
       * filing — so treating every observation as a full restatement of the row
       * would report a dropped id on every ordinary resume. So the ids are
       * unioned either way, and the `blocked` finding is reserved for a caller
       * that said `restated: true`, meaning *this is the whole row*. That is the
       * only case where a missing id is a decision rather than an omission, and
       * `lib/ledger.mjs` refuses the same thing for the same reason.
       */
      const dropped = observation?.restated === true ? before.evidenceIds.filter((id) => !next.evidenceIds.includes(id)) : []
      if (dropped.length > 0) {
        diagnostics.push(
          diagnostic('candidate_evidence_dropped', 'blocked', 'This run handed back a candidate whose carried evidence ids are missing. They have been reinstated; what cannot be reinstated is the reason they went, so the run stops here rather than proceeding on a record that reads clean', `candidates[${key}].evidenceIds`, { dropped }),
        )
      }
      next.evidenceIds = [...new Set([...before.evidenceIds, ...next.evidenceIds])]

      if (TERMINAL_CANDIDATE_STATES.includes(before.state) && observation?.state !== undefined && observation.state !== before.state) {
        diagnostics.push(
          diagnostic('candidate_state_regressed', 'blocked', `The carried record says ${before.state} and this run handed back ${observation.state}. A state that was reached is left where it is; moving it is an explicit transition with a reason, not a restatement`, `candidates[${key}].state`, { carried: before.state, restated: observation.state }),
        )
      }
    }
    rows.set(key, next)
  }

  // ── ③ the explicit transitions ───────────────────────────────────────────
  for (const move of transitions) {
    const symbol = typeof move?.symbol === 'string' ? move.symbol : null
    const market = typeof move?.market === 'string' ? move.market : 'XKRX'
    const key = `${market}:${symbol}`
    const where = `transitions[${key}→${move?.to ?? '?'}]`
    const row = rows.get(key)
    if (row === undefined) {
      diagnostics.push(diagnostic('candidate_transition_target_missing', 'blocked', 'A state change names a candidate this ledger carries', where))
      continue
    }
    const to = move?.to
    if (!CANDIDATE_STATES.includes(to)) {
      diagnostics.push(diagnostic('candidate_transition_target_unknown', 'blocked', `A candidate moves between ${CANDIDATE_STATES.join(' / ')}`, `${where}.to`, { to: to ?? null }))
      continue
    }
    if (!CANDIDATE_TRANSITIONS[row.state].includes(to)) {
      diagnostics.push(diagnostic('candidate_transition_illegal', 'blocked', `${row.state} does not lead to ${to}`, `${where}.to`, { allowed: CANDIDATE_TRANSITIONS[row.state] }))
      continue
    }
    const observedAt = instantOf(move?.observedAt) ?? asOfInstant
    if (observedAt > asOfInstant) {
      diagnostics.push(diagnostic('candidate_transition_after_as_of', 'blocked', 'A state change is observed at an instant at or before asOf', `${where}.observedAt`))
      continue
    }
    const moveEvidence = Array.isArray(move?.evidenceIds) ? move.evidenceIds.filter((id) => typeof id === 'string' && id) : []

    /**
     * ⛔ **Leaving `excluded` costs a stated reason and a piece of evidence
     * nobody has seen before.** A name this desk refused comes back only because
     * something changed, and "something changed" written as the same evidence
     * that got it excluded is the position arguing with the record. The same
     * shape as `delay_without_new_evidence` one file over.
     */
    if (row.state === 'excluded') {
      const fresh = moveEvidence.filter((id) => !row.evidenceIds.includes(id))
      const reason = typeof move?.reentryReason === 'string' && move.reentryReason.trim().length >= 8
      if (!reason || fresh.length === 0) {
        diagnostics.push(
          diagnostic('excluded_reentry_without_reason', 'blocked', 'A candidate this desk excluded re-enters only on a stated reentryReason and at least one evidence id that is not already on the row. Re-reading what excluded it is not a reason to un-exclude it', where, { hasReentryReason: reason, freshEvidenceIds: fresh.length }),
        )
        continue
      }
      row.reentryReason = move.reentryReason
      row.excludedReasonCode = null
    }
    if (to === 'excluded') row.excludedReasonCode = typeof move?.reasonCode === 'string' ? move.reasonCode : 'excluded'

    row.history = [...row.history, { atEpochMs: observedAt, from: row.state, to, ruleVersion }]
    row.state = to
    row.ruleVersion = ruleVersion
    row.evidenceIds = [...new Set([...row.evidenceIds, ...moveEvidence])]
    row.lastSeenAtEpochMs = Math.max(row.lastSeenAtEpochMs ?? observedAt, observedAt)
  }

  // ── ④ per-row rules: seed history, rule version, caps, prohibitions ──────
  const requiresReevaluation = []
  const candidates = []
  for (const [key, row] of rows) {
    if (row.history.length === 0) {
      row.history = [{ atEpochMs: row.discoveredAtEpochMs ?? asOfInstant, from: null, to: row.state, ruleVersion: row.ruleVersion }]
    }

    /**
     * ⚠️ **A rule version change is a flag, never a migration.** The candidate
     * comes back exactly as it was stored, with `requiresReevaluation: true`, and
     * both versions are named in the diagnostic. Re-stamping it here would make
     * every gate change retroactively true of every name already in the ledger.
     */
    if (row.ruleVersion !== ruleVersion) {
      row.requiresReevaluation = true
      requiresReevaluation.push(key)
      diagnostics.push(
        diagnostic('rule_version_changed', 'unevaluated', `${key} was admitted under ${row.ruleVersion} and this run is running ${ruleVersion}. It is returned unchanged and marked for re-evaluation; nothing here re-badges a candidate to the current gate`, `candidates[${key}].ruleVersion`, { storedRuleVersion: row.ruleVersion, currentRuleVersion: ruleVersion }),
      )
    }

    if (typeof row.hypothesis === 'string' && row.hypothesis.length > CANDIDATE_CAPS.hypothesisChars) {
      diagnostics.push(diagnostic('candidate_hypothesis_too_long', 'blocked', `A hypothesis is one sentence — at most ${CANDIDATE_CAPS.hypothesisChars} characters. Longer than that is research prose, and research prose belongs in the proposal rather than in a roster`, `candidates[${key}].hypothesis`, { length: row.hypothesis.length }))
    }
    if (row.evidenceIds.length > CANDIDATE_CAPS.evidenceIdsPerCandidate) {
      diagnostics.push(diagnostic('candidate_ledger_capacity', 'blocked', `A candidate carries at most ${CANDIDATE_CAPS.evidenceIdsPerCandidate} evidence ids. Past that the roster has become a citation store, and the ids that matter are the ones the proposal actually rests on`, `candidates[${key}].evidenceIds`, { count: row.evidenceIds.length }))
    }

    /**
     * ⚠️ **Scanned on the input and not on the normalised row.** `normalise()`
     * copies a fixed list of fields, so a `close` array handed in would simply
     * vanish and the prohibition would pass by never seeing it — a check that
     * reports clean because the offending bytes were dropped on the floor is a
     * check that would not survive the first caller who hands us the raw row to
     * write verbatim. What is asserted is what the caller *offered*.
     */
    const names = new Set()
    for (const raw of rawByKey.get(key) ?? []) keyNames(raw, names)
    const forbidden = FORBIDDEN_KEYS.filter((key_) => names.has(key_))
    if (forbidden.length > 0) {
      diagnostics.push(
        diagnostic('memory_holds_vendor_payload', 'blocked', 'A candidate row carries copied vendor or account material. Prices, bars, filing bodies, holdings, cash and open proposals are re-read from the host every run; a private copy of them is a second source of truth that nothing reconciles and that reads exactly like a fresh one when it is a month old', `candidates[${key}]`, { forbidden }),
      )
    }

    /**
     * ⚠️ **The foreign key, and it points one way.** A candidate names register
     * rows; a register row never names a candidate. When the register was read,
     * an id not in it is a dangling link and is refused; when it was not read,
     * the link is simply unverified and says so.
     */
    if (row.catalystIds.length > 0) {
      if (Array.isArray(registerCatalystIds)) {
        const dangling = row.catalystIds.filter((id) => !registerCatalystIds.includes(id))
        if (dangling.length > 0) {
          diagnostics.push(diagnostic('catalyst_link_dangling', 'blocked', 'This candidate cites catalyst ids the register does not carry. The two documents are joined by this key and by nothing else, so a link that does not resolve is a candidate resting on a row nobody can read', `candidates[${key}].catalystIds`, { dangling }))
        }
      } else {
        diagnostics.push(diagnostic('catalyst_link_unverified', 'unevaluated', 'The catalyst register was not passed, so the ids this candidate cites could not be resolved. The link is carried unchanged and is not claimed to be good', `candidates[${key}].catalystIds`, { catalystIds: row.catalystIds }))
      }
    }

    candidates.push(row)
  }

  if (candidates.length > CANDIDATE_CAPS.candidates) {
    diagnostics.push(diagnostic('candidate_ledger_capacity', 'blocked', `The ledger holds ${candidates.length} candidates against a cap of ${CANDIDATE_CAPS.candidates}. Review the removals explicitly rather than silently evicting the oldest history`, 'candidates', { count: candidates.length, cap: CANDIDATE_CAPS.candidates }))
  }

  // ── ⑤ the failed ranges, which are retried before anything new ───────────
  const carriedFailed = Array.isArray(previous?.failedRanges) ? previous.failedRanges : []
  const nextFailed =
    failedRanges === undefined
      ? carriedFailed
      : mergeFailedRanges(carriedFailed, failedRanges)

  const nextCursor = cursor === undefined ? cursorOf(previous?.cursor) : cursorOf(cursor)

  const blocking = diagnostics.some((row) => row.severity === 'blocked')
  const nextLedger =
    blocking || previous === undefined
      ? null
      : {
          schemaVersion: CANDIDATE_SCHEMA_VERSION,
          strategy,
          ruleVersion,
          updatedAtEpochMs: asOfInstant,
          cursor: nextCursor,
          failedRanges: nextFailed,
          candidates: candidates.map(persistable),
        }

  if (nextLedger !== null) {
    const bytes = new TextEncoder().encode(JSON.stringify(nextLedger)).length
    if (bytes > CANDIDATE_CAPS.serialisedBytes) {
      diagnostics.push(diagnostic('candidate_ledger_capacity', 'blocked', `The serialised ledger is ${bytes} bytes against a ${CANDIDATE_CAPS.serialisedBytes}-byte budget. Retain the previous revision and review its scope rather than letting the roster grow into a store`, 'candidates', { bytes, cap: CANDIDATE_CAPS.serialisedBytes }))
      return { data: { nextLedger: null, candidates, previousRead, previousExtraKeys, summary: summaryOf(candidates, nextFailed, previousRead), requiresReevaluation }, diagnostics, causes }
    }
  }

  return {
    data: {
      nextLedger,
      candidates,
      previousRead,
      previousExtraKeys,
      summary: summaryOf(candidates, nextFailed, previousRead),
      requiresReevaluation,
    },
    diagnostics,
    causes,
  }
}

function normalise(input, { asOfInstant, ruleVersion, fresh }) {
  const state = CANDIDATE_STATES.includes(input?.state) ? input.state : 'discovered'
  return {
    symbol: input.symbol,
    market: input.market ?? 'XKRX',
    state,
    discoveredAtEpochMs: instantOf(input?.discoveredAtEpochMs ?? input?.discoveredAt) ?? asOfInstant,
    lastSeenAtEpochMs: instantOf(input?.lastSeenAtEpochMs ?? input?.lastSeenAt) ?? asOfInstant,
    discoveryPath: [...new Set(Array.isArray(input?.discoveryPath) ? input.discoveryPath.filter((p) => typeof p === 'string' && p) : [])],
    ruleVersion: typeof input?.ruleVersion === 'string' && input.ruleVersion && !fresh ? input.ruleVersion : ruleVersion,
    hypothesis: typeof input?.hypothesis === 'string' ? input.hypothesis : null,
    sectionsComplete: [...new Set(Array.isArray(input?.sectionsComplete) ? input.sectionsComplete.filter((s) => typeof s === 'string') : [])],
    openQuestions: Array.isArray(input?.openQuestions) ? input.openQuestions.filter((q) => typeof q === 'string') : [],
    evidenceIds: [...new Set(Array.isArray(input?.evidenceIds) ? input.evidenceIds.filter((id) => typeof id === 'string' && id) : [])],
    catalystIds: [...new Set(Array.isArray(input?.catalystIds) ? input.catalystIds.filter((id) => typeof id === 'string' && id) : [])],
    nextReviewAtEpochMs: instantOf(input?.nextReviewAtEpochMs ?? input?.nextReviewAt),
    nextReviewCondition: typeof input?.nextReviewCondition === 'string' ? input.nextReviewCondition : null,
    excludedReasonCode: typeof input?.excludedReasonCode === 'string' ? input.excludedReasonCode : null,
    reentryReason: typeof input?.reentryReason === 'string' ? input.reentryReason : null,
    requiresReevaluation: false,
    history: Array.isArray(input?.history) ? [...input.history] : [],
  }
}

/** What actually gets written. `requiresReevaluation` is this run's reading, not state. */
function persistable(row) {
  return {
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
    catalystIds: row.catalystIds,
    nextReviewAtEpochMs: row.nextReviewAtEpochMs,
    nextReviewCondition: row.nextReviewCondition,
    excludedReasonCode: row.excludedReasonCode,
    reentryReason: row.reentryReason,
    history: row.history,
  }
}

/**
 * ⚠️ **A range that failed again is the same range with `attempts + 1`.** The
 * count is the record of how long this hole has been open, and a run that
 * re-writes the entry from scratch resets it — which is the same failure as a
 * delay count that restarts, one document over.
 */
function mergeFailedRanges(carried, current) {
  const key = (row) => `${row?.kind}:${row?.from}:${row?.to}`
  const byKey = new Map(carried.map((row) => [key(row), row]))
  const merged = []
  for (const row of current) {
    const before = byKey.get(key(row))
    merged.push({
      kind: row.kind,
      from: row.from,
      to: row.to,
      reasonCode: row.reasonCode,
      firstFailedAtEpochMs: before?.firstFailedAtEpochMs ?? row.firstFailedAtEpochMs,
      attempts: (Number.isInteger(before?.attempts) ? before.attempts : 0) + (Number.isInteger(row.attempts) ? row.attempts : 1),
    })
    byKey.delete(key(row))
  }
  return merged
}

function summaryOf(candidates, failedRanges, previousRead) {
  const byState = Object.fromEntries(CANDIDATE_STATES.map((state) => [state, candidates.filter((row) => row.state === state).length]))
  return {
    total: candidates.length,
    byState,
    failedRanges: failedRanges.length,
    previousRead,
    /** ⚠️ `null` rather than `false` when nobody read the ledger: the count is unknown, not zero. */
    ledgerRead: previousRead === 'unread' ? null : true,
  }
}

function emptySummary() {
  return { total: 0, byState: Object.fromEntries(CANDIDATE_STATES.map((state) => [state, 0])), failedRanges: 0, previousRead: 'unread', ledgerRead: null }
}

export const CANDIDATE_VOCABULARY = Object.freeze({
  states: CANDIDATE_STATES,
  transitions: CANDIDATE_TRANSITIONS,
  terminalStates: TERMINAL_CANDIDATE_STATES,
  caps: CANDIDATE_CAPS,
  forbiddenKeys: FORBIDDEN_KEYS,
  schemaVersion: CANDIDATE_SCHEMA_VERSION,
})
