import { diagnostic } from './diagnostics.mjs'

/**
 * ── The second stage of discovery, which was never a stage (issue #169) ────
 *
 * `radarCandidates` takes `catalysts` and `events` as inputs, `upsideRadar`
 * reads both — `inflection` needs a catalyst window open inside 60 days,
 * `post-event-continuation` needs an event announced inside 30 — and **nothing
 * in this package produced either of them.** The whole of what the run loop
 * said about it was one sentence in `PROMPT.md` §3, *"`earningsCheckpoint`
 * fills the rolling event window these lanes read"*, which is a description of
 * a window and not a step that fills one; `earningsCheckpoint` schedules a
 * wake around an announcement it is handed and has never had a producer of its
 * own either.
 *
 * ⚠️ **So the two lenses that do not require a price fall are structurally
 * dead, and they report it as a judgement about the company.** Measured on
 * `run_73a3e6c41c204f468ee8be8d2923d898` (asOf 2026-09-07), on the first US
 * branch this book ever fed to the end — 83 of 84 names mapped to a CIK, 83 of
 * 83 `companyfacts` refreshed:
 *
 *   `inflection`              0 included · **1 × `no-catalyst-registered-within-60-days`**
 *   `post-event-continuation` 0 included · **83 × `no-event-in-the-last-30-days`**
 *
 * The single name that cleared every filing test was INTC, whose operating
 * income had flipped from −3,136M to +1,796M against the previous comparable
 * quarter (`signFlip: true`, `operatingIncomeYoy` 156.55). It was excluded for
 * having no catalyst — and no run had ever been asked to register one. That is
 * the `never-fed` ⇄ `fed-and-genuinely-empty` swap `radarCandidates` and
 * `radarFeedDiagnosis` exist to refuse, one axis over, and it had no reader.
 *
 * ── What this operation is and is not ──────────────────────────────────────
 *
 * It is the producer: research rows in, the two maps `radarCandidates` takes
 * out, plus the one revision the register is carried across runs in. ⛔ It
 * fetches nothing and it invents nothing — a catalyst window is something the
 * flow **read**, and every row must name the `evidenceIds` the reading was
 * filed under (`observation_file`, or an Aumos evidence row for a vendor
 * calendar). A window with no citation is refused rather than registered: the
 * whole value of the axis is that «a catalyst is registered» means somebody
 * can go and check what it was.
 *
 * ── Researched-and-absent is not unresearched, and that is the finding ─────
 *
 * A roster name with **no window at all** is a name nobody looked at. A roster
 * name with a window that closed last month, or opens in 90 days, is a name
 * that was looked at and genuinely has nothing inside the horizon. Both are
 * excluded by `upsideRadar` under the same sentence, so the count has to come
 * from here: `catalyst_window_unresearched` and `event_record_unresearched`
 * are `input-path` causes in `CAUSE_CODE_REGISTRY`, which is what stops
 * `mandateExecution` reading an unfed axis as *the methodology is working*.
 *
 * ── Why the state holds numbers where the map holds strings ────────────────
 *
 * ⚠️ **A catalyst window ends in the future by construction, and that was the
 * one shape `memory_read` refused.** The host walked a returned payload for any
 * **string** timestamp later than `asOf` and refused the whole read
 * (`post-as-of-timestamp`); since aumos#658 it folded the offending entry out
 * and named the key instead, which was better and still meant the register did
 * not arrive.
 *
 * ⚠️ **aumos#743 ended that by moving the record rather than relaxing the
 * rule.** The register is a file now, `files_read` hands the document back as
 * one opaque string, and the outgoing scan is anchored — a JSON body is not a
 * timestamp and its leaves are never walked. ⛔ The encoding stays regardless:
 * the meaning was always identical, every reader in this package reads numbers,
 * and re-encoding a stored record to celebrate a lifted restriction is a
 * migration with no benefit and a readable-history cost.
 *
 * `run/armed-reviews` hit this first and answered it with
 * `atEpochMs` — the meaning is identical and the key becomes readable — so the
 * revision this operation writes carries `windowStartEpochMs` /
 * `windowEndEpochMs` as **numbers**, and the `catalysts` map handed to
 * `radarCandidates` carries RFC 3339 **strings**, because that is what
 * `Date.parse` is given there. Either shape is read back.
 *
 * ⛔ **Events are not persisted, and that is the memory contract rather than an
 * omission.** `sue`, `day1ExcessPct` and `preAnnouncementClose` are numbers
 * copied off a vendor's answer, and `skills/memory-contract/SKILL.md` forbids
 * copied current filing/news data in as many words. They are re-read from
 * Alpaca corporate actions each run; what persists is the catalyst *calendar*,
 * which is a bounded index of labels, windows and evidence ids — the same
 * exception `coverage/research-index` already is.
 */

