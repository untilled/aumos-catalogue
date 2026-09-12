/**
 * ── The candidate roster this instance carries between runs ─────────────────
 *
 * One document, in this manager instance's own private folder, holding **pointers and
 * questions**: which names this desk has found, what it believes about each one in a
 * sentence, which sections of the research are written, what is still open, which host
 * evidence ids support it, which return programmes it is linked to, and when it is
 * looked at again. That is the whole of it (#305, `docs/contracts/discovery-run.md`).
 *
 * ⛔ **Vendored, not imported.** `managers/fundamental-mean-reversion/lib/candidate-memory.mjs`
 * and `managers/catalyst-turnaround/lib/candidate-memory.mjs` are the same contract in
 * two other packages, and they are copies because the published artifact is a
 * path→contents map rooted at `managers/shareholder-rerating/` — a relative path that
 * leaves it does not survive publication — and because `COMMONISATION-SURVEY.md` (#270)
 * settled that commonising *policy* through a shared module makes one package's answer
 * win silently. The field names are shared; the severities, the diagnostic codes and
 * the `programmeIds` foreign key below are this package's.
 *
 * ⚠️ **What is this package's own:** `candidate.programmeIds[]`, a foreign key into
 * `lib/programme.mjs`'s return-programme state. The two documents are never merged —
 * a programme outlives the candidate that found it and a candidate can be linked to
 * more than one — and the join is by `(symbol, programmeId)` on both sides.
 *
 * ── One document, because the host has no atomic multi-file write ──────────
 *
 * `manager-memory` is six file tools and an `expectedHash` compare-and-swap; there is
 * no transaction across two files. So the **cursor lives inside this document**. Two
 * files would mean a run that crashed between two writes leaves a cursor claiming a
 * sweep the candidate list does not contain, and every later run then resumes past
 * names nobody ever looked at.
 *
 * ── The four reads that are not one read ───────────────────────────────────
 *
 * Ported in spirit from `managers/evidence-gated/lib/research-state.mjs`. The split is
 * between *this operation's own bookkeeping* (degrade, carry less) and *correctness*
 * (refuse, carry nothing):
 *
 * | what was read | answer |
 * |---|---|
 * | `previous === undefined` | **`data_missing`.** Nobody read the key — not an empty ledger |
 * | `previous === null` | **seed.** Read, and genuinely empty; the key can never self-lock |
 * | `schemaVersion` absent | **degrade** — the pre-contract blobs have none |
 * | `schemaVersion` present and unknown | **refuse** — a writer this code would misread |
 * | `updatedAtEpochMs > asOf` | **refuse** — a later run's judgement leaking backwards |
 *
 * ⛔ **`nextLedger` is `null` whenever a blocking diagnostic fires.** A diagnostic
 * beside a written ledger is a refusal by another name that still wrote.
 */

import { diagnostic, finite, instantOf, isBlocked } from './numbers.mjs'

export const CANDIDATE_SCHEMA_VERSION = 1
export const STRATEGY = 'shareholder-rerating'

/** `discovered → triaged → researching → watching | proposed | excluded` */
export const CANDIDATE_STATES = Object.freeze(['discovered', 'triaged', 'researching', 'watching', 'proposed', 'excluded'])

/**
 * ⛔ The state machine, and `excluded → researching` is the one gated edge: it costs an
 * explicit `reentryReason` and at least one evidence id the carried row did not have.
 */
export const CANDIDATE_TRANSITIONS = Object.freeze({
  discovered: ['discovered', 'triaged', 'watching', 'excluded'],
  triaged: ['triaged', 'researching', 'watching', 'excluded'],
  researching: ['researching', 'watching', 'proposed', 'excluded'],
  watching: ['watching', 'researching', 'proposed', 'excluded'],
  proposed: ['proposed', 'watching', 'researching', 'excluded'],
  excluded: ['excluded', 'researching'],
})

export const CANDIDATE_CAPS = Object.freeze({
  candidates: 200,
  serialisedBytes: 60 * 1024,
  evidenceIdsPerCandidate: 8,
  hypothesisChars: 280,
  symbolChars: 32,
})

