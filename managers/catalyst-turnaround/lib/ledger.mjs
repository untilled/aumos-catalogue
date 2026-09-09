import { CATALYST_STATES, CATALYST_TRANSITIONS, METHODOLOGY, TERMINAL_STATES } from './constants.mjs'
import { DAY_MS, blocked, cause, diagnostic, finite, instantOf, round } from './diagnostics.mjs'

/**
 * ── The catalyst ledger, which is the only thing in this package that is not
 *    prose ────────────────────────────────────────────────────────────────
 *
 * #258 asks for a record with seven parts — kind, primary source, publication
 * time, confirmed-or-estimated, expected window, confirming indicator, and the
 * success and failure conditions — and then asks that the record be **updated**
 * across 예정 / 진행 / 실현 / 지연 / 실패 while the position is held. Both halves
 * are things a model does inconsistently and a table does identically, and the
 * three failures that motivated putting them in code are all silent:
 *
 *   ⑴ **a date nobody has.** With no confirmed date the honest record is a
 *      reasoned range and its uncertainty. A model asked for a window will
 *      produce one, and the produced one is indistinguishable from a read one
 *      once it is written down. So `dateStatus` is required on the row, an
 *      `estimated` row must carry a `basis` and a non-zero `uncertaintyDays`,
 *      and a `confirmed` row must carry neither.
 *
 *   ⑵ **last year's news, read as this year's.** Korean policy stories recur
 *      annually with near-identical wording. A source published more than
 *      `priorYearStaleDays` before `asOf` is refused as a *current* catalyst
 *      here rather than argued about in prose.
 *
 *   ⑶ **the delay that never ends.** #258's own words: recording the same
 *      threat repeatedly and holding indefinitely is the failure this exists to
 *      stop. A delay costs new evidence, a remaining expected return and an
 *      additional downside, or it is not accepted; and the third one is not
 *      accepted at all.
 *
 * ⛔ **A price move is never catalyst success.** It is the one substitution the
 * methodology forbids by name, so `realised` requires the confirming indicator
 * and refuses a transition whose only evidence is the share price.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/catalysts.mjs`**: the register's
 * carry-forward shape (a `previous` revision in, a `nextRegister` out), the
 * epoch-milliseconds encoding of instants, and the refusal to register a window
 * with no `evidenceIds`. Everything about states, delays, adjudication and
 * staleness is this package's and has no counterpart there — that file produces
 * *windows to scan*, this one manages *a position's catalyst*.
 */

const CATALYST_KINDS = Object.freeze([
  'policy-decision',
  'tariff-or-price-revision',
  'receivable-settlement',
  'asset-disposal',
  'refinancing-or-capital-raise',
  'contract-award',
  'restructuring-completion',
  'regulatory-approval',
  'earnings-release',
])

const REQUIRED = ['id', 'kind', 'publishedAt', 'dateStatus']

/** The evidence kinds a `realised` transition may rest on. */
const CONFIRMING_EVIDENCE = Object.freeze([
  'filing',
  'regulator-notice',
  'company-disclosure',
  'audited-statement',
  'policy-gazette',
])

/** The one that is never enough on its own, and the reason this list exists. */
const NON_CONFIRMING_EVIDENCE = Object.freeze(['price-move', 'broker-note', 'press-speculation'])

function windowOf(row) {
  return {
    startsAt: instantOf(row?.expectedWindow?.startsAt ?? row?.expectedWindow?.windowStartEpochMs),
    endsAt: instantOf(row?.expectedWindow?.endsAt ?? row?.expectedWindow?.windowEndEpochMs),
    uncertaintyDays: row?.expectedWindow?.uncertaintyDays ?? null,
    basis: row?.expectedWindow?.basis ?? null,
  }
}

/**
 * One catalyst row, normalised, with everything that is wrong with it named.
 *
 * The row is returned even when it is refused: a run has to be able to say
 * *which* catalyst it could not register, and a null teaches nothing.
 */