const MAX_ROWS = 200
const MAX_BYTES = 60_000
const MAX_EVENT_LABEL = 120
const MAX_ID = 128
const CATALYST_HORIZON_DAYS = 60
const EVENT_LOOKBACK_DAYS = 30
const DAY = 86_400_000

/** The register's memory key. Published so a caller does not have to spell it. */
export const CATALYST_MEMORY_KEY = 'research/catalyst-window'

/**
 * The three instants the revision carries, and it carries them as **numbers**:
 * a catalyst window ends after `asOf` by construction and `memory_read` refused
 * a payload holding a later **string** timestamp, so RFC 3339 here made the
 * record unreadable rather than wrong. ⚠️ The guard does not reach the file this
 * became (aumos#743) and the encoding is kept as canon — see the header.
 *
 * ⚠️ Published because the encoding is a contract with two readers outside this
 * file — the memory contract a run reads, and the verifier that proves every
 * carried row holds numbers. A second hand-written copy of this list is a list
 * that can disagree with the writer below.
 */
export const CATALYST_EPOCH_FIELDS = ['windowStartEpochMs', 'windowEndEpochMs', 'observedAtEpochMs']

const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * ⚠️ A number is read as epoch milliseconds and a string as RFC 3339, because
 * the revision written back holds the first and everything on the wire holds
 * the second. ⛔ A numeric string is **not** coerced: `"1788735600000"` is a
 * shape nobody writes on purpose and reading it as an instant would make the
 * two encodings indistinguishable.
 */
