import { diagnostic, MANAGER_ID, ALLOCATOR_FLOW, DISPATCHABLE_FLOWS } from './diagnostics.mjs'

function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function zonedDateTimeToUtc(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = desired
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = partsAt(guess, timeZone)
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
    const next = guess + (desired - represented)
    if (next === guess) return new Date(next).toISOString()
    guess = next
  }
  const final = partsAt(guess, timeZone)
  const matches = +final.year === year && +final.month === month && +final.day === day && +final.hour === hour && +final.minute === minute
  return matches ? new Date(guess).toISOString() : null
}

function addMinutes(instant, minutes) {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString()
}

/**
 * The weekdays a market review recurs on. Monday to Friday, and that is the
 * whole of what a rule may claim.
 *
 * A cron field cannot say *trading day* — the objection #356 raised against
 * cron and the one that survives into a rule that only draws — so the rule
 * says the part that is always true and the armed instant carries the part
 * that needs a calendar. Weekends are not a holiday lookup: no exchange this
 * package trades opens on one, so dropping them costs nothing and removes
 * about a hundred wrong marks a year from the investor's calendar.
 */
const TRADING_WEEKDAYS = '1-5'

/**
 * The recurrence a review nominally falls on, as `{ cron, timeZone }`.
 *
 * ⚠️ **This arms nothing.** Aumos wakes on the `at` instant beside it, which is
 * computed from the sourced session and is exact. The rule exists so the
 * investor's PLANS calendar can draw the months this manager has not judged yet
 * — a grid that is blank after the next appointment reads as a manager with
 * nothing planned — and it is drawn as a faint forecast because cron does not
 * know a holiday, a half-day or a delayed open.
 *
 * Derived from the same two numbers the exact instant used — the session's
 * local close and the investor's buffer — rather than written as a literal, so
 * a configured buffer moves the forecast and the appointment together. A buffer
 * that pushed the review past local midnight would move it onto a weekday the
 * cron fields cannot name, and rather than draw the wrong day this returns
 * null: the calendar loses a forecast and keeps the armed instant.
 */
function marketReviewRule(closeLocal, bufferMinutes, timeZone) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(closeLocal ?? '') || !timeZone) return null
  if (!Number.isFinite(bufferMinutes)) return null
  const [closeHour, closeMinute] = closeLocal.split(':').map(Number)
  const total = closeHour * 60 + closeMinute + bufferMinutes
  if (total < 0 || total >= 24 * 60) return null
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return { cron: `${minute} ${hour} * * ${TRADING_WEEKDAYS}`, timeZone }
}

/** The same, for the allocator's fixed wall-clock review. */
function globalReviewRule(time, timeZone) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time ?? '') || !timeZone) return null
  const [hour, minute] = time.split(':').map(Number)
  return { cron: `${minute} ${hour} * * ${TRADING_WEEKDAYS}`, timeZone }
}

export function nextMarketReview({ sessions = [], asOf, bufferMinutes = 30 }) {
  const diagnostics = []
  const candidates = []
  for (const [index, session] of sessions.entries()) {
    if (!session?.isOpen) continue
    const close = zonedDateTimeToUtc(session.date, session.closeLocal, session.timeZone)
    if (!close) {
      diagnostics.push(diagnostic('market_session_invalid', 'unevaluated', 'Session date, closeLocal and IANA timezone are required', `sessions[${index}]`))
      continue
    }
    const review = addMinutes(close, bufferMinutes)
    if (Date.parse(review) > Date.parse(asOf)) candidates.push({ ...session, closeUtc: close, reviewAt: review })
  }
  candidates.sort((a, b) => Date.parse(a.reviewAt) - Date.parse(b.reviewAt))
  if (!candidates.length) diagnostics.push(diagnostic('next_market_session_missing', 'unevaluated', 'No future open market session is available from the source calendar', 'sessions'))
  return { data: { next: candidates[0] ?? null }, diagnostics }
}

