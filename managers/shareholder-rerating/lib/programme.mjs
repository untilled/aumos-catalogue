/**
 * ── 발표와 집행을 구분한다: one programme, three receipts, three counters ────
 *
 * #305's completion condition for this package is one sentence: *«SR이 신규 환원 공시와
 * 후속 집행 공시를 같은 프로그램으로 연결하고, 발표와 집행을 구분한다.»* This module is
 * that link, and everything about its shape follows from the two mistakes it exists to
 * make impossible.
 *
 * ⛔ **① An announcement and an execution are two documents and one of them is a
 * sentence.** 주요사항보고서 (자기주식 취득 결정) says what a company intends; 자기주식
 * 취득 결과보고서 says what it bought. A run reading a headline gets the first and
 * reports the second, and the whole methodology turns on the difference. So the two
 * arrive through **different arguments** — `announcements` and `executions` — and a
 * programme with only the first is `announced-not-executed`'s input rather than
 * evidence for anything.
 *
 * ⛔ **② Three counters are never folded into one.** They answer three questions:
 *
 * | counter | the document | what it means |
 * |---|---|---|
 * | `executedAmount` | 자기주식 취득 **결과**보고서 | shares were bought. They sit in treasury and can be sold again, used in a merger, or handed out as compensation |
 * | `retiredAmount` | 자기주식 **소각** 결정 | shares were destroyed. This one cannot be undone, and it is the only one that permanently moves the per-share figures |
 * | `cancelledAmount` | the programme's own withdrawal or reduction | the company decided **not** to buy. It is the opposite of execution |
 *
 * A sum of the three is a number about nothing. Worse, folding `cancelledAmount` into
 * `executedAmount` makes a programme that was abandoned read as a programme that was
 * completed — which is the single most flattering error available here, so it is the
 * blocking diagnostic `cancellation_counted_as_execution`.
 *
 * ── The arithmetic, which is `skills/return-policy-evidence/SKILL.md`'s ────
 *
 *   executionRate = executedAmount / announcedAmount
 *   elapsedShare  = min(1, (asOf − windowStart) / (windowEnd − windowStart))
 *   pace          = executionRate / elapsedShare
 *
 * ⚠️ **The window is the issuer's own declared one**, so a three-month programme and a
 * twelve-month one are judged on one scale. ⚠️ **Below `executionObservableElapsed` of
 * it the pace is arithmetic and not a fact** — a programme three days into a year has
 * bought nothing and is not behind — and that case is `unevaluated`.
 *
 * ⛔ **Every threshold is imported from `lib/thresholds.mjs` and none is restated
 * here.** A number written twice is a number that will disagree with itself, and the
 * claim `thresholds.mjs` opens with is that the whole of this package's discretion is
 * readable on one screen.
 *
 * ── The orphan, and why it is a cursor instruction and not a programme ─────
 *
 * An execution receipt whose `(symbol, programmeId)` has no announcement — here or in
 * the carried state — means the sweep started **after** the decision that opened the
 * programme. ⛔ The answer is not to invent a programme around the execution: the
 * announced amount and the window would both be fabricated, and every pace this desk
 * computed afterwards would be against a schedule nobody published. The answer is to
 * walk the DART cursor back and read the 결정 공시, which is why
 * `execution_without_announcement` carries the receipt number to resume from.
 */

import { diagnostic, finite, instantOf, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'

export const PROGRAMME_SCHEMA_VERSION = 1

/**
 * ⚠️ **A ratio and an amount are different promises.** «35% of consolidated profit»
 * falls with profit; «300 billion won a year» does not. The bear case turns on which,
 * so the kind is carried rather than inferred — and an `announcedAmount` that is a
 * ratio is not money, so no execution rate can be computed from it.
 */
export const ANNOUNCED_KINDS = Object.freeze(['amount', 'ratio'])

const DAY_MS = 86_400_000

function stringOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function idsOf(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id.length > 0))]
}

/** The join key on both sides of the announcement → execution link. */
export function programmeKey(symbol, programmeId) {
  return `${symbol}\u0000${programmeId}`
}