/**
 * ⛔ **The enforceable half of «not a source cache and not an account database».**
 * The host says it in prose; this is the list, and a hit is `memory_holds_vendor_payload`
 * at `blocked`. Everything on it has a source that is re-read every run: prices from the
 * broker connection, filings from the host source cache, the account from `portfolio_get`.
 */
export const FORBIDDEN_KEYS = Object.freeze([
  'open',
  'high',
  'low',
  'close',
  'volume',
  'bars',
  'rows',
  'excerpt',
  'quantity',
  'weight',
  'cash',
  'averageCost',
  'targetWeight',
  'pending',
  'proposals',
])

const KNOWN_LEDGER_KEYS = Object.freeze(['schemaVersion', 'strategy', 'ruleVersion', 'updatedAtEpochMs', 'cursor', 'failedRanges', 'candidates'])

const CURSOR_KIND = 'dart-receipt'

function stringOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function idsOf(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id.length > 0))]
}

function cursorOf(value) {
  if (value === null || value === undefined) return null
  return {
    kind: stringOf(value.kind),
    value: stringOf(value.value),
    atEpochMs: instantOf(value.atEpochMs ?? value.at ?? null),
  }
}

function sameCursor(a, b) {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.kind === b.kind && a.value === b.value && a.atEpochMs === b.atEpochMs
}

function rangeKey(range) {
  return `${range.kind}\u0000${range.from}\u0000${range.to}`
}

/** Every place a forbidden key or a raw numeric series could hide, named by path. */
function vendorPayloadHits(value, path, hits, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 6) return hits
  if (Array.isArray(value)) {
    if (value.length > 2 && value.every((entry) => finite(entry))) hits.push({ path, reason: 'numeric_series' })
    for (const [index, entry] of value.entries()) vendorPayloadHits(entry, `${path}[${index}]`, hits, depth + 1)
    return hits
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) hits.push({ path: `${path}.${key}`, reason: 'forbidden_key', key })
    vendorPayloadHits(entry, `${path}.${key}`, hits, depth + 1)
  }
  return hits
}

/**
 * The candidate roster for one run.
 *
 * @param {object} input
 * @param {object|null|undefined} input.previous  what `files_read` returned — ⛔ `undefined` is *nobody read it*
 * @param {object[]} [input.discovered]  rows this run found or re-found
 * @param {object[]} [input.transitions] explicit state changes, including excluded re-entry
 * @param {object[]} [input.failedRanges] ranges that failed this run
 * @param {object[]} [input.resolvedRanges] ranges carried from last time that fully succeeded now
 * @param {object}  [input.cursor]       the cursor this run proposes
 * @param {boolean} [input.advanceCursor] whether the discovery run said it may move
 * @param {string}  input.ruleVersion    the gate version this run used
 * @param {string|number} input.asOf
 */