function normaliseRow(input, { asOfInstant, horizonDays, staleDays }) {
  const diagnostics = []
  const where = `catalysts[${input?.id ?? '?'}]`
  for (const field of REQUIRED) {
    if (input?.[field] === undefined || input?.[field] === null || input?.[field] === '') {
      diagnostics.push(diagnostic('catalyst_field_missing', 'blocked', `A catalyst row carries ${field}`, `${where}.${field}`))
    }
  }
  if (input?.kind !== undefined && !CATALYST_KINDS.includes(input.kind)) {
    diagnostics.push(
      diagnostic('catalyst_kind_unknown', 'blocked', 'A catalyst kind outside the registered set is a row the ledger cannot group by', `${where}.kind`, {
        kind: input.kind,
        registered: CATALYST_KINDS,
      }),
    )
  }

  // ── the primary source, and the two instants that are not each other ──────
  const source = input?.source ?? {}
  if (!source.url || !source.publisher) {
    diagnostics.push(
      diagnostic('catalyst_source_missing', 'blocked', 'A catalyst names the document it came from and who published it; a summary of a summary is not a primary source', `${where}.source`),
    )
  }
  const publishedAt = instantOf(input?.publishedAt)
  const reportDate = instantOf(input?.reportDate)
  if (publishedAt === null) {
    diagnostics.push(diagnostic('catalyst_published_at_unreadable', 'blocked', 'publishedAt is the instant the document became public, and it has to parse', `${where}.publishedAt`))
  }
  /**
   * ⚠️ **The announcement time and the report date are two facts and a run that
   * conflates them replays the future.** A Q2 report *dated* 2026-06-30 is
   * *published* six weeks later; treating the period end as the publication
   * instant makes six weeks of hindsight look like it was on the table. So both
   * are carried, and a report date after its own announcement is refused.
   */
  if (reportDate !== null && publishedAt !== null && reportDate > publishedAt) {
    diagnostics.push(
      diagnostic('report_date_after_announcement', 'blocked', 'The period a document covers ends before the document is published; these two instants have been swapped', `${where}.reportDate`, {
        reportDate: input.reportDate,
        publishedAt: input.publishedAt,
      }),
    )
  }
  if (publishedAt !== null && publishedAt > asOfInstant) {
    diagnostics.push(diagnostic('catalyst_source_after_as_of', 'blocked', 'This document did not exist at asOf', `${where}.publishedAt`, { publishedAt: input.publishedAt }))
  }

  /**
   * ⑵ Last year's story. Refused as a *current* catalyst, and it is worth being
   * precise about what that means: the document is not disputed and may still be
   * cited as background. What it may not do is open a window.
   */
  const ageDays = publishedAt === null ? null : round((asOfInstant - publishedAt) / DAY_MS, 3)
  const stale = ageDays !== null && ageDays > staleDays
  if (stale) {
    diagnostics.push(
      diagnostic('catalyst_source_stale', 'blocked', `This source is ${ageDays} days old, past the ${staleDays}-day line — a story that has had a full reporting year to appear in results and has not is an absence to record, not a catalyst to register`, `${where}.publishedAt`, {
        ageDays,
        staleDays,
      }),
    )
  }

  // ── ⑴ confirmed and estimated are different rows, not different adjectives ─
  const window = windowOf(input)
  if (input?.dateStatus === 'confirmed') {
    if (window.startsAt === null || window.endsAt === null) {
      diagnostics.push(diagnostic('catalyst_window_missing', 'blocked', 'A confirmed catalyst has a window; that is what confirmed means', `${where}.expectedWindow`))
    }
    if (finite(window.uncertaintyDays) && window.uncertaintyDays > 0) {
      diagnostics.push(
        diagnostic('confirmed_date_carries_uncertainty', 'blocked', 'A date is confirmed or it is estimated. A confirmed row with uncertainty attached is an estimate that has been promoted by adjective', `${where}.expectedWindow.uncertaintyDays`),
      )
    }
  } else if (input?.dateStatus === 'estimated') {
    if (!finite(window.uncertaintyDays) || window.uncertaintyDays <= 0) {
      diagnostics.push(
        diagnostic('estimate_without_uncertainty', 'blocked', 'With no confirmed date the record is a range and its uncertainty. A point estimate here is a date this run invented', `${where}.expectedWindow.uncertaintyDays`),
      )
    }
    if (typeof window.basis !== 'string' || window.basis.length < 8) {
      diagnostics.push(
        diagnostic('estimate_without_basis', 'blocked', 'A reasoned range says what it is reasoned from — a filing cadence, a stated review schedule, a regulator’s own calendar', `${where}.expectedWindow.basis`),
      )
    }
  } else if (input?.dateStatus !== undefined) {
    diagnostics.push(diagnostic('date_status_unknown', 'blocked', 'dateStatus is "confirmed" or "estimated"', `${where}.dateStatus`, { dateStatus: input.dateStatus }))
  }

  // ── the parts that make the row adjudicable at all ────────────────────────
  const indicator = input?.confirmingIndicator ?? {}
  if (!indicator.name || !indicator.unit || !indicator.source) {
    diagnostics.push(
      diagnostic('confirming_indicator_missing', 'blocked', 'A catalyst nobody can check is a hope. Name the number, its unit and where it will be read', `${where}.confirmingIndicator`),
    )
  }
  if (typeof input?.successCondition !== 'string' || typeof input?.failureCondition !== 'string') {
    diagnostics.push(
      diagnostic('conditions_missing', 'blocked', 'Success and failure are written before the window opens, or they are written afterwards to fit what happened', `${where}.successCondition`),
    )
  }
  const evidenceIds = Array.isArray(input?.evidenceIds) ? input.evidenceIds.filter((id) => typeof id === 'string' && id) : []
  if (evidenceIds.length === 0) {
    diagnostics.push(
      diagnostic('catalyst_uncited', 'blocked', 'A registered catalyst is one somebody can go and check; cite the evidence ids the host issued for the reading', `${where}.evidenceIds`),
    )
  }

  const state = CATALYST_STATES.includes(input?.state) ? input.state : 'scheduled'
  const inHorizon =
    window.startsAt !== null &&
    window.endsAt !== null &&
    window.startsAt <= asOfInstant + horizonDays * DAY_MS &&
    window.endsAt >= asOfInstant

  return {
    row: {
      id: input?.id ?? null,
      kind: input?.kind ?? null,
      source: { url: source.url ?? null, publisher: source.publisher ?? null, documentId: source.documentId ?? null },
      publishedAtEpochMs: publishedAt,
      reportDateEpochMs: reportDate,
      dateStatus: input?.dateStatus ?? null,
      windowStartEpochMs: window.startsAt,
      windowEndEpochMs: window.endsAt,
      uncertaintyDays: finite(window.uncertaintyDays) ? window.uncertaintyDays : null,
      windowBasis: window.basis,
      confirmingIndicator: indicator.name ? { name: indicator.name, unit: indicator.unit ?? null, source: indicator.source ?? null } : null,
      successCondition: input?.successCondition ?? null,
      failureCondition: input?.failureCondition ?? null,
      evidenceIds,
      contraryEvidence: Array.isArray(input?.contraryEvidence) ? [...input.contraryEvidence] : [],
      state,
      delayCount: Number.isInteger(input?.delayCount) ? input.delayCount : 0,
      cancelled: input?.cancelled === true,
      history: Array.isArray(input?.history) ? [...input.history] : [],
      ageDays,
      stale,
      inHorizon,
      registered: !blocked(diagnostics),
    },
    diagnostics,
  }
}