export function earningsCheckpoint(observation, marketSession, config = {}) {
  const diagnostics = []
  const required = ['asset', 'fiscalPeriod', 'announcedDate', 'sourceUrl', 'capturedAt', 'confidence']
  for (const key of required) if (!observation?.[key]) diagnostics.push(diagnostic('earnings_schedule_field_missing', 'blocked', `Missing earnings schedule field ${key}`, key))
  if (observation?.publishedAt && Date.parse(observation.publishedAt) > Date.parse(observation.capturedAt)) {
    diagnostics.push(diagnostic('earnings_schedule_time_invalid', 'blocked', 'publishedAt cannot be after capturedAt', 'publishedAt'))
  }
  const timeZone = observation?.sourceTimeZone ?? marketSession?.timeZone
  let base = null
  const buffer = Math.min(Math.max(config.releaseBufferMinutes ?? 30, 5), 180)
  if (observation?.announcedTime && /^\d{2}:\d{2}(:\d{2})?$/.test(observation.announcedTime)) {
    base = zonedDateTimeToUtc(observation.announcedDate, observation.announcedTime, timeZone)
  } else if (observation?.timing === 'BMO') {
    base = zonedDateTimeToUtc(observation.announcedDate, marketSession?.openLocal, marketSession?.timeZone)
    if (base) base = addMinutes(base, -(config.bmoMinutesBeforeOpen ?? 30))
  } else {
    base = zonedDateTimeToUtc(observation?.announcedDate, marketSession?.closeLocal, marketSession?.timeZone)
  }
  if (!base) diagnostics.push(diagnostic('earnings_checkpoint_unevaluated', 'blocked', 'Cannot normalize checkpoint without valid time and market session timezone', 'announcedTime'))
  const at = base ? addMinutes(base, buffer) : null
  if (at && config.asOf && Date.parse(at) <= Date.parse(config.asOf)) diagnostics.push(diagnostic('earnings_checkpoint_not_future', 'blocked', 'Earnings WATCH checkpoint must be later than invocation asOf', 'announcedDate', { at, asOf: config.asOf }))
  return {
    data: {
      at,
      kind: 'at-time',
      purpose: 'verify-earnings-release',
      timing: observation?.timing ?? (observation?.announcedTime ? 'exact' : 'unknown'),
      sourceUrl: observation?.sourceUrl ?? null,
      capturedAt: observation?.capturedAt ?? null,
      sourceTimeZone: timeZone ?? null,
    },
    diagnostics,
  }
}

export function boundedRetry({ checkpointAt, asOf, attempt = 0, announcedReplacementAt = null }, config = {}) {
  const diagnostics = []
  const maxRetries = Math.min(Math.max(config.maxRetries ?? 2, 1), 4)
  const retryMinutes = Math.min(Math.max(config.retryMinutes ?? 45, 30), 60)
  if (announcedReplacementAt && Date.parse(announcedReplacementAt) > Date.parse(asOf)) {
    return { data: { at: announcedReplacementAt, reason: 'company-announced-replacement', attempt: attempt + 1 }, diagnostics }
  }
  if (attempt >= maxRetries) {
    diagnostics.push(diagnostic('earnings_retry_exhausted', 'unevaluated', 'Bounded retry limit reached; move to next sourced checkpoint', 'attempt', { maxRetries }))
    return { data: { at: null, reason: 'retry-exhausted', attempt }, diagnostics }
  }
  if (!Number.isFinite(Date.parse(checkpointAt)) || !Number.isFinite(Date.parse(asOf))) {
    diagnostics.push(diagnostic('earnings_retry_time_invalid', 'blocked', 'checkpointAt and asOf are required', 'checkpointAt'))
    return { data: { at: null, reason: 'invalid-time', attempt }, diagnostics }
  }
  const anchor = Math.max(Date.parse(checkpointAt), Date.parse(asOf))
  return { data: { at: new Date(anchor + retryMinutes * 60_000).toISOString(), reason: 'release-not-yet-published', attempt: attempt + 1 }, diagnostics }
}