export function candidateLedger(input = {}) {
  const diagnostics = []
  const asOfInstant = instantOf(input.asOf)
  if (asOfInstant === null) {
    return {
      data: { candidates: [], nextLedger: null, ledgerRead: null, outcomeCode: 'data_missing' },
      diagnostics: [diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf')],
    }
  }
  const ruleVersion = stringOf(input.ruleVersion)

  // ── ⑴ was the ledger read at all ─────────────────────────────────────────
  const previous = input.previous
  if (previous === undefined) {
    /**
     * ⛔ **`undefined` is nobody having read the key and it is not an empty ledger.**
     * Seeding a fresh roster over a real one loses every hypothesis, every open
     * question and every `discoveredAtEpochMs` this desk has — and the loss reads, on
     * the next run, as a market this desk has never looked at. Pass `null` to say the
     * key was read and holds nothing.
     */
    return {
      data: { candidates: [], nextLedger: null, ledgerRead: false, seeded: false, previousExtraKeys: [], outcomeCode: 'data_missing', requiresReevaluation: [] },
      diagnostics: [
        diagnostic(
          'candidate_ledger_unread',
          'unevaluated',
          'The candidate roster was not read, so no candidate is created and none is advanced. ⚠️ This is an absence and not an empty ledger: pass `null` to say the key was read and holds nothing. A run that seeds over an unread key loses every hypothesis this desk has and the loss is invisible.',
          'previous',
        ),
      ],
    }
  }

  // ── ⑵ is it a ledger this code may carry ─────────────────────────────────
  let carriedCandidates = []
  let carriedCursor = null
  let carriedRanges = []
  let seeded = false
  let previousExtraKeys = []

  if (previous === null) {
    seeded = true
  } else if (typeof previous !== 'object' || Array.isArray(previous)) {
    diagnostics.push(
      diagnostic(
        'candidate_ledger_unreadable',
        'warn',
        'The stored value is not a ledger object. It carries less history and never wrong history: this run starts from an empty roster and writes a well-formed one over it.',
        'previous',
      ),
    )
    seeded = true
  } else {
    const storedVersion = previous.schemaVersion
    const storedAt = instantOf(previous.updatedAtEpochMs ?? null)
    if (storedVersion !== undefined && storedVersion !== null && storedVersion !== CANDIDATE_SCHEMA_VERSION) {
      diagnostics.push(
        diagnostic(
          'candidate_ledger_schema_unknown',
          'blocked',
          `This roster says schemaVersion ${storedVersion} and this code knows ${CANDIDATE_SCHEMA_VERSION}. A writer this code does not know may shape its rows in a way this code silently drops, and dropping history is the failure the document exists to prevent. Nothing is written.`,
          'previous.schemaVersion',
          { storedVersion, known: CANDIDATE_SCHEMA_VERSION },
        ),
      )
    } else if (storedVersion === undefined || storedVersion === null) {
      diagnostics.push(
        diagnostic(
          'candidate_ledger_schema_absent',
          'warn',
          'The stored roster carries no schemaVersion — the shape that existed before this contract. There is nothing to misread, so it degrades to an empty roster rather than refusing, and this run writes a versioned one.',
          'previous.schemaVersion',
        ),
      )
      seeded = true
    }
    if (finite(storedAt) && storedAt > asOfInstant) {
      diagnostics.push(
        diagnostic(
          'candidate_ledger_from_the_future',
          'blocked',
          'This roster was written by a run later than asOf. Its rows can all be past-dated and still leak that run\'s judgement backwards into this one, which is the point-in-time failure no per-row check catches. ⚠️ It cannot lock the key either: this operation writes `updatedAtEpochMs: asOf`, so a forward run never reads its own future.',
          'previous.updatedAtEpochMs',
          { storedAtEpochMs: storedAt, asOfEpochMs: asOfInstant },
        ),
      )
    }
    previousExtraKeys = Object.keys(previous)
      .filter((key) => !KNOWN_LEDGER_KEYS.includes(key))
      .sort()
      .slice(0, 32)
    if (previousExtraKeys.length > 0) {
      diagnostics.push(
        diagnostic(
          'candidate_ledger_extra_keys',
          'warn',
          `The stored roster carries ${previousExtraKeys.join(', ')}, which this contract does not define. They are named here and **not carried**: the size cap measures \`candidates\`, so carrying arbitrary sibling keys is a hole in the cap and in the rule that this document is a roster and not a source cache.`,
          'previous',
          { previousExtraKeys },
        ),
      )
    }
    if (!seeded && !isBlocked(diagnostics)) {
      carriedCandidates = Array.isArray(previous.candidates) ? previous.candidates : []
      carriedCursor = cursorOf(previous.cursor ?? null)
      carriedRanges = (Array.isArray(previous.failedRanges) ? previous.failedRanges : []).map((range) => ({
        kind: stringOf(range?.kind) ?? CURSOR_KIND,
        from: stringOf(range?.from),
        to: stringOf(range?.to),
        reasonCode: stringOf(range?.reasonCode) ?? 'lane_query_failed',
        firstFailedAtEpochMs: instantOf(range?.firstFailedAtEpochMs ?? null),
        attempts: Number.isInteger(range?.attempts) && range.attempts > 0 ? range.attempts : 1,
      }))
    }
  }

  const carried = new Map()
  for (const row of carriedCandidates) {
    const market = stringOf(row?.market) ?? 'XKRX'
    const symbol = stringOf(row?.symbol)
    if (symbol === null) continue
    carried.set(`${market}\u0000${symbol}`, row)
  }

  // ── ⑶ this run's rows, folded onto the carried ones ──────────────────────
  const merged = new Map()
  const requiresReevaluation = []
  for (const row of Array.isArray(input.discovered) ? input.discovered : []) {
    const market = stringOf(row?.market) ?? 'XKRX'
    const symbol = stringOf(row?.symbol)
    if (symbol === null) {
      diagnostics.push(diagnostic('candidate_symbol_missing', 'blocked', 'A candidate row is keyed by (market, symbol) and this one has no symbol', 'discovered[].symbol'))
      continue
    }
    if (symbol.length > CANDIDATE_CAPS.symbolChars) {
      diagnostics.push(
        diagnostic('candidate_symbol_over_cap', 'blocked', `A symbol longer than ${CANDIDATE_CAPS.symbolChars} characters is not a symbol`, `discovered[${symbol}].symbol`, { length: symbol.length, cap: CANDIDATE_CAPS.symbolChars }),
      )
      continue
    }
    const key = `${market}\u0000${symbol}`
    const before = merged.get(key) ?? carried.get(key)
    const where = `candidates[${symbol}]`

    const hypothesis = stringOf(row?.hypothesis) ?? (before ? stringOf(before.hypothesis) : null)
    if (hypothesis !== null && hypothesis.length > CANDIDATE_CAPS.hypothesisChars) {
      diagnostics.push(
        diagnostic('candidate_hypothesis_over_cap', 'blocked', `A hypothesis is one sentence — ${CANDIDATE_CAPS.hypothesisChars} characters. Longer than that is the research, and the research does not live in this document`, `${where}.hypothesis`, {
          length: hypothesis.length,
          cap: CANDIDATE_CAPS.hypothesisChars,
        }),
      )
    }

    /**
     * ⛔ **`evidenceIds` are monotonic: a candidate cannot lose one.** A row handed
     * back without an id the carried record had is a record that reads clean, and a
     * laundered record is worse than a missing one.
     */
    const incomingIds = idsOf(row?.evidenceIds)
    const evidenceIds = [...new Set([...(before ? idsOf(before.evidenceIds) : []), ...incomingIds])]
    if (evidenceIds.length > CANDIDATE_CAPS.evidenceIdsPerCandidate) {
      diagnostics.push(
        diagnostic('candidate_evidence_ids_over_cap', 'blocked', `A candidate carries at most ${CANDIDATE_CAPS.evidenceIdsPerCandidate} evidence ids — the ones the judgement rests on. Past that, the roster is becoming the research file`, `${where}.evidenceIds`, {
          count: evidenceIds.length,
          cap: CANDIDATE_CAPS.evidenceIdsPerCandidate,
        }),
      )
    }

    const incomingState = stringOf(row?.state) ?? (before ? stringOf(before.state) : 'discovered')
    let state = incomingState
    if (!CANDIDATE_STATES.includes(incomingState)) {
      diagnostics.push(
        diagnostic('candidate_state_unknown', 'blocked', `A candidate moves between ${CANDIDATE_STATES.join(' / ')}`, `${where}.state`, { state: incomingState }),
      )
      state = before ? (stringOf(before.state) ?? 'discovered') : 'discovered'
    } else if (before !== undefined) {
      const from = stringOf(before.state) ?? 'discovered'
      const allowed = CANDIDATE_TRANSITIONS[from] ?? []
      const reentryReason = stringOf(row?.reentryReason)
      const newIds = incomingIds.filter((id) => !idsOf(before.evidenceIds).includes(id))
      if (!allowed.includes(incomingState)) {
        /**
         * ⚠️ **The carried record wins and the run is told, at `blocked`.** A finished
         * judgement is not reopened by restatement; a genuinely new view is a
         * transition with its own reason and its own evidence.
         */
        diagnostics.push(
          diagnostic('candidate_state_regressed', 'blocked', `The carried record says \`${from}\` and this run handed back \`${incomingState}\`, which \`${from}\` does not lead to. The carried state stands.`, `${where}.state`, {
            carried: from,
            offered: incomingState,
            allowed,
          }),
        )
        state = from
      } else if (from === 'excluded' && incomingState !== 'excluded' && (reentryReason === null || newIds.length === 0)) {
        diagnostics.push(
          diagnostic('candidate_state_regressed', 'blocked', 'This name was excluded and this run has taken it off the excluded list without saying why or citing anything new. Re-entry costs an explicit `reentryReason` and at least one evidence id the carried row did not have — otherwise a rejection quietly becomes a candidate again and nothing records that it ever was one.', `${where}.state`, {
            carried: from,
            offered: incomingState,
            reentryReason,
            newEvidenceIds: newIds,
          }),
        )
        state = 'excluded'
      }
    }

    /**
     * ⚠️ **A gate that changed is a judgement to redo, not a field to rewrite.** The
     * carried `ruleVersion` stays exactly as it is; what the run gets is a flag and a
     * diagnostic naming both versions.
     */
    const carriedRule = before ? stringOf(before.ruleVersion) : null
    const rowRule = carriedRule ?? stringOf(row?.ruleVersion) ?? ruleVersion
    const reevaluate = ruleVersion !== null && rowRule !== null && rowRule !== ruleVersion
    if (reevaluate) {
      requiresReevaluation.push(symbol)
      diagnostics.push(
        diagnostic('rule_version_changed', 'warn', `${symbol} was found under \`${rowRule}\` and this run's gate is \`${ruleVersion}\`. ⛔ It is not migrated: re-run the three axes against the current gate and say what the answer was. A row rewritten to the new version is a judgement nobody made.`, `${where}.ruleVersion`, {
          symbol,
          candidateRuleVersion: rowRule,
          runRuleVersion: ruleVersion,
        }),
      )
    }

    const discoveredAt = before ? (instantOf(before.discoveredAtEpochMs) ?? asOfInstant) : (instantOf(row?.discoveredAtEpochMs) ?? asOfInstant)
    const history = [...(Array.isArray(before?.history) ? before.history : [])]
    const previousState = before ? (stringOf(before.state) ?? null) : null
    if (previousState !== state || before === undefined) {
      history.push({ atEpochMs: asOfInstant, from: previousState, to: state, ruleVersion: ruleVersion ?? rowRule })
    }

    merged.set(key, {
      symbol,
      market,
      state,
      discoveredAtEpochMs: discoveredAt,
      lastSeenAtEpochMs: asOfInstant,
      discoveryPath: [...new Set([...(Array.isArray(before?.discoveryPath) ? before.discoveryPath : []), ...(Array.isArray(row?.discoveryPath) ? row.discoveryPath : [])])].filter((entry) => typeof entry === 'string'),
      ruleVersion: rowRule,
      requiresReevaluation: reevaluate,
      hypothesis,
      sectionsComplete: [...new Set([...(Array.isArray(before?.sectionsComplete) ? before.sectionsComplete : []), ...(Array.isArray(row?.sectionsComplete) ? row.sectionsComplete : [])])].filter((entry) => typeof entry === 'string'),
      openQuestions: Array.isArray(row?.openQuestions) ? row.openQuestions.filter((entry) => typeof entry === 'string') : Array.isArray(before?.openQuestions) ? before.openQuestions : [],
      evidenceIds,
      /** ⚠️ This package's own field: the foreign key into `lib/programme.mjs`. */
      programmeIds: [...new Set([...(Array.isArray(before?.programmeIds) ? before.programmeIds : []), ...(Array.isArray(row?.programmeIds) ? row.programmeIds : [])])].filter((entry) => typeof entry === 'string'),
      nextReviewAtEpochMs: instantOf(row?.nextReviewAtEpochMs ?? before?.nextReviewAtEpochMs ?? null),
      nextReviewCondition: stringOf(row?.nextReviewCondition) ?? (before ? stringOf(before.nextReviewCondition) : null),
      excludedReasonCode: state === 'excluded' ? (stringOf(row?.excludedReasonCode) ?? (before ? stringOf(before.excludedReasonCode) : null)) : null,
      reentryReason: stringOf(row?.reentryReason) ?? (before ? stringOf(before.reentryReason) : null),
      history,
    })
  }

  // ── ⑷ carried rows this run did not see are kept exactly as they were ────
  for (const [key, row] of carried) {
    if (merged.has(key)) continue
    merged.set(key, {
      symbol: stringOf(row?.symbol),
      market: stringOf(row?.market) ?? 'XKRX',
      state: CANDIDATE_STATES.includes(row?.state) ? row.state : 'discovered',
      discoveredAtEpochMs: instantOf(row?.discoveredAtEpochMs ?? null),
      lastSeenAtEpochMs: instantOf(row?.lastSeenAtEpochMs ?? null),
      discoveryPath: Array.isArray(row?.discoveryPath) ? row.discoveryPath : [],
      ruleVersion: stringOf(row?.ruleVersion),
      requiresReevaluation: ruleVersion !== null && stringOf(row?.ruleVersion) !== null && row.ruleVersion !== ruleVersion,
      hypothesis: stringOf(row?.hypothesis),
      sectionsComplete: Array.isArray(row?.sectionsComplete) ? row.sectionsComplete : [],
      openQuestions: Array.isArray(row?.openQuestions) ? row.openQuestions : [],
      evidenceIds: idsOf(row?.evidenceIds),
      programmeIds: Array.isArray(row?.programmeIds) ? row.programmeIds : [],
      nextReviewAtEpochMs: instantOf(row?.nextReviewAtEpochMs ?? null),
      nextReviewCondition: stringOf(row?.nextReviewCondition),
      excludedReasonCode: stringOf(row?.excludedReasonCode),
      reentryReason: stringOf(row?.reentryReason),
      history: Array.isArray(row?.history) ? row.history : [],
    })
    const untouched = merged.get(key)
    if (untouched.requiresReevaluation && !requiresReevaluation.includes(untouched.symbol)) {
      requiresReevaluation.push(untouched.symbol)
      diagnostics.push(
        diagnostic('rule_version_changed', 'warn', `${untouched.symbol} is carried under \`${untouched.ruleVersion}\` and this run's gate is \`${ruleVersion}\`. ⛔ It is not migrated.`, `candidates[${untouched.symbol}].ruleVersion`, {
          symbol: untouched.symbol,
          candidateRuleVersion: untouched.ruleVersion,
          runRuleVersion: ruleVersion,
        }),
      )
    }
  }

  const candidates = [...merged.values()]
  if (candidates.length > CANDIDATE_CAPS.candidates) {
    diagnostics.push(
      diagnostic('candidate_ledger_cap_exceeded', 'blocked', `${candidates.length} candidates against a cap of ${CANDIDATE_CAPS.candidates}. ⛔ A cap that binds is a signal to exclude or to age names out — never to widen the cap — so nothing is written until the roster is brought under it.`, 'candidates', {
        count: candidates.length,
        cap: CANDIDATE_CAPS.candidates,
      }),
    )
  }

  // ── ⑸ the prohibition, computed rather than promised ─────────────────────
  /**
   * ⚠️ **Scanned on the way in, not only on the way out.** The fold above copies the
   * fields this contract defines and would silently drop a vendor field rather than
   * refusing it — which is the quietest possible version of this failure: the run
   * believes it stored the prices and every later run reads a roster that never had
   * them. So the incoming rows and the carried ones are both walked.
   */
  const hits = vendorPayloadHits(
    { incoming: Array.isArray(input.discovered) ? input.discovered : [], carried: carriedCandidates, candidates },
    'ledger',
    [],
  )
  if (hits.length > 0) {
    diagnostics.push(
      diagnostic(
        'memory_holds_vendor_payload',
        'blocked',
        `This roster is not a source cache and not an account database: ${hits.slice(0, 8).map((hit) => hit.path).join(', ')} ${hits.length === 1 ? 'is' : 'are'} vendor payload or account state. Prices come from the broker connection, filings from the host source cache and holdings from \`portfolio_get\` — every run, from the source, never from here.`,
        'candidates',
        { hits: hits.slice(0, 16), forbiddenKeys: FORBIDDEN_KEYS },
      ),
    )
  }

  // ── ⑹ the failed ranges, retried before anything new ─────────────────────
  const resolved = new Set((Array.isArray(input.resolvedRanges) ? input.resolvedRanges : []).map((range) => rangeKey({ kind: stringOf(range?.kind) ?? CURSOR_KIND, from: stringOf(range?.from), to: stringOf(range?.to) })))
  const ranges = new Map()
  for (const range of carriedRanges) {
    if (resolved.has(rangeKey(range))) continue
    ranges.set(rangeKey(range), { ...range })
  }
  for (const range of Array.isArray(input.failedRanges) ? input.failedRanges : []) {
    const row = {
      kind: stringOf(range?.kind) ?? CURSOR_KIND,
      from: stringOf(range?.from),
      to: stringOf(range?.to),
      reasonCode: stringOf(range?.reasonCode) ?? 'lane_query_failed',
      firstFailedAtEpochMs: instantOf(range?.firstFailedAtEpochMs ?? null) ?? asOfInstant,
      attempts: 1,
    }
    const key = rangeKey(row)
    const before = ranges.get(key)
    if (before === undefined) {
      ranges.set(key, row)
    } else {
      /** ⚠️ A retry is `attempts + 1` on the **same** row, keeping the first failure's instant. */
      ranges.set(key, { ...before, reasonCode: row.reasonCode, attempts: before.attempts + 1 })
    }
  }
  const failedRanges = [...ranges.values()]

  // ── ⑺ the cursor, inside the same document ───────────────────────────────
  const proposedCursor = cursorOf(input.cursor)
  let cursor = carriedCursor
  if (input.advanceCursor === true && failedRanges.length === 0) {
    cursor = proposedCursor ?? carriedCursor
  } else if (proposedCursor !== null && !sameCursor(proposedCursor, carriedCursor)) {
    diagnostics.push(
      diagnostic(
        'cursor_advance_refused',
        'warn',
        `The cursor stays at ${carriedCursor?.value ?? 'the start'}: ${failedRanges.length > 0 ? `${failedRanges.length} range(s) are still unread` : 'this run did not complete a range'}. A cursor past a failed range turns a transient vendor error into a permanently unread slice of the market.`,
        'cursor',
        { proposed: proposedCursor, held: carriedCursor, failedRanges: failedRanges.length },
      ),
    )
  }
  if (cursor !== null && cursor.kind !== null && cursor.kind !== CURSOR_KIND) {
    diagnostics.push(
      diagnostic('cursor_kind_unexpected', 'blocked', `This package's cursor is a \`${CURSOR_KIND}\` whose value is an \`rcept_no\``, 'cursor.kind', { kind: cursor.kind, expected: CURSOR_KIND }),
    )
  }

  const blocked = isBlocked(diagnostics)
  const nextLedger = blocked
    ? null
    : {
        schemaVersion: CANDIDATE_SCHEMA_VERSION,
        strategy: STRATEGY,
        ruleVersion,
        updatedAtEpochMs: asOfInstant,
        cursor,
        failedRanges,
        candidates,
      }

  if (nextLedger !== null) {
    const bytes = Buffer.byteLength(JSON.stringify(nextLedger), 'utf8')
    if (bytes > CANDIDATE_CAPS.serialisedBytes) {
      diagnostics.push(
        diagnostic('candidate_ledger_over_size', 'blocked', `The serialised roster is ${bytes} bytes against a cap of ${CANDIDATE_CAPS.serialisedBytes}. Age names out or exclude them with a reason; the cap is what keeps this document a roster.`, 'candidates', {
          bytes,
          cap: CANDIDATE_CAPS.serialisedBytes,
        }),
      )
      return { data: { candidates, nextLedger: null, ledgerRead: true, seeded, previousExtraKeys, requiresReevaluation, failedRanges, cursor, outcomeCode: 'research_incomplete', serialisedBytes: bytes }, diagnostics }
    }
  }

  return {
    data: {
      candidates,
      nextLedger,
      ledgerRead: true,
      seeded,
      previousExtraKeys,
      requiresReevaluation,
      failedRanges,
      cursor,
      outcomeCode: blocked ? 'research_incomplete' : null,
      serialisedBytes: nextLedger === null ? null : Buffer.byteLength(JSON.stringify(nextLedger), 'utf8'),
    },
    diagnostics,
  }
}