/**
 * The one transition, applied. Returns the new row and what it cost to get it.
 *
 * ⛔ The three refusals here are the whole state machine: out of a terminal
 * state, into `realised` on a price move, and into `delayed` without the three
 * things a deadline extension owes the investor.
 */
function applyTransition(row, move, { asOfInstant, maxDelays }) {
  const diagnostics = []
  const where = `transitions[${move?.catalystId ?? '?'}→${move?.to ?? '?'}]`
  const to = move?.to
  if (!CATALYST_STATES.includes(to)) {
    diagnostics.push(diagnostic('transition_target_unknown', 'blocked', `A catalyst moves between ${CATALYST_STATES.join(' / ')}`, `${where}.to`))
    return { row, diagnostics }
  }
  if (TERMINAL_STATES.includes(row.state)) {
    diagnostics.push(
      diagnostic('catalyst_state_terminal', 'blocked', `This catalyst is already ${row.state}, and a finished record is not edited. A genuinely new catalyst is a new row with its own source, which keeps the old finding readable`, `${where}.to`, {
        from: row.state,
        to,
      }),
    )
    return { row, diagnostics }
  }
  if (!CATALYST_TRANSITIONS[row.state].includes(to)) {
    diagnostics.push(diagnostic('catalyst_transition_illegal', 'blocked', `${row.state} does not lead to ${to}`, `${where}.to`, { allowed: CATALYST_TRANSITIONS[row.state] }))
    return { row, diagnostics }
  }

  const evidenceIds = Array.isArray(move?.evidenceIds) ? move.evidenceIds.filter((id) => typeof id === 'string' && id) : []
  const evidenceKinds = Array.isArray(move?.evidenceKinds) ? move.evidenceKinds : []
  const observedAt = instantOf(move?.observedAt)
  if (observedAt === null || observedAt > asOfInstant) {
    diagnostics.push(diagnostic('transition_observed_at_invalid', 'blocked', 'A state change is observed at an instant at or before asOf', `${where}.observedAt`))
    return { row, diagnostics }
  }

  const next = { ...row, history: [...row.history] }

  if (to === 'realised') {
    const confirming = evidenceKinds.filter((kind) => CONFIRMING_EVIDENCE.includes(kind))
    const nonConfirming = evidenceKinds.filter((kind) => NON_CONFIRMING_EVIDENCE.includes(kind))
    if (confirming.length === 0) {
      diagnostics.push(
        diagnostic('price_move_is_not_catalyst_success', 'blocked', 'Success is the confirming indicator arriving in a document. A share price that went up while everyone waited is the market’s opinion of the wait, and recording it here is how a ledger of catalysts becomes a ledger of moods', `${where}.evidenceKinds`, {
          offered: evidenceKinds,
          confirming: CONFIRMING_EVIDENCE,
          neverEnough: nonConfirming,
        }),
      )
      return { row, diagnostics }
    }
    if (move?.confirmingIndicatorMet !== true) {
      diagnostics.push(
        diagnostic('confirming_indicator_not_met', 'blocked', 'The row named the number that would confirm it; say that number arrived', `${where}.confirmingIndicatorMet`),
      )
      return { row, diagnostics }
    }
    next.state = 'realised'
    next.realisedAtEpochMs = observedAt
  } else if (to === 'delayed') {
    const newEnd = instantOf(move?.newWindowEndsAt)
    const complete =
      evidenceIds.length > 0 &&
      newEnd !== null &&
      row.windowEndEpochMs !== null &&
      newEnd > row.windowEndEpochMs &&
      finite(move?.remainingExpectedReturn) &&
      finite(move?.additionalDownside)
    if (!complete) {
      diagnostics.push(
        diagnostic('delay_without_new_evidence', 'blocked', 'Moving a deadline costs three things: new evidence, the return still expected from here, and the additional downside now being accepted. Without them the extension is the position defending itself', `${where}`, {
          hasEvidence: evidenceIds.length > 0,
          movesForward: newEnd !== null && row.windowEndEpochMs !== null ? newEnd > row.windowEndEpochMs : null,
          remainingExpectedReturn: move?.remainingExpectedReturn ?? null,
          additionalDownside: move?.additionalDownside ?? null,
        }),
      )
      return { row, diagnostics }
    }
    next.state = 'delayed'
    next.delayCount = row.delayCount + 1
    next.windowEndEpochMs = newEnd
    next.remainingExpectedReturn = move.remainingExpectedReturn
    next.additionalDownside = move.additionalDownside
    if (next.delayCount > maxDelays) {
      /**
       * ⚠️ Not `blocked`. The extension is recorded, because refusing to write
       * it down would lose the very pattern this counts — and the run is then
       * told, in the verdict, that the position has run out of extensions.
       */
      diagnostics.push(
        diagnostic('repeated_delay_exhausted', 'note', `This is delay ${next.delayCount} on one catalyst, past the ${maxDelays} this methodology accepts. The remaining question is not when it lands but whether the capital should still be here`, `${where}`, {
          delayCount: next.delayCount,
          maxDelays,
        }),
      )
    }
  } else if (to === 'failed') {
    next.state = 'failed'
    next.cancelled = move?.reason === 'cancelled'
    next.failedAtEpochMs = observedAt
    next.failureReason = move?.reason ?? 'failure-condition-met'
  } else {
    next.state = to
  }

  if (move?.contrary === true) {
    next.contraryEvidence = [...row.contraryEvidence, ...evidenceIds]
  }
  next.evidenceIds = [...new Set([...row.evidenceIds, ...evidenceIds])]
  next.history.push({
    from: row.state,
    to: next.state,
    observedAtEpochMs: observedAt,
    evidenceIds,
    reason: move?.reason ?? null,
  })
  return { row: next, diagnostics }
}