/**
 * @param {object} input
 * @param {object|null|undefined} [input.previous]  the carried programme state
 * @param {object[]} [input.announcements] `{ symbol, programmeId, announcedAmount, announcedKind, windowStartEpochMs, windowEndEpochMs, announcedAtEpochMs, rceptNo, evidenceIds }`
 * @param {object[]} [input.executions]    `{ symbol, programmeId, executedAmount?, retiredAmount?, observedAtEpochMs, rceptNo, evidenceIds }`
 * @param {object[]} [input.cancellations] `{ symbol, programmeId, cancelledAmount, observedAtEpochMs, rceptNo, evidenceIds }`
 * @param {string|number} input.asOf
 */
export function returnProgramme(input = {}) {
  const diagnostics = []
  const asOfInstant = instantOf(input.asOf)
  if (asOfInstant === null) {
    return {
      data: { programmes: [], nextState: null },
      diagnostics: [diagnostic('as_of_unreadable', 'blocked', 'Every judgement in this package is pinned to asOf and there is no default', 'asOf')],
    }
  }

  const programmes = new Map()
  const seenReceipts = new Map()

  /** Carry the previous state forward first, so a rerun counts no receipt twice. */
  for (const row of Array.isArray(input.previous?.programmes) ? input.previous.programmes : []) {
    const symbol = stringOf(row?.symbol)
    const programmeId = stringOf(row?.programmeId)
    if (symbol === null || programmeId === null) continue
    const key = programmeKey(symbol, programmeId)
    programmes.set(key, {
      symbol,
      programmeId,
      announcedAmount: finite(row?.announcedAmount) ? row.announcedAmount : null,
      announcedKind: ANNOUNCED_KINDS.includes(row?.announcedKind) ? row.announcedKind : null,
      announcedAtEpochMs: instantOf(row?.announcedAtEpochMs ?? null),
      windowStartEpochMs: instantOf(row?.windowStartEpochMs ?? null),
      windowEndEpochMs: instantOf(row?.windowEndEpochMs ?? null),
      executedAmount: finite(row?.executedAmount) ? row.executedAmount : 0,
      retiredAmount: finite(row?.retiredAmount) ? row.retiredAmount : 0,
      cancelledAmount: finite(row?.cancelledAmount) ? row.cancelledAmount : 0,
      executionReceipts: Array.isArray(row?.executionReceipts) ? row.executionReceipts.filter((no) => typeof no === 'string') : [],
      evidenceIds: idsOf(row?.evidenceIds),
      announcementRceptNo: stringOf(row?.announcementRceptNo),
      lastSeenAtEpochMs: instantOf(row?.lastSeenAtEpochMs ?? null),
    })
    seenReceipts.set(key, new Set(programmes.get(key).executionReceipts))
  }

  // ── the announcements ────────────────────────────────────────────────────
  for (const row of Array.isArray(input.announcements) ? input.announcements : []) {
    const symbol = stringOf(row?.symbol)
    const programmeId = stringOf(row?.programmeId)
    if (symbol === null || programmeId === null) {
      diagnostics.push(diagnostic('programme_key_missing', 'blocked', 'A programme is keyed by (symbol, programmeId) and this announcement has no such pair; without it no execution receipt can ever be joined to it', 'announcements[].programmeId'))
      continue
    }
    const key = programmeKey(symbol, programmeId)
    const where = `programmes[${symbol}/${programmeId}]`
    const announcedAt = instantOf(row?.announcedAtEpochMs ?? null)
    if (announcedAt !== null && announcedAt > asOfInstant) {
      diagnostics.push(
        diagnostic('programme_announced_after_as_of', 'blocked', 'This decision was disclosed after the instant being judged, so it does not exist for this run', `${where}.announcedAtEpochMs`, { announcedAtEpochMs: announcedAt, asOfEpochMs: asOfInstant }),
      )
      continue
    }
    const announcedKind = ANNOUNCED_KINDS.includes(row?.announcedKind) ? row.announcedKind : null
    if (announcedKind === null) {
      diagnostics.push(
        diagnostic('announced_kind_unstated', 'unevaluated', `A return promise is ${ANNOUNCED_KINDS.join(' or ')}: «35% of consolidated profit» falls with profit and «300 billion won» does not. Which one this issuer committed to is what the bear case turns on, and it is not stated here`, `${where}.announcedKind`),
      )
    }
    const existing = programmes.get(key)
    programmes.set(key, {
      symbol,
      programmeId,
      announcedAmount: finite(row?.announcedAmount) ? row.announcedAmount : (existing?.announcedAmount ?? null),
      announcedKind: announcedKind ?? (existing?.announcedKind ?? null),
      announcedAtEpochMs: announcedAt ?? (existing?.announcedAtEpochMs ?? null),
      windowStartEpochMs: instantOf(row?.windowStartEpochMs ?? null) ?? (existing?.windowStartEpochMs ?? null),
      windowEndEpochMs: instantOf(row?.windowEndEpochMs ?? null) ?? (existing?.windowEndEpochMs ?? null),
      executedAmount: existing?.executedAmount ?? 0,
      retiredAmount: existing?.retiredAmount ?? 0,
      cancelledAmount: existing?.cancelledAmount ?? 0,
      executionReceipts: existing?.executionReceipts ?? [],
      evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), ...idsOf(row?.evidenceIds)])],
      announcementRceptNo: stringOf(row?.rceptNo) ?? (existing?.announcementRceptNo ?? null),
      lastSeenAtEpochMs: asOfInstant,
    })
    if (!seenReceipts.has(key)) seenReceipts.set(key, new Set(programmes.get(key).executionReceipts))
  }

  // ── the executions, and the orphans ──────────────────────────────────────
  const orphans = []
  const addReceipt = (rows, kind) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      const symbol = stringOf(row?.symbol)
      const programmeId = stringOf(row?.programmeId)
      const rceptNo = stringOf(row?.rceptNo)
      if (symbol === null || programmeId === null) {
        diagnostics.push(diagnostic('programme_key_missing', 'blocked', `A ${kind} receipt is joined to its programme by (symbol, programmeId) and this one carries no such pair`, `${kind}s[].programmeId`))
        continue
      }
      const key = programmeKey(symbol, programmeId)
      const where = `programmes[${symbol}/${programmeId}]`
      const target = programmes.get(key)
      if (target === undefined) {
        /**
         * ⛔ **Not a new programme.** Inventing one around an execution receipt
         * fabricates both the announced amount and the window, and every pace computed
         * afterwards is against a schedule nobody published.
         */
        orphans.push({ symbol, programmeId, rceptNo, kind })
        diagnostics.push(
          diagnostic(
            'execution_without_announcement',
            'blocked',
            `A ${kind} receipt for ${symbol} names programme ${programmeId} and no 결정 공시 for it has been read. ⛔ No programme is created around it: the announced amount and the window would both be invented. Walk the DART cursor back past ${rceptNo ?? 'this receipt'} and read the decision disclosure first.`,
            `${where}.programmeId`,
            { symbol, programmeId, rceptNo, cursorWalkBackTo: rceptNo, receiptKind: kind },
          ),
        )
        continue
      }
      const observedAt = instantOf(row?.observedAtEpochMs ?? null)
      if (observedAt !== null && observedAt > asOfInstant) {
        diagnostics.push(diagnostic('programme_receipt_after_as_of', 'blocked', `This ${kind} receipt was filed after the instant being judged`, `${where}.observedAtEpochMs`, { observedAtEpochMs: observedAt, asOfEpochMs: asOfInstant }))
        continue
      }
      if (kind === 'cancellation' && (finite(row?.executedAmount) || finite(row?.retiredAmount))) {
        diagnostics.push(
          diagnostic(
            'cancellation_counted_as_execution',
            'blocked',
            'A withdrawal row is carrying an executed or retired amount. A company deciding **not** to buy is the opposite of execution, and folding the two makes an abandoned programme read as a completed one — the most flattering error available here.',
            `${where}.cancelledAmount`,
            { symbol, programmeId, rceptNo },
          ),
        )
        continue
      }
      /** ⚠️ Receipts are counted once. A rerun that hands back the same receipt adds nothing. */
      const seen = seenReceipts.get(key) ?? new Set()
      if (rceptNo !== null && seen.has(rceptNo)) continue
      if (rceptNo !== null) seen.add(rceptNo)
      seenReceipts.set(key, seen)

      const next = { ...target }
      if (kind === 'cancellation') {
        next.cancelledAmount += finite(row?.cancelledAmount) ? row.cancelledAmount : 0
      } else {
        next.executedAmount += finite(row?.executedAmount) ? row.executedAmount : 0
        next.retiredAmount += finite(row?.retiredAmount) ? row.retiredAmount : 0
      }
      next.executionReceipts = rceptNo === null ? next.executionReceipts : [...new Set([...next.executionReceipts, rceptNo])]
      next.evidenceIds = [...new Set([...next.evidenceIds, ...idsOf(row?.evidenceIds)])]
      next.lastSeenAtEpochMs = asOfInstant
      programmes.set(key, next)
    }
  }
  addReceipt(input.executions, 'execution')
  addReceipt(input.cancellations, 'cancellation')

  // ── the pace, per programme ──────────────────────────────────────────────
  const rows = []
  for (const programme of programmes.values()) {
    const where = `programmes[${programme.symbol}/${programme.programmeId}]`
    const windowStart = programme.windowStartEpochMs
    const windowEnd = programme.windowEndEpochMs
    const windowReadable = windowStart !== null && windowEnd !== null && windowEnd > windowStart
    if (!windowReadable) {
      diagnostics.push(
        diagnostic('programme_window_unreadable', 'unevaluated', 'The issuer declared a window and this run cannot read it, so there is no schedule to measure the pace against. ⚠️ A window this package chose would be this package judging the issuer against a deadline the issuer never set', `${where}.windowEndEpochMs`, {
          windowStartEpochMs: windowStart,
          windowEndEpochMs: windowEnd,
        }),
      )
    }
    const windowDays = windowReadable ? round((windowEnd - windowStart) / DAY_MS, 3) : null
    const elapsedDays = windowReadable ? round(Math.max(0, asOfInstant - windowStart) / DAY_MS, 3) : null
    const elapsedShare = windowReadable ? round(Math.min(1, Math.max(0, (asOfInstant - windowStart) / (windowEnd - windowStart)))) : null

    let executionRate = null
    if (programme.announcedKind === 'ratio') {
      diagnostics.push(
        diagnostic(
          'announced_ratio_not_an_amount',
          'unevaluated',
          `${programme.symbol} committed to a **ratio** of profit and not to an amount of money, so \`announcedAmount\` here is that ratio and no execution rate divides into it. What is measurable is whether the ratio was applied to the profit that was actually earned — a different test, and this run says so rather than producing a pace out of a percentage.`,
          `${where}.announcedKind`,
          { announcedKind: programme.announcedKind, announcedAmount: programme.announcedAmount },
        ),
      )
    } else if (finite(programme.announcedAmount) && programme.announcedAmount > 0) {
      executionRate = round(programme.executedAmount / programme.announcedAmount)
    }

    let status = 'unevaluated'
    let pace = null
    if (executionRate !== null && elapsedShare !== null) {
      if (elapsedShare < THRESHOLDS.executionObservableElapsed) {
        diagnostics.push(
          diagnostic(
            'execution_not_yet_observable',
            'unevaluated',
            `Only ${(elapsedShare * 100).toFixed(1)}% of ${programme.programmeId}'s own window has run, below the ${THRESHOLDS.executionObservableElapsed * 100}% at which Korean progress disclosure makes the pace a filed fact. Nothing is concluded from it and the next 결과보고서 is what this desk comes back for.`,
            `${where}.windowStartEpochMs`,
            { executionRate, elapsedShare, floor: THRESHOLDS.executionObservableElapsed },
          ),
        )
      } else {
        pace = elapsedShare > 0 ? round(executionRate / elapsedShare) : null
        status = pace !== null && pace < THRESHOLDS.executionPaceFloor ? 'behind' : 'on-pace'
        if (status === 'behind') {
          diagnostics.push(
            diagnostic(
              'programme_behind_pace',
              'warn',
              `${(executionRate * 100).toFixed(1)}% of ${programme.programmeId} is done with ${(elapsedShare * 100).toFixed(1)}% of its window gone — a pace of ${pace} against its own straight-line schedule, below ${THRESHOLDS.executionPaceFloor}. ⚠️ The refusal itself belongs to \`classifyCase\`, which reaches \`announced-not-executed\`; what is recorded here is the measurement it reads.`,
              `${where}.executedAmount`,
              { executionRate, elapsedShare, pace, floor: THRESHOLDS.executionPaceFloor },
            ),
          )
        }
      }
    }

    if (programme.executionReceipts.length === 0 && elapsedShare !== null && elapsedShare >= THRESHOLDS.executionObservableElapsed) {
      diagnostics.push(
        diagnostic(
          'announcement_without_execution_receipt',
          'warn',
          `${programme.programmeId} was announced and past ${(THRESHOLDS.executionObservableElapsed * 100).toFixed(0)}% of its own window there is no 취득 결과보고서 against it. ⚠️ Distinct from \`execution_without_announcement\`: that one says the sweep started too late, this one says the company has filed nothing. An announcement is the evidence for the announcement and for nothing else.`,
          `${where}.executedAmount`,
          { symbol: programme.symbol, programmeId: programme.programmeId, elapsedShare },
        ),
      )
    }

    if (programme.executedAmount > 0 && programme.retiredAmount === 0) {
      diagnostics.push(
        diagnostic(
          'bought_but_not_retired',
          'warn',
          'Shares were bought and none were retired. Treasury stock can be sold again, used in a merger or handed out as compensation, so the per-share figures move only until it comes back out. The thesis is weaker than the headline number and the record says so.',
          `${where}.retiredAmount`,
          { executedAmount: programme.executedAmount, retiredAmount: programme.retiredAmount },
        ),
      )
    }

    rows.push({
      symbol: programme.symbol,
      programmeId: programme.programmeId,
      announcedAmount: programme.announcedAmount,
      announcedKind: programme.announcedKind,
      announcedAtEpochMs: programme.announcedAtEpochMs,
      windowStartEpochMs: windowStart,
      windowEndEpochMs: windowEnd,
      /** ⛔ Three counters, never a sum. */
      executedAmount: programme.executedAmount,
      retiredAmount: programme.retiredAmount,
      cancelledAmount: programme.cancelledAmount,
      executionRate,
      elapsedShare,
      pace,
      status,
      retirementRate: programme.executedAmount > 0 ? round(programme.retiredAmount / programme.executedAmount) : null,
      evidenceIds: programme.evidenceIds,
      announcementRceptNo: programme.announcementRceptNo,
      executionReceipts: programme.executionReceipts,
      /**
       * Exactly the `programme` bag `classifyCase` reads, so the case label is produced
       * from this measurement and not from a second one written by hand.
       */
      classifyInput: {
        announcedAmount: programme.announcedKind === 'ratio' ? null : programme.announcedAmount,
        executedAmount: programme.executedAmount,
        windowDays,
        elapsedDays,
      },
    })
  }

  return {
    data: {
      programmes: rows,
      orphans,
      cursorWalkBackRequired: orphans.length > 0,
      cursorWalkBackTo: orphans.map((row) => row.rceptNo).filter((no) => typeof no === 'string').sort()[0] ?? null,
      /**
       * ⚠️ The document is still written when an orphan is refused. What
       * `execution_without_announcement` refuses is **the orphan row** — no programme is
       * created around it — and throwing away the programmes that *are* joined would
       * lose the state the next run resumes from.
       */
      nextState: {
        schemaVersion: PROGRAMME_SCHEMA_VERSION,
        updatedAtEpochMs: asOfInstant,
        programmes: rows.map((row) => ({
          symbol: row.symbol,
          programmeId: row.programmeId,
          announcedAmount: row.announcedAmount,
          announcedKind: row.announcedKind,
          announcedAtEpochMs: row.announcedAtEpochMs,
          windowStartEpochMs: row.windowStartEpochMs,
          windowEndEpochMs: row.windowEndEpochMs,
          executedAmount: row.executedAmount,
          retiredAmount: row.retiredAmount,
          cancelledAmount: row.cancelledAmount,
          executionReceipts: row.executionReceipts,
          announcementRceptNo: row.announcementRceptNo,
          evidenceIds: row.evidenceIds,
          lastSeenAtEpochMs: asOfInstant,
        })),
      },
    },
    diagnostics,
  }
}