function instantOf(value) {
  if (finite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const compactString = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit

const evidenceIdsOf = (row) =>
  Array.isArray(row?.evidenceIds) && row.evidenceIds.length && row.evidenceIds.every((id) => compactString(id, MAX_ID))
    ? row.evidenceIds.slice(0, 8)
    : null

/**
 * A carried or freshly researched catalyst window, normalized to one internal
 * row. `null` is «this row is not registrable», and the caller names it.
 */
function catalystRow(row, asOf) {
  if (!compactString(row?.symbol, 32)) return null
  if (row?.market !== 'kr' && row?.market !== 'us') return null
  if (!compactString(row?.event, MAX_EVENT_LABEL)) return null
  const start = instantOf(row.windowStartEpochMs ?? row.windowStart)
  const end = instantOf(row.windowEndEpochMs ?? row.windowEnd)
  if (start === null || end === null || start > end) return null
  const observedAt = instantOf(row.observedAtEpochMs ?? row.observedAt)
  if (observedAt === null || observedAt > asOf) return null
  const evidenceIds = evidenceIdsOf(row)
  if (!evidenceIds) return null
  return {
    symbol: row.symbol,
    market: row.market,
    event: row.event,
    windowStartEpochMs: start,
    windowEndEpochMs: end,
    observedAtEpochMs: observedAt,
    evidenceIds,
    ...(compactString(row.publisher, 120) ? { publisher: row.publisher } : {}),
  }
}

function eventRow(row, asOf) {
  if (!compactString(row?.symbol, 32)) return null
  if (row?.market !== 'kr' && row?.market !== 'us') return null
  const announcedAt = instantOf(row.announcedAt)
  if (announcedAt === null || announcedAt > asOf) return null
  for (const field of ['sue', 'day1ExcessPct', 'preAnnouncementClose', 'guidanceSurprise']) {
    if (row[field] !== undefined && row[field] !== null && !finite(row[field])) return null
  }
  const evidenceIds = evidenceIdsOf(row)
  if (!evidenceIds) return null
  return {
    symbol: row.symbol,
    market: row.market,
    announcedAt: new Date(announcedAt).toISOString(),
    ...(finite(row.sue) ? { sue: row.sue } : {}),
    ...(finite(row.day1ExcessPct) ? { day1ExcessPct: row.day1ExcessPct } : {}),
    ...(finite(row.preAnnouncementClose) ? { preAnnouncementClose: row.preAnnouncementClose } : {}),
    ...(finite(row.guidanceSurprise) ? { guidanceSurprise: row.guidanceSurprise } : {}),
    evidenceIds,
  }
}

/**
 * `previous` is what was read from `research/catalyst-window`, `catalysts` and
 * `events` are what this run researched, `roster` is the denominator the
 * coverage counts are taken against — the same `symbols` argument
 * `radarCandidates` takes, so the two operations cannot disagree about who was
 * in the sweep.
 */
export function catalystRegister({ market, previous = null, catalysts = [], events = [], roster = [], asOf } = {}) {
  const diagnostics = []
  if (market !== 'kr' && market !== 'us') {
    return { data: null, diagnostics: [diagnostic('catalyst_market_invalid', 'blocked', 'Expected kr or us — the sleeve, the same argument radarCandidates takes. ⚠️ The MIC (XKRX/XNAS/XNYS) is read too and converted at the one input boundary (#212 ⑥), so a value refused here is neither spelling', 'market', { received: market ?? null })] }
  }
  const at = Date.parse(asOf)
  if (!Number.isFinite(at)) return { data: null, diagnostics: [diagnostic('catalyst_as_of_invalid', 'blocked', 'A valid asOf instant is required', 'asOf')] }

  if (previous !== null && previous !== undefined && (previous.schemaVersion !== 1 || !Array.isArray(previous.rows) || !Number.isFinite(Date.parse(previous.updatedAsOf)) || Date.parse(previous.updatedAsOf) > at)) {
    return { data: null, diagnostics: [diagnostic('catalyst_state_invalid', 'blocked', 'Read a valid point-in-time catalyst register before updating it — schemaVersion 1, a rows array, and an updatedAsOf no later than asOf', 'previous')] }
  }

  /**
   * ⚠️ Carried rows keep **both markets**. This operation runs per sleeve and
   * the register is one instance-private key: dropping the other sleeve's rows
   * because this call names `us` would erase the KR calendar every US run, and
   * a carried collection is never smaller on the way out.
   */
  const carriedRows = []
  let carriedRefused = 0
  for (const row of previous?.rows ?? []) {
    const normalized = catalystRow(row, at)
    if (normalized) carriedRows.push(normalized)
    else carriedRefused += 1
  }
  if (carriedRefused) {
    diagnostics.push(diagnostic('catalyst_state_row_unreadable', 'unevaluated', 'Rows carried in the register could not be read and were not registered; they are reported rather than dropped silently, because a window that vanishes reads as a name nobody researched', 'previous', { refused: carriedRefused, of: (previous?.rows ?? []).length }))
  }

  const researched = []
  let invalidCatalysts = 0
  for (const row of catalysts) {
    const normalized = catalystRow(row, at)
    if (normalized) researched.push(normalized)
    else invalidCatalysts += 1
  }
  if (invalidCatalysts) {
    diagnostics.push(diagnostic('catalyst_observation_invalid', 'blocked', 'A catalyst window needs symbol, market, an event label, a window whose start does not follow its end, an observedAt no later than asOf, and at least one evidenceId — a window nobody can go and check is not a registered catalyst', 'catalysts', { refused: invalidCatalysts, of: catalysts.length }))
  }

  const eventRows = []
  let invalidEvents = 0
  for (const row of events) {
    const normalized = eventRow(row, at)
    if (normalized) eventRows.push(normalized)
    else invalidEvents += 1
  }
  if (invalidEvents) {
    diagnostics.push(diagnostic('catalyst_observation_invalid', 'blocked', 'An event record needs symbol, market, an announcedAt no later than asOf, finite numbers where it carries them, and at least one evidenceId', 'events', { refused: invalidEvents, of: events.length }))
  }

  /**
   * The freshest observation of a `(market, symbol, event)` wins — a window
   * re-read this run replaces the one carried, and two different catalysts on
   * one name are two rows.
   */
  const registry = new Map()
  for (const row of [...carriedRows, ...researched]) {
    const key = `${row.market}:${row.symbol}:${row.event}`
    const held = registry.get(key)
    if (held && held.observedAtEpochMs > row.observedAtEpochMs) continue
    registry.set(key, row)
  }

  /**
   * ⚠️ A window that has closed leaves the register and is reported. It is not
   * an error — it is the fact `exitCheck` reads as *«a catalyst window closed
   * without the catalyst being scored»* — and keeping it would grow a key that
   * is bounded on purpose.
   */
  const expired = []
  const live = []
  for (const row of registry.values()) {
    if (row.windowEndEpochMs < at) expired.push({ symbol: row.symbol, market: row.market, event: row.event, windowEnd: new Date(row.windowEndEpochMs).toISOString() })
    else live.push(row)
  }
  if (expired.length) {
    diagnostics.push(diagnostic('catalyst_window_closed', 'info', 'A registered catalyst window closed at or before asOf and leaves the register; score whether the catalyst happened before dropping the name from research', 'previous', { expired: expired.length }))
  }

  if (live.length > MAX_ROWS) {
    diagnostics.push(diagnostic('catalyst_state_capacity', 'blocked', `The catalyst register exceeds ${MAX_ROWS} rows; review what the branch is still watching rather than silently evicting a window`, 'catalysts', { rows: live.length }))
  }
  if (new TextEncoder().encode(JSON.stringify(live)).length > MAX_BYTES) {
    diagnostics.push(diagnostic('catalyst_state_capacity', 'blocked', 'The catalyst register exceeds its 60 KB payload budget; retain the previous revision and review its scope', 'catalysts', { rows: live.length }))
  }

  /* ── the two maps radarCandidates takes, for this sleeve only ──────────── */
  const catalystMap = {}
  for (const row of live) {
    if (row.market !== market) continue
    ;(catalystMap[row.symbol] ??= []).push({
      event: row.event,
      windowStart: new Date(row.windowStartEpochMs).toISOString(),
      windowEnd: new Date(row.windowEndEpochMs).toISOString(),
      observedAt: new Date(row.observedAtEpochMs).toISOString(),
      evidenceIds: row.evidenceIds,
      ...(row.publisher ? { publisher: row.publisher } : {}),
    })
  }
  const eventMap = {}
  for (const row of eventRows) {
    if (row.market !== market) continue
    const { market: _market, symbol, ...rest } = row
    ;(eventMap[symbol] ??= []).push(rest)
  }
  for (const rows of Object.values(eventMap)) rows.sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt))

  /* ── coverage: researched-and-absent told from unresearched ────────────── */
  const rosterSymbols = [...new Set(roster.map((row) => (typeof row === 'string' ? row : row?.symbol)).filter((symbol) => compactString(symbol, 32)))]
  const registeredFor = new Set(live.filter((row) => row.market === market).map((row) => row.symbol))
  const horizonEnd = at + CATALYST_HORIZON_DAYS * DAY
  const inHorizon = new Set(
    live.filter((row) => row.market === market && row.windowEndEpochMs >= at && row.windowStartEpochMs <= horizonEnd).map((row) => row.symbol),
  )
  const observedFor = new Set(eventRows.filter((row) => row.market === market).map((row) => row.symbol))
  const inLookback = new Set(
    eventRows
      .filter((row) => row.market === market && at - Date.parse(row.announcedAt) >= 0 && at - Date.parse(row.announcedAt) <= EVENT_LOOKBACK_DAYS * DAY)
      .map((row) => row.symbol),
  )
  const unresearchedCatalysts = rosterSymbols.filter((symbol) => !registeredFor.has(symbol))
  const unresearchedEvents = rosterSymbols.filter((symbol) => !observedFor.has(symbol))

  if (rosterSymbols.length && unresearchedCatalysts.length) {
    diagnostics.push(diagnostic(
      'catalyst_window_unresearched',
      'unevaluated',
      `${unresearchedCatalysts.length} of ${rosterSymbols.length} roster names carry no catalyst window at all, so upsideRadar's inflection lane will exclude every one of them for no-catalyst-registered-within-60-days — which reads as a finding about the company and is a stage that lost an input`,
      'roster',
      { of: rosterSymbols.length, unresearched: unresearchedCatalysts.length, symbols: unresearchedCatalysts.slice(0, 20) },
    ))
  }
  if (rosterSymbols.length && unresearchedEvents.length) {
    diagnostics.push(diagnostic(
      'event_record_unresearched',
      'unevaluated',
      `${unresearchedEvents.length} of ${rosterSymbols.length} roster names carry no point-in-time event record, so the post-event-continuation lane is unfed rather than empty and the expectation axis stays unknown for every one of them`,
      'roster',
      { of: rosterSymbols.length, unresearched: unresearchedEvents.length, symbols: unresearchedEvents.slice(0, 20) },
    ))
  }

  const blocked = diagnostics.some((row) => row.severity === 'blocked')
  return {
    data: {
      market,
      catalysts: catalystMap,
      events: eventMap,
      expired,
      coverage: {
        rosterCount: rosterSymbols.length,
        /** Names with a window on file — the denominator that separates *nobody looked* from *nothing is scheduled*. */
        researched: registeredFor.size,
        /** Names whose window actually overlaps the 60 days `upsideRadar` reads. */
        withCatalystInHorizon: inHorizon.size,
        unresearchedCatalysts: unresearchedCatalysts.length,
        eventsResearched: observedFor.size,
        withEventInLookback: inLookback.size,
        unresearchedEvents: unresearchedEvents.length,
      },
      horizonDays: CATALYST_HORIZON_DAYS,
      eventLookbackDays: EVENT_LOOKBACK_DAYS,
      memoryKey: CATALYST_MEMORY_KEY,
      /**
       * ⛔ `null` when anything blocked, so a refused calculation never offers a
       * replacement for durable memory — and the events are absent by contract,
       * not by omission.
       */
      nextState: blocked ? null : { schemaVersion: 1, updatedAsOf: asOf, rows: live },
      eventsPersisted: false,
      eventPersistenceReason: 'sue, day1ExcessPct and preAnnouncementClose are numbers copied off a vendor answer, and the memory contract forbids copied current filing/news data; re-read them from the corporate-actions route each run',
      asOf,
    },
    diagnostics,
  }
}