export function classifyScheduledWake({ watchId, summary, scheduledAt, asOf, consumedWatchIds = [], sourceStatus = 'available', releaseFound = false }, { lateToleranceMinutes = 5 } = {}) {
  const diagnostics = []
  if (!watchId || !Number.isFinite(Date.parse(scheduledAt)) || !Number.isFinite(Date.parse(asOf))) {
    diagnostics.push(diagnostic('scheduled_wake_invalid', 'blocked', 'watchId, scheduledAt and asOf are required', 'input'))
    return { data: null, diagnostics }
  }
  /**
   * The flow rides along, because this is the call a run already makes.
   *
   * A wake that reached the orchestrator carrying only "you are due" is what
   * made every wake run all three flows (#87). Resolving it here rather than in
   * a second operation means the run cannot ask whether it is due without also
   * being told what it was woken for.
   *
   * `watchId` stays the dedupe key and `summary` is where the flow is: the
   * first is Aumos's `eventId`, unique per firing, and the second is the
   * sentence the manager itself armed. Neither can do the other's job.
   */
  const wake = resolveWakeFlow({ summary, watchId })
  diagnostics.push(...wake.diagnostics)
  const flow = wake.data?.flow ?? null
  if (consumedWatchIds.includes(watchId)) {
    diagnostics.push(diagnostic('scheduled_wake_duplicate', 'blocked', 'A consumed WATCH cannot create a duplicate Decision', 'watchId'))
    return { data: { disposition: 'deduplicated', submitDecision: false, flow }, diagnostics }
  }
  const delayMinutes = (Date.parse(asOf) - Date.parse(scheduledAt)) / 60_000
  if (delayMinutes < 0) {
    diagnostics.push(diagnostic('scheduled_wake_early', 'blocked', 'An at-time WATCH is not due yet', 'asOf', { delayMinutes }))
    return { data: { disposition: 'not-due', submitDecision: false, delayMinutes, flow }, diagnostics }
  }
  if (delayMinutes > lateToleranceMinutes) diagnostics.push(diagnostic('scheduled_wake_late_fire', 'info', 'Wake fired after its scheduled instant', 'asOf', { delayMinutes }))
  if (sourceStatus !== 'available') diagnostics.push(diagnostic('release_source_unavailable', 'unevaluated', 'Source outage is distinct from an unpublished release', 'sourceStatus', { sourceStatus }))
  return {
    data: {
      disposition: sourceStatus !== 'available' ? 'source-degraded' : releaseFound ? 'actual-found' : 'release-missing',
      submitDecision: true,
      flow,
      delayMinutes,
      lateFire: delayMinutes > lateToleranceMinutes,
      requiresRetry: sourceStatus === 'available' && !releaseFound,
    },
    diagnostics,
  }
}

export function scheduleDrift({ previous = {}, current = {}, asOf }) {
  const diagnostics = []
  for (const [name, observation] of [['previous', previous], ['current', current]]) {
    if (!observation.at || !observation.sourceUrl || !observation.capturedAt) diagnostics.push(diagnostic('schedule_observation_incomplete', 'blocked', `${name} schedule needs at, sourceUrl and capturedAt`, name))
    if (observation.capturedAt && Date.parse(observation.capturedAt) > Date.parse(asOf)) diagnostics.push(diagnostic('schedule_observation_future', 'blocked', `${name} schedule was captured after asOf`, `${name}.capturedAt`))
  }
  const changed = Number.isFinite(Date.parse(previous.at)) && Number.isFinite(Date.parse(current.at)) && previous.at !== current.at
  return {
    data: {
      changed,
      staleWatchAt: changed ? previous.at : null,
      replacementWatchAt: changed ? current.at : null,
      preserveBothEvidence: changed,
      staleWakeDisposition: changed ? 'verify-stale-then-rearm-without-trade' : 'not-stale',
    },
    diagnostics,
  }
}

export function deduplicateObservations({ rows = [] }) {
  const diagnostics = []
  const seen = new Set()
  const retained = []
  const duplicates = []
  for (const [index, row] of rows.entries()) {
    const key = row?.vendorId ?? row?.accession ?? row?.receiptNumber ?? (row?.sourceUrl && row?.publishedAt ? `${row.sourceUrl}|${row.publishedAt}` : null)
    if (!key) {
      diagnostics.push(diagnostic('observation_dedupe_key_missing', 'unevaluated', 'Observation needs a stable vendor id, accession, receipt number or URL+publishedAt', `rows[${index}]`))
      continue
    }
    if (seen.has(key)) duplicates.push(row)
    else { seen.add(key); retained.push(row) }
  }
  return { data: { retained, duplicateCount: duplicates.length, duplicateKeys: duplicates.map((row) => row.vendorId ?? row.accession ?? row.receiptNumber ?? `${row.sourceUrl}|${row.publishedAt}`) }, diagnostics }
}

