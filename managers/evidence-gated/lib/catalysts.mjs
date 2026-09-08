import { diagnostic, round } from './diagnostics.mjs'

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
 * The one label an estimate is allowed to carry, and it is required on the row
 * rather than inferred from which argument it arrived on.
 *
 * ⚠️ Published because three readers spell it — the producer that stamps it,
 * the register that refuses a row without it, and `upsideRadar`, which ranks a
 * confirmed window above an estimated one. A fourth hand-written copy is a copy
 * that can disagree with the writer.
 */
export const CATALYST_DATE_ESTIMATED = 'estimated_from_filing_cadence'
export const CATALYST_DATE_OBSERVED = 'observed'
/** The event label every derived window carries. One label, so the register's `(market, symbol, event)` key folds a re-derivation onto its predecessor instead of growing a row a run. */
export const CADENCE_EVENT_LABEL = 'expected-regular-disclosure'

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
 * ── The cadence basis, which is what an estimated row cites instead of a
 *    document that does not exist yet (issue #228) ──────────────────────────
 *
 * An estimate is registrable only while it says out loud that it is one and
 * carries the arithmetic it came from: how many days this book's own cache says
 * a filer takes to publish after a period ends, over how many filings, and how
 * far the window opens ahead of that median. ⛔ A row claiming
 * `estimated_from_filing_cadence` with no basis is refused — it is the same
 * uncited claim `evidenceIds` exists to refuse, one field over.
 */
const cadenceBasisOf = (row) => {
  const basis = row?.cadenceBasis
  if (!basis || typeof basis !== 'object' || Array.isArray(basis)) return null
  if (!finite(basis.medianLagDays) || !finite(basis.basisFilings) || basis.basisFilings <= 0) return null
  return {
    medianLagDays: basis.medianLagDays,
    basisFilings: basis.basisFilings,
    ...(finite(basis.leadDays) ? { leadDays: basis.leadDays } : {}),
    ...(finite(basis.basisSymbols) ? { basisSymbols: basis.basisSymbols } : {}),
    ...(finite(basis.periodGapDays) ? { periodGapDays: basis.periodGapDays } : {}),
    ...(compactString(basis.nextPeriodEnd, 40) ? { nextPeriodEnd: basis.nextPeriodEnd } : {}),
    ...(compactString(basis.measuredFrom, 60) ? { measuredFrom: basis.measuredFrom } : {}),
  }
}

/**
 * A carried, freshly researched or freshly derived catalyst window, normalized
 * to one internal row. `null` is «this row is not registrable», and the caller
 * names it.
 *
 * ⚠️ `kind` is the **argument the row arrived on**, and it is checked against
 * what the row says about itself rather than trusted: an estimate on the
 * observed argument, and an estimate that does not carry `dateSource`, are the
 * same defect from two sides and both are refused. ⛔ The discipline for an
 * observed row is not weakened by one character — `evidenceIds` is still
 * required, and what an estimate cites is the past filings the cadence was
 * measured over, so «somebody can go and check it» survives with the thing
 * checked moved from a future document to the basis.
 */
function catalystRow(row, asOf, kind = 'observed') {
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
  const dateSource = row.dateSource ?? (kind === 'estimated' ? null : CATALYST_DATE_OBSERVED)
  if (dateSource !== CATALYST_DATE_OBSERVED && dateSource !== CATALYST_DATE_ESTIMATED) return null
  const estimated = dateSource === CATALYST_DATE_ESTIMATED
  if (estimated !== (kind === 'estimated')) return null
  const cadenceBasis = estimated ? cadenceBasisOf(row) : null
  if (estimated && !cadenceBasis) return null
  if (!estimated && row.cadenceBasis !== undefined) return null
  return {
    symbol: row.symbol,
    market: row.market,
    event: row.event,
    windowStartEpochMs: start,
    windowEndEpochMs: end,
    observedAtEpochMs: observedAt,
    dateSource,
    evidenceIds,
    ...(cadenceBasis ? { cadenceBasis } : {}),
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
export function catalystRegister({ market, previous = null, catalysts = [], estimated = [], events = [], roster = [], asOf } = {}) {
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
    /** ⚠️ A carried row states its own kind; the argument it once arrived on is not in the record and is not guessed. A row written before #228 carries no `dateSource` and reads as observed, which is what it was. */
    const normalized = catalystRow(row, at, row?.dateSource === CATALYST_DATE_ESTIMATED ? 'estimated' : 'observed')
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

  /**
   * ── The estimated arm (issue #228) ──────────────────────────────────────
   *
   * `catalystCadence` derives an expected disclosure window from the filings
   * already in this book's cache, and this is the argument those rows arrive
   * on. ⛔ **Two arguments and not one**: an estimate and a reading are
   * different claims, and letting them share an array means the register can
   * only tell them apart by trusting a field the caller may have forgotten to
   * write — which is precisely the confusion `catalyst_estimate_unmarked`
   * refuses. The observed arm above did not move by one character.
   */
  const derived = []
  let invalidEstimates = 0
  let unmarkedEstimates = 0
  for (const row of estimated) {
    const normalized = catalystRow(row, at, 'estimated')
    if (normalized) derived.push(normalized)
    else if (row?.dateSource !== CATALYST_DATE_ESTIMATED || !cadenceBasisOf(row)) unmarkedEstimates += 1
    else invalidEstimates += 1
  }
  /** ⚠️ Also the other direction: an estimate handed to the observed argument is the same defect, and reading it as a confirmed window is the failure this whole split exists to prevent. */
  const marked = catalysts.filter((row) => row?.dateSource === CATALYST_DATE_ESTIMATED || row?.cadenceBasis !== undefined).length
  if (unmarkedEstimates || marked) {
    diagnostics.push(diagnostic(
      'catalyst_estimate_unmarked',
      'blocked',
      `An estimated window must arrive on \`estimated\` carrying \`dateSource: "${CATALYST_DATE_ESTIMATED}"\` and the \`cadenceBasis\` it was derived from, and an observed window must carry neither — an estimate that does not say it is one is registered as a confirmed date, which is the one reading this axis must never produce`,
      unmarkedEstimates ? 'estimated' : 'catalysts',
      { unmarked: unmarkedEstimates, estimatesOnObservedInput: marked, of: estimated.length + catalysts.length },
    ))
  }
  if (invalidEstimates) {
    diagnostics.push(diagnostic('catalyst_observation_invalid', 'blocked', 'A derived catalyst window needs the same symbol, market, event label, window, observedAt and evidenceIds every registered window needs — what an estimate cites is the past filings its cadence was measured over', 'estimated', { refused: invalidEstimates, of: estimated.length }))
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
  for (const row of [...carriedRows, ...researched, ...derived]) {
    const key = `${row.market}:${row.symbol}:${row.event}`
    const held = registry.get(key)
    /**
     * ⛔ **A confirmed window is never replaced by an estimate under the same
     * key, however fresh the estimate is.** Recency is the right tie-break
     * between two readings of the same thing; between a date somebody read and
     * a date this package computed it would let every run overwrite the answer
     * with its own guess. The reverse is ordinary: a reading replaces the
     * estimate that stood in for it.
     */
    if (held && held.dateSource === CATALYST_DATE_OBSERVED && row.dateSource === CATALYST_DATE_ESTIMATED) continue
    if (held && held.dateSource === row.dateSource && held.observedAtEpochMs > row.observedAtEpochMs) continue
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
      /** ⚠️ It rides on every row, observed ones included. A field only estimates carry is a field whose **absence** has to be interpreted, and `upsideRadar` reads this to rank a confirmed catalyst above a derived one. */
      dateSource: row.dateSource,
      evidenceIds: row.evidenceIds,
      ...(row.cadenceBasis ? { cadenceBasis: row.cadenceBasis } : {}),
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
  /**
   * ⛔ **A derived window does not make a name researched, and this line is
   * where that is decided** (#228). `catalyst_window_unresearched` counts the
   * names nobody looked at; if an estimate cleared that count, filling the axis
   * from the cache would silently retire the finding that says the calendar was
   * never researched — the estimate would have bought the lane its input and
   * paid for it with the diagnostic that says how the input was got.
   */
  const registeredFor = new Set(live.filter((row) => row.market === market && row.dateSource === CATALYST_DATE_OBSERVED).map((row) => row.symbol))
  const horizonEnd = at + CATALYST_HORIZON_DAYS * DAY
  const overlapping = live.filter((row) => row.market === market && row.windowEndEpochMs >= at && row.windowStartEpochMs <= horizonEnd)
  const inHorizon = new Set(overlapping.map((row) => row.symbol))
  /** ⚠️ Counted separately because they are different claims and the coverage line is what a later reading divides by: a horizon full of derived windows is not a researched calendar. */
  const confirmedInHorizon = new Set(overlapping.filter((row) => row.dateSource === CATALYST_DATE_OBSERVED).map((row) => row.symbol))
  const estimatedInHorizon = new Set(overlapping.filter((row) => row.dateSource === CATALYST_DATE_ESTIMATED).map((row) => row.symbol))
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
        /** Names with a **read** window on file — the denominator that separates *nobody looked* from *nothing is scheduled*. ⛔ A derived window is not counted here; it is counted beside it. */
        researched: registeredFor.size,
        derived: new Set(live.filter((row) => row.market === market && row.dateSource === CATALYST_DATE_ESTIMATED).map((row) => row.symbol)).size,
        /** Names whose window actually overlaps the 60 days `upsideRadar` reads. */
        withCatalystInHorizon: inHorizon.size,
        withConfirmedCatalystInHorizon: confirmedInHorizon.size,
        withEstimatedCatalystInHorizon: estimatedInHorizon.size,
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

/**
 * ── The stage that fills the axis, because nothing filled it (issue #228) ──
 *
 * #169 built the producer and left the input to a person: every row of
 * `catalystRegister` requires `evidenceIds`, and the only way to satisfy that
 * was to research a window by hand for every roster name. So the axis stayed
 * empty. Measured on `run_c7ad46eea03840bf84ae7a8822ed02c3` (asOf
 * 2026-09-08), the first branch to run the producer end to end:
 * `radarFeedDiagnosis` `never-fed`, `inflection` 0 of 83,
 * `post-event-continuation` 0 of 83 with all 83 excluded for
 * `no-event-in-the-last-30-days`. The lane most about *information processing*
 * was starved by a manual step, which is the same sentence the ported-from
 * methodology's `bin/earnings-schedule` wrote about itself on 2026-07-29 — and
 * that harness answered it by deriving the next expected disclosure date from
 * the cadence already on disk and registering a rolling near-term window.
 * `inflection` went from 2 to 12.
 *
 * ── ⛔ The precedent is the mechanism, not the numbers ─────────────────────
 *
 * That harness measured **KR 45 days over 268 filings and US 30 over 312**, and
 * those two numbers are exactly what this operation must not carry. A constant
 * lifted out of another book's cache is an assertion about this one; what
 * transfers is the *method*, so the lag is measured here, at run time, over the
 * documents `source_cache_read` already handed this branch, and reported with
 * its own count beside it. ⛔ Below `MIN_BASIS_FILINGS` the operation refuses to
 * estimate rather than falling back on the precedent — a median over three
 * filings is a number with a confidence interval nobody stated.
 *
 * ── Primary disclosure runs ahead of the regular report ────────────────────
 *
 * The original recorded this and it is the reason a raw filing-cadence estimate
 * is *systematically late*: a Korean filer publishes 잠정실적 and an American one
 * an earnings release days-to-weeks before the report whose lag this median
 * measures. ⚠️ **The correction here is a window, not a second constant.** The
 * derived window **opens** at the earliest lag this book has actually seen
 * (`LEAD_QUANTILE` of the same distribution) and **closes** at the latest
 * (`TAIL_QUANTILE`), so the point estimate sits inside it and the systematic
 * lateness is answered by dispersion the cache measured rather than by a lead
 * this package would have to assert. `leadDays` — the distance from the opening
 * to the median — is recorded on every row, so a reader can see how far ahead
 * the window was opened and on what.
 *
 * ⛔ **It produces no event record, and that is not an omission.**
 * `post-event-continuation` reads `sue`, `day1ExcessPct` and
 * `preAnnouncementClose` — reported figures about an announcement that has
 * happened. A cadence can say when a company will probably speak; it cannot say
 * what it said. Deriving an `actual` from a schedule is the one move that would
 * turn this stage into a fabricator, so that lane stays fed by the
 * corporate-actions route and stays honestly empty until it is. The original
 * separated the two commands for the same reason.
 */

/** A filing whose lag exceeds this is not a regular-report cadence observation; it is the ceiling `upsideRadar` already applies to a filing's own lag. */
const MAX_FILING_LAG_DAYS = 120
/** Below this many `(period end → published)` pairs the sleeve does not have a cadence, and this operation says so instead of producing one. */
const MIN_BASIS_FILINGS = 8
/** A symbol needs two period ends before its own reporting period has a length. */
const MIN_SYMBOL_PERIODS = 2
const MIN_PERIOD_GAP_DAYS = 45
const MAX_PERIOD_GAP_DAYS = 200
/** How far a projection may be rolled forward before the cache is simply too far behind to project from. */
const MAX_PERIOD_ROLL = 2
const LEAD_QUANTILE = 0.1
const TAIL_QUANTILE = 0.9

/** The `p`-quantile of a sorted numeric sample, by nearest rank. ⛔ No interpolation: the value returned is a lag this book actually observed. */
function quantile(sorted, p) {
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))
  return sorted[index]
}

const median = (sorted) => quantile(sorted, 0.5)

const dayOf = (value) => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The evidence ids a cached document was filed under, wherever the host put
 * them. ⚠️ **The `CachedDocument` shape this package has measured carries
 * none** — `{ publishedAt, version, normalized }` and nothing else — so the
 * flow joins them on from `evidence_search` and passes them as `evidence`,
 * keyed by `documentKey`. `HOST-FOLLOWUPS.md` records the debt; ⛔ a document
 * this operation cannot cite produces no row, because the discipline that
 * refuses an uncited window is not relaxed for a derived one.
 */
function documentEvidence(document, evidence) {
  const direct = document?.evidenceIds ?? (compactString(document?.evidenceId, MAX_ID) ? [document.evidenceId] : null)
  const joined = document?.documentKey ? evidence?.[document.documentKey] : undefined
  const rows = direct ?? (Array.isArray(joined) ? joined : compactString(joined, MAX_ID) ? [joined] : null)
  return Array.isArray(rows) && rows.length && rows.every((id) => compactString(id, MAX_ID)) ? rows.slice(0, 8) : null
}

/**
 * Cached filings in, derived catalyst windows out — the `estimated` argument
 * `catalystRegister` takes.
 *
 * `documents` is the same `{ <symbol>: CachedDocument[] }` map `radarCandidates`
 * is given, so the two operations cannot disagree about what this branch read.
 */
export function catalystCadence({ market, documents = {}, evidence = {}, roster = [], horizonDays = CATALYST_HORIZON_DAYS, asOf } = {}) {
  const diagnostics = []
  if (market !== 'kr' && market !== 'us') {
    return { data: null, diagnostics: [diagnostic('cadence_market_invalid', 'blocked', 'Expected kr or us — the sleeve, the same argument radarCandidates and catalystRegister take', 'market', { received: market ?? null })] }
  }
  const at = Date.parse(asOf)
  if (!Number.isFinite(at)) return { data: null, diagnostics: [diagnostic('cadence_as_of_invalid', 'blocked', 'A valid asOf instant is required', 'asOf')] }

  /* ── ⑴ the pairs, per symbol, point-in-time ───────────────────────────── */
  const bySymbol = new Map()
  const lags = []
  let uncited = 0
  for (const [symbol, rows] of Object.entries(documents)) {
    if (!compactString(symbol, 32) || !Array.isArray(rows)) continue
    const observations = []
    for (const document of rows) {
      const periodEnd = dayOf(document?.normalized?.period?.end)
      const publishedAt = dayOf(document?.publishedAt ?? document?.capturedAt)
      if (periodEnd === null || publishedAt === null || publishedAt > at) continue
      const lagDays = (publishedAt - periodEnd) / DAY
      if (!(lagDays > 0) || lagDays > MAX_FILING_LAG_DAYS) continue
      const evidenceIds = documentEvidence(document, evidence)
      if (!evidenceIds) {
        uncited += 1
        continue
      }
      observations.push({ periodEnd, publishedAt, lagDays, evidenceIds })
    }
    if (!observations.length) continue
    observations.sort((a, b) => a.periodEnd - b.periodEnd)
    bySymbol.set(symbol, observations)
    for (const row of observations) lags.push(row.lagDays)
  }
  if (uncited) {
    diagnostics.push(diagnostic('cadence_basis_uncited', 'unevaluated', 'Cached filings carried no evidence id, so the cadence they establish cannot be cited and no window is derived from them; join the ids from evidence_search onto `evidence` keyed by documentKey — a derived window is refused uncited for the same reason a read one is', 'documents', { uncited }))
  }

  /* ── ⑵ the lag, measured here rather than inherited ───────────────────── */
  const sorted = [...lags].sort((a, b) => a - b)
  const basisFilings = sorted.length
  const basisSymbols = bySymbol.size
  const cadence = basisFilings >= MIN_BASIS_FILINGS
    ? {
        medianLagDays: round(median(sorted), 2),
        leadQuantileLagDays: round(quantile(sorted, LEAD_QUANTILE), 2),
        tailQuantileLagDays: round(quantile(sorted, TAIL_QUANTILE), 2),
        basisFilings,
        basisSymbols,
        measuredFrom: 'host-source-cache',
      }
    : null
  if (!cadence) {
    diagnostics.push(diagnostic(
      'cadence_basis_insufficient',
      'unevaluated',
      `The cache holds ${basisFilings} usable period-end→published pairs for this sleeve and ${MIN_BASIS_FILINGS} is the floor, so no disclosure date is estimated. ⛔ The ported-from harness's measured medians (KR 45 days over 268 filings, US 30 over 312) are the precedent for the method and are deliberately not used as a fallback: a constant from another book's cache is an assertion about this one`,
      'documents',
      { basisFilings, basisSymbols, floor: MIN_BASIS_FILINGS },
    ))
    return {
      data: { market, estimated: [], cadence: null, coverage: { rosterCount: rosterOf(roster).length, derived: 0, basisSymbols, uncited }, horizonDays, eventsProduced: false, eventProductionReason: EVENT_PRODUCTION_REASON, asOf },
      diagnostics,
    }
  }
  const leadDays = round(cadence.medianLagDays - cadence.leadQuantileLagDays, 2)

  /* ── ⑶ the projection, per symbol ─────────────────────────────────────── */
  const estimated = []
  let tooFewPeriods = 0
  let stale = 0
  let outsideHorizon = 0
  const horizonEnd = at + horizonDays * DAY
  for (const [symbol, observations] of bySymbol) {
    const ends = [...new Set(observations.map((row) => row.periodEnd))].sort((a, b) => a - b)
    if (ends.length < MIN_SYMBOL_PERIODS) {
      tooFewPeriods += 1
      continue
    }
    const gaps = ends.slice(1).map((end, index) => (end - ends[index]) / DAY).filter((gap) => gap >= MIN_PERIOD_GAP_DAYS && gap <= MAX_PERIOD_GAP_DAYS)
    if (!gaps.length) {
      tooFewPeriods += 1
      continue
    }
    const periodGapDays = round(median([...gaps].sort((a, b) => a - b)), 2)
    /**
     * ⚠️ Rolled forward while the whole window is already behind `asOf`, and
     * **bounded**: a cache two periods stale cannot say when the next
     * disclosure is, and an unbounded roll would answer confidently from a
     * filing a year old.
     */
    let rolls = 0
    let nextPeriodEnd = ends.at(-1) + periodGapDays * DAY
    let windowStart = nextPeriodEnd + cadence.leadQuantileLagDays * DAY
    let windowEnd = nextPeriodEnd + cadence.tailQuantileLagDays * DAY
    while (windowEnd < at && rolls < MAX_PERIOD_ROLL) {
      rolls += 1
      nextPeriodEnd += periodGapDays * DAY
      windowStart = nextPeriodEnd + cadence.leadQuantileLagDays * DAY
      windowEnd = nextPeriodEnd + cadence.tailQuantileLagDays * DAY
    }
    if (windowEnd < at) {
      stale += 1
      continue
    }
    if (windowStart > horizonEnd) {
      outsideHorizon += 1
      continue
    }
    estimated.push({
      symbol,
      market,
      event: CADENCE_EVENT_LABEL,
      windowStart: new Date(Math.round(windowStart)).toISOString(),
      windowEnd: new Date(Math.round(windowEnd)).toISOString(),
      observedAt: asOf,
      dateSource: CATALYST_DATE_ESTIMATED,
      cadenceBasis: {
        medianLagDays: cadence.medianLagDays,
        leadDays,
        basisFilings,
        basisSymbols,
        periodGapDays,
        nextPeriodEnd: new Date(Math.round(nextPeriodEnd)).toISOString().slice(0, 10),
        measuredFrom: cadence.measuredFrom,
      },
      /** ⚠️ The past filings the estimate was derived from, so «somebody can go and check it» holds — what is checked is the cadence basis, and it exists. */
      evidenceIds: [...new Set(observations.flatMap((row) => row.evidenceIds))].slice(0, 8),
    })
  }
  if (tooFewPeriods) {
    diagnostics.push(diagnostic('cadence_symbol_period_unknown', 'unevaluated', `${tooFewPeriods} filers hold fewer than ${MIN_SYMBOL_PERIODS} datable period ends a regular reporting gap can be read from, so nothing is projected for them; they are reported rather than dropped, because a name with no estimate is a name the inflection lane will still exclude`, 'documents', { symbols: tooFewPeriods }))
  }
  if (stale) {
    diagnostics.push(diagnostic('cadence_basis_stale', 'unevaluated', `${stale} filers' newest cached filing is more than ${MAX_PERIOD_ROLL} reporting periods behind, so the projection is refused rather than rolled forward until it lands somewhere plausible; refresh the cache for them`, 'documents', { symbols: stale, maxRoll: MAX_PERIOD_ROLL }))
  }

  const rosterSymbols = rosterOf(roster)
  return {
    data: {
      market,
      /** The rows `catalystRegister` takes as `estimated`. ⛔ Never as `catalysts`: they are not readings. */
      estimated,
      cadence: {
        ...cadence,
        leadDays,
        leadQuantile: LEAD_QUANTILE,
        tailQuantile: TAIL_QUANTILE,
        /**
         * ⛔ **And the residual is named rather than absorbed.** What this cache
         * holds is *regular reports* — `open-dart` `financials`/`filings` and
         * `sec-edgar` `companyfacts` — so the lead measured here is the
         * dispersion of the regular report's own lag, and a primary disclosure
         * that runs weeks ahead of it falls **before** the window opens. Closing
         * that needs a primary-disclosure document in the cache, which is host
         * work; `HOST-FOLLOWUPS.md` records it. ⛔ It is not closed with a
         * constant, which is the thing this operation exists not to do.
         */
        leadBasis: 'earliest-regular-report-lag-observed-in-this-cache',
        leadCovers: 'the regular report only; a primary disclosure ahead of the earliest cached lag opens before this window',
      },
      coverage: {
        rosterCount: rosterSymbols.length,
        derived: estimated.length,
        basisSymbols,
        uncited,
        periodUnknown: tooFewPeriods,
        cacheBehind: stale,
        outsideHorizon,
      },
      horizonDays,
      /** ⛔ The half this stage deliberately does not do — see the header. `post-event-continuation` stays fed by the corporate-actions route. */
      eventsProduced: false,
      eventProductionReason: EVENT_PRODUCTION_REASON,
      asOf,
    },
    diagnostics,
  }
}

const EVENT_PRODUCTION_REASON = 'a cadence says when a filer will probably speak and never what it said; sue, day1ExcessPct and preAnnouncementClose are reported figures about an announcement that happened, so post-event-continuation is fed by the corporate-actions route and by nothing derived here'

const rosterOf = (roster) => [...new Set(roster.map((row) => (typeof row === 'string' ? row : row?.symbol)).filter((symbol) => compactString(symbol, 32)))]