/**
 * The ledger for one run.
 *
 * `previous` is the register this manager wrote last time — the only durable
 * state it owns, and it holds aggregates and research progress rather than
 * copied vendor data. `rows` are the catalysts this run read; `transitions` are
 * the state changes it observed.
 */
export function catalystLedger({ previous = null, rows = [], transitions = [], asOf, config = {} } = {}) {
  const diagnostics = []
  const causes = []
  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    diagnostics.push(diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf'))
    return { data: { rows: [], nextRegister: previous ?? { catalysts: [] } }, diagnostics, causes }
  }
  const horizonDays = finite(config.catalystHorizonDays) ? config.catalystHorizonDays : METHODOLOGY.catalystHorizonDays
  const staleDays = finite(config.priorYearStaleDays) ? config.priorYearStaleDays : METHODOLOGY.priorYearStaleDays
  const maxDelays = Number.isInteger(config.maxDelays) ? config.maxDelays : METHODOLOGY.maxDelays

  const carried = new Map((previous?.catalysts ?? []).map((row) => [row.id, row]))

  const normalised = []
  for (const input of rows) {
    const { row, diagnostics: rowDiagnostics } = normaliseRow(input, { asOfInstant, horizonDays, staleDays })
    diagnostics.push(...rowDiagnostics)

    const before = carried.get(row.id)
    if (before !== undefined) {
      /**
       * ⛔ **The record only grows.** Two ways a contrary finding disappears —
       * the row comes back without it, or the state walks backwards out of a
       * terminal one — and both are the same mistake wearing different clothes.
       * The carried value wins and the run is told, at `blocked`, because a
       * laundered record is worse than a missing one: it reads as clean.
       */
      const dropped = before.contraryEvidence?.filter((id) => !row.contraryEvidence.includes(id)) ?? []
      if (dropped.length > 0) {
        row.contraryEvidence = [...new Set([...before.contraryEvidence, ...row.contraryEvidence])]
        diagnostics.push(
          diagnostic('contrary_evidence_dropped', 'blocked', 'This run handed back a catalyst whose contrary evidence is missing from the carried record. It has been reinstated; what cannot be reinstated is the reason it went, so the run stops here rather than proceeding on a record that reads clean', `catalysts[${row.id}].contraryEvidence`, {
            dropped,
          }),
        )
      }
      if (TERMINAL_STATES.includes(before.state) && before.state !== row.state) {
        row.state = before.state
        row.delayCount = Math.max(row.delayCount, before.delayCount ?? 0)
        diagnostics.push(
          diagnostic('catalyst_state_regressed', 'blocked', `The carried record says ${before.state} and this run handed back something else. A finished catalyst is not reopened by restatement`, `catalysts[${row.id}].state`, {
            carried: before.state,
          }),
        )
      } else {
        row.delayCount = Math.max(row.delayCount, before.delayCount ?? 0)
        row.contraryEvidence = [...new Set([...(before.contraryEvidence ?? []), ...row.contraryEvidence])]
        row.history = [...(before.history ?? []), ...row.history]
      }
    }
    normalised.push(row)
  }

  const byId = new Map(normalised.map((row) => [row.id, row]))
  for (const move of transitions) {
    const target = byId.get(move?.catalystId)
    if (target === undefined) {
      diagnostics.push(diagnostic('transition_target_missing', 'blocked', 'A state change names a catalyst this run registered', `transitions[${move?.catalystId ?? '?'}]`))
      continue
    }
    const { row, diagnostics: moveDiagnostics } = applyTransition(target, move, { asOfInstant, maxDelays })
    diagnostics.push(...moveDiagnostics)
    byId.set(row.id, row)
  }

  const finalRows = normalised.map((row) => byId.get(row.id))

  /**
   * The deadline arriving is a **decision point**, not a fact about the world:
   * #258 requires success / delay / failure to be adjudicated when the window
   * closes, and compared against a benchmark alternative. A row whose window
   * ended before `asOf` and is still open is flagged rather than assumed.
   */
  for (const row of finalRows) {
    row.dueForAdjudication = row.windowEndEpochMs !== null && row.windowEndEpochMs <= asOfInstant && !TERMINAL_STATES.includes(row.state)
    if (row.dueForAdjudication) {
      causes.push(
        cause('research_incomplete', `The window on ${row.id} closed and this run has not called it success, delay or failure. Holding past a deadline is a decision and it is made explicitly`, `catalysts[${row.id}]`, {
          windowEndEpochMs: row.windowEndEpochMs,
        }),
      )
    }
  }

  const registered = finalRows.filter((row) => row.registered)
  const current = registered.filter((row) => row.inHorizon || TERMINAL_STATES.includes(row.state))

  const summary = {
    registered: registered.length,
    current: current.length,
    realised: current.filter((row) => row.state === 'realised').length,
    delayed: current.filter((row) => row.state === 'delayed').length,
    failed: current.filter((row) => row.state === 'failed').length,
    cancelled: current.filter((row) => row.cancelled).length,
    delayExhausted: current.some((row) => row.delayCount > maxDelays),
    confirmedDates: current.filter((row) => row.dateStatus === 'confirmed').length,
    estimatedDates: current.filter((row) => row.dateStatus === 'estimated').length,
    dueForAdjudication: finalRows.filter((row) => row.dueForAdjudication).map((row) => row.id),
  }

  /**
   * ⚠️ Instants go back to the register as **numbers**, for the reason
   * evidence-gated found the hard way: a catalyst window ends in the future by
   * construction, and a host that walks a payload for post-`asOf` string
   * timestamps refuses the whole read. The meaning is identical and the key
   * says so.
   */
  const nextRegister = {
    version: 1,
    updatedAtEpochMs: asOfInstant,
    catalysts: finalRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      state: row.state,
      delayCount: row.delayCount,
      cancelled: row.cancelled,
      dateStatus: row.dateStatus,
      publishedAtEpochMs: row.publishedAtEpochMs,
      reportDateEpochMs: row.reportDateEpochMs,
      windowStartEpochMs: row.windowStartEpochMs,
      windowEndEpochMs: row.windowEndEpochMs,
      uncertaintyDays: row.uncertaintyDays,
      evidenceIds: row.evidenceIds,
      contraryEvidence: row.contraryEvidence,
      history: row.history,
    })),
  }

  return { data: { rows: finalRows, current, summary, nextRegister }, diagnostics, causes }
}

export const LEDGER_VOCABULARY = Object.freeze({
  kinds: CATALYST_KINDS,
  confirmingEvidence: CONFIRMING_EVIDENCE,
  neverConfirming: NON_CONFIRMING_EVIDENCE,
})