export function themeRadarDue({ lastRunAt = null, asOf, intervalDays = 3, dislocation = false }) {
  const diagnostics = []
  if (dislocation) return { data: { due: true, reason: 'dislocation-override', ageDays: lastRunAt ? (Date.parse(asOf) - Date.parse(lastRunAt)) / 86_400_000 : null }, diagnostics }
  if (!lastRunAt) return { data: { due: true, reason: 'never-run', ageDays: null }, diagnostics }
  if (!Number.isFinite(Date.parse(lastRunAt)) || Date.parse(lastRunAt) > Date.parse(asOf)) {
    diagnostics.push(diagnostic('theme_radar_memory_invalid', 'unevaluated', 'Future or malformed last-run memory is ignored', 'lastRunAt'))
    return { data: { due: true, reason: 'invalid-memory-ignored', ageDays: null }, diagnostics }
  }
  const ageDays = (Date.parse(asOf) - Date.parse(lastRunAt)) / 86_400_000
  return { data: { due: ageDays >= intervalDays, reason: ageDays >= intervalDays ? 'interval-elapsed' : 'not-due', ageDays }, diagnostics }
}

export function nextReviewSequence({ krSessions = [], usSessions = [], globalReview = {}, asOf, buffers = {}, config = {} }) {
  const diagnostics = []
  /**
   * The investor's configured buffer reaches the calculation.
   *
   * ⚠️ **It did not until #91.** `config.schema.json` declared
   * `schedule.krCloseBufferMinutes` and `usCloseBufferMinutes`, nothing passed
   * them here, and the two literals below were the only values that ever ran —
   * so a number on the install screen governed nothing, and `PROMPT.md`'s
   * "plus configured buffer" was a claim the package did not keep.
   *
   * `buffers` still overrides, which is the same shape `crossCheckPrice` has
   * for `priceConflictTolerance`: config is the investor's default, a directly
   * passed value is this call's.
   */
  const schedule = config?.schedule ?? {}
  const krBuffer = buffers.kr ?? schedule.krCloseBufferMinutes ?? 30
  const usBuffer = buffers.us ?? schedule.usCloseBufferMinutes ?? 45
  const kr = nextMarketReview({ sessions: krSessions, asOf, bufferMinutes: krBuffer })
  const us = nextMarketReview({ sessions: usSessions, asOf, bufferMinutes: usBuffer })
  diagnostics.push(...kr.diagnostics, ...us.diagnostics)
  const globalAt = globalReview.date && globalReview.time && globalReview.timeZone
    ? zonedDateTimeToUtc(globalReview.date, globalReview.time, globalReview.timeZone)
    : null
  if (!globalAt || Date.parse(globalAt) <= Date.parse(asOf)) diagnostics.push(diagnostic('global_review_invalid', 'unevaluated', 'Future Global review date/time/timezone is required', 'globalReview'))
  /**
   * `owner` used to name the three pre-2026-08-27 packages; the flow is what
   * the orchestrator actually dispatches.
   *
   * ⚠️ **And it only became that in #87.** The field was minted here and read
   * nowhere, so all three wakes arrived as an undistinguished `PORTFOLIO_REVIEW`
   * and the orchestrator ran all three flows on each of them — three times the
   * work, and each sleeve judged twice, once on a bar that had not closed yet.
   * `intent` is what carries the flow across the gap. It is the only field a
   * manager writes that survives the round trip — a plan has no id the manager
   * can choose, and the event it raises has no plan id on it — so the wake comes
   * back as an event `summary` with the intent inside, and `resolveWakeFlow`
   * reads it out.
   */
  const sequence = [
    kr.data.next && { owner: MANAGER_ID, flow: 'kr-sleeve', task: 'PORTFOLIO_REVIEW', at: kr.data.next.reviewAt, session: kr.data.next, rule: marketReviewRule(kr.data.next.closeLocal, krBuffer, kr.data.next.timeZone) },
    us.data.next && { owner: MANAGER_ID, flow: 'us-sleeve', task: 'PORTFOLIO_REVIEW', at: us.data.next.reviewAt, session: us.data.next, rule: marketReviewRule(us.data.next.closeLocal, usBuffer, us.data.next.timeZone) },
    globalAt && Date.parse(globalAt) > Date.parse(asOf) && { owner: MANAGER_ID, flow: ALLOCATOR_FLOW, task: 'PORTFOLIO_REVIEW', at: globalAt, rule: globalReviewRule(globalReview.time, globalReview.timeZone) },
  ].filter(Boolean)
    .map((row) => ({ ...row, intent: marketReviewIntent(row.flow, row.at) }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return { data: { sequence }, diagnostics }
}

/** The marker that opens a market review's `intent`. */
const MARKET_REVIEW_PREFIX = 'market-review'
const MARKET_REVIEW_MARKER = /market-review:([a-z-]+):(\S+)/

/**
 * The `intent` a market review is armed with.
 *
 * ⚠️ **The manager cannot choose an id, and this is why the flow rides in the
 * intent.** `watchProposalSchema` is `{ subject?, intent, trigger, expiresAt? }`
 * — there is no id field to write — and the `AumosEvent` a fired plan produces
 * is a strict object of `eventId`, `kind`, `subject`, `occurredAt`,
 * `detectedAt`, `summary`, `materiality`, `evidenceIds`, with no plan id on it.
 * The one thing the manager writes that survives the round trip is `intent`,
 * which the wake engine composes into the event as
 * `` `${verdict.reason} — watching for: ${intent}` ``. That composition is
 * deliberate and recent — before it, the engine's own note says, an armed plan
 * was "a **timer** rather than a note to self".
 *
 * So the marker goes first and the sentence follows it: the first half is for
 * this package, the second is for the person reading PLANS.
 *
 * The scheduled instant is in the marker so a late or stale fire is
 * distinguishable. It is **not** the dedupe key — `eventId` is, and it is
 * Aumos's, unique per firing, and needs no help from a name.
 */
export function marketReviewIntent(flow, at) {
  const sleeve = flow === ALLOCATOR_FLOW ? 'Cross-market allocation' : `${flow} review`
  return `${MARKET_REVIEW_PREFIX}:${flow}:${at} — ${sleeve} after the close it is armed against`
}

/**
 * Which flow a wake is for, read out of the event a fired plan raised.
 *
 * Pass the `plan-trigger` event's `summary`; the manager's own `intent` is
 * inside it. A bare intent works too, which is what the arming side has.
 *
 * Returns `null` data for any wake this manager did not arm — a manual run, an
 * asset review, an earnings checkpoint. That is not an error and carries no
 * diagnostic: those wakes are real and the orchestrator's answer for them is to
 * run every flow, which is what it did for everything before #87. What *is* a
 * diagnostic is a market-review marker naming a flow nothing dispatches,
 * because that is a wake nobody will answer.
 */
export function resolveWakeFlow({ summary, intent, watchId } = {}) {
  const diagnostics = []
  const text = [summary, intent, watchId].find((value) => typeof value === 'string' && value.includes(`${MARKET_REVIEW_PREFIX}:`))
  if (text === undefined) return { data: null, diagnostics }
  const match = MARKET_REVIEW_MARKER.exec(text)
  if (match === null) {
    diagnostics.push(diagnostic('wake_marker_unreadable', 'unevaluated', 'A market-review marker is present but not in the shape this package arms', 'summary', { text }))
    return { data: null, diagnostics }
  }
  const [, flow, scheduledAt] = match
  if (!DISPATCHABLE_FLOWS.includes(flow)) {
    diagnostics.push(diagnostic('wake_flow_unknown', 'blocked', 'A market-review wake names a flow this manager does not dispatch', 'summary', { flow, dispatchable: DISPATCHABLE_FLOWS }))
    return { data: null, diagnostics }
  }
  if (!Number.isFinite(Date.parse(scheduledAt))) {
    diagnostics.push(diagnostic('wake_instant_unreadable', 'unevaluated', 'A market-review wake carries no readable scheduled instant', 'summary', { flow }))
    return { data: { flow, scheduledAt: null }, diagnostics }
  }
  return { data: { flow, scheduledAt }, diagnostics }
}
